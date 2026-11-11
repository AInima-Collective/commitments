// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

interface IFanIn {
    /// @notice Initialize the fan-in node (called once by factory after clone)
    /// @param consumer The single consumer address that receives aggregated stake
    /// @param manager The manager/owner address that can register providers
    function initialize(address consumer, address manager) external;

    /// @notice Register a provider with its denom mapping
    /// @param provider The provider address whose stake the manager credits via stake()
    /// @param denomIn The denom string the provider stakes with
    /// @param denomOut The local denom this fan-in exposes to the consumer
    /// @param maxPenaltyBps Max forfeiture in basis points (0..10_000) for this provider's stake
    /// @param unbondingPeriod Unbonding period in seconds for this provider's stake
    function registerProvider(
        address provider,
        bytes32 denomIn,
        bytes32 denomOut,
        uint16 maxPenaltyBps,
        uint64 unbondingPeriod
    ) external;

    /// @notice Credit a registered provider's stake — mapped from denomIn to denomOut.
    /// @dev Manager-only: only the verifying manager (e.g. OperatorRegistry) may credit
    ///      stake, so mesh stake can never exceed real, manager-verified backing. The
    ///      provider is passed explicitly rather than inferred from msg.sender.
    /// @param provider The registered provider whose stake is credited.
    /// @param denomIn The denom being staked (must be registered for `provider`).
    /// @param amount The amount being staked.
    function stake(address provider, bytes32 denomIn, uint256 amount) external;

    /// @notice Total stake aggregated for a local output denom.
    function totalStake(bytes32 denomOut) external view returns (uint256);

    /// @notice Consumer or manager releases stake back to its registered provider.
    /// @dev the provider is derived from `outputSources[denomOut]`
    ///      rather than passed in, so off-chain indexers cannot be poisoned by a consumer
    ///      emitting an arbitrary provider address.
    /// @param denomOut The local denom to release
    /// @param amount The amount to release
    function releaseStake(bytes32 denomOut, uint256 amount) external;
}
