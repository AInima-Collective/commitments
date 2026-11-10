// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import "forge-std/Test.sol";
import {ERC1967Proxy} from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

import {CommitmentManager} from "src/core/manager/CommitmentManager.sol";
import {ICommitmentManager as ICM} from "src/core/interfaces/ICommitmentManager.sol";
import {StrategyBinding} from "src/core/interfaces/IDistributionStrategy.sol";
import {MockERC20} from "../../helpers/MockERC20.sol";

/// @dev Fee-on-transfer / deflationary ERC-20: every non-mint/non-burn transfer skims `feeBps`
///      to a sink, so the recipient receives strictly less than `value`. Used to prove the
///      measured-receipt funding path (INV-P1) credits the delta that ARRIVED, not the amount
///      requested.
contract FeeOnTransferToken is ERC20 {
    address internal constant SINK = address(0xFEE);
    uint256 public immutable feeBps;

    constructor(uint256 feeBps_) ERC20("Fee", "FEE") {
        feeBps = feeBps_;
    }

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }

    function _update(address from, address to, uint256 value) internal override {
        if (from != address(0) && to != address(0) && feeBps != 0) {
            uint256 fee = (value * feeBps) / 10_000;
            super._update(from, to, value - fee);
            if (fee != 0) super._update(from, SINK, fee);
        } else {
            super._update(from, to, value);
        }
    }
}

/// @title PremiumIndexTest
/// @notice INV-P0..P10 of the Mutual premium index (Π) asserted as CHECKED properties.
///         The premium index is a second MasterChef accumulator over the live-deliverable-cover
///         denominator `activeCover` (NEVER `totalShares`), funded by a Synthetix stream out of a
///         segregated `funded − claimed` reserve (the fourth partition compartment). These tests
///         exercise the reward half against the (already-audited, frozen) loss half and lock:
///         pool == funded−claimed (P0), extended partition (P1), funding-time solvency + NoActiveCover
///         (P2), poke-before-stake-change non-retroactivity (P5/P8), exact dual-track activeCover with
///         Belt-2 asserted inert (P9), zombie-freeness (P4/P4b), dust conservation, overflow
///         failure-isolation (P10), and settleAndClaim == the two separate calls.
contract PremiumIndexTest is Test {
    CommitmentManager internal manager;
    MockERC20 internal token; // homogeneous numeraire
    MockERC20 internal other; // a second numeraire for the multi-mutual test

    address internal admin = makeAddr("admin");
    address internal arbiter = makeAddr("mutualArbiter");
    address internal beneficiary = makeAddr("beneficiary");
    address internal adapter = makeAddr("adapter");
    address internal policyholder = makeAddr("policyholder"); // funds premium from its WALLET

    address internal u1 = makeAddr("u1");
    address internal u2 = makeAddr("u2");
    address internal u3 = makeAddr("u3");

    uint64 internal constant MUTUAL_WINDOW = 2 days;
    uint64 internal constant MEMBER_WINDOW = 1 days;
    uint256 internal constant PI_ONE = 1e27;

    /// @dev Tracked member commitment ids of the most-recently-built mutual (for Σ effCover walks).
    uint256[] internal gCids;

    struct PS {
        uint256 pi;
        uint128 activeCover;
        uint256 settledTotal;
        uint128 rewardRate;
        uint64 lastUpdate;
        uint64 periodFinish;
        uint256 remainder;
        uint256 banked;
        uint256 pool;
    }

    function setUp() public {
        CommitmentManager impl = new CommitmentManager();
        manager = CommitmentManager(
            address(
                new ERC1967Proxy(address(impl), abi.encodeCall(CommitmentManager.initialize, (admin, 7 days, 14 days)))
            )
        );
        token = new MockERC20("Numeraire", "NUM", 18);
        other = new MockERC20("Other", "OTH", 18);

        address[3] memory us = [u1, u2, u3];
        for (uint256 i; i < us.length; i++) {
            token.mint(us[i], 1_000_000e18);
            other.mint(us[i], 1_000_000e18);
            vm.startPrank(us[i]);
            token.approve(address(manager), type(uint256).max);
            other.approve(address(manager), type(uint256).max);
            manager.deposit(address(token), 1_000_000e18);
            manager.deposit(address(other), 1_000_000e18);
            vm.stopPrank();
        }
        // Policyholder funds premium straight from its wallet (measured-receipt pull), never deposits.
        token.mint(policyholder, 1_000_000e18);
        other.mint(policyholder, 1_000_000e18);
        vm.startPrank(policyholder);
        token.approve(address(manager), type(uint256).max);
        other.approve(address(manager), type(uint256).max);
        vm.stopPrank();
    }

    // =========================================================================
    // Helpers
    // =========================================================================

    // Field-specific getters: a single 9-tuple destructure into a memory struct trips solc's
    // stack-too-deep without via-ir, so each field is read in isolation.
    function _pi(uint256 g) internal view returns (uint256 r) {
        (r,,,,,,,,) = manager.getMutualPremiumState(g);
    }

    function _activeCover(uint256 g) internal view returns (uint128 r) {
        (, r,,,,,,,) = manager.getMutualPremiumState(g);
    }

    function _settledTotal(uint256 g) internal view returns (uint256 r) {
        (,, r,,,,,,) = manager.getMutualPremiumState(g);
    }

    function _rewardRate(uint256 g) internal view returns (uint128 r) {
        (,,, r,,,,,) = manager.getMutualPremiumState(g);
    }

    function _periodFinish(uint256 g) internal view returns (uint64 r) {
        (,,,,, r,,,) = manager.getMutualPremiumState(g);
    }

    function _remainder(uint256 g) internal view returns (uint256 r) {
        (,,,,,, r,,) = manager.getMutualPremiumState(g);
    }

    function _banked(uint256 g) internal view returns (uint256 r) {
        (,,,,,,, r,) = manager.getMutualPremiumState(g);
    }

    function _pool(uint256 g) internal view returns (uint256 r) {
        (,,,,,,,, r) = manager.getMutualPremiumState(g);
    }

    function _ps(uint256 gid) internal view returns (PS memory s) {
        s.pi = _pi(gid);
        s.activeCover = _activeCover(gid);
        s.settledTotal = _settledTotal(gid);
        s.rewardRate = _rewardRate(gid);
        s.periodFinish = _periodFinish(gid);
        s.remainder = _remainder(gid);
        s.banked = _banked(gid);
        s.pool = _pool(gid);
    }

    function _createMutual(MockERC20 numeraire) internal returns (uint256 gid) {
        ICM.MutualParams memory p = ICM.MutualParams({
            arbiter: arbiter,
            numeraire: address(numeraire),
            beneficiary: beneficiary,
            challengeWindow: MUTUAL_WINDOW,
            deallocationWindow: MUTUAL_WINDOW
        });
        gid = manager.createMutual(p);
        vm.prank(arbiter);
        manager.activateMutual(gid);
    }

    function _join(uint256 gid, MockERC20 numeraire, address who, uint256 amount, uint16 bps)
        internal
        returns (uint256 cid)
    {
        ICM.CommitmentParams memory p;
        p.arbiter = arbiter;
        p.counterparty = beneficiary;
        p.token = address(numeraire);
        p.adapter = adapter;
        p.amount = amount;
        p.maxPenaltyBps = bps;
        p.challengeWindow = MEMBER_WINDOW;
        p.strategies = new StrategyBinding[](0);
        vm.prank(who);
        cid = manager.joinMutual(gid, p);
        gCids.push(cid);
    }

    function _fund(uint256 gid, uint256 amount, uint64 duration) internal {
        vm.prank(policyholder);
        manager.fundMutualPremium(gid, amount, duration);
    }

    function _declareAndExecute(uint256 gid, uint256 loss) internal {
        vm.prank(arbiter);
        manager.initiateMutualLoss(gid, loss, bytes32("ev"));
        vm.warp(block.timestamp + MUTUAL_WINDOW + 1);
        manager.executeMutualLoss(gid);
    }

    /// @dev Recompute `effCover_i` the contract way: min(E_i−settled, c.amount).
    function _effCover(uint256 cid) internal view returns (uint256) {
        ICM.Membership memory m = manager.getMembership(cid);
        if (m.mutualId == 0) return 0;
        uint256 deliverable = m.forfeitableUnits - m.settledUnits;
        uint256 amt = manager.getCommitment(cid).amount;
        return amt < deliverable ? amt : deliverable;
    }

    /// @dev INV-P9 (exact, dual-tracked) + Belt-2 inert: activeCover == totalShares − settledTotal
    ///      == Σ effCover, and for every live member the Belt-2 `min(·, c.amount)` clamp never bites.
    function _assertP9(uint256 gid) internal view {
        PS memory s = _ps(gid);
        uint256 totalShares = manager.getMutual(gid).totalShares;
        assertEq(uint256(s.activeCover), totalShares - s.settledTotal, "P9: activeCover == totalShares - settledTotal");

        uint256 sumEff;
        for (uint256 i; i < gCids.length; i++) {
            uint256 cid = gCids[i];
            ICM.Membership memory m = manager.getMembership(cid);
            if (m.mutualId != gid) continue; // released / not in this mutual
            // Belt-2 inert: the remaining liability is always fully deliverable in homogeneous v1.
            assertLe(m.forfeitableUnits - m.settledUnits, manager.getCommitment(cid).amount, "P9: Belt-2 clamp inert");
            sumEff += _effCover(cid);
        }
        assertEq(uint256(s.activeCover), sumEff, "P9: activeCover == sum effCover");
    }

    /// @dev INV-P1 (extended partition) on `numeraire`, single premium-funded mutual `gid`.
    function _assertP1(uint256 gid, MockERC20 numeraire) internal view {
        (uint256 free, uint256 enc, uint256 esc) = manager.ledgerTotals(address(numeraire));
        assertEq(
            free + enc + esc + _ps(gid).pool,
            numeraire.balanceOf(address(manager)),
            "INV-P1: free+enc+esc+pool == balanceOf"
        );
    }

    /// @dev INV-P2 (Synthetix solvency): rewardRate·(periodFinish−lastUpdate) + Σ rewardBank ≤ pool.
    function _assertP2(uint256 gid) internal view {
        PS memory s = _ps(gid);
        uint256 streamable =
            block.timestamp < s.periodFinish ? (uint256(s.periodFinish) - block.timestamp) * uint256(s.rewardRate) : 0;
        // lastUpdate ≤ now; the strongest at-rest form uses (periodFinish − lastUpdate) but `banked`
        // already absorbed [lastUpdate, now); future-streamable from now plus banked must fit the pool.
        assertLe(streamable + s.banked, s.pool, "INV-P2: future-streamable + banked <= pool");
    }

    // =========================================================================
    // INV-P0 — pool == funded − claimed; _pokePremium NEVER writes the pool
    // =========================================================================

    function test_invP0_pokeNeverWritesPool_claimMovesItExactly() public {
        uint256 gid = _createMutual(token);
        uint256 c1 = _join(gid, token, u1, 100e18, 10_000);

        _fund(gid, 100e18, 100); // rate 1e18/s, periodFinish = now+100
        assertEq(_ps(gid).pool, 100e18, "pool == funded");

        // A pure poke (requestMutualExit banks but moves NO pool) must leave the pool untouched (INV-P0).
        vm.warp(block.timestamp + 50);
        uint256 poolBefore = _ps(gid).pool;
        vm.prank(u1);
        manager.requestMutualExit(c1);
        assertGt(_ps(gid).banked, 0, "poke banked accrual");
        assertEq(_ps(gid).pool, poolBefore, "INV-P0: poke does not write the pool");

        // The claim is the ONLY debit: pool decreases by EXACTLY the recipient's free credit.
        uint256 cFree = manager.freeBalance(address(token), u1);
        uint256 paid = _ps(gid).banked;
        manager.claimMemberPremium(c1);
        assertEq(poolBefore - _ps(gid).pool, paid, "pool debit == amount paid (funded - claimed)");
        assertEq(manager.freeBalance(address(token), u1) - cFree, paid, "recipient credited the pool debit");
        _assertP1(gid, token);
    }

    // =========================================================================
    // INV-P2 — funding-time solvency guard + NoActiveCover
    // =========================================================================

    function test_invP2_fundWithoutActiveCover_reverts() public {
        uint256 gid = _createMutual(token); // active, but no members ⇒ activeCover == 0
        vm.prank(policyholder);
        vm.expectRevert(ICM.NoActiveCover.selector);
        manager.fundMutualPremium(gid, 100e18, 100);
    }

    function test_invP2_solvencyGuardHoldsAcrossFundingAndTopUp() public {
        uint256 gid = _createMutual(token);
        _join(gid, token, u1, 100e18, 10_000);
        _join(gid, token, u2, 50e18, 10_000);

        _fund(gid, 300e18, 300);
        _assertP2(gid);
        _assertP1(gid, token);

        // Top-up mid-stream rolls the leftover; the guard (== INV-P2 at funding time) still holds.
        vm.warp(block.timestamp + 100);
        _fund(gid, 150e18, 200);
        _assertP2(gid);
        _assertP1(gid, token);

        // And after the stream ends.
        vm.warp(block.timestamp + 1_000);
        _assertP2(gid);
    }

    // =========================================================================
    // S6 — permissionless funding guards: no rate dilution/stall, bounded durations,
    // uint64-safe periodFinish (regression for issue #52)
    // =========================================================================

    /// @dev The S6 attack: `fundMutualPremium(gid, 1 wei, hugeDuration)` mid-stream re-spreads the
    ///      leftover over an arbitrary window, collapsing `rewardRate` to 0 (integer division) and
    ///      stalling underwriter premium. The live-stream rate guard must kill it, leaving the
    ///      original stream fully intact.
    function test_fundGrief_oneWeiHugeDurationDilution_reverts_streamUnharmed() public {
        uint256 gid = _createMutual(token);
        uint256 c1 = _join(gid, token, u1, 100e18, 10_000);
        _fund(gid, 100e18, 100); // rate 1e18/s, periodFinish = now+100
        uint64 finishBefore = _periodFinish(gid);

        // A permissionless griefer (NOT the policyholder) funds 1 wei over 30 days mid-stream.
        address griefer = makeAddr("griefer");
        token.mint(griefer, 1e18);
        vm.startPrank(griefer);
        token.approve(address(manager), type(uint256).max);
        vm.expectRevert(ICM.PremiumRateDecreased.selector);
        manager.fundMutualPremium(gid, 1, 30 days);
        vm.stopPrank();

        // Stream untouched: same rate, same deadline, and the full 100e18 still accrues (no stall).
        assertEq(uint256(_rewardRate(gid)), 1e18, "rate unchanged by the failed grief");
        assertEq(_periodFinish(gid), finishBefore, "periodFinish unchanged by the failed grief");
        vm.warp(block.timestamp + 100);
        assertEq(manager.pendingMemberPremium(c1), 100e18, "sole member still earns the whole stream");
    }

    /// @dev Legitimate top-ups: mid-stream funding at >= the live rate succeeds; anything that would
    ///      lower the rate (even a real-money underfund) reverts `PremiumRateDecreased`.
    function test_fundTopUp_atLiveRateSucceeds_belowLiveRateReverts() public {
        uint256 gid = _createMutual(token);
        _join(gid, token, u1, 100e18, 10_000);
        _fund(gid, 100e18, 100); // rate 1e18/s

        vm.warp(block.timestamp + 50); // leftover = 50e18 over the remaining 50s
        // 49e18 over 100s => newRate = (49e18 + 50e18)/100 = 0.99e18/s < 1e18/s: rejected.
        vm.prank(policyholder);
        vm.expectRevert(ICM.PremiumRateDecreased.selector);
        manager.fundMutualPremium(gid, 49e18, 100);

        // 50e18 over 100s => newRate = (50e18 + 50e18)/100 = exactly the live rate: accepted.
        _fund(gid, 50e18, 100);
        assertEq(uint256(_rewardRate(gid)), 1e18, "rate maintained by the at-rate top-up");
        assertEq(uint256(_periodFinish(gid)), block.timestamp + 100, "deadline rolled to now+duration");
        _assertP2(gid);
        _assertP1(gid, token);
    }

    /// @dev `duration` is bounded to [MIN_STREAM_DURATION, MAX_STREAM_DURATION]; both boundary values
    ///      are accepted, everything outside (including the old `duration == 0`) reverts.
    function test_fundDurationBounds_outsideReverts_boundariesAccepted() public {
        uint256 gid = _createMutual(token);
        _join(gid, token, u1, 100e18, 10_000);

        vm.startPrank(policyholder);
        vm.expectRevert(ICM.StreamDurationOutOfBounds.selector);
        manager.fundMutualPremium(gid, 100e18, 0);
        vm.expectRevert(ICM.StreamDurationOutOfBounds.selector);
        manager.fundMutualPremium(gid, 100e18, 1 minutes - 1);
        vm.expectRevert(ICM.StreamDurationOutOfBounds.selector);
        manager.fundMutualPremium(gid, 100e18, 365 days + 1);
        manager.fundMutualPremium(gid, 60e18, 1 minutes); // floor boundary accepted (rate 1e18/s)
        vm.stopPrank();

        vm.warp(block.timestamp + 1 minutes); // let the stream finish so the rate guard is moot
        _fund(gid, 100e18, 365 days); // ceiling boundary accepted
        assertEq(uint256(_periodFinish(gid)), block.timestamp + 365 days, "ceiling stream scheduled");
    }

    /// @dev `periodFinish` is computed in uint256 and MUST revert instead of truncating into the past
    ///      when `now + duration` no longer fits uint64 (the related-low truncation bug).
    function test_fundPeriodFinish_uint64Truncation_reverts() public {
        uint256 gid = _createMutual(token);
        _join(gid, token, u1, 100e18, 10_000);

        vm.warp(uint256(type(uint64).max) - 100); // any in-bounds duration now overflows the deadline
        vm.prank(policyholder);
        vm.expectRevert(ICM.StreamDurationOutOfBounds.selector);
        manager.fundMutualPremium(gid, 100e18, 1 hours);
    }

    // =========================================================================
    // INV-P5 / INV-P8 — poke before every stake change; no retroactive accrual
    // =========================================================================

    function test_invP8_freshJoinerEarnsNoRetroactivePremium() public {
        uint256 gid = _createMutual(token);
        _join(gid, token, u1, 100e18, 10_000);
        _join(gid, token, u2, 100e18, 10_000);

        _fund(gid, 200e18, 200); // rate 1e18/s, activeCover 200e18
        vm.warp(block.timestamp + 100); // Π = mulDiv(100*1e18, 1e27, 200e18) = 5e26

        // A joiner is poked-in at the CURRENT Π, so its snapshot == Π and it owes nothing retroactive.
        uint256 c3 = _join(gid, token, u3, 100e18, 10_000);
        assertEq(manager.getMembership(c3).premiumSnapshot, _ps(gid).pi, "snapshot == Pi at join (INV-P5)");
        assertEq(manager.pendingMemberPremium(c3), 0, "INV-P8: no retroactive accrual to a fresh joiner");

        // It DOES earn from here forward.
        vm.warp(block.timestamp + 100);
        assertGt(manager.pendingMemberPremium(c3), 0, "fresh joiner earns on subsequent stream");
        _assertP9(gid);
    }

    function test_streaming_proRataAndNonRetroactive() public {
        uint256 gid = _createMutual(token);
        uint256 c1 = _join(gid, token, u1, 100e18, 10_000);
        uint256 c2 = _join(gid, token, u2, 100e18, 10_000);

        _fund(gid, 200e18, 200); // rate 1e18/s
        // Right after funding, before any time passes: zero accrued (INV-P5, future-rate only).
        assertEq(manager.pendingMemberPremium(c1), 0, "no premium before time passes");

        vm.warp(block.timestamp + 100);
        // Π = 5e26; each 100e18-cover member earns mulDiv(100e18, 5e26, 1e27) = 50e18.
        assertEq(manager.pendingMemberPremium(c1), 50e18, "c1 pro-rata");
        assertEq(manager.pendingMemberPremium(c2), 50e18, "c2 pro-rata");
        _assertP9(gid);
        _assertP1(gid, token);
    }

    // =========================================================================
    // INV-P9 — exact dual-track activeCover after EVERY op, Belt-2 inert
    // =========================================================================

    function test_invP9_exactAfterEveryOp() public {
        uint256 gid = _createMutual(token);
        uint256 c1 = _join(gid, token, u1, 100e18, 10_000);
        _assertP9(gid);
        uint256 c2 = _join(gid, token, u2, 80e18, 5_000); // E_i = 40e18
        _assertP9(gid);

        _fund(gid, 140e18, 140);
        _assertP9(gid);

        vm.warp(block.timestamp + 70);
        manager.claimMemberPremium(c1);
        _assertP9(gid);

        // A loss shrinks deliverable cover; activeCover must track it exactly.
        _declareAndExecute(gid, 70e18); // totalShares 140e18 ⇒ Λ = 0.5e18
        manager.settleMemberLoss(c1); // owed 50e18
        _assertP9(gid);
        manager.settleMemberLoss(c2); // owed 20e18
        _assertP9(gid);

        // Exit + release removes a member from BOTH denominators; still exact.
        vm.prank(u1);
        manager.requestMutualExit(c1);
        _assertP9(gid);
        vm.warp(block.timestamp + MUTUAL_WINDOW + 1);
        manager.releaseMutualMember(c1);
        _assertP9(gid);

        _assertP1(gid, token);
    }

    // =========================================================================
    // INV-P4 / INV-P4b — no zombie free-riding
    // =========================================================================

    function test_invP4_fullySettledMemberEarnsZero() public {
        uint256 gid = _createMutual(token);
        uint256 c1 = _join(gid, token, u1, 100e18, 10_000);

        _fund(gid, 100e18, 100); // entire stream accrues to the sole member
        _declareAndExecute(gid, 100e18); // Λ = 1e18 ⇒ fully settled

        manager.settleMemberLoss(c1);
        assertEq(manager.getMembership(c1).settledUnits, 100e18, "fully settled");
        assertEq(_effCover(c1), 0, "INV-P4: fully-settled effCover == 0");
        assertEq(_ps(gid).activeCover, 0, "activeCover drained to zero");

        uint256 banked = _ps(gid).banked; // the whole 100e18 stream, banked at settle
        uint256 pendingAfter = manager.pendingMemberPremium(c1);
        // Far future: a zero-effCover member accrues nothing further.
        vm.warp(block.timestamp + 10_000);
        assertEq(manager.pendingMemberPremium(c1), pendingAfter, "INV-P4: no further accrual once effCover == 0");
        assertEq(pendingAfter, banked, "pending == banked (no live accrual)");
    }

    function test_invP4b_otherMutualsLossDoesNotLeakIntoPremium() public {
        // Mutual A (token) pays premium; mutual B (other) is pure-loss. u1 holds one member commitment
        // in EACH. Draining the mutual-B commitment's amount to zero must not touch mutual A's premium
        // denominator — the multi-mutual mini-zombie is structurally absent (one commitment per mutual).
        uint256 gA = _createMutual(token);
        uint256 cA = _join(gA, token, u1, 100e18, 10_000);
        _fund(gA, 100e18, 100);

        delete gCids; // gB members tracked separately below; keep _assertP9(gA) walking only cA
        gCids.push(cA);

        uint256 gB = _createMutual(other);
        ICM.CommitmentParams memory p;
        p.arbiter = arbiter;
        p.counterparty = beneficiary;
        p.token = address(other);
        p.adapter = adapter;
        p.amount = 100e18;
        p.maxPenaltyBps = 10_000;
        p.challengeWindow = MEMBER_WINDOW;
        p.strategies = new StrategyBinding[](0);
        vm.prank(u1);
        uint256 cB = manager.joinMutual(gB, p);

        uint256 effA_before = _effCover(cA);

        // Drain mutual B fully: cB.amount -> 0.
        _declareAndExecute(gB, 100e18);
        manager.settleMemberLoss(cB);
        assertEq(manager.getCommitment(cB).amount, 0, "mutual-B commitment drained");

        // Mutual A is untouched: same effCover, exact dual-track, Belt-2 still inert.
        assertEq(_effCover(cA), effA_before, "INV-P4b: other mutual's loss does not change A's effCover");
        _assertP9(gA);
        _assertP1(gA, token);
    }

    // =========================================================================
    // Dust — remainder carry conserves value (no over-distribution)
    // =========================================================================

    function test_dustConservation_remainderCarry() public {
        // Three unit-cover members and an indivisible stream force a non-zero premiumRemainder.
        uint256 gid = _createMutual(token);
        uint256 c1 = _join(gid, token, u1, 1, 10_000); // E_i = 1
        uint256 c2 = _join(gid, token, u2, 1, 10_000);
        uint256 c3 = _join(gid, token, u3, 1, 10_000);
        assertEq(_ps(gid).activeCover, 3, "activeCover == 3");

        _fund(gid, 61, 61); // 61 units over 61s (rate 1/s); 61 is not divisible by activeCover 3
        vm.warp(block.timestamp + 61);

        uint256[] memory ids = new uint256[](3);
        (ids[0], ids[1], ids[2]) = (c1, c2, c3);
        manager.claimMembersPremium(ids);

        // Each member earns floor(61/3) == 20; the leftover 1 unit is carried as remainder dust.
        assertEq(manager.freeBalance(address(token), u1), 1_000_000e18 - 1 + 20, "u1 paid 20");
        assertEq(_ps(gid).remainder, 1, "1 unit of dust carried");
        assertLt(_ps(gid).remainder, _ps(gid).activeCover, "dust < activeCover");
        // Conservation: 60 distributed + 1 dust still in the pool == 61 funded. Nothing created/lost.
        assertEq(_ps(gid).pool, 1, "pool == undistributed dust");
        _assertP1(gid, token);
    }

    // =========================================================================
    // INV-P10 — overflow failure-isolation; loss leg never bricks
    // =========================================================================

    function testFuzz_invP10_largeActiveCoverNoRevert(uint128 eiSeed, uint256 fundSeed, uint64 durSeed) public {
        // Seed activeCover near uint128 max and a large numeraire stream; assert no revert anywhere
        // and the dust stays below activeCover/1e27 (INV-P10 intermediate-safety in practice).
        uint256 ei = bound(uint256(eiSeed), 1e30, uint256(type(uint128).max) - 1);
        uint256 fundAmt = bound(fundSeed, 1e18, 1e36);
        uint64 dur = uint64(bound(uint256(durSeed), 1 minutes, 365 days));

        address whale = makeAddr("whale");
        token.mint(whale, ei);
        vm.startPrank(whale);
        token.approve(address(manager), type(uint256).max);
        manager.deposit(address(token), ei);
        vm.stopPrank();

        uint256 gid = _createMutual(token);
        uint256 cid = _join(gid, token, whale, ei, 10_000); // E_i == ei, activeCover == ei
        assertEq(_ps(gid).activeCover, ei, "activeCover seeded to ei");

        token.mint(policyholder, fundAmt);
        _fund(gid, fundAmt, dur);

        vm.warp(block.timestamp + dur); // poke the whole stream

        // A real poke (claim) must not revert even at the extreme; dust bound holds.
        manager.claimMemberPremium(cid);
        PS memory s = _ps(gid);
        assertLe(s.remainder, uint256(s.activeCover) / 1e27 + 1, "INV-P10: dust < activeCover/1e27 (+1 rounding)");

        // The loss leg is failure-isolated: a settle ALWAYS applies the collateral move, never reverts
        // on a premium-arithmetic edge. Declare a full loss and settle.
        _declareAndExecute(gid, ei);
        manager.settleMemberLoss(cid); // must not revert
        assertGt(manager.getMembership(cid).settledUnits, 0, "loss leg applied (not bricked)");
    }

    // =========================================================================
    // settleAndClaim == settleMemberLoss + claimMemberPremium (independent CEI passes)
    // =========================================================================

    function test_settleAndClaim_equalsSeparateCalls() public {
        uint256 gid = _createMutual(token);
        uint256 c1 = _join(gid, token, u1, 100e18, 10_000);
        _join(gid, token, u2, 100e18, 10_000);

        _fund(gid, 200e18, 200);
        _declareAndExecute(gid, 50e18); // Λ = 0.25e18; c1 owes 25e18 (stream fully accrued by execute)

        uint256 snap = vm.snapshotState();

        manager.settleAndClaim(c1);
        uint256 benA = manager.freeBalance(address(token), beneficiary);
        uint256 comA = manager.freeBalance(address(token), u1);
        uint256 setA = manager.getMembership(c1).settledUnits;
        uint256 poolA = _ps(gid).pool;
        uint256 acA = _ps(gid).activeCover;
        uint256 amtA = manager.getCommitment(c1).amount;

        vm.revertToState(snap);

        manager.settleMemberLoss(c1);
        manager.claimMemberPremium(c1);
        assertEq(manager.freeBalance(address(token), beneficiary), benA, "beneficiary identical");
        assertEq(manager.freeBalance(address(token), u1), comA, "committer identical");
        assertEq(manager.getMembership(c1).settledUnits, setA, "settledUnits identical");
        assertEq(_ps(gid).pool, poolA, "pool identical");
        assertEq(_ps(gid).activeCover, acA, "activeCover identical");
        assertEq(manager.getCommitment(c1).amount, amtA, "residual amount identical");
    }

    // =========================================================================
    // Reclaim-then-loss must NOT under-pay premium already earned while fully covered
    // (INV-P7 floor==ceiling; regression for the settle bank-gate finding)
    // =========================================================================

    function test_reclaimThenLoss_paysFullPreLossPremium() public {
        uint256 gid = _createMutual(token);
        uint256 c1 = _join(gid, token, u1, 100e18, 10_000); // E_i = 100e18, effCover 100e18
        uint256 c2 = _join(gid, token, u2, 100e18, 10_000); // activeCover = 200e18

        _fund(gid, 200e18, 200); // rate 1e18/s
        vm.warp(block.timestamp + 100); // Π = mulDiv(100e18, 1e27, 200e18) = 5e26; each member earned 50e18

        // Beneficiary reclaims: rewardRate -> 0 with Π FROZEN at 5e26 (the un-banked accrual is still owed).
        vm.prank(beneficiary);
        manager.reclaimPremium(gid);
        assertEq(uint256(_rewardRate(gid)), 0, "stream halted");
        assertEq(_pi(gid), 5e26, "Pi frozen at its reclaim value");

        // A loss now slashes everyone 50% (Λ = 0.5e18). Settling u1 must bank its premium at the PRE-loss
        // effCover (100e18) before the loss shrinks it — not the post-loss effCover (50e18).
        _declareAndExecute(gid, 100e18); // headroom 200e18, applied 100e18 => Λ = 0.5e18
        manager.settleMemberLoss(c1);

        uint256 c1Before = manager.freeBalance(address(token), u1);
        manager.claimMemberPremium(c1);
        uint256 c1Paid = manager.freeBalance(address(token), u1) - c1Before;
        assertEq(c1Paid, 50e18, "u1 collects the full 50e18 it earned while fully covered (not 25e18)");

        // u2 (never settled) still collects its fair 50e18; total distributed == 100e18 earned.
        uint256 c2Before = manager.freeBalance(address(token), u2);
        manager.claimMemberPremium(c2);
        assertEq(manager.freeBalance(address(token), u2) - c2Before, 50e18, "u2 collects its 50e18");

        // Pool drained to zero by the two claims (100e18 earned), reclaim refunded the other 100e18.
        assertEq(_ps(gid).pool, 0, "pool fully accounted: 100e18 claimed + 100e18 reclaimed == 200e18 funded");
        _assertP1(gid, token);
        _assertP2(gid);
    }

    // =========================================================================
    // Fee-on-transfer numeraire — measured-receipt funding credits the DELTA
    // =========================================================================

    function test_feeOnTransfer_fundingCreditsMeasuredDelta() public {
        FeeOnTransferToken fot = new FeeOnTransferToken(1_000); // 10% fee

        // u1 posts FOT collateral (deposit also credits the measured delta).
        fot.mint(u1, 1_000e18);
        vm.startPrank(u1);
        fot.approve(address(manager), type(uint256).max);
        manager.deposit(address(fot), 1_000e18); // receives 900e18 free
        vm.stopPrank();

        ICM.MutualParams memory gp = ICM.MutualParams({
            arbiter: arbiter,
            numeraire: address(fot),
            beneficiary: beneficiary,
            challengeWindow: MUTUAL_WINDOW,
            deallocationWindow: MUTUAL_WINDOW
        });
        uint256 gid = manager.createMutual(gp);
        vm.prank(arbiter);
        manager.activateMutual(gid);

        ICM.CommitmentParams memory p;
        p.arbiter = arbiter;
        p.counterparty = beneficiary;
        p.token = address(fot);
        p.adapter = adapter;
        p.amount = 100e18;
        p.maxPenaltyBps = 10_000;
        p.challengeWindow = MEMBER_WINDOW;
        p.strategies = new StrategyBinding[](0);
        vm.prank(u1);
        manager.joinMutual(gid, p);

        // Fund 100e18; only 90e18 ARRIVES (10% skimmed). The pool/rate must reflect the delta.
        fot.mint(policyholder, 100e18);
        vm.startPrank(policyholder);
        fot.approve(address(manager), type(uint256).max);
        manager.fundMutualPremium(gid, 100e18, 100);
        vm.stopPrank();

        assertEq(_ps(gid).pool, 90e18, "pool credits the measured 90e18, not 100e18");
        assertEq(uint256(_ps(gid).rewardRate), 90e18 / 100, "rate uses the received delta");

        // INV-P1 closes on the ACTUAL balance (free 800e18 + enc 100e18 + pool 90e18 == 990e18 held).
        (uint256 free, uint256 enc, uint256 esc) = manager.ledgerTotals(address(fot));
        assertEq(free + enc + esc + _ps(gid).pool, fot.balanceOf(address(manager)), "INV-P1 on FOT actual balance");
    }
}
