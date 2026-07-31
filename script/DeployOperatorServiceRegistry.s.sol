// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import {Script, console} from "forge-std/Script.sol";
import {ERC1967Proxy} from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";
import {OperatorServiceRegistry} from "src/extensions/services/service-registry/OperatorServiceRegistry.sol";

/// @title DeployOperatorServiceRegistry
/// @notice Forge deploy script for OperatorServiceRegistry (UUPS proxy pattern).
/// @dev Required environment variables:
///      OPERATOR_REGISTRY_ADDRESS   — address of the already-deployed OperatorRegistry proxy
///      VOTING_POWER_SOURCE_ADDRESS — IVotingPowerSource (typically a TokenWeighting mesh node)
///      ADMIN_ADDRESS               — address to receive DEFAULT_ADMIN_ROLE
///      THRESHOLD_WEIGHT            — minimum absolute voting power required from signers
///
///      Optional environment variables:
///      QUORUM_NUMERATOR            — quorum fraction numerator (default: 2)
///      QUORUM_DENOMINATOR          — quorum fraction denominator (default: 3)
contract DeployOperatorServiceRegistry is Script {
    function run() external {
        address operatorRegistry = vm.envAddress("OPERATOR_REGISTRY_ADDRESS");
        address votingPowerSource = vm.envAddress("VOTING_POWER_SOURCE_ADDRESS");
        address admin = vm.envAddress("ADMIN_ADDRESS");
        uint256 thresholdWeight = vm.envUint("THRESHOLD_WEIGHT");
        uint256 quorumNumerator = vm.envOr("QUORUM_NUMERATOR", uint256(2));
        uint256 quorumDenominator = vm.envOr("QUORUM_DENOMINATOR", uint256(3));

        vm.startBroadcast();

        OperatorServiceRegistry impl = new OperatorServiceRegistry();
        console.log("OperatorServiceRegistry implementation:", address(impl));

        bytes memory initData = abi.encodeCall(
            OperatorServiceRegistry.initialize,
            (operatorRegistry, votingPowerSource, admin, thresholdWeight, quorumNumerator, quorumDenominator)
        );
        ERC1967Proxy proxy = new ERC1967Proxy(address(impl), initData);
        console.log("OperatorServiceRegistry proxy:", address(proxy));

        vm.stopBroadcast();
    }
}
