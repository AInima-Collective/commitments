// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import {Script, console} from "forge-std/Script.sol";
import {MutualRegistry} from "src/extensions/mutuals/MutualRegistry.sol";
import {OptimisticMutualArbiter} from "src/extensions/mutuals/OptimisticMutualArbiter.sol";

/// @title DeployMutual
/// @notice Deploys the Mutual (Mutual, Position A) periphery on top of an
///         ALREADY-deployed CommitmentManager. It deploys the shared, mutual-agnostic pieces:
///           1. MutualRegistry(manager)        — creates/annotates mutuals; indexer binding target
///           2. OptimisticMutualArbiter(manager, bondToken, minBond, treasury, owner)
///              — a reusable bonded/optimistic mutual arbiter (the dispute model)
///         A `ClaimRouter` is per-policy (one per mutual, scoped to a claimant) and is deployed
///         at coverage-purchase time, not here.
/// @dev Required env:
///        COMMITMENT_MANAGER_ADDRESS — the CommitmentManager proxy
///        BOND_TOKEN_ADDRESS         — ERC-20 used for optimistic loss-declaration bonds
///      Optional:
///        MUTUAL_MIN_BOND         — minimum bond (default 0)
///        MUTUAL_TREASURY         — slashed-bond sink (default: broadcaster)
///        MUTUAL_ARBITER_OWNER    — dispute committee / owner (default: broadcaster)
contract DeployMutual is Script {
    function run() external returns (address registry, address arbiter) {
        address manager = vm.envAddress("COMMITMENT_MANAGER_ADDRESS");
        address bondToken = vm.envAddress("BOND_TOKEN_ADDRESS");
        uint256 minBond = vm.envOr("MUTUAL_MIN_BOND", uint256(0));

        vm.startBroadcast();
        address broadcaster = msg.sender;
        address treasury = vm.envOr("MUTUAL_TREASURY", broadcaster);
        address owner = vm.envOr("MUTUAL_ARBITER_OWNER", broadcaster);

        MutualRegistry reg = new MutualRegistry(manager);
        OptimisticMutualArbiter arb = new OptimisticMutualArbiter(manager, bondToken, minBond, treasury, owner);
        vm.stopBroadcast();

        console.log("MutualRegistry:", address(reg));
        console.log("OptimisticMutualArbiter:", address(arb));
        return (address(reg), address(arb));
    }
}
