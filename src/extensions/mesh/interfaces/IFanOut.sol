// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

/// @notice Per-staker tracking for a specific denomination.
/// @dev `totalForfeitable = Σ(amount_i × maxPenaltyBps_i / 10_000)`.
struct UserInfo {
    uint256 locked; // total stake from provider for this denom
    uint256 totalForfeitable; // sum(amount_i * maxPenaltyBps_i / 10_000) across all outflows
}

/// @notice A single outflow configuration: one consumer's slice of the staker's stake.
/// @dev `maxPenaltyBps` is in basis points (0..10_000).
struct Outflow {
    address consumer;
    uint16 maxPenaltyBps;
    uint256 portionBps; // portion of staker's locked amount, out of 10000
}

/// @notice Tracks what a consumer holds against a specific staker/denom pair.
/// @dev `exposure = amount × maxPenaltyBps / 10_000`. Named `FanOutLien` (not `Lien`)
///      to avoid colliding with the manager's "a commitment is a lien" vocabulary —
///      this is a distinct mesh struct, not a commitment.
struct FanOutLien {
    uint256 amount; // amount of stake (portionBps * locked / 10_000)
    uint256 exposure; // amount * maxPenaltyBps / 10_000
}

/// @title IFanOut
/// @notice Interface for the FanOutNode contract.
///         FanOut distributes one provider's committed stake to multiple consumers
///         with exposure allocation enforcement.
interface IFanOut {
    // =========================================================================
    // Initialization
    // =========================================================================

    /// @notice Initialize the fan-out node (called once by factory after clone)
    /// @param provider_ The single provider address whose stake is distributed
    /// @param manager_ Recorded in the `Initialized` event only; it has no powers on the node.
    ///        Only the provider configures outflows.
    function initialize(address provider_, address manager_) external;

    // =========================================================================
    // Outflow configuration
    // =========================================================================

    /// @notice Configure consumer outflows for a specific denom
    /// @dev sum(portionBps) must be <= 10000 and consumers must be unique.
    ///      Re-validates exposure allocation.
    /// @param denom The stake denomination being distributed
    /// @param outflows Array of consumer outflows (portions must sum to <= 10000, no duplicate consumers)
    function setOutflows(bytes32 denom, Outflow[] calldata outflows) external;

    // =========================================================================
    // Stake management
    // =========================================================================

    /// @notice Provider increases their staked amount for a denom
    /// @dev Only callable by the registered provider. Re-validates exposure allocation.
    /// @param denom The stake denomination
    /// @param amount The amount being staked
    function stake(bytes32 denom, uint256 amount) external;

    /// @notice Consumer releases stake back upstream
    /// @dev Only callable by a registered consumer. Decrements the lien.
    /// @param staker The staker whose lien is being reduced
    /// @param denom The stake denomination
    /// @param amount The amount to release
    function releaseStake(address staker, bytes32 denom, uint256 amount) external;

    // =========================================================================
    // Reward distribution
    // =========================================================================

    /// @notice Consumer distributes rewards proportional to stake
    /// @dev Only callable by a registered consumer. Updates per-share accumulator.
    ///      Uses SafeERC20.safeTransferFrom to pull reward tokens from consumer.
    /// @param stakeDenom The denom used to calculate proportional shares
    /// @param rewardToken The ERC20 token being distributed as rewards
    /// @param rewardAmount The total reward amount to distribute
    function distributeRewards(bytes32 stakeDenom, address rewardToken, uint256 rewardAmount) external;

    /// @notice Staker claims their pro-rata rewards
    /// @dev Pull-based: staker calls this to receive pending rewards.
    ///      Uses Synthetix/Compound per-share pattern.
    /// @param stakeDenom The denom for which rewards are being claimed
    /// @param rewardToken The ERC20 reward token to claim
    function claimRewards(bytes32 stakeDenom, address rewardToken) external;

    // =========================================================================
    // Views
    // =========================================================================

    /// @notice Get per-staker info for a specific denom
    /// @param staker The staker address
    /// @param denom The stake denomination
    /// @return info UserInfo struct with locked, totalForfeitable
    function getUserInfo(address staker, bytes32 denom) external view returns (UserInfo memory info);

    /// @notice Get all outflows configured by a staker for a specific denom
    /// @param staker The staker address
    /// @param denom The stake denomination
    /// @return outflows Array of configured outflows
    function getOutflows(address staker, bytes32 denom) external view returns (Outflow[] memory outflows);

    /// @notice Get the lien a specific consumer holds against a staker/denom pair
    /// @param staker The staker address
    /// @param denom The stake denomination
    /// @param consumer The consumer address
    /// @return lien The FanOutLien struct (amount and exposure)
    function getLien(address staker, bytes32 denom, address consumer) external view returns (FanOutLien memory lien);
}
