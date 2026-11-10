// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import {ICommitmentManager as ICM} from "src/core/interfaces/ICommitmentManager.sol";
import {IBandValuationAdapter} from "src/extensions/mutuals/interfaces/IBandValuationAdapter.sol";
import {CommitmentManagerStorage} from "src/core/manager/storage/CommitmentManagerStorage.sol";
import {CommitmentLifecycleLib} from "src/core/manager/libraries/CommitmentLifecycleLib.sol";
import {LedgerLib} from "src/core/manager/libraries/LedgerLib.sol";
import {ExposureLib} from "src/core/manager/libraries/ExposureLib.sol";
import {PauseLib} from "src/core/manager/libraries/PauseLib.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {MessageHashUtils} from "@openzeppelin/contracts/utils/cryptography/MessageHashUtils.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {BPS_DENOMINATOR} from "src/shared/Constants.sol";

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
    using SafeERC20 for IERC20;

    /// @dev 1e18-scaled fully-attributed loss fraction (Lambda == 1 means 100% of every E_i owed).
    uint256 internal constant LAMBDA_ONE = 1e18;
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
    ///         inactive; `valuationAuthority == 0` selects the oracle-free homogeneous-numeraire
    ///         subset (every member posts `numeraire` and `creditedValue == E_i`).
    function createMutual(CommitmentManagerStorage.Layout storage s, ICM.MutualParams calldata p)
        external
        returns (uint256 mutualId)
    {
        if (p.arbiter == address(0) || p.numeraire == address(0) || p.beneficiary == address(0)) {
            revert ICM.ZeroAddress();
        }
        if (p.challengeWindow < MUTUAL_MIN_CHALLENGE_WINDOW) revert ICM.MutualChallengeWindowTooShort();
        if (p.deallocationWindow < p.challengeWindow) revert ICM.DeallocationWindowTooShort();
        // Split pricing trust from loss declaration: the same key must not control both (OBJ-2).
        // (`valuationAuthority == 0` is homogeneous mode and is never == a non-zero arbiter.)
        if (p.valuationAuthority != address(0) && p.valuationAuthority == p.arbiter) {
            revert ICM.ValuationAuthorityIsArbiter();
        }

        if (s.nextMutualId == 0) s.nextMutualId = 1; // lazy 1-index (0 is the not-a-member sentinel)
        mutualId = s.nextMutualId++;

        ICM.Mutual storage g = s.mutuals[mutualId];
        g.arbiter = p.arbiter;
        g.numeraire = p.numeraire;
        g.beneficiary = p.beneficiary;
        g.valuationAuthority = p.valuationAuthority;
        g.challengeWindow = p.challengeWindow;
        g.deallocationWindow = p.deallocationWindow;

        emit ICM.MutualCreated(mutualId, p.arbiter, p.numeraire, p.beneficiary, p.valuationAuthority);
    }

    /// @notice Arbiter flips an inactive, non-terminal mutual active (no losses until active).
    function activateMutual(CommitmentManagerStorage.Layout storage s, uint256 mutualId) external {
        ICM.Mutual storage g = _mutual(s, mutualId);
        if (msg.sender != g.arbiter) revert ICM.NotMutualArbiter();
        if (g.terminal) revert ICM.MutualIsTerminal();
        g.active = true;
        emit ICM.MutualActivated(mutualId);
    }

    /// @notice Configure heterogeneous mode (valuationAuthority-only, while !active && !terminal;
    ///         immutable after). Sets the manipulation-resistant band adapter, the band bounds, the
    ///         junior split, and the per-collateral haircuts. A mutual is HETEROGENEOUS iff
    ///         `bandAdapter != 0`; only mutuals created with a non-zero `valuationAuthority` can be
    ///         configured (homogeneous mutuals revert via the authority check). Configuring before
    ///         activation re-enables `fundMutualPremium` and switches new joins to band+haircut pricing.
    /// @dev Heterogeneous mode drives ONLY the premium (reward) side. The loss denominator
    ///      (`creditedValue` / `totalShares` / Lambda / headroom) is never read from the band adapter,
    ///      so a compromised adapter cannot enlarge any claimant's loss recovery (INV-P11/P12/P14).
    function configureHeterogeneous(
        CommitmentManagerStorage.Layout storage s,
        uint256 mutualId,
        ICM.HeteroConfig calldata cfg
    ) external {
        ICM.Mutual storage g = _mutual(s, mutualId);
        // Homogeneous mutuals have `valuationAuthority == 0`, which is never == a real caller, so this
        // both authorizes and forbids homogeneous configuration in one check.
        if (msg.sender != g.valuationAuthority) revert ICM.NotValuationAuthority();
        if (g.terminal) revert ICM.MutualIsTerminal();
        if (g.active) revert ICM.MutualAlreadyActive(); // pre-activation only (immutable once members can join)
        if (g.bandAdapter != address(0)) revert ICM.MutualAlreadyConfigured(); // immutable after first config

        if (cfg.bandAdapter == address(0)) revert ICM.InvalidHeteroConfig();
        if (cfg.valuationCeilBps > BPS_DENOMINATOR) revert ICM.InvalidHeteroConfig(); // no inflation above adapter value
        if (cfg.valuationFloorBps > cfg.valuationCeilBps) revert ICM.InvalidHeteroConfig();
        if (cfg.juniorBps > BPS_DENOMINATOR) revert ICM.InvalidHeteroConfig();
        if (cfg.collaterals.length != cfg.haircutBps.length) revert ICM.InvalidHeteroConfig();

        g.bandAdapter = cfg.bandAdapter;
        g.valuationFloorBps = cfg.valuationFloorBps;
        g.valuationCeilBps = cfg.valuationCeilBps;
        g.juniorBps = cfg.juniorBps;

        uint256 n = cfg.collaterals.length;
        for (uint256 i; i < n; i++) {
            if (cfg.haircutBps[i] > BPS_DENOMINATOR) revert ICM.InvalidHeteroConfig();
            s.mutualHaircutBps[mutualId][cfg.collaterals[i]] = cfg.haircutBps[i];
        }

        emit ICM.MutualHeterogeneousConfigured(
            mutualId, cfg.bandAdapter, cfg.valuationFloorBps, cfg.valuationCeilBps, cfg.juniorBps
        );
    }

    /// @notice Permissionless DOWN-ONLY re-mark of one member's premium weight (heterogeneous only).
    ///         Recomputes the band+haircut weight from the manipulation-resistant adapter and ratchets
    ///         `premiumWeight` to `min(current, recomputed)` (monotone non-increasing, INV-P11). Reverts
    ///         while a mutual loss is pending (INV-P12). Banks accrued premium at the OLD effCover first,
    ///         then shrinks `activeCover` by the deliverable-cover delta. It writes ONLY `premiumWeight`
    ///         and the premium aggregates — never the loss denominator (`creditedValue` / `totalShares` /
    ///         `lossSnapshot` / Lambda / headroom), so a remarker can neither wedge nor delay a claim.
    function remark(CommitmentManagerStorage.Layout storage s, uint256 mutualId, uint256 commitmentId) external {
        ICM.Membership storage m = s.membership[commitmentId];
        if (m.mutualId != mutualId || mutualId == 0) revert ICM.NotMutualMember();
        ICM.Mutual storage g = s.mutuals[mutualId];
        if (g.bandAdapter == address(0)) revert ICM.NotHeterogeneous();
        if (_lossPending(s, mutualId)) revert ICM.MutualLossPending(); // marks frozen during a declaration

        ICM.Commitment storage c = s.commitments[commitmentId];
        uint128 cur = m.premiumWeight;
        uint128 computed = _bandHaircutWeight(s, g, mutualId, c.token, m.forfeitableUnits);
        uint128 newWeight = computed < cur ? computed : cur; // DOWN-ONLY: a remark never raises the weight

        if (newWeight == cur) {
            emit ICM.MemberRemarked(commitmentId, cur, cur); // no-op (appreciation / unchanged): nothing written
            return;
        }

        // Bank on the OLD effCover BEFORE shrinking the weight (INV-P8 poke-before-change), then move
        // ONLY the premium denominator by the deliverable-cover delta. No loss-side field is touched.
        _syncMember(g, m, c);
        uint256 effOld = _effCover(m, c);
        m.premiumWeight = newWeight;
        uint256 effNew = _effCover(m, c);
        g.activeCover = uint128(uint256(g.activeCover) - (effOld - effNew)); // effOld >= effNew (down-only)

        emit ICM.MemberRemarked(commitmentId, cur, newWeight);
    }

    // =========================================================================
    // Join — mutual-aware create that freezes the opaque capacity weight
    // =========================================================================

    /// @notice Create a fresh commitment (committer = caller) and join it to `mutualId`, freezing
    ///         `E_i` and `creditedValue`. Member commitments may bind NO strategies (the cover leg
    ///         carries no hooks; premium is a separate, unpooled periphery leg) — this makes the
    ///         "no FromEncumbered drift / no forfeit-reactive hook" guarantee structural (OBJ-7).
    function joinMutual(
        CommitmentManagerStorage.Layout storage s,
        uint256 mutualId,
        ICM.CommitmentParams calldata params,
        uint128 creditedValue,
        bytes calldata attestation,
        uint64 minChallengeWindow,
        uint256 maxStrategies,
        uint256 maxURILength
    ) external returns (uint256 commitmentId) {
        ICM.Mutual storage g = _mutual(s, mutualId);
        if (!g.active || g.terminal) revert ICM.MutualNotActive();
        if (g.cumulativeLoss == LAMBDA_ONE) revert ICM.MutualExhausted(); // wiped out: a joiner could never owe
        if (_lossPending(s, mutualId)) revert ICM.MutualLossPending(); // capacity frozen during a declaration
        if (params.arbiter != g.arbiter) revert ICM.MutualArbiterMismatch();
        if (params.counterparty != g.beneficiary) revert ICM.MutualBeneficiaryMismatch(); // no forfeit-to-self
        if (params.strategies.length != 0) revert ICM.MemberStrategyForbidden();

        // E_i = the member's frozen forfeitable allotment — the loss base (raw units of its token).
        uint256 ei = ExposureLib.exposureOf(params.amount, params.maxPenaltyBps);
        if (ei == 0) revert ICM.InvalidCreditedValue(); // a member with zero forfeitable capacity is pointless

        uint128 credited;
        if (g.valuationAuthority == address(0)) {
            // Homogeneous-numeraire mode: oracle-free. creditedValue == E_i, denominated in the
            // mutual's single numeraire token (which every member posts).
            if (params.token != g.numeraire) revert ICM.NumeraireMismatch();
            if (ei > MAX_TOTAL_SHARES) revert ICM.TotalSharesOverflow();
            credited = uint128(ei);
        } else {
            // Attested heterogeneous mode: `creditedValue` is an opaque weight that MUST be signed
            // by the mutual's (non-arbiter) valuationAuthority. The manager never derives it from a
            // live, pumpable adapter read; the attestation IS the (bounded, off-chain) trust.
            if (creditedValue == 0) revert ICM.InvalidCreditedValue();
            _verifyValuation(g.valuationAuthority, mutualId, msg.sender, params.token, ei, creditedValue, attestation);
            credited = creditedValue;
        }

        // Premium denominator weight. HOMOGENEOUS or attested-but-unconfigured (`bandAdapter == 0`):
        // `premiumWeight == credited` exactly — homogeneous v1 behaviour, byte-for-byte. HETEROGENEOUS
        // (`bandAdapter != 0`, set once by `configureHeterogeneous` before activation): derive a
        // band-bounded + haircut weight from the manipulation-resistant adapter (never the attestation),
        // so a reward re-mark can later ratchet it DOWN without ever touching the loss denominator.
        uint128 premWeight = credited;
        if (g.bandAdapter != address(0)) {
            premWeight = _bandHaircutWeight(s, g, mutualId, params.token, ei);
            if (premWeight == 0) revert ICM.InvalidCreditedValue();
        }

        // Reuse the audited create path verbatim (committer = caller).
        commitmentId =
            CommitmentLifecycleLib.createFull(s, msg.sender, params, minChallengeWindow, maxStrategies, maxURILength);

        // Register the membership + freeze both denominators' weights (extracted to bound stack depth).
        _registerMember(s, g, mutualId, commitmentId, ei, credited, premWeight);

        emit ICM.MemberJoined(mutualId, commitmentId, msg.sender, credited, ei);
    }

    /// @dev Post-create membership registration: grow `totalShares` (loss denominator), freeze the
    ///      membership row (both `creditedValue` and the distinct `premiumWeight`), and initialize the
    ///      premium side (poke + snapshot + `activeCover` add). Extracted from `joinMutual` purely to
    ///      bound stack depth. `creditedValue` moves ONLY on join / release — never on loss.
    function _registerMember(
        CommitmentManagerStorage.Layout storage s,
        ICM.Mutual storage g,
        uint256 mutualId,
        uint256 commitmentId,
        uint256 ei,
        uint128 credited,
        uint128 premiumWeight
    ) private {
        uint256 newTotal = uint256(g.totalShares) + credited;
        if (newTotal > MAX_TOTAL_SHARES) revert ICM.TotalSharesOverflow();
        g.totalShares = uint128(newTotal);

        s.membership[commitmentId] = ICM.Membership({
            mutualId: mutualId,
            forfeitableUnits: ei,
            settledUnits: 0,
            creditedValue: credited,
            lossSnapshot: g.cumulativeLoss, // no-retroactive-loss: liable only for future Lambda growth
            unbondRequestedAt: 0,
            premiumWeight: premiumWeight, // == creditedValue in homogeneous; band+haircut in heterogeneous
            premiumSnapshot: 0, // set to Pi by _initMemberPremium below — no-retroactive-reward (INV-P5)
            rewardBank: 0
        });

        // Premium side: poke BEFORE mutating `activeCover` (MasterChef discipline, INV-P8), then add the
        // member's deliverable cover to the denominator. A fresh member has `settledUnits == 0` and
        // `c.amount >= E_i`, so `effCover == premiumWeight == credited` — exact, no Belt-2 clamp bite.
        _initMemberPremium(g, s.membership[commitmentId], s.commitments[commitmentId]);
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
        if (_lossPending(s, mutualId)) revert ICM.MutualLossPending();
        // Hoisted once: the rate-limit check and the new proposal's snapshot must see the SAME
        // creditable-pause reading within this call.
        uint64 pauseSnapshot = PauseLib.creditablePaused(s);
        // Rate-limit only RE-initiation (lastInitiatedAt != 0): caps the initiate->cancel->re-init
        // capital-freeze griefing without blocking the first honest declaration. Clock-stop (ERC
        // §A.6 erratum): the interval elapses in effective time — `lastInitiatedAt` is written in
        // the same breath as the proposal, so the (possibly resolved) proposal's snapshot anchors
        // it. An honest arbiter whose declaration went TTL-stale during a pause re-initiates one
        // effective interval after the unpause.
        if (g.lastInitiatedAt != 0) {
            uint256 wall = block.timestamp - g.lastInitiatedAt;
            uint256 credit = pauseSnapshot - s.mutualLossProposals[mutualId].cumulativePausedAtStart;
            // Same saturating belt as PauseLib.effectiveElapsed: a stale (e.g. pre-erratum zero)
            // snapshot degrades to "interval not yet elapsed", never to an underflow revert.
            if ((wall > credit ? wall - credit : 0) < MIN_REINIT_INTERVAL) revert ICM.ReinitTooSoon();
        }

        s.mutualLossProposals[mutualId] = ICM.MutualLossProposal({
            lossNumeraire: lossNumeraire,
            initiatedAt: uint64(block.timestamp),
            evidenceHash: evidenceHash,
            proposer: msg.sender,
            executed: false,
            cancelled: false,
            cumulativePausedAtStart: pauseSnapshot
        });
        g.lastInitiatedAt = uint64(block.timestamp);

        emit ICM.MutualLossInitiated(mutualId, lossNumeraire, evidenceHash, msg.sender);
    }

    /// @notice Phase 2: anyone, after the window. Bumps `Lambda` once by the clamped loss fraction.
    function executeMutualLoss(CommitmentManagerStorage.Layout storage s, uint256 mutualId) external {
        ICM.Mutual storage g = _mutual(s, mutualId);
        ICM.MutualLossProposal storage p = s.mutualLossProposals[mutualId];
        if (p.initiatedAt == 0 || p.executed || p.cancelled) revert ICM.NoMutualLossPending();
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
        g.cumulativeLoss += (applied * LAMBDA_ONE) / g.totalShares;
        if (g.cumulativeLoss > LAMBDA_ONE) g.cumulativeLoss = LAMBDA_ONE; // belt against rounding

        if (applied < declared) emit ICM.MutualLossShortfall(mutualId, declared - applied);
        emit ICM.MutualLossExecuted(mutualId, applied, g.cumulativeLoss);
    }

    /// @notice Arbiter cancel of a pending declaration.
    function cancelMutualLoss(CommitmentManagerStorage.Layout storage s, uint256 mutualId) external {
        ICM.Mutual storage g = _mutual(s, mutualId);
        if (msg.sender != g.arbiter) revert ICM.NotMutualArbiter();
        ICM.MutualLossProposal storage p = s.mutualLossProposals[mutualId];
        if (p.initiatedAt == 0 || p.executed || p.cancelled) revert ICM.NoMutualLossPending();
        p.cancelled = true;
        emit ICM.MutualLossCancelled(mutualId, false);
    }

    /// @notice Permissionless force-cancel of an abandoned declaration after window + TTL.
    function cancelStaleMutualLoss(CommitmentManagerStorage.Layout storage s, uint256 mutualId) external {
        ICM.Mutual storage g = _mutual(s, mutualId);
        ICM.MutualLossProposal storage p = s.mutualLossProposals[mutualId];
        if (p.initiatedAt == 0 || p.executed || p.cancelled) revert ICM.NoMutualLossPending();
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
    function settleMemberLoss(CommitmentManagerStorage.Layout storage s, uint256 commitmentId) public {
        ICM.Membership storage m = s.membership[commitmentId];
        uint256 mutualId = m.mutualId;
        if (mutualId == 0) revert ICM.NotMutualMember();
        ICM.Mutual storage g = s.mutuals[mutualId];

        uint256 lambda = g.cumulativeLoss;
        if (lambda == m.lossSnapshot) return; // nothing new to settle (idempotent for batch convenience)

        ICM.Commitment storage c = s.commitments[commitmentId];

        // ---- Premium: poke and bank on the OLD effCover BEFORE the loss shrinks it (INV-P8
        // poke-before-change). Unconditional: the stored `Pi` is stale whenever the stream is live and
        // nobody has poked since this member's last sync, so comparing it with the snapshot cannot tell
        // whether the member has unbanked accrual. Skipping here would attribute the interval since the
        // last poke to post-loss cover and under-pay this member. `_syncMember` short-circuits when the
        // index is frozen, and the bank is failure-isolated inside it (skip-not-revert), so the loss legs
        // below ALWAYS execute even on the infeasible premium-overflow path (INV-P10).
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
            // INV-G9: move both exposure legs by `owedUnits` (keeps the per-commitment gap invariant).
            ExposureLib.decrementForfeited(s, c.committer, c.token, owed);
            // Balance-conserving: encumbered[committer] -> free[beneficiary]. REUSED, untouched.
            LedgerLib.forfeitTransfer(s, c.token, c.committer, g.beneficiary, owed);
            m.settledUnits += owed;
            c.amount -= owed; // residual stays encumbered; the commitment SURVIVES (may take future losses)

            // Dual-track the premium denominator EXACTLY (INV-P9): the loss reduced deliverable cover by
            // `effOld − effNew`, so shrink `activeCover` by that delta and grow `settledTotal` by `owed`,
            // keeping `activeCover == totalShares − settledTotal == Σ effCover` — funded or not. (For
            // heterogeneous mutuals only the running-delta identity `activeCover == Σ effCover` is exact —
            // INV-P9' — since `premiumWeight != creditedValue`; the `totalShares − settledTotal` leg is
            // homogeneous-only.)
            g.settledTotal += owed;
            uint256 effNew = _effCover(m, c);
            g.activeCover = uint128(uint256(g.activeCover) - (effOld - effNew)); // effOld >= effNew

            // ---- Junior shortfall absorber draw (HETEROGENEOUS only; ORACLE-FREE, failure-isolated).
            // Top up the beneficiary's numeraire recovery by a FIXED fraction of the owed units — the
            // pre-sized expected haircut, NOT a live price — bounded by the available junior reserve. The
            // draw is skip-if-empty and provably never reverts (`draw <= pool` by the clamp), so the loss
            // legs above ALWAYS execute regardless of pool state (INV-P13). For homogeneous mutuals
            // (`bandAdapter == 0`, no junior funding) this whole block is skipped — hot path unchanged.
            if (g.bandAdapter != address(0)) {
                uint256 haircut = s.mutualHaircutBps[mutualId][c.token];
                uint256 pool = s.mutualJuniorPool[mutualId];
                if (haircut != 0 && pool != 0) {
                    uint256 draw = (haircut * owed) / BPS_DENOMINATOR;
                    if (draw > pool) draw = pool; // clamp ⇒ mutualJuniorToFree can never revert here
                    if (draw != 0) {
                        // numeraire top-up to the beneficiary (the junior pool is funded in numeraire).
                        LedgerLib.mutualJuniorToFree(s, g.numeraire, g.beneficiary, mutualId, draw);
                        emit ICM.MutualJuniorDrawn(commitmentId, draw);
                    }
                }
            }
        }
        m.lossSnapshot = lambda;

        emit ICM.MemberSettled(mutualId, commitmentId, owed, lambda);
    }

    /// @notice Bounded batch convenience over `settleMemberLoss`.
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
        if (_lossPending(s, mutualId)) revert ICM.MutualLossPending();
        if (
            m.unbondRequestedAt != 0
                && PauseLib.effectiveElapsed(s, m.unbondRequestedAt, s.memberExitCumulativePausedAtStart[commitmentId])
                    < 2 * uint256(s.mutuals[mutualId].deallocationWindow)
        ) revert ICM.UnbondAlreadyRequested(); // not lapsed yet

        // Bank accrued premium to date. The member STAYS in both denominators — still slashable in
        // `totalShares` AND still earning in `activeCover` through the deallocation window (still at
        // risk ⇒ still paid). `activeCover` is therefore deliberately NOT decremented here.
        _syncMember(s.mutuals[mutualId], m, c);

        m.unbondRequestedAt = uint64(block.timestamp);
        // Anchors the deallocation clock-stop. A sibling mapping rather than a Membership field so
        // the join path never touches the slot (same pattern as `unbondCumulativePausedAtStart`).
        s.memberExitCumulativePausedAtStart[commitmentId] = PauseLib.creditablePaused(s);
        // The emitted horizon is the no-further-pause estimate; clock-stop can move it out.
        uint64 slashableUntil = uint64(block.timestamp) + s.mutuals[mutualId].deallocationWindow;
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
        uint256 elapsed =
            PauseLib.effectiveElapsed(s, m.unbondRequestedAt, s.memberExitCumulativePausedAtStart[commitmentId]);
        if (elapsed < g.deallocationWindow) revert ICM.DeallocationWindowActive();
        if (elapsed >= 2 * uint256(g.deallocationWindow)) revert ICM.ExitRequestLapsed();
        if (_lossPending(s, mutualId)) revert ICM.MutualLossPending();
        if (m.lossSnapshot != g.cumulativeLoss) revert ICM.MemberUnsettled(); // settle outstanding first (INV-G5)

        // ---- Premium: final bank, then exit BOTH denominators (INV-P8 poke-before-change). Capture the
        // pay/committer/numeraire before the membership row is deleted below.
        _syncMember(g, m, c);
        uint256 effCover = _effCover(m, c);
        g.activeCover = uint128(uint256(g.activeCover) - effCover);
        g.settledTotal -= m.settledUnits; // keep `activeCover == totalShares − settledTotal` exact (INV-P9)
        uint256 pay = m.rewardBank;
        address committer = c.committer;
        address numeraire = g.numeraire;

        // ---- Loss side (unchanged): return residual encumbrance and decrement the remaining liability.
        uint256 residual = c.amount; // == amount_join - settledUnits
        uint256 remainingForfeitable = m.forfeitableUnits - m.settledUnits;

        // Mutual-aware terminal exposure decrement — decrements exactly the remaining liability.
        ExposureLib.decrement(s, c.committer, c.token, residual, remainingForfeitable);
        if (residual > 0) LedgerLib.releaseEncumbrance(s, commitmentId, c.token, c.committer, residual);

        c.amount = 0;
        c.released = true;
        if (s.unbondInitiatedAt[commitmentId] != 0) s.unbondInitiatedAt[commitmentId] = 0;
        s.closedAt[commitmentId] = uint64(block.timestamp);

        g.totalShares -= m.creditedValue; // remove at the exact value added; never on loss

        // ---- Premium auto-pay (CEI: effects — zero bank, decrement aggregate — before the pool->free
        // move; the move is a pure internal ledger op so there is no external-call reentrancy surface).
        if (pay > 0) {
            m.rewardBank = 0;
            g.bankedTotal -= pay;
            LedgerLib.mutualPremiumToFree(s, numeraire, committer, mutualId, pay);
            emit ICM.MemberPremiumClaimed(commitmentId, committer, pay);
        }

        delete s.membership[commitmentId];
        delete s.memberExitCumulativePausedAtStart[commitmentId]; // refund; unreadable anyway (INV-G6 non-rebindable)

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
    ///         once Lambda is at its cap.
    function fundMutualPremium(
        CommitmentManagerStorage.Layout storage s,
        uint256 mutualId,
        uint256 amount,
        uint64 duration
    ) external {
        ICM.Mutual storage g = _mutual(s, mutualId);
        if (g.terminal) revert ICM.MutualIsTerminal();
        if (g.cumulativeLoss == LAMBDA_ONE) revert ICM.MutualExhausted(); // no cover left to pay for
        // Premium funding is HOMOGENEOUS or CONFIGURED-HETEROGENEOUS only. An ATTESTED-BUT-UNCONFIGURED
        // mutual (`valuationAuthority != 0 && bandAdapter == 0`) has a `premiumWeight == creditedValue`
        // that can diverge from `E_i` while still lacking the re-priceable band machinery, so the money
        // path stays closed until `configureHeterogeneous` sets a `bandAdapter`. Homogeneous
        // (`valuationAuthority == 0`) funds as in homogeneous v1; once configured, heterogeneous funds with the
        // junior split below. INV-P9's exact `activeCover == totalShares − settledTotal` cross-check is
        // HOMOGENEOUS-ONLY; heterogeneous relaxes to INV-P9' (running-delta `activeCover == Σ effCover`).
        if (g.valuationAuthority != address(0) && g.bandAdapter == address(0)) {
            revert ICM.HeterogeneousPremiumUnsupported();
        }
        if (duration < MIN_STREAM_DURATION || duration > MAX_STREAM_DURATION) {
            revert ICM.StreamDurationOutOfBounds();
        }
        if (g.activeCover == 0) revert ICM.NoActiveCover(); // no live cover ⇒ nothing to distribute to

        // Measured-receipt pull: credits the funder's free balance by exactly what arrived. The
        // free->pool move is then the LedgerLib helper, so every pool mutation routes through the one
        // helper pair (INV-P0) and INV-P1 holds on the manager's ACTUAL balance.
        uint256 received = _pullNumeraireMeasured(s, g.numeraire, msg.sender, amount);
        if (received == 0) revert ICM.ZeroAmount();

        // Junior split (heterogeneous only; `juniorBps == 0` ⇒ no split ⇒ homogeneous behaviour exactly): route a
        // fixed fraction of the MEASURED receipt to the junior shortfall absorber. The premium stream and
        // the funding-time solvency guard see ONLY the premium remainder — the junior share is subordinate
        // capital that never earns `Pi` and never enters the stream solvency accounting (INV-P13).
        uint256 juniorShare = g.juniorBps == 0 ? 0 : (received * uint256(g.juniorBps)) / BPS_DENOMINATOR;
        uint256 premiumPortion = received - juniorShare;

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
        uint256 newRate = (premiumPortion + leftover) / window;
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
        LedgerLib.freeToMutualPremium(s, g.numeraire, msg.sender, mutualId, premiumPortion);
        if (juniorShare != 0) {
            // free[funder] -> junior pool
            LedgerLib.freeToMutualJunior(s, g.numeraire, msg.sender, mutualId, juniorShare);
            emit ICM.MutualJuniorFunded(mutualId, msg.sender, juniorShare);
        }

        // FUNDING-TIME SOLVENCY GUARD (the single source of premium solvency): everything the stream can
        // still pay out, plus everything already banked, must be covered by the PREMIUM reserve (the junior
        // share is excluded — it is not streamable cover).
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

        _syncMember(g, m, c); // bring the bank current (poke + accrue on live effCover)

        uint256 pay = m.rewardBank;
        address committer = c.committer;
        if (pay == 0) {
            emit ICM.MemberPremiumClaimed(commitmentId, committer, 0);
            return;
        }
        m.rewardBank = 0; // EFFECTS first (zeroed before any movement)
        g.bankedTotal -= pay;
        LedgerLib.mutualPremiumToFree(s, g.numeraire, committer, mutualId, pay); // pool -> free[committer]

        emit ICM.MemberPremiumClaimed(commitmentId, committer, pay);
    }

    /// @notice Bounded batch convenience over `claimMemberPremium`.
    function claimMembersPremium(CommitmentManagerStorage.Layout storage s, uint256[] calldata commitmentIds) external {
        uint256 n = commitmentIds.length;
        if (n == 0) revert ICM.EmptyBatch();
        for (uint256 i; i < n; i++) {
            claimMemberPremium(s, commitmentIds[i]);
        }
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

    /// @notice Convenience: settle a member's loss then claim its premium under one reentrancy guard.
    ///         PURE dispatch — two INDEPENDENT CEI passes with zero shared accounting; degrades exactly
    ///         to calling the two permissionless entrypoints separately.
    function settleAndClaim(CommitmentManagerStorage.Layout storage s, uint256 commitmentId) external {
        settleMemberLoss(s, commitmentId);
        claimMemberPremium(s, commitmentId);
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

        // Simulate `_pokePremium` read-only (no storage writes).
        uint256 pi = g.premiumPerShareStored;
        if (g.rewardRate != 0 && g.activeCover != 0) {
            uint256 t = block.timestamp < g.periodFinish ? block.timestamp : g.periodFinish;
            if (t > g.lastUpdate) {
                uint256 gross = (t - uint256(g.lastUpdate)) * uint256(g.rewardRate) + g.premiumRemainder;
                pi += Math.mulDiv(gross, PI_ONE, g.activeCover);
            }
        }
        uint256 eff = _effCover(m, s.commitments[commitmentId]);
        claimable = m.rewardBank + _safePending(eff, pi - m.premiumSnapshot);
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
        uint64 nowTs = uint64(block.timestamp);
        uint64 t = nowTs < g.periodFinish ? nowTs : g.periodFinish;
        if (g.rewardRate == 0 || g.activeCover == 0) {
            g.lastUpdate = t; // pure-loss / no-claimant fast path: no index churn
            return;
        }
        uint256 elapsed = uint256(t) - uint256(g.lastUpdate);
        if (elapsed != 0) {
            uint256 gross = elapsed * uint256(g.rewardRate) + g.premiumRemainder; // carry prior dust forward
            uint256 cover = uint256(g.activeCover);
            uint256 delta = Math.mulDiv(gross, PI_ONE, cover);
            g.premiumPerShareStored += delta;
            g.premiumRemainder = gross - Math.mulDiv(delta, cover, PI_ONE); // sub-1e27 dust kept for next poke
        }
        g.lastUpdate = t;
    }

    /// @dev Join-time premium init: poke (INV-P8), snapshot the member at the current `Pi` (reward
    ///      non-retroactivity, INV-P5), then add its fresh deliverable cover to `activeCover`. Extracted
    ///      from `joinMutual` purely to bound stack depth (the join path is variable-heavy).
    function _initMemberPremium(ICM.Mutual storage g, ICM.Membership storage m, ICM.Commitment storage c) private {
        _pokePremium(g);
        m.premiumSnapshot = g.premiumPerShareStored;
        // Homogeneous: effCover <= credited and Σ <= totalShares (<= uint128) — the guard never bites.
        // Heterogeneous: `premiumWeight` is band-derived and independent of `totalShares`, so the running
        // `activeCover` sum must be explicitly fenced against the uint128 cap (a silent cast-truncation
        // here would corrupt the premium denominator). Same `TotalSharesOverflow` surface as join.
        uint256 newCover = uint256(g.activeCover) + _effCover(m, c);
        if (newCover > MAX_TOTAL_SHARES) revert ICM.TotalSharesOverflow();
        g.activeCover = uint128(newCover);
    }

    /// @dev Live DELIVERABLE cover of a member = its premium denominator weight. In homogeneous v1
    ///      `premiumWeight == creditedValue == E_i`, so this collapses to `E_i − settledUnits` and the
    ///      Belt-2 `min(·, c.amount)` clamp is provably inert (member commitments are fenced from every
    ///      non-mutual `amount` mutation, so `c.amount >= E_i − settledUnits` always). The clamp is KEPT
    ///      IN CODE (asserted inert in v1) so any future deliverability divergence degrades gracefully
    ///      to a bounded, solvency-independent fairness deviation rather than over-attributing premium
    ///      (INV-P4 / INV-P4b).
    /// @dev Heterogeneous premium weight = the manipulation-resistant adapter value of `E_i` raw units of
    ///      `token`, BAND-CLAMPED to `[floorBps, ceilBps] * adapterValue / 1e4` (with `ceilBps <= 1e4` so
    ///      the result never exceeds the adapter value — no inflation, INV-P11), then HAIRCUT by the
    ///      per-collateral `mutualHaircutBps[g][token]` (so `weight <= (1 − haircut)/1e4 * bandWeight`,
    ///      INV-P14). The result feeds ONLY `premiumWeight` (and through it `effCover` / `activeCover`);
    ///      it NEVER touches the loss denominator. Reverts `TotalSharesOverflow` if it would not fit the
    ///      uint128 weight field (keeps the `activeCover` denominator within its cap).
    function _bandHaircutWeight(
        CommitmentManagerStorage.Layout storage s,
        ICM.Mutual storage g,
        uint256 mutualId,
        address token,
        uint256 ei
    ) private view returns (uint128) {
        uint256 raw = IBandValuationAdapter(g.bandAdapter).value(token, ei);
        uint256 lo = (raw * uint256(g.valuationFloorBps)) / BPS_DENOMINATOR;
        uint256 hi = (raw * uint256(g.valuationCeilBps)) / BPS_DENOMINATOR;
        uint256 banded = raw;
        if (banded > hi) banded = hi; // ceilBps <= 1e4 ⇒ this binds, capping at ceilBps*raw/1e4
        if (banded < lo) banded = lo;
        uint256 haircut = s.mutualHaircutBps[mutualId][token];
        uint256 weighted = (banded * (BPS_DENOMINATOR - haircut)) / BPS_DENOMINATOR;
        if (weighted > MAX_TOTAL_SHARES) revert ICM.TotalSharesOverflow();
        // Safe: the guard above rejects anything above MAX_TOTAL_SHARES == type(uint128).max.
        // forge-lint: disable-next-line(unsafe-typecast)
        return uint128(weighted);
    }

    function _effCover(ICM.Membership storage m, ICM.Commitment storage c) private view returns (uint256) {
        uint256 ei = m.forfeitableUnits;
        if (ei == 0) return 0;
        uint256 deliverable = ei - m.settledUnits; // remaining frozen liability (fully-settled ⇒ 0)
        uint256 amt = c.amount;
        if (amt < deliverable) deliverable = amt; // Belt-2 deliverable cap (inert in v1)
        return Math.mulDiv(m.premiumWeight, deliverable, ei);
    }

    /// @dev Bank a member's accrued premium up to the current `Pi` (Synthetix bank-on-change). Pokes
    ///      first (INV-P8), banks on the member's OLD effCover, then advances `premiumSnapshot`. The
    ///      caller (settle / release) recomputes effCover afterwards and adjusts `activeCover` by the
    ///      delta. The bank is FAILURE-ISOLATED via `_safePending` (skip-not-revert on the infeasible
    ///      overflow path), so a premium-arithmetic edge can never wedge the loss legs (INV-P10).
    function _syncMember(ICM.Mutual storage g, ICM.Membership storage m, ICM.Commitment storage c) private {
        _pokePremium(g);
        uint256 piDelta = g.premiumPerShareStored - m.premiumSnapshot;
        if (piDelta == 0) return; // already current — nothing to bank, snapshot unchanged
        uint256 eff = _effCover(m, c);
        uint256 pending = _safePending(eff, piDelta);
        if (pending == 0 && eff != 0) {
            // `_safePending` saturated on the infeasible overflow path (it would only return 0 here for a
            // sub-1e27 round-down or the ~1.15e50-funding overflow). DEFER rather than forfeit: leave
            // `premiumSnapshot` un-advanced so the accrual is recovered on a later poke once it fits /
            // accumulates past one unit — never lost (matches the INV-P10 "deferred, not forfeited" claim).
            return;
        }
        if (pending != 0) {
            m.rewardBank += pending;
            g.bankedTotal += pending;
        }
        m.premiumSnapshot = g.premiumPerShareStored;
    }

    /// @dev `effCover * piDelta / 1e27` via `Math.mulDiv`, but SATURATING-to-zero on the (infeasible)
    ///      path where the quotient would not fit `uint256` — so banking inside settle/release can never
    ///      revert and brick a validated loss (INV-P10 skip-not-revert). The pre-check mirrors `mulDiv`'s
    ///      own overflow guard (`prod1 < denominator`) using the standard 512-bit full-mul decomposition,
    ///      so it skips exactly when — and only when — `mulDiv` would revert. Unreachable below ~1.15e50
    ///      cumulative funding; the `uint128` cap on `effCover` gives the 512-bit headroom unconditionally.
    function _safePending(uint256 effCover, uint256 piDelta) private pure returns (uint256) {
        if (effCover == 0 || piDelta == 0) return 0;
        uint256 prod0; // low 256 bits of effCover * piDelta
        uint256 prod1; // high 256 bits of effCover * piDelta
        unchecked {
            uint256 mm = mulmod(effCover, piDelta, type(uint256).max);
            prod0 = effCover * piDelta;
            prod1 = mm - prod0;
            if (mm < prod0) prod1 -= 1;
        }
        if (prod1 >= PI_ONE) return 0; // would overflow uint256 after /1e27 ⇒ skip the bank, do not revert
        return Math.mulDiv(effCover, piDelta, PI_ONE);
    }

    /// @dev External measured-receipt pull of the mutual numeraire into the manager, crediting the
    ///      funder's free balance by the EXACT balance delta (fee-on-transfer / rebasing safe). The
    ///      SafeERC20 transfer lives here, NOT in LedgerLib, preserving LedgerLib's no-external-transfer
    ///      convention; the free->pool move is the LedgerLib `freeToMutualPremium` helper.
    function _pullNumeraireMeasured(
        CommitmentManagerStorage.Layout storage s,
        address token,
        address from,
        uint256 amount
    ) private returns (uint256 received) {
        uint256 balBefore = IERC20(token).balanceOf(address(this));
        IERC20(token).safeTransferFrom(from, address(this), amount);
        received = IERC20(token).balanceOf(address(this)) - balBefore;
        // Credit the measured receipt to the funder's free balance; `freeToMutualPremium` moves it to
        // the pool. Both legs are INV-P1-preserving (totalFree += then -=, balanceOf += received).
        s.ledger[token][from].freeBalance += received;
        s.totalFree[token] += received;
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
        // Sweep any residual junior reserve too, so the 5th partition compartment closes at zero on a
        // wound-down mutual (INV-P13). Always zero for homogeneous mutuals (junior never funded) — no-op.
        uint256 jr = s.mutualJuniorPool[mutualId];
        if (jr > 0) {
            LedgerLib.mutualJuniorToFree(s, g.numeraire, g.beneficiary, mutualId, jr);
            emit ICM.MutualJuniorSwept(mutualId, g.beneficiary, jr);
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

    function _lossPending(CommitmentManagerStorage.Layout storage s, uint256 mutualId) private view returns (bool) {
        ICM.MutualLossProposal storage p = s.mutualLossProposals[mutualId];
        return p.initiatedAt != 0 && !p.executed && !p.cancelled;
    }

    /// @dev Self-contained valuation attestation (no EIP-712 plumbing through delegatecall): the
    ///      `attestation` calldata is `abi.encode(uint256 deadline, bytes sig)`, where `sig` is a
    ///      plain ECDSA signature by the mutual's valuationAuthority over a digest binding
    ///      chainid + manager + the exact (mutual, committer, token, E_i, creditedValue, deadline).
    ///      The deadline time-boxes the attestation so a stale/inflated valuation cannot be reused
    ///      forever (red-team #2). The non-arbiter constraint is enforced at createMutual; the
    ///      [lo,hi]*adapter band hardening and single-use nonce (OBJ-2) live in the periphery
    ///      assembler / are a documented follow-up for when heterogeneous mode ships.
    function _verifyValuation(
        address authority,
        uint256 mutualId,
        address committer,
        address token,
        uint256 ei,
        uint128 creditedValue,
        bytes calldata attestation
    ) private view {
        (uint256 deadline, bytes memory sig) = abi.decode(attestation, (uint256, bytes));
        // Deliberately WALL-CLOCK, not clock-stopped: `joinMutual` is never pause-blocked, so no attestation
        // ever loses a usable validity window to a pause — while crediting the manager's LIFETIME
        // pause time here would widen every signed deadline by pause episodes that predate the
        // attestation, making stale (mispriced) valuations replayable. The signed deadline means
        // exactly what the authority signed.
        if (block.timestamp > deadline) revert ICM.InvalidValuationAttestation();
        bytes32 digest = MessageHashUtils.toEthSignedMessageHash(
            keccak256(
                abi.encode(
                    "MutualValuation",
                    block.chainid,
                    address(this),
                    mutualId,
                    committer,
                    token,
                    ei,
                    creditedValue,
                    deadline
                )
            )
        );
        if (ECDSA.recover(digest, sig) != authority) revert ICM.InvalidValuationAttestation();
    }
}
