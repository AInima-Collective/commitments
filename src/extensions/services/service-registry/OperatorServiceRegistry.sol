// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import {UUPSUpgradeable} from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import {AccessControlUpgradeable} from "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";
import {EIP712Upgradeable} from "@openzeppelin/contracts-upgradeable/utils/cryptography/EIP712Upgradeable.sol";
import {IERC1271} from "@openzeppelin/contracts/interfaces/IERC1271.sol";
import {Checkpoints} from "@openzeppelin/contracts/utils/structs/Checkpoints.sol";
import {SignatureChecker} from "@openzeppelin/contracts/utils/cryptography/SignatureChecker.sol";

import {IServiceHandler} from "src/extensions/services/interfaces/IServiceHandler.sol";
import {IServiceManager} from "src/extensions/services/interfaces/IServiceManager.sol";
import {IOperatorServiceRegistry} from "src/extensions/services/interfaces/IOperatorServiceRegistry.sol";
import {
    OperatorServiceRegistryStorage
} from "src/extensions/services/service-registry/OperatorServiceRegistryStorage.sol";
import {IVotingPowerSource} from "src/shared/interfaces/IVotingPowerSource.sol";

/// @dev Minimal interface into the Commitments OperatorRegistry for eligibility.
interface IOperatorEligibility {
    function isOperator(address operator) external view returns (bool);
}

/// @title OperatorServiceRegistry
/// @notice Thin service-middleware glue: service-operator enrollment, signing
///         keys, quorum/threshold, and ECDSA signature validation. It custodies
///         no stake (hence "service registry", not "stake registry"): per-operator
///         voting power is read from an external IVotingPowerSource (typically a
///         TokenWeighting mesh node). A future BLS service manager can reuse the
///         same source.
contract OperatorServiceRegistry is
    UUPSUpgradeable,
    AccessControlUpgradeable,
    EIP712Upgradeable,
    IERC1271,
    IServiceManager,
    IOperatorServiceRegistry
{
    using SignatureChecker for address;
    using Checkpoints for Checkpoints.Trace160;
    using OperatorServiceRegistryStorage for OperatorServiceRegistryStorage.Layout;

    // =========================================================================
    // Constants
    // =========================================================================

    /// @notice Default `maxReferenceBlockAge` when storage is unset.
    ///         256 blocks ≈ 1h on a 12s chain — a window large enough for honest
    ///         envelope signing latency yet too short to outrun deregistration.
    uint96 public constant DEFAULT_MAX_REFERENCE_BLOCK_AGE = 256;

    /// @notice EIP-712 type hash for the quorum-signed `Envelope`. The dynamic
    ///         `payload` is hashed (`keccak256(payload)`) per the EIP-712 encoding
    ///         of `bytes`; `eventId`/`ordering` are fixed-size and encoded inline.
    /// @dev Field names/order MUST match `IServiceHandler.Envelope` exactly, or
    ///      off-chain EIP-712 signers and on-chain verification diverge.
    bytes32 public constant ENVELOPE_TYPEHASH = keccak256("Envelope(bytes20 eventId,bytes12 ordering,bytes payload)");

    // =========================================================================
    // Constructor
    // =========================================================================

    /// @dev Disable initializers on implementation contract (proxy pattern).
    constructor() {
        _disableInitializers();
    }

    // =========================================================================
    // Initializer
    // =========================================================================

    /// @notice Initialize the OperatorServiceRegistry.
    /// @param operatorRegistry_ OperatorRegistry used for eligibility checks.
    /// @param votingPowerSource_ External source of per-operator voting power.
    /// @param admin_ Address granted DEFAULT_ADMIN_ROLE.
    /// @param thresholdWeight_ Minimum absolute voting power required from signers.
    /// @param quorumNumerator_ Quorum fraction numerator.
    /// @param quorumDenominator_ Quorum fraction denominator.
    function initialize(
        address operatorRegistry_,
        address votingPowerSource_,
        address admin_,
        uint256 thresholdWeight_,
        uint256 quorumNumerator_,
        uint256 quorumDenominator_
    ) external initializer {
        __AccessControl_init();
        // EIP-712 domain: chainId + verifyingContract (this proxy) are folded into the
        // domain separator, replacing the manual (block.chainid, address(this)) prefix the
        // legacy EIP-191 digest carried. Bump `version` on any envelope-hashing change.
        __EIP712_init("CommitmentsServiceManager", "1");

        if (votingPowerSource_ == address(0)) revert InvalidVotingPowerSource();
        // zero operatorRegistry would brick onboarding under UUPS.
        if (operatorRegistry_ == address(0)) revert InvalidOperatorRegistry();
        if (admin_ == address(0)) revert InvalidAdmin();

        OperatorServiceRegistryStorage.Layout storage s = OperatorServiceRegistryStorage.layout();
        s.operatorRegistry = operatorRegistry_;
        s.votingPowerSource = votingPowerSource_;

        _updateStakeThreshold(thresholdWeight_);
        _updateQuorum(quorumNumerator_, quorumDenominator_);

        _grantRole(DEFAULT_ADMIN_ROLE, admin_);

        emit VotingPowerSourceUpdated(address(0), votingPowerSource_);
    }

    // =========================================================================
    // Operator lifecycle
    // =========================================================================

    /// @inheritdoc IOperatorServiceRegistry
    function enrollServiceOperator() external {
        OperatorServiceRegistryStorage.Layout storage s = OperatorServiceRegistryStorage.layout();

        if (s.operatorRegistered[msg.sender]) revert AlreadyRegistered();
        if (!IOperatorEligibility(s.operatorRegistry).isOperator(msg.sender)) {
            revert NotActiveOperator();
        }

        s.operatorRegistered[msg.sender] = true;

        emit OperatorRegistered(msg.sender);
    }

    /// @inheritdoc IOperatorServiceRegistry
    function withdrawServiceOperator(address operator) external {
        OperatorServiceRegistryStorage.Layout storage s = OperatorServiceRegistryStorage.layout();

        if (!s.operatorRegistered[operator]) revert NotRegistered();
        if (msg.sender != operator && !hasRole(DEFAULT_ADMIN_ROLE, msg.sender)) {
            revert NotAdminOrSelf();
        }

        s.operatorRegistered[operator] = false;

        // Clear signing key so historical resolution at post-deregistration blocks
        // returns 0 → SignerNotRegistered in validate().
        address oldKey = address(s.operatorSigningKeyHistory[operator].latest());
        if (oldKey != address(0)) {
            s.operatorSigningKeyHistory[operator].push(uint96(block.number), 0);
            s.signingKeyOperatorHistory[oldKey].push(uint96(block.number), 0);
        }

        emit OperatorDeregistered(operator);
    }

    // =========================================================================
    // Signing key management
    // =========================================================================

    /// @inheritdoc IOperatorServiceRegistry
    function updateOperatorSigningKey(address newSigningKey, bytes memory signingKeySignature) external {
        OperatorServiceRegistryStorage.Layout storage s = OperatorServiceRegistryStorage.layout();

        if (!s.operatorRegistered[msg.sender]) revert NotRegistered();
        if (newSigningKey == address(0)) revert InvalidSigningKey();

        // Proof of possession, domain-separated (operator, this, chainid).
        bytes32 messageHash = keccak256(abi.encode(msg.sender, address(this), block.chainid));
        if (!newSigningKey.isValidSignatureNow(messageHash, signingKeySignature)) {
            revert InvalidSigningKeySignature();
        }

        // Key must not be assigned to another operator.
        address currentOwner = address(s.signingKeyOperatorHistory[newSigningKey].latest());
        if (currentOwner != address(0) && currentOwner != msg.sender) {
            revert SigningKeyAlreadyAssigned();
        }

        address oldKey = address(s.operatorSigningKeyHistory[msg.sender].latest());
        if (newSigningKey == oldKey) return;

        s.operatorSigningKeyHistory[msg.sender].push(uint96(block.number), uint160(newSigningKey));
        s.signingKeyOperatorHistory[newSigningKey].push(uint96(block.number), uint160(msg.sender));
        if (oldKey != address(0)) {
            s.signingKeyOperatorHistory[oldKey].push(uint96(block.number), 0);
        }

        emit OperatorSigningKeyUpdated(msg.sender, oldKey, newSigningKey);
    }

    // =========================================================================
    // Voting-power source configuration
    // =========================================================================

    /// @inheritdoc IOperatorServiceRegistry
    function setVotingPowerSource(address newSource) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (newSource == address(0)) revert InvalidVotingPowerSource();
        OperatorServiceRegistryStorage.Layout storage s = OperatorServiceRegistryStorage.layout();
        address old = s.votingPowerSource;
        s.votingPowerSource = newSource;
        emit VotingPowerSourceUpdated(old, newSource);
    }

    /// @inheritdoc IOperatorServiceRegistry
    function votingPowerSource() external view returns (address) {
        return OperatorServiceRegistryStorage.layout().votingPowerSource;
    }

    // =========================================================================
    // Voting power views (delegate to IVotingPowerSource)
    // =========================================================================

    /// @notice Current voting power for an operator.
    function getVotingPower(address operator) external view returns (uint256) {
        return IVotingPowerSource(OperatorServiceRegistryStorage.layout().votingPowerSource).getVotingPower(operator);
    }

    /// @notice Historical voting power for an operator at a given block.
    function getVotingPowerAt(address operator, uint256 blockNumber) external view returns (uint256) {
        return IVotingPowerSource(OperatorServiceRegistryStorage.layout().votingPowerSource)
            .getVotingPowerAt(operator, blockNumber);
    }

    /// @notice Current total voting power across all registered operators.
    function getTotalPower() external view returns (uint256) {
        return IVotingPowerSource(OperatorServiceRegistryStorage.layout().votingPowerSource).getTotalPower();
    }

    /// @notice Historical total voting power at a given block.
    function getTotalPowerAt(uint256 blockNumber) external view returns (uint256) {
        return
            IVotingPowerSource(OperatorServiceRegistryStorage.layout().votingPowerSource).getTotalPowerAt(blockNumber);
    }

    // =========================================================================
    // IServiceManager — Validation
    // =========================================================================

    /// @inheritdoc IServiceManager
    function validate(IServiceHandler.Envelope calldata envelope, IServiceHandler.SignatureData calldata signatureData)
        external
        view
    {
        // EIP-712 typed-data digest. The domain separator folds in `block.chainid`
        // and this verifying instance (`address(this)`), so a quorum signature minted
        // for one chain / registry instance cannot be replayed against another
        // (cross-chain / cross-instance replay defense) — and signers see a structured
        // Envelope rather than an opaque personal_sign hash.
        bytes32 structHash =
            keccak256(abi.encode(ENVELOPE_TYPEHASH, envelope.eventId, envelope.ordering, keccak256(envelope.payload)));
        bytes32 digest = _hashTypedDataV4(structHash);
        _checkSignatures(digest, signatureData.signers, signatureData.signatures, signatureData.referenceBlock);
    }

    /// @inheritdoc IERC1271
    function isValidSignature(bytes32 digest, bytes memory _signatureData) external view returns (bytes4) {
        (address[] memory signers, bytes[] memory signatures, uint32 referenceBlock) =
            abi.decode(_signatureData, (address[], bytes[], uint32));
        _checkSignatures(digest, signers, signatures, referenceBlock);
        return IERC1271.isValidSignature.selector;
    }

    // =========================================================================
    // IServiceManager — Views
    // =========================================================================

    /// @inheritdoc IServiceManager
    function getOperatorWeight(address operator) external view returns (uint256) {
        return IVotingPowerSource(OperatorServiceRegistryStorage.layout().votingPowerSource).getVotingPower(operator);
    }

    /// @inheritdoc IServiceManager
    function getLatestOperatorForSigningKey(address signingKeyAddress) external view returns (address) {
        return address(OperatorServiceRegistryStorage.layout().signingKeyOperatorHistory[signingKeyAddress].latest());
    }

    /// @inheritdoc IServiceManager
    function getServiceURI() external view returns (string memory) {
        return OperatorServiceRegistryStorage.layout().serviceURI;
    }

    /// @inheritdoc IServiceManager
    function setServiceURI(string calldata _serviceURI) external onlyRole(DEFAULT_ADMIN_ROLE) {
        OperatorServiceRegistryStorage.layout().serviceURI = _serviceURI;
        emit ServiceURIUpdated(_serviceURI);
    }

    /// @inheritdoc IServiceManager
    function getStakeRegistry() external view returns (address) {
        return OperatorServiceRegistryStorage.layout().operatorRegistry;
    }

    // =========================================================================
    // IOperatorServiceRegistry — Views
    // =========================================================================

    /// @inheritdoc IOperatorServiceRegistry
    function operatorRegistered(address operator) external view returns (bool) {
        return OperatorServiceRegistryStorage.layout().operatorRegistered[operator];
    }

    /// @inheritdoc IOperatorServiceRegistry
    function getOperatorSigningKeyAtBlock(address operator, uint32 blockNumber) external view returns (address) {
        return address(
            OperatorServiceRegistryStorage.layout().operatorSigningKeyHistory[operator].upperLookup(uint96(blockNumber))
        );
    }

    /// @inheritdoc IOperatorServiceRegistry
    function getLatestOperatorSigningKey(address operator) external view returns (address) {
        return address(OperatorServiceRegistryStorage.layout().operatorSigningKeyHistory[operator].latest());
    }

    /// @inheritdoc IOperatorServiceRegistry
    function operatorRegistry() external view returns (address) {
        return OperatorServiceRegistryStorage.layout().operatorRegistry;
    }

    // =========================================================================
    // Admin — Quorum Threshold
    // =========================================================================

    /// @notice Update the minimum absolute voting power threshold.
    function updateStakeThreshold(uint256 thresholdWeight) external onlyRole(DEFAULT_ADMIN_ROLE) {
        _updateStakeThreshold(thresholdWeight);
    }

    /// @notice Update the quorum fraction.
    function updateQuorum(uint256 quorumNumerator, uint256 quorumDenominator) external onlyRole(DEFAULT_ADMIN_ROLE) {
        _updateQuorum(quorumNumerator, quorumDenominator);
    }

    /// @notice Update the max age (in blocks) accepted for `referenceBlock`
    ///         in `validate()` and `isValidSignature()`.
    /// @dev Reverts `ZeroAmount` on 0. Until first set, the default of 256 blocks (≈ 1h at
    ///      12s/block) applies.
    function setMaxReferenceBlockAge(uint96 newValue) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (newValue == 0) revert ZeroAmount();
        OperatorServiceRegistryStorage.Layout storage s = OperatorServiceRegistryStorage.layout();
        uint96 old = s.maxReferenceBlockAge;
        s.maxReferenceBlockAge = newValue;
        emit MaxReferenceBlockAgeUpdated(old, newValue);
    }

    /// @notice Returns the active `maxReferenceBlockAge` (lazy-init aware).
    function maxReferenceBlockAge() external view returns (uint96) {
        uint96 stored = OperatorServiceRegistryStorage.layout().maxReferenceBlockAge;
        return stored == 0 ? DEFAULT_MAX_REFERENCE_BLOCK_AGE : stored;
    }

    // =========================================================================
    // Internal — Signature validation
    // =========================================================================

    function _checkSignatures(
        bytes32 digest,
        address[] memory signers,
        bytes[] memory signatures,
        uint32 referenceBlock
    ) internal view {
        OperatorServiceRegistryStorage.Layout storage s = OperatorServiceRegistryStorage.layout();

        uint256 signersLength = signers.length;
        if (signersLength != signatures.length) revert LengthMismatch();
        if (signersLength == 0) revert InvalidLength();

        // `referenceBlock` must be a real, recent past block. This also rejects the
        // `type(uint32).max` "live" sentinel, so the helpers below only read history.
        if (referenceBlock >= block.number) revert InvalidReferenceBlock();
        uint96 maxAge = s.maxReferenceBlockAge == 0 ? DEFAULT_MAX_REFERENCE_BLOCK_AGE : s.maxReferenceBlockAge;
        if (block.number - uint256(referenceBlock) > uint256(maxAge)) {
            revert StaleReferenceBlock(referenceBlock, maxAge);
        }

        address lastSigner;
        uint256 signedWeight;

        for (uint256 i; i < signersLength; ++i) {
            address currentSigner = signers[i];

            // Enforce ascending order (prevents duplicates).
            if (!(lastSigner < currentSigner)) revert NotSorted();
            lastSigner = currentSigner;

            if (!currentSigner.isValidSignatureNow(digest, signatures[i])) {
                revert InvalidSignature();
            }

            address operator = _getOperatorForSigningKey(s, currentSigner, referenceBlock);
            // Even when a deregistered operator's signing key
            // resolved at a past block, they must be CURRENTLY registered. Closes
            // the historical-snapshot bypass that lets ex-operators sign live
            // attestations.
            if (!s.operatorRegistered[operator]) revert SignerNotRegistered();
            signedWeight += _getOperatorPower(s, operator, referenceBlock);
        }

        _validateThresholdStake(s, signedWeight, referenceBlock);
    }

    function _getOperatorForSigningKey(
        OperatorServiceRegistryStorage.Layout storage s,
        address signingKey,
        uint32 referenceBlock
    ) internal view returns (address operator) {
        operator = address(s.signingKeyOperatorHistory[signingKey].upperLookup(uint96(referenceBlock)));
        if (operator == address(0)) revert SignerNotRegistered();
    }

    function _getOperatorPower(OperatorServiceRegistryStorage.Layout storage s, address operator, uint32 referenceBlock)
        internal
        view
        returns (uint256)
    {
        return IVotingPowerSource(s.votingPowerSource).getVotingPowerAt(operator, referenceBlock);
    }

    function _validateThresholdStake(
        OperatorServiceRegistryStorage.Layout storage s,
        uint256 signedWeight,
        uint32 referenceBlock
    ) internal view {
        uint256 totalWeight = IVotingPowerSource(s.votingPowerSource).getTotalPowerAt(referenceBlock);
        uint256 thresholdStake = s.thresholdWeightHistory.upperLookup(uint96(referenceBlock));
        if (thresholdStake > signedWeight) revert InsufficientSignedStake();

        if (totalWeight == 0) revert InsufficientQuorumZero();
        uint256 packed = s.quorumHistory.upperLookup(uint96(referenceBlock));
        uint256 quorumNum = packed >> 80;
        // forge-lint: disable-next-line(unsafe-typecast)
        uint256 quorumDen = uint80(packed); // low 80 bits by construction
        if (signedWeight * quorumDen < quorumNum * totalWeight) {
            revert InsufficientQuorum(signedWeight, thresholdStake, totalWeight);
        }
    }

    // =========================================================================
    // Internal — State updates
    // =========================================================================

    function _updateStakeThreshold(uint256 thresholdWeight) internal {
        if (thresholdWeight == 0 || thresholdWeight > type(uint160).max) revert InvalidThresholdWeight();
        OperatorServiceRegistryStorage.layout().thresholdWeightHistory
            .push(uint96(block.number), uint160(thresholdWeight));
        emit StakeThresholdUpdated(thresholdWeight);
    }

    function _updateQuorum(uint256 quorumNumerator, uint256 quorumDenominator) internal {
        if (quorumDenominator > type(uint80).max || quorumDenominator == 0 || quorumNumerator > quorumDenominator) {
            revert InvalidQuorumParameters();
        }

        // One checkpoint per update: numerator in the high 80 bits, denominator in the low 80.
        // Both are at most 80 bits (numerator <= denominator), so the pack fits uint160.
        // forge-lint: disable-next-line(unsafe-typecast)
        uint160 packed = uint160((quorumNumerator << 80) | quorumDenominator);
        OperatorServiceRegistryStorage.layout().quorumHistory.push(uint96(block.number), packed);
        emit QuorumThresholdUpdated(quorumNumerator, quorumDenominator);
    }

    // =========================================================================
    // UUPS
    // =========================================================================

    /// @dev Only DEFAULT_ADMIN_ROLE can authorize upgrades.
    function _authorizeUpgrade(address) internal override onlyRole(DEFAULT_ADMIN_ROLE) {}
}
