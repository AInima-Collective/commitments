// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import {Test} from "forge-std/Test.sol";
import {Clones} from "@openzeppelin/contracts/proxy/Clones.sol";
import {TokenWeighting} from "src/extensions/mesh/TokenWeighting.sol";
import {IFlowQuery, ProviderInfo, ConsumerInfo, AvailableDenom} from "src/extensions/mesh/interfaces/IFlowQuery.sol";
import {MockERC20} from "../helpers/MockERC20.sol";

contract TokenWeightingTest is Test {
    TokenWeighting public tw;
    MockERC20 public rewardToken;

    address public provider = address(0x1);
    address public governance = address(0x2);
    address public unauthorized = address(0x9);

    bytes32 public constant DENOM_WSETH = keccak256("wstETH");
    bytes32 public constant DENOM_USDC = keccak256("USDC");

    // Weights in bps: wstETH = 10000 (1.0x), USDC = 8000 (0.8x)
    uint256 public constant WEIGHT_WSETH = 10000;
    uint256 public constant WEIGHT_USDC = 8000;

    function setUp() public {
        // Phase 21.4: clone the impl (impl is locked via constructor).
        address impl = address(new TokenWeighting());
        tw = TokenWeighting(Clones.clone(impl));
        rewardToken = new MockERC20("Reward", "RWD", 18);

        // Initialize
        tw.initialize(provider, governance);

        // Phase 20.3: tests act as the rewarder. Governance is the role admin.
        bytes32 rewarderRole = tw.REWARDER_ROLE();
        vm.prank(governance);
        tw.grantRole(rewarderRole, address(this));

        // Register weights via governance
        vm.prank(governance);
        tw.updateWeight(DENOM_WSETH, WEIGHT_WSETH);

        vm.prank(governance);
        tw.updateWeight(DENOM_USDC, WEIGHT_USDC);
    }

    // ============================================================
    // INITIALIZE TESTS
    // ============================================================

    function test_initialize_onlyOnce() public {
        vm.expectRevert();
        tw.initialize(address(0x99), address(0x88));
    }

    function test_initialize_setsProviderAndGovernance() public view {
        assertEq(tw.provider(), provider);
        assertEq(tw.governance(), governance);
    }

    // ============================================================
    // STAKE TESTS
    // ============================================================

    /// @notice Staking 100 wstETH (weight=10000) should yield voting power = 100*10000/10000 = 100
    function test_stake_updatesVotingPower() public {
        uint256 stakeAmount = 100e18;

        vm.prank(provider);
        tw.stake(provider, DENOM_WSETH, stakeAmount);

        // votingPower = amount * weightBps / 10000 = 100e18 * 10000 / 10000 = 100e18
        uint256 vp = tw.getVotingPower(provider);
        assertEq(vp, 100e18, "voting power should equal stake amount when weight=10000");
    }

    /// @notice Staking multiple denoms: wstETH (weight=10000) + USDC (weight=8000)
    function test_stake_multiDenom() public {
        uint256 wstEthAmount = 100e18;
        uint256 usdcAmount = 200e6;

        vm.prank(provider);
        tw.stake(provider, DENOM_WSETH, wstEthAmount);

        vm.prank(provider);
        tw.stake(provider, DENOM_USDC, usdcAmount);

        // wstETH contribution: 100e18 * 10000 / 10000 = 100e18
        // USDC contribution:   200e6  * 8000  / 10000 = 160e6
        uint256 expectedPower = (wstEthAmount * WEIGHT_WSETH / 10000) + (usdcAmount * WEIGHT_USDC / 10000);
        uint256 vp = tw.getVotingPower(provider);
        assertEq(vp, expectedPower, "voting power should be weighted sum of all denoms");
    }

    function test_stake_onlyProvider() public {
        vm.prank(unauthorized);
        vm.expectRevert();
        tw.stake(provider, DENOM_WSETH, 100e18);
    }

    function test_stake_zeroAmountReverts() public {
        vm.prank(provider);
        vm.expectRevert();
        tw.stake(provider, DENOM_WSETH, 0);
    }

    function test_releaseStake_reducesVotingPower() public {
        vm.prank(provider);
        tw.stake(provider, DENOM_WSETH, 100e18);

        vm.prank(provider);
        tw.releaseStake(provider, DENOM_WSETH, 40e18);

        uint256 vp = tw.getVotingPower(provider);
        assertEq(vp, 60e18, "voting power should reflect reduced stake");
    }

    function test_releaseStake_insufficientReverts() public {
        vm.prank(provider);
        tw.stake(provider, DENOM_WSETH, 100e18);

        vm.prank(provider);
        vm.expectRevert();
        tw.releaseStake(provider, DENOM_WSETH, 101e18);
    }

    // ============================================================
    // WEIGHT UPDATE TESTS
    // ============================================================

    /// @notice After governance updates weight, new queries use new weight
    function test_updateWeights() public {
        vm.prank(provider);
        tw.stake(provider, DENOM_WSETH, 100e18);

        // Governance halves wstETH weight from 10000 to 5000
        vm.prank(governance);
        tw.updateWeight(DENOM_WSETH, 5000);

        // Current voting power uses current stake * current weight
        uint256 vp = tw.getVotingPower(provider);
        assertEq(vp, 50e18, "voting power should reflect new weight");
    }

    function test_updateWeights_onlyGovernance() public {
        vm.prank(unauthorized);
        vm.expectRevert();
        tw.updateWeight(DENOM_WSETH, 5000);
    }

    function test_updateWeights_zeroWeightReverts() public {
        vm.prank(governance);
        vm.expectRevert();
        tw.updateWeight(DENOM_WSETH, 0);
    }

    // ============================================================
    // HISTORICAL VOTING POWER TESTS
    // ============================================================

    /// @notice Stake at block N; query at N returns correct power; query at N-1 returns 0
    function test_historicalVotingPower() public {
        uint256 blockBefore = block.number;

        // Advance one block so we can distinguish before/after
        vm.roll(block.number + 1);
        uint256 stakeBlock = block.number;

        vm.prank(provider);
        tw.stake(provider, DENOM_WSETH, 100e18);

        // Query at stakeBlock: should return 100e18
        uint256 vpAtStake = tw.getVotingPowerAt(provider, stakeBlock);
        assertEq(vpAtStake, 100e18, "should return voting power at stake block");

        // Query at blockBefore: should return 0 (no stake yet)
        uint256 vpBefore = tw.getVotingPowerAt(provider, blockBefore);
        assertEq(vpBefore, 0, "should return 0 before stake");
    }

    function test_historicalTotalPower() public {
        uint256 blockBefore = block.number;
        vm.roll(block.number + 1);

        vm.prank(provider);
        tw.stake(provider, DENOM_WSETH, 100e18);

        assertEq(tw.getTotalPowerAt(block.number), 100e18, "total power at stake block");
        assertEq(tw.getTotalPowerAt(blockBefore), 0, "total power before stake should be 0");
    }

    // ============================================================
    // TOTAL POWER TESTS
    // ============================================================

    function test_getVotingPower_returnsCurrentTotal() public {
        vm.prank(provider);
        tw.stake(provider, DENOM_WSETH, 100e18);

        assertEq(tw.getVotingPower(provider), 100e18);
        assertEq(tw.getTotalPower(), 100e18);
    }

    function test_getTotalPower_acrossStakers() public {
        // In this contract only one provider can stake — total = provider's power
        vm.prank(provider);
        tw.stake(provider, DENOM_WSETH, 100e18);

        vm.prank(provider);
        tw.stake(provider, DENOM_USDC, 200e6);

        uint256 expectedTotal = (100e18 * WEIGHT_WSETH / 10000) + (200e6 * WEIGHT_USDC / 10000);
        assertEq(tw.getTotalPower(), expectedTotal);
    }

    // ============================================================
    // IFLOWQUERY TESTS
    // ============================================================

    function test_flowQuery_nodeType() public view {
        assertEq(tw.nodeTypeName(), "token_weighting");
    }

    function test_flowQuery_providers() public {
        // The provider credits stakers other than itself (as OperatorRegistry does), so the
        // reported amount must be the denom's total, not the provider's own stake.
        vm.startPrank(provider);
        tw.stake(makeAddr("stakerA"), DENOM_WSETH, 100e18);
        tw.stake(makeAddr("stakerB"), DENOM_WSETH, 50e18);
        vm.stopPrank();

        ProviderInfo[] memory pInfo = tw.providers();
        assertEq(pInfo.length, 1, "should have one provider");
        assertEq(pInfo[0].provider, provider);
        assertGt(pInfo[0].stakes.length, 0, "should have stake info");
        bool found;
        for (uint256 i; i < pInfo[0].stakes.length; ++i) {
            if (pInfo[0].stakes[i].denom != DENOM_WSETH) continue;
            assertEq(pInfo[0].stakes[i].amount, 150e18, "amount is the denom's total stake");
            found = true;
        }
        assertTrue(found, "wstETH denom reported");
    }

    /// @notice Sink node — no downstream consumers
    function test_flowQuery_consumers() public view {
        ConsumerInfo[] memory cInfo = tw.consumers();
        assertEq(cInfo.length, 0, "sink node should have no consumers");
    }

    function test_flowQuery_availableDenoms() public view {
        AvailableDenom[] memory denoms = tw.availableDenoms();
        // Two denoms registered via updateWeight in setUp
        assertEq(denoms.length, 2, "should return two registered denoms");
    }

    // ============================================================
    // REWARD ACCUMULATOR TESTS
    // ============================================================

    function test_distributeRewards_accumulator() public {
        vm.prank(provider);
        tw.stake(provider, DENOM_WSETH, 1000e18);

        // Distribute 100 reward tokens
        rewardToken.mint(address(this), 100e18);
        rewardToken.approve(address(tw), 100e18);

        tw.distributeRewards(DENOM_WSETH, address(rewardToken), 100e18);

        // rewardsPerShare = 100e18 * 1e18 / 1000e18 = 1e17
        assertEq(tw.rewardsPerShare(DENOM_WSETH, address(rewardToken)), 1e17);
    }

    function test_claimRewards() public {
        vm.prank(provider);
        tw.stake(provider, DENOM_WSETH, 1000e18);

        // Distribute 100 reward tokens
        rewardToken.mint(address(this), 100e18);
        rewardToken.approve(address(tw), 100e18);
        tw.distributeRewards(DENOM_WSETH, address(rewardToken), 100e18);

        // Provider claims
        vm.prank(provider);
        tw.claimRewards(DENOM_WSETH, address(rewardToken));

        // Provider is the only staker, should receive full 100e18
        assertEq(rewardToken.balanceOf(provider), 100e18);
    }

    function test_claimRewards_noDuplicateClaim() public {
        vm.prank(provider);
        tw.stake(provider, DENOM_WSETH, 1000e18);

        rewardToken.mint(address(this), 100e18);
        rewardToken.approve(address(tw), 100e18);
        tw.distributeRewards(DENOM_WSETH, address(rewardToken), 100e18);

        vm.prank(provider);
        tw.claimRewards(DENOM_WSETH, address(rewardToken));

        // Second claim should yield 0
        uint256 balBefore = rewardToken.balanceOf(provider);
        vm.prank(provider);
        tw.claimRewards(DENOM_WSETH, address(rewardToken));
        uint256 balAfter = rewardToken.balanceOf(provider);

        assertEq(balBefore, balAfter, "second claim should yield nothing");
    }

    function test_distributeRewards_zeroAmountReverts() public {
        vm.prank(provider);
        tw.stake(provider, DENOM_WSETH, 1000e18);

        vm.expectRevert();
        tw.distributeRewards(DENOM_WSETH, address(rewardToken), 0);
    }

    function test_distributeRewards_zeroStakeReverts() public {
        rewardToken.mint(address(this), 100e18);
        rewardToken.approve(address(tw), 100e18);

        vm.expectRevert();
        tw.distributeRewards(DENOM_WSETH, address(rewardToken), 100e18);
    }

    // ============================================================
    // PHASE 20.1 — BANK-FIRST REWARD PATTERN (Pashov F2/F3)
    // ============================================================

    function test_stakeAfterDistribute_preservesPendingRewards() public {
        // 1. Provider stakes 1000.
        vm.prank(provider);
        tw.stake(provider, DENOM_WSETH, 1000e18);

        // 2. 100 reward tokens distributed → provider's rewards = 100.
        rewardToken.mint(address(this), 100e18);
        rewardToken.approve(address(tw), 100e18);
        tw.distributeRewards(DENOM_WSETH, address(rewardToken), 100e18);

        // 3. Provider tops up to 2000 — must NOT lose the 100 pending.
        vm.prank(provider);
        tw.stake(provider, DENOM_WSETH, 1000e18);

        // 4. Claim should yield exactly 100 (banked from before the top-up).
        vm.prank(provider);
        tw.claimRewards(DENOM_WSETH, address(rewardToken));
        assertEq(rewardToken.balanceOf(provider), 100e18, "pre-top-up rewards must be preserved");
    }

    function test_partialReleaseAfterDistribute_preservesPendingOnFullPosition() public {
        vm.prank(provider);
        tw.stake(provider, DENOM_WSETH, 1000e18);

        rewardToken.mint(address(this), 100e18);
        rewardToken.approve(address(tw), 100e18);
        tw.distributeRewards(DENOM_WSETH, address(rewardToken), 100e18);

        // Release half — pending must be banked on the full pre-release stake (= 100).
        vm.prank(provider);
        tw.releaseStake(provider, DENOM_WSETH, 500e18);

        vm.prank(provider);
        tw.claimRewards(DENOM_WSETH, address(rewardToken));
        assertEq(rewardToken.balanceOf(provider), 100e18, "rewards before release must be preserved");
    }

    function test_freshStakerCannotClaimPriorRewards() public {
        // Existing staker accrues rewards.
        vm.prank(provider);
        tw.stake(provider, DENOM_WSETH, 1000e18);
        rewardToken.mint(address(this), 100e18);
        rewardToken.approve(address(tw), 100e18);
        tw.distributeRewards(DENOM_WSETH, address(rewardToken), 100e18);

        // A fresh staker arrives.
        address newcomer = address(0x1234);
        vm.prank(provider);
        tw.stake(newcomer, DENOM_WSETH, 500e18);

        // The newcomer must NOT be able to retroactively claim from the prior distribution.
        vm.prank(newcomer);
        tw.claimRewards(DENOM_WSETH, address(rewardToken));
        assertEq(rewardToken.balanceOf(newcomer), 0, "fresh staker gets 0 from prior distribution");
    }

    // ============================================================
    // PHASE 20.3 — REWARDER_ROLE + MAX_REWARD_TOKENS (Pashov F7)
    // ============================================================

    function test_distributeRewards_unauthorizedReverts() public {
        vm.prank(provider);
        tw.stake(provider, DENOM_WSETH, 1000e18);

        rewardToken.mint(unauthorized, 100e18);
        vm.prank(unauthorized);
        rewardToken.approve(address(tw), 100e18);

        vm.prank(unauthorized);
        vm.expectRevert();
        tw.distributeRewards(DENOM_WSETH, address(rewardToken), 100e18);
    }
}
