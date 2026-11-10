// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import "forge-std/Test.sol";
import {ERC1967Proxy} from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";

import {CommitmentManager} from "src/core/manager/CommitmentManager.sol";
import {ICommitmentManager as ICM} from "src/core/interfaces/ICommitmentManager.sol";
import {StrategyBinding} from "src/core/interfaces/IDistributionStrategy.sol";
import {ERC20StaticAdapter} from "src/backing/ERC20StaticAdapter.sol";
import {MockERC20} from "../../helpers/MockERC20.sol";

/// @title PauseBudgetTest
/// @notice Conformance-fuzz suite for the "pause budget + window-classified clock-stop" amendment
///         (ERC §A.6 erratum / SUBSTRATE_CHANGES §1). Property VERIFICATION of the anti-griefing
///         defensive mechanism: a lifetime cumulative pause budget (`maxPauseDuration`) bounds the
///         time a pauser can credit against the protocol's CONSTRAINING windows (which elapse in
///         effective = wall − budget-clamped-pause time), while the LIVENESS backstops (stale-TTLs,
///         premium streams, agreement expiries) run on wall clock and are never stopped. The two
///         execute functions the flag gates are ALWAYS hard-blocked while paused, budget or not.
///
///         INV rows verified (SUBSTRATE_CHANGES §1 / PauseLib):
///           - INV-A60  budget: creditable ≤ maxPauseDuration, monotone; sawtooth accumulates; spent
///                      budget adds zero credit thereafter.
///           - INV-A61  classification: forfeit challenge (a), unbonding (b), deallocation (c),
///                      stale-TTL NOT stopped (d), commitment expiry (e), premium stream keeps
///                      accruing (f).
///           - INV-A62  overlap correctness: mid-pause record start credits only pause-after-start
///                      (a); two records over different episode subsets each accrue own overlap (b).
///           - INV-A63  anti-pin liveness ("pin"): committer escapes via stale-cancel then
///                      unbond, total wall time bounded by cw + budget + TTL + unbondingPeriod.
///         Plus: stale-cancel-abuse-of-honest-loss, re-init rate limit clock-stop, pause/unpause
///         idempotence, and maxPauseDuration == 0 ⇒ pure wall-clock (windows unaffected; hard-block
///         still applies).
contract PauseBudgetTest is Test {
    CommitmentManager internal manager;
    MockERC20 internal token;
    ERC20StaticAdapter internal adapter;

    address internal admin = makeAddr("admin");
    address internal pauser = makeAddr("pauser");
    address internal alice = makeAddr("alice"); // committer / member
    address internal arbiter = makeAddr("arbiter");
    address internal bob = makeAddr("bob"); // counterparty / beneficiary
    address internal policyholder = makeAddr("policyholder"); // funds premium

    uint64 internal constant UNBONDING = 7 days;
    uint64 internal constant BUDGET = 14 days; // maxPauseDuration
    uint64 internal constant WINDOW = 2 days; // commitment challenge window
    uint64 internal constant MUTUAL_WINDOW = 2 days; // mutual challenge + deallocation window
    uint64 internal constant FORFEIT_TTL = 14 days;
    uint64 internal constant MUTUAL_TTL = 7 days;
    uint64 internal constant REINIT = 1 hours;

    function setUp() public virtual {
        _deploy(BUDGET);
    }

    /// @dev Fresh manager with an explicit budget (so the maxPauseDuration==0 test can redeploy).
    function _deploy(uint64 budget) internal {
        CommitmentManager impl = new CommitmentManager();
        manager = CommitmentManager(
            address(
                new ERC1967Proxy(
                    address(impl), abi.encodeCall(CommitmentManager.initialize, (admin, UNBONDING, budget))
                )
            )
        );
        // PAUSER/UNPAUSER are separate roles (a single compromised key cannot both pause and refuse
        // to unpause); grant both to the same test `pauser` since we drive both sides.
        vm.startPrank(admin);
        manager.grantRole(manager.PAUSER_ROLE(), pauser);
        manager.grantRole(manager.UNPAUSER_ROLE(), pauser);
        vm.stopPrank();

        token = new MockERC20("Backing", "BCK", 18);
        adapter = new ERC20StaticAdapter();

        address[3] memory us = [alice, bob, policyholder];
        for (uint256 i; i < us.length; i++) {
            token.mint(us[i], 10_000_000e18);
            vm.startPrank(us[i]);
            token.approve(address(manager), type(uint256).max);
            manager.deposit(address(token), 10_000_000e18);
            vm.stopPrank();
        }
        // The policyholder funds premium straight from its WALLET (measured-receipt pull), never
        // from its deposited free balance — mirror PremiumIndex.t.sol. Give it wallet tokens on top.
        token.mint(policyholder, 10_000_000e18);
    }

    // =========================================================================
    // Helpers
    // =========================================================================

    function _pause() internal {
        vm.prank(pauser);
        manager.pauseForfeiture();
    }

    function _unpause() internal {
        vm.prank(pauser);
        manager.unpauseForfeiture();
    }

    function _creditable() internal view returns (uint64 creditable) {
        (,,,, creditable) = manager.pauseState();
    }

    function _params(uint256 amount, uint16 bps, uint64 expiresAt)
        internal
        view
        returns (ICM.CommitmentParams memory p)
    {
        p.arbiter = arbiter;
        p.counterparty = bob;
        p.token = address(token);
        p.adapter = address(adapter);
        p.amount = amount;
        p.maxPenaltyBps = bps;
        p.challengeWindow = WINDOW;
        p.expiresAt = expiresAt;
        p.strategies = new StrategyBinding[](0);
        p.metadataURI = "";
        p.metadataHash = bytes32(0);
    }

    function _create(uint256 amount, uint64 expiresAt) internal returns (uint256 id) {
        vm.prank(alice);
        id = manager.createCommitment(_params(amount, 10_000, expiresAt));
    }

    function _createMutual() internal returns (uint256 gid) {
        ICM.MutualParams memory p = ICM.MutualParams({
            arbiter: arbiter,
            numeraire: address(token),
            beneficiary: bob,
            challengeWindow: MUTUAL_WINDOW,
            deallocationWindow: MUTUAL_WINDOW
        });
        gid = manager.createMutual(p);
        vm.prank(arbiter);
        manager.activateMutual(gid);
    }

    function _join(uint256 gid, address who, uint256 amount) internal returns (uint256 cid) {
        ICM.CommitmentParams memory p = _params(amount, 10_000, 0);
        p.counterparty = bob; // == beneficiary
        vm.prank(who);
        cid = manager.joinMutual(gid, p);
    }

    // =========================================================================
    // INV-A60 — cumulative pause budget
    // =========================================================================

    /// @notice INV-A60: fuzz an arbitrary pause/unpause/warp sequence; `creditable` is always
    ///         ≤ maxPauseDuration and monotone non-decreasing across reads.
    function testFuzz_invA60_creditableClampedAndMonotone(uint256[8] calldata warps, uint8 opsSeed) public {
        uint64 prev = _creditable();
        assertEq(prev, 0, "starts at zero");
        for (uint256 i; i < warps.length; i++) {
            bool doPause = (opsSeed >> i) & 1 == 1;
            // Toggle the flag (idempotent no-op if already in state), warp, then re-read.
            if (doPause) _pause();
            else _unpause();
            vm.warp(block.timestamp + bound(warps[i], 1, 400 days));
            uint64 cur = _creditable();
            assertLe(cur, BUDGET, "INV-A60: creditable <= maxPauseDuration");
            assertGe(cur, prev, "INV-A60: creditable monotone non-decreasing");
            prev = cur;
        }
    }

    /// @notice INV-A60 (sawtooth): many short pause/unpause cycles accumulate against the budget
    ///         (they do NOT reset it), and once the budget is spent a constraining window matures on
    ///         pure wall clock (further pauses add zero credit).
    function test_invA60_sawtoothAccumulates_thenZeroCredit() public {
        // 20 cycles of 1-day pauses ⇒ 20 days requested, clamped to the 14-day budget.
        for (uint256 i; i < 20; i++) {
            _pause();
            vm.warp(block.timestamp + 1 days);
            _unpause();
            vm.warp(block.timestamp + 1 hours); // gap between cycles (no cooldown exists)
            if (i >= 13) {
                // once cumulativePaused ≥ budget the credit is pinned at the cap
                assertEq(_creditable(), BUDGET, "INV-A60: sawtooth accumulates to the cap, never resets");
            }
        }
        assertEq(_creditable(), BUDGET, "INV-A60: budget fully spent by sawtooth");

        // Budget spent: a forfeit challenge window opened now matures on pure wall clock.
        uint256 cid = _create(100e18, 0);
        vm.prank(arbiter);
        manager.initiateForfeit(cid, 10_000);
        uint256 initiatedAt = block.timestamp;

        // A further pause episode adds ZERO credit (budget already at the cap).
        _pause();
        vm.warp(block.timestamp + 30 days);
        _unpause();
        assertEq(_creditable(), BUDGET, "INV-A60: post-budget pause adds zero credit");

        // The challenge window is satisfied purely by wall clock elapsed since initiate.
        vm.warp(initiatedAt + WINDOW); // wall == initiatedAt + cw (still paused-time was uncredited)
        // Not paused now, so the hard-block does not apply; window has effectively run.
        manager.executeForfeit(cid);
        assertTrue(manager.getCommitment(cid).forfeited, "forfeit executes on pure wall clock post-budget");
    }

    // =========================================================================
    // INV-A61 — window classification
    // =========================================================================

    /// @notice INV-A61(a): forfeit challenge window clock-stops. executeForfeit reverts
    ///         ChallengeWindowActive until wall = initiatedAt + cw + min(P, budget), then succeeds.
    function testFuzz_invA61a_forfeitChallengeWindowClockStops(uint256 pSeed) public {
        uint64 p = uint64(bound(pSeed, 1 hours, 30 days));
        uint64 credited = p < BUDGET ? p : BUDGET; // min(P, budget)

        uint256 cid = _create(100e18, 0);
        vm.prank(arbiter);
        manager.initiateForfeit(cid, 10_000);
        uint256 initiatedAt = block.timestamp;

        // Pause for P then unpause. The window's effective clock stopped for min(P, budget).
        _pause();
        vm.warp(block.timestamp + p);
        _unpause();

        // Just before the effective end: still active.
        vm.warp(initiatedAt + WINDOW + credited - 1);
        vm.expectRevert(ICM.ChallengeWindowActive.selector);
        manager.executeForfeit(cid);

        // At the effective end: succeeds.
        vm.warp(initiatedAt + WINDOW + credited);
        manager.executeForfeit(cid);
        assertTrue(manager.getCommitment(cid).forfeited, "INV-A61a: executes at effective window end");
    }

    /// @notice INV-A61(b): the unbonding period clock-stops. finalizeUnbond only at
    ///         initiatedAt + unbondingPeriod + min(P, budget).
    function testFuzz_invA61b_unbondingPeriodClockStops(uint256 pSeed) public {
        uint64 p = uint64(bound(pSeed, 1 hours, 30 days));
        uint64 credited = p < BUDGET ? p : BUDGET;

        uint256 cid = _create(100e18, 0);
        vm.prank(alice);
        manager.requestUnbond(cid);
        uint256 initiatedAt = block.timestamp;

        _pause();
        vm.warp(block.timestamp + p);
        _unpause();

        uint256 matures = initiatedAt + UNBONDING + credited;
        vm.warp(matures - 1);
        vm.expectRevert(abi.encodeWithSelector(ICM.UnbondNotElapsed.selector, uint64(matures)));
        manager.finalizeUnbond(cid);

        vm.warp(matures);
        manager.finalizeUnbond(cid);
        assertTrue(manager.getCommitment(cid).released, "INV-A61b: finalizes at effective maturity");
    }

    /// @notice INV-A61(c): the deallocation window clock-stops. releaseMutualMember only after the
    ///         effective window (requestMutualExit anchor + deallocationWindow + min(P, budget)).
    function testFuzz_invA61c_deallocationWindowClockStops(uint256 pSeed) public {
        uint64 p = uint64(bound(pSeed, 1 hours, 30 days));
        uint64 credited = p < BUDGET ? p : BUDGET;

        uint256 gid = _createMutual();
        uint256 cid = _join(gid, alice, 100e18);
        vm.prank(alice);
        manager.requestMutualExit(cid);
        uint256 requestedAt = block.timestamp;

        _pause();
        vm.warp(block.timestamp + p);
        _unpause();

        vm.warp(requestedAt + MUTUAL_WINDOW + credited - 1);
        vm.expectRevert(ICM.DeallocationWindowActive.selector);
        manager.releaseMutualMember(cid);

        vm.warp(requestedAt + MUTUAL_WINDOW + credited);
        manager.releaseMutualMember(cid);
        assertTrue(manager.getCommitment(cid).released, "INV-A61c: releases at effective deallocation end");
    }

    /// @notice INV-A61(d): the stale-TTL is NOT clock-stopped. With the pause STILL ACTIVE the whole
    ///         time, cancelStaleForfeitProposal succeeds at initiatedAt + cw + min(elapsedPause,
    ///         budget) + TTL even though executeForfeit is still hard-blocked by the pause flag.
    function test_invA61d_staleTtlNotClockStopped_whilePaused() public {
        uint256 cid = _create(100e18, 0);
        vm.prank(arbiter);
        manager.initiateForfeit(cid, 10_000);
        uint256 initiatedAt = block.timestamp;

        // Pause and NEVER unpause. The pause elapses well past the budget.
        _pause();
        // Warp far enough that elapsedPause credit is capped at BUDGET.
        vm.warp(initiatedAt + WINDOW + BUDGET + FORFEIT_TTL);

        // executeForfeit is still hard-blocked while the flag is set (budget spent or not).
        vm.expectRevert(ICM.ForfeitureIsPaused.selector);
        manager.executeForfeit(cid);

        // But the stale cancel fires: anchor == initiatedAt + cw + min(elapsedPause, budget) + TTL.
        // Just before the anchor: still active.
        vm.warp(initiatedAt + WINDOW + BUDGET + FORFEIT_TTL - 1);
        vm.expectRevert(ICM.ChallengeWindowActive.selector);
        manager.cancelStaleForfeitProposal(cid);

        vm.warp(initiatedAt + WINDOW + BUDGET + FORFEIT_TTL);
        manager.cancelStaleForfeitProposal(cid);
        assertFalse(manager.getCommitment(cid).forfeited, "INV-A61d: stale cancel unpins without forfeiting");
    }

    /// @notice INV-A61(e): commitment expiry clock-stops. expireCommitment (committer self-release)
    ///         only at expiresAt + min(P, budget).
    function testFuzz_invA61e_commitmentExpiryClockStops(uint256 pSeed) public {
        uint64 p = uint64(bound(pSeed, 1 hours, 30 days));
        uint64 credited = p < BUDGET ? p : BUDGET;

        uint64 createdAt = uint64(block.timestamp);
        uint64 expiresAt = createdAt + 10 days;
        uint256 cid = _create(100e18, expiresAt);

        _pause();
        vm.warp(block.timestamp + p);
        _unpause();

        vm.warp(uint256(expiresAt) + credited - 1);
        vm.prank(alice);
        vm.expectRevert(ICM.CommitmentNotExpired.selector);
        manager.expireCommitment(cid);

        vm.warp(uint256(expiresAt) + credited);
        vm.prank(alice);
        manager.expireCommitment(cid);
        assertTrue(manager.getCommitment(cid).released, "INV-A61e: expires at effective expiry");
    }

    /// @notice INV-A61(f): the premium stream keeps accruing during a pause — "still at risk ⇒ still
    ///         paid". Fund a mutual premium stream, pause, warp; pendingMemberPremium grows.
    function test_invA61f_premiumStreamNotStopped_duringPause() public {
        uint256 gid = _createMutual();
        uint256 cid = _join(gid, alice, 100e18);

        vm.prank(policyholder);
        manager.fundMutualPremium(gid, 100e18, 100); // rate 1e18/s

        // Pause: the flag hard-blocks executes, but the premium clock is a LIVENESS backstop and
        // keeps running on wall clock.
        _pause();
        uint256 before = manager.pendingMemberPremium(cid);
        vm.warp(block.timestamp + 40);
        uint256 afterMid = manager.pendingMemberPremium(cid);
        assertGt(afterMid, before, "INV-A61f: premium accrues during pause");

        vm.warp(block.timestamp + 40);
        assertGt(manager.pendingMemberPremium(cid), afterMid, "INV-A61f: keeps accruing across the pause");
        _unpause();
        // The whole 100-unit stream is claimable once it has fully streamed, unaffected by the pause.
        vm.warp(block.timestamp + 100);
        assertEq(manager.pendingMemberPremium(cid), 100e18, "INV-A61f: full stream accrued, pause never stopped it");
    }

    // =========================================================================
    // INV-A62 — overlap correctness / mid-pause starts
    // =========================================================================

    /// @notice INV-A62(a): a record created MID-pause credits only the pause time AFTER its start.
    ///         Pause at t0, initiate forfeit at t0+X (still paused), unpause at t0+X+Y; the window
    ///         matures at initiate + cw + Y (NOT + X + Y).
    function testFuzz_invA62a_midPauseStartCreditsOnlyAfterStart(uint256 xSeed, uint256 ySeed) public {
        uint64 x = uint64(bound(xSeed, 1 hours, 5 days));
        uint64 y = uint64(bound(ySeed, 1 hours, 5 days)); // x + y ≤ 10 days < budget ⇒ no clamp

        uint256 cid = _create(100e18, 0);

        _pause();
        uint256 t0 = block.timestamp;
        vm.warp(t0 + x); // still paused
        vm.prank(arbiter);
        manager.initiateForfeit(cid, 10_000);
        uint256 initiatedAt = block.timestamp;
        vm.warp(t0 + x + y);
        _unpause();

        // Only Y of pause credit belongs to this window (the X before the record's snapshot is
        // excluded). So it matures at initiatedAt + cw + y, not + x + y.
        vm.warp(initiatedAt + WINDOW + y - 1);
        vm.expectRevert(ICM.ChallengeWindowActive.selector);
        manager.executeForfeit(cid);

        vm.warp(initiatedAt + WINDOW + y);
        manager.executeForfeit(cid);
        assertTrue(manager.getCommitment(cid).forfeited, "INV-A62a: only post-start pause credited");
    }

    /// @notice INV-A62(b): two records straddling different subsets of two pause episodes each
    ///         accrue exactly their own overlap. Fuzz the episode boundaries.
    ///
    ///         Timeline: R1 (forfeit on c1) opens at t=0. Episode-1 [a, a+d1] overlaps R1 fully.
    ///         R2 (forfeit on c2) opens at t = a+d1+g (between episodes). Episode-2 [b, b+d2]
    ///         overlaps BOTH. So R1's credit = d1 + d2, R2's credit = d2.
    function testFuzz_invA62b_twoRecordsDistinctOverlaps(uint256 aSeed, uint256 d1Seed, uint256 gSeed, uint256 d2Seed)
        public
    {
        uint64 a = uint64(bound(aSeed, 1 hours, 3 days)); // start of episode 1 (after R1 opens)
        uint64 d1 = uint64(bound(d1Seed, 1 hours, 3 days)); // episode-1 duration
        uint64 g = uint64(bound(gSeed, 1 hours, 3 days)); // gap after episode 1 before R2 opens
        uint64 d2 = uint64(bound(d2Seed, 1 hours, 3 days)); // episode-2 duration
        // Total pause d1 + d2 ≤ 6 days < budget ⇒ no clamp anywhere.

        uint256 c1 = _create(100e18, 0);
        uint256 c2 = _create(100e18, 0);

        // R1 opens at t=0.
        vm.prank(arbiter);
        manager.initiateForfeit(c1, 10_000);
        uint256 r1At = block.timestamp;

        // Episode 1: [r1At + a, r1At + a + d1]. Overlaps R1 (open) only; R2 not yet opened.
        vm.warp(r1At + a);
        _pause();
        vm.warp(block.timestamp + d1);
        _unpause();

        // R2 opens between episodes (gap g), snapshotting credit == d1 already spent.
        vm.warp(block.timestamp + g);
        vm.prank(arbiter);
        manager.initiateForfeit(c2, 10_000);
        uint256 r2At = block.timestamp;

        // Episode 2 overlaps BOTH open records.
        _pause();
        vm.warp(block.timestamp + d2);
        _unpause();

        // R1 credit == d1 + d2; R2 credit == d2 (the d1 before its snapshot is excluded).
        // R1 matures at r1At + cw + d1 + d2.
        vm.warp(r1At + WINDOW + d1 + d2 - 1);
        vm.expectRevert(ICM.ChallengeWindowActive.selector);
        manager.executeForfeit(c1);
        vm.warp(r1At + WINDOW + d1 + d2);
        manager.executeForfeit(c1);
        assertTrue(manager.getCommitment(c1).forfeited, "INV-A62b: R1 credited d1 + d2");

        // R2 matures at r2At + cw + d2 (already satisfied above if r2At + cw + d2 ≤ r1At+cw+d1+d2,
        // i.e. r2At ≤ r1At + d1 which holds since r2At = r1At + a + d1 + g > r1At + d1). So warp to
        // its own effective end explicitly and assert the boundary.
        // (r2At + cw + d2) vs current time (r1At + cw + d1 + d2): current may be before or after.
        uint256 r2End = r2At + WINDOW + d2;
        if (block.timestamp < r2End) {
            vm.warp(r2End - 1);
            vm.expectRevert(ICM.ChallengeWindowActive.selector);
            manager.executeForfeit(c2);
            vm.warp(r2End);
        }
        manager.executeForfeit(c2);
        assertTrue(manager.getCommitment(c2).forfeited, "INV-A62b: R2 credited only d2");
    }

    // =========================================================================
    // INV-A63 — anti-pin liveness (the "pin" case)
    // =========================================================================

    /// @notice INV-A63: adversarial pauser initiates a forfeit then pauses indefinitely (never
    ///         unpauses). The committer's escape: cancelStaleForfeitProposal becomes callable at
    ///         wall-clock initiatedAt + cw + budget + TTL at the latest (pause still active); after
    ///         the stale cancel, requestUnbond + finalizeUnbond complete while still paused; total
    ///         wall time from pin to funds-free is bounded by cw + budget + TTL + unbondingPeriod.
    function test_invA63_pinEscapeBounded() public {
        uint256 cid = _create(100e18, 0);

        // Adversary (arbiter, who here also holds the pauser role in the threat model) pins.
        vm.prank(arbiter);
        manager.initiateForfeit(cid, 10_000);
        uint256 pinAt = block.timestamp;
        _pause(); // and NEVER unpause

        // Escape step 1: stale cancel at initiatedAt + cw + budget + TTL (budget fully accrued while
        // paused, so the anchor sits at the maximum). Before that instant it is still active.
        uint256 staleAt = pinAt + WINDOW + BUDGET + FORFEIT_TTL;
        vm.warp(staleAt - 1);
        vm.expectRevert(ICM.ChallengeWindowActive.selector);
        manager.cancelStaleForfeitProposal(cid);
        vm.warp(staleAt);
        manager.cancelStaleForfeitProposal(cid);

        // Escape step 2: unbond while STILL paused. Budget already fully spent by the pin, so the
        // unbonding period accrues NO further credit — it matures on pure wall clock.
        vm.prank(alice);
        manager.requestUnbond(cid);
        uint256 unbondAt = block.timestamp;
        assertEq(_creditable(), BUDGET, "budget spent by the pin: no credit left for unbond");

        vm.warp(unbondAt + UNBONDING - 1);
        vm.expectRevert(abi.encodeWithSelector(ICM.UnbondNotElapsed.selector, uint64(unbondAt + UNBONDING)));
        manager.finalizeUnbond(cid);

        vm.warp(unbondAt + UNBONDING);
        manager.finalizeUnbond(cid); // succeeds while still paused (unbond is not the paused execute)
        assertTrue(manager.getCommitment(cid).released, "INV-A63: committer freed while still paused");
        assertEq(manager.freeBalance(address(token), alice), 10_000_000e18, "collateral fully returned");

        // Total wall time from pin to funds-free bounded by cw + budget + TTL + unbondingPeriod.
        uint256 totalWall = block.timestamp - pinAt;
        assertLe(totalWall, WINDOW + BUDGET + FORFEIT_TTL + UNBONDING, "INV-A63: escape horizon bounded");
    }

    // =========================================================================
    // Stale-cancel abuse of an HONEST mutual loss (spec named case)
    // =========================================================================

    /// @notice The mutual mirror of the pin: an arbiter initiates an HONEST loss; the adversary
    ///         pauses immediately for cw + MUTUAL_PROPOSAL_TTL (within budget). Pre-erratum,
    ///         cancelStaleMutualLoss would fire at initiatedAt + cw + TTL wall and delete the honest
    ///         loss. Under the erratum the anchor moved out by the pause credit, so the stale cancel
    ///         REVERTS at that moment; after unpause and the effective window, executeMutualLoss
    ///         succeeds. The re-init rate limit also clock-stops.
    function test_staleCancelAbuseOfHonestLoss_blocked_thenExecutes() public {
        uint256 gid = _createMutual();
        _join(gid, alice, 100e18);

        vm.prank(arbiter);
        manager.initiateMutualLoss(gid, 50e18, bytes32("ev"));
        uint256 initiatedAt = block.timestamp;

        // Adversary pauses immediately for cw + TTL (10 days ≤ budget ⇒ fully credited).
        _pause();
        uint64 pauseSpan = MUTUAL_WINDOW + MUTUAL_TTL; // 9 days
        vm.warp(initiatedAt + pauseSpan);
        _unpause();

        // Pre-erratum abuse moment: initiatedAt + cw + TTL wall. The anchor moved out by the credited
        // pause, so the stale cancel REVERTS — an honest loss cannot be stale-cancelled by a pause.
        vm.warp(initiatedAt + MUTUAL_WINDOW + MUTUAL_TTL);
        vm.expectRevert(ICM.MutualChallengeWindowActive.selector);
        manager.cancelStaleMutualLoss(gid);

        // The challenge window elapsed in effective time (pauseSpan credited), so executeMutualLoss
        // succeeds once wall reaches initiatedAt + cw + min(pauseSpan, budget).
        vm.warp(initiatedAt + MUTUAL_WINDOW + pauseSpan);
        manager.executeMutualLoss(gid);
        assertGt(manager.getMutual(gid).cumulativeLoss, 0, "honest loss executed after effective window");
    }

    /// @notice Re-init rate limit clock-stops: after a stale cancel DURING a pause, the arbiter can
    ///         re-initiate one EFFECTIVE hour later — the paused hour does not count toward the
    ///         MIN_REINIT_INTERVAL.
    function test_reinitRateLimitClockStops() public {
        uint256 gid = _createMutual();
        _join(gid, alice, 100e18);

        // First declaration, then let it go TTL-stale on wall clock, cancel it.
        vm.prank(arbiter);
        manager.initiateMutualLoss(gid, 50e18, bytes32("ev1"));
        uint256 initiatedAt = block.timestamp;
        vm.warp(initiatedAt + MUTUAL_WINDOW + MUTUAL_TTL);
        manager.cancelStaleMutualLoss(gid);

        // Now pause. The re-init interval (anchored at lastInitiatedAt via the resolved proposal's
        // snapshot) must elapse in EFFECTIVE time. Pause for 1 hour: it should NOT count.
        _pause();
        vm.warp(block.timestamp + REINIT); // one paused hour
        // Effective elapsed since lastInitiatedAt is (wall − pauseCredit). The paused hour is
        // credited, so effective interval < REINIT ⇒ re-init too soon.
        // But wall elapsed since lastInitiatedAt already includes the pre-pause TTL span... the
        // re-init anchor is lastInitiatedAt (== initiatedAt), so effective elapsed = wall − credit.
        // wall since initiatedAt = MUTUAL_WINDOW + MUTUAL_TTL + REINIT; credit = REINIT (the paused
        // hour). effective = MUTUAL_WINDOW + MUTUAL_TTL, which is >> REINIT ⇒ re-init IS allowed.
        // To isolate the clock-stop, re-anchor: cancel-stale already reset nothing; instead assert
        // the credited hour is excluded by comparing against a fresh, immediate re-init.
        _unpause();
        // Re-initiate: the (long) wall gap since the last initiate dominates, so this succeeds — the
        // point proven separately below is that a paused span does NOT count as elapsed interval.
        vm.prank(arbiter);
        manager.initiateMutualLoss(gid, 50e18, bytes32("ev2"));
        uint256 secondAt = block.timestamp;

        // Immediately cancel the fresh proposal, then a pause covering the whole re-init interval
        // must still block re-init: a paused span does NOT count as elapsed effective interval.
        vm.prank(arbiter);
        manager.cancelMutualLoss(gid);
        _pause();
        vm.warp(secondAt + REINIT + 1 hours); // wall well past REINIT
        // Effective elapsed = wall − pauseCredit. Pause started at secondAt (right after cancel);
        // credit == (REINIT + 1 hours). effective == 0 < REINIT ⇒ re-init too soon.
        vm.prank(arbiter);
        vm.expectRevert(ICM.ReinitTooSoon.selector);
        manager.initiateMutualLoss(gid, 50e18, bytes32("ev3"));

        // Unpause, then let ONE effective hour pass ⇒ re-init allowed.
        _unpause();
        vm.warp(block.timestamp + REINIT);
        vm.prank(arbiter);
        manager.initiateMutualLoss(gid, 50e18, bytes32("ev4"));
        assertGt(manager.getMutual(gid).lastInitiatedAt, secondAt, "re-init allowed one effective hour later");
    }

    // =========================================================================
    // Idempotence
    // =========================================================================

    /// @notice pause/unpause idempotence: a double pause does NOT reset the episode start (credit
    ///         keeps accruing from the FIRST pause's start); a double unpause is a no-op.
    function test_pauseUnpauseIdempotence() public {
        _pause();
        uint256 firstPauseAt = block.timestamp;
        (, uint64 pausedAt0,,,) = manager.pauseState();
        assertEq(pausedAt0, uint64(firstPauseAt), "episode start recorded");

        vm.warp(block.timestamp + 3 days);
        // Second pause while already paused: must be a no-op (episode start unchanged).
        _pause();
        (, uint64 pausedAt1,,,) = manager.pauseState();
        assertEq(pausedAt1, uint64(firstPauseAt), "double pause does not reset the episode start");

        // Credit at this instant reflects 3 days from the FIRST start, not zero.
        assertEq(_creditable(), 3 days, "credit accrues from the first pause, not the second");

        vm.warp(block.timestamp + 2 days);
        _unpause();
        assertEq(_creditable(), 5 days, "5 days total credited (single continuous episode)");

        // Double unpause: no-op, cumulativePaused unchanged.
        uint64 credAfterFirstUnpause = _creditable();
        _unpause();
        assertEq(_creditable(), credAfterFirstUnpause, "double unpause is a no-op");
    }

    // =========================================================================
    // maxPauseDuration == 0 ⇒ pure wall-clock; hard-block still applies
    // =========================================================================

    /// @notice A manager initialized with maxPauseDuration == 0 gives pure wall-clock behaviour:
    ///         windows are unaffected by pausing (zero credit), while executeForfeit is STILL
    ///         hard-blocked whenever the flag is set.
    function test_zeroBudget_pureWallClock_butHardBlockApplies() public {
        _deploy(0); // redeploy with a zero budget

        uint256 cid = _create(100e18, 0);
        vm.prank(arbiter);
        manager.initiateForfeit(cid, 10_000);
        uint256 initiatedAt = block.timestamp;

        // Pause for a long time: credits NOTHING (zero budget).
        _pause();
        vm.warp(block.timestamp + 30 days);
        assertEq(_creditable(), 0, "zero-budget: pause credits nothing");

        // Hard-block still applies while the flag is set, even though the window has run on wall.
        vm.warp(initiatedAt + WINDOW + 1);
        vm.expectRevert(ICM.ForfeitureIsPaused.selector);
        manager.executeForfeit(cid);

        // Unpause: the window matured purely on wall clock (pause never stopped it), so it executes
        // immediately with no extra credit added.
        _unpause();
        manager.executeForfeit(cid);
        assertTrue(manager.getCommitment(cid).forfeited, "zero-budget window ran on pure wall clock");
    }
}
