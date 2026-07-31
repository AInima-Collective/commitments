// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import {Script, console} from "forge-std/Script.sol";

import {FanInNode} from "src/extensions/mesh/FanInNode.sol";
import {FanOutNode} from "src/extensions/mesh/FanOutNode.sol";
import {TokenWeighting} from "src/extensions/mesh/TokenWeighting.sol";
import {MeshFactory} from "src/extensions/mesh/MeshFactory.sol";

/// @title DeployMesh
/// @notice Forge deployment script that deploys all mesh topology node implementations
///         and the MeshFactory that creates EIP-1167 clones for each node type.
///
/// Usage:
///   forge script script/DeployMesh.s.sol --rpc-url <RPC_URL> --broadcast
///
/// Environment Variables:
///   MANAGER     - Address that manages deployed nodes (optional, defaults to tx.origin)
///   GOVERNANCE  - Address that controls weights on TokenWeighting nodes (optional, defaults to tx.origin)
///
/// Output:
///   FanInNode implementation, FanOutNode implementation, TokenWeighting implementation, MeshFactory
contract DeployMesh is Script {
    function run() external {
        address manager = vm.envOr("MANAGER", tx.origin);
        address governance = vm.envOr("GOVERNANCE", tx.origin);

        vm.startBroadcast();

        // ---- Deploy implementations ----

        FanInNode fanInImpl = new FanInNode();
        console.log("FanInNode implementation:    ", address(fanInImpl));

        FanOutNode fanOutImpl = new FanOutNode();
        console.log("FanOutNode implementation:   ", address(fanOutImpl));

        TokenWeighting twImpl = new TokenWeighting();
        console.log("TokenWeighting implementation:", address(twImpl));

        // ---- Deploy factory ----

        MeshFactory factory = new MeshFactory(address(fanInImpl), address(fanOutImpl), address(twImpl));
        console.log("MeshFactory:                 ", address(factory));

        vm.stopBroadcast();

        // ---- Log summary ----

        console.log("");
        console.log("=== Mesh Topology Deployed ===");
        console.log("FanInNode impl:     ", address(fanInImpl));
        console.log("FanOutNode impl:    ", address(fanOutImpl));
        console.log("TokenWeighting impl:", address(twImpl));
        console.log("MeshFactory:        ", address(factory));
        console.log("Manager:            ", manager);
        console.log("Governance:         ", governance);
        console.log("");
        console.log("To deploy a full mesh topology, call:");
        console.log("  factory.deployTokenWeighting(fanOutAddress, governance)");
        console.log("  factory.deployFanOut(manager, manager)          // configure outflows to tokenWeighting");
        console.log("  factory.deployFanIn(fanOutAddress, manager)     // register providers");
    }

    /// @notice Deploy a complete example mesh: FanIn -> FanOut -> TokenWeighting (for testing/demo)
    /// @param manager_    Address that manages and orchestrates the mesh
    /// @param governance_ Address that governs TokenWeighting weights
    function runExampleMesh(address manager_, address governance_) external {
        vm.startBroadcast();

        // Deploy implementations
        address fanInImpl = address(new FanInNode());
        address fanOutImpl = address(new FanOutNode());
        address twImpl = address(new TokenWeighting());

        // Deploy factory
        MeshFactory factory = new MeshFactory(fanInImpl, fanOutImpl, twImpl);

        // Predict FanOut address for use as TokenWeighting provider
        bytes32 saltFanOut = keccak256("mesh.fanout.v1");
        address predictedFanOut = factory.predictFanOutAddress(saltFanOut);

        // Deploy TokenWeighting (provider = future fanOut)
        address tw = factory.deployTokenWeightingAt(keccak256("mesh.tokenweighting.v1"), predictedFanOut, governance_);

        // Deploy FanOut (provider = manager, outflows configured separately)
        address fanOut = factory.deployFanOutAt(saltFanOut, manager_, manager_);

        // Deploy FanIn (consumer = fanOut)
        address fanIn = factory.deployFanInAt(keccak256("mesh.fanin.v1"), fanOut, manager_);

        vm.stopBroadcast();

        console.log("=== Example Mesh Deployed ===");
        console.log("FanInNode:          ", fanIn);
        console.log("FanOutNode:         ", fanOut);
        console.log("TokenWeighting:     ", tw);
        console.log("MeshFactory:        ", address(factory));
    }
}
