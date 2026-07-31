// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import {ReentrancyGuardTransient} from "@openzeppelin/contracts/utils/ReentrancyGuardTransient.sol";

import {IServiceHandler} from "src/extensions/services/interfaces/IServiceHandler.sol";
import {IServiceManager} from "src/extensions/services/interfaces/IServiceManager.sol";
import {ServiceEnvelopeVerifier} from "src/extensions/services/service-registry/ServiceEnvelopeVerifier.sol";
import {IMerkleSnapshot} from "src/extensions/rewards/interfaces/IMerkleSnapshot.sol";

/// @title MerkleSnapshotAdapter
/// @notice Validates quorum-signed envelopes and forwards merkle roots to
///         a bound `MerkleSnapshot.submitRoot`. Set as the snapshot's active
///         `updater` via the snapshot's §0.6 staged-swap surface
///         (`stageUpdater(adapter)` → `activateUpdater()`).
///         The snapshot is service-agnostic; auth on `submitRoot` resolves
///         against the snapshot's own `activeUpdater()`, which is this contract
///         once activated.
/// @dev Non-upgradeable, with immutable bindings. Replay protection and the
///      domain-separated quorum validation are inherited from the shared
///      `ServiceEnvelopeVerifier` base — the same path the AttestationArbiter
///      uses — so the two core envelope consumers can't drift apart.
contract MerkleSnapshotAdapter is ReentrancyGuardTransient, ServiceEnvelopeVerifier, IServiceHandler {
    /// @notice Emitted when an envelope is validated and its merkle root is
    ///         forwarded to the bound snapshot.
    event RootRelayed(bytes20 indexed eventId, bytes32 indexed merkleRoot, bytes32 ipfsHash, string ipfsCid);

    error ZeroAddress();
    error ZeroRoot();

    /// @notice The bound merkle snapshot.
    IMerkleSnapshot public immutable snapshot;

    constructor(IServiceManager serviceManager_, IMerkleSnapshot snapshot_) ServiceEnvelopeVerifier(serviceManager_) {
        if (address(serviceManager_) == address(0)) revert ZeroAddress();
        if (address(snapshot_) == address(0)) revert ZeroAddress();
        snapshot = snapshot_;
    }

    /// @inheritdoc IServiceHandler
    function handleSignedEnvelope(
        IServiceHandler.Envelope calldata envelope,
        IServiceHandler.SignatureData calldata signatureData
    ) external nonReentrant {
        // 1+2. Domain-separated quorum validation + replay protection
        //       (consumed-eventId check-and-set) via the shared verifier.
        _verifyAndConsumeEnvelope(envelope, signatureData);

        // 3. Decode the envelope payload:
        //    abi.encode(bytes32 root, bytes32 ipfsHash, string ipfsCid, uint256 totalValue)
        (bytes32 root, bytes32 ipfsHash, string memory ipfsCid,) =
            abi.decode(envelope.payload, (bytes32, bytes32, string, uint256));
        if (root == bytes32(0)) revert ZeroRoot();

        // 4. Forward to the bound snapshot. Snapshot resolves auth via its own
        //    activeUpdater(), which equals address(this) once the §0.6 swap has
        //    activated.
        snapshot.submitRoot(root);

        emit RootRelayed(envelope.eventId, root, ipfsHash, ipfsCid);
    }

    /// @inheritdoc IServiceHandler
    function getServiceManager() external view returns (address) {
        return address(serviceManager);
    }
}
