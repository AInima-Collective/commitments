// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

/// @title IMerkleSnapshot
/// @notice Reusable on-chain root storage for cumulative-merkle distribution. The
///         snapshot is intentionally narrow: it stores roots, gates submit on the
///         coordinator's active updater, and gates disable on the service. It is the
///         "dumb storage" half of the snapshot/coordinator separation locked in
/// .
///         The snapshot is reusable beyond rewards — the same primitive backs
///         attestations, governance, and any cumulative-merkle pattern — so the
///         interface deliberately omits all rewards-specific concepts.
/// @dev Auth split ():
///         - submitRoot: callable only by the active `updater`
///         - disableRoot: callable only by `service`
///         - setActivationDelay: callable only by `service`
///         - stageUpdater / cancelStagedUpdater: callable only by `service`
///         - activateUpdater: permissionless after `effectiveAt`
///         - upgrades (UUPS): authorized by `service`
///         - minActivationDelay: immutable post-init
/// @dev The §0.6 staged-updater swap surface (`stageUpdater` /
///         `activateUpdater` / `cancelStagedUpdater` / `activeUpdater` /
///         `pendingUpdater`) lives on the snapshot. It was relocated here from
///         the coordinator so the snapshot owns its own `submitRoot` auth and
///         the snapshot↔coordinator deploy-time circular dependency is broken.
interface IMerkleSnapshot {
    /// @notice Per-root metadata. `merkleRoot` doubles as the rootId.
    struct RewardsRoot {
        bytes32 merkleRoot;
        uint64 submittedAt;
        uint64 activeAt;
        bool disabled;
    }

    // -------------------------------------------------------------------------
    // Events
    // -------------------------------------------------------------------------

    event RootSubmitted(bytes32 indexed rootId, uint64 submittedAt, uint64 activeAt);
    event RootDisabled(bytes32 indexed rootId);
    event ActivationDelayUpdated(uint64 oldDelay, uint64 newDelay);

    event UpdaterPending(address indexed newUpdater, uint64 effectiveAt);
    event UpdaterActivated(address indexed oldUpdater, address indexed newUpdater);
    event UpdaterStageCancelled(address indexed stagedUpdater);

    // -------------------------------------------------------------------------
    // Errors
    // -------------------------------------------------------------------------

    error NotUpdater();
    error NotService();
    error RootAlreadySubmitted();
    error RootNotFound();
    error RootAlreadyDisabled();
    error RootAlreadyActive();
    error ZeroRoot();
    error ZeroAddress();
    error ActivationDelayBelowFloor();
    error AlreadyInitialized();
    error NoStagedUpdater();
    error StagedUpdaterNotReady();
    error StagedUpdaterAlreadyExists();

    // -------------------------------------------------------------------------
    // State-mutating
    // -------------------------------------------------------------------------

    /// @notice Submit a new merkle root. Caller must equal the active `updater`.
    /// @param merkleRoot The new cumulative root to install. Must be non-zero and unseen.
    /// @return rootId Identical to `merkleRoot` (content-hash identity).
    function submitRoot(bytes32 merkleRoot) external returns (bytes32 rootId);

    /// @notice Disable a root before it activates. Service-only. Reverts after `activeAt`.
    /// @dev the activation delay window is the disable window. Optimistic
    ///         challenges are out of scope.
    function disableRoot(bytes32 rootId) external;

    /// @notice Update the per-service activation delay. Service-only. Affects future
    ///         roots only (existing in-flight roots retain their submitted-time
    ///         `activeAt`). Reverts if `newDelay < minActivationDelay`.
    /// @dev Per immediate-effect parameter. The §0.6 activation-delay
    ///         pattern protects parameters that affect *existing* positions; this
    ///         parameter only affects *future* roots, so synchronous mutation is
    ///         appropriate.
    function setActivationDelay(uint64 newDelay) external;

    // -------------------------------------------------------------------------
    // §0.6 staged updater swap (relocated from the coordinator)
    // -------------------------------------------------------------------------

    /// @notice Stage a new updater. Service-only. Reverts if a stage already
    ///         exists (use `cancelStagedUpdater` first). `effectiveAt` is
    ///         `block.timestamp + activationDelay`.
    function stageUpdater(address newUpdater) external;

    /// @notice Promote the staged updater to active. Permissionless after
    ///         `effectiveAt`. Reverts `NoStagedUpdater` if no stage,
    ///         `StagedUpdaterNotReady` if `block.timestamp < effectiveAt`. Once
    ///         activated, the new updater is the only address authorized to
    ///         submit roots — strict-flip semantics, no elapsed-but-not-activated
    ///         grace.
    function activateUpdater() external;

    /// @notice Cancel a pending stage. Service-only.
    function cancelStagedUpdater() external;

    // -------------------------------------------------------------------------
    // Views
    // -------------------------------------------------------------------------

    /// @notice Root metadata by content hash.
    function rootById(bytes32 rootId) external view returns (RewardsRoot memory);

    /// @notice Total number of roots ever submitted (active or otherwise).
    function rootCount() external view returns (uint256);

    /// @notice Submission-order rootId at index. O(1).
    function rootAt(uint256 index) external view returns (bytes32);

    /// @notice True if the root exists, is not disabled, and `block.timestamp >= activeAt`.
    function isActive(bytes32 rootId) external view returns (bool);

    /// @notice Service controller (set immutably at init).
    function service() external view returns (address);

    /// @notice Live activation delay in seconds.
    function activationDelay() external view returns (uint64);

    /// @notice Activation-delay floor. Constructor-passed; immutable post-init.
    function minActivationDelay() external view returns (uint64);

    /// @notice Currently authorized updater. The only address allowed to call
    ///         `submitRoot`.
    /// @dev Deliberately strict: this returns the *activated*
    ///         updater only. A staged-but-not-yet-activated swap does not flip
    ///         this view, even after `effectiveAt`.
    function activeUpdater() external view returns (address);

    /// @notice The staged (but not yet activated) updater, if any.
    function pendingUpdater() external view returns (address newUpdater, uint64 effectiveAt);

    /// @notice Alias of `activeUpdater()`. Retained for source compatibility.
    function updater() external view returns (address);
}
