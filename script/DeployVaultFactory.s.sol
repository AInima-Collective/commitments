// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import "forge-std/Script.sol";
import {CommitmentsVault} from "src/periphery/vaults/CommitmentsVault.sol";
import {VaultFactory} from "src/periphery/vaults/VaultFactory.sol";

/// @title DeployVaultFactory
/// @notice Foundry deployment script for CommitmentsVault implementation + VaultFactory.
///
/// Usage:
///   forge script script/DeployVaultFactory.s.sol --rpc-url $RPC_URL --broadcast
///
/// Required environment:
///   PRIVATE_KEY  — deployer private key (hex, with or without 0x prefix)
///
/// The script deploys:
///   1. CommitmentsVault implementation — logic contract, NOT initialized (serves as template only)
///   2. VaultFactory — proxy deployer, initialized with the implementation address
///
/// After deployment, call factory.deployVault(asset, admin, strategy)
/// to deploy a per-asset vault proxy.
contract DeployVaultFactory is Script {
    function run() external {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(deployerPrivateKey);

        console.log("Deployer:", deployer);

        vm.startBroadcast(deployerPrivateKey);

        // 1. Deploy vault implementation
        //    Constructor calls _disableInitializers() — safe, cannot be initialized directly.
        CommitmentsVault implementation = new CommitmentsVault();

        // 2. Deploy factory with implementation reference
        //    Factory deployer (msg.sender) becomes the Ownable owner.
        VaultFactory factory = new VaultFactory(address(implementation));

        vm.stopBroadcast();

        console.log("Vault implementation:", address(implementation));
        console.log("VaultFactory:", address(factory));
        console.log("Factory owner:", factory.owner());
    }
}
