// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

import {ICommitmentManager as ICM} from "src/core/interfaces/ICommitmentManager.sol";
import {
    IDistributionStrategy,
    TokenMovement,
    MovementKind,
    BaseContext,
    DistributeContext,
    ClaimContext,
    LifecycleContext,
    ForfeitContext
} from "src/core/interfaces/IDistributionStrategy.sol";
import {CommitmentManagerStorage} from "src/core/manager/storage/CommitmentManagerStorage.sol";
import {ExposureLib} from "src/core/manager/libraries/ExposureLib.sol";
import {LedgerLib} from "src/core/manager/libraries/LedgerLib.sol";

/// @notice The call site a movement batch came from. Determines the allowed kinds (ERC §D.4)
///         and whether exposure effects apply (skipped on the Forfeited site — the commitment's
///         full exposure contribution was already removed in §C.3 step 1).
enum MovementSite {
    Distribute,
    Claim,
    Released,
    Forfeited
}

/// @dev Lifecycle-hook discriminators shared by the manager's guarded frames and the library.
///      HOOK_DISTRIBUTE is the guarded pre-settle distribute of the agreements extension —
///      unlike the lifecycle hooks it leaves no failure marker (distribute is permissionlessly
///      re-runnable at any time).
uint8 constant HOOK_RELEASED = 0;
uint8 constant HOOK_FORFEITED = 1;
uint8 constant HOOK_DISTRIBUTE = 2;

/// @dev The guarded-frame target on the manager. Under delegatecall `address(this)` is the
///      manager, so a library can establish the guarded frame itself: the external self-call
///      arrives with `msg.sender == manager`, satisfying the frame's self-only auth.
interface IHookRunner {
    function __runStrategyHook(uint256 commitmentId, address strategy, uint8 hook) external;
}

/// @title MovementLib
/// @notice The sole apply path for strategy-emitted TokenMovements (ERC §D.5). External
///         delegatecall library: validation and application execute in the manager's storage
///         and event context, inside whatever revert frame the caller establishes (entry-point
///         calls bubble; guarded lifecycle frames fail as a unit, §D.6).
/// @dev Trust boundary: `strategy` is taken from the manager's own call frame — never from the
///      movement. A strategy can only touch (a) the bound commitment's committer's encumbered
///      position, capped by that commitment's live amount (INV-4), and (b) its own escrow
///      (INV-5). Recipients are restricted to the commitment's parties.
library MovementLib {
    using SafeERC20 for IERC20;

    /// @dev ERC §0.3 — SHOULD-level floor on the per-hook gas cap (§D.6); lazy default when
    ///      the stored config is 0.
    uint64 internal constant HOOK_GAS_CAP_FLOOR = 500_000;
    /// @dev Gas reserved for post-hook bookkeeping when sizing the min-gas guard (§D.6 rule 3).
    uint64 internal constant HOOK_GAS_RESERVE = 50_000;

    // =========================================================================
    // Guarded lifecycle frames (ERC §D.6)
    // =========================================================================

    /// @notice Run every bound strategy's lifecycle hook in array order, each in its own
    ///         guarded frame. A failed frame parks that strategy's in-flight accrual and never
    ///         blocks the lifecycle transition.
    function runGuardedHooks(CommitmentManagerStorage.Layout storage s, uint256 commitmentId, uint8 hook) external {
        _runGuardedHooks(s, commitmentId, hook);
    }

    /// @dev Internal twin so sibling external functions in this library (and other libraries
    ///      via the external wrapper) share one implementation.
    function _runGuardedHooks(CommitmentManagerStorage.Layout storage s, uint256 commitmentId, uint8 hook) internal {
        address[] storage strategies = s.commitmentStrategies[commitmentId];
        uint256 n = strategies.length;
        for (uint256 i; i < n; i++) {
            _guardedCall(s, commitmentId, strategies[i], hook);
        }
    }

    /// @notice One guarded frame (external for sweepFailedHook and the pre-settle distribute).
    function guardedCall(CommitmentManagerStorage.Layout storage s, uint256 commitmentId, address strategy, uint8 hook)
        external
    {
        _guardedCall(s, commitmentId, strategy, hook);
    }

    /// @dev Min-gas guard + capped external self-call wrapping {strategy call + movement
    ///      validation + application} + park-don't-forfeit failure disposition.
    function _guardedCall(CommitmentManagerStorage.Layout storage s, uint256 commitmentId, address strategy, uint8 hook)
        internal
    {
        uint64 stored = s.hookGasCap;
        uint256 cap = stored == 0 ? HOOK_GAS_CAP_FLOOR : stored;

        // Min-gas guard (§D.6 rule 3): under EIP-150 the callee receives at most 63/64 of
        // gasleft. If the frame cannot genuinely receive the full cap, revert the WHOLE
        // transaction — a caller cannot hand-tune gas so hooks starve while the forfeit lands.
        if (gasleft() < cap + cap / 63 + HOOK_GAS_RESERVE) revert ICM.InsufficientGasForHook();

        try IHookRunner(address(this)).__runStrategyHook{gas: cap}(commitmentId, strategy, hook) {
            if (hook != HOOK_DISTRIBUTE && s.failedHookSelector[commitmentId][strategy] != bytes4(0)) {
                delete s.failedHookSelector[commitmentId][strategy];
            }
        } catch {
            bytes4 sel;
            if (hook == HOOK_FORFEITED) {
                sel = IDistributionStrategy.onCommitmentForfeited.selector;
            } else if (hook == HOOK_DISTRIBUTE) {
                sel = IDistributionStrategy.distribute.selector;
            } else {
                sel = IDistributionStrategy.onCommitmentReleased.selector;
            }
            // The pre-settle distribute leaves no marker: distribute is permissionlessly
            // re-runnable, so a marker would only add state to clean up.
            if (hook != HOOK_DISTRIBUTE) s.failedHookSelector[commitmentId][strategy] = sel;
            emit ICM.StrategyHookFailed(commitmentId, strategy, sel);
        }
    }

    // =========================================================================
    // Engine entry cores (called by the manager's thin wrappers via DELEGATECALL)
    // =========================================================================

    /// @notice Core of `manager.distribute(id, strategy)`: guard (bound strategy, active,
    ///         un-forfeited), then build the context, call the strategy, validate + apply. Reverts
    ///         bubble to the entry point (ERC §D.3).
    /// @dev Under delegatecall `msg.sender` is the manager's caller — the permissionless distribute
    ///      trigger — which is what DistributeContext.caller carries (via `_distributeInto`).
    function distributeGuardedCore(CommitmentManagerStorage.Layout storage s, uint256 commitmentId, address strategy)
        external
    {
        if (!s.isBoundStrategy[commitmentId][strategy]) revert ICM.UnknownStrategy();
        _requireActiveNoForfeit(s, commitmentId);
        _distributeInto(s, commitmentId, strategy);
    }

    /// @notice Core of `manager.claim(id, strategy, claimData)`.
    function claimCore(
        CommitmentManagerStorage.Layout storage s,
        uint256 commitmentId,
        address strategy,
        bytes calldata claimData
    ) external {
        TokenMovement[] memory moves = IDistributionStrategy(strategy).claim(claimContext(s, commitmentId), claimData);
        _validateAndApply(s, commitmentId, strategy, moves, MovementSite.Claim);
    }

    /// @dev Reverts unless the commitment is active (not released/forfeited) and carries no live
    ///      forfeit proposal — the guard the `distribute` site requires. Mirrors the manager's
    ///      `_checkActiveNoForfeit`; hosted here so the distribute-family cores share one copy.
    function _requireActiveNoForfeit(CommitmentManagerStorage.Layout storage s, uint256 commitmentId) private view {
        ICM.Commitment storage c = s.commitments[commitmentId];
        if (c.released || c.forfeited) revert ICM.CommitmentInactive();
        ICM.ForfeitProposal storage p = s.forfeitProposals[commitmentId];
        if (p.initiatedAt != 0 && !p.cancelled && !p.executed) revert ICM.ForfeitPending();
    }

    /// @dev Run one strategy's distribute leg (mirrors distributeOne). Inlined at call sites below
    ///      because a library cannot internally call its own `external` functions.
    function _distributeInto(CommitmentManagerStorage.Layout storage s, uint256 commitmentId, address strategy)
        private
    {
        TokenMovement[] memory moves = IDistributionStrategy(strategy)
            .distribute(DistributeContext({base: baseContext(s, commitmentId), caller: msg.sender}));
        _validateAndApply(s, commitmentId, strategy, moves, MovementSite.Distribute);
    }

    /// @notice Core of `manager.distributeAll(id)`: fold distribute over the commitment's bound
    ///         strategies in array order. Active + un-forfeited required (the distribute leg does).
    function distributeAllCore(CommitmentManagerStorage.Layout storage s, uint256 commitmentId) external {
        _requireActiveNoForfeit(s, commitmentId);
        address[] storage strategies = s.commitmentStrategies[commitmentId];
        uint256 n = strategies.length;
        for (uint256 i; i < n; i++) {
            _distributeInto(s, commitmentId, strategies[i]);
        }
    }

    /// @notice Core of `manager.distributeAndClaim(id, strategy, claimData)`: advance the strategy's
    ///         accrual then claim it, as one revertable unit. Mirrors the manager's `distribute`
    ///         guards (bound strategy, active, un-forfeited) — the distribute leg requires them —
    ///         before running distribute and claim back to back.
    function distributeAndClaimCore(
        CommitmentManagerStorage.Layout storage s,
        uint256 commitmentId,
        address strategy,
        bytes calldata claimData
    ) external {
        if (!s.isBoundStrategy[commitmentId][strategy]) revert ICM.UnknownStrategy();
        _requireActiveNoForfeit(s, commitmentId);

        // Distribute leg, then claim leg (mirrors claimCore). Inlined because a library cannot
        // internally call its own `external` functions.
        _distributeInto(s, commitmentId, strategy);
        TokenMovement[] memory claimMoves =
            IDistributionStrategy(strategy).claim(claimContext(s, commitmentId), claimData);
        _validateAndApply(s, commitmentId, strategy, claimMoves, MovementSite.Claim);
    }

    /// @notice Core of the guarded `__runStrategyHook` frame: build the lifecycle context, call
    ///         the strategy, validate + apply — one revertable unit (ERC §D.6 rule 1).
    function runHook(CommitmentManagerStorage.Layout storage s, uint256 commitmentId, address strategy, uint8 hook)
        external
    {
        TokenMovement[] memory moves;
        if (hook == HOOK_FORFEITED) {
            ICM.Commitment storage c = s.commitments[commitmentId];
            moves = IDistributionStrategy(strategy)
                .onCommitmentForfeited(
                    ForfeitContext({
                    base: baseContext(s, commitmentId),
                    penaltyBps: s.forfeitProposals[commitmentId].penaltyBps,
                    forfeitRecipient: c.counterparty,
                    forfeitedUnits: s.forfeitedUnits[commitmentId]
                })
                );
            _validateAndApply(s, commitmentId, strategy, moves, MovementSite.Forfeited);
        } else if (hook == HOOK_DISTRIBUTE) {
            moves = IDistributionStrategy(strategy)
                .distribute(DistributeContext({base: baseContext(s, commitmentId), caller: msg.sender}));
            _validateAndApply(s, commitmentId, strategy, moves, MovementSite.Distribute);
        } else {
            moves = IDistributionStrategy(strategy)
                .onCommitmentReleased(LifecycleContext({base: baseContext(s, commitmentId)}));
            _validateAndApply(s, commitmentId, strategy, moves, MovementSite.Released);
        }
    }

    /// @notice Shared context head for every strategy hook (ERC §D.1).
    function baseContext(CommitmentManagerStorage.Layout storage s, uint256 commitmentId)
        internal
        view
        returns (BaseContext memory)
    {
        ICM.Commitment storage c = s.commitments[commitmentId];
        return BaseContext({
            commitmentId: commitmentId,
            adapter: c.adapter,
            token: c.token,
            committer: c.committer,
            counterparty: c.counterparty,
            currentEncumbered: c.amount,
            timestamp: uint64(block.timestamp)
        });
    }

    /// @notice Claim/pending context (ERC §D.1). `closedAt` is 0 while active.
    function claimContext(CommitmentManagerStorage.Layout storage s, uint256 commitmentId)
        internal
        view
        returns (ClaimContext memory)
    {
        return
            ClaimContext({base: baseContext(s, commitmentId), caller: msg.sender, closedAt: s.closedAt[commitmentId]});
    }

    /// @notice Core of the `manager.pending` view.
    function pendingCore(
        CommitmentManagerStorage.Layout storage s,
        uint256 commitmentId,
        address strategy,
        bytes calldata claimData
    ) external view returns (uint256) {
        return IDistributionStrategy(strategy).pending(claimContext(s, commitmentId), claimData);
    }

    // =========================================================================
    // Validation + application (ERC §D.5)
    // =========================================================================

    /// @dev Validate and apply one strategy's movement batch. Reverts a specific `Movement*`
    ///      error on any rule violation — the entire batch fails as a unit (the caller's frame
    ///      supplies atomicity).
    function _validateAndApply(
        CommitmentManagerStorage.Layout storage s,
        uint256 commitmentId,
        address strategy,
        TokenMovement[] memory moves,
        MovementSite site
    ) private {
        uint256 n = moves.length;
        for (uint256 i; i < n; i++) {
            _applyOne(s, commitmentId, strategy, moves[i], site);
        }
    }

    function _applyOne(
        CommitmentManagerStorage.Layout storage s,
        uint256 commitmentId,
        address strategy,
        TokenMovement memory m,
        MovementSite site
    ) private {
        if (m.units == 0) revert ICM.MovementZeroUnits();
        ICM.Commitment storage c = s.commitments[commitmentId];

        if (m.kind == MovementKind.FromEncumberedToEscrow || m.kind == MovementKind.FromEncumberedToExternal) {
            _applyFromEncumbered(s, c, commitmentId, strategy, m, site);
        } else {
            _applyFromEscrow(s, c, commitmentId, strategy, m, site);
        }
    }

    /// @dev FromEncumbered*: accrual/direct-payout against the committer's encumbered position.
    ///      Per-batch cumulative cap == `c.amount` at call entry holds structurally: every debit
    ///      shrinks `c.amount`, so per-move `units ≤ c.amount` bounds the running total (INV-4).
    function _applyFromEncumbered(
        CommitmentManagerStorage.Layout storage s,
        ICM.Commitment storage c,
        uint256 commitmentId,
        address strategy,
        TokenMovement memory m,
        MovementSite site
    ) private {
        // --- Site matrix (ERC §D.4) ---
        if (m.kind == MovementKind.FromEncumberedToEscrow) {
            if (site == MovementSite.Claim) revert ICM.MovementToEscrowNotAllowedOnClaim();
        } else {
            // FromEncumberedToExternal: distribute only.
            if (site != MovementSite.Distribute) revert ICM.MovementToExternalOnlyOnDistribute();
        }

        // --- Allow-list (ERC §D.5) ---
        if (m.from != c.committer) revert ICM.MovementFromNotCommitter(m.from, c.committer);
        if (m.token != c.token) revert ICM.MovementWrongToken(m.token, c.token);
        if (m.kind == MovementKind.FromEncumberedToEscrow) {
            if (m.to != strategy) revert ICM.MovementEscrowRecipientNotStrategy(m.to, strategy);
        } else {
            if (m.to != c.committer && m.to != c.counterparty) revert ICM.MovementRecipientNotParty(m.to);
        }

        // --- Caps ---
        if (m.units > c.amount) revert ICM.MovementExceedsCommitment(m.units, c.amount);
        // Defense-in-depth: the distribute entry point already rejects while a forfeit proposal
        // is active (§D.3); the encumbered position is spoken for until the proposal resolves.
        if (site == MovementSite.Distribute) {
            ICM.ForfeitProposal storage p = s.forfeitProposals[commitmentId];
            if (p.initiatedAt != 0 && !p.cancelled && !p.executed) revert ICM.MovementBlockedByForfeit();
        }

        // --- Manager-applied exposure-preserving shrink (never strategy-supplied, §D.5) ---
        // On the Forfeited site the commitment's full exposure contribution was already removed
        // (§C.3 step 1), so only the residual tracker shrinks.
        if (site == MovementSite.Forfeited) {
            c.amount -= m.units;
        } else {
            uint256 expPre = ExposureLib.exposureOf(c.amount, c.maxPenaltyBps);
            c.amount -= m.units;
            uint256 expPost = ExposureLib.exposureOf(c.amount, c.maxPenaltyBps);

            ICM.UserExposure storage mag = s.userExposures[c.committer][c.token];
            mag.totalEncumbered -= m.units;
            uint256 dec = expPre - expPost;
            if (dec > mag.totalForfeitable) dec = mag.totalForfeitable; // defense vs drift
            mag.totalForfeitable -= dec;
        }

        // --- Apply ---
        if (m.kind == MovementKind.FromEncumberedToEscrow) {
            LedgerLib.encumberedToEscrow(s, commitmentId, c.token, c.committer, strategy, m.units);
        } else {
            LedgerLib.debitEncumberedForExternal(s, commitmentId, c.token, c.committer, strategy, m.units);
            IERC20(c.token).safeTransfer(m.to, m.units);
            emit ICM.DistributionPaid(strategy, m.to, c.token, m.units, commitmentId, bytes32(0));
        }
    }

    /// @dev FromEscrow*: payouts of previously-escrowed value. Token is unrestricted (a strategy
    ///      may escrow reward tokens unrelated to the backing); the debit is always the calling
    ///      strategy's own escrow (INV-5).
    function _applyFromEscrow(
        CommitmentManagerStorage.Layout storage s,
        ICM.Commitment storage c,
        uint256 commitmentId,
        address strategy,
        TokenMovement memory m,
        MovementSite site
    ) private {
        // --- Site matrix (ERC §D.4): escrow payouts are valid everywhere except distribute. ---
        if (site == MovementSite.Distribute) revert ICM.MovementFromEscrowNotOnDistribute();

        // --- Allow-list (ERC §D.5) ---
        if (m.from != strategy) revert ICM.MovementFromNotStrategy(m.from, strategy);
        if (m.to != c.committer && m.to != c.counterparty) revert ICM.MovementRecipientNotParty(m.to);

        // --- Apply (escrow balance is the cap; LedgerLib reverts InsufficientEscrow) ---
        if (m.kind == MovementKind.FromEscrowToFree) {
            LedgerLib.escrowToFree(s, strategy, m.token, m.to, m.units);
        } else {
            LedgerLib.debitEscrowForExternal(s, strategy, m.token, m.units);
            IERC20(m.token).safeTransfer(m.to, m.units);
        }
        emit ICM.DistributionPaid(strategy, m.to, m.token, m.units, commitmentId, bytes32(0));
    }
}
