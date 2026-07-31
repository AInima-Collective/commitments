// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

/// @title IEntity
/// @notice Minimal self-identification surface for a contract that a `Factory` deploys
///         (as a clone or proxy implementation).
/// @dev The `Factory` base calls `factoryTypeId()` when whitelisting an implementation and
///      checks it against the expected id. This makes whitelisting *self-verifying*: an
///      admin cannot accidentally whitelist a contract of the wrong type (a FanOut where a
///      FanIn was intended, an arbitrary contract where a vault was intended), because the
///      implementation itself asserts what it is. The value is a domain-separated constant,
///      e.g. `keccak256("commitments.vault")`.
interface IEntity {
    /// @notice A stable, unique identifier for this contract's type.
    /// @return The type id, a domain-separated keccak256 constant.
    function factoryTypeId() external pure returns (bytes32);
}
