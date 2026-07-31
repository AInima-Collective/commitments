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
    DistributeContext,
    ClaimContext,
    LifecycleContext,
    ForfeitContext
} from "src/core/interfaces/IDistributionStrategy.sol";

/// @title CounterpartyPremiumStream
/// @notice A pay-as-you-go premium the commitment's COUNTERPARTY (the insured) streams to the
///         COMMITTER (the underwriter, who has locked forfeitable backing as coverage). This is
///         the missing insured→underwriter value direction: the two shipped reference strategies
///         (`FlatFeeAtCreate`, `IndexAppreciationYield`) both carve value out of the committer's
///         encumbered backing and pay it TO the counterparty, so single-commitment coverage had
///         no way to route a premium the other way.
/// @dev The manager's movement pipeline (ERC §D.5) can never source value FROM the counterparty —
///      every `MovementKind` sources from `committer.encumbered` or the strategy's own escrow, and
///      the counterparty is a recipient-only party. A counterparty-funded flow therefore MUST use
///      the self-custody shape (§D "Strategies MAY expose additional surfaces", same as
///      `FlatFeeAtCreate`): the counterparty deposits premium into THIS contract via `fundPremium`,
///      the balance streams to the committer at a fixed rate, and payouts are served directly from
///      this contract's balance — `claim` returns no movements and emits `DistributionPaid` itself
///      (§D.7). Nothing here touches the manager's ledger or escrow.
///
///      Accrual model: premium accrues linearly at `ratePerSecond` (set at binding via
///      `strategyParams`) from the binding timestamp, capped by (a) the counterparty's cumulative
///      deposits and (b) the commitment's close time — the stream freezes the instant the
///      commitment is released or forfeited. The close time is read live from
///      `manager.closedAt(id)` rather than captured in a guarded lifecycle hook, so a parked
///      (reverted-and-skipped, §D.6) hook can never leave the stream running past close. The
///      counterparty caps their total exposure purely by how much they fund; unstreamed premium is
///      recoverable via `reclaimUnstreamed` once the policy has ended.
contract CounterpartyPremiumStream is IDistributionStrategy, ReentrancyGuardTransient {
    using SafeERC20 for IERC20;

    /// @param ratePerSecond Premium units (backing-token) accruing to the committer per second.
    /// @param funded Cumulative premium the counterparty has deposited for this commitment.
    /// @param claimed Cumulative premium already paid out to the committer.
    /// @param token Backing token of the commitment (the premium is paid in the same token).
    /// @param startTime Binding timestamp; accrual is measured from here.
    /// @param bound Set once at binding; distinguishes a real (possibly zero-rate) stream from an
    ///        unbound id.
    struct Stream {
        uint256 ratePerSecond;
        uint256 funded;
        uint256 claimed;
        address token;
        uint64 startTime;
        bool bound;
    }

    address public immutable manager;
    mapping(uint256 commitmentId => Stream) public streamOf;

    /// @notice The counterparty deposited `amount` of premium for `commitmentId` (pulled from `funder`).
    event PremiumFunded(uint256 indexed commitmentId, address indexed funder, uint256 amount);
    /// @notice Unstreamed premium was returned to the counterparty after the policy ended.
    event PremiumReclaimed(uint256 indexed commitmentId, address indexed counterparty, uint256 amount);

    error OnlyManager();
    error AlreadyBound();
    error NotBound();
    error NotAuthorized();
    error NothingToClaim();
    error StreamEnded();
    error StreamActive();
    error ZeroAmount();

    constructor(address manager_) {
        manager = manager_;
    }

    modifier onlyManager() {
        if (msg.sender != manager) revert OnlyManager();
        _;
    }

    // =========================================================================
    // Counterparty funding / reclaim surface (self-custody, §D)
    // =========================================================================

    /// @notice Deposit `amount` of premium for `commitmentId`, streaming to the committer. Only the
    ///         commitment's counterparty (the insured) may fund — the reclaim path refunds the
    ///         counterparty, so allowing arbitrary funders would misattribute the refund. Pulls the
    ///         measured balance delta (fee-on-transfer safe, same rule as `manager.deposit`).
    /// @param commitmentId The commitment whose premium stream is topped up.
    /// @param amount Premium units to add, in the commitment's backing token.
    function fundPremium(uint256 commitmentId, uint256 amount) external nonReentrant {
        if (amount == 0) revert ZeroAmount();
        Stream storage st = streamOf[commitmentId];
        if (!st.bound) revert NotBound();
        if (ICM(manager).closedAt(commitmentId) != 0) revert StreamEnded();
        if (msg.sender != ICM(manager).getCommitment(commitmentId).counterparty) revert NotAuthorized();

        uint256 balanceBefore = IERC20(st.token).balanceOf(address(this));
        IERC20(st.token).safeTransferFrom(msg.sender, address(this), amount);
        uint256 received = IERC20(st.token).balanceOf(address(this)) - balanceBefore;
        if (received == 0) revert ZeroAmount();

        st.funded += received;
        emit PremiumFunded(commitmentId, msg.sender, received);
    }

    /// @notice After the policy has ended (commitment released/forfeited), return the premium that
    ///         never streamed to the committer back to the counterparty. Callable only once the
    ///         commitment is closed, so the frozen accrual is final and the committer's claimable
    ///         balance is fully preserved.
    /// @param commitmentId The ended commitment to reclaim unstreamed premium from.
    function reclaimUnstreamed(uint256 commitmentId) external nonReentrant {
        Stream storage st = streamOf[commitmentId];
        if (!st.bound) revert NotBound();
        if (msg.sender != ICM(manager).getCommitment(commitmentId).counterparty) revert NotAuthorized();

        uint64 endTime = ICM(manager).closedAt(commitmentId);
        if (endTime == 0) revert StreamActive();

        uint256 earned = _earned(st, endTime);
        uint256 remainder = st.funded - earned;
        if (remainder == 0) revert NothingToClaim();

        // Keep exactly `earned` funded so the committer's outstanding claim is always covered.
        st.funded = earned;
        IERC20(st.token).safeTransfer(msg.sender, remainder);
        emit PremiumReclaimed(commitmentId, msg.sender, remainder);
    }

    // =========================================================================
    // Views
    // =========================================================================

    /// @notice Premium accrued to the committer for `commitmentId` as of now (or the close time if
    ///         the commitment has ended), capped by the counterparty's cumulative deposits.
    function earnedOf(uint256 commitmentId) external view returns (uint256) {
        Stream storage st = streamOf[commitmentId];
        return _earned(st, _endTimestamp(commitmentId));
    }

    /// @notice Premium the counterparty could recover right now, were the commitment closed at this
    ///         instant (funded minus accrued). Advisory while the stream is still active.
    function reclaimableOf(uint256 commitmentId) external view returns (uint256) {
        Stream storage st = streamOf[commitmentId];
        return st.funded - _earned(st, _endTimestamp(commitmentId));
    }

    // =========================================================================
    // IDistributionStrategy
    // =========================================================================

    /// @inheritdoc IDistributionStrategy
    /// @dev `strategyParams` is `abi.encode(uint256 ratePerSecond)` in backing-token units/second.
    ///      A zero rate binds a dormant stream (no premium accrues) rather than reverting, mirroring
    ///      `FlatFeeAtCreate`'s zero-fee no-op.
    function onCommitmentCreated(CreatedContext calldata ctx) external onlyManager {
        Stream storage st = streamOf[ctx.base.commitmentId];
        if (st.bound) revert AlreadyBound();
        uint256 ratePerSecond = abi.decode(ctx.strategyParams, (uint256));

        st.ratePerSecond = ratePerSecond;
        st.token = ctx.base.token;
        st.startTime = ctx.base.timestamp;
        st.bound = true;
    }

    /// @inheritdoc IDistributionStrategy
    /// @dev The committer collects streamed premium, paid directly from this contract's balance
    ///      (self-custody payout, §D.7 `DistributionPaid` emitted here). Works in any commitment
    ///      state — earned-but-unclaimed premium remains collectible after the policy ends.
    function claim(ClaimContext calldata ctx, bytes calldata)
        external
        onlyManager
        nonReentrant
        returns (TokenMovement[] memory)
    {
        if (ctx.caller != ctx.base.committer) revert NotAuthorized();
        Stream storage st = streamOf[ctx.base.commitmentId];
        if (!st.bound) revert NothingToClaim();

        uint64 endTime = ctx.closedAt == 0 ? ctx.base.timestamp : ctx.closedAt;
        uint256 earned = _earned(st, endTime);
        uint256 payout = earned - st.claimed;
        if (payout == 0) revert NothingToClaim();

        st.claimed = earned;
        IERC20(st.token).safeTransfer(ctx.base.committer, payout);
        emit ICM.DistributionPaid(
            address(this), ctx.base.committer, st.token, payout, ctx.base.commitmentId, bytes32(0)
        );
        return new TokenMovement[](0);
    }

    /// @inheritdoc IDistributionStrategy
    function pending(ClaimContext calldata ctx, bytes calldata) external view returns (uint256) {
        Stream storage st = streamOf[ctx.base.commitmentId];
        uint64 endTime = ctx.closedAt == 0 ? ctx.base.timestamp : ctx.closedAt;
        return _earned(st, endTime) - st.claimed;
    }

    /// @inheritdoc IDistributionStrategy
    /// @dev Accrual is computed on read (time-based), so there is nothing to advance and no
    ///      movement to emit — premium lives in this contract, never in manager escrow.
    function distribute(DistributeContext calldata) external view onlyManager returns (TokenMovement[] memory) {
        return new TokenMovement[](0);
    }

    /// @inheritdoc IDistributionStrategy
    /// @dev No-op: the stream freezes at close via the live `manager.closedAt` read, so the release
    ///      hook has no sweep to take. Kept a no-op (not reverting) so it never parks the release.
    function onCommitmentReleased(LifecycleContext calldata)
        external
        view
        onlyManager
        returns (TokenMovement[] memory)
    {
        return new TokenMovement[](0);
    }

    /// @inheritdoc IDistributionStrategy
    /// @dev No-op for the same reason as `onCommitmentReleased`.
    function onCommitmentForfeited(ForfeitContext calldata) external view onlyManager returns (TokenMovement[] memory) {
        return new TokenMovement[](0);
    }

    // =========================================================================
    // Internal
    // =========================================================================

    /// @dev Premium accrued to the committer by `endTime`: `ratePerSecond * elapsed`, capped by the
    ///      counterparty's cumulative deposits. `endTime` is either now or the commitment's close.
    function _earned(Stream storage st, uint64 endTime) internal view returns (uint256) {
        if (!st.bound || st.ratePerSecond == 0 || endTime <= st.startTime) return 0;
        uint256 accrued = st.ratePerSecond * (endTime - st.startTime);
        return accrued > st.funded ? st.funded : accrued;
    }

    /// @dev The timestamp accrual is measured to: the commitment's close time if it has ended,
    ///      otherwise now. Sourced live from the manager so a parked lifecycle hook cannot leave
    ///      the stream accruing past close.
    function _endTimestamp(uint256 commitmentId) internal view returns (uint64) {
        uint64 closed = ICM(manager).closedAt(commitmentId);
        return closed == 0 ? uint64(block.timestamp) : closed;
    }
}
