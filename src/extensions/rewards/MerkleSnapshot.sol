// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import {UUPSUpgradeable} from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import {Initializable} from "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import {ReentrancyGuardTransient} from "@openzeppelin/contracts/utils/ReentrancyGuardTransient.sol";

import {IMerkleSnapshot} from "src/extensions/rewards/interfaces/IMerkleSnapshot.sol";
import {MerkleSnapshotStorage} from "src/extensions/rewards/storage/MerkleSnapshotStorage.sol";

/// @title MerkleSnapshot
/// @notice Reusable on-chain root storage for cumulative-merkle distribution.
///         The "dumb storage" half of the snapshot/coordinator separation, now
///         self-contained for updater auth.
/// @dev Locked behaviors:
///         - submitRoot: gated by the active `updater` (read directly from this
///           contract's own storage — no external call into the coordinator).
///         - disableRoot: service-only; reverts after `activeAt`.
///         - setActivationDelay: service-only; immediate effect.
///         - stageUpdater / activateUpdater / cancelStagedUpdater: §0.6
///           staged-swap with strict-flip semantics. Relocated here from the
///           coordinator to break the snapshot↔coordinator circular dependency.
///         - minActivationDelay: immutable post-init.
///         - UUPS upgrades: authorized by `service`.
contract MerkleSnapshot is Initializable, UUPSUpgradeable, ReentrancyGuardTransient, IMerkleSnapshot {
    using MerkleSnapshotStorage for MerkleSnapshotStorage.Layout;

    /// @dev Disable initializers on the implementation contract (proxy pattern).
    constructor() {
        _disableInitializers();
    }

    // -------------------------------------------------------------------------
    // Initializer
    // -------------------------------------------------------------------------

    /// @notice Initialize the snapshot proxy. Called once by the factory.
    /// @param service_ Service controller (`disableRoot`, `setActivationDelay`,
    ///                 the staged-updater swap, upgrades).
    /// @param activationDelay_ Initial per-service activation delay.
    /// @param minActivationDelay_ Floor on `activationDelay`. Immutable post-init.
    /// @param updater_ Initial trusted updater for `submitRoot`.
    function initialize(address service_, uint64 activationDelay_, uint64 minActivationDelay_, address updater_)
        external
        initializer
    {
        if (service_ == address(0)) revert ZeroAddress();
        if (updater_ == address(0)) revert ZeroAddress();
        if (activationDelay_ < minActivationDelay_) revert ActivationDelayBelowFloor();

        MerkleSnapshotStorage.Layout storage $ = MerkleSnapshotStorage.layout();
        $.service = service_;
        $.updater = updater_;
        $.activationDelay = activationDelay_;
        $.minActivationDelay = minActivationDelay_;
    }

    // -------------------------------------------------------------------------
    // Auth modifiers
    // -------------------------------------------------------------------------

    modifier onlyService() {
        if (msg.sender != MerkleSnapshotStorage.layout().service) revert NotService();
        _;
    }

    modifier onlyUpdater() {
        if (msg.sender != MerkleSnapshotStorage.layout().updater) revert NotUpdater();
        _;
    }

    // -------------------------------------------------------------------------
    // State-mutating
    // -------------------------------------------------------------------------

    /// @inheritdoc IMerkleSnapshot
    function submitRoot(bytes32 merkleRoot) external onlyUpdater nonReentrant returns (bytes32 rootId) {
        if (merkleRoot == bytes32(0)) revert ZeroRoot();

        MerkleSnapshotStorage.Layout storage $ = MerkleSnapshotStorage.layout();
        if ($.roots[merkleRoot].submittedAt != 0) revert RootAlreadySubmitted();

        uint64 submittedAt = uint64(block.timestamp);
        uint64 activeAt = submittedAt + $.activationDelay;

        $.roots[merkleRoot] = RewardsRoot({submittedAt: submittedAt, activeAt: activeAt, disabled: false});

        emit RootSubmitted(merkleRoot, submittedAt, activeAt);
        return merkleRoot;
    }

    /// @inheritdoc IMerkleSnapshot
    function disableRoot(bytes32 rootId) external onlyService nonReentrant {
        MerkleSnapshotStorage.Layout storage $ = MerkleSnapshotStorage.layout();
        RewardsRoot storage r = $.roots[rootId];

        if (r.submittedAt == 0) revert RootNotFound();
        if (r.disabled) revert RootAlreadyDisabled();
        if (block.timestamp >= r.activeAt) revert RootAlreadyActive();

        r.disabled = true;
        emit RootDisabled(rootId);
    }

    /// @inheritdoc IMerkleSnapshot
    function setActivationDelay(uint64 newDelay) external onlyService {
        MerkleSnapshotStorage.Layout storage $ = MerkleSnapshotStorage.layout();
        if (newDelay < $.minActivationDelay) revert ActivationDelayBelowFloor();

        uint64 old = $.activationDelay;
        $.activationDelay = newDelay;
        emit ActivationDelayUpdated(old, newDelay);
    }

    // -------------------------------------------------------------------------
    // §0.6 staged updater swap
    // -------------------------------------------------------------------------

    /// @inheritdoc IMerkleSnapshot
    function stageUpdater(address newUpdater) external onlyService nonReentrant {
        if (newUpdater == address(0)) revert ZeroAddress();
        MerkleSnapshotStorage.Layout storage $ = MerkleSnapshotStorage.layout();
        if ($.pendingUpdaterEffectiveAt != 0) revert StagedUpdaterAlreadyExists();

        uint64 effectiveAt = uint64(block.timestamp) + $.activationDelay;
        $.pendingUpdater = newUpdater;
        $.pendingUpdaterEffectiveAt = effectiveAt;
        emit UpdaterPending(newUpdater, effectiveAt);
    }

    /// @inheritdoc IMerkleSnapshot
    function activateUpdater() external nonReentrant {
        MerkleSnapshotStorage.Layout storage $ = MerkleSnapshotStorage.layout();
        if ($.pendingUpdaterEffectiveAt == 0) revert NoStagedUpdater();
        if (block.timestamp < $.pendingUpdaterEffectiveAt) revert StagedUpdaterNotReady();

        address old = $.updater;
        address fresh = $.pendingUpdater;
        $.updater = fresh;
        $.pendingUpdater = address(0);
        $.pendingUpdaterEffectiveAt = 0;
        emit UpdaterActivated(old, fresh);
    }

    /// @inheritdoc IMerkleSnapshot
    function cancelStagedUpdater() external onlyService nonReentrant {
        MerkleSnapshotStorage.Layout storage $ = MerkleSnapshotStorage.layout();
        if ($.pendingUpdaterEffectiveAt == 0) revert NoStagedUpdater();
        address staged = $.pendingUpdater;
        $.pendingUpdater = address(0);
        $.pendingUpdaterEffectiveAt = 0;
        emit UpdaterStageCancelled(staged);
    }

    // -------------------------------------------------------------------------
    // Views
    // -------------------------------------------------------------------------

    /// @inheritdoc IMerkleSnapshot
    function rootById(bytes32 rootId) external view returns (RewardsRoot memory) {
        return MerkleSnapshotStorage.layout().roots[rootId];
    }

    /// @inheritdoc IMerkleSnapshot
    function isActive(bytes32 rootId) external view returns (bool) {
        RewardsRoot storage r = MerkleSnapshotStorage.layout().roots[rootId];
        return r.submittedAt != 0 && !r.disabled && block.timestamp >= r.activeAt;
    }

    /// @inheritdoc IMerkleSnapshot
    function service() external view returns (address) {
        return MerkleSnapshotStorage.layout().service;
    }

    /// @inheritdoc IMerkleSnapshot
    function activationDelay() external view returns (uint64) {
        return MerkleSnapshotStorage.layout().activationDelay;
    }

    /// @inheritdoc IMerkleSnapshot
    function minActivationDelay() external view returns (uint64) {
        return MerkleSnapshotStorage.layout().minActivationDelay;
    }

    /// @inheritdoc IMerkleSnapshot
    function activeUpdater() external view returns (address) {
        return MerkleSnapshotStorage.layout().updater;
    }

    /// @inheritdoc IMerkleSnapshot
    function pendingUpdater() external view returns (address newUpdater, uint64 effectiveAt) {
        MerkleSnapshotStorage.Layout storage $ = MerkleSnapshotStorage.layout();
        return ($.pendingUpdater, $.pendingUpdaterEffectiveAt);
    }

    // -------------------------------------------------------------------------
    // UUPS auth
    // -------------------------------------------------------------------------

    function _authorizeUpgrade(address) internal view override onlyService {}
}
