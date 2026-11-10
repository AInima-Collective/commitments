// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import {ERC1967Proxy} from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";

import {MerkleSnapshot} from "src/extensions/rewards/MerkleSnapshot.sol";
import {CommitmentsRewardsCoordinator} from "src/extensions/rewards/CommitmentsRewardsCoordinator.sol";

/// @title RewardsCoordinatorFactory
/// @notice Per-service deployment of the (`MerkleSnapshot`,
///         `CommitmentsRewardsCoordinator`) pair. Each call yields fresh
///         proxies wired to immutable shared implementations.
/// @dev The snapshot↔coordinator circular dependency was removed: the snapshot
///         now owns the updater-auth surface and never references the
///         coordinator, while the coordinator references only the snapshot. The
///         pair is therefore deployed in a simple sequential order — snapshot
///         first, then coordinator — with plain `ERC1967Proxy` instances. No
///         CREATE2 address prediction and no custom uninitialized-proxy are
///         needed anymore.
/// @dev per-service factory-spawned. Mirrors `VaultFactory` and `MeshFactory`
///         patterns elsewhere in the protocol.
contract RewardsCoordinatorFactory {
    event CoordinatorDeployed(
        address indexed service,
        address indexed coordinator,
        address indexed snapshot,
        address updater,
        uint64 activationDelay
    );

    error ZeroAddress();

    /// @notice The shared coordinator implementation. New services proxy to it.
    address public immutable coordinatorImplementation;

    /// @notice The shared snapshot implementation. New services proxy to it.
    address public immutable snapshotImplementation;

    /// @notice Activation-delay floor enforced at deployment.
    uint64 public immutable minActivationDelay;

    constructor(address coordImpl_, address snapImpl_, uint64 minActivationDelay_) {
        if (coordImpl_ == address(0) || snapImpl_ == address(0)) revert ZeroAddress();
        coordinatorImplementation = coordImpl_;
        snapshotImplementation = snapImpl_;
        minActivationDelay = minActivationDelay_;
    }

    /// @notice Deploy a fresh (snapshot, coordinator) pair for `service`. The
    ///         caller is recorded as the funder of the deploy txns; neither
    ///         needs to be the eventual `service`. Initial `updater` is set on
    ///         the snapshot at deployment.
    /// @param service The address that will control disable, upgrades, and the
    ///                 staged updater swap surface (on the snapshot).
    /// @param updater The initial trusted updater for `submitRoot` calls. May
    ///                 be a contract (Safe, governor, service adapter) or EOA.
    /// @param activationDelay The per-service delay. Must satisfy
    ///                 `activationDelay >= minActivationDelay()`.
    /// @return coordinator The freshly deployed coordinator proxy.
    /// @return snapshot The freshly deployed snapshot proxy.
    function deployCoordinator(address service, address updater, uint64 activationDelay)
        external
        returns (address coordinator, address snapshot)
    {
        // Deploy snapshot first — it is self-contained for updater auth, so no
        // coordinator address is needed at init. Its `initialize` rejects a zero
        // service or updater and a delay below the floor.
        snapshot = address(
            new ERC1967Proxy(
                snapshotImplementation,
                abi.encodeCall(MerkleSnapshot.initialize, (service, activationDelay, minActivationDelay, updater))
            )
        );

        // Deploy coordinator bound to the freshly deployed snapshot.
        coordinator = address(
            new ERC1967Proxy(
                coordinatorImplementation, abi.encodeCall(CommitmentsRewardsCoordinator.initialize, (service, snapshot))
            )
        );

        emit CoordinatorDeployed(service, coordinator, snapshot, updater, activationDelay);
    }
}
