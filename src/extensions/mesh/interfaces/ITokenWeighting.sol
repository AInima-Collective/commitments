// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import {IFlowQuery} from "src/extensions/mesh/interfaces/IFlowQuery.sol";
import {IVotingPowerSource} from "src/shared/interfaces/IVotingPowerSource.sol";

/// @title ITokenWeighting
/// @notice Interface for the TokenWeighting sink node — normalizes multi-asset stake into
///         unified governance-compatible voting power using configurable per-denom weights.
///         Historical voting power is queryable at past block numbers via OZ Checkpoints.Trace256.
///         Inherits IVotingPowerSource so consumers (service managers) can depend on
///         the narrow voting-power surface without pulling in the full mesh interface.
interface ITokenWeighting is IFlowQuery, IVotingPowerSource {
    // ============================================================
    // EVENTS
    // ============================================================

    event Initialized(address indexed provider, address indexed governance);
    event Staked(address indexed staker, bytes32 indexed denom, uint256 amount);
    event StakeReleased(address indexed staker, bytes32 indexed denom, uint256 amount);
    event WeightUpdated(bytes32 indexed denom, uint256 oldWeightBps, uint256 newWeightBps);
    event RewardsDistributed(bytes32 indexed stakeDenom, address indexed rewardToken, uint256 rewardAmount);
    event RewardsClaimed(
        address indexed staker, bytes32 indexed stakeDenom, address indexed rewardToken, uint256 amount
    );
    event GovernanceTransferred(address indexed oldGovernance, address indexed newGovernance);
    /// @notice A denom with stake history was retired: a weight-0 epoch zeroes its
    ///         contribution from this block onward (history before it is preserved),
    ///         and it rejects new stake until re-activated by `updateWeight`.
    event DenomRetired(bytes32 indexed denom, uint256 previousWeightBps);
    /// @notice A never-staked denom was purged from the iterated set outright,
    ///         reclaiming a slot. Removing it changes no historical query (it
    ///         contributed zero at every block).
    event DenomPurged(bytes32 indexed denom);

    // ============================================================
    // ERRORS
    // ============================================================

    error AlreadyInitialized();
    error OnlyProvider();
    error OnlyGovernance();
    error ZeroAmount();
    error ZeroWeightBps();
    error ZeroTotalStake();
    error InsufficientStake();
    error UnregisteredDenom();
    error RewardTooSmall();
    /// @notice thrown when distributeRewards would push the per-denom reward-token
    ///         set above MAX_REWARD_TOKENS (32). Bounds the cost of stake/release iteration.
    error RewardTokenLimit();
    error ZeroGovernance();
    /// @notice thrown when registering a NEW denom would exceed MAX_DENOMS. Bounds the
    ///         O(denoms) cost of the voting-power queries used in quorum validation.
    ///         Retire an unused denom to reclaim a slot.
    error DenomCapReached();
    /// @notice thrown when retiring a denom that is already retired.
    error AlreadyRetired();
    /// @notice thrown when the provider stakes into a retired denom.
    error DenomIsRetired();

    // ============================================================
    // INITIALIZE
    // ============================================================

    /// @notice Initialize the token weighting node (called once by factory or deployer after clone)
    /// @param provider_ The single provider address allowed to call stake/releaseStake
    /// @param governance_ The governance address allowed to update weights
    function initialize(address provider_, address governance_) external;

    // ============================================================
    // STAKE MANAGEMENT (provider only)
    // ============================================================

    /// @notice Provider credits stake to a staker on a specific denom.
    /// @dev The provider is the only authorized caller; `staker` is the address whose
    ///      voting power is updated. This enables one provider contract (e.g. an
    ///      OperatorRegistry) to route multi-staker stake into a single TokenWeighting
    ///      sink — each staker gets its own per-denom row and its own power checkpoints.
    /// @param staker The address whose stake is being credited.
    /// @param denom The denom being staked.
    /// @param amount The amount being staked.
    function stake(address staker, bytes32 denom, uint256 amount) external;

    /// @notice Provider debits stake from a staker — decrements stake and updates checkpoints.
    /// @param staker The address whose stake is being debited.
    /// @param denom The denom to release.
    /// @param amount The amount to release.
    function releaseStake(address staker, bytes32 denom, uint256 amount) external;

    // ============================================================
    // WEIGHT MANAGEMENT (governance only)
    // ============================================================

    /// @notice Governance updates the per-denom normalization weight.
    /// @dev `weightBps` is a full-precision (uint256) governance factor applied as
    ///      `power = rawStake * weightBps / 10_000`. It is NOT capped at 10_000: it
    ///      simultaneously absorbs (a) decimal normalization of heterogeneous backing
    ///      tokens into a single common voting unit and (b) risk policy (haircut). E.g.
    ///      to map a 1e6-decimal token into a 1e18 common "dollar" unit at par,
    ///      `weightBps = 1e16`; a 1e18-decimal token at a governance-chosen rate `r`
    ///      (in common units per whole token) with haircut `h` uses
    ///      `weightBps = r * h / 1e18 * 10_000`. No price oracle is involved — the
    ///      factor is governance-set.
    /// @param denom The denom whose weight to update (registers new denom if first call)
    /// @param weightBps Full-precision normalization factor (e.g., 1e16, 3.2e7)
    function updateWeight(bytes32 denom, uint256 weightBps) external;

    /// @notice Governance retires a denom so it stops contributing to voting power
    ///         and stops accepting new stake — the bounded-set counterpart to
    ///         `updateWeight`, needed because the unbounded `_denoms` set drives the
    ///         O(denoms) cost of the quorum-validation voting-power queries.
    /// @dev A denom that never accrued stake is purged from the iterated set outright
    ///      (it contributed zero at every block, so no historical query changes). A
    ///      denom with stake history is instead made inert via a weight-0 epoch: its
    ///      contribution is zero from this block onward while every block before the
    ///      retirement still resolves the weight in force then — so `getVotingPowerAt`
    ///      / `getTotalPowerAt` at past blocks are unchanged. Re-activate a retired
    ///      denom by calling `updateWeight` with a non-zero weight.
    /// @param denom The denom to retire.
    function retireDenom(bytes32 denom) external;

    /// @notice The number of registered (iterated) denoms. Bounded by MAX_DENOMS.
    function denomCount() external view returns (uint256);

    /// @notice Whether `denom` is retired (inert, weight-0, rejecting new stake).
    function isDenomRetired(bytes32 denom) external view returns (bool);

    /// @notice Current raw (pre-weight) stake credited to a staker for a denom.
    function currentStake(address staker, bytes32 denom) external view returns (uint256);

    /// @notice Transfer governance to a new address. The caller must be the current
    ///         governance. The new address receives DEFAULT_ADMIN_ROLE and REWARDER_ROLE;
    ///         the old address loses both. Single-step — used to hand a TokenWeighting
    ///         node off to a Governor's Timelock.
    /// @param newGovernance The new governance address (must be non-zero)
    function transferGovernance(address newGovernance) external;

    // ============================================================
    // VOTING POWER QUERIES — inherited from IVotingPowerSource
    // ============================================================

    // ============================================================
    // REWARD DISTRIBUTION
    // ============================================================

    /// @notice Distribute rewards to stakers proportional to their stake via per-share accumulator
    /// @param stakeDenom The denom used to calculate proportional shares
    /// @param rewardToken The ERC20 token being distributed as rewards
    /// @param rewardAmount The total reward amount to distribute
    function distributeRewards(bytes32 stakeDenom, address rewardToken, uint256 rewardAmount) external;

    /// @notice Claim accumulated rewards for a given stake denom and reward token
    /// @param stakeDenom The denom whose stake determines reward share
    /// @param rewardToken The ERC20 reward token to claim
    function claimRewards(bytes32 stakeDenom, address rewardToken) external;
}
