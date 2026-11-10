// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import {Script, console} from "forge-std/Script.sol";

import {CommitmentsGovernor} from "src/periphery/governance/CommitmentsGovernor.sol";
import {CommitmentsTimelock} from "src/periphery/governance/CommitmentsTimelock.sol";
import {GovernorFactory} from "src/periphery/governance/GovernorFactory.sol";

/// @title DeployGovernance
/// @notice Deploys the Commitments governance impls + factory. Reference DAO
///         instance(s) are then deployed via `factory.deploy(cfg)` from a
///         downstream script (e.g. Simulate.s.sol or a per-environment seeder).
///
/// Usage:
///   forge script script/DeployGovernance.s.sol --rpc-url <RPC_URL> --broadcast
///
/// Output (also written into broadcast/ for indexer + frontend env wiring):
///   CommitmentsGovernor implementation
///   CommitmentsTimelock implementation
///   GovernorFactory
contract DeployGovernance is Script {
    function run() external {
        vm.startBroadcast();

        CommitmentsGovernor governorImpl = new CommitmentsGovernor();
        console.log("CommitmentsGovernor impl:", address(governorImpl));

        CommitmentsTimelock timelockImpl = new CommitmentsTimelock();
        console.log("CommitmentsTimelock impl:", address(timelockImpl));

        GovernorFactory factory = new GovernorFactory(address(governorImpl), address(timelockImpl));
        console.log("GovernorFactory:         ", address(factory));

        vm.stopBroadcast();

        console.log("");
        console.log("=== Governance Deployed ===");
        console.log("Governor impl:    ", address(governorImpl));
        console.log("Timelock impl:    ", address(timelockImpl));
        console.log("GovernorFactory:  ", address(factory));
        console.log("");
        console.log("To deploy a reference DAO bound to a TokenWeighting source:");
        console.log("  factory.deploy(DAOConfig{ name, source, timelockMinDelay, votingDelay,");
        console.log("                          votingPeriod, proposalThreshold, quorumNumerator,");
        console.log("                          lateQuorumExtension })");
        console.log("Then call source.transferGovernance(timelock) so the DAO can update weights.");
        console.log("Only this broadcaster (the factory's deployer) may call factory.setCanonicalGovernor.");
    }
}
