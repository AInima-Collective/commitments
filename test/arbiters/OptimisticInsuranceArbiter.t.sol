// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import {Vm} from "forge-std/Vm.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

import {OptimisticInsuranceArbiter} from "src/periphery/arbiters/OptimisticInsuranceArbiter.sol";
import {ICommitmentManager as ICM} from "src/core/interfaces/ICommitmentManager.sol";
import {ManagerTestBase, MockIndexAdapter} from "../helpers/ManagerTestBase.sol";
import {ArbiterBase} from "src/shared/arbitration/ArbiterBase.sol";

// =============================================================================
// Mocks
// =============================================================================

/// @notice Mintable bond ERC-20.
contract BondToken is ERC20 {
    constructor() ERC20("Bond", "BND") {}

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}

// =============================================================================
// Tests
// =============================================================================

contract OptimisticInsuranceArbiterTest is ManagerTestBase {
    BondToken public bond;
    OptimisticInsuranceArbiter public arbiter;

    address public underwriter = makeAddr("underwriter");
    address public policyholder = makeAddr("policyholder");
    address public disputer = makeAddr("disputer");
    address public thirdParty = makeAddr("thirdParty");
    address public treasury = makeAddr("treasury");

    uint256 public constant DEPOSIT = 1000e18;
    uint256 public constant AMOUNT = 100e18;
    uint16 public constant MAX_PENALTY_BPS = 5000;

    uint256 public constant MIN_BOND = 100e18;
    uint64 public constant ANSWER_TIMEOUT = 2 days;
    uint16 public constant WINNER_SHARE_BPS = 5000;

    function setUp() public override {
        super.setUp();

        bond = new BondToken();

        arbiter = new OptimisticInsuranceArbiter(
            address(manager), address(bond), MIN_BOND, 0, ANSWER_TIMEOUT, WINNER_SHARE_BPS, treasury
        );

        _deposit(underwriter, DEPOSIT);

        // Fund bond participants.
        bond.mint(policyholder, 10_000e18);
        bond.mint(disputer, 10_000e18);
        bond.mint(thirdParty, 10_000e18);
        vm.prank(policyholder);
        bond.approve(address(arbiter), type(uint256).max);
        vm.prank(disputer);
        bond.approve(address(arbiter), type(uint256).max);
        vm.prank(thirdParty);
        bond.approve(address(arbiter), type(uint256).max);
    }

    // =========================================================================
    // Helpers
    // =========================================================================

    function _createCommitment() internal returns (uint256 cid) {
        cid = _createAs(underwriter, _baseParams(address(arbiter), policyholder, AMOUNT, MAX_PENALTY_BPS));
    }

    function _proposeClaim(address from, uint256 cid, uint16 amtBps, uint128 amount)
        internal
        returns (uint256 claimId)
    {
        vm.prank(from);
        claimId = arbiter.proposeClaim(cid, amtBps, bytes32("ev1"), bytes32("tmpl"), amount);
    }

    function _dispute(address from, uint256 claimId, uint16 amtBps, uint128 amount) internal {
        vm.prank(from);
        arbiter.disputeClaim(claimId, amtBps, bytes32("ev2"), amount);
    }

    // =========================================================================
    // proposeClaim
    // =========================================================================

    function testCommitmentManagerView() public view {
        assertEq(arbiter.commitmentManager(), address(manager));
    }

    function testProposeClaim_happyPath() public {
        uint256 cid = _createCommitment();
        uint256 before = bond.balanceOf(policyholder);
        uint256 claimId = _proposeClaim(policyholder, cid, 3000, uint128(MIN_BOND));

        assertEq(claimId, 1);
        assertEq(arbiter.activeClaimOf(cid), 1);
        assertEq(bond.balanceOf(address(arbiter)), MIN_BOND);
        assertEq(bond.balanceOf(policyholder), before - MIN_BOND);

        OptimisticInsuranceArbiter.Claim memory c = arbiter.getClaim(claimId);
        assertEq(uint8(c.state), uint8(OptimisticInsuranceArbiter.ClaimState.Proposed));
        assertEq(c.commitmentId, cid);
        assertEq(c.stack.length, 1);
        assertEq(c.stack[0].asserter, policyholder);
        assertEq(c.stack[0].amountBps, 3000);
        assertEq(c.stack[0].bond, MIN_BOND);
        assertEq(c.lastBondAt, block.timestamp);
        assertEq(c.templateId, bytes32("tmpl"));
    }

    function testProposeClaim_belowMinBondReverts() public {
        uint256 cid = _createCommitment();
        vm.prank(policyholder);
        vm.expectRevert(
            abi.encodeWithSelector(OptimisticInsuranceArbiter.BondBelowFloor.selector, MIN_BOND, MIN_BOND - 1)
        );
        arbiter.proposeClaim(cid, 3000, bytes32(0), bytes32(0), uint128(MIN_BOND - 1));
    }

    function testProposeClaim_doubleActiveReverts() public {
        uint256 cid = _createCommitment();
        uint256 first = _proposeClaim(policyholder, cid, 3000, uint128(MIN_BOND));

        vm.prank(disputer);
        vm.expectRevert(abi.encodeWithSelector(OptimisticInsuranceArbiter.ClaimAlreadyActive.selector, cid, first));
        arbiter.proposeClaim(cid, 4000, bytes32(0), bytes32(0), uint128(MIN_BOND));
    }

    function testProposeClaim_wrongArbiterReverts() public {
        // Commitment whose arbiter isn't this one.
        address otherArbiter = makeAddr("otherArbiter");
        uint256 cid = _createAs(underwriter, _baseParams(otherArbiter, policyholder, AMOUNT, MAX_PENALTY_BPS));

        vm.prank(policyholder);
        vm.expectRevert(abi.encodeWithSelector(ArbiterBase.WrongArbiter.selector, address(arbiter), otherArbiter));
        arbiter.proposeClaim(cid, 3000, bytes32(0), bytes32(0), uint128(MIN_BOND));
    }

    function testProposeClaim_amountAboveMaxReverts() public {
        uint256 cid = _createCommitment();
        vm.prank(policyholder);
        vm.expectRevert(
            abi.encodeWithSelector(
                OptimisticInsuranceArbiter.AmountAboveCommitmentMax.selector, MAX_PENALTY_BPS, MAX_PENALTY_BPS + 1
            )
        );
        arbiter.proposeClaim(cid, MAX_PENALTY_BPS + 1, bytes32(0), bytes32(0), uint128(MIN_BOND));
    }

    function testProposeClaim_zeroAmountReverts() public {
        uint256 cid = _createCommitment();
        vm.prank(policyholder);
        vm.expectRevert(abi.encodeWithSelector(OptimisticInsuranceArbiter.InvalidAmountBps.selector, 0));
        arbiter.proposeClaim(cid, 0, bytes32(0), bytes32(0), uint128(MIN_BOND));
    }

    function testProposeClaim_releasedCommitmentReverts() public {
        uint256 cid = _createCommitment();
        vm.prank(address(arbiter));
        manager.releaseCommitment(cid);

        vm.prank(policyholder);
        vm.expectRevert(abi.encodeWithSelector(ArbiterBase.CommitmentNotActive.selector, cid));
        arbiter.proposeClaim(cid, 3000, bytes32(0), bytes32(0), uint128(MIN_BOND));
    }

    // =========================================================================
    // disputeClaim
    // =========================================================================

    function testDispute_happyPath() public {
        uint256 cid = _createCommitment();
        uint256 claimId = _proposeClaim(policyholder, cid, 3000, uint128(MIN_BOND));
        uint64 firstBondAt = uint64(block.timestamp);

        vm.warp(block.timestamp + 1 hours);
        _dispute(disputer, claimId, 0, uint128(MIN_BOND * 2));

        OptimisticInsuranceArbiter.Claim memory c = arbiter.getClaim(claimId);
        assertEq(c.stack.length, 2);
        assertEq(c.stack[1].asserter, disputer);
        assertEq(c.stack[1].amountBps, 0);
        assertEq(c.stack[1].bond, MIN_BOND * 2);
        assertEq(c.lastBondAt, block.timestamp, "timer reset on dispute");
        assertGt(c.lastBondAt, firstBondAt);
    }

    function testDispute_bondBelowDoubleReverts() public {
        uint256 cid = _createCommitment();
        uint256 claimId = _proposeClaim(policyholder, cid, 3000, uint128(MIN_BOND));

        vm.prank(disputer);
        vm.expectRevert(
            abi.encodeWithSelector(OptimisticInsuranceArbiter.BondNotDoubled.selector, MIN_BOND * 2, MIN_BOND * 2 - 1)
        );
        arbiter.disputeClaim(claimId, 0, bytes32(0), uint128(MIN_BOND * 2 - 1));
    }

    function testDispute_lastAsserterCannotDispute() public {
        uint256 cid = _createCommitment();
        uint256 claimId = _proposeClaim(policyholder, cid, 3000, uint128(MIN_BOND));

        vm.prank(policyholder);
        vm.expectRevert(OptimisticInsuranceArbiter.LastAsserterCannotDispute.selector);
        arbiter.disputeClaim(claimId, 0, bytes32(0), uint128(MIN_BOND * 2));
    }

    function testDispute_maxDoublingsCapEnforced() public {
        uint256 cid = _createCommitment();
        uint256 claimId = _proposeClaim(policyholder, cid, 3000, uint128(MIN_BOND));

        // Mint plenty to alternate disputers.
        bond.mint(disputer, 10_000_000e18);
        bond.mint(thirdParty, 10_000_000e18);
        vm.prank(disputer);
        bond.approve(address(arbiter), type(uint256).max);
        vm.prank(thirdParty);
        bond.approve(address(arbiter), type(uint256).max);

        // Stack length so far: 1. Push 7 more disputes (alternating).
        uint256 cur = MIN_BOND;
        address[2] memory ds = [disputer, thirdParty];
        uint16[2] memory amts = [uint16(0), uint16(2000)];
        for (uint256 i = 0; i < 7; i++) {
            cur *= 2;
            vm.prank(ds[i % 2]);
            arbiter.disputeClaim(claimId, amts[i % 2], bytes32(0), uint128(cur));
        }
        // Stack length now 8 == MAX_BOND_DOUBLINGS. Next dispute reverts.
        cur *= 2;
        vm.prank(ds[7 % 2]);
        vm.expectRevert(OptimisticInsuranceArbiter.MaxDoublingsReached.selector);
        arbiter.disputeClaim(claimId, amts[7 % 2], bytes32(0), uint128(cur));
    }

    function testDispute_wrongStateReverts() public {
        uint256 cid = _createCommitment();
        uint256 claimId = _proposeClaim(policyholder, cid, 3000, uint128(MIN_BOND));

        vm.prank(policyholder);
        arbiter.cancelClaim(claimId); // state -> Cancelled

        vm.prank(disputer);
        vm.expectRevert(
            abi.encodeWithSelector(
                OptimisticInsuranceArbiter.WrongClaimState.selector,
                OptimisticInsuranceArbiter.ClaimState.Proposed,
                OptimisticInsuranceArbiter.ClaimState.Cancelled
            )
        );
        arbiter.disputeClaim(claimId, 0, bytes32(0), uint128(MIN_BOND * 2));
    }

    // =========================================================================
    // cancelClaim
    // =========================================================================

    function testCancel_happyPath() public {
        uint256 cid = _createCommitment();
        uint256 claimId = _proposeClaim(policyholder, cid, 3000, uint128(MIN_BOND));

        uint256 before = bond.balanceOf(policyholder);
        vm.prank(policyholder);
        arbiter.cancelClaim(claimId);

        assertEq(bond.balanceOf(policyholder), before + MIN_BOND);
        assertEq(arbiter.activeClaimOf(cid), 0, "commitment freed for re-claim");

        OptimisticInsuranceArbiter.Claim memory c = arbiter.getClaim(claimId);
        assertEq(uint8(c.state), uint8(OptimisticInsuranceArbiter.ClaimState.Cancelled));
    }

    function testCancel_afterDisputeReverts() public {
        uint256 cid = _createCommitment();
        uint256 claimId = _proposeClaim(policyholder, cid, 3000, uint128(MIN_BOND));
        _dispute(disputer, claimId, 0, uint128(MIN_BOND * 2));

        vm.prank(policyholder);
        vm.expectRevert(OptimisticInsuranceArbiter.AlreadyDisputed.selector);
        arbiter.cancelClaim(claimId);
    }

    function testCancel_byNonProposerReverts() public {
        uint256 cid = _createCommitment();
        uint256 claimId = _proposeClaim(policyholder, cid, 3000, uint128(MIN_BOND));

        vm.prank(disputer);
        vm.expectRevert(abi.encodeWithSelector(OptimisticInsuranceArbiter.NotProposer.selector, policyholder, disputer));
        arbiter.cancelClaim(claimId);
    }

    // =========================================================================
    // finalizeClaim — timeout path
    // =========================================================================

    function testFinalize_timeoutPath_topOfStackWins() public {
        uint256 cid = _createCommitment();
        uint256 claimId = _proposeClaim(policyholder, cid, 3000, uint128(MIN_BOND));

        vm.expectRevert();
        arbiter.finalizeClaim(claimId);

        vm.warp(block.timestamp + ANSWER_TIMEOUT + 1);
        arbiter.finalizeClaim(claimId);

        // commitmentId 1 had a forfeit initiated for top-of-stack=3000.
        ICM.ForfeitProposal memory p = manager.getForfeitProposal(cid);
        assertEq(p.penaltyBps, 3000);

        OptimisticInsuranceArbiter.Claim memory c = arbiter.getClaim(claimId);
        assertEq(uint8(c.state), uint8(OptimisticInsuranceArbiter.ClaimState.Forfeiture));
        assertEq(c.winningAmtBps, 3000);
    }

    function testFinalize_zeroAmountSettlesDirectly() public {
        // Disputer's "no payout" answer wins on timeout — no forfeit, just bond
        // settlement and commitment freed.
        uint256 cid = _createCommitment();
        uint256 claimId = _proposeClaim(policyholder, cid, 3000, uint128(MIN_BOND));
        _dispute(disputer, claimId, 0, uint128(MIN_BOND * 2));

        vm.warp(block.timestamp + ANSWER_TIMEOUT + 1);
        arbiter.finalizeClaim(claimId);

        // The propose-time hold (re-initiated at 0 bps by the dispute) is
        // released — no forfeit lands, the committer can exit again.
        ICM.ForfeitProposal memory p = manager.getForfeitProposal(cid);
        assertTrue(p.cancelled, "hold released on claim denial");
        assertFalse(p.executed);

        OptimisticInsuranceArbiter.Claim memory c = arbiter.getClaim(claimId);
        assertEq(uint8(c.state), uint8(OptimisticInsuranceArbiter.ClaimState.Settled));
        assertEq(c.winningAmtBps, 0);
        assertEq(arbiter.activeClaimOf(cid), 0);
    }

    function testFinalize_cappedAtCommitmentMax() public {
        // A disputed answer above commitment.maxPenaltyBps wins by timeout;
        // the arbiter caps it before initiateForfeit (depositor-side defense).
        uint256 cid = _createCommitment();
        uint256 claimId = _proposeClaim(policyholder, cid, 3000, uint128(MIN_BOND));
        _dispute(disputer, claimId, 9000, uint128(MIN_BOND * 2)); // > MAX_PENALTY_BPS=5000

        vm.warp(block.timestamp + ANSWER_TIMEOUT + 1);
        arbiter.finalizeClaim(claimId);

        ICM.ForfeitProposal memory p = manager.getForfeitProposal(cid);
        assertEq(p.penaltyBps, MAX_PENALTY_BPS, "capped to commitment max");
    }

    function testFinalizeThenExecute_emitsClaimFinalizedOnceWithPaidValue() public {
        uint256 cid = _createCommitment();
        uint256 claimId = _proposeClaim(policyholder, cid, 3000, uint128(MIN_BOND));
        _dispute(disputer, claimId, 9000, uint128(MIN_BOND * 2)); // > MAX_PENALTY_BPS=5000

        vm.recordLogs();
        vm.warp(block.timestamp + ANSWER_TIMEOUT + 1);
        arbiter.finalizeClaim(claimId);
        arbiter.executeClaim(claimId);

        Vm.Log[] memory logs = vm.getRecordedLogs();
        uint256 count;
        for (uint256 i; i < logs.length; i++) {
            if (logs[i].emitter != address(arbiter)) continue;
            if (logs[i].topics[0] != OptimisticInsuranceArbiter.ClaimFinalized.selector) continue;
            count++;
            assertEq(abi.decode(logs[i].data, (uint16)), MAX_PENALTY_BPS, "the capped penalty actually paid");
        }
        assertEq(count, 1, "ClaimFinalized emitted once");
    }

    function testFinalize_beforeTimeoutReverts() public {
        uint256 cid = _createCommitment();
        uint256 claimId = _proposeClaim(policyholder, cid, 3000, uint128(MIN_BOND));

        vm.expectRevert(
            abi.encodeWithSelector(
                OptimisticInsuranceArbiter.TimeoutNotElapsed.selector,
                uint64(block.timestamp) + ANSWER_TIMEOUT,
                uint64(block.timestamp)
            )
        );
        arbiter.finalizeClaim(claimId);
    }

    function testFinalize_wrongStateReverts() public {
        uint256 cid = _createCommitment();
        uint256 claimId = _proposeClaim(policyholder, cid, 3000, uint128(MIN_BOND));

        vm.prank(policyholder);
        arbiter.cancelClaim(claimId);

        vm.expectRevert();
        arbiter.finalizeClaim(claimId);
    }

    // =========================================================================
    // executeClaim
    // =========================================================================

    function testExecute_distributesBonds_winnerTakeAll() public {
        // Deploy an arbiter with winnerShareBps = 10_000 for the winner-take-all
        // case. (Default test uses 50/50.)
        OptimisticInsuranceArbiter wta = new OptimisticInsuranceArbiter(
            address(manager), address(bond), MIN_BOND, 0, ANSWER_TIMEOUT, 10_000, address(0)
        );

        uint256 cid = _createAs(underwriter, _baseParams(address(wta), policyholder, AMOUNT, MAX_PENALTY_BPS));
        vm.prank(policyholder);
        bond.approve(address(wta), type(uint256).max);
        vm.prank(disputer);
        bond.approve(address(wta), type(uint256).max);

        vm.prank(policyholder);
        uint256 claimId = wta.proposeClaim(cid, 3000, bytes32(0), bytes32(0), uint128(MIN_BOND));
        vm.prank(disputer);
        wta.disputeClaim(claimId, 0, bytes32(0), uint128(MIN_BOND * 2));

        vm.warp(block.timestamp + ANSWER_TIMEOUT + 1);
        wta.finalizeClaim(claimId); // disputer (top, amt=0) wins by timeout

        // After finalize: state Settled (zero-amount path), bonds settled.
        // Disputer asserted the winning amount → refund + 100% of forfeit pool.
        // Policyholder's bond (MIN_BOND) is the forfeit pool.
        // Disputer originally had ~10_000e18 - MIN_BOND*2; now back +MIN_BOND*2 + MIN_BOND.
        // Net relative to initial seed: -(MIN_BOND*2) + (MIN_BOND*2 + MIN_BOND) = +MIN_BOND.
        uint256 initial = 10_000e18;
        assertEq(bond.balanceOf(disputer), initial + MIN_BOND, "winner-take-all: disputer +MIN_BOND");
        // Policyholder is down their bond.
        assertEq(bond.balanceOf(policyholder), initial - MIN_BOND);
    }

    function testExecute_distributesBonds_treasurySplit() public {
        // Default arbiter has winnerShareBps = 5000, treasury set.
        // Set up: policyholder claim 3000, disputer counter 0, then second
        // dispute by thirdParty at 3000. Top of stack=3000 wins.
        // Stack: [policyholder@3000, disputer@0, thirdParty@3000].
        uint256 cid = _createCommitment();
        uint256 claimId = _proposeClaim(policyholder, cid, 3000, uint128(MIN_BOND));
        _dispute(disputer, claimId, 0, uint128(MIN_BOND * 2));
        _dispute(thirdParty, claimId, 3000, uint128(MIN_BOND * 4));

        vm.warp(block.timestamp + ANSWER_TIMEOUT + 1);
        arbiter.finalizeClaim(claimId);

        // Now in Forfeiture state. Wait out manager challenge window then execute.
        vm.warp(block.timestamp + WINDOW + 1);
        uint256 thirdPartyBefore = bond.balanceOf(thirdParty);
        uint256 policyholderBefore = bond.balanceOf(policyholder);
        uint256 treasuryBefore = bond.balanceOf(treasury);

        arbiter.executeClaim(claimId);

        // disputer's MIN_BOND*2 is forfeit pool.
        // 50% to lastWinner = thirdParty (last winning asserter): MIN_BOND.
        // 50% to treasury: MIN_BOND.
        // Policyholder + thirdParty refunded their bonds.
        assertEq(bond.balanceOf(thirdParty), thirdPartyBefore + MIN_BOND * 4 + MIN_BOND);
        assertEq(bond.balanceOf(policyholder), policyholderBefore + MIN_BOND);
        assertEq(bond.balanceOf(treasury), treasuryBefore + MIN_BOND);
        OptimisticInsuranceArbiter.Claim memory c = arbiter.getClaim(claimId);
        assertEq(uint8(c.state), uint8(OptimisticInsuranceArbiter.ClaimState.Settled));
        assertEq(arbiter.activeClaimOf(cid), 0);

        // Manager-side payout (v2 pull-payment): the forfeit credits the
        // policyholder's FREE balance inside the manager; the residual
        // returns to the underwriter's free balance.
        uint256 payout = (AMOUNT * 3000) / 10_000;
        assertEq(manager.freeBalance(address(token), policyholder), payout, "policyholder credited in-manager");
        assertEq(manager.encumberedBalance(address(token), underwriter), 0, "commitment fully unwound");
        assertEq(manager.freeBalance(address(token), underwriter), DEPOSIT - payout, "residual back to underwriter");

        // Pull-payment round-trip: policyholder withdraws the forfeited funds.
        vm.prank(policyholder);
        manager.withdraw(address(token), payout);
        assertEq(token.balanceOf(policyholder), payout, "policyholder pulls payout out");
        assertEq(manager.freeBalance(address(token), policyholder), 0);
    }

    function testExecute_wrongStateReverts() public {
        uint256 cid = _createCommitment();
        uint256 claimId = _proposeClaim(policyholder, cid, 3000, uint128(MIN_BOND));

        vm.expectRevert(); // state Proposed, not Forfeiture
        arbiter.executeClaim(claimId);
    }

    function testExecute_beforeChallengeWindowReverts() public {
        // Manager-side defense: the hold is initiated at PROPOSE time, so with
        // a challenge window longer than the answer timeout the proposal is
        // still inside its window when the claim finalizes — executeClaim
        // cannot short-circuit it.
        ICM.CommitmentParams memory params = _baseParams(address(arbiter), policyholder, AMOUNT, MAX_PENALTY_BPS);
        params.challengeWindow = 3 days; // > ANSWER_TIMEOUT (2 days)
        uint256 cid = _createAs(underwriter, params);
        uint256 claimId = _proposeClaim(policyholder, cid, 3000, uint128(MIN_BOND));

        vm.warp(block.timestamp + ANSWER_TIMEOUT + 1);
        arbiter.finalizeClaim(claimId); // state -> Forfeiture (hold from propose)

        vm.expectRevert(ICM.ChallengeWindowActive.selector);
        arbiter.executeClaim(claimId);

        // Once the window elapses the claim executes normally.
        vm.warp(block.timestamp + 1 days);
        arbiter.executeClaim(claimId);
        OptimisticInsuranceArbiter.Claim memory c = arbiter.getClaim(claimId);
        assertEq(uint8(c.state), uint8(OptimisticInsuranceArbiter.ClaimState.Settled));
    }

    // =========================================================================
    // cancelStaleClaim
    // =========================================================================

    function testStaleCancel_happyPath() public {
        uint256 cid = _createCommitment();
        uint256 claimId = _proposeClaim(policyholder, cid, 3000, uint128(MIN_BOND));
        _dispute(disputer, claimId, 0, uint128(MIN_BOND * 2));

        // Before TTL: revert.
        vm.warp(block.timestamp + ANSWER_TIMEOUT + 1 days);
        vm.expectRevert();
        arbiter.cancelStaleClaim(claimId);

        // After TTL: succeeds, refunds all bonds.
        vm.warp(block.timestamp + 14 days);
        uint256 phBefore = bond.balanceOf(policyholder);
        uint256 dBefore = bond.balanceOf(disputer);

        arbiter.cancelStaleClaim(claimId);

        assertEq(bond.balanceOf(policyholder), phBefore + MIN_BOND);
        assertEq(bond.balanceOf(disputer), dBefore + MIN_BOND * 2);
        assertEq(arbiter.activeClaimOf(cid), 0);
        OptimisticInsuranceArbiter.Claim memory c = arbiter.getClaim(claimId);
        assertEq(uint8(c.state), uint8(OptimisticInsuranceArbiter.ClaimState.Cancelled));

        // The abandoned claim releases its manager-side hold.
        ICM.ForfeitProposal memory p = manager.getForfeitProposal(cid);
        assertTrue(p.cancelled, "hold released on stale cancel");
    }

    function testStaleCancel_settlesWhenHoldExecutedExternally() public {
        // S3 x S4 seam: the hold becomes executable at T+challengeWindow but
        // cancelStaleClaim only opens at T+answerTimeout+TTL. If the hold was
        // executed externally in that gap and nobody finalized, the result IS
        // enforced on-chain — cancelStaleClaim must settle the bond game at
        // it, not refund the losing disputer against the enforced forfeit.
        uint256 cid = _createCommitment();
        uint256 claimId = _proposeClaim(policyholder, cid, 3000, uint128(MIN_BOND));
        _dispute(disputer, claimId, 0, uint128(MIN_BOND * 2));
        _dispute(thirdParty, claimId, 3000, uint128(MIN_BOND * 4));

        // Hold (synced at 3000 by the last dispute) executed externally.
        vm.warp(block.timestamp + WINDOW + 1);
        vm.prank(underwriter);
        manager.executeForfeit(cid);

        // Nobody finalizes; the losing disputer waits out the TTL hoping to
        // reclaim their bond via the refund-all path.
        vm.warp(block.timestamp + 14 days + 1);
        uint256 phBefore = bond.balanceOf(policyholder);
        uint256 dBefore = bond.balanceOf(disputer);
        uint256 tpBefore = bond.balanceOf(thirdParty);

        vm.prank(disputer);
        arbiter.cancelStaleClaim(claimId);

        // Settled at the enforced answer (3000): winners refunded, the
        // disputer's bond forfeits — no refund against an enforced result.
        OptimisticInsuranceArbiter.Claim memory c = arbiter.getClaim(claimId);
        assertEq(uint8(c.state), uint8(OptimisticInsuranceArbiter.ClaimState.Settled));
        assertEq(c.winningAmtBps, 3000);
        assertEq(arbiter.activeClaimOf(cid), 0);
        assertEq(bond.balanceOf(policyholder), phBefore + MIN_BOND);
        assertEq(bond.balanceOf(thirdParty), tpBefore + MIN_BOND * 4 + MIN_BOND); // refund + 50% pool
        assertEq(bond.balanceOf(disputer), dBefore, "losing bond stays forfeited");
        assertEq(bond.balanceOf(treasury), MIN_BOND, "treasury takes the other 50%");
        assertEq(bond.balanceOf(address(arbiter)), 0, "no bond stranded");
    }

    // =========================================================================
    // constructor invariants
    // =========================================================================

    function testConstructor_zeroTimeoutReverts() public {
        vm.expectRevert(OptimisticInsuranceArbiter.ZeroAnswerTimeout.selector);
        new OptimisticInsuranceArbiter(address(manager), address(bond), MIN_BOND, 0, 0, WINNER_SHARE_BPS, treasury);
    }

    function testConstructor_invalidWinnerShareReverts() public {
        vm.expectRevert(OptimisticInsuranceArbiter.InvalidWinnerShareBps.selector);
        new OptimisticInsuranceArbiter(address(manager), address(bond), MIN_BOND, 0, ANSWER_TIMEOUT, 10_001, treasury);
    }

    function testConstructor_treasuryRequiredWhenSplit() public {
        vm.expectRevert(OptimisticInsuranceArbiter.TreasuryRequired.selector);
        new OptimisticInsuranceArbiter(address(manager), address(bond), MIN_BOND, 0, ANSWER_TIMEOUT, 5000, address(0));
    }

    function testConstructor_treasuryNotRequiredForFullWinnerShare() public {
        // Should not revert.
        new OptimisticInsuranceArbiter(address(manager), address(bond), MIN_BOND, 0, ANSWER_TIMEOUT, 10_000, address(0));
    }

    // =========================================================================
    // getBondStackTop view
    // =========================================================================

    function testBondStackTop() public {
        uint256 cid = _createCommitment();
        uint256 claimId = _proposeClaim(policyholder, cid, 3000, uint128(MIN_BOND));
        (address asserter, uint16 amt, uint128 b, uint64 deadline) = arbiter.getBondStackTop(claimId);
        assertEq(asserter, policyholder);
        assertEq(amt, 3000);
        assertEq(b, MIN_BOND);
        assertEq(deadline, block.timestamp + ANSWER_TIMEOUT);
    }

    function testGetClaim_unknownReverts() public {
        vm.expectRevert(abi.encodeWithSelector(OptimisticInsuranceArbiter.UnknownClaim.selector, 999));
        arbiter.getClaim(999);
    }

    // =========================================================================
    // S4 — propose-time manager hold (issue #50)
    // =========================================================================

    function testPropose_opensManagerHold() public {
        uint256 cid = _createCommitment();
        _proposeClaim(policyholder, cid, 3000, uint128(MIN_BOND));

        ICM.ForfeitProposal memory p = manager.getForfeitProposal(cid);
        assertEq(p.initiatedAt, uint64(block.timestamp), "hold opened at propose time");
        assertEq(p.penaltyBps, 3000, "hold mirrors the proposed answer");
        assertFalse(p.executed);
        assertFalse(p.cancelled);
    }

    function testPropose_blocksUnbondEscape() public {
        // THE ATTACK (#50): a committer facing a claim requests an unbond and
        // rides it out; pre-fix, nothing on the manager blocked the exit until
        // finalizeClaim. Now the propose-time hold blocks finalizeUnbond for
        // the life of the claim.
        uint256 cid = _createCommitment();
        _proposeClaim(policyholder, cid, 3000, uint128(MIN_BOND));

        vm.prank(underwriter);
        manager.requestUnbond(cid);

        // Even long past unbond maturity (7d > answerTimeout), the hold from
        // propose time still blocks the exit.
        vm.warp(block.timestamp + UNBONDING + 1);
        vm.expectRevert(ICM.UnbondBlockedByForfeit.selector);
        manager.finalizeUnbond(cid);

        // The claim resolves and enforces against the still-custodied backing.
        uint256 claimId = arbiter.activeClaimOf(cid);
        arbiter.finalizeClaim(claimId); // answer timer elapsed long ago
        arbiter.executeClaim(claimId); // hold window (2d from propose) elapsed too

        uint256 payout = (AMOUNT * 3000) / 10_000;
        assertEq(manager.freeBalance(address(token), policyholder), payout, "claim enforced before exit");
    }

    function testPropose_selfEscalationCannotUnblockUnbond() public {
        // Committer-controlled addresses self-escalate the bond stack to buy
        // time (each dispute resets the answer timer) — but every dispute
        // re-initiates the manager hold, so the exit stays blocked throughout.
        uint256 cid = _createCommitment();
        uint256 claimId = _proposeClaim(policyholder, cid, 3000, uint128(MIN_BOND));

        vm.prank(underwriter);
        manager.requestUnbond(cid);

        // Two committer socks ping-pong disputes just before each deadline.
        bond.mint(disputer, 100_000_000e18);
        bond.mint(thirdParty, 100_000_000e18);
        address[2] memory socks = [disputer, thirdParty];
        uint256 cur = MIN_BOND;
        for (uint256 i = 0; i < 7; i++) {
            vm.warp(block.timestamp + ANSWER_TIMEOUT - 1);
            cur *= 2;
            vm.prank(socks[i % 2]);
            arbiter.disputeClaim(claimId, 0, bytes32(0), uint128(cur));
        }

        // Way past unbond maturity by now; the (re-synced) hold still blocks.
        assertGt(block.timestamp, UNBONDING);
        vm.expectRevert(ICM.UnbondBlockedByForfeit.selector);
        manager.finalizeUnbond(cid);

        ICM.ForfeitProposal memory p = manager.getForfeitProposal(cid);
        assertEq(p.initiatedAt, uint64(block.timestamp), "hold re-synced on every dispute");
        assertFalse(p.executed);
        assertFalse(p.cancelled);
    }

    function testPropose_reopensAfterDeniedClaim() public {
        // The whole terminal-path design assumes a cancelled hold is
        // overwritable: after a denial releases the hold, a fresh claim must
        // be able to open a fresh hold on the same commitment.
        uint256 cid = _createCommitment();
        uint256 claimId = _proposeClaim(policyholder, cid, 3000, uint128(MIN_BOND));
        _dispute(disputer, claimId, 0, uint128(MIN_BOND * 2));

        vm.warp(block.timestamp + ANSWER_TIMEOUT + 1);
        arbiter.finalizeClaim(claimId); // denied — hold cancelled, commitment alive

        uint256 second = _proposeClaim(policyholder, cid, 4000, uint128(MIN_BOND));
        assertEq(arbiter.activeClaimOf(cid), second);

        ICM.ForfeitProposal memory p = manager.getForfeitProposal(cid);
        assertEq(p.initiatedAt, uint64(block.timestamp), "fresh hold over the cancelled one");
        assertEq(p.penaltyBps, 4000);
        assertFalse(p.cancelled);
        assertFalse(p.executed);
    }

    function testPropose_challengeWindowTooShortReverts() public {
        // The hold must not be executable before the claim is finalizable, so
        // commitments claimed through this arbiter need
        // challengeWindow >= answerTimeout.
        ICM.CommitmentParams memory params = _baseParams(address(arbiter), policyholder, AMOUNT, MAX_PENALTY_BPS);
        params.challengeWindow = 1 days; // < ANSWER_TIMEOUT (2 days)
        uint256 cid = _createAs(underwriter, params);

        vm.prank(policyholder);
        vm.expectRevert(
            abi.encodeWithSelector(ArbiterBase.ChallengeWindowTooShort.selector, ANSWER_TIMEOUT, uint64(1 days))
        );
        arbiter.proposeClaim(cid, 3000, bytes32(0), bytes32(0), uint128(MIN_BOND));
    }

    function testDispute_resyncsManagerHold() public {
        uint256 cid = _createCommitment();
        uint256 claimId = _proposeClaim(policyholder, cid, 3000, uint128(MIN_BOND));

        vm.warp(block.timestamp + 1 hours);
        _dispute(disputer, claimId, 0, uint128(MIN_BOND * 2));

        ICM.ForfeitProposal memory p = manager.getForfeitProposal(cid);
        assertEq(p.initiatedAt, uint64(block.timestamp), "hold window restarts with the answer timer");
        assertEq(p.penaltyBps, 0, "hold mirrors the counter answer");
        assertFalse(p.executed);
        assertFalse(p.cancelled);

        // An over-max counter is capped on the manager side.
        vm.warp(block.timestamp + 1 hours);
        _dispute(thirdParty, claimId, 9000, uint128(MIN_BOND * 4));
        p = manager.getForfeitProposal(cid);
        assertEq(p.penaltyBps, MAX_PENALTY_BPS, "hold capped to commitment max");
    }

    function testCancel_releasesManagerHold() public {
        uint256 cid = _createCommitment();
        uint256 claimId = _proposeClaim(policyholder, cid, 3000, uint128(MIN_BOND));

        vm.prank(policyholder);
        arbiter.cancelClaim(claimId);

        ICM.ForfeitProposal memory p = manager.getForfeitProposal(cid);
        assertTrue(p.cancelled, "hold released on proposer cancel");

        // The committer can exit again.
        vm.prank(underwriter);
        manager.requestUnbond(cid);
        vm.warp(block.timestamp + UNBONDING + 1);
        manager.finalizeUnbond(cid);
    }

    function testFinalize_committerExitedSettlesBondsGracefully() public {
        // If the commitment is resolved elsewhere before finalization, the
        // bond game still settles at the winning answer — no bond bricks, no
        // net-free escape via cancelStaleClaim refunds.
        uint256 cid = _createCommitment();
        uint256 claimId = _proposeClaim(policyholder, cid, 3000, uint128(MIN_BOND));
        _dispute(disputer, claimId, 0, uint128(MIN_BOND * 2));
        _dispute(thirdParty, claimId, 3000, uint128(MIN_BOND * 4));

        // Simulate an external terminal resolution of the commitment.
        vm.prank(address(arbiter));
        manager.releaseCommitment(cid);

        vm.warp(block.timestamp + ANSWER_TIMEOUT + 1);
        uint256 phBefore = bond.balanceOf(policyholder);
        uint256 dBefore = bond.balanceOf(disputer);
        uint256 tpBefore = bond.balanceOf(thirdParty);

        arbiter.finalizeClaim(claimId); // must NOT revert CommitmentInactive

        OptimisticInsuranceArbiter.Claim memory c = arbiter.getClaim(claimId);
        assertEq(uint8(c.state), uint8(OptimisticInsuranceArbiter.ClaimState.Settled));
        assertEq(arbiter.activeClaimOf(cid), 0);

        // Winning answer 3000: policyholder + thirdParty refunded; the losing
        // disputer's bond forfeits (NOT refunded — the escape is not free).
        assertEq(bond.balanceOf(policyholder), phBefore + MIN_BOND);
        assertEq(bond.balanceOf(thirdParty), tpBefore + MIN_BOND * 4 + MIN_BOND); // refund + 50% pool
        assertEq(bond.balanceOf(disputer), dBefore, "losing bond stays forfeited");

        // The dangling hold is released.
        ICM.ForfeitProposal memory p = manager.getForfeitProposal(cid);
        assertTrue(p.cancelled, "dangling hold cancelled");
    }

    function testFinalize_staleCancelledHoldReinitiates() public {
        // The hold was stale-cancelled externally while the claim rotted in
        // Proposed; finalizeClaim restores it with a fresh window and the
        // claim still enforces.
        uint256 cid = _createCommitment();
        uint256 claimId = _proposeClaim(policyholder, cid, 3000, uint128(MIN_BOND));

        vm.warp(block.timestamp + WINDOW + 14 days + 1);
        vm.prank(thirdParty);
        manager.cancelStaleForfeitProposal(cid);

        arbiter.finalizeClaim(claimId); // answer timer elapsed long ago

        ICM.ForfeitProposal memory p = manager.getForfeitProposal(cid);
        assertEq(p.initiatedAt, uint64(block.timestamp), "hold re-initiated with a fresh window");
        assertEq(p.penaltyBps, 3000);
        assertFalse(p.cancelled);

        vm.warp(block.timestamp + WINDOW + 1);
        arbiter.executeClaim(claimId);
        assertEq(manager.freeBalance(address(token), policyholder), (AMOUNT * 3000) / 10_000);
    }

    // =========================================================================
    // S3 — tolerate external resolution of the manager forfeit (issue #49)
    // =========================================================================

    function testExecute_toleratesExternalManagerExecution() public {
        // THE ATTACK (#49, brick 1): a losing disputer (or any keeper)
        // front-runs executeClaim with a direct manager.executeForfeit. The
        // claim must still settle instead of reverting forever.
        uint256 cid = _createCommitment();
        uint256 claimId = _proposeClaim(policyholder, cid, 3000, uint128(MIN_BOND));
        _dispute(disputer, claimId, 0, uint128(MIN_BOND * 2));
        _dispute(thirdParty, claimId, 3000, uint128(MIN_BOND * 4));

        vm.warp(block.timestamp + ANSWER_TIMEOUT + 1);
        arbiter.finalizeClaim(claimId); // -> Forfeiture

        // Losing disputer executes the manager forfeit directly (permissionless
        // after the challenge window, which elapsed alongside the timer).
        vm.prank(disputer);
        manager.executeForfeit(cid);

        uint256 phBefore = bond.balanceOf(policyholder);
        uint256 tpBefore = bond.balanceOf(thirdParty);

        arbiter.executeClaim(claimId); // must NOT revert NoActiveForfeitProposal

        OptimisticInsuranceArbiter.Claim memory c = arbiter.getClaim(claimId);
        assertEq(uint8(c.state), uint8(OptimisticInsuranceArbiter.ClaimState.Settled));
        assertEq(arbiter.activeClaimOf(cid), 0);
        // Bond game settles normally: winners refunded, loser forfeits.
        assertEq(bond.balanceOf(policyholder), phBefore + MIN_BOND);
        assertEq(bond.balanceOf(thirdParty), tpBefore + MIN_BOND * 4 + MIN_BOND);
        // The external execution enforced exactly the winning answer.
        assertEq(manager.freeBalance(address(token), policyholder), (AMOUNT * 3000) / 10_000);
    }

    function testExecute_unwindsOnExternalStaleCancel() public {
        // THE ATTACK (#49, brick 2): nobody executes for challengeWindow + TTL
        // (e.g. forfeiture paused) and anyone stale-cancels the manager
        // proposal. Pre-fix every bond was locked forever; now the claim
        // unwinds and refunds all bonds.
        uint256 cid = _createCommitment();
        uint256 claimId = _proposeClaim(policyholder, cid, 3000, uint128(MIN_BOND));
        _dispute(disputer, claimId, 0, uint128(MIN_BOND * 2));
        _dispute(thirdParty, claimId, 3000, uint128(MIN_BOND * 4));

        vm.warp(block.timestamp + ANSWER_TIMEOUT + 1);
        arbiter.finalizeClaim(claimId); // -> Forfeiture

        vm.warp(block.timestamp + WINDOW + 14 days + 1);
        vm.prank(thirdParty);
        manager.cancelStaleForfeitProposal(cid);

        uint256 phBefore = bond.balanceOf(policyholder);
        uint256 dBefore = bond.balanceOf(disputer);
        uint256 tpBefore = bond.balanceOf(thirdParty);

        arbiter.executeClaim(claimId); // must NOT revert; unwinds instead

        OptimisticInsuranceArbiter.Claim memory c = arbiter.getClaim(claimId);
        assertEq(uint8(c.state), uint8(OptimisticInsuranceArbiter.ClaimState.Cancelled));
        assertEq(arbiter.activeClaimOf(cid), 0, "commitment freed for re-claim");
        // Nobody wins against an unenforceable ruling — every bond refunds.
        assertEq(bond.balanceOf(policyholder), phBefore + MIN_BOND);
        assertEq(bond.balanceOf(disputer), dBefore + MIN_BOND * 2);
        assertEq(bond.balanceOf(thirdParty), tpBefore + MIN_BOND * 4);
        assertEq(bond.balanceOf(address(arbiter)), 0, "no bond stranded");
    }

    function testDispute_afterExternalExecutionReverts() public {
        // Once the hold has been executed (only possible after the answer
        // timer fully elapsed), the dispute game is over — late disputes are
        // rejected instead of desyncing from the enforced result.
        uint256 cid = _createCommitment();
        uint256 claimId = _proposeClaim(policyholder, cid, 3000, uint128(MIN_BOND));

        vm.warp(block.timestamp + WINDOW + 1); // window == timeout elapsed
        vm.prank(thirdParty);
        manager.executeForfeit(cid);

        vm.prank(disputer);
        vm.expectRevert(abi.encodeWithSelector(OptimisticInsuranceArbiter.ClaimAlreadyEnforced.selector, claimId));
        arbiter.disputeClaim(claimId, 0, bytes32(0), uint128(MIN_BOND * 2));

        // finalizeClaim settles the bond game at the enforced answer.
        arbiter.finalizeClaim(claimId);
        OptimisticInsuranceArbiter.Claim memory c = arbiter.getClaim(claimId);
        assertEq(uint8(c.state), uint8(OptimisticInsuranceArbiter.ClaimState.Settled));
    }

    // =========================================================================
    // S11 — value-scaled bond floor (issue #57)
    // =========================================================================

    function testBondFloor_flatWhenBondBpsZero() public {
        uint256 cid = _createCommitment();
        assertEq(arbiter.bondFloor(cid, 10_000), MIN_BOND, "bondBps=0 keeps the flat floor");
    }

    function testBondFloor_scalesWithClaimValue() public {
        // 10% of the quoted claim value, tiny flat floor.
        OptimisticInsuranceArbiter scaled = new OptimisticInsuranceArbiter(
            address(manager), address(bond), 1e18, 1000, ANSWER_TIMEOUT, 10_000, address(0)
        );
        uint256 cid = _createAs(underwriter, _baseParams(address(scaled), policyholder, AMOUNT, MAX_PENALTY_BPS));

        // Claim of 5000 bps on 100e18 at index 1e18 => value 50e18; 10% => 5e18.
        uint256 floor = (AMOUNT / 2) / 10;
        assertEq(scaled.bondFloor(cid, MAX_PENALTY_BPS), floor);
        // Smaller claims scale down until the flat floor dominates.
        assertEq(scaled.bondFloor(cid, 100), 1e18, "flat minBond dominates small claims");

        vm.startPrank(policyholder);
        bond.approve(address(scaled), type(uint256).max);
        vm.expectRevert(abi.encodeWithSelector(OptimisticInsuranceArbiter.BondBelowFloor.selector, floor, floor - 1));
        scaled.proposeClaim(cid, MAX_PENALTY_BPS, bytes32(0), bytes32(0), uint128(floor - 1));

        uint256 claimId = scaled.proposeClaim(cid, MAX_PENALTY_BPS, bytes32(0), bytes32(0), uint128(floor));
        vm.stopPrank();
        assertEq(scaled.activeClaimOf(cid), claimId);
    }

    function testBondFloor_usesAdapterIndex() public {
        // An appreciating backing doubles the quoted claim value and thus the
        // scaled floor.
        MockIndexAdapter indexAdapter = new MockIndexAdapter();
        indexAdapter.setIndex(2e18);

        OptimisticInsuranceArbiter scaled = new OptimisticInsuranceArbiter(
            address(manager), address(bond), 1e18, 1000, ANSWER_TIMEOUT, 10_000, address(0)
        );
        ICM.CommitmentParams memory params = _baseParams(address(scaled), policyholder, AMOUNT, MAX_PENALTY_BPS);
        params.adapter = address(indexAdapter);
        uint256 cid = _createAs(underwriter, params);

        // 50e18 units claimed x index 2 => 100e18 value; 10% => 10e18.
        assertEq(scaled.bondFloor(cid, MAX_PENALTY_BPS), 10e18);
    }

    // =========================================================================
    // Known trade-off of the propose-time hold (documented in the contract
    // NatSpec): an executed 0-bps hold terminally closes the commitment.
    // =========================================================================

    function testExecute_externalZeroBpsExecutionClosesCommitment() public {
        // Once a 0-bps top-of-stack answer stands past the challenge window,
        // anyone (typically the committer) can execute the manager hold at
        // zero penalty — which terminally CLOSES the commitment, exiting
        // coverage without the unbonding period. This is the documented
        // liveness race: finalizeClaim, callable no later than the external
        // execute, instead cancels the hold and keeps the commitment alive
        // (see testFinalize_zeroAmountSettlesDirectly). This test pins the
        // lose-the-race outcome: the claim still settles cleanly, nothing
        // strands.
        uint256 cid = _createCommitment();
        uint256 claimId = _proposeClaim(policyholder, cid, 3000, uint128(MIN_BOND));
        _dispute(disputer, claimId, 0, uint128(MIN_BOND * 2));

        // WINDOW == ANSWER_TIMEOUT here, so the moment the 0-answer times out
        // the hold is also executable. The committer wins the race.
        vm.warp(block.timestamp + WINDOW + 1);
        vm.prank(underwriter);
        manager.executeForfeit(cid);

        ICM.Commitment memory cm = manager.getCommitment(cid);
        assertTrue(cm.forfeited, "commitment terminally closed at zero penalty");
        assertEq(manager.freeBalance(address(token), underwriter), DEPOSIT, "full backing back to committer");
        assertEq(manager.freeBalance(address(token), policyholder), 0, "no payout at 0 bps");

        // The bond game settles at the standing 0 answer; nothing strands.
        uint256 dBefore = bond.balanceOf(disputer);
        arbiter.finalizeClaim(claimId);
        OptimisticInsuranceArbiter.Claim memory c = arbiter.getClaim(claimId);
        assertEq(uint8(c.state), uint8(OptimisticInsuranceArbiter.ClaimState.Settled));
        assertEq(arbiter.activeClaimOf(cid), 0);
        // Disputer (0 answer) wins: refund + 50% of the forfeited proposer bond.
        assertEq(bond.balanceOf(disputer), dBefore + MIN_BOND * 2 + MIN_BOND / 2);
        assertEq(bond.balanceOf(address(arbiter)), 0, "no bond stranded");
    }
}
