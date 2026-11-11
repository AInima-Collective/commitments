// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import {ICommitmentManager as ICM} from "src/core/interfaces/ICommitmentManager.sol";
import {CommitmentManagerStorage} from "src/core/manager/storage/CommitmentManagerStorage.sol";
import {CommitmentLifecycleLib} from "src/core/manager/libraries/CommitmentLifecycleLib.sol";
import {LedgerLib} from "src/core/manager/libraries/LedgerLib.sol";
import {ExposureLib} from "src/core/manager/libraries/ExposureLib.sol";
import {PauseLib} from "src/core/manager/libraries/PauseLib.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";
import {SafeCast} from "@openzeppelin/contracts/utils/math/SafeCast.sol";
import {MeasuredPull} from "src/shared/utilities/MeasuredPull.sol";

/// @title MutualLib
/// @notice The shared-loss-index ("Mutual" / Mutual) primitive — a manager-level
///         accounting overlay that decouples **custody** (each member's own exogenous, individually
///         held collateral) from **attribution** (a single shared loss index `Lambda`). A validated
///         loss bumps `Lambda` in one O(1) write; each member then settles its dimensionless
///         fraction of its **own** raw token units lazily and permissionlessly, reusing the existing
///         balance-conserving `LedgerLib.forfeitTransfer`. Economically: Lloyd's several liability
///         with a shared loss ratio. See the Mutuals standard (ERC-COMMITMENTS-MUTUALS).
/// @dev A fourth external delegatecall library, peer to CommitmentLifecycleLib / MovementLib /
///      AgreementLib. It deliberately does NOT refactor the twice-audited single-commitment forfeit
///      path; it shares only the low-level helpers (`forfeitTransfer`, `ExposureLib`). `msg.sender`,
///      `address(this)`, and event sourcing are preserved under delegatecall.
///
///      Math (corrected vs. the research note): the index denominator `totalShares` changes ONLY on
///      join / release, NEVER on loss (the MasterChef `accRewardPerShare` discipline). Each loss does
///      `Lambda += applied * 1e18 / totalShares` with `applied = min(L, headroom)` so `Lambda` is hard
///      capped at 1e18 — a third loss past full coverage is clamped and the shortfall emitted, never
///      silently over-attributed.
library MutualLib {
    /// @dev 1e18-scaled fully-attributed loss fraction (Lambda == 1 means 100% of every E_i owed).
    uint256 internal constant LAMBDA_ONE = 1e18;
    /// @dev A loss that leaves no more than this much of the 1e18 loss fraction exhausts the mutual
    ///      (see `executeMutualLoss`). Each executed loss rounds its Lambda step down, so a mutual
    ///      wiped out by several declarations ends a few units short of LAMBDA_ONE and an exact
    ///      comparison would never fire. A billionth of cover is below anything a joiner could
    ///      usefully owe.
    uint256 internal constant EXHAUSTION_DUST = 1e9;
    /// @dev 1e27 precision for the premium-per-cover index `Pi` (Synthetix-style; higher than Lambda's
    ///      1e18 because premium streams continuously over a possibly-large `activeCover` denominator,
    ///      so per-second deltas must not round to zero). `premiumRemainder` carries the sub-1e27 dust.
    uint256 internal constant PI_ONE = 1e27;
    /// @dev Mutual challenge-window floor — strictly longer than the per-commitment >=1-day floor,
    ///      because one declaration moves the whole mutual (the Mutuals dispute model).
    uint64 internal constant MUTUAL_MIN_CHALLENGE_WINDOW = 2 days;
    /// @dev Grace after the window during which a stale (abandoned) declaration can be force-cancelled.
    uint64 internal constant MUTUAL_PROPOSAL_TTL = 7 days;
    /// @dev Re-initiation rate-limit: caps the initiate->cancel->re-initiate capital-freeze griefing.
    uint64 internal constant MIN_REINIT_INTERVAL = 1 hours;
    /// @dev Premium stream duration floor for a fresh stream. A live stream's end never moves earlier
    ///      (see `fundMutualPremium`), so a short duration cannot compress one.
    uint64 internal constant MIN_STREAM_DURATION = 1 minutes;
    /// @dev Premium stream duration ceiling — together with the live-stream rate guard this bounds how
    ///      far one funding can push `periodFinish` and keeps `nowTs + duration` trivially uint64-safe.
    uint64 internal constant MAX_STREAM_DURATION = 365 days;
    /// @dev `totalShares` is uint128; reject joins that would overflow the denominator at join time.
    uint128 internal constant MAX_TOTAL_SHARES = type(uint128).max;

    // =========================================================================
    // Mutual lifecycle
    // =========================================================================

    /// @notice Create a Mutual (permissionless — the caller names the arbiter). Starts
    ///         inactive. Every member posts `numeraire`, and its weight is its forfeitable
    ///         allotment `E_i`.
    function createMutual(CommitmentManagerStorage.Layout storage s, ICM.MutualParams calldata p)
        external
        returns (uint256 mutualId)
    {
        if (p.arbiter == address(0) || p.numeraire == address(0) || p.beneficiary == address(0)) {
            revert ICM.ZeroAddress();
        }
        if (p.challengeWindow < MUTUAL_MIN_CHALLENGE_WINDOW) revert ICM.MutualChallengeWindowTooShort();
        if (p.deallocationWindow < p.challengeWindow) revert ICM.DeallocationWindowTooShort();

        mutualId = s.nextMutualId++; // seeded to 1 in `initialize` (0 is the not-a-member sentinel)

        ICM.Mutual storage g = s.mutuals[mutualId];
        g.arbiter = p.arbiter;
        g.numeraire = p.numeraire;
        g.beneficiary = p.beneficiary;
        g.challengeWindow = p.challengeWindow;
        g.deallocationWindow = p.deallocationWindow;

        emit ICM.MutualCreated(mutualId, p.arbiter, p.numeraire, p.beneficiary);
    }

    /// @notice Arbiter flips an inactive, non-terminal mutual active (no losses until active).
    function activateMutual(CommitmentManagerStorage.Layout storage s, uint256 mutualId) external {
        ICM.Mutual storage g = _mutual(s, mutualId);
        if (msg.sender != g.arbiter) revert ICM.NotMutualArbiter();
        if (g.terminal) revert ICM.MutualIsTerminal();
        g.active = true;
        emit ICM.MutualActivated(mutualId);
    }

    // =========================================================================
    // Join — mutual-aware create that freezes the member's weight
    // =========================================================================

    /// @notice Create a fresh commitment (committer = caller) and join it to `mutualId`, freezing
    ///         `E_i` (its `totalShares` weight). The member must post the mutual's numeraire.
    ///         Member commitments may bind NO strategies (the cover leg carries no hooks; premium
    ///         is a separate, unpooled periphery leg) — this makes the
    ///         "no FromEncumbered drift / no forfeit-reactive hook" guarantee structural (OBJ-7).
    function joinMutual(
        CommitmentManagerStorage.Layout storage s,
        uint256 mutualId,
        ICM.CommitmentParams calldata params
    ) external returns (uint256 commitmentId) {
        ICM.Mutual storage g = _mutual(s, mutualId);
        if (!g.active || g.terminal) revert ICM.MutualNotActive();
        if (g.exhausted) revert ICM.MutualExhausted(); // wiped out: a joiner could never owe
        if (_lossLive(s.mutualLossProposals[mutualId])) revert ICM.MutualLossPending(); // capacity frozen during a declaration
        if (params.arbiter != g.arbiter) revert ICM.MutualArbiterMismatch();
        if (params.counterparty != g.beneficiary) revert ICM.MutualBeneficiaryMismatch(); // no forfeit-to-self
        if (params.strategies.length != 0) revert ICM.MemberStrategyForbidden();
        if (params.token != g.numeraire) revert ICM.NumeraireMismatch();

        // E_i = the member's frozen forfeitable allotment — the loss base (raw units of its token).
        uint256 ei = ExposureLib.exposureOf(params.amount, params.maxPenaltyBps);
        if (ei == 0) revert ICM.InvalidCreditedValue(); // a member with zero forfeitable capacity is pointless

        if (ei > MAX_TOTAL_SHARES) revert ICM.TotalSharesOverflow();
        // forge-lint: disable-next-line(unsafe-typecast)
        uint128 credited = uint128(ei); // checked just above

        // Reuse the audited create path verbatim (committer = caller).
        commitmentId = CommitmentLifecycleLib.createFull(s, params);

        // Register the membership + freeze its weight (extracted to bound stack depth).
        _registerMember(s, g, mutualId, commitmentId, ei);

        emit ICM.MemberJoined(mutualId, commitmentId, msg.sender, credited, ei);
    }

    /// @dev Post-create membership registration: grow `totalShares` (loss denominator), freeze the
    ///      membership row, and initialize the premium side (poke + snapshot + `activeCover` add).
    ///      Extracted from `joinMutual` purely to bound stack depth. A member's `totalShares` weight
    ///      (`forfeitableUnits == E_i`) moves ONLY on join / release — never on loss.
    function _registerMember(
        CommitmentManagerStorage.Layout storage s,
        ICM.Mutual storage g,
        uint256 mutualId,
        uint256 commitmentId,
        uint256 ei
    ) private {
        uint256 newTotal = uint256(g.totalShares) + ei;
        if (newTotal > MAX_TOTAL_SHARES) revert ICM.TotalSharesOverflow();
        g.totalShares = uint128(newTotal);

        // The commitment id is fresh, so its membership row is all zero: write only the non-zero
        // fields (settledUnits, unbondRequestedAt, the exit snapshot and rewardBank start at zero).
        ICM.Membership storage m = s.membership[commitmentId];
        // Mutual ids count up from 1, one per `createMutual` call, so they cannot reach 2^64.
        // forge-lint: disable-next-line(unsafe-typecast)
        m.mutualId = uint64(mutualId);
        m.forfeitableUnits = ei;
        // No-retroactive-loss: liable only for future Lambda growth. Lambda <= 1e18 < 2^64.
        uint256 lambda = g.cumulativeLoss;
        if (lambda != 0) m.lossSnapshot = SafeCast.toUint64(lambda);

        // Premium side: poke BEFORE mutating `activeCover` (MasterChef discipline, INV-P8), then add the
        // member's deliverable cover to the denominator. A fresh member has `settledUnits == 0` and
        // `c.amount >= E_i`, so `effCover == E_i` — exact, no Belt-2 clamp bite.
        _initMemberPremium(g, m, s.commitments[commitmentId]);
    }

    // =========================================================================
    // Two-phase mutual loss — Lambda bumps once, at execute
    // =========================================================================

    /// @notice Phase 1: mutual arbiter declares a loss `L`, starting the mutual challenge window and
    ///         freezing joins/exits. Rate-limited so initiate->cancel churn is not a free capital trap.
    /// @dev TRUST BOUNDARY (red-team #4): the arbiter is trusted to declare honestly. A malicious
    ///      arbiter can keep members' capital frozen by repeatedly declaring losses it never executes
    ///      (each freezes joins/exits for >= challengeWindow). The MIN_REINIT_INTERVAL caps churn; the
    ///      pluggable bonded periphery arbiter (OptimisticMutualArbiter — bond slashed on a committee
    ///      veto) is the economic deterrent. Members must therefore choose a mutual's arbiter as
    ///      carefully as a commitment's arbiter; this is the same single-arbiter trust the protocol
    ///      already carries per-commitment, scaled to the mutual.
    function initiateMutualLoss(
        CommitmentManagerStorage.Layout storage s,
        uint256 mutualId,
        uint256 lossNumeraire,
        bytes32 evidenceHash
    ) external {
        ICM.Mutual storage g = _mutual(s, mutualId);
        if (msg.sender != g.arbiter) revert ICM.NotMutualArbiter();
        if (!g.active || g.terminal) revert ICM.MutualNotActive();
        if (lossNumeraire == 0) revert ICM.ZeroAmount();
        ICM.MutualLossProposal storage prior = s.mutualLossProposals[mutualId];
        if (_lossLive(prior)) revert ICM.MutualLossPending();
        // Rate-limit only RE-initiation (a prior proposal exists — proposals are overwritten,
        // never deleted): caps the initiate->cancel->re-init capital-freeze griefing without
        // blocking the first honest declaration. Clock-stop (ERC §A.6 erratum): the interval
        // elapses in effective time from the prior proposal's start. An honest arbiter whose
        // declaration went TTL-stale during a pause re-initiates one effective interval after
        // the unpause.
        if (
            prior.initiatedAt != 0
                && PauseLib.effectiveElapsed(s, prior.initiatedAt, prior.cumulativePausedAtStart) < MIN_REINIT_INTERVAL
        ) revert ICM.ReinitTooSoon();

        s.mutualLossProposals[mutualId] = ICM.MutualLossProposal({
            lossNumeraire: lossNumeraire,
            initiatedAt: uint64(block.timestamp),
            evidenceHash: evidenceHash,
            executed: false,
            cancelled: false,
            cumulativePausedAtStart: PauseLib.creditablePaused(s)
        });

        emit ICM.MutualLossInitiated(mutualId, lossNumeraire, evidenceHash, msg.sender);
    }

    /// @notice Phase 2: anyone, after the window. Bumps `Lambda` once by the clamped loss fraction.
    function executeMutualLoss(CommitmentManagerStorage.Layout storage s, uint256 mutualId) external {
        ICM.Mutual storage g = _mutual(s, mutualId);
        ICM.MutualLossProposal storage p = s.mutualLossProposals[mutualId];
        if (!_lossLive(p)) revert ICM.NoMutualLossPending();
        // Clock-stop (ERC §A.6 erratum): the mutual challenge window elapses in effective time —
        // a pause cannot shrink the members' contest time while the execute below is inoperable.
        if (PauseLib.effectiveElapsed(s, p.initiatedAt, p.cumulativePausedAtStart) < g.challengeWindow) {
            revert ICM.MutualChallengeWindowActive();
        }
        if (s.forfeiturePaused) revert ICM.ForfeitureIsPaused(); // reuse the §A.6 circuit breaker

        p.executed = true;
        uint256 declared = p.lossNumeraire;

        // Empty mutual (all members exited): record the full shortfall and wind the mutual down
        // terminally rather than leaving the declaration wedged forever.
        if (g.totalShares == 0) {
            g.terminal = true;
            _terminalSweep(s, g, mutualId); // recover any stranded premium reserve (INV-P1 closes at zero)
            emit ICM.MutualLossShortfall(mutualId, declared);
            emit ICM.MutualLossExecuted(mutualId, 0, g.cumulativeLoss);
            emit ICM.MutualTerminated(mutualId);
            return;
        }

        // headroom = the maximum further numeraire loss the clamp permits at the current Lambda.
        uint256 headroom = ((LAMBDA_ONE - g.cumulativeLoss) * g.totalShares) / LAMBDA_ONE;
        uint256 applied = declared > headroom ? headroom : declared;

        // Fixed-denominator additive index — denominator is totalShares, unchanged by the loss.
        // Cannot pass LAMBDA_ONE: applied <= (LAMBDA_ONE - Lambda) * totalShares / LAMBDA_ONE, and
        // both divisions round down.
        g.cumulativeLoss += (applied * LAMBDA_ONE) / g.totalShares;

        // Wiped out: the loss took everything the index could still deliver, or left no more than
        // dust of the fraction. From here a joiner could owe next to nothing while earning on its
        // whole stake, so the mutual takes no joins and no premium; members still settle, claim
        // and release. Lambda alone cannot say this: the last step's rounding is lost in whole
        // numeraire units, which on a small mutual leaves a gap far above the dust.
        if (declared >= headroom || LAMBDA_ONE - g.cumulativeLoss <= EXHAUSTION_DUST) g.exhausted = true;

        if (applied < declared) emit ICM.MutualLossShortfall(mutualId, declared - applied);
        emit ICM.MutualLossExecuted(mutualId, applied, g.cumulativeLoss);
    }

    /// @notice Arbiter cancel of a pending declaration.
    function cancelMutualLoss(CommitmentManagerStorage.Layout storage s, uint256 mutualId) external {
        ICM.Mutual storage g = _mutual(s, mutualId);
        if (msg.sender != g.arbiter) revert ICM.NotMutualArbiter();
        ICM.MutualLossProposal storage p = s.mutualLossProposals[mutualId];
        if (!_lossLive(p)) revert ICM.NoMutualLossPending();
        p.cancelled = true;
        emit ICM.MutualLossCancelled(mutualId, false);
    }

    /// @notice Permissionless force-cancel of an abandoned declaration after window + TTL.
    function cancelStaleMutualLoss(CommitmentManagerStorage.Layout storage s, uint256 mutualId) external {
        ICM.Mutual storage g = _mutual(s, mutualId);
        ICM.MutualLossProposal storage p = s.mutualLossProposals[mutualId];
        if (!_lossLive(p)) revert ICM.NoMutualLossPending();
        // ANTI-PIN (ERC §A.6 erratum): see PauseLib.staleAt — a pause can neither stale-cancel an
        // HONEST loss whose contest window never effectively ran, nor pin members behind an
        // abandoned declaration beyond the budget-bounded horizon.
        if (
            block.timestamp
                < PauseLib.staleAt(s, p.initiatedAt, g.challengeWindow, p.cumulativePausedAtStart, MUTUAL_PROPOSAL_TTL)
        ) {
            revert ICM.MutualChallengeWindowActive();
        }
        p.cancelled = true;
        emit ICM.MutualLossCancelled(mutualId, true);
    }

    // =========================================================================
    // Lazy, permissionless, O(1)-per-member settlement
    // =========================================================================

    /// @notice Settle one member's accrued share of the shared loss (permissionless). Strict CEI:
    ///         the exposure decrement and the balance-conserving ledger move are the only effects,
    ///         and member commitments carry no hooks, so there is no external-call reentrancy
    ///         surface. K deferred losses collapse into one settle (reads the current Lambda).
    ///         It also clears a lapsed exit request, so anyone can take a member that will not
    ///         leave out of `exitingCover` (INV-P11).
    function settleMemberLoss(CommitmentManagerStorage.Layout storage s, uint256 commitmentId) public {
        ICM.Membership storage m = s.membership[commitmentId];
        uint256 mutualId = m.mutualId;
        if (mutualId == 0) revert ICM.NotMutualMember();
        ICM.Mutual storage g = s.mutuals[mutualId];
        ICM.Commitment storage c = s.commitments[commitmentId];

        // A lapsed request can no longer release, so its cover is staying: clear it at the cover it
        // was counted at (before any loss below shrinks it; the loss leg then sees no request).
        if (m.unbondRequestedAt != 0 && _exitLapsed(s, m, g)) {
            m.unbondRequestedAt = 0;
            m.memberExitCumulativePausedAtStart = 0;
            // forge-lint: disable-next-line(unsafe-typecast)
            g.exitingCover -= uint128(_effCover(m, c)); // effCover <= exitingCover (INV-P11)
            emit ICM.MemberExitLapsed(mutualId, commitmentId);
        }

        uint256 lambda = g.cumulativeLoss;
        if (lambda == m.lossSnapshot) return; // nothing new to settle (idempotent for batch convenience)

        // ---- Premium: poke and bank on the OLD effCover BEFORE the loss shrinks it (INV-P8
        // poke-before-change). Unconditional: the stored `Pi` is stale whenever the stream is live and
        // nobody has poked since this member's last sync, so comparing it with the snapshot cannot tell
        // whether the member has unbanked accrual. Skipping here would attribute the interval since the
        // last poke to post-loss cover and under-pay this member. `_syncMember` short-circuits when the
        // index is frozen, and its bank arithmetic cannot overflow (see `_accrue`), so the loss legs
        // below always execute (INV-P10).
        _syncMember(g, m, c);
        // The DENOMINATOR maintenance below is UNCONDITIONAL, not gated. `activeCover`/`settledTotal`
        // must track every loss even while unfunded, because (a) `joinMutual` and `releaseMutualMember`
        // mutate them unconditionally — so a gated settle would leave `settledTotal` stale-low and make
        // `releaseMutualMember`'s `settledTotal -= settledUnits` UNDERFLOW (bricking the member's exit) —
        // and (b) a stale-high `activeCover` would make a later `fundMutualPremium` stream over an
        // inflated denominator, under-paying underwriters (INV-P9 exactness). Capture effOld live.
        uint256 effOld = _effCover(m, c);

        uint256 owed = (m.forfeitableUnits * (lambda - m.lossSnapshot)) / LAMBDA_ONE; // round DOWN (Σ <= L)

        // Belt 1: never exceed the member's remaining frozen liability (INV-G3).
        uint256 remaining = m.forfeitableUnits - m.settledUnits;
        if (owed > remaining) owed = remaining;
        // Belt 2: never exceed the live commitment amount. `forfeitTransfer` checks the AGGREGATE
        // encumbered balance, while the mutual accounts per-commitment `c.amount`; this clamp is
        // load-bearing for a user holding multiple member commitments on one token (OBJ-12).
        if (owed > c.amount) owed = c.amount;

        if (owed > 0) {
            // INV-G9: forfeitable drops by `owedUnits`, as does the encumbered balance in the
            // transfer below (keeps the per-commitment gap invariant).
            ExposureLib.decrement(s, c.committer, c.token, owed);
            // Balance-conserving: encumbered[committer] -> free[beneficiary]. REUSED, untouched.
            LedgerLib.forfeitTransfer(s, c.token, c.committer, g.beneficiary, owed);
            m.settledUnits += owed;
            c.amount -= owed; // residual stays encumbered; the commitment SURVIVES (may take future losses)

            // Dual-track the premium denominator EXACTLY (INV-P9): the loss reduced deliverable cover by
            // `effOld − effNew`, so shrink `activeCover` by that delta and grow `settledTotal` by `owed`,
            // keeping `activeCover == totalShares − settledTotal == Σ effCover` — funded or not.
            // owed <= E_i, and settledTotal stays <= totalShares <= uint128 max.
            // forge-lint: disable-next-line(unsafe-typecast)
            g.settledTotal += uint128(owed);
            // forge-lint: disable-next-line(unsafe-typecast)
            uint128 shrink = uint128(effOld - _effCover(m, c)); // effOld >= effNew, both <= E_i
            g.activeCover -= shrink;
            if (m.unbondRequestedAt != 0) g.exitingCover -= shrink; // an exiting member's cover shrinks too (INV-P11)
        }
        m.lossSnapshot = SafeCast.toUint64(lambda); // Lambda <= 1e18 < 2^64

        emit ICM.MemberSettled(mutualId, commitmentId, owed, lambda);
    }

    /// @notice Batch convenience over `settleMemberLoss`. Unbounded: the caller sizes the batch.
    function settleMembers(CommitmentManagerStorage.Layout storage s, uint256[] calldata commitmentIds) external {
        uint256 n = commitmentIds.length;
        if (n == 0) revert ICM.EmptyBatch();
        for (uint256 i; i < n; i++) {
            settleMemberLoss(s, commitmentIds[i]);
        }
    }

    // =========================================================================
    // Two-step exit — deallocation delay (the pre-declaration escape defense)
    // =========================================================================

    /// @notice Member-only: start the deallocation window. The line STAYS in `totalShares` and
    ///         mutual-slashable until `unbondRequestedAt + deallocationWindow` elapses, so an informed
    ///         member cannot exit ahead of a loss they can see coming (OBJ-3). The release window then
    ///         runs for one more `deallocationWindow`; a request not released by then lapses, and this
    ///         call starts a fresh one. A request that has not lapsed reverts `UnbondAlreadyRequested`.
    function requestMutualExit(CommitmentManagerStorage.Layout storage s, uint256 commitmentId) external {
        ICM.Membership storage m = s.membership[commitmentId];
        uint256 mutualId = m.mutualId;
        if (mutualId == 0) revert ICM.NotMutualMember();
        ICM.Commitment storage c = s.commitments[commitmentId];
        if (msg.sender != c.committer) revert ICM.NotCommitter();
        if (_lossLive(s.mutualLossProposals[mutualId])) revert ICM.MutualLossPending();
        ICM.Mutual storage g = s.mutuals[mutualId];
        bool fresh = m.unbondRequestedAt == 0;
        if (!fresh && !_exitLapsed(s, m, g)) revert ICM.UnbondAlreadyRequested(); // not lapsed yet

        // Bank accrued premium to date. The member STAYS in both denominators — still slashable in
        // `totalShares` AND still earning in `activeCover` through the deallocation window (still at
        // risk ⇒ still paid). `activeCover` is therefore deliberately NOT decremented here.
        _syncMember(g, m, c);
        // The cover joins `exitingCover` once per request on record: a request made again over a
        // lapsed, uncleared one is already counted (INV-P11).
        // forge-lint: disable-next-line(unsafe-typecast)
        if (fresh) g.exitingCover += uint128(_effCover(m, c)); // <= activeCover <= uint128 max

        m.unbondRequestedAt = uint64(block.timestamp);
        // Anchors the deallocation clock-stop; shares the slot `unbondRequestedAt` was just written to.
        m.memberExitCumulativePausedAtStart = PauseLib.creditablePaused(s);
        // The emitted horizon is the no-further-pause estimate; clock-stop can move it out.
        uint64 slashableUntil = uint64(block.timestamp) + g.deallocationWindow;
        emit ICM.MemberExitRequested(mutualId, commitmentId, slashableUntil);
    }

    /// @notice Release a fully-settled member inside its exit window, returning the residual
    ///         encumbrance to the committer's free balance. The window is
    ///         `deallocationWindow <= elapsed < 2 * deallocationWindow` (pause-adjusted); at or past its
    ///         end this reverts `ExitRequestLapsed` and the member must request again. A pending loss
    ///         still blocks release, so a request can lapse while a loss is pending; that is intended.
    ///         Uses a MUTUAL-AWARE terminal decrement
    ///         (not `_closeWithHooks`'s bps-derived one) — settles already removed `settledUnits`
    ///         from forfeitable, so only the REMAINING liability is decremented (OBJ-1).
    function releaseMutualMember(CommitmentManagerStorage.Layout storage s, uint256 commitmentId) external {
        ICM.Membership storage m = s.membership[commitmentId];
        uint256 mutualId = m.mutualId;
        if (mutualId == 0) revert ICM.NotMutualMember();
        ICM.Mutual storage g = s.mutuals[mutualId];
        ICM.Commitment storage c = s.commitments[commitmentId];

        if (m.unbondRequestedAt == 0) revert ICM.ExitNotRequested();
        // Clock-stop (ERC §A.6 erratum): the deallocation window elapses in effective time — an
        // informed member cannot ride out its still-slashable exit window during a pause in which
        // the mutual loss it would owe cannot execute.
        uint256 elapsed = PauseLib.effectiveElapsed(s, m.unbondRequestedAt, m.memberExitCumulativePausedAtStart);
        if (elapsed < g.deallocationWindow) revert ICM.DeallocationWindowActive();
        if (elapsed >= 2 * uint256(g.deallocationWindow)) revert ICM.ExitRequestLapsed();
        if (_lossLive(s.mutualLossProposals[mutualId])) revert ICM.MutualLossPending();
        if (m.lossSnapshot != g.cumulativeLoss) revert ICM.MemberUnsettled(); // settle outstanding first (INV-G5)

        // ---- Premium: final bank, then exit BOTH denominators (INV-P8 poke-before-change). Capture the
        // pay/committer/numeraire before the membership row is deleted below.
        _syncMember(g, m, c);
        // forge-lint: disable-next-line(unsafe-typecast)
        uint128 effCover = uint128(_effCover(m, c)); // <= E_i <= uint128 max
        g.activeCover -= effCover;
        g.exitingCover -= effCover; // a releasable request is on record and has not lapsed (INV-P11)
        // forge-lint: disable-next-line(unsafe-typecast)
        g.settledTotal -= uint128(m.settledUnits); // keep `activeCover == totalShares − settledTotal` exact (INV-P9)
        uint256 pay = m.rewardBank;
        address committer = c.committer;
        address numeraire = g.numeraire;

        // ---- Loss side (unchanged): return residual encumbrance and decrement the remaining liability.
        uint256 residual = c.amount; // == amount_join - settledUnits
        uint256 remainingForfeitable = m.forfeitableUnits - m.settledUnits;

        // Mutual-aware terminal exposure decrement — decrements exactly the remaining liability.
        ExposureLib.decrement(s, c.committer, c.token, remainingForfeitable);
        if (residual > 0) LedgerLib.releaseEncumbrance(s, commitmentId, c.token, c.committer, residual);

        c.amount = 0;
        c.released = true;
        if (c.unbondInitiatedAt != 0) c.unbondInitiatedAt = 0;
        c.closedAt = uint64(block.timestamp);

        // Remove at the exact value added; never on loss. E_i <= uint128 max, checked at join.
        g.totalShares -= SafeCast.toUint128(m.forfeitableUnits);

        // ---- Premium auto-pay (CEI: effects — zero bank, decrement aggregate — before the pool->free
        // move; the move is a pure internal ledger op so there is no external-call reentrancy surface).
        if (pay > 0) {
            m.rewardBank = 0;
            g.bankedTotal -= pay;
            LedgerLib.mutualPremiumToFree(s, numeraire, committer, mutualId, pay);
            emit ICM.MemberPremiumClaimed(commitmentId, committer, pay);
        }

        delete s.membership[commitmentId];

        // Last member out ⇒ no `activeCover`, so `_pokePremium` can no longer accrue. Sweep the residual
        // reserve to the beneficiary (the core's policyholder-of-record proxy) so INV-P1 closes at zero.
        if (g.totalShares == 0) _terminalSweep(s, g, mutualId);

        emit ICM.MemberReleased(mutualId, commitmentId);
    }

    // =========================================================================
    // Premium index (reward side) — funding, claiming, reclaim
    // =========================================================================

    /// @notice Policyholder-funded premium. Pulls `amount` of the mutual's numeraire by MEASURED
    ///         balance-delta (fee-on-transfer / rebasing safe), pokes the index, then (re)starts a
    ///         Synthetix stream over `duration` seconds with the standard leftover-roll. The core is
    ///         pricing-agnostic — pricing lives entirely in periphery. Solvency is enforced once,
    ///         at funding time, by the full-funding guard (INV-P2): future-streamable + already-banked
    ///         must not exceed the reserve. `_pokePremium` itself never touches the pool (INV-P0).
    ///         Funding stays permissionless, so four guards close the Synthetix `notifyRewardAmount`
    ///         griefing: `duration` is bounded to [MIN_STREAM_DURATION, MAX_STREAM_DURATION]
    ///         (StreamDurationOutOfBounds); a live stream's end never moves earlier
    ///         (`newFinish = max(periodFinish, now + duration)`, and premium plus leftover is spread over
    ///         `newFinish - now`), so a dust fund cannot compress it; a live stream's rate may only be
    ///         maintained or raised (PremiumRateDecreased); and the new `periodFinish` is computed in
    ///         uint256 so the uint64 cast can never truncate into the past. Reverts `MutualExhausted`
    ///         once the mutual is `exhausted`.
    function fundMutualPremium(
        CommitmentManagerStorage.Layout storage s,
        uint256 mutualId,
        uint256 amount,
        uint64 duration
    ) external {
        ICM.Mutual storage g = _mutual(s, mutualId);
        if (g.terminal) revert ICM.MutualIsTerminal();
        if (g.exhausted) revert ICM.MutualExhausted(); // no cover left to pay for
        if (duration < MIN_STREAM_DURATION || duration > MAX_STREAM_DURATION) {
            revert ICM.StreamDurationOutOfBounds();
        }
        if (g.activeCover == 0) revert ICM.NoActiveCover(); // no live cover ⇒ nothing to distribute to

        // Measured-receipt pull: credits the funder's free balance by exactly what arrived. The
        // free->pool move is then the LedgerLib helper, so every pool mutation routes through the one
        // helper pair (INV-P0) and INV-P1 holds on the manager's ACTUAL balance.
        uint256 received = MeasuredPull.pull(g.numeraire, amount);
        if (received == 0) revert ICM.ZeroAmount();
        LedgerLib.creditFree(s, g.numeraire, msg.sender, received);

        _pokePremium(g);

        uint256 nowTs = block.timestamp;
        uint256 leftover = nowTs < g.periodFinish ? (uint256(g.periodFinish) - nowTs) * uint256(g.rewardRate) : 0;
        // Compute the new deadline in uint256: the uint64 cast must never truncate — a truncated
        // `periodFinish` would land in the past and silently kill the stream. While a stream is live
        // its end never moves earlier, so a dust fund with a short duration cannot compress it.
        uint256 newFinish = nowTs + uint256(duration);
        if (newFinish < g.periodFinish) newFinish = g.periodFinish; // only bites while live
        if (newFinish > type(uint64).max) revert ICM.StreamDurationOutOfBounds();
        uint256 window = newFinish - nowTs;
        uint256 newRate = (received + leftover) / window;
        if (newRate > type(uint128).max) revert ICM.RewardRateOverflow();
        // LIVE-STREAM RATE GUARD: while a stream is running, funding may only maintain or raise
        // the rate. Otherwise a 1-wei fund over a huge window re-spreads the leftover, collapses
        // `rewardRate` (often to 0 by integer division) and `_pokePremium` short-circuits — the classic
        // Synthetix `notifyRewardAmount` griefing, ungated here because funding is permissionless.
        if (nowTs < g.periodFinish && newRate < uint256(g.rewardRate)) revert ICM.PremiumRateDecreased();
        g.rewardRate = uint128(newRate);
        g.periodFinish = uint64(newFinish);
        g.lastUpdate = uint64(nowTs);

        // free[funder] -> premium pool
        LedgerLib.freeToMutualPremium(s, g.numeraire, msg.sender, mutualId, received);

        // FUNDING-TIME SOLVENCY GUARD (the single source of premium solvency): everything the stream can
        // still pay out, plus everything already banked, must be covered by the premium reserve.
        if (uint256(g.rewardRate) * window + g.bankedTotal > s.mutualPremiumPool[mutualId]) {
            revert ICM.PremiumStreamUnderfunded();
        }

        emit ICM.MutualPremiumFunded(mutualId, msg.sender, received, g.rewardRate, g.periodFinish);
    }

    /// @notice Bank-and-pay one member's accrued premium to its committer. Permissionless to call;
    ///         CEI-strict (the bank is zeroed before the pool->free move). Idempotent: a zero balance
    ///         is a no-op emit.
    function claimMemberPremium(CommitmentManagerStorage.Layout storage s, uint256 commitmentId) public {
        ICM.Membership storage m = s.membership[commitmentId];
        uint256 mutualId = m.mutualId;
        if (mutualId == 0) revert ICM.NotMutualMember();
        ICM.Mutual storage g = s.mutuals[mutualId];
        ICM.Commitment storage c = s.commitments[commitmentId];

        // Pay the bank plus the accrual since the last sync, computed in memory: banking the accrual
        // and zeroing it again in the same call would net to the same `rewardBank == 0` and
        // `bankedTotal -= banked`, through four storage writes.
        uint256 pending = _accrue(g, m, c);
        uint256 banked = m.rewardBank;
        uint256 pay = banked + pending;
        address committer = c.committer;
        if (pay == 0) {
            emit ICM.MemberPremiumClaimed(commitmentId, committer, 0);
            return;
        }
        if (banked != 0) {
            m.rewardBank = 0; // EFFECTS first (zeroed before any movement)
            g.bankedTotal -= banked;
        }
        LedgerLib.mutualPremiumToFree(s, g.numeraire, committer, mutualId, pay); // pool -> free[committer]

        emit ICM.MemberPremiumClaimed(commitmentId, committer, pay);
    }

    /// @notice Policyholder-of-record defunds the unstreamed remainder and halts the stream. The core uses
    ///         the mutual `beneficiary` as the policyholder-of-record proxy (the on-chain bindCover
    ///         record that distinguishes payer from beneficiary lives in the periphery). Already-banked
    ///         premium stays claimable; the funding guard still holds because future-streamable and the
    ///         matching reserve are removed together.
    function reclaimPremium(CommitmentManagerStorage.Layout storage s, uint256 mutualId) external {
        ICM.Mutual storage g = _mutual(s, mutualId);
        if (msg.sender != g.beneficiary) revert ICM.Unauthorized();

        _pokePremium(g);
        uint256 nowTs = block.timestamp;
        uint256 unstreamed = nowTs < g.periodFinish ? (uint256(g.periodFinish) - nowTs) * uint256(g.rewardRate) : 0;
        g.periodFinish = uint64(nowTs);
        g.rewardRate = 0;
        if (unstreamed > 0) {
            LedgerLib.mutualPremiumToFree(s, g.numeraire, g.beneficiary, mutualId, unstreamed); // pool -> free
        }

        emit ICM.PremiumReclaimed(mutualId, g.beneficiary, unstreamed);
    }

    // =========================================================================
    // Views
    // =========================================================================

    /// @notice Premium currently claimable by `commitmentId` (banked + simulated accrual to `block.timestamp`).
    function pendingMemberPremium(CommitmentManagerStorage.Layout storage s, uint256 commitmentId)
        external
        view
        returns (uint256 claimable)
    {
        ICM.Membership storage m = s.membership[commitmentId];
        uint256 mutualId = m.mutualId;
        if (mutualId == 0) return 0;
        ICM.Mutual storage g = s.mutuals[mutualId];

        // `_pokePremium` read-only (no storage writes).
        (, uint256 delta,) = _accrual(g);
        uint256 piDelta = g.premiumPerShareStored + delta - m.premiumSnapshot;
        claimable = m.rewardBank + Math.mulDiv(_effCover(m, s.commitments[commitmentId]), piDelta, PI_ONE);
    }

    /// @notice Raw units `commitmentId` would owe the beneficiary if settled at the current Lambda.
    function pendingMemberLoss(CommitmentManagerStorage.Layout storage s, uint256 commitmentId)
        external
        view
        returns (uint256 owed)
    {
        ICM.Membership storage m = s.membership[commitmentId];
        if (m.mutualId == 0) return 0;
        uint256 lambda = s.mutuals[m.mutualId].cumulativeLoss;
        if (lambda <= m.lossSnapshot) return 0;
        owed = (m.forfeitableUnits * (lambda - m.lossSnapshot)) / LAMBDA_ONE;
        uint256 remaining = m.forfeitableUnits - m.settledUnits;
        if (owed > remaining) owed = remaining;
        uint256 amount = s.commitments[commitmentId].amount;
        if (owed > amount) owed = amount;
    }

    // =========================================================================
    // Internals
    // =========================================================================

    // -------------------------------------------------------------------------
    // Premium index internals (MasterChef `Pi` over a live `activeCover` denominator)
    // -------------------------------------------------------------------------

    /// @dev Advance the premium index `Pi` to `min(now, periodFinish)`. MUST run immediately before
    ///      EVERY mutation of `activeCover` or `Pi` (INV-P8). Touches NO partition compartment — the
    ///      reserve is `funded − claimed` and is mutated only by the LedgerLib helper pair (INV-P0).
    ///      Short-circuits (writing at most `lastUpdate`) when `rewardRate == 0 || activeCover == 0`,
    ///      so a never-funded / no-claimant mutual pays zero index churn on the settle hot path.
    ///      Uses `Math.mulDiv` (512-bit intermediate) for both the index delta and the dust back-multiply
    ///      so no value is lost and the product is overflow-safe for any feasible numeraire (INV-P10).
    function _pokePremium(ICM.Mutual storage g) private {
        (uint64 t, uint256 delta, uint256 gross) = _accrual(g);
        if (gross != 0) {
            g.premiumPerShareStored += delta;
            g.premiumRemainder = gross - Math.mulDiv(delta, g.activeCover, PI_ONE); // sub-1e27 dust kept for next poke
        }
        g.lastUpdate = t;
    }

    /// @dev The index growth `_pokePremium` would apply now, read-only (shared with the
    ///      `pendingMemberPremium` view). `t = min(now, periodFinish)`; `gross` is the premium streamed
    ///      since `lastUpdate` plus the carried dust, and zero on the pure-loss / no-claimant fast path
    ///      (`rewardRate == 0 || activeCover == 0`) or when no time has passed.
    function _accrual(ICM.Mutual storage g) private view returns (uint64 t, uint256 delta, uint256 gross) {
        uint64 nowTs = uint64(block.timestamp);
        t = nowTs < g.periodFinish ? nowTs : g.periodFinish;
        uint256 cover = g.activeCover;
        if (g.rewardRate == 0 || cover == 0 || t <= g.lastUpdate) return (t, 0, 0);
        gross = (uint256(t) - g.lastUpdate) * g.rewardRate + g.premiumRemainder; // carry prior dust forward
        delta = Math.mulDiv(gross, PI_ONE, cover);
    }

    /// @dev Join-time premium init: poke (INV-P8), snapshot the member at the current `Pi` (reward
    ///      non-retroactivity, INV-P5), then add its fresh deliverable cover to `activeCover`. Extracted
    ///      from `joinMutual` purely to bound stack depth (the join path is variable-heavy).
    function _initMemberPremium(ICM.Mutual storage g, ICM.Membership storage m, ICM.Commitment storage c) private {
        _pokePremium(g);
        uint256 pi = g.premiumPerShareStored;
        if (pi != 0) m.premiumSnapshot = pi; // a fresh row is already zero
        // effCover <= E_i and Σ effCover <= totalShares (<= uint128), so the cast cannot truncate.
        // forge-lint: disable-next-line(unsafe-typecast)
        g.activeCover = uint128(uint256(g.activeCover) + _effCover(m, c));
    }

    /// @dev Live DELIVERABLE cover of a member = its premium denominator weight: `E_i − settledUnits`
    ///      (the frozen `E_i`). The Belt-2 `min(·, c.amount)` clamp is provably inert (member
    ///      commitments are fenced from every non-mutual `amount` mutation, so
    ///      `c.amount >= E_i − settledUnits` always). It is KEPT IN CODE so any future deliverability
    ///      divergence degrades to a bounded, solvency-independent fairness deviation rather than
    ///      over-attributing premium (INV-P4 / INV-P4b).
    function _effCover(ICM.Membership storage m, ICM.Commitment storage c) private view returns (uint256) {
        uint256 deliverable = m.forfeitableUnits - m.settledUnits; // remaining frozen liability (fully-settled ⇒ 0)
        uint256 amt = c.amount;
        return amt < deliverable ? amt : deliverable; // Belt-2 deliverable cap (inert)
    }

    /// @dev Bank a member's accrued premium up to the current `Pi` (Synthetix bank-on-change). The
    ///      caller (settle / release) recomputes effCover afterwards and adjusts `activeCover` by the
    ///      delta.
    function _syncMember(ICM.Mutual storage g, ICM.Membership storage m, ICM.Commitment storage c) private {
        uint256 pending = _accrue(g, m, c);
        if (pending != 0) {
            m.rewardBank += pending;
            g.bankedTotal += pending;
        }
    }

    /// @dev Poke (INV-P8), then return the member's accrual since its snapshot on its OLD effCover and
    ///      advance the snapshot; the caller banks or pays the result.
    ///      `effCover * piDelta / 1e27` cannot overflow, so the loss legs that sync first never revert
    ///      on premium arithmetic (INV-P10): between two syncs a member's effCover only shrinks (it
    ///      moves only at settle / release, each synced first), and at every poke in between
    ///      `effCover <= activeCover` (INV-P9: activeCover == Σ effCover). So the result is at most
    ///      Σ gross over those pokes, the premium streamed plus carried dust, below 2^194
    ///      (`rewardRate` is uint128, time is uint64). A zero result with live cover is a sub-unit
    ///      round-down: the snapshot stays put so the accrual is recovered on a later poke, never lost.
    function _accrue(ICM.Mutual storage g, ICM.Membership storage m, ICM.Commitment storage c)
        private
        returns (uint256 pending)
    {
        _pokePremium(g);
        uint256 piDelta = g.premiumPerShareStored - m.premiumSnapshot;
        if (piDelta == 0) return 0; // already current — snapshot unchanged
        uint256 eff = _effCover(m, c);
        pending = Math.mulDiv(eff, piDelta, PI_ONE);
        if (pending == 0 && eff != 0) return 0; // deferred, not forfeited
        m.premiumSnapshot = g.premiumPerShareStored;
    }

    /// @dev Terminal sweep: a wound-down mutual (`totalShares == 0` ⇒ `activeCover == 0`, no members ⇒
    ///      `bankedTotal == 0`) can no longer accrue, so any residual reserve is stranded. Sweep it to
    ///      the beneficiary (the core's policyholder-of-record proxy) through the helper and halt the stream so
    ///      INV-P1 closes at zero. No-op when the reserve is already empty.
    function _terminalSweep(CommitmentManagerStorage.Layout storage s, ICM.Mutual storage g, uint256 mutualId) private {
        uint256 residual = s.mutualPremiumPool[mutualId];
        g.rewardRate = 0;
        g.periodFinish = uint64(block.timestamp);
        if (residual > 0) {
            LedgerLib.mutualPremiumToFree(s, g.numeraire, g.beneficiary, mutualId, residual);
            emit ICM.MutualPremiumSwept(mutualId, g.beneficiary, residual);
        }
    }

    function _mutual(CommitmentManagerStorage.Layout storage s, uint256 mutualId)
        private
        view
        returns (ICM.Mutual storage g)
    {
        g = s.mutuals[mutualId];
        if (g.arbiter == address(0)) revert ICM.MutualNotFound();
    }

    /// @dev Whether the member's exit request (`unbondRequestedAt != 0`) has run past its exit
    ///      window, `2 * deallocationWindow` of pause-adjusted time, and can no longer release.
    function _exitLapsed(CommitmentManagerStorage.Layout storage s, ICM.Membership storage m, ICM.Mutual storage g)
        private
        view
        returns (bool)
    {
        return PauseLib.effectiveElapsed(s, m.unbondRequestedAt, m.memberExitCumulativePausedAtStart)
            >= 2 * uint256(g.deallocationWindow);
    }

    /// @dev Whether a loss declaration is live: initiated and neither executed nor cancelled.
    function _lossLive(ICM.MutualLossProposal storage p) private view returns (bool) {
        return p.initiatedAt != 0 && !p.executed && !p.cancelled;
    }
}
