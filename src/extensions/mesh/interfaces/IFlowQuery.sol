// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

struct ProviderInfo {
    address provider;
    StakeInfo[] stakes;
}

struct ConsumerInfo {
    address consumer;
    StakeInfo[] stakes;
}

/// @notice Stake info for a provider/consumer in IFlowQuery views.
/// @dev `maxPenaltyBps`
///      (uint16, 0..10_000) for protocol-wide consistency. See `docs/units.md`.
struct StakeInfo {
    bytes32 denom;
    uint16 maxPenaltyBps;
    uint64 unbondingPeriod;
    uint256 amount;
}

struct AvailableDenom {
    bytes32 local;
    address sourceProvider;
    bytes32 sourceDenom;
}

/// @title IFlowQuery
/// @notice Topology-discovery interface for mesh nodes.
///         `nodeType()` returns `bytes32` for stable client-side dispatch; reserved
///         constants are `FAN_IN`, `FAN_OUT`, `TOKEN_WEIGHTING`. The free-form
///         `nodeTypeName()` returns the human-readable string. Paginated views are
///         RECOMMENDED for production use — the unbounded variants are convenient
///         for small graphs but cost O(N·M) and can run out of gas at scale.
interface IFlowQuery {
    /// @notice Reserved nodeType constants. Implementations of additional node types
    ///         SHOULD reserve their own bytes32 constants.
    function nodeType() external view returns (bytes32);
    function nodeTypeName() external view returns (string memory);

    function providers() external view returns (ProviderInfo[] memory);
    function consumers() external view returns (ConsumerInfo[] memory);
    function availableDenoms() external view returns (AvailableDenom[] memory);

    /// @notice Paginated providers — `offset` may exceed length (returns empty array).
    function providersPaged(uint256 offset, uint256 limit) external view returns (ProviderInfo[] memory);
    function consumersPaged(uint256 offset, uint256 limit) external view returns (ConsumerInfo[] memory);
    function availableDenomsPaged(uint256 offset, uint256 limit) external view returns (AvailableDenom[] memory);
}

/// @notice Reserved nodeType constants. Library so consumers can `using FlowNodeTypes for bytes32`.
library FlowNodeTypes {
    bytes32 internal constant FAN_IN = keccak256("fan_in");
    bytes32 internal constant FAN_OUT = keccak256("fan_out");
    bytes32 internal constant TOKEN_WEIGHTING = keccak256("token_weighting");
}
