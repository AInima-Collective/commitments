// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

// =============================================================================
// Shared Part D types (ERC-COMMITMENTS §D.1, §D.2)
// =============================================================================
// File-level declarations so the manager, strategies, and tests all import the
// exact same types. The MovementKind set is CLOSED and load-bearing: adding a
// kind requires a manager upgrade and a spec revision (ERC §D.2).

/// @notice The closed vocabulary of strategy-emitted value movements (ERC §D.2).
/// @dev Manager-internal lifecycle moves (encumber, release, forfeit transfer, ...)
///      are NOT expressible as movements and are NOT available to strategies.
enum MovementKind {
    FromEncumberedToEscrow, // accrual: committer.encumbered -> strategy escrow
    FromEscrowToExternal, // payout: strategy escrow -> recipient wallet (ERC-20 transfer out)
    FromEscrowToFree, // payout: strategy escrow -> recipient's free balance (ledger credit)
    FromEncumberedToExternal // direct payout: committer.encumbered -> recipient wallet
}

/// @notice One movement instruction returned by a strategy hook. The manager is the
///         sole executor: every movement is validated against the per-kind allow-list
///         and caps of ERC §D.5 before applying.
struct TokenMovement {
    MovementKind kind;
    address from; // committer, or the strategy address as escrow sentinel
    address to; // recipient
    address token;
    uint256 units;
}

/// @notice A strategy bound to a commitment at creation, with strategy-specific params.
/// @dev The manager MUST NOT persist `params` — it is delivered once via the creation
///      context and once via the `CommitmentBoundToStrategy` event (ERC §C.1).
struct StrategyBinding {
    address strategy;
    bytes params;
}

/// @notice Fields shared by every strategy-hook context (ERC §D.1).
struct BaseContext {
    uint256 commitmentId;
    address adapter;
    address token;
    address committer;
    address counterparty;
    uint256 currentEncumbered; // commitment.amount at call time
    uint64 timestamp;
}

/// @notice Context for `onCommitmentCreated`.
struct CreatedContext {
    BaseContext base;
    uint256 originalAmount;
    uint16 maxPenaltyBps;
    uint64 challengeWindow;
    bytes strategyParams;
}

/// @notice Context for `distribute`.
struct DistributeContext {
    BaseContext base;
    address caller;
}

/// @notice Context for `claim` / `pending`. `closedAt` is 0 while the commitment is active.
struct ClaimContext {
    BaseContext base;
    address caller;
    uint64 closedAt;
}

/// @notice Context for `onCommitmentReleased`.
struct LifecycleContext {
    BaseContext base;
}

/// @notice Context for `onCommitmentForfeited`. Delivered strictly AFTER the manager-internal
///         forfeit transfer; `base.currentEncumbered` is the post-forfeit residual.
struct ForfeitContext {
    BaseContext base;
    uint16 penaltyBps;
    address forfeitRecipient;
    uint256 forfeitedUnits;
}

/// @title IDistributionStrategy
/// @notice Stateful plugin bound to one or more commitments that determines value flows by
///         returning `TokenMovement[]` instructions the manager validates and applies
///         (ERC-COMMITMENTS Part D).
/// @dev Strategies hold their own state; the same strategy contract may be bound to many
///      commitments. Strategies MAY expose additional surfaces beyond this interface
///      (standalone claim paths, admin refund hooks, root submission) — conformance defines
///      the minimum surface, not a maximum. Every contract that executes a payout MUST emit
///      `DistributionPaid` (ERC §D.7), whether that contract is the manager or the strategy.
interface IDistributionStrategy {
    /// @notice Manager-only. Strategy initializes any per-commitment state and registers the
    ///         commitment as bound. MUST revert if the strategy cannot operate against
    ///         `ctx.base.adapter` / `ctx.base.token` (the compatibility-refusal mechanism).
    ///         Reverts abort commitment creation (NOT guarded — ERC §C.1).
    function onCommitmentCreated(CreatedContext calldata ctx) external;

    /// @notice Manager-only; called under guarded semantics (ERC §D.6) BEFORE the committer's
    ///         remaining encumbrance is freed, so the strategy can take its final accrual sweep.
    ///         Allowed kinds: FromEncumberedToEscrow, FromEscrowToExternal, FromEscrowToFree.
    function onCommitmentReleased(LifecycleContext calldata ctx) external returns (TokenMovement[] memory);

    /// @notice Manager-only; called under guarded semantics (ERC §D.6), strictly AFTER the
    ///         manager-internal forfeit transfer. Disposes of strategy-side in-flight accrual only;
    ///         cannot affect the forfeit itself. `FromEncumbered*` caps run against the post-forfeit
    ///         residual. Allowed kinds: FromEncumberedToEscrow, FromEscrowToExternal, FromEscrowToFree.
    function onCommitmentForfeited(ForfeitContext calldata ctx) external returns (TokenMovement[] memory);

    /// @notice Permissionlessly advance accrual state. Called by the manager from
    ///         `manager.distribute(id, strategy)`; reverts bubble to the caller.
    ///         Allowed kinds: FromEncumberedToEscrow, FromEncumberedToExternal.
    function distribute(DistributeContext calldata ctx) external returns (TokenMovement[] memory);

    /// @notice Caller-validated claim over the manager-mediated payout path. `claimData` is
    ///         strategy-specific (empty / merkle proof / signed envelope / reclaim flag / ...).
    ///         Self-custody strategies MAY return an empty array and serve claims on their own
    ///         surface instead. Allowed kinds: FromEscrowToExternal, FromEscrowToFree.
    function claim(ClaimContext calldata ctx, bytes calldata claimData) external returns (TokenMovement[] memory);

    /// @notice Pending amount claimable by the implied recipient.
    function pending(ClaimContext calldata ctx, bytes calldata claimData) external view returns (uint256);
}
