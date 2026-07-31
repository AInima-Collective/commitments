// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

/// @title IServiceHandler
/// @notice Interface for service handlers that receive signed envelopes.
interface IServiceHandler {
    /// @notice Signature data accompanying an envelope.
    struct SignatureData {
        address[] signers;
        bytes[] signatures;
        uint32 referenceBlock;
    }

    /// @notice Envelope containing event data from the operator service.
    struct Envelope {
        bytes20 eventId;
        bytes12 ordering; // Consumer-defined sequencing (e.g. AttestationArbiter's strict per-target ordering)
        bytes payload;
    }

    /// @notice Handles a signed envelope from the aggregator.
    function handleSignedEnvelope(Envelope calldata envelope, SignatureData calldata signatureData) external;

    /// @notice Returns the address of the service manager used for validation.
    function getServiceManager() external view returns (address);
}
