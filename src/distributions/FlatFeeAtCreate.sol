// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuardTransient} from "@openzeppelin/contracts/utils/ReentrancyGuardTransient.sol";

import {ICommitmentManager as ICM} from "src/core/interfaces/ICommitmentManager.sol";
import {
    IDistributionStrategy,
    TokenMovement,
    CreatedContext,
    ClaimContext
} from "src/core/interfaces/IDistributionStrategy.sol";
import {StrategyBase} from "src/distributions/StrategyBase.sol";

/// @title FlatFeeAtCreate
/// @notice A fixed fee paid to the commitment's counterparty as a condition of creation
///         (ERC-COMMITMENTS taxonomy, informative). Because `onCommitmentCreated` returns no
///         movements (§D.4), the fee is prefunded: the committer (or a sponsor) calls
///         `prefund(committer, token, fee)` beforehand; the creation hook consumes the
///         COMMITTER'S OWN credit and REVERTS the creation otherwise — a deliberate exercise
///         of the compatibility-refusal path.
/// @dev Self-custody shape (§D "Strategies MAY expose additional surfaces"): prefunded tokens
///      are held by this contract, NOT in the manager's per-strategy escrow. Two reasons:
///      (1) `manager.fundStrategy` escrow carries no funder attribution, so a shared pot is
///      first-come — a front-runner could bind a fee equal to someone else's prefund and have
///      their counterparty drain it. Credit here is keyed by committer, so a
///      binding can only consume the credit of the commitment's own committer.
///      (2) The manager exposes no strategy-initiated escrow withdrawal (escrow debits exist
///      only inside the commitment-scoped, party-only movement pipeline, §D.5), so escrow-held
///      overfunding would be permanently stranded; self-custody makes `refundUnallocated`
///      possible. The fee payout is served directly from this contract's balance — `claim`
///      returns no movements and emits `DistributionPaid` itself, as §D.7 requires of
///      self-custody strategies.
contract FlatFeeAtCreate is StrategyBase, ReentrancyGuardTransient {
    using SafeERC20 for IERC20;

    struct FeeState {
        uint256 fee;
        address token;
        bool collected;
        bool bound;
    }

    mapping(uint256 commitmentId => FeeState) public feeOf;
    /// @notice Unconsumed prefund attributed to a committer, per token. Only the commitment's
    ///         own committer's credit can be consumed by `onCommitmentCreated`; unconsumed
    ///         credit is recoverable via `refundUnallocated`.
    mapping(address committer => mapping(address token => uint256)) public creditOf;

    /// @notice A prefund was credited to `committer` (pulled from `funder`).
    event Prefunded(address indexed funder, address indexed committer, address indexed token, uint256 amount);
    /// @notice Unconsumed credit was refunded to its owner.
    event CreditRefunded(address indexed committer, address indexed token, uint256 amount);

    error FeeNotFunded(uint256 required, uint256 available);
    error InsufficientCredit(uint256 requested, uint256 available);
    error ZeroAddress();

    constructor(address manager_) StrategyBase(manager_) {}

    // =========================================================================
    // Prefund / refund surface (committer-attributed credit)
    // =========================================================================

    /// @notice Prefund the creation fee for `committer` in `token` units: pulls `amount` from
    ///         `msg.sender` and credits `committer` with the measured balance delta (same
    ///         fee-on-transfer defense as `manager.deposit`). Prefunding another account is a
    ///         gift — the credit (and any refund) belongs to `committer`, not the funder.
    /// @param committer The account whose future `createCommitment` this credit backs.
    /// @param token The fee token — must match the commitment's backing token at create time.
    /// @param amount Fee credit in `token` units (pre-transfer-fee).
    function prefund(address committer, address token, uint256 amount) external nonReentrant {
        if (committer == address(0)) revert ZeroAddress();
        if (amount == 0) revert ZeroAmount();
        uint256 received = _pullMeasured(IERC20(token), amount);
        creditOf[committer][token] += received;
        emit Prefunded(msg.sender, committer, token, received);
    }

    /// @notice Recover `amount` of `msg.sender`'s unconsumed credit in `token`. Credit already
    ///         consumed by a binding is an earned fee obligation and is NOT refundable.
    /// @param token The fee token to refund.
    /// @param amount Units to refund; must not exceed `creditOf[msg.sender][token]`.
    function refundUnallocated(address token, uint256 amount) external nonReentrant {
        if (amount == 0) revert ZeroAmount();
        uint256 available = creditOf[msg.sender][token];
        if (amount > available) revert InsufficientCredit(amount, available);
        creditOf[msg.sender][token] = available - amount;
        IERC20(token).safeTransfer(msg.sender, amount);
        emit CreditRefunded(msg.sender, token, amount);
    }

    // =========================================================================
    // IDistributionStrategy
    // =========================================================================

    /// @inheritdoc IDistributionStrategy
    /// @dev `strategyParams` is `abi.encode(uint256 fee)` in backing-token units. Consumes the
    ///      COMMITTER'S credit — never a shared pot — so one party's prefund can never back
    ///      another party's binding.
    function onCommitmentCreated(CreatedContext calldata ctx) external onlyManager {
        uint256 fee = abi.decode(ctx.strategyParams, (uint256));
        FeeState storage state = feeOf[ctx.base.commitmentId];
        state.bound = true;
        if (fee == 0) return; // a zero-fee binding owes nothing

        address token = ctx.base.token;
        uint256 available = creditOf[ctx.base.committer][token];
        if (available < fee) revert FeeNotFunded(fee, available);

        creditOf[ctx.base.committer][token] = available - fee;
        state.fee = fee;
        state.token = token;
    }

    /// @inheritdoc IDistributionStrategy
    /// @dev The counterparty collects the fee, paid directly from this contract's balance
    ///      (self-custody payout, §D.7 `DistributionPaid` emitted here). Available in any
    ///      commitment state — the fee was earned at creation.
    function claim(ClaimContext calldata ctx, bytes calldata)
        external
        onlyManager
        nonReentrant
        returns (TokenMovement[] memory)
    {
        if (ctx.caller != ctx.base.counterparty) revert NotAuthorized();
        FeeState storage state = feeOf[ctx.base.commitmentId];
        if (!state.bound) revert NotBound();
        if (state.fee == 0 || state.collected) revert NothingToClaim();

        state.collected = true;

        IERC20(state.token).safeTransfer(ctx.base.counterparty, state.fee);
        emit ICM.DistributionPaid(
            address(this), ctx.base.counterparty, state.token, state.fee, ctx.base.commitmentId, bytes32(0)
        );
        return new TokenMovement[](0);
    }

    /// @inheritdoc IDistributionStrategy
    function pending(ClaimContext calldata ctx, bytes calldata) external view returns (uint256) {
        FeeState storage state = feeOf[ctx.base.commitmentId];
        return state.collected ? 0 : state.fee;
    }
}
