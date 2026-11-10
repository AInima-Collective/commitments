// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import "forge-std/Test.sol";
import {ERC1967Proxy} from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";

import {CommitmentManager} from "src/core/manager/CommitmentManager.sol";
import {ICommitmentManager as ICM} from "src/core/interfaces/ICommitmentManager.sol";
import {StrategyBinding, DistributeContext} from "src/core/interfaces/IDistributionStrategy.sol";
import {IBackingAdapter} from "src/core/interfaces/IBackingAdapter.sol";
import {IndexAppreciationYield} from "src/distributions/IndexAppreciationYield.sol";
import {MockERC20} from "../helpers/MockERC20.sol";
import {StrategyBase} from "src/distributions/StrategyBase.sol";

/// @dev Settable index adapter — models an appreciating venue without a full 4626 mock.
contract MockIndexAdapter is IBackingAdapter {
    uint256 public index = 1e18;

    function setIndex(uint256 v) external {
        index = v;
    }

    function indexNow(address) external view returns (uint256) {
        return index;
    }

    function payoutDenomination(address token) external pure returns (address) {
        return token;
    }
}

contract IndexAppreciationYieldTest is Test {
    CommitmentManager internal manager;
    MockERC20 internal token;
    MockIndexAdapter internal adapter;
    IndexAppreciationYield internal strategy;

    address internal admin = makeAddr("admin");
    address internal alice = makeAddr("alice"); // committer
    address internal arbiter = makeAddr("arbiter");
    address internal bob = makeAddr("bob"); // counterparty

    uint256 internal id;
    uint64 internal constant WINDOW = 1 days;

    function setUp() public {
        CommitmentManager impl = new CommitmentManager();
        manager = CommitmentManager(
            address(
                new ERC1967Proxy(address(impl), abi.encodeCall(CommitmentManager.initialize, (admin, 7 days, 14 days)))
            )
        );
        token = new MockERC20("mUSDC", "mUSDC", 18);
        adapter = new MockIndexAdapter();
        strategy = new IndexAppreciationYield(address(manager));

        token.mint(alice, 1_000e18);
        vm.startPrank(alice);
        token.approve(address(manager), type(uint256).max);
        manager.deposit(address(token), 1_000e18);
        vm.stopPrank();

        // The spec's worked-example shape: 500 units @ 50% max penalty, 10% yield share.
        id = _create(500e18, 5000, 1000);
    }

    function _create(uint256 amount, uint16 maxPenaltyBps, uint16 yieldShareBps) internal returns (uint256) {
        ICM.CommitmentParams memory p;
        p.arbiter = arbiter;
        p.counterparty = bob;
        p.token = address(token);
        p.adapter = address(adapter);
        p.amount = amount;
        p.maxPenaltyBps = maxPenaltyBps;
        p.challengeWindow = WINDOW;
        p.strategies = new StrategyBinding[](1);
        p.strategies[0] = StrategyBinding(address(strategy), abi.encode(yieldShareBps));
        vm.prank(alice);
        return manager.createCommitment(p);
    }

    // The spec's exact number: 500e18 × 0.04 × 10% = 2e18 underlying → 2e18 × 1e18 / 1.04e18.
    uint256 internal constant SPEC_COMMISSION = uint256(2e18) * 1e18 / 1.04e18;

    function test_onCreated_storesBaselineAndShare() public view {
        (uint256 lastIndex, uint16 bps, uint256 owed) = strategy.positionOf(id);
        assertEq(lastIndex, 1e18);
        assertEq(bps, 1000);
        assertEq(owed, 0);
    }

    function test_onCreated_rejectsExcessBps_abortsCreation() public {
        ICM.CommitmentParams memory p;
        p.arbiter = arbiter;
        p.counterparty = bob;
        p.token = address(token);
        p.adapter = address(adapter);
        p.amount = 1e18;
        p.maxPenaltyBps = 0;
        p.challengeWindow = WINDOW;
        p.strategies = new StrategyBinding[](1);
        p.strategies[0] = StrategyBinding(address(strategy), abi.encode(uint16(10_001)));
        vm.prank(alice);
        vm.expectRevert(IndexAppreciationYield.YieldBpsExceedsMax.selector);
        manager.createCommitment(p);
    }

    function test_hooks_managerOnly() public {
        DistributeContext memory ctx;
        vm.expectRevert(StrategyBase.OnlyManager.selector);
        strategy.distribute(ctx);
    }

    function test_distribute_specWorkedExampleNumbers() public {
        adapter.setIndex(1.04e18);
        manager.distribute(id, address(strategy));

        assertEq(SPEC_COMMISSION, 1.923076923076923076e18, "sanity: the spec's 1.923e18");
        assertEq(manager.escrowOf(address(token), address(strategy)), SPEC_COMMISSION);
        (,, uint256 owed) = strategy.positionOf(id);
        assertEq(owed, SPEC_COMMISSION);
        assertEq(manager.getCommitment(id).amount, 500e18 - SPEC_COMMISSION);
        assertEq(manager.encumberedBalance(address(token), alice), 500e18 - SPEC_COMMISSION);

        // Baseline advanced: immediate re-distribute is a no-op.
        manager.distribute(id, address(strategy));
        assertEq(manager.escrowOf(address(token), address(strategy)), SPEC_COMMISSION, "no double accrual");
    }

    function test_distribute_flatOrFallingIndex_noop() public {
        manager.distribute(id, address(strategy));
        assertEq(manager.escrowOf(address(token), address(strategy)), 0);

        adapter.setIndex(0.9e18);
        manager.distribute(id, address(strategy));
        assertEq(manager.escrowOf(address(token), address(strategy)), 0, "falling index accrues nothing");
    }

    function test_claim_counterpartyReceivesTokens() public {
        adapter.setIndex(1.04e18);
        manager.distribute(id, address(strategy));

        vm.expectEmit(true, true, true, true);
        emit ICM.DistributionPaid(address(strategy), bob, address(token), SPEC_COMMISSION, id, bytes32(0));
        vm.prank(bob);
        manager.claim(id, address(strategy), "");

        assertEq(token.balanceOf(bob), SPEC_COMMISSION, "raw-token payout");
        (,, uint256 owed) = strategy.positionOf(id);
        assertEq(owed, 0);

        vm.prank(bob);
        vm.expectRevert(StrategyBase.NothingToClaim.selector);
        manager.claim(id, address(strategy), "");
    }

    function test_claim_strangerRejected() public {
        adapter.setIndex(1.04e18);
        manager.distribute(id, address(strategy));
        vm.prank(makeAddr("mallory"));
        vm.expectRevert(StrategyBase.NotAuthorized.selector);
        manager.claim(id, address(strategy), "");
    }

    function test_release_takesFinalSweep() public {
        adapter.setIndex(1.04e18);
        vm.prank(arbiter);
        manager.releaseCommitment(id);

        // The release hook swept the full accrual; the rest went back to alice's free balance.
        assertEq(manager.escrowOf(address(token), address(strategy)), SPEC_COMMISSION);
        assertEq(manager.freeBalance(address(token), alice), 1_000e18 - SPEC_COMMISSION);
        assertEq(manager.getUserExposure(address(token), alice).totalEncumbered, 0);

        // Bob's claim survives the close.
        vm.prank(bob);
        manager.claim(id, address(strategy), "");
        assertEq(token.balanceOf(bob), SPEC_COMMISSION);
    }

    function test_forfeit_priorAccrualSurvives_finalSweepCapped() public {
        adapter.setIndex(1.04e18);
        manager.distribute(id, address(strategy)); // owed ≈ 1.923

        vm.prank(arbiter);
        manager.initiateForfeit(id, 5000);
        vm.warp(block.timestamp + WINDOW);
        adapter.setIndex(1.08e18); // more appreciation during the window
        manager.executeForfeit(id);

        // Forfeit payout intact, prior accrual intact, plus a capped final sweep.
        uint256 owedAfter;
        (,, owedAfter) = strategy.positionOf(id);
        assertGe(owedAfter, SPEC_COMMISSION, "prior accrual never forfeited");
        uint256 forfeited = manager.freeBalance(address(token), bob);
        ICM.Commitment memory c = manager.getCommitment(id);
        assertTrue(c.forfeited);
        // Counterparty total (forfeit + premium) bounded by the pre-forfeit amount.
        assertLe(forfeited + owedAfter, 500e18, "taxonomy cap: forfeit + premium <= pre-forfeit amount");

        vm.prank(bob);
        manager.claim(id, address(strategy), "");
        assertEq(token.balanceOf(bob), owedAfter);
    }

    function test_reclaim_committerAfterWindow() public {
        adapter.setIndex(1.04e18);
        vm.prank(arbiter);
        manager.releaseCommitment(id); // final sweep escrows the accrual; bob never claims

        // Too early.
        vm.prank(alice);
        vm.expectRevert(IndexAppreciationYield.ReclaimWindowActive.selector);
        manager.claim(id, address(strategy), abi.encode(true));

        vm.warp(block.timestamp + 90 days);
        vm.prank(alice);
        manager.claim(id, address(strategy), abi.encode(true));

        // Reclaim credits the committer's FREE BALANCE (ledger), not a raw transfer.
        assertEq(manager.freeBalance(address(token), alice), 1_000e18);
        (,, uint256 owed) = strategy.positionOf(id);
        assertEq(owed, 0);
    }

    function test_reclaim_onlyCommitter() public {
        adapter.setIndex(1.04e18);
        vm.prank(arbiter);
        manager.releaseCommitment(id);
        vm.warp(block.timestamp + 90 days);
        vm.prank(bob);
        vm.expectRevert(StrategyBase.NotAuthorized.selector);
        manager.claim(id, address(strategy), abi.encode(true));
    }

    function test_pending_includesLiveAccrual() public {
        adapter.setIndex(1.04e18);
        assertEq(manager.pending(id, address(strategy), ""), SPEC_COMMISSION, "live accrual previewed");
        manager.distribute(id, address(strategy));
        assertEq(manager.pending(id, address(strategy), ""), SPEC_COMMISSION, "now owed instead of live");
    }

    // ---------------------------------------------------------------------
    // S10 regression: zero-rounded accrual must not ratchet lastIndex.
    // ---------------------------------------------------------------------

    /// @dev A per-call delta that floors to 0 units must leave the baseline untouched, so the
    ///      full delta is credited once it accumulates to a whole unit. Pre-fix, lastIndex
    ///      ratcheted on the no-op call and the counterparty's accrual was silently dropped.
    function test_distribute_zeroRoundedAccrual_doesNotAdvanceBaseline() public {
        // Tiny 6-decimal-scale position: encumbered = 1e6, 50% share → per-1e12-index-delta
        // counterpartyYield = 1e6 × 5000 × 1e12 / 1e22 = 0.5 → floors to 0.
        uint256 smallId = _create(1e6, 5000, 5000);

        adapter.setIndex(1e18 + 1e12);
        manager.distribute(smallId, address(strategy));
        (uint256 lastIndex,, uint256 owed) = strategy.positionOf(smallId);
        assertEq(owed, 0, "sub-unit accrual banks nothing");
        assertEq(lastIndex, 1e18, "zero-rounded accrual must not ratchet the baseline");

        // Once the cumulative delta is worth a whole unit, the FULL delta since creation
        // accrues: 1e6 × 5000 × 4e12 / 1e22 = 2 underlying → 1 unit at nowIndex.
        adapter.setIndex(1e18 + 4e12);
        manager.distribute(smallId, address(strategy));
        (lastIndex,, owed) = strategy.positionOf(smallId);
        assertEq(owed, 1, "cumulative delta credited in full");
        // Baseline advances only by the delta the banked unit consumed (ceil-rounded):
        // 1 unit × 1e4 × nowIndex / (1e6 × 5000) = (1e18 + 4e12) / 5e5.
        assertEq(lastIndex, 1e18 + 2_000_008_000_000, "baseline advances only by the banked delta");
        assertLe(lastIndex, 1e18 + 4e12, "baseline never overshoots nowIndex");
    }

    /// @dev The finding's grinding attack: the committer calls the permissionless distribute
    ///      every block so each per-call accrual floors to 0. The counterparty must end up
    ///      with (approximately) the same yield as a single end-of-period distribute.
    function test_distribute_grinding_matchesSingleEndOfPeriodDistribute() public {
        uint256 groundId = _create(1e6, 5000, 5000); // per-block distribute (the attack)
        uint256 controlId = _create(1e6, 5000, 5000); // single distribute at period end

        // 100 per-block index steps of 1e12 each — every step's own accrual floors to 0.
        for (uint256 i = 1; i <= 100; i++) {
            adapter.setIndex(1e18 + i * 1e12);
            manager.distribute(groundId, address(strategy));
        }
        manager.distribute(controlId, address(strategy));

        (,, uint256 owedGround) = strategy.positionOf(groundId);
        (,, uint256 owedControl) = strategy.positionOf(controlId);
        assertGt(owedGround, 0, "grinding must not zero the counterparty's premium");
        // Total delta 1e14 → 50 underlying → 49 units at the final index; grinding may lag by
        // at most the sub-unit remainder still pending on the baseline.
        assertEq(owedControl, 49, "sanity: single-shot accrual");
        assertApproxEqAbs(owedGround, owedControl, 2, "grinding ~= single end-of-period distribute");
    }

    function test_distribute_blockedDuringForfeit_raceIsBounded() public {
        adapter.setIndex(1.04e18);
        vm.prank(arbiter);
        manager.initiateForfeit(id, 5000);

        // The race ends at initiation: accrual cannot advance while a proposal is active.
        vm.expectRevert(ICM.ForfeitPending.selector);
        manager.distribute(id, address(strategy));
    }
}
