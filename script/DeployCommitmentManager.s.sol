// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import {Script, console} from "forge-std/Script.sol";
import {ERC1967Proxy} from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";
import {CommitmentManager} from "src/core/manager/CommitmentManager.sol";

/// @title DeployCommitmentManager
/// @notice Forge deploy script for CommitmentManager (UUPS proxy pattern). The manager is
///         the custody root — token-agnostic, so one deployment serves every backing token.
/// @dev Required environment variables:
///      ADMIN_ADDRESS       — address to receive DEFAULT_ADMIN_ROLE / PAUSER / UNPAUSER
///
///      Optional environment variables:
///      UNBONDING_PERIOD    — committer-unbond duration in seconds (defaults to 7 days)
///
///      Optional post-deploy wiring (do manually or in a follow-up script):
///      - commitmentManager.setOperatorRegistry(operatorRegistryProxy)
///      - deploy adapters + strategies via DeployAdaptersAndStrategies.s.sol
///
///      LIBRARY LINKING:
///      `CommitmentManager` depends on five `external` delegatecall libraries
///      (LedgerOpsLib, CommitmentLifecycleLib, MovementLib, AgreementLib, and MutualLib)
///      that keep the manager under
///      the EIP-170 24,576-byte limit. Forge automatically deploys each library and links it
///      when running `new CommitmentManager()` — the placeholder bytecode `__$<hash>$__` is
///      patched at deploy time. No manual library address bookkeeping is required; the
///      libraries appear as extra named CREATE transactions in the broadcast file.
///
///      Example usage:
///        export ADMIN_ADDRESS=0x...
///        forge script script/DeployCommitmentManager.s.sol --rpc-url $RPC_URL --broadcast
contract DeployCommitmentManager is Script {
    function run() external {
        address admin = vm.envAddress("ADMIN_ADDRESS");
        uint64 unbondingPeriod = uint64(vm.envOr("UNBONDING_PERIOD", uint256(7 days)));
        // Lifetime pause budget (ERC §A.6 erratum): immutable after initialize; 0 = pauses
        // never stop any clock.
        uint64 maxPauseDuration = uint64(vm.envOr("MAX_PAUSE_DURATION", uint256(14 days)));

        vm.startBroadcast();

        // Deploy implementation. Forge handles external-library deployment and linking
        // automatically — each library is published as a separate contract and the manager's
        // placeholder bytecode is patched with its address before `new` returns.
        CommitmentManager impl = new CommitmentManager();
        console.log("CommitmentManager implementation:", address(impl));

        // Deploy proxy and initialize in one transaction
        bytes memory initData = abi.encodeCall(CommitmentManager.initialize, (admin, unbondingPeriod, maxPauseDuration));
        ERC1967Proxy proxy = new ERC1967Proxy(address(impl), initData);
        console.log("CommitmentManager proxy:", address(proxy));

        vm.stopBroadcast();
    }
}
