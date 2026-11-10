// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import {Ownable, Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";

import {IArbiter} from "src/shared/arbitration/interfaces/IArbiter.sol";
import {ArbiterBase} from "src/shared/arbitration/ArbiterBase.sol";
import {ArbiterCapabilities} from "src/shared/arbitration/ArbiterCapabilities.sol";

/// @title ManualArbiter
/// @notice Minimal arbiter controlled by a single owner (EOA or multisig).
///         Every forfeit/release decision is a manual call from the owner.
///         Serves as the reference implementation for the simplest arbiter
///         shape — third parties can fork and replace the auth check with
///         committee votes, oracle predicates, ZK proofs, Kleros rulings, etc.
/// @dev Intended for demos, bootstrap deployments, and services with a trusted
///      admin. Production AVS services should prefer `AttestationArbiter` (or
///      another policy-encoded arbiter) where the policy is auditable from
///      on-chain code alone.
contract ManualArbiter is ArbiterBase, Ownable2Step {
    /// @dev Owner-settable off-chain metadata pointer (jurisdiction, policy,
    ///      dispute process). Empty until the owner sets it.
    string private _metadataURI;

    /// @notice Emitted when the owner updates the arbiter's metadata URI.
    event MetadataURIUpdated(string uri);

    constructor(address owner_, address manager_) Ownable(owner_) ArbiterBase(manager_) {}

    /// @inheritdoc IArbiter
    /// @dev The owner drives every action manually, so ManualArbiter can reach
    ///      the entire arbiter-authenticated manager surface — commitment,
    ///      agreement, and mutual.
    function arbiterCapabilities() external pure returns (uint256) {
        return ArbiterCapabilities.INITIATE_FORFEIT | ArbiterCapabilities.CANCEL_FORFEIT
            | ArbiterCapabilities.RELEASE_COMMITMENT | ArbiterCapabilities.FORFEIT_AGREEMENT
            | ArbiterCapabilities.RELEASE_AGREEMENT | ArbiterCapabilities.SETTLE_AGREEMENT
            | ArbiterCapabilities.MUTUAL_LOSS;
    }

    /// @inheritdoc IArbiter
    function arbiterMetadataURI() external view returns (string memory) {
        return _metadataURI;
    }

    /// @notice Set the off-chain metadata pointer surfaced via {arbiterMetadataURI}.
    function setMetadataURI(string calldata uri) external onlyOwner {
        _metadataURI = uri;
        emit MetadataURIUpdated(uri);
    }

    // =========================================================================
    // Owner actions — forfeit release lifecycle
    // =========================================================================

    /// @notice Initiate a forfeit on a commitment. Starts the challenge window.
    function initiateForfeit(uint256 commitmentId, uint16 penaltyBps) external onlyOwner {
        manager.initiateForfeit(commitmentId, penaltyBps);
    }

    /// @notice Cancel a pending forfeit (only during the challenge window).
    function cancelForfeit(uint256 commitmentId) external onlyOwner {
        manager.cancelForfeit(commitmentId);
    }

    /// @notice Release an active commitment — frees the committer's encumbered backing.
    function release(uint256 commitmentId) external onlyOwner {
        manager.releaseCommitment(commitmentId);
    }

    /// @notice Forfeit both sides of an agreement atomically at `penaltyBps`.
    /// @dev The supplied penalty must fit each unresolved leg's independent ceiling; the tighter ceiling binds.
    function forfeitAgreement(uint256 agreementId, uint16 penaltyBps) external onlyOwner {
        manager.forfeitAgreement(agreementId, penaltyBps);
    }

    /// @notice Release both sides of an agreement atomically.
    function releaseAgreement(uint256 agreementId) external onlyOwner {
        manager.releaseAgreement(agreementId);
    }

    /// @notice Arbiter-instructed bilateral settle within the agreement's per-direction
    ///         lifetime caps.
    /// @param agreementId Target agreement.
    /// @param fromProposer Direction: true = proposer pays acceptor.
    /// @param units Encumbered backing units to move from payer to receiver.
    /// @param evidenceHash Opaque arbiter audit-trail commitment (e.g. EAS UID).
    function settleAgreement(uint256 agreementId, bool fromProposer, uint256 units, bytes32 evidenceHash)
        external
        onlyOwner
    {
        manager.settleAgreement(agreementId, fromProposer, units, evidenceHash);
    }

    // =========================================================================
    // Owner actions — mutual (shared-loss) lifecycle
    // =========================================================================

    /// @notice Activate a mutual so it can accept losses. No loss can be
    ///         declared until the mutual is active.
    function activateMutual(uint256 mutualId) external onlyOwner {
        manager.activateMutual(mutualId);
    }

    /// @notice Declare a loss against a mutual, opening its challenge window.
    /// @param mutualId Target mutual.
    /// @param lossNumeraire Loss amount denominated in the mutual's numeraire.
    /// @param evidenceHash Opaque arbiter audit-trail commitment (e.g. EAS UID).
    function initiateMutualLoss(uint256 mutualId, uint256 lossNumeraire, bytes32 evidenceHash) external onlyOwner {
        manager.initiateMutualLoss(mutualId, lossNumeraire, evidenceHash);
    }

    /// @notice Cancel (veto) a pending mutual loss during its challenge window.
    function cancelMutualLoss(uint256 mutualId) external onlyOwner {
        manager.cancelMutualLoss(mutualId);
    }
}
