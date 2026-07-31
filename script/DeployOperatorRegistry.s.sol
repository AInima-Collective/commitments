// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import {Script, console} from "forge-std/Script.sol";
import {ERC1967Proxy} from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";
import {OperatorRegistry} from "src/extensions/services/operator-registry/OperatorRegistry.sol";

/// @title DeployOperatorRegistry
/// @notice Forge deploy script for OperatorRegistry (UUPS proxy pattern).
/// @dev Required environment variables:
///      COMMITMENT_MANAGER_ADDRESS  — address of the already-deployed CommitmentManager proxy
///      MIN_OPERATOR_STAKE          — minimum backing-token units required to register as operator
///      ADMIN_ADDRESS               — address to receive DEFAULT_ADMIN_ROLE
///      REQUIRED_ARBITER_ADDRESS    — arbiter that every register/delegate commitment must name (phase 17).
///                                    Should point at a DEPLOYED ARBITER CONTRACT (e.g., ManualArbiter or
///                                    AttestationArbiter from src/periphery/arbiters/), not an EOA — the acceptance
///                                    policy only pays off if the arbiter's code encodes the service's
///                                    forfeiture/release rules.
///      REQUIRED_TOKEN_ADDRESS      — backing token every register/delegate commitment must carry.
///                                    Stake quantities are denominated in its raw units.
///
///      Optional environment variables:
///      MAX_DELEGATIONS_PER_OPERATOR — max delegations per operator (defaults to 1024)
///      MIN_MAX_PENALTY_BPS          — floor on commitment.maxPenaltyBps (defaults to 10000 = 100%)
///
///      Post-deploy wiring required:
///      - commitmentManager.setOperatorRegistry(proxy)
///
///      Example usage:
///        export COMMITMENT_MANAGER_ADDRESS=0x...
///        export MIN_OPERATOR_STAKE=100000000000000000000  # 100e18 units
///        export ADMIN_ADDRESS=0x...
///        export REQUIRED_TOKEN_ADDRESS=0x...
///        forge script script/DeployOperatorRegistry.s.sol --rpc-url $RPC_URL --broadcast
contract DeployOperatorRegistry is Script {
    function run() external {
        address commitmentManager = vm.envAddress("COMMITMENT_MANAGER_ADDRESS");
        uint256 minOperatorStake = vm.envUint("MIN_OPERATOR_STAKE");
        uint256 maxDelegations = vm.envOr("MAX_DELEGATIONS_PER_OPERATOR", uint256(1024));
        address admin = vm.envAddress("ADMIN_ADDRESS");
        address requiredArbiter = vm.envAddress("REQUIRED_ARBITER_ADDRESS");
        uint16 minMaxPenaltyBps = uint16(vm.envOr("MIN_MAX_PENALTY_BPS", uint256(10_000)));
        address requiredToken = vm.envAddress("REQUIRED_TOKEN_ADDRESS");

        vm.startBroadcast();

        // Deploy implementation
        OperatorRegistry impl = new OperatorRegistry();
        console.log("OperatorRegistry implementation:", address(impl));

        // Deploy proxy and initialize in one transaction
        bytes memory initData = abi.encodeCall(
            OperatorRegistry.initialize,
            (
                commitmentManager,
                minOperatorStake,
                maxDelegations,
                admin,
                requiredArbiter,
                minMaxPenaltyBps,
                requiredToken
            )
        );
        ERC1967Proxy proxy = new ERC1967Proxy(address(impl), initData);
        console.log("OperatorRegistry proxy:", address(proxy));

        vm.stopBroadcast();
    }
}
