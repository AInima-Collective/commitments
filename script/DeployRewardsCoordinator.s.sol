// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import "forge-std/Script.sol";

import {MerkleSnapshot} from "src/extensions/rewards/MerkleSnapshot.sol";
import {CommitmentsRewardsCoordinator} from "src/extensions/rewards/CommitmentsRewardsCoordinator.sol";
import {RewardsCoordinatorFactory} from "src/extensions/rewards/RewardsCoordinatorFactory.sol";

/// @title DeployRewardsCoordinator
/// @notice Foundry deployment script for the rewards coordinator
///         implementation contracts + factory. Mirrors `DeployVaultFactory.s.sol`.
///
/// Usage:
///   forge script script/DeployRewardsCoordinator.s.sol --rpc-url $RPC_URL --broadcast
///
/// Required environment:
///   PRIVATE_KEY              — deployer private key (hex)
///   MIN_ACTIVATION_DELAY     — optional; defaults to 86400 (1 day, ERC's MIN_CHALLENGE_WINDOW)
///
/// After deployment, services call:
///   factory.deployCoordinator(service, updater, activationDelay)
/// to spawn a (snapshot, coordinator) pair.
///
/// The implementations are immutable. Deploy fresh implementations + a fresh
/// factory if you need to bump bytecode.
contract DeployRewardsCoordinator is Script {
    function run() external {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        uint64 minActivationDelay = uint64(vm.envOr("MIN_ACTIVATION_DELAY", uint256(86400)));
        address deployer = vm.addr(deployerPrivateKey);

        console.log("Deployer:", deployer);
        console.log("Min activation delay:", minActivationDelay);

        vm.startBroadcast(deployerPrivateKey);

        MerkleSnapshot snapImpl = new MerkleSnapshot();
        CommitmentsRewardsCoordinator coordImpl = new CommitmentsRewardsCoordinator();
        RewardsCoordinatorFactory factory =
            new RewardsCoordinatorFactory(address(coordImpl), address(snapImpl), minActivationDelay);

        vm.stopBroadcast();

        console.log("MerkleSnapshot impl:                   ", address(snapImpl));
        console.log("CommitmentsRewardsCoordinator impl:    ", address(coordImpl));
        console.log("RewardsCoordinatorFactory:             ", address(factory));
    }
}
