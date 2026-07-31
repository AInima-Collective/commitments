// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import {EnumerableSet} from "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";

import {MembershipBase} from "src/shared/registries/MembershipBase.sol";
import {RegistryStorage} from "src/shared/registries/RegistryStorage.sol";

/// @title Registry
/// @notice `EnumerableSet.AddressSet`-backed implementation of the shared `MembershipBase`
///         membership vocabulary. Provides `isEntity` / `totalEntities` / `entity(i)` /
///         `entities()` and internal `_addEntity` / `_removeEntity` swap-and-pop mutators.
/// @dev The set lives in this base's own EIP-7201 namespace (`RegistryStorage`), so it can be
///      mixed into a plain or proxied contract without colliding with the deriving contract's
///      storage. Adoptable by any contract whose membership storage is NOT slot-locked
///      (e.g. `VaultFactory`).
///
///      `OperatorRegistry` deliberately does NOT inherit this base: its membership fields
///      (`operatorList` + `operatorListIndex`, a raw-index convention) are pinned at locked
///      EIP-7201 offsets by `test/StorageSlots.t.sol`, and an `EnumerableSet.AddressSet` has a
///      different internal representation. It instead overrides `MembershipBase` directly over
///      its locked storage and shares the *logic* via `AddressSetSwapLib`.
abstract contract Registry is MembershipBase {
    using EnumerableSet for EnumerableSet.AddressSet;

    /// @inheritdoc MembershipBase
    function isEntity(address account) public view override returns (bool) {
        return RegistryStorage.layout().entities.contains(account);
    }

    /// @inheritdoc MembershipBase
    function totalEntities() public view override returns (uint256) {
        return RegistryStorage.layout().entities.length();
    }

    /// @inheritdoc MembershipBase
    function entity(uint256 index) public view override returns (address) {
        return RegistryStorage.layout().entities.at(index);
    }

    /// @notice The full list of registered entities.
    function entities() public view returns (address[] memory) {
        return RegistryStorage.layout().entities.values();
    }

    /// @dev Add `account` to the membership set. Returns false if already present.
    function _addEntity(address account) internal returns (bool) {
        return RegistryStorage.layout().entities.add(account);
    }

    /// @dev Remove `account` from the membership set (swap-and-pop). Returns false if absent.
    function _removeEntity(address account) internal returns (bool) {
        return RegistryStorage.layout().entities.remove(account);
    }
}
