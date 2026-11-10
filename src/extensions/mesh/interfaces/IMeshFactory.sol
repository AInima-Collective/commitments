// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

/// @dev Mesh node type ids. Each node returns its id from `IEntity.factoryTypeId()` and
///      `MeshFactory` whitelists each implementation slot against it.
bytes32 constant FAN_IN_TYPE_ID = keccak256("commitments.mesh.fan_in");
bytes32 constant FAN_OUT_TYPE_ID = keccak256("commitments.mesh.fan_out");
bytes32 constant TOKEN_WEIGHTING_TYPE_ID = keccak256("commitments.mesh.token_weighting");

/// @title IMeshFactory
/// @notice Factory for deploying FanIn, FanOut, and TokenWeighting mesh nodes as minimal clones.
///         Atomic clone + initialize to prevent front-running.
interface IMeshFactory {
    // ============================================================
    // EVENTS
    // ============================================================

    /// @notice Emitted when a new node clone is deployed and initialized
    /// @param impl The implementation contract address that was cloned
    /// @param clone The newly deployed clone address
    /// @param nodeType The node type string (e.g. "fan_in", "fan_out", "token_weighting")
    event NodeDeployed(address indexed impl, address indexed clone, string nodeType);

    // ============================================================
    // IMPLEMENTATION ADDRESSES
    // ============================================================

    function fanInImpl() external view returns (address);
    function fanOutImpl() external view returns (address);
    function tokenWeightingImpl() external view returns (address);

    // ============================================================
    // DEPLOY (non-deterministic)
    // ============================================================

    /// @notice Deploy a FanIn clone and initialize it atomically
    /// @param consumer The single consumer for the fan-in node
    /// @param manager The manager/owner address
    /// @return clone The address of the deployed FanIn clone
    function deployFanIn(address consumer, address manager) external returns (address clone);

    /// @notice Deploy a FanOut clone and initialize it atomically
    /// @param provider The single provider for the fan-out node
    /// @param manager The manager/owner address
    /// @return clone The address of the deployed FanOut clone
    function deployFanOut(address provider, address manager) external returns (address clone);

    /// @notice Deploy a TokenWeighting clone and initialize it atomically
    /// @param provider The single provider for the token weighting node
    /// @param governance The governance address for weight updates
    /// @return clone The address of the deployed TokenWeighting clone
    function deployTokenWeighting(address provider, address governance) external returns (address clone);

    // ============================================================
    // DEPLOY DETERMINISTIC (salt-based)
    // ============================================================

    /// @notice Deploy a FanIn clone at a deterministic address derived from salt
    /// @param salt Arbitrary bytes32 salt for address derivation
    /// @param consumer The single consumer for the fan-in node
    /// @param manager The manager/owner address
    /// @return clone The deployed clone address (predictable via Clones.predictDeterministicAddress)
    function deployFanInAt(bytes32 salt, address consumer, address manager) external returns (address clone);

    /// @notice Deploy a FanOut clone at a deterministic address derived from salt
    /// @param salt Arbitrary bytes32 salt for address derivation
    /// @param provider The single provider for the fan-out node
    /// @param manager The manager/owner address
    /// @return clone The deployed clone address
    function deployFanOutAt(bytes32 salt, address provider, address manager) external returns (address clone);

    /// @notice Deploy a TokenWeighting clone at a deterministic address derived from salt
    /// @param salt Arbitrary bytes32 salt for address derivation
    /// @param provider The single provider for the token weighting node
    /// @param governance The governance address for weight updates
    /// @return clone The deployed clone address
    function deployTokenWeightingAt(bytes32 salt, address provider, address governance) external returns (address clone);

    // ============================================================
    // ADDRESS PREDICTION
    // ============================================================

    /// @notice Predict the deterministic address for a FanIn clone with a given salt
    function predictFanInAddress(bytes32 salt) external view returns (address);

    /// @notice Predict the deterministic address for a FanOut clone with a given salt
    function predictFanOutAddress(bytes32 salt) external view returns (address);

    /// @notice Predict the deterministic address for a TokenWeighting clone with a given salt
    function predictTokenWeightingAddress(bytes32 salt) external view returns (address);
}
