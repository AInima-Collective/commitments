// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

/// @title CommitmentsRewardsCoordinatorStorage
/// @notice namespaced storage layout for `CommitmentsRewardsCoordinator`.
/// @dev All state lives at `STORAGE_SLOT` to avoid proxy collisions.
///         Field offsets are locked by `test/StorageSlots.t.sol` via vm.load
///         probes; existing fields MUST NOT be reordered or re-typed in any
///         future revision (append new fields at the tail).
///         Field ownership rationale:
///         - `service` is immutable post-init. Cached for cheaper auth on
///           `onlyService` paths and for UUPS upgrade authorization.
///         - `snapshot` is immutable post-init.
///         - `frozen` is the emergency pause flag. When set, `processClaim`
///           reverts — the on-chain recourse against a fraudulent ACTIVE root
///           that can no longer be `disableRoot`'d. Toggled by `freeze` /
///           `unfreeze` (service-gated).
///         - `claimed` is the cumulative-claim ledger. monotonicity
///           enforced on every `processClaim` call.
///       NOTE: the staged-updater state and the vestigial Part D
///       (IDistributionStrategy) bridge that previously lived here have been
///       removed — the updater swap surface now lives on `MerkleSnapshot`, and
///       the no-op strategy hooks were dropped.
library CommitmentsRewardsCoordinatorStorage {
    /// @dev keccak256(abi.encode(uint256(keccak256("commitments.rewards.coordinator.storage")) - 1)) & ~bytes32(uint256(0xff))
    bytes32 internal constant STORAGE_SLOT = 0x5242068a241b2b0b62d1b51550f8c0309f6e655dbd4ec703660e2baf24d25a00;

    struct Layout {
        // ---------------------------------------------------------------------
        // Identity (immutable post-init)
        // ---------------------------------------------------------------------

        /// @dev Service controller. Mirrors `snapshot.service()`. Cached at
        ///      init for cheaper auth on `onlyService` paths and for UUPS
        ///      upgrade authorization.
        address service;

        /// @dev Bound merkle-snapshot. immutable post-init.
        address snapshot;

        /// @dev Emergency freeze flag. Packs with `snapshot` in the same slot.
        ///      When true, `processClaim` reverts `ClaimsFrozen`.
        bool frozen;

        // ---------------------------------------------------------------------
        // Claim ledger
        // ---------------------------------------------------------------------

        /// @dev earner → token → cumulative paid out. : monotonically
        ///      non-decreasing; bounded above by the most recent active root's
        ///      leaf for `(earner, token)`.
        mapping(address => mapping(address => uint256)) claimed;
    }

    /// @notice Returns a storage reference to the Layout struct at STORAGE_SLOT.
    function layout() internal pure returns (Layout storage s) {
        bytes32 slot = STORAGE_SLOT;
        assembly {
            s.slot := slot
        }
    }
}
