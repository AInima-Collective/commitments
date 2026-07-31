// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import {IMerkleSnapshot} from "src/extensions/rewards/interfaces/IMerkleSnapshot.sol";

/// @title MerkleSnapshotStorage
/// @notice namespaced storage layout for `MerkleSnapshot`.
/// @dev All state lives at `STORAGE_SLOT` to avoid proxy collisions.
///         Field offsets are locked by `test/StorageSlots.t.sol` via vm.load
///         probes; existing fields MUST NOT be reordered or re-typed in any
///         future revision (append new fields at the tail).
///         Field ownership rationale:
///         - `service` is immutable post-init. Authorizes `disableRoot`,
///           `setActivationDelay`, the staged-updater swap surface, and UUPS
///           upgrades.
///         - The §0.6 staged-updater state (`updater` / `pendingUpdater` /
///           `pendingUpdaterEffectiveAt`) lives HERE — it was relocated from the
///           coordinator to break the snapshot↔coordinator circular deploy
///           dependency. `submitRoot` reads `updater` directly; the coordinator
///           no longer participates in updater auth.
///         - `updater` is the active trusted updater. Mutated only via the
///           staged-swap surface (`stageUpdater` → `activateUpdater`). Strict
///           flip — staged-but-not-activated values are NOT live.
///         - `activationDelay` is service-mutable (immediate effect, A.4).
///         - `minActivationDelay` is immutable post-init.
library MerkleSnapshotStorage {
    /// @dev keccak256(abi.encode(uint256(keccak256("commitments.rewards.merkle.snapshot.storage")) - 1)) & ~bytes32(uint256(0xff))
    bytes32 internal constant STORAGE_SLOT = 0x9d93463a8119d0220249105b7ca1878fc6a6932144859c94ada42ae315c4e500;

    struct Layout {
        // ---------------------------------------------------------------------
        // Identity (immutable post-init)
        // ---------------------------------------------------------------------

        /// @dev Service controller. Authorizes `disableRoot`, `setActivationDelay`,
        ///      the staged-updater swap, and UUPS upgrades.
        address service;

        // ---------------------------------------------------------------------
        // Updater state (§0.6 staged-swap surface — moved here from the
        // coordinator to break the circular dependency)
        // ---------------------------------------------------------------------

        /// @dev Active updater. The only address authorized to call `submitRoot`.
        ///      Mutated only by `activateUpdater()`.
        address updater;

        /// @dev Staged updater. Set by `stageUpdater`; promoted to `updater` by
        ///      `activateUpdater()` once `block.timestamp >= pendingUpdaterEffectiveAt`.
        address pendingUpdater;

        /// @dev Earliest `block.timestamp` at which `pendingUpdater` may be
        ///      promoted. Computed at `stageUpdater` time as
        ///      `block.timestamp + activationDelay`.
        uint64 pendingUpdaterEffectiveAt;

        // ---------------------------------------------------------------------
        // Activation timing
        // ---------------------------------------------------------------------

        /// @dev Live activation delay. `submitRoot` writes
        ///      `activeAt = block.timestamp + activationDelay` per A.3.
        uint64 activationDelay;

        /// @dev Lower bound on `activationDelay`. Constructor-passed; immutable
        ///      post-init. Default at deployment is `MIN_CHALLENGE_WINDOW`
        ///      (1 day) to mirror `ERC-COMMITMENTS` D3.
        uint64 minActivationDelay;

        // ---------------------------------------------------------------------
        // Root storage
        // ---------------------------------------------------------------------

        /// @dev rootId → metadata. `rootId == merkleRoot` per A.2.
        mapping(bytes32 => IMerkleSnapshot.RewardsRoot) roots;

        /// @dev Submission-order list of every rootId ever installed. Backs the
        ///      `rootAt(index)`/`rootCount()` enumeration; all roots are kept —
        ///      there is no prune path.
        bytes32[] rootHistory;
    }

    /// @notice Returns a storage reference to the Layout struct at STORAGE_SLOT.
    function layout() internal pure returns (Layout storage s) {
        bytes32 slot = STORAGE_SLOT;
        assembly {
            s.slot := slot
        }
    }
}
