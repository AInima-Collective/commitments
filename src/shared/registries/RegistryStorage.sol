// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import {EnumerableSet} from "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";

/// @title RegistryStorage
/// @notice EIP-7201 namespaced storage for the shared `Registry` membership base.
/// @dev Backed by OZ `EnumerableSet.AddressSet` (add/remove/contains/length/at in O(1),
///      swap-and-pop removal). Namespaced so it can be mixed into plain or proxied contracts
///      without colliding with the deriving contract's own storage.
library RegistryStorage {
    /// @dev keccak256(abi.encode(uint256(keccak256("commitments.common.registry.storage")) - 1)) & ~bytes32(uint256(0xff))
    bytes32 internal constant STORAGE_SLOT = 0x4ec9915eb63b71a8b1fb587719b09d0e10449788d55513baa92e2c058df68800;

    struct Layout {
        /// @dev The enumerable set of member entity addresses.
        EnumerableSet.AddressSet entities;
    }

    /// @notice Returns a storage reference to the Layout struct at STORAGE_SLOT.
    function layout() internal pure returns (Layout storage s) {
        bytes32 slot = STORAGE_SLOT;
        assembly {
            s.slot := slot
        }
    }
}
