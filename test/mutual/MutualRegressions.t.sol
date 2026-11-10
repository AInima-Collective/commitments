// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import {MutualE2ETest} from "./Mutual.t.sol";
import {OptimisticMutualArbiter} from "src/extensions/mutuals/OptimisticMutualArbiter.sol";
import {ICommitmentManager as ICM} from "src/core/interfaces/ICommitmentManager.sol";

/// @notice Regressions for the risk-market path: bond reclaim, stream compression, the exit window,
///         Lambda at its cap, and the settle poke.
contract MutualRegressionsTest is MutualE2ETest {
    function _fund(address who, uint256 amount, uint64 duration) internal {
        usdc.mint(who, amount);
        vm.startPrank(who);
        usdc.approve(address(manager), amount);
        manager.fundMutualPremium(1, amount, duration);
        vm.stopPrank();
    }

    function _proposeAndExecute(uint256 gid, uint256 loss) internal {
        vm.prank(proposer);
        arbiter.proposeLoss(gid, loss, bytes32("e"), MIN_BOND);
        vm.warp(block.timestamp + MUTUAL_WINDOW + 1);
        manager.executeMutualLoss(gid);
    }

    // ---- Bond reclaim ----

    /// An executed loss whose proposer never reclaims no longer blocks the next declaration:
    /// the next proposal refunds the prior proposer and goes ahead.
    function test_executedUnreclaimedClaimDoesNotBlockNext() public {
        uint256 gid = _registerMutual();
        _join(gid, u1, 100e18);
        _join(gid, u2, 100e18);
        _proposeAndExecute(gid, 10e18);

        vm.warp(block.timestamp + 365 days);
        address p2 = makeAddr("p2");
        bondTok.mint(p2, MIN_BOND);
        uint256 before = bondTok.balanceOf(proposer);
        vm.startPrank(p2);
        bondTok.approve(address(arbiter), MIN_BOND);
        vm.expectEmit(address(arbiter));
        emit OptimisticMutualArbiter.BondReclaimed(gid, proposer, MIN_BOND);
        arbiter.proposeLoss(gid, 10e18, bytes32("e2"), MIN_BOND);
        vm.stopPrank();

        assertEq(bondTok.balanceOf(proposer), before + MIN_BOND, "prior proposer refunded");
        assertEq(bondTok.balanceOf(address(arbiter)), MIN_BOND, "only the new bond held");
        (address who,,,) = arbiter.claims(gid);
        assertEq(who, p2, "new claim recorded");
    }

    /// Anyone can reclaim an executed claim's bond; it still goes to the proposer.
    function test_reclaimBond_permissionless() public {
        uint256 gid = _registerMutual();
        _join(gid, u1, 100e18);
        _proposeAndExecute(gid, 10e18);

        uint256 before = bondTok.balanceOf(proposer);
        vm.prank(makeAddr("stranger"));
        arbiter.reclaimBond(gid);
        assertEq(bondTok.balanceOf(proposer), before + MIN_BOND, "refund goes to the proposer");
    }

    /// A claim still pending in the manager keeps blocking.
    function test_pendingClaimStillBlocks() public {
        uint256 gid = _registerMutual();
        _join(gid, u1, 100e18);
        vm.prank(proposer);
        arbiter.proposeLoss(gid, 10e18, bytes32("e"), MIN_BOND);

        vm.prank(proposer);
        vm.expectRevert(OptimisticMutualArbiter.ClaimActive.selector);
        arbiter.proposeLoss(gid, 10e18, bytes32("e2"), MIN_BOND);
    }

    /// A claim cancelled in the manager (stale) is refunded by the next proposal too.
    function test_staleCancelledClaimRefundedByNextProposal() public {
        uint256 gid = _registerMutual();
        _join(gid, u1, 100e18);
        vm.prank(proposer);
        arbiter.proposeLoss(gid, 10e18, bytes32("e"), MIN_BOND);
        vm.warp(block.timestamp + MUTUAL_WINDOW + 7 days + 1);
        manager.cancelStaleMutualLoss(gid);

        uint256 before = bondTok.balanceOf(proposer);
        vm.prank(proposer);
        arbiter.proposeLoss(gid, 10e18, bytes32("e2"), MIN_BOND);
        assertEq(bondTok.balanceOf(proposer), before, "old bond back, new bond in");
        assertEq(bondTok.balanceOf(address(arbiter)), MIN_BOND, "one bond held");
    }

    // ---- Premium stream ----

    /// A dust funding with a short duration cannot pull a live stream's end in.
    function test_dustFundingCannotCompressStream() public {
        uint256 gid = _registerMutual();
        uint256 c1 = _join(gid, u1, 100e18);
        _fund(makeAddr("buyer"), 365e18, 365 days);
        uint64 finish = manager.getMutual(gid).periodFinish;

        vm.warp(block.timestamp + 1 days);
        uint256 c2 = _join(gid, u2, 900e18);
        _fund(makeAddr("anyone"), 1, 1 minutes);
        assertEq(manager.getMutual(gid).periodFinish, finish, "end never moves earlier");
        vm.warp(block.timestamp + 1 minutes);

        uint256 early = manager.pendingMemberPremium(c1);
        uint256 late = manager.pendingMemberPremium(c2);
        assertApproxEqAbs(early + late, 1e18 + uint256(1e18) / 1440, 1e15, "one day and a minute streamed");
        assertLt(late, 1e15, "late joiner earns a minute's share");
    }

    /// Extending a live stream spreads premium + leftover over the new end and keeps the rate guard.
    function test_extendingLiveStream() public {
        uint256 gid = _registerMutual();
        _join(gid, u1, 100e18);
        _fund(makeAddr("buyer"), 100e18, 100 days);
        vm.warp(block.timestamp + 50 days);

        // Not enough premium to hold the rate over 200 days: reverts.
        usdc.mint(address(this), 10e18);
        usdc.approve(address(manager), 10e18);
        vm.expectRevert(ICM.PremiumRateDecreased.selector);
        manager.fundMutualPremium(gid, 10e18, 200 days);

        // Enough: rate = (150 + leftover) / 200 days, end at now + 200 days.
        uint256 leftover = 50 days * uint256(manager.getMutual(gid).rewardRate);
        _fund(makeAddr("buyer2"), 150e18, 200 days);
        ICM.Mutual memory g = manager.getMutual(gid);
        assertEq(g.periodFinish, block.timestamp + 200 days);
        assertEq(g.rewardRate, (150e18 + leftover) / 200 days);
    }

    // ---- Exit window ----

    /// A pre-armed exit lapses: release after twice the window reverts, and the member must re-request.
    function test_exitRequestLapses() public {
        uint256 gid = _registerMutual();
        uint256 c1 = _join(gid, u1, 100e18);
        _join(gid, u2, 100e18);

        vm.prank(u1);
        manager.requestMutualExit(c1);
        vm.warp(block.timestamp + 300 days);
        vm.expectRevert(ICM.ExitRequestLapsed.selector);
        manager.releaseMutualMember(c1);

        // Re-request starts a fresh window.
        vm.prank(u1);
        manager.requestMutualExit(c1);
        assertEq(manager.getMembership(c1).unbondRequestedAt, block.timestamp);
        vm.expectRevert(ICM.DeallocationWindowActive.selector);
        manager.releaseMutualMember(c1);
        vm.warp(block.timestamp + MUTUAL_WINDOW);
        manager.releaseMutualMember(c1);
    }

    /// The window is [deallocationWindow, 2 * deallocationWindow).
    function test_exitWindowBounds() public {
        uint256 gid = _registerMutual();
        uint256 c1 = _join(gid, u1, 100e18);
        uint256 c2 = _join(gid, u2, 100e18);
        vm.prank(u1);
        manager.requestMutualExit(c1);
        vm.prank(u2);
        manager.requestMutualExit(c2);

        // Not lapsed yet: a second request reverts.
        vm.warp(block.timestamp + 2 * uint256(MUTUAL_WINDOW) - 1);
        vm.prank(u1);
        vm.expectRevert(ICM.UnbondAlreadyRequested.selector);
        manager.requestMutualExit(c1);
        manager.releaseMutualMember(c1); // last second of the window

        vm.warp(block.timestamp + 1);
        vm.expectRevert(ICM.ExitRequestLapsed.selector);
        manager.releaseMutualMember(c2);
    }

    // ---- Lambda at its cap ----

    /// A wiped-out mutual takes no new members and no new premium; existing members still leave.
    function test_exhaustedMutualRejectsJoinAndFunding() public {
        uint256 gid = _registerMutual();
        uint256 c1 = _join(gid, u1, 100e18);
        vm.prank(u1);
        manager.requestMutualExit(c1);
        _proposeAndExecute(gid, 100e18);
        assertEq(manager.getMutual(gid).cumulativeLoss, 1e18, "Lambda at its cap");

        vm.expectRevert(ICM.MutualExhausted.selector);
        _join(gid, u2, 100e18);

        usdc.mint(address(this), 1e18);
        usdc.approve(address(manager), 1e18);
        vm.expectRevert(ICM.MutualExhausted.selector);
        manager.fundMutualPremium(gid, 1e18, 30 days);

        manager.settleMemberLoss(c1);
        manager.releaseMutualMember(c1);
    }

    /// Each loss rounds its Lambda step down, so a mutual wiped out by two declarations ends one
    /// unit short of the cap. It is exhausted all the same.
    function test_exhaustedByTwoLossesRejectsJoinAndFunding() public {
        uint256 gid = _registerMutual();
        _join(gid, u1, 100e18);
        _join(gid, u2, 200e18);
        _proposeAndExecute(gid, 100e18);
        _proposeAndExecute(gid, 200e18);
        assertEq(manager.getMutual(gid).cumulativeLoss, 1e18 - 1, "one unit short of the cap");
        assertTrue(manager.getMutual(gid).exhausted, "exhausted");

        vm.expectRevert(ICM.MutualExhausted.selector);
        _join(gid, u2, 100e18);

        usdc.mint(address(this), 1e18);
        usdc.approve(address(manager), 1e18);
        vm.expectRevert(ICM.MutualExhausted.selector);
        manager.fundMutualPremium(gid, 1e18, 30 days);
    }

    /// On a small mutual the last loss's rounding is lost in whole numeraire units, which leaves
    /// Lambda far short of the cap with nothing left to deliver. It is exhausted all the same.
    function test_exhaustedSmallMutualRejectsJoinAndFunding() public {
        uint256 gid = _registerMutual();
        _join(gid, u1, 3e6);
        _proposeAndExecute(gid, 1e6);
        assertFalse(manager.getMutual(gid).exhausted, "a partial loss leaves cover");
        _join(gid, u2, 1e6); // still joinable after a partial loss
        _proposeAndExecute(gid, 1e24); // clamped: takes all the headroom there is

        ICM.Mutual memory g = manager.getMutual(gid);
        assertGt(1e18 - g.cumulativeLoss, 1e9, "Lambda is far from its cap");
        assertEq(((1e18 - g.cumulativeLoss) * g.totalShares) / 1e18, 0, "and nothing is left to deliver");
        assertTrue(g.exhausted, "exhausted");

        vm.expectRevert(ICM.MutualExhausted.selector);
        _join(gid, u2, 100e18);

        usdc.mint(address(this), 1e18);
        usdc.approve(address(manager), 1e18);
        vm.expectRevert(ICM.MutualExhausted.selector);
        manager.fundMutualPremium(gid, 1e18, 30 days);
    }

    // ---- Settle pokes ----

    /// Settling a member pokes the index first, so the interval before the loss is paid on
    /// pre-loss cover: the settled member earns the same as an unsettled peer up to the settle.
    function test_settlePokesBeforeShrinkingCover() public {
        uint256 gid = _registerMutual();
        uint256 c1 = _join(gid, u1, 100e18);
        uint256 c2 = _join(gid, u2, 100e18);
        _fund(makeAddr("buyer"), 365e18, 365 days);

        vm.warp(block.timestamp + 100 days); // no poke since the funding
        _proposeAndExecute(gid, 100e18);
        manager.settleMemberLoss(c1);

        assertApproxEqAbs(
            manager.pendingMemberPremium(c1), manager.pendingMemberPremium(c2), 1e6, "equal pay before the settle"
        );
    }
}
