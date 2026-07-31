// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

/// @title IOperatorServiceRegistry
/// @notice Interface for the OperatorServiceRegistry — a thin service-middleware glue
///         layer. Holds service-operator enrollment, signing keys, quorum/threshold,
///         and signature validation. It custodies no stake; operator voting power is
///         delegated to an external IVotingPowerSource (configurable, typically a
///         TokenWeighting mesh node).
/// @dev Enrollment here is distinct from `OperatorRegistry.register()`: that backs an
///      operator with committed capital, whereas `enrollServiceOperator()` opts an
///      already-eligible operator into THIS service's signing/voting-power set.
interface IOperatorServiceRegistry {
    // =========================================================================
    // Events
    // =========================================================================

    event OperatorRegistered(address indexed operator, uint256 weight);
    event OperatorDeregistered(address indexed operator);
    event OperatorSigningKeyUpdated(address indexed operator, address indexed oldKey, address indexed newKey);
    event StakeThresholdUpdated(uint256 newThreshold);
    event VotingPowerSourceUpdated(address indexed oldSource, address indexed newSource);
    /// @notice Emitted when admin updates the `maxReferenceBlockAge` gate.
    event MaxReferenceBlockAgeUpdated(uint96 oldValue, uint96 newValue);

    // =========================================================================
    // Errors
    // =========================================================================

    error NotActiveOperator();
    error AlreadyRegistered();
    error NotRegistered();
    error InvalidSigningKey();
    error SigningKeyAlreadyAssigned();
    error InvalidSigningKeySignature();
    error NotAdminOrSelf();
    error InvalidVotingPowerSource();
    error InvalidOperatorRegistry();
    error InvalidAdmin();

    // =========================================================================
    // Operator lifecycle
    // =========================================================================

    /// @notice Enroll the caller as a service operator (signing/voting-power
    ///         participant) in this middleware.
    /// @dev Caller must be an active operator in the linked OperatorRegistry. This
    ///      is service participation, not stake custody — no capital moves here.
    function enrollServiceOperator() external;

    /// @notice Withdraw a service operator from this middleware.
    /// @dev Callable by admin or the operator themselves. Clears the signing key
    ///      so historical signature validation at post-withdrawal blocks fails.
    function withdrawServiceOperator(address operator) external;

    // =========================================================================
    // Signing key management
    // =========================================================================

    /// @notice Update the caller's signing key. The new key must sign a
    ///         domain-separated proof of possession (operator, this, chainid).
    function updateOperatorSigningKey(address newSigningKey, bytes memory signingKeySignature) external;

    // =========================================================================
    // Voting-power source configuration
    // =========================================================================

    /// @notice Set the IVotingPowerSource used for operator weight lookups.
    /// @dev Admin only. Changing the source changes the power reading for the
    ///      current block onward; historical queries delegate to the *current*
    ///      source (no snapshots are taken inside the registry).
    function setVotingPowerSource(address newSource) external;

    /// @notice Returns the configured IVotingPowerSource.
    function votingPowerSource() external view returns (address);

    // =========================================================================
    // Views
    // =========================================================================

    /// @notice Whether an address is registered in this middleware.
    function operatorRegistered(address operator) external view returns (bool);

    /// @notice Returns the operator's signing key at a given block.
    function getOperatorSigningKeyAtBlock(address operator, uint32 blockNumber) external view returns (address);

    /// @notice Returns the operator's latest signing key.
    function getLatestOperatorSigningKey(address operator) external view returns (address);

    /// @notice Returns the linked OperatorRegistry address (the eligibility source).
    function operatorRegistry() external view returns (address);

    /// @notice Returns the total number of registered operators.
    function totalOperators() external view returns (uint256);
}
