// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import {IServiceHandler} from "src/extensions/services/interfaces/IServiceHandler.sol";

/// @title IServiceManager
/// @notice Generic envelope-verification vocabulary: a service manager validates
///         a signed `IServiceHandler.Envelope` against a quorum/threshold of
///         registered operator signatures. Consumed by `ServiceEnvelopeVerifier`
///         (and through it `AttestationArbiter` / `MerkleSnapshotAdapter`). The
///         name predates the protocol but the mechanism is not AVS-specific.
interface IServiceManager {
    // Validation errors
    error LengthMismatch();
    error InvalidLength();
    error NotSorted();
    error InvalidSignature();
    error SignerNotRegistered();
    error InvalidReferenceBlock();
    /// @dev The caller passed a `referenceBlock` older than `maxReferenceBlockAge`
    ///      blocks behind the current head. Validation must use a recent snapshot.
    error StaleReferenceBlock(uint32 referenceBlock, uint96 maxAge);
    error InsufficientSignedStake();
    error InsufficientQuorumZero();
    error InsufficientQuorum(uint256 signerWeight, uint256 thresholdWeight, uint256 totalWeight);

    // Configuration errors
    error InvalidThresholdWeight();
    error InvalidQuorumParameters();
    error ZeroAmount();

    // Events
    event ServiceURIUpdated(string serviceURI);
    event QuorumThresholdUpdated(uint256 indexed numerator, uint256 indexed denominator);

    /// @notice Validates a signed envelope against quorum requirements.
    function validate(IServiceHandler.Envelope calldata envelope, IServiceHandler.SignatureData calldata signatureData)
        external
        view;

    /// @notice Returns the operator's current weight.
    function getOperatorWeight(address operator) external view returns (uint256);

    /// @notice Returns the service URI.
    function getServiceURI() external view returns (string memory);

    /// @notice Sets the service URI.
    function setServiceURI(string calldata _serviceURI) external;

    /// @notice Returns the operator address for a given signing key.
    function getLatestOperatorForSigningKey(address signingKeyAddress) external view returns (address);

    /// @notice Returns the linked operator registry (eligibility source) address.
    function getStakeRegistry() external view returns (address);
}
