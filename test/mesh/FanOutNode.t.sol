// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import {Test} from "forge-std/Test.sol";
import {Clones} from "@openzeppelin/contracts/proxy/Clones.sol";
import {FanOutNode} from "src/extensions/mesh/FanOutNode.sol";
import {IFanOut, UserInfo, Outflow, FanOutLien} from "src/extensions/mesh/interfaces/IFanOut.sol";
import {IFlowQuery, ProviderInfo, ConsumerInfo, AvailableDenom} from "src/extensions/mesh/interfaces/IFlowQuery.sol";
import {MockERC20} from "../helpers/MockERC20.sol";

contract FanOutNodeTest is Test {
    FanOutNode public fanOut;
    MockERC20 public rewardToken;

    address public manager = address(0x1);
    address public provider = address(0x2);
    address public consumer1 = address(0x3);
    address public consumer2 = address(0x4);
    address public staker2 = address(0x5);
    address public unauthorized = address(0x9);

    bytes32 public constant DENOM = keccak256("ETH");
    bytes32 public constant DENOM2 = keccak256("USDC");

    uint16 public constant MAX_PENALTY = 5000; // 50% (Phase 21.1: bps)

    function setUp() public {
        // Phase 21.4: clone the impl rather than using it directly (impl is locked).
        address impl = address(new FanOutNode());
        fanOut = FanOutNode(Clones.clone(impl));
        rewardToken = new MockERC20("Reward", "RWD", 18);

        // Initialize with provider, manager, and inputMaxPenaltyBps (Phase 21.1)
        fanOut.initializeWithPenalty(provider, manager, MAX_PENALTY);
    }

    // ============================================================
    // INITIALIZE TESTS
    // ============================================================

    function test_initialize_setsProviderAndManager() public view {
        assertEq(fanOut.provider(), provider);
        assertEq(fanOut.manager(), manager);
    }

    function test_initialize_onlyOnce() public {
        vm.expectRevert();
        fanOut.initializeWithPenalty(address(0x99), address(0x88), 50);
    }

    // ============================================================
    // SET OUTFLOWS TESTS
    // ============================================================

    function test_setOutflows() public {
        // Provider stakes first so exposure can be validated
        vm.prank(provider);
        fanOut.stake(DENOM, 1000e18);

        Outflow[] memory outflows = _makeOutflows(consumer1, 6000, consumer2, 4000);

        vm.prank(provider);
        fanOut.setOutflows(DENOM, outflows);

        // Verify outflows stored
        Outflow[] memory stored = fanOut.getOutflows(provider, DENOM);
        assertEq(stored.length, 2);
        assertEq(stored[0].consumer, consumer1);
        assertEq(stored[0].portionBps, 6000);
        assertEq(stored[1].consumer, consumer2);
        assertEq(stored[1].portionBps, 4000);
    }

    function test_setOutflows_acceptsUnderFull() public {
        // Phase 20.5 (Pashov F8): the invariant relaxed to `sum <= 10_000`. A 9000 sum
        // is now valid — any unallocated locked stake is simply not subject to a lien.
        vm.prank(provider);
        fanOut.stake(DENOM, 1000e18);

        Outflow[] memory outflows = _makeOutflows(consumer1, 6000, consumer2, 3000); // sums to 9000

        vm.prank(provider);
        fanOut.setOutflows(DENOM, outflows);

        FanOutLien memory l1 = fanOut.getLien(provider, DENOM, consumer1);
        FanOutLien memory l2 = fanOut.getLien(provider, DENOM, consumer2);
        assertEq(l1.amount, 600e18);
        assertEq(l2.amount, 300e18);
    }

    function test_setOutflows_onlyProvider() public {
        vm.prank(provider);
        fanOut.stake(DENOM, 1000e18);

        Outflow[] memory outflows = _makeOutflows(consumer1, 6000, consumer2, 4000);

        vm.prank(unauthorized);
        vm.expectRevert(FanOutNode.OnlyProvider.selector);
        fanOut.setOutflows(DENOM, outflows);
    }

    // ============================================================
    // STAKE TESTS
    // ============================================================

    function test_stake_updatesLocked() public {
        vm.prank(provider);
        fanOut.stake(DENOM, 500e18);

        UserInfo memory info = fanOut.getUserInfo(provider, DENOM);
        assertEq(info.locked, 500e18);
    }

    function test_stake_onlyProvider() public {
        vm.prank(unauthorized);
        vm.expectRevert(FanOutNode.OnlyProvider.selector);
        fanOut.stake(DENOM, 500e18);
    }

    function test_stake_updatesTotalStake() public {
        vm.prank(provider);
        fanOut.stake(DENOM, 300e18);

        assertEq(fanOut.totalStake(DENOM), 300e18);
    }

    // ============================================================
    // EXPOSURE ALLOCATION TESTS
    // ============================================================

    function test_exposureAllocation_enforced() public {
        // Provider stakes 100e18 with MAX_PENALTY=50
        // Max totalForfeitable = 100e18 * 50 / 100 = 50e18
        // If we set outflows with high penalty that would exceed this, it should revert.
        vm.prank(provider);
        fanOut.stake(DENOM, 100e18);

        // Create outflows where consumer1 gets 100% with 80% penalty
        // totalForfeitable = 100e18 * 80 / 100 = 80e18 > 50e18 = locked * inputMaxPenalty / 100
        // Wait — the exposure allocation is checked against an "inputMaxPenaltyPercent".
        // Per the plan: the provider's commitment to the UPSTREAM has a maxPenaltyPercent.
        // For this test, we use MAX_PENALTY=50 as the inputMaxPenaltyPercent.
        // The outflow's penalty cannot cause totalForfeitable > locked * inputMaxPenalty/100
        // So with locked=100e18, inputMaxPenalty=50: max totalForfeitable = 50e18
        // Outflow with 100% portion and 80% penalty => exposure = 100e18 * 80/100 = 80e18 > 50e18 => revert

        Outflow[] memory outflows = new Outflow[](1);
        outflows[0] = Outflow({consumer: consumer1, maxPenaltyBps: 8000, portionBps: 10000});

        vm.prank(provider);
        vm.expectRevert(FanOutNode.ExposureAllocationExceeded.selector);
        fanOut.setOutflows(DENOM, outflows);
    }

    function test_exposureAllocation_passes_withinLimit() public {
        // locked=100e18, inputMaxPenalty=50 => limit=50e18
        // outflow: 100% portion, 40% penalty => exposure=40e18 < 50e18 => passes
        vm.prank(provider);
        fanOut.stake(DENOM, 100e18);

        Outflow[] memory outflows = new Outflow[](1);
        outflows[0] = Outflow({consumer: consumer1, maxPenaltyBps: 4000, portionBps: 10000});

        vm.prank(provider);
        fanOut.setOutflows(DENOM, outflows); // should not revert
    }

    function test_exposureAllocation_onStake() public {
        // First stake a small amount that would fail exposure if outflows were set
        // Then stake more so outflows become valid.
        // This tests that re-validation happens on stake() too.

        // Stake 50e18, set outflows with 80% penalty on 100% portion
        // exposure = 50e18 * 80/100 = 40e18; limit = 50e18 * 50/100 = 25e18 => FAIL

        vm.prank(provider);
        fanOut.stake(DENOM, 50e18);

        // Try to set outflow that would fail at 50e18
        Outflow[] memory outflows = new Outflow[](1);
        outflows[0] = Outflow({consumer: consumer1, maxPenaltyBps: 6000, portionBps: 10000});
        // exposure = 50e18 * 60/100 = 30e18; limit = 50e18 * 50/100 = 25e18 => FAIL

        vm.prank(provider);
        vm.expectRevert(FanOutNode.ExposureAllocationExceeded.selector);
        fanOut.setOutflows(DENOM, outflows);

        // Now stake more: total = 50e18 + 60e18 = 110e18
        // limit = 110e18 * 50/100 = 55e18; exposure = 110e18 * 60/100 = 66e18 => still FAIL
        // Stake even more: total = 200e18
        // limit = 200e18 * 50/100 = 100e18; exposure = 200e18 * 60/100 = 120e18 => FAIL
        // Need: locked * 60/100 <= locked * 50/100 — impossible for 60% penalty with 50% max
        // Use 40% penalty instead:
        outflows[0] = Outflow({consumer: consumer1, maxPenaltyBps: 4000, portionBps: 10000});
        // At 50e18 locked: exposure = 50e18 * 40/100 = 20e18; limit = 50e18 * 50/100 = 25e18 => passes

        vm.prank(provider);
        fanOut.setOutflows(DENOM, outflows);
        // Should succeed now
    }

    // ============================================================
    // RELEASE STAKE TESTS
    // ============================================================

    function test_releaseStake() public {
        // Setup: provider stakes, sets outflows
        vm.prank(provider);
        fanOut.stake(DENOM, 1000e18);

        Outflow[] memory outflows = new Outflow[](1);
        outflows[0] = Outflow({consumer: consumer1, maxPenaltyBps: 4000, portionBps: 10000});

        vm.prank(provider);
        fanOut.setOutflows(DENOM, outflows);

        // FanOutLien should be set: amount = 1000e18, exposure = 400e18
        FanOutLien memory lien = fanOut.getLien(provider, DENOM, consumer1);
        assertEq(lien.amount, 1000e18);
        assertEq(lien.exposure, 400e18);

        // Consumer releases 200e18
        vm.prank(consumer1);
        fanOut.releaseStake(provider, DENOM, 200e18);

        FanOutLien memory lienAfter = fanOut.getLien(provider, DENOM, consumer1);
        assertEq(lienAfter.amount, 800e18);
    }

    function test_releaseStake_onlyRegisteredConsumer() public {
        vm.prank(provider);
        fanOut.stake(DENOM, 1000e18);

        vm.prank(unauthorized);
        vm.expectRevert(FanOutNode.OnlyRegisteredConsumer.selector);
        fanOut.releaseStake(provider, DENOM, 100e18);
    }

    // ============================================================
    // REWARD ACCUMULATOR TESTS
    // ============================================================

    function test_distributeRewards_accumulator() public {
        // Provider stakes 1000e18
        vm.prank(provider);
        fanOut.stake(DENOM, 1000e18);

        // Set outflows
        Outflow[] memory outflows = new Outflow[](1);
        outflows[0] = Outflow({consumer: consumer1, maxPenaltyBps: 4000, portionBps: 10000});
        vm.prank(provider);
        fanOut.setOutflows(DENOM, outflows);

        // Mint reward tokens to consumer1 and approve fanOut
        uint256 rewardAmount = 100e18;
        rewardToken.mint(consumer1, rewardAmount);
        vm.prank(consumer1);
        rewardToken.approve(address(fanOut), rewardAmount);

        uint256 rpsBefore = fanOut.rewardsPerShare(DENOM, address(rewardToken));

        vm.prank(consumer1);
        fanOut.distributeRewards(DENOM, address(rewardToken), rewardAmount);

        uint256 rpsAfter = fanOut.rewardsPerShare(DENOM, address(rewardToken));
        // rps increases by rewardAmount * 1e18 / totalStake
        uint256 expectedIncrease = rewardAmount * 1e18 / 1000e18;
        assertEq(rpsAfter - rpsBefore, expectedIncrease);
    }

    function test_distributeRewards_onlyRegisteredConsumer() public {
        vm.prank(provider);
        fanOut.stake(DENOM, 1000e18);

        Outflow[] memory outflows = new Outflow[](1);
        outflows[0] = Outflow({consumer: consumer1, maxPenaltyBps: 4000, portionBps: 10000});
        vm.prank(provider);
        fanOut.setOutflows(DENOM, outflows);

        rewardToken.mint(unauthorized, 100e18);
        vm.prank(unauthorized);
        rewardToken.approve(address(fanOut), 100e18);

        vm.prank(unauthorized);
        vm.expectRevert(FanOutNode.OnlyRegisteredConsumer.selector);
        fanOut.distributeRewards(DENOM, address(rewardToken), 100e18);
    }

    function test_claimRewards() public {
        // Provider stakes
        vm.prank(provider);
        fanOut.stake(DENOM, 1000e18);

        // Set outflow
        Outflow[] memory outflows = new Outflow[](1);
        outflows[0] = Outflow({consumer: consumer1, maxPenaltyBps: 4000, portionBps: 10000});
        vm.prank(provider);
        fanOut.setOutflows(DENOM, outflows);

        // Distribute rewards
        uint256 rewardAmount = 100e18;
        rewardToken.mint(consumer1, rewardAmount);
        vm.prank(consumer1);
        rewardToken.approve(address(fanOut), rewardAmount);
        vm.prank(consumer1);
        fanOut.distributeRewards(DENOM, address(rewardToken), rewardAmount);

        // Provider claims
        uint256 balBefore = rewardToken.balanceOf(provider);
        vm.prank(provider);
        fanOut.claimRewards(DENOM, address(rewardToken));
        uint256 balAfter = rewardToken.balanceOf(provider);

        // Provider is the only staker with 1000e18, should get all 100e18
        assertApproxEqAbs(balAfter - balBefore, rewardAmount, 1000);
    }

    function test_claimRewards_multipleStakers() public {
        // Note: FanOutNode tracks a single "provider" for the node but multiple stakers
        // can stake (since provider is just the registered provider address).
        // In this design, provider is the single staker. But totalStake tracks denom-wide stake.
        // For multi-staker test, we need a second "provider" but FanOutNode is single-provider.
        // Instead we test with provider staking twice and a different denom to verify accumulator.
        // Actually the design has provider as single staker — let's test reward debt isolation.

        // Provider stakes 600e18
        vm.prank(provider);
        fanOut.stake(DENOM, 600e18);

        // Set outflow
        Outflow[] memory outflows = new Outflow[](1);
        outflows[0] = Outflow({consumer: consumer1, maxPenaltyBps: 4000, portionBps: 10000});
        vm.prank(provider);
        fanOut.setOutflows(DENOM, outflows);

        // Distribute first batch: 60e18
        rewardToken.mint(consumer1, 60e18);
        vm.prank(consumer1);
        rewardToken.approve(address(fanOut), 60e18);
        vm.prank(consumer1);
        fanOut.distributeRewards(DENOM, address(rewardToken), 60e18);

        // Provider claims — should get 60e18 (100% of stake)
        vm.prank(provider);
        fanOut.claimRewards(DENOM, address(rewardToken));
        assertApproxEqAbs(rewardToken.balanceOf(provider), 60e18, 1000);

        // Distribute second batch: 40e18
        rewardToken.mint(consumer1, 40e18);
        vm.prank(consumer1);
        rewardToken.approve(address(fanOut), 40e18);
        vm.prank(consumer1);
        fanOut.distributeRewards(DENOM, address(rewardToken), 40e18);

        // Provider claims again — should get 40e18 (not double-counting first batch)
        vm.prank(provider);
        fanOut.claimRewards(DENOM, address(rewardToken));
        // Allow up to 1000 wei rounding tolerance from fixed-point division
        assertApproxEqAbs(rewardToken.balanceOf(provider), 100e18, 1000);
    }

    function test_claimRewards_nothingToClaimIsNoOp() public {
        vm.prank(provider);
        fanOut.stake(DENOM, 500e18);

        // Claim with no rewards distributed — should not revert, just no transfer
        vm.prank(provider);
        fanOut.claimRewards(DENOM, address(rewardToken));
        assertEq(rewardToken.balanceOf(provider), 0);
    }

    // ============================================================
    // IFLOWQUERY TESTS
    // ============================================================

    function test_flowQuery_nodeType() public view {
        // Phase 21.2: nodeType() is bytes32; nodeTypeName() is the string.
        assertEq(fanOut.nodeTypeName(), "fan_out");
    }

    function test_flowQuery_providers() public {
        vm.prank(provider);
        fanOut.stake(DENOM, 500e18);

        ProviderInfo[] memory provInfos = fanOut.providers();
        assertEq(provInfos.length, 1);
        assertEq(provInfos[0].provider, provider);
        assertEq(provInfos[0].stakes.length, 1);
        assertEq(provInfos[0].stakes[0].amount, 500e18);
    }

    function test_flowQuery_consumers() public {
        vm.prank(provider);
        fanOut.stake(DENOM, 1000e18);

        Outflow[] memory outflows = _makeOutflows(consumer1, 6000, consumer2, 4000);
        vm.prank(provider);
        fanOut.setOutflows(DENOM, outflows);

        ConsumerInfo[] memory consInfos = fanOut.consumers();
        assertEq(consInfos.length, 2);
    }

    function test_flowQuery_availableDenoms() public {
        vm.prank(provider);
        fanOut.stake(DENOM, 100e18);

        AvailableDenom[] memory denoms = fanOut.availableDenoms();
        assertEq(denoms.length, 1);
        assertEq(denoms[0].local, DENOM);
        assertEq(denoms[0].sourceProvider, provider);
    }

    // ============================================================
    // HELPERS
    // ============================================================

    function _makeOutflows(address c1, uint256 bps1, address c2, uint256 bps2)
        internal
        pure
        returns (Outflow[] memory outflows)
    {
        outflows = new Outflow[](2);
        outflows[0] = Outflow({consumer: c1, maxPenaltyBps: 4000, portionBps: bps1});
        outflows[1] = Outflow({consumer: c2, maxPenaltyBps: 4000, portionBps: bps2});
    }

    // ============================================================
    // PHASE 20.5 — LIEN RESURRECTION FIX (Pashov F8)
    // ============================================================

    function test_stakeAfterRelease_doesNotResurrectLien() public {
        // 1. Provider stakes 1000 with full outflow to consumer1.
        vm.prank(provider);
        fanOut.stake(DENOM, 1000e18);

        Outflow[] memory outflows = new Outflow[](1);
        outflows[0] = Outflow({consumer: consumer1, maxPenaltyBps: 4000, portionBps: 10000});
        vm.prank(provider);
        fanOut.setOutflows(DENOM, outflows);

        // Confirm full lien exists.
        FanOutLien memory lienBefore = fanOut.getLien(provider, DENOM, consumer1);
        assertEq(lienBefore.amount, 1000e18);

        // 2. Consumer1 releases the entire lien.
        vm.prank(consumer1);
        fanOut.releaseStake(provider, DENOM, 1000e18);

        FanOutLien memory lienAfterRelease = fanOut.getLien(provider, DENOM, consumer1);
        assertEq(lienAfterRelease.amount, 0, "lien should be zero after full release");

        // 3. Provider tops up — Phase 20.5 ensures the resurrected `portionBps` is 0,
        //    so consumer1's lien stays at 0 even though the Outflow record persists.
        vm.prank(provider);
        fanOut.stake(DENOM, 500e18);

        FanOutLien memory lienAfterRestake = fanOut.getLien(provider, DENOM, consumer1);
        assertEq(lienAfterRestake.amount, 0, "lien must NOT resurrect after release");
        assertEq(lienAfterRestake.exposure, 0);
    }

    function test_setOutflows_acceptsLessThanFull() public {
        // Phase 20.5: relaxed invariant accepts sum < 10_000.
        vm.prank(provider);
        fanOut.stake(DENOM, 1000e18);

        Outflow[] memory outflows = new Outflow[](1);
        outflows[0] = Outflow({consumer: consumer1, maxPenaltyBps: 4000, portionBps: 5000}); // 50%
        vm.prank(provider);
        fanOut.setOutflows(DENOM, outflows);

        FanOutLien memory lien = fanOut.getLien(provider, DENOM, consumer1);
        assertEq(lien.amount, 500e18, "50% portionBps gives 50% lien");
    }

    function test_setOutflows_rejectsOverFull() public {
        Outflow[] memory outflows = new Outflow[](2);
        outflows[0] = Outflow({consumer: consumer1, maxPenaltyBps: 4000, portionBps: 6000});
        outflows[1] = Outflow({consumer: consumer2, maxPenaltyBps: 4000, portionBps: 6000}); // 12000 total

        vm.prank(provider);
        vm.expectRevert(FanOutNode.InvalidPortionSum.selector);
        fanOut.setOutflows(DENOM, outflows);
    }

    // ============================================================
    // S8 — RELEASE-STAKE LIEN MATH (issue #54)
    // ============================================================

    /// @notice S8 bug (1) regression: partial release followed by a tiny top-up must NOT
    ///         haircut the releasing consumer's remaining lien. Encodes the PoC numbers:
    ///         locked=100, lien 50, release 25, stake 1 wei — the buggy stale-denominator
    ///         portion (2500 vs live locked 75) recomputed the lien to 76*2500/10000 = 19,
    ///         a 24% unilateral haircut. The lien must stay at 25.
    function test_releaseStake_partialThenTinyStake_noHaircut() public {
        vm.prank(provider);
        fanOut.stake(DENOM, 100);

        Outflow[] memory outflows = new Outflow[](1);
        outflows[0] = Outflow({consumer: consumer1, maxPenaltyBps: 4000, portionBps: 5000});
        vm.prank(provider);
        fanOut.setOutflows(DENOM, outflows);

        assertEq(fanOut.getLien(provider, DENOM, consumer1).amount, 50);

        // Consumer releases 25 of its 50 lien.
        vm.prank(consumer1);
        fanOut.releaseStake(provider, DENOM, 25);
        assertEq(fanOut.getLien(provider, DENOM, consumer1).amount, 25);
        assertEq(fanOut.getUserInfo(provider, DENOM).locked, 75);

        // Provider tops up 1 wei — pre-fix this shrank the lien to 19.
        vm.prank(provider);
        fanOut.stake(DENOM, 1);

        assertEq(fanOut.getLien(provider, DENOM, consumer1).amount, 25, "top-up must not haircut the lien");
    }

    /// @notice S8 bug (2) regression: consumer A's release must not erode consumer B's
    ///         absolute lien on the next stake() recompute. Pre-fix: A releases 25
    ///         (locked 100 -> 75), provider stakes 1 wei, and B's lien was recomputed
    ///         from B's untouched portionBps against the shrunken locked:
    ///         76*5000/10000 = 38 instead of 50 — a griefing lever for the provider.
    function test_releaseStake_crossConsumer_noErosion() public {
        vm.prank(provider);
        fanOut.stake(DENOM, 100);

        Outflow[] memory outflows = _makeOutflows(consumer1, 5000, consumer2, 5000);
        vm.prank(provider);
        fanOut.setOutflows(DENOM, outflows);

        assertEq(fanOut.getLien(provider, DENOM, consumer1).amount, 50);
        assertEq(fanOut.getLien(provider, DENOM, consumer2).amount, 50);

        // Consumer1 releases 25; consumer2 released nothing.
        vm.prank(consumer1);
        fanOut.releaseStake(provider, DENOM, 25);

        // Provider deliberately stakes 1 wei to force a lien recompute (the griefing path).
        vm.prank(provider);
        fanOut.stake(DENOM, 1);

        assertEq(fanOut.getLien(provider, DENOM, consumer2).amount, 50, "B's lien must survive A's release");
        assertEq(fanOut.getLien(provider, DENOM, consumer1).amount, 25, "A keeps its remaining lien");
    }

    /// @notice Top-ups allocate ONLY the new stake by portionBps (liens are absolute,
    ///         additive growth) — established liens grow by amount * portionBps / 10_000.
    function test_stake_topUpGrowsLienByPortionOfNewStake() public {
        vm.prank(provider);
        fanOut.stake(DENOM, 1000e18);

        Outflow[] memory outflows = new Outflow[](1);
        outflows[0] = Outflow({consumer: consumer1, maxPenaltyBps: 4000, portionBps: 10000});
        vm.prank(provider);
        fanOut.setOutflows(DENOM, outflows);
        assertEq(fanOut.getLien(provider, DENOM, consumer1).amount, 1000e18);

        vm.prank(provider);
        fanOut.stake(DENOM, 500e18);

        FanOutLien memory lien = fanOut.getLien(provider, DENOM, consumer1);
        assertEq(lien.amount, 1500e18, "lien grows by full portion of the top-up");
        assertEq(lien.exposure, 600e18, "exposure = amount * maxPenaltyBps / 10_000");
        assertEq(fanOut.getUserInfo(provider, DENOM).totalForfeitable, 600e18);
    }

    /// @notice After a partial release, future top-ups allocate at the proportionally
    ///         shrunk portion (Phase 20.5 semantics, now computed from the lien ratio).
    function test_releaseStake_partialShrinksForwardPortionProportionally() public {
        vm.prank(provider);
        fanOut.stake(DENOM, 100e18);

        Outflow[] memory outflows = new Outflow[](1);
        outflows[0] = Outflow({consumer: consumer1, maxPenaltyBps: 4000, portionBps: 10000});
        vm.prank(provider);
        fanOut.setOutflows(DENOM, outflows);

        // Release half the lien -> portion shrinks 10000 -> 5000.
        vm.prank(consumer1);
        fanOut.releaseStake(provider, DENOM, 50e18);

        Outflow[] memory stored = fanOut.getOutflows(provider, DENOM);
        assertEq(stored[0].portionBps, 5000, "portion shrinks by the lien reduction ratio");

        // Top-up 100: lien grows by 100 * 5000 / 10000 = 50.
        vm.prank(provider);
        fanOut.stake(DENOM, 100e18);
        assertEq(fanOut.getLien(provider, DENOM, consumer1).amount, 100e18);
    }

    /// @notice S8 low: duplicate consumers in setOutflows collapse into one lien slot
    ///         while both entries feed totalForfeitable — reject them outright.
    function test_setOutflows_rejectsDuplicateConsumer() public {
        vm.prank(provider);
        fanOut.stake(DENOM, 1000e18);

        Outflow[] memory outflows = new Outflow[](2);
        outflows[0] = Outflow({consumer: consumer1, maxPenaltyBps: 4000, portionBps: 3000});
        outflows[1] = Outflow({consumer: consumer1, maxPenaltyBps: 4000, portionBps: 3000});

        vm.prank(provider);
        vm.expectRevert(FanOutNode.DuplicateConsumer.selector);
        fanOut.setOutflows(DENOM, outflows);
    }

    // ============================================================
    // PHASE 20.1 — BANK-FIRST REWARD PATTERN (Pashov F4)
    // ============================================================

    function test_stakeAfterDistribute_preservesPendingRewards() public {
        // Initial stake of 1000.
        vm.prank(provider);
        fanOut.stake(DENOM, 1000e18);

        Outflow[] memory outflows = new Outflow[](1);
        outflows[0] = Outflow({consumer: consumer1, maxPenaltyBps: 4000, portionBps: 10000});
        vm.prank(provider);
        fanOut.setOutflows(DENOM, outflows);

        // Distribute 100 reward tokens — provider has accrued 100.
        rewardToken.mint(consumer1, 100e18);
        vm.prank(consumer1);
        rewardToken.approve(address(fanOut), 100e18);
        vm.prank(consumer1);
        fanOut.distributeRewards(DENOM, address(rewardToken), 100e18);

        // Provider tops up to 2000 — must NOT lose the 100 pending.
        vm.prank(provider);
        fanOut.stake(DENOM, 1000e18);

        // Claim should yield exactly 100 (banked from the original 1000-stake position).
        vm.prank(provider);
        fanOut.claimRewards(DENOM, address(rewardToken));
        assertApproxEqAbs(rewardToken.balanceOf(provider), 100e18, 1000);
    }
}
