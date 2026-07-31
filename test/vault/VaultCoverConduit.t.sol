// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import "forge-std/Test.sol";
import {ERC1967Proxy} from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import {CommitmentManager} from "src/core/manager/CommitmentManager.sol";
import {ICommitmentManager as ICM} from "src/core/interfaces/ICommitmentManager.sol";
import {StrategyBinding} from "src/core/interfaces/IDistributionStrategy.sol";
import {CommitmentsVault} from "src/periphery/vaults/CommitmentsVault.sol";
import {VaultCoverConduit} from "src/periphery/vaults/VaultCoverConduit.sol";
import {PremiumScheduler} from "src/extensions/mutuals/PremiumScheduler.sol";
import {LinkedMutualPolicy} from "src/extensions/mutuals/LinkedMutualPolicy.sol";
import {OptimisticMutualArbiter} from "src/extensions/mutuals/OptimisticMutualArbiter.sol";
import {MockERC20} from "../helpers/MockERC20.sol";

/// @title VaultCoverConduitTest
/// @notice Unit surface of the keyless ambient-cover funder: underlying→shares→fundStandby happy
///         path, the budget→duration inversion bounds (per-poke cap, live-stream clamp making
///         `PremiumRateDecreased` unreachable, core floor), skip-don't-revert behaviour on every
///         economic edge (dust, no budget, no underwriters), residual reuse across pokes, and the
///         numeraire-mismatch constructor guard.
contract VaultCoverConduitTest is Test {
    CommitmentManager internal manager;
    CommitmentsVault internal vault;
    VaultCoverConduit internal conduit;
    PremiumScheduler internal scheduler;
    LinkedMutualPolicy internal policy;
    OptimisticMutualArbiter internal arbiter;
    MockERC20 internal dai;

    address internal admin = makeAddr("admin");
    address internal committee = makeAddr("committee");
    address internal treasury = makeAddr("treasury");
    address internal pricingOwner = makeAddr("pricingOwner");
    address internal beneficiary = makeAddr("beneficiary");
    address internal skimmer = makeAddr("skimmer"); // stands in for the PremiumSkimStrategy
    address internal adapter = makeAddr("adapter"); // unused in homogeneous joins
    address internal u1 = makeAddr("u1");
    address internal u2 = makeAddr("u2");

    uint64 internal constant MUTUAL_WINDOW = 2 days;
    uint64 internal constant MAX_POKE_STREAM = 30 days;
    uint64 internal constant YEAR = 365 days;
    uint256 internal constant MIN_FUND = 1e18;

    uint256 internal mutualId;

    function setUp() public {
        CommitmentManager impl = new CommitmentManager();
        manager = CommitmentManager(
            address(
                new ERC1967Proxy(address(impl), abi.encodeCall(CommitmentManager.initialize, (admin, 7 days, 14 days)))
            )
        );
        dai = new MockERC20("Dai Stablecoin", "DAI", 18);
        CommitmentsVault vaultImpl = new CommitmentsVault();
        vault = CommitmentsVault(
            address(
                new ERC1967Proxy(
                    address(vaultImpl),
                    abi.encodeCall(
                        CommitmentsVault.initialize, (IERC20(address(dai)), "Agent Vault", "cvaDAI", admin, address(0))
                    )
                )
            )
        );

        scheduler = new PremiumScheduler(address(manager), pricingOwner);
        policy = new LinkedMutualPolicy(address(manager), address(scheduler));
        arbiter = new OptimisticMutualArbiter(address(manager), address(dai), 100e18, treasury, committee);

        vm.startPrank(pricingOwner);
        scheduler.setPolicy(address(policy));
        scheduler.setDefaultCurve(0.02e18, 0.1e18, 0.5e18, 0.8e18, 50_000);
        vm.stopPrank();
        vm.prank(committee);
        arbiter.setCoverPolicy(address(policy));

        mutualId = _mutual(address(vault));
        _join(mutualId, u1, 100e18);
        _join(mutualId, u2, 100e18);

        conduit = new VaultCoverConduit(address(vault), address(policy), mutualId, MAX_POKE_STREAM, MIN_FUND);
    }

    // ---------------------------------------------------------------------
    // Helpers
    // ---------------------------------------------------------------------

    function _mutual(address numeraire) internal returns (uint256 gid) {
        ICM.MutualParams memory p = ICM.MutualParams({
            arbiter: address(arbiter),
            numeraire: numeraire,
            beneficiary: beneficiary,
            valuationAuthority: address(0),
            challengeWindow: MUTUAL_WINDOW,
            deallocationWindow: MUTUAL_WINDOW
        });
        gid = manager.createMutual(p);
        vm.prank(committee);
        arbiter.activate(gid);
    }

    /// @dev Underwriter path: DAI → vault shares → manager free balance → mutual membership.
    function _join(uint256 gid, address who, uint256 daiAmount) internal returns (uint256 cid) {
        dai.mint(who, daiAmount);
        vm.startPrank(who);
        dai.approve(address(vault), daiAmount);
        uint256 shares = vault.deposit(daiAmount, who);
        vault.approve(address(manager), shares);
        manager.deposit(address(vault), shares);
        ICM.CommitmentParams memory p;
        p.arbiter = address(arbiter);
        p.counterparty = beneficiary;
        p.token = address(vault);
        p.adapter = adapter;
        p.amount = shares;
        p.maxPenaltyBps = 10_000;
        p.challengeWindow = 1 days;
        p.strategies = new StrategyBinding[](0);
        cid = manager.joinMutual(gid, p, 0, "");
        vm.stopPrank();
    }

    function _premiumState() internal view returns (uint128 rate, uint64 finish, uint256 pool) {
        (,,, rate,, finish,,, pool) = manager.getMutualPremiumState(mutualId);
    }

    /// @dev Simulate the skim strategy routing the premium share here.
    function _fundConduit(uint256 assets) internal {
        dai.mint(address(conduit), assets);
    }

    // ---------------------------------------------------------------------
    // Constructor
    // ---------------------------------------------------------------------

    function test_constructor_rejectsNumeraireMismatch() public {
        uint256 wrongMutual = _mutual(address(dai)); // numeraire is the raw asset, not the vault
        vm.expectRevert(
            abi.encodeWithSelector(VaultCoverConduit.NumeraireMismatch.selector, address(dai), address(vault))
        );
        new VaultCoverConduit(address(vault), address(policy), wrongMutual, MAX_POKE_STREAM, MIN_FUND);
    }

    function test_constructor_rejectsSubFloorDurationCap() public {
        vm.expectRevert(VaultCoverConduit.DurationBelowStreamFloor.selector);
        new VaultCoverConduit(address(vault), address(policy), mutualId, 59 seconds, MIN_FUND);
    }

    // ---------------------------------------------------------------------
    // Skip-don't-revert edges
    // ---------------------------------------------------------------------

    function test_poke_emptyIsNoOp() public {
        (uint256 premium, uint64 duration) = conduit.poke();
        assertEq(premium, 0);
        assertEq(duration, 0);
    }

    function test_poke_dustBelowMinFundAccumulates() public {
        _fundConduit(MIN_FUND - 1);
        (uint256 premium, uint64 duration) = conduit.poke();
        assertEq(premium, 0);
        assertEq(duration, 0);
        assertEq(dai.balanceOf(address(conduit)), MIN_FUND - 1); // untouched, waits for more
        assertEq(vault.balanceOf(address(conduit)), 0);
    }

    function test_poke_noUnderwriters_depositsButAccumulatesShares() public {
        // Fresh vault+mutual with zero members: activeCover == 0.
        CommitmentsVault vault2 = CommitmentsVault(
            address(
                new ERC1967Proxy(
                    address(new CommitmentsVault()),
                    abi.encodeCall(
                        CommitmentsVault.initialize, (IERC20(address(dai)), "V2", "cvDAI2", admin, address(0))
                    )
                )
            )
        );
        uint256 gid2 = _mutual(address(vault2));
        VaultCoverConduit conduit2 =
            new VaultCoverConduit(address(vault2), address(policy), gid2, MAX_POKE_STREAM, MIN_FUND);

        dai.mint(address(conduit2), 10e18);
        (uint256 premium, uint64 duration) = conduit2.poke();
        assertEq(premium, 0);
        assertEq(duration, 0);
        // The deposit leg still ran: budget waits as shares; members joining later get the backlog.
        assertGt(vault2.balanceOf(address(conduit2)), 0);
        (uint128 rate,,) = _premiumState();
        assertEq(rate, 0);
    }

    // ---------------------------------------------------------------------
    // Happy path + funding math
    // ---------------------------------------------------------------------

    function test_poke_fundsStandbyStream() public {
        _fundConduit(10e18);
        uint256 budgetShares = vault.previewDeposit(10e18);

        (uint256 premium, uint64 duration) = conduit.poke();
        assertGt(premium, 0);
        assertGt(duration, 0);
        assertLe(premium, budgetShares); // floor rounding keeps premium ≤ budget

        (uint128 rate, uint64 finish, uint256 pool) = _premiumState();
        assertGt(rate, 0);
        assertEq(finish, uint64(block.timestamp) + duration);
        assertEq(pool, premium);

        // Residual shares stay for the next poke.
        assertEq(vault.balanceOf(address(conduit)), budgetShares - premium);
        assertEq(dai.balanceOf(address(conduit)), 0);
    }

    function test_poke_durationCappedByMaxStream() public {
        _fundConduit(1_000e18); // huge budget: uncapped inversion would exceed the per-poke cap
        (, uint64 duration) = conduit.poke();
        assertEq(duration, MAX_POKE_STREAM);
    }

    function test_poke_liveStreamTopUp_neverDecreasesRate() public {
        _fundConduit(1_000e18);
        conduit.poke();
        (uint128 rate1, uint64 finish1,) = _premiumState();

        // Immediately top up a tiny amount on the hot stream — the classic rate-collapse shape.
        vm.warp(block.timestamp + 1 hours);
        _fundConduit(2e18);
        (uint256 premium2, uint64 duration2) = conduit.poke();
        assertGt(premium2, 0);
        assertLe(duration2, finish1 - uint64(block.timestamp)); // clamped to the remaining window

        (uint128 rate2, uint64 finish2,) = _premiumState();
        assertGe(rate2, rate1); // PremiumRateDecreased is unreachable by construction
        assertEq(finish2, uint64(block.timestamp) + duration2);
    }

    function test_poke_residualSharesFundNextStream() public {
        _fundConduit(1_000e18);
        conduit.poke(); // capped at MAX_POKE_STREAM: leaves share residue
        uint256 residue = vault.balanceOf(address(conduit));
        assertGt(residue, 0);

        (, uint64 finish,) = _premiumState();
        vm.warp(uint256(finish) + 1); // stream over
        (uint256 premium2, uint64 duration2) = conduit.poke(); // no new DAI — residue alone funds
        assertGt(premium2, 0);
        assertGt(duration2, 0);
        assertLt(vault.balanceOf(address(conduit)), residue);
    }

    function test_previewPoke_matchesPoke() public {
        _fundConduit(10e18);
        (uint256 assetsPending, uint256 shareBudget, uint64 prevDuration, uint256 prevPremium) = conduit.previewPoke();
        assertEq(assetsPending, 10e18);
        assertEq(shareBudget, vault.previewDeposit(10e18));

        (uint256 premium, uint64 duration) = conduit.poke();
        assertEq(duration, prevDuration);
        assertEq(premium, prevPremium);
    }

    function test_poke_emitsPremiumFunded() public {
        _fundConduit(10e18);
        (,, uint64 expectedDuration, uint256 expectedPremium) = conduit.previewPoke();
        vm.expectEmit(true, true, true, true);
        emit VaultCoverConduit.PremiumFunded(mutualId, expectedPremium, expectedDuration);
        conduit.poke();
    }

    // ---------------------------------------------------------------------
    // Premium actually reaches the underwriters
    // ---------------------------------------------------------------------

    function test_fundedStream_accruesToMembers() public {
        _fundConduit(10e18);
        (, uint64 duration) = conduit.poke();
        vm.warp(block.timestamp + duration); // stream fully elapsed

        // Membership ids are the two join commitments from setUp (1 and 2).
        uint256 pending1 = manager.pendingMemberPremium(1);
        uint256 pending2 = manager.pendingMemberPremium(2);
        assertGt(pending1, 0);
        assertEq(pending1, pending2); // equal stakes ⇒ equal accrual

        uint256 before = manager.freeBalance(address(vault), u1);
        manager.claimMemberPremium(1);
        assertEq(manager.freeBalance(address(vault), u1) - before, pending1);
    }
}
