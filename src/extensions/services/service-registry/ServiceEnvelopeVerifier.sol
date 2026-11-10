// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import {IServiceHandler} from "src/extensions/services/interfaces/IServiceHandler.sol";
import {IServiceManager} from "src/extensions/services/interfaces/IServiceManager.sol";

/// @title ServiceEnvelopeVerifier
/// @notice Shared base for contracts that consume quorum-signed envelopes from
///         the operator service. It converges the two responsibilities every
///         envelope consumer needs onto a single, replay-safe path:
///           (a) per-`eventId` consumed tracking (replay defense), and
///           (b) the quorum-signature validation call into the bound
///               `IServiceManager` — whose digest is domain-separated by
///               `block.chainid` + the verifying instance address, so a
///               signature minted for one chain/instance cannot be replayed on
///               another.
/// @dev `AttestationArbiter` inherits this. The consumed set lives in plain
///      storage; the consumer is a non-upgradeable contract, so no namespaced
///      (EIP-7201) layout is required.
abstract contract ServiceEnvelopeVerifier {
    /// @notice The bound service manager that validates envelope signatures.
    /// @dev Immutable; set once at construction.
    IServiceManager public immutable serviceManager;

    /// @dev Replay-protection set: `eventId => consumed?`.
    mapping(bytes20 => bool) private _consumedEnvelopes;

    /// @notice Thrown when an envelope's `eventId` has already been processed.
    error EnvelopeAlreadyConsumed(bytes20 eventId);

    constructor(IServiceManager serviceManager_) {
        serviceManager = serviceManager_;
    }

    /// @dev Validate quorum signatures then atomically mark the envelope
    ///      consumed. MUST be called before any state-changing dispatch so a
    ///      replay of the same `eventId` reverts before its side effects run.
    ///      Reverts via `serviceManager.validate` on insufficient quorum /
    ///      invalid signers, or with `EnvelopeAlreadyConsumed` on replay.
    /// @param envelope The signed envelope (carries the unique `eventId`).
    /// @param signatureData The accompanying quorum signature set.
    function _verifyAndConsumeEnvelope(
        IServiceHandler.Envelope calldata envelope,
        IServiceHandler.SignatureData calldata signatureData
    ) internal {
        // Quorum validation first (reverts if signatures don't meet threshold).
        // The digest validated here is domain-separated inside the service
        // manager, blocking cross-chain / cross-instance replay.
        serviceManager.validate(envelope, signatureData);

        // Replay protection: check-and-set before the caller dispatches.
        if (_consumedEnvelopes[envelope.eventId]) revert EnvelopeAlreadyConsumed(envelope.eventId);
        _consumedEnvelopes[envelope.eventId] = true;
    }

    /// @notice True iff the envelope's `eventId` has already been consumed.
    function isEnvelopeConsumed(bytes20 eventId) public view returns (bool) {
        return _consumedEnvelopes[eventId];
    }
}
