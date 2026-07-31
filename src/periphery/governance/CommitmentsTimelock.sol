// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import {
    TimelockControllerUpgradeable
} from "@openzeppelin/contracts-upgradeable/governance/TimelockControllerUpgradeable.sol";

/// @title CommitmentsTimelock
/// @notice Thin subclass of OZ TimelockControllerUpgradeable. Adds a `version()`
///         view for indexer disambiguation; otherwise stock semantics.
///
///         Intentionally NOT UUPS-upgradeable. Replacing the timelock means
///         deploying a new DAO instance — a fresh Timelock + Governor pair, and
///         a `transferGovernance` call on any TokenWeighting node it controls.
///         This is by design: the timelock is the protocol's slow-path safety
///         hatch, and an in-place upgrade would defeat that role.
contract CommitmentsTimelock is TimelockControllerUpgradeable {
    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    /// @notice Identifier emitted to disambiguate timelock versions in the indexer.
    function version() external pure returns (string memory) {
        return "1";
    }
}
