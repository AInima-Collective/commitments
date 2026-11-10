// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import {ICommitmentManager as ICM} from "src/core/interfaces/ICommitmentManager.sol";
import {IDistributionStrategy, CreatedContext} from "src/core/interfaces/IDistributionStrategy.sol";
import {CommitmentManagerStorage} from "src/core/manager/storage/CommitmentManagerStorage.sol";
import {MovementLib, HOOK_RELEASED, HOOK_FORFEITED} from "src/core/manager/libraries/MovementLib.sol";
import {LedgerLib} from "src/core/manager/libraries/LedgerLib.sol";
import {LedgerOpsLib} from "src/core/manager/libraries/LedgerOpsLib.sol";
import {ExposureLib} from "src/core/manager/libraries/ExposureLib.sol";
import {PauseLib} from "src/core/manager/libraries/PauseLib.sol";
import {BPS_DENOMINATOR} from "src/shared/Constants.sol";
import {SignatureChecker} from "@openzeppelin/contracts/utils/cryptography/SignatureChecker.sol";
import {MessageHashUtils} from "@openzeppelin/contracts/utils/cryptography/MessageHashUtils.sol";

/// @title IOperatorRegistryHooks
/// @notice Hooks invoked when a commitment tracked by the operator registry is released or
///         forfeited. The registry looks up the operator internally via commitmentId.
interface IOperatorRegistryHooks {
    function onDelegationReleased(uint256 commitmentId, uint256 amount) external;
    function onDelegationForfeited(uint256 commitmentId, uint256 forfeitedAmount, uint256 fullAmount) external;
    /// @notice Number of registration/delegation commitments the registry still tracks. Consulted
    ///         by `setOperatorRegistry` so re-pointing the hook slot cannot orphan live delegations.
    function trackedCommitmentCount() external view returns (uint256);
}

/// @title CommitmentLifecycleLib
/// @notice External delegatecall library hosting the full Part C lifecycle cores — create,
///         release, expire, two-phase forfeit, committer unbond — including auth checks, guarded
///         hook orchestration (via MovementLib), events, and registry hooks. The manager
///         keeps only `nonReentrant` dispatch wrappers; this split keeps it under the
///         24,576-byte bytecode limit.
/// @dev `msg.sender`, `address(this)`, and event sourcing are preserved under delegatecall, so
///      auth checks and registry calls behave exactly as if they lived on the manager.
library CommitmentLifecycleLib {
    // =========================================================================
    // Create (ERC §C.1)
    // =========================================================================

    /// @notice Validate a relayer CreateCommitment authorization against `committer` (ERC §C.8).
    /// @dev The EIP-712 digest assembly + signature validation live here (DELEGATECALL) so the
    ///      manager — already at the EIP-170 ceiling — carries neither the struct-hash encoder nor
    ///      the signature-checking glue. Validation goes through OZ `SignatureChecker`, which
    ///      accepts both EOA ECDSA signatures and ERC-1271 smart-contract-wallet signatures (Safe /
    ///      4337 / 8004 agent accounts) — a STATICCALL to `committer.isValidSignature` when it has
    ///      code, so this function is `view` rather than `pure`. The manager passes its own domain
    ///      separator and the canonical typehash; nonce consumption stays on the manager.
    /// @return valid True iff `sig` is a valid signature by `committer` over the create digest.
    function isValidCreateSignature(
        bytes32 typehash,
        bytes32 domainSeparator,
        address committer,
        ICM.CommitmentParams calldata params,
        uint256 nonce,
        uint256 deadline,
        bytes calldata sig
    ) external view returns (bool valid) {
        bytes32 strategiesHash = keccak256(abi.encode(params.strategies));
        bytes32 structHash = keccak256(
            bytes.concat(
                abi.encode(
                    typehash,
                    committer,
                    params.arbiter,
                    params.counterparty,
                    params.token,
                    params.adapter,
                    params.amount
                ),
                abi.encode(
                    uint256(params.maxPenaltyBps),
                    uint256(params.challengeWindow),
                    uint256(params.expiresAt),
                    strategiesHash,
                    keccak256(bytes(params.metadataURI)),
                    params.metadataHash,
                    nonce,
                    deadline
                )
            )
        );
        return SignatureChecker.isValidSignatureNow(
            committer, MessageHashUtils.toTypedDataHash(domainSeparator, structHash), sig
        );
    }

    /// @notice Full creation core: validate, check exposure, encumber, store, bind strategies
    ///         in array order and run each onCommitmentCreated (reverts abort creation — the
    ///         v1 compatibility-refusal mechanism, NOT guarded).
    function createFull(
        CommitmentManagerStorage.Layout storage s,
        address committer,
        ICM.CommitmentParams calldata params,
        uint64 minChallengeWindow,
        uint256 maxStrategies,
        uint256 maxURILength
    ) external returns (uint256 commitmentId) {
        _validateCreateParams(params, minChallengeWindow, maxStrategies, maxURILength);
        return _createCore(s, committer, params);
    }

    /// @notice Deposit-then-create in one call: validate FIRST (revert-before-pull), pull the
    ///         measured deposit into `committer`'s free balance, then encumber `params.amount` from
    ///         it via the shared create core (ERC §A.2/§C.1).
    /// @dev Validation runs before the token pull, so a rejected commitment never moves funds. The
    ///      deposit reuses the audited `LedgerOpsLib.depositCore` (fee-on-transfer-safe measured
    ///      delta; lib→lib call is a DELEGATECALL preserving `msg.sender`/`address(this)`), so it
    ///      credits the caller's free balance exactly as a standalone `deposit` would. A zero
    ///      `depositAmount` degenerates to a plain create against existing free balance (the pull is
    ///      skipped rather than reverting `ZeroAmount`). Encumbrance then draws `params.amount` from
    ///      the funded balance: a surplus stays withdrawable; a shortfall succeeds only if prior free
    ///      balance covers it, else `LedgerLib.encumber` reverts `InsufficientFreeBalance`.
    function createAndFundCore(
        CommitmentManagerStorage.Layout storage s,
        address committer,
        ICM.CommitmentParams calldata params,
        uint256 depositAmount,
        uint64 minChallengeWindow,
        uint256 maxStrategies,
        uint256 maxURILength
    ) external returns (uint256 commitmentId) {
        _validateCreateParams(params, minChallengeWindow, maxStrategies, maxURILength);
        if (depositAmount != 0) LedgerOpsLib.depositCore(s, params.token, depositAmount);
        return _createCore(s, committer, params);
    }

    /// @notice Create core (post-validation): exposure check, encumber from free balance, exposure
    ///         increment, store, bind strategies + run each `onCommitmentCreated` (reverts abort
    ///         creation — the v1 compatibility-refusal mechanism, NOT guarded). Shared by the plain
    ///         and deposit-then-create paths; internal so both inline it (no self-external-call).
    function _createCore(
        CommitmentManagerStorage.Layout storage s,
        address committer,
        ICM.CommitmentParams calldata params
    ) internal returns (uint256 commitmentId) {
        // --- Exposure allocation invariant, per (committer, token) (ERC §C.2 / INV-3) ---
        uint256 exposure = ExposureLib.exposureOf(params.amount, params.maxPenaltyBps);
        ICM.UserExposure storage mag = s.userExposures[committer][params.token];
        if (mag.totalForfeitable + exposure > mag.totalEncumbered + params.amount) {
            revert ICM.ExposureAllocationExceeded();
        }

        // --- Encumber from free balance (manager-internal ledger op, ERC §A.3) ---
        LedgerLib.encumber(s, params.token, committer, params.amount);
        ExposureLib.increment(s, committer, params.token, params.amount, exposure);

        // --- Store ---
        commitmentId = s.nextCommitmentId++;
        _storeCommitment(s, commitmentId, committer, params);
        s.userCommitmentIds[committer].push(commitmentId);

        _bindStrategies(s, commitmentId, params);
    }

    /// @dev Bind strategies in array order (immutable post-create); binding params are NOT
    ///      persisted — delivered via the creation context and the binding event only.
    ///      Separate frame for stack headroom.
    function _bindStrategies(
        CommitmentManagerStorage.Layout storage s,
        uint256 commitmentId,
        ICM.CommitmentParams calldata params
    ) private {
        uint256 n = params.strategies.length;
        for (uint256 i; i < n; i++) {
            address strategy = params.strategies[i].strategy;
            if (strategy == address(0)) revert ICM.ZeroAddress();
            if (s.isBoundStrategy[commitmentId][strategy]) revert ICM.DuplicateStrategy();
            s.isBoundStrategy[commitmentId][strategy] = true;
            s.commitmentStrategies[commitmentId].push(strategy);
            emit ICM.CommitmentBoundToStrategy(commitmentId, strategy, params.strategies[i].params);

            IDistributionStrategy(strategy)
                .onCommitmentCreated(
                    CreatedContext({
                        base: MovementLib.baseContext(s, commitmentId),
                        originalAmount: params.amount,
                        maxPenaltyBps: params.maxPenaltyBps,
                        challengeWindow: params.challengeWindow,
                        strategyParams: params.strategies[i].params
                    })
                );
        }
    }

    /// @dev Input validation (ERC §C.1). Separate frame for stack headroom.
    function _validateCreateParams(
        ICM.CommitmentParams calldata params,
        uint64 minChallengeWindow,
        uint256 maxStrategies,
        uint256 maxURILength
    ) private view {
        if (params.arbiter == address(0)) revert ICM.ZeroArbiter();
        if (params.counterparty == address(0)) revert ICM.ZeroCounterparty();
        if (params.token == address(0) || params.adapter == address(0)) revert ICM.ZeroAddress();
        if (params.amount == 0) revert ICM.ZeroAmount();
        if (params.maxPenaltyBps > BPS_DENOMINATOR) revert ICM.PenaltyExceedsMax();
        if (params.challengeWindow < minChallengeWindow) revert ICM.ChallengeWindowTooShort();
        if (params.expiresAt != 0 && params.expiresAt <= block.timestamp) revert ICM.InvalidExpiry();
        if (params.strategies.length > maxStrategies) revert ICM.TooManyStrategies();
        if (bytes(params.metadataURI).length > maxURILength) revert ICM.URITooLong();
    }

    /// @dev Field-by-field store + creation event. Separate frame for stack headroom.
    function _storeCommitment(
        CommitmentManagerStorage.Layout storage s,
        uint256 commitmentId,
        address committer,
        ICM.CommitmentParams calldata params
    ) private {
        ICM.Commitment storage c = s.commitments[commitmentId];
        c.committer = committer;
        c.arbiter = params.arbiter;
        c.counterparty = params.counterparty;
        c.token = params.token;
        c.adapter = params.adapter;
        c.amount = params.amount;
        c.maxPenaltyBps = params.maxPenaltyBps;
        c.challengeWindow = params.challengeWindow;
        c.createdAt = uint64(block.timestamp);
        c.expiresAt = params.expiresAt;
        c.metadataURI = params.metadataURI;
        c.metadataHash = params.metadataHash;
        // Anchors the expiry clock-stop. Written only when an expiry exists: the field opens a
        // fresh storage slot, and an expiry-less commitment (agreement legs included) never reads it.
        if (params.expiresAt != 0) c.cumulativePausedAtStart = PauseLib.creditablePaused(s);

        emit ICM.CommitmentCreated(
            commitmentId,
            committer,
            params.arbiter,
            params.counterparty,
            params.token,
            params.adapter,
            params.amount,
            params.maxPenaltyBps,
            params.challengeWindow,
            params.expiresAt,
            params.metadataURI,
            params.metadataHash
        );
    }

    // =========================================================================
    // Release / expire (ERC §C.1)
    // =========================================================================

    /// @notice Arbiter-immediate release: release hooks (guarded) first, then free.
    function releaseCore(CommitmentManagerStorage.Layout storage s, uint256 commitmentId) external {
        ICM.Commitment storage c = s.commitments[commitmentId];
        if (msg.sender != c.arbiter) revert ICM.NotArbiter();
        if (c.released || c.forfeited) revert ICM.CommitmentInactive();
        if (s.commitmentToAgreement[commitmentId] != 0) revert ICM.UseAgreementPath();

        uint256 amount = c.amount; // captured pre-close (the close zeroes the tracker)
        _closeWithHooks(s, commitmentId);
        emit ICM.CommitmentReleased(commitmentId, msg.sender);
        _notifyRegistryRelease(s, commitmentId, amount);
    }

    /// @notice Committer self-release after expiry.
    function expireCore(CommitmentManagerStorage.Layout storage s, uint256 commitmentId) external {
        ICM.Commitment storage c = s.commitments[commitmentId];
        if (msg.sender != c.committer) revert ICM.NotCommitter();
        if (c.released || c.forfeited) revert ICM.CommitmentInactive();
        if (c.expiresAt == 0) revert ICM.CommitmentHasNoExpiry();
        // Clock-stop (ERC §A.6 erratum): the expiry span elapses in effective time, so a pause —
        // during which forfeit execution is inoperable — cannot deliver a committer to
        // self-release while the arbiter's recourse is frozen.
        if (PauseLib.effectiveElapsed(s, c.createdAt, c.cumulativePausedAtStart) < c.expiresAt - c.createdAt) {
            revert ICM.CommitmentNotExpired();
        }
        if (_forfeitActive(s, commitmentId)) revert ICM.ForfeitPending();

        uint256 amount = c.amount;
        _closeWithHooks(s, commitmentId);
        emit ICM.CommitmentExpired(commitmentId, c.committer);
        _notifyRegistryRelease(s, commitmentId, amount);
    }

    /// @notice Close with guarded release hooks — shared by release/expire/finalize and
    ///         the agreements extension. Silently no-ops on resolved commitments.
    function closeWithHooks(CommitmentManagerStorage.Layout storage s, uint256 commitmentId) external {
        _closeWithHooks(s, commitmentId);
    }

    function _closeWithHooks(CommitmentManagerStorage.Layout storage s, uint256 commitmentId) internal {
        ICM.Commitment storage c = s.commitments[commitmentId];
        if (c.released || c.forfeited) return;

        // INV-G8 / OBJ-5: a member commitment must never be terminally closed through the normal
        // path — it would use the bps-derived decrement and skip mutual accounting, leaving
        // `totalShares` stale and re-spending units the mutual still expects to draw as `E_i`. The
        // gate lives HERE (the single convergence point of release/expire/finalize/agreement)
        // rather than on the named cores, so every higher path inherits it. Member members exit
        // only via `requestMutualExit` → `releaseMutualMember` (MutualLib).
        if (s.membership[commitmentId].mutualId != 0) revert ICM.CommitmentInMutual();

        // Guarded onCommitmentReleased hooks run BEFORE the encumbrance frees, so strategies
        // take their final accrual sweep against the still-encumbered position (§C.1 / §D.6).
        MovementLib._runGuardedHooks(s, commitmentId, HOOK_RELEASED);

        c.released = true;
        if (s.unbondInitiatedAt[commitmentId] != 0) s.unbondInitiatedAt[commitmentId] = 0;
        s.closedAt[commitmentId] = uint64(block.timestamp);

        uint256 exposure = ExposureLib.exposureOf(c.amount, c.maxPenaltyBps);
        ExposureLib.decrement(s, c.committer, c.token, c.amount, exposure);

        if (c.amount > 0) LedgerLib.releaseEncumbrance(s, commitmentId, c.token, c.committer, c.amount);
        // Zero the live-amount tracker: nothing remains reserved under this commitment, and a
        // post-close hook re-drive (sweepFailedHook) must find no FromEncumbered* headroom —
        // a non-zero stale amount would let a re-driven hook debit encumbrance that now backs
        // OTHER commitments. Historical amounts live in the event stream.
        c.amount = 0;
    }

    // =========================================================================
    // Two-phase forfeit (ERC §C.3 / §C.4)
    // =========================================================================

    /// @notice Phase 1: arbiter-only proposal with challenge-window timer.
    function initiateForfeitCore(CommitmentManagerStorage.Layout storage s, uint256 commitmentId, uint16 penaltyBps)
        external
    {
        ICM.Commitment storage c = s.commitments[commitmentId];
        if (msg.sender != c.arbiter) revert ICM.NotArbiter();
        if (c.released || c.forfeited) revert ICM.CommitmentInactive();
        if (s.commitmentToAgreement[commitmentId] != 0) revert ICM.UseAgreementPath();
        // INV-G8: a member commitment is forfeited only through its mutual's shared-loss index,
        // never via the single-commitment two-phase path (that would double-spend its `E_i`).
        if (s.membership[commitmentId].mutualId != 0) revert ICM.CommitmentInMutual();
        if (penaltyBps > c.maxPenaltyBps) revert ICM.PenaltyExceedsMax();
        if (_forfeitActive(s, commitmentId)) revert ICM.ForfeitPending();

        writeForfeitProposal(s, commitmentId, penaltyBps, c.challengeWindow);
    }

    /// @notice The single writer of a fresh ForfeitProposal (+ its event) — shared with the
    ///         agreements extension so the pause-erratum snapshot semantics cannot drift between
    ///         the direct and agreement-leg initiation paths.
    /// @dev Internal (inlined into both libraries). Callers own ALL validation; this only writes.
    function writeForfeitProposal(
        CommitmentManagerStorage.Layout storage s,
        uint256 commitmentId,
        uint16 penaltyBps,
        uint64 challengeWindow
    ) internal {
        s.forfeitProposals[commitmentId] = ICM.ForfeitProposal({
            penaltyBps: penaltyBps,
            initiatedAt: uint64(block.timestamp),
            executed: false,
            cancelled: false,
            cumulativePausedAtStart: PauseLib.creditablePaused(s)
        });
        emit ICM.ForfeitInitiated(commitmentId, penaltyBps, challengeWindow);
    }

    /// @notice Phase 2, in §C.3 order: terminal effects + full exposure decrement, the
    ///         unconditional manager-internal forfeit transfer, guarded onCommitmentForfeited hooks
    ///         against the residual, residual return, event, registry hook.
    function executeForfeitFull(CommitmentManagerStorage.Layout storage s, uint256 commitmentId) external {
        (uint256 unitsToForfeit, address counterparty, uint256 fullAmount) = _forfeitEffects(s, commitmentId);

        // Guarded hooks, strictly after the transfer (§C.3 step 3 / §D.6).
        MovementLib._runGuardedHooks(s, commitmentId, HOOK_FORFEITED);

        // Return what the hooks left, then zero the tracker (no post-close headroom).
        ICM.Commitment storage c = s.commitments[commitmentId];
        if (c.amount > 0) LedgerLib.releaseEncumbrance(s, commitmentId, c.token, c.committer, c.amount);
        c.amount = 0;

        emit ICM.ForfeitExecuted(commitmentId, unitsToForfeit, counterparty);
        _notifyRegistryForfeit(s, commitmentId, unitsToForfeit, fullAmount);
    }

    /// @dev §C.3 steps 1–2: validation, terminal effects, full exposure decrement, and the
    ///      unconditional forfeit transfer. Separate frame for stack headroom.
    function _forfeitEffects(CommitmentManagerStorage.Layout storage s, uint256 commitmentId)
        private
        returns (uint256 unitsToForfeit, address counterparty, uint256 fullAmount)
    {
        ICM.Commitment storage c = s.commitments[commitmentId];
        ICM.ForfeitProposal storage p = s.forfeitProposals[commitmentId];

        if (p.initiatedAt == 0 || p.executed || p.cancelled) revert ICM.NoActiveForfeitProposal();
        // Clock-stop (ERC §A.6 erratum): the challenge window elapses in effective time, so a
        // pause cannot burn down the committer's contest time while contesting-by-unbond and the
        // execute below are both inoperable.
        if (PauseLib.effectiveElapsed(s, p.initiatedAt, p.cumulativePausedAtStart) < c.challengeWindow) {
            revert ICM.ChallengeWindowActive();
        }
        if (s.forfeiturePaused) revert ICM.ForfeitureIsPaused();
        if (c.released || c.forfeited) revert ICM.CommitmentInactive(); // INV-6 terminal exclusivity

        fullAmount = c.amount;
        uint256 exposure = ExposureLib.exposureOf(fullAmount, c.maxPenaltyBps);
        unitsToForfeit = ExposureLib.exposureOf(fullAmount, p.penaltyBps);
        counterparty = c.counterparty;

        // --- Effects (CEI) ---
        p.executed = true;
        c.forfeited = true;
        if (s.unbondInitiatedAt[commitmentId] != 0) s.unbondInitiatedAt[commitmentId] = 0;
        s.closedAt[commitmentId] = uint64(block.timestamp);
        s.forfeitedUnits[commitmentId] = unitsToForfeit;

        // Full exposure decrement (§C.3 step 1).
        ExposureLib.decrement(s, c.committer, c.token, fullAmount, exposure);

        // Unconditional forfeit transfer — pure ledger arithmetic, pull-payment (§C.3 step 2).
        if (unitsToForfeit > 0) LedgerLib.forfeitTransfer(s, c.token, c.committer, counterparty, unitsToForfeit);
        // The residual stays encumbered while forfeit hooks run; c.amount tracks it (§D.4 caps).
        c.amount = fullAmount - unitsToForfeit;
    }

    /// @notice Arbiter-only cancel of a pending proposal.
    function cancelForfeitCore(CommitmentManagerStorage.Layout storage s, uint256 commitmentId) external {
        ICM.Commitment storage c = s.commitments[commitmentId];
        ICM.ForfeitProposal storage p = s.forfeitProposals[commitmentId];
        if (msg.sender != c.arbiter) revert ICM.NotArbiter();
        if (p.initiatedAt == 0 || p.executed || p.cancelled) revert ICM.NoActiveForfeitProposal();

        p.cancelled = true;
        emit ICM.ForfeitCancelled(commitmentId);
    }

    /// @notice Permissionless force-cancel after the TTL (ERC §C.4).
    function cancelStaleCore(CommitmentManagerStorage.Layout storage s, uint256 commitmentId, uint64 ttl) external {
        ICM.Commitment storage c = s.commitments[commitmentId];
        ICM.ForfeitProposal storage p = s.forfeitProposals[commitmentId];
        if (p.initiatedAt == 0 || p.executed || p.cancelled) revert ICM.NoActiveForfeitProposal();
        // ANTI-PIN (ERC §A.6 erratum): see PauseLib.staleAt — a pause spanning any horizon still
        // frees a pinned committer within the budget-bounded stale horizon.
        if (block.timestamp < PauseLib.staleAt(s, p.initiatedAt, c.challengeWindow, p.cumulativePausedAtStart, ttl)) {
            revert ICM.ChallengeWindowActive();
        }

        p.cancelled = true;
        emit ICM.ForfeitCancelledStale(commitmentId);
    }

    // =========================================================================
    // Committer-initiated unbond (ERC §C.5)
    // =========================================================================

    /// @notice Committer-only unbond start; propagates to an agreed partner symmetrically.
    function requestUnbondCore(CommitmentManagerStorage.Layout storage s, uint256 commitmentId) external {
        ICM.Commitment storage c = s.commitments[commitmentId];
        if (msg.sender != c.committer) revert ICM.NotCommitter();
        if (c.released || c.forfeited) revert ICM.CommitmentInactive();
        if (s.unbondInitiatedAt[commitmentId] != 0) revert ICM.UnbondAlreadyRequested();
        // Member members exit via requestMutualExit (deallocation window), not the normal unbond.
        if (s.membership[commitmentId].mutualId != 0) revert ICM.CommitmentInMutual();

        initiateUnbondIdempotent(s, commitmentId);
        (bool agreed, uint256 partnerId) = _partnerCommitmentId(s, commitmentId);
        if (agreed) initiateUnbondIdempotent(s, partnerId);
    }

    /// @notice Permissionless finalize after maturity; blocked by an active forfeit proposal.
    function finalizeUnbondCore(CommitmentManagerStorage.Layout storage s, uint256 commitmentId) external {
        ICM.Commitment storage c = s.commitments[commitmentId];
        uint64 initiatedAt = s.unbondInitiatedAt[commitmentId];
        if (initiatedAt == 0) revert ICM.NoUnbondPending();
        if (c.released || c.forfeited) revert ICM.CommitmentInactive();

        // Clock-stop (ERC §A.6 erratum): the unbonding period elapses in effective time, so a
        // committer cannot wait out its exit delay during a pause in which the losses the delay
        // exists to absorb are inoperable. `maturesAt` reports the current best-known maturity
        // (it moves out if further pause episodes accrue credit).
        uint64 maturesAt = initiatedAt + s.unbondingPeriod
            + uint64(PauseLib.pauseCreditSince(s, s.unbondCumulativePausedAtStart[commitmentId]));
        if (block.timestamp < maturesAt) revert ICM.UnbondNotElapsed(maturesAt);
        if (_forfeitActive(s, commitmentId)) revert ICM.UnbondBlockedByForfeit();

        uint256 amount = c.amount;
        _closeWithHooks(s, commitmentId);
        emit ICM.CommitmentFinalized(commitmentId);
        _notifyRegistryRelease(s, commitmentId, amount);
    }

    /// @notice Committer-only cancel; an agreed partner's unbond cancels symmetrically.
    function cancelUnbondCore(CommitmentManagerStorage.Layout storage s, uint256 commitmentId) external {
        ICM.Commitment storage c = s.commitments[commitmentId];
        if (msg.sender != c.committer) revert ICM.NotCommitter();
        if (s.unbondInitiatedAt[commitmentId] == 0) revert ICM.NoUnbondPending();
        if (c.released || c.forfeited) revert ICM.CommitmentInactive();

        s.unbondInitiatedAt[commitmentId] = 0;
        emit ICM.CommitmentUnbondCancelled(commitmentId);

        (bool agreed, uint256 partnerId) = _partnerCommitmentId(s, commitmentId);
        if (agreed && s.unbondInitiatedAt[partnerId] != 0) {
            s.unbondInitiatedAt[partnerId] = 0;
            emit ICM.CommitmentUnbondCancelled(partnerId);
        }
    }

    /// @notice Idempotent unbond start: skips resolved or already-unbonding commitments.
    function initiateUnbondIdempotent(CommitmentManagerStorage.Layout storage s, uint256 commitmentId) private {
        ICM.Commitment storage c = s.commitments[commitmentId];
        if (c.released || c.forfeited) return;
        if (s.unbondInitiatedAt[commitmentId] != 0) return;

        s.unbondInitiatedAt[commitmentId] = uint64(block.timestamp);
        s.unbondCumulativePausedAtStart[commitmentId] = PauseLib.creditablePaused(s);
        // The emitted maturity is the no-further-pause estimate; clock-stop can move it out.
        emit ICM.CommitmentUnbondRequested(commitmentId, c.committer, uint64(block.timestamp) + s.unbondingPeriod);
    }

    // =========================================================================
    // Shared internals
    // =========================================================================

    function _forfeitActive(CommitmentManagerStorage.Layout storage s, uint256 commitmentId)
        private
        view
        returns (bool)
    {
        ICM.ForfeitProposal storage p = s.forfeitProposals[commitmentId];
        return p.initiatedAt != 0 && !p.cancelled && !p.executed;
    }

    /// @dev Agreement ids are 1-indexed; 0 in `commitmentToAgreement` = not agreed.
    function _partnerCommitmentId(CommitmentManagerStorage.Layout storage s, uint256 commitmentId)
        private
        view
        returns (bool agreed, uint256 partnerId)
    {
        uint256 agreementId = s.commitmentToAgreement[commitmentId];
        if (agreementId == 0) return (false, 0);
        uint256[2] storage pair = s.agreementPairs[agreementId];
        partnerId = pair[0] == commitmentId ? pair[1] : pair[0];
        agreed = true;
    }

    /// @dev A swallowed hook failure emits RegistryHookFailed; the registry's stake for that
    ///      commitment is then stale until `OperatorRegistry.reconcile` repairs it. The call is
    ///      gas-capped and min-gas-guarded exactly like the strategy hooks (MovementLib §D.6
    ///      rule 3): a buggy or malicious registry cannot burn unbounded gas to grief the lifecycle
    ///      transition, and a caller cannot hand-tune gas so the notification silently parks (a
    ///      swallowed out-of-gas) while the release/forfeit still lands.
    function _notifyRegistryRelease(CommitmentManagerStorage.Layout storage s, uint256 commitmentId, uint256 amount)
        private
    {
        address reg = s.operatorRegistry;
        if (reg == address(0)) return;
        uint256 cap = _registryHookCap(s);
        try IOperatorRegistryHooks(reg).onDelegationReleased{gas: cap}(commitmentId, amount) {}
        catch {
            emit ICM.RegistryHookFailed(commitmentId, IOperatorRegistryHooks.onDelegationReleased.selector);
        }
    }

    function _notifyRegistryForfeit(
        CommitmentManagerStorage.Layout storage s,
        uint256 commitmentId,
        uint256 forfeitedAmount,
        uint256 fullAmount
    ) private {
        address reg = s.operatorRegistry;
        if (reg == address(0)) return;
        uint256 cap = _registryHookCap(s);
        try IOperatorRegistryHooks(reg).onDelegationForfeited{gas: cap}(commitmentId, forfeitedAmount, fullAmount) {}
        catch {
            emit ICM.RegistryHookFailed(commitmentId, IOperatorRegistryHooks.onDelegationForfeited.selector);
        }
    }

    /// @dev Resolve the per-hook gas cap (shared config with the strategy hooks; lazy default
    ///      MovementLib.HOOK_GAS_CAP_FLOOR when unset) and apply the §D.6 rule-3 min-gas guard.
    ///      Under EIP-150 the callee receives at most 63/64 of gasleft, so if the frame cannot
    ///      genuinely receive the full cap the WHOLE transaction reverts — the notification is
    ///      never silently starved while the lifecycle transition commits.
    function _registryHookCap(CommitmentManagerStorage.Layout storage s) private view returns (uint256 cap) {
        uint64 stored = s.hookGasCap;
        cap = stored == 0 ? MovementLib.HOOK_GAS_CAP_FLOOR : stored;
        if (gasleft() < cap + cap / 63 + MovementLib.HOOK_GAS_RESERVE) revert ICM.InsufficientGasForHook();
    }
}
