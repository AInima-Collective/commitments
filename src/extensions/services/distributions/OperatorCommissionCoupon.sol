// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuardTransient} from "@openzeppelin/contracts/utils/ReentrancyGuardTransient.sol";

import {ICommitmentManager as ICM} from "src/core/interfaces/ICommitmentManager.sol";
import {IOperatorRegistry} from "src/extensions/services/interfaces/IOperatorRegistry.sol";
import {
    IDistributionStrategy,
    TokenMovement,
    CreatedContext,
    ClaimContext
} from "src/core/interfaces/IDistributionStrategy.sol";
import {StrategyBase} from "src/distributions/StrategyBase.sol";

/// @title OperatorCommissionCoupon
/// @notice Lets a delegator route a commission to the operator they delegate to. A delegation
///         commitment names the OperatorRegistry as its counterparty, so the operator is not a
///         party to the commitment and cannot be paid through the manager's movement pipeline
///         (§D.5, whose recipients are committer/counterparty only). This strategy carries the
///         commission alongside the delegation instead: the delegator funds a flat commission
///         here, and the operator — resolved from the registry — collects it.
/// @dev Self-custody shape (like `FlatFeeAtCreate`): the commission is held by THIS contract, not
///      in the manager's escrow, and every `IDistributionStrategy` hook returns an EMPTY movement
///      array. That is the whole point for a delegation: the registry rejects strategies that
///      drain `c.amount` (they leave phantom `totalDelegatedStake`), so a commission
///      strategy must never touch the encumbered backing. Because it never does, the registry
///      admin can safely allow-list it (`setStrategyAllowed`) and a delegator can bind it on the
///      delegation commitment. The payout is served directly from this contract's balance —
///      `claim` returns no movements and emits `DistributionPaid` itself (§D.7).
///
///      Operator latch: the registry clears `operatorForCommitment` when the delegation closes,
///      so the strategy captures ("latches") the operator the first time it observes an active
///      delegation — on `fundCommission`, `latchOperator`, or the operator's first `claim`. Once
///      latched the operator can collect even after the commitment closes. Commission that is
///      never latched (the delegation closed before the operator claimed or latched) is
///      reclaimable by the delegator via `refundCommission` — so an operator should `claim` or
///      `latchOperator` while the delegation is live.
contract OperatorCommissionCoupon is StrategyBase, ReentrancyGuardTransient {
    using SafeERC20 for IERC20;

    /// @param funded Total commission the delegator has deposited for this commitment.
    /// @param claimed Total commission already paid to the operator.
    /// @param token Backing token of the commitment (commission is paid in the same token).
    /// @param committer The delegator who funds the commission and receives any refund.
    /// @param operator The latched operator; `address(0)` until an active delegation is observed.
    /// @param bound Set once at binding.
    struct Coupon {
        uint256 funded;
        uint256 claimed;
        address token;
        address committer;
        address operator;
        bool bound;
    }

    address public immutable registry;
    mapping(uint256 commitmentId => Coupon) public couponOf;

    /// @notice The delegator deposited `amount` of commission for `commitmentId`.
    event CommissionFunded(uint256 indexed commitmentId, address indexed committer, uint256 amount);
    /// @notice The operator for `commitmentId` was captured, fixing who may claim the commission.
    event OperatorLatched(uint256 indexed commitmentId, address indexed operator);
    /// @notice Unclaimed, unlatched commission was returned to the delegator.
    event CommissionRefunded(uint256 indexed commitmentId, address indexed committer, uint256 amount);

    error NotDelegated();
    /// @notice Commission cannot be funded once the delegation commitment has closed.
    error CommitmentClosed();
    error Delegated();

    constructor(address manager_, address registry_) StrategyBase(manager_) {
        registry = registry_;
    }

    // =========================================================================
    // Delegator funding / reclaim surface (self-custody, §D)
    // =========================================================================

    /// @notice Deposit `amount` of commission for `commitmentId`. Only the commitment's committer
    ///         (the delegator) may fund — the refund path returns to the committer, so allowing
    ///         arbitrary funders would misattribute it. Pulls the measured balance delta
    ///         (fee-on-transfer safe). Latches the operator opportunistically if the delegation is
    ///         already active.
    /// @param commitmentId The delegation commitment to attach commission to.
    /// @param amount Commission units to add, in the commitment's backing token.
    function fundCommission(uint256 commitmentId, uint256 amount) external nonReentrant {
        if (amount == 0) revert ZeroAmount();
        Coupon storage cp = couponOf[commitmentId];
        if (!cp.bound) revert NotBound();
        if (msg.sender != cp.committer) revert NotAuthorized();
        if (ICM(manager).closedAt(commitmentId) != 0) revert CommitmentClosed();

        uint256 received = _pullMeasured(IERC20(cp.token), amount);

        cp.funded += received;
        emit CommissionFunded(commitmentId, msg.sender, received);

        _tryLatch(commitmentId, cp);
    }

    /// @notice Capture the operator this delegation currently routes to, fixing who may claim the
    ///         commission even after the commitment closes and the registry clears its routing.
    ///         Permissionless (typically called by the operator right after delegation). No-op if
    ///         already latched or the commitment is not currently delegated.
    /// @param commitmentId The active delegation commitment.
    function latchOperator(uint256 commitmentId) external {
        Coupon storage cp = couponOf[commitmentId];
        if (!cp.bound) revert NotBound();
        _tryLatch(commitmentId, cp);
    }

    /// @notice Reclaim commission that was never latched to an operator — the delegation closed (or
    ///         never happened) before the operator claimed or latched. Only the committer may call,
    ///         and only while the commitment is not currently delegated and no operator was latched.
    /// @param commitmentId The commitment to reclaim commission from.
    function refundCommission(uint256 commitmentId) external nonReentrant {
        Coupon storage cp = couponOf[commitmentId];
        if (!cp.bound) revert NotBound();
        if (msg.sender != cp.committer) revert NotAuthorized();
        // A latched operator (or a currently-live delegation) has earned the commission.
        if (cp.operator != address(0)) revert Delegated();
        if (IOperatorRegistry(registry).operatorForCommitment(commitmentId) != address(0)) revert Delegated();

        uint256 refund = cp.funded - cp.claimed;
        if (refund == 0) revert NothingToClaim();

        cp.funded = cp.claimed;
        IERC20(cp.token).safeTransfer(msg.sender, refund);
        emit CommissionRefunded(commitmentId, msg.sender, refund);
    }

    // =========================================================================
    // Views
    // =========================================================================

    /// @notice Commission currently claimable by the operator for `commitmentId`.
    function claimableOf(uint256 commitmentId) external view returns (uint256) {
        Coupon storage cp = couponOf[commitmentId];
        return cp.funded - cp.claimed;
    }

    // =========================================================================
    // IDistributionStrategy
    // =========================================================================

    /// @inheritdoc IDistributionStrategy
    /// @dev Records the backing token and the delegator (committer); `strategyParams` is unused.
    ///      Never reverts on a valid token, so it cannot block delegation-commitment creation.
    function onCommitmentCreated(CreatedContext calldata ctx) external onlyManager {
        Coupon storage cp = couponOf[ctx.base.commitmentId];
        cp.token = ctx.base.token;
        cp.committer = ctx.base.committer;
        cp.bound = true;
    }

    /// @inheritdoc IDistributionStrategy
    /// @dev The operator collects the commission, paid directly from this contract's balance
    ///      (self-custody payout, §D.7 `DistributionPaid` emitted here). Latches the operator on
    ///      first claim so later claims survive the commitment's close.
    function claim(ClaimContext calldata ctx, bytes calldata)
        external
        onlyManager
        nonReentrant
        returns (TokenMovement[] memory)
    {
        Coupon storage cp = couponOf[ctx.base.commitmentId];
        if (!cp.bound) revert NotBound();

        address operator = cp.operator;
        if (operator == address(0)) {
            operator = IOperatorRegistry(registry).operatorForCommitment(ctx.base.commitmentId);
            if (operator == address(0)) revert NotDelegated();
            cp.operator = operator;
            emit OperatorLatched(ctx.base.commitmentId, operator);
        }
        if (ctx.caller != operator) revert NotAuthorized();

        uint256 payout = cp.funded - cp.claimed;
        if (payout == 0) revert NothingToClaim();

        cp.claimed = cp.funded;
        IERC20(cp.token).safeTransfer(operator, payout);
        emit ICM.DistributionPaid(address(this), operator, cp.token, payout, ctx.base.commitmentId, bytes32(0));
        return new TokenMovement[](0);
    }

    /// @inheritdoc IDistributionStrategy
    function pending(ClaimContext calldata ctx, bytes calldata) external view returns (uint256) {
        Coupon storage cp = couponOf[ctx.base.commitmentId];
        return cp.funded - cp.claimed;
    }

    // =========================================================================
    // Internal
    // =========================================================================

    /// @dev Latch the operator from the registry if not yet set and a delegation is live.
    function _tryLatch(uint256 commitmentId, Coupon storage cp) internal {
        if (cp.operator != address(0)) return;
        address operator = IOperatorRegistry(registry).operatorForCommitment(commitmentId);
        if (operator != address(0)) {
            cp.operator = operator;
            emit OperatorLatched(commitmentId, operator);
        }
    }
}
