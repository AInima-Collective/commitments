// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";

import {
    IDistributionStrategy,
    TokenMovement,
    MovementKind,
    CreatedContext,
    DistributeContext,
    ClaimContext,
    LifecycleContext,
    ForfeitContext
} from "src/core/interfaces/IDistributionStrategy.sol";
import {IBackingAdapter} from "src/core/interfaces/IBackingAdapter.sol";

/// @title IndexAppreciationYield
/// @notice The normative-optional premium strategy of ERC-COMMITMENTS (Reference Strategy
///         Taxonomy): routes a configured share of the backing's index appreciation to the
///         counterparty as commission/premium, via manager escrow.
/// @dev Per-commitment state: { lastIndex, yieldShareBps, owed }. One deployment serves any
///      number of commitments across managers? No — hooks are manager-only, so one deployment
///      per manager (the manager address is immutable).
///
///      Accrual math (normative for implementations offering index-appreciation premiums):
///        yieldAccrued      = currentEncumbered × (nowIndex − lastIndex) / 1e18
///        counterpartyYield = yieldAccrued × yieldShareBps / 10_000
///        yieldUnits        = counterpartyYield × 1e18 / nowIndex, clamped to currentEncumbered
contract IndexAppreciationYield is IDistributionStrategy {
    /// @notice Counterparty abandonment TTL: after this long past commitment close, the
    ///         committer may reclaim unclaimed accrual (strategy-internal policy, ERC taxonomy).
    uint64 public constant RECLAIM_WINDOW = 90 days;

    struct Position {
        uint256 lastIndex; // adapter index at last accrual
        uint16 yieldShareBps; // share of appreciation routed to the counterparty
        bool bound; // commitment is bound to this strategy
        uint256 owed; // escrowed backing units claimable by the counterparty
    }

    address public immutable manager;
    mapping(uint256 commitmentId => Position) internal _positions;

    error OnlyManager();
    error YieldBpsExceedsMax();
    error AlreadyBound();
    error NotBound();
    error NothingToClaim();
    error NotAuthorized();
    error ReclaimWindowActive();

    constructor(address manager_) {
        manager = manager_;
    }

    modifier onlyManager() {
        if (msg.sender != manager) revert OnlyManager();
        _;
    }

    /// @notice Per-commitment premium state.
    function positionOf(uint256 commitmentId)
        external
        view
        returns (uint256 lastIndex, uint16 yieldShareBps, uint256 owed)
    {
        Position storage pos = _positions[commitmentId];
        return (pos.lastIndex, pos.yieldShareBps, pos.owed);
    }

    // =========================================================================
    // IDistributionStrategy
    // =========================================================================

    /// @inheritdoc IDistributionStrategy
    /// @dev `strategyParams` is `abi.encode(uint16 yieldShareBps)`. Reverts (aborting the
    ///      creation) on malformed params or an adapter whose `indexNow` is unreadable — the
    ///      v1 compatibility-refusal mechanism.
    function onCommitmentCreated(CreatedContext calldata ctx) external onlyManager {
        uint16 yieldShareBps = abi.decode(ctx.strategyParams, (uint16));
        if (yieldShareBps > 10_000) revert YieldBpsExceedsMax();

        Position storage pos = _positions[ctx.base.commitmentId];
        if (pos.bound) revert AlreadyBound();
        pos.bound = true;
        pos.yieldShareBps = yieldShareBps;
        // Reverts here if the adapter cannot price the token — refusing the binding.
        pos.lastIndex = IBackingAdapter(ctx.base.adapter).indexNow(ctx.base.token);
    }

    /// @inheritdoc IDistributionStrategy
    function distribute(DistributeContext calldata ctx) external onlyManager returns (TokenMovement[] memory) {
        return _accrue(
            ctx.base.commitmentId, ctx.base.adapter, ctx.base.token, ctx.base.committer, ctx.base.currentEncumbered
        );
    }

    /// @inheritdoc IDistributionStrategy
    /// @dev One final accrual sweep — the manager runs release hooks BEFORE freeing the
    ///      encumbrance (ERC §C.1), so the sweep still has an encumbered source.
    function onCommitmentReleased(LifecycleContext calldata ctx) external onlyManager returns (TokenMovement[] memory) {
        return _accrue(
            ctx.base.commitmentId, ctx.base.adapter, ctx.base.token, ctx.base.committer, ctx.base.currentEncumbered
        );
    }

    /// @inheritdoc IDistributionStrategy
    /// @dev Previously-escrowed accrual stays claimable. A final sweep runs against the
    ///      post-forfeit residual, capped so the counterparty's total (forfeit payout + premium)
    ///      never exceeds the commitment's pre-forfeit amount (ERC taxonomy SHOULD).
    function onCommitmentForfeited(ForfeitContext calldata ctx) external onlyManager returns (TokenMovement[] memory) {
        uint256 commitmentId = ctx.base.commitmentId;
        uint256 residual = ctx.base.currentEncumbered;

        // Cap: sweep ≤ residual − owed (so forfeitedUnits + owed + sweep ≤ pre-forfeit amount).
        uint256 owedAlready = _positions[commitmentId].owed;
        uint256 sweepCap = residual > owedAlready ? residual - owedAlready : 0;

        TokenMovement[] memory moves =
            _accrue(commitmentId, ctx.base.adapter, ctx.base.token, ctx.base.committer, residual);
        if (moves.length == 0) return moves;
        if (moves[0].units > sweepCap) {
            // Re-shrink the sweep (and the owed bump _accrue just recorded) to the cap.
            _positions[commitmentId].owed -= (moves[0].units - sweepCap);
            moves[0].units = sweepCap;
            if (sweepCap == 0) return new TokenMovement[](0);
        }
        return moves;
    }

    /// @inheritdoc IDistributionStrategy
    /// @dev Counterparty claim: full owed, paid out of escrow as raw tokens. Committer reclaim
    ///      (abandonment TTL): `claimData = abi.encode(true)` after RECLAIM_WINDOW past close,
    ///      credited to the committer's free balance.
    function claim(ClaimContext calldata ctx, bytes calldata claimData)
        external
        onlyManager
        returns (TokenMovement[] memory)
    {
        Position storage pos = _positions[ctx.base.commitmentId];
        if (!pos.bound) revert NotBound();
        uint256 owed = pos.owed;
        if (owed == 0) revert NothingToClaim();

        bool reclaim = claimData.length > 0 && abi.decode(claimData, (bool));
        TokenMovement[] memory moves = new TokenMovement[](1);

        if (reclaim) {
            if (ctx.caller != ctx.base.committer) revert NotAuthorized();
            if (ctx.closedAt == 0 || block.timestamp < uint256(ctx.closedAt) + RECLAIM_WINDOW) {
                revert ReclaimWindowActive();
            }
            pos.owed = 0;
            moves[0] =
                TokenMovement(MovementKind.FromEscrowToFree, address(this), ctx.base.committer, ctx.base.token, owed);
        } else {
            if (ctx.caller != ctx.base.counterparty) revert NotAuthorized();
            pos.owed = 0;
            moves[0] = TokenMovement(
                MovementKind.FromEscrowToExternal, address(this), ctx.base.counterparty, ctx.base.token, owed
            );
        }
        return moves;
    }

    /// @inheritdoc IDistributionStrategy
    /// @dev Owed (already escrowed) plus the live accrual a distribute would capture now.
    function pending(ClaimContext calldata ctx, bytes calldata) external view returns (uint256) {
        Position storage pos = _positions[ctx.base.commitmentId];
        uint256 live;
        if (pos.bound && ctx.closedAt == 0) {
            (live,) = _accrualPreview(pos, ctx.base.adapter, ctx.base.token, ctx.base.currentEncumbered);
        }
        return pos.owed + live;
    }

    // =========================================================================
    // Accrual core
    // =========================================================================

    /// @dev Compute and record the accrual since lastIndex; return the escrow-sweep movement.
    ///      State mutations live in the caller's frame: if the manager rejects the movement,
    ///      the owed/lastIndex updates revert with it.
    ///
    ///      `lastIndex` only advances when a non-zero accrual is actually banked, and then only
    ///      by the index delta that banked (floored) accrual consumed — rounded UP, so rounding
    ///      never favors the counterparty. Sub-unit remainders stay pending in index-delta form
    ///      instead of being dropped: `distribute` is permissionless, so an unconditional
    ///      ratchet would let the committer grind a small/low-decimal counterparty's premium to
    ///      zero with per-block calls whose per-call accrual floors to 0.
    function _accrue(uint256 commitmentId, address adapter, address token, address committer, uint256 encumbered)
        internal
        returns (TokenMovement[] memory moves)
    {
        Position storage pos = _positions[commitmentId];
        if (!pos.bound) revert NotBound();

        (uint256 yieldUnits, uint256 nowIndex) = _accrualPreview(pos, adapter, token, encumbered);
        if (yieldUnits == 0) return new TokenMovement[](0);

        // Index delta consumed by the banked accrual: invert the taxonomy math for the floored
        // yieldUnits. yieldUnits > 0 implies encumbered > 0 and yieldShareBps > 0, and the
        // consumed delta is provably <= nowIndex - lastIndex (min() is belt-and-braces).
        uint256 consumed =
            Math.mulDiv(yieldUnits * 10_000, nowIndex, encumbered * pos.yieldShareBps, Math.Rounding.Ceil);
        pos.lastIndex = Math.min(pos.lastIndex + consumed, nowIndex);

        pos.owed += yieldUnits;
        moves = new TokenMovement[](1);
        moves[0] = TokenMovement(MovementKind.FromEncumberedToEscrow, committer, address(this), token, yieldUnits);
    }

    /// @dev The taxonomy's accrual math, full precision via mulDiv.
    function _accrualPreview(Position storage pos, address adapter, address token, uint256 encumbered)
        internal
        view
        returns (uint256 yieldUnits, uint256 nowIndex)
    {
        nowIndex = IBackingAdapter(adapter).indexNow(token);
        uint256 lastIndex = pos.lastIndex;
        if (nowIndex <= lastIndex || pos.yieldShareBps == 0 || encumbered == 0) return (0, nowIndex);

        // counterpartyYield = encumbered × (nowIndex − lastIndex) × yieldShareBps / (1e18 × 10_000)
        uint256 counterpartyYield = Math.mulDiv(encumbered * pos.yieldShareBps, nowIndex - lastIndex, 1e18 * 10_000);
        if (counterpartyYield == 0) return (0, nowIndex);

        yieldUnits = Math.mulDiv(counterpartyYield, 1e18, nowIndex);
        if (yieldUnits > encumbered) yieldUnits = encumbered; // INV-4 re-enforces independently
    }
}
