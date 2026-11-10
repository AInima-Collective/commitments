// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

/// @title MembershipBase
/// @notice The shared public vocabulary for an enumerable set of member addresses:
///         `isEntity` / `totalEntities` / `entity(i)` plus a `checkEntity` modifier.
/// @dev Storage-agnostic on purpose. `OperatorRegistry` implements it over its slot-locked
///      `operatorList`/`operatorListIndex` fields (raw-index convention).
abstract contract MembershipBase {
    /// @notice Thrown when an address expected to be a registered entity is not.
    error NotAnEntity(address account);

    /// @dev Reverts unless `account` is a registered entity.
    modifier checkEntity(address account) {
        if (!isEntity(account)) revert NotAnEntity(account);
        _;
    }

    /// @notice Whether `account` is a registered entity.
    function isEntity(address account) public view virtual returns (bool);

    /// @notice The number of registered entities.
    function totalEntities() public view virtual returns (uint256);

    /// @notice The entity at index `index` (order not stable across removals).
    function entity(uint256 index) public view virtual returns (address);
}
