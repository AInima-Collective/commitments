// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import {Script, console} from "forge-std/Script.sol";
import {ERC1967Proxy} from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";

import {CommitmentManager} from "src/core/manager/CommitmentManager.sol";
import {ERC20StaticAdapter} from "src/backing/ERC20StaticAdapter.sol";
import {ERC4626Adapter} from "src/backing/ERC4626Adapter.sol";
import {IndexAppreciationYield} from "src/distributions/IndexAppreciationYield.sol";
import {FlatFeeAtCreate} from "src/distributions/FlatFeeAtCreate.sol";
import {OperatorRegistry} from "src/extensions/services/operator-registry/OperatorRegistry.sol";
import {ManualArbiter} from "src/periphery/arbiters/ManualArbiter.sol";
import {FanInNode} from "src/extensions/mesh/FanInNode.sol";
import {FanOutNode} from "src/extensions/mesh/FanOutNode.sol";
import {TokenWeighting} from "src/extensions/mesh/TokenWeighting.sol";
import {MeshFactory} from "src/extensions/mesh/MeshFactory.sol";
import {OperatorServiceRegistry} from "src/extensions/services/service-registry/OperatorServiceRegistry.sol";

/// @title DeployCore
/// @notice The protocol core both deploy scripts share: `Simulate` (the anvil seed) and
///         `DeploySepolia`. The wiring order lives here once so the two cannot drift.
/// @dev `admin` must be the account making the calls (the broadcaster): the stake weight
///      and the mesh wiring below are admin-only calls.
abstract contract DeployCore is Script {
    struct CoreConfig {
        address admin;
        address arbiterOwner;
        /// @dev The registry's required token; its denom is the stake axis in the mesh.
        address stakeToken;
        uint64 unbondingPeriod;
        uint256 minOperatorStake;
        uint256 maxOperators;
        bytes32 weightingSalt;
        /// @dev TokenWeighting weight (BPS-scaled) for the stake denom.
        uint256 stakeWeight;
        uint256 serviceThreshold;
        uint256 quorumNumerator;
        uint256 quorumDenominator;
    }

    CommitmentManager manager;
    ERC20StaticAdapter erc20Adapter;
    ERC4626Adapter erc4626Adapter;
    IndexAppreciationYield indexYield;
    FlatFeeAtCreate flatFee;
    ManualArbiter manualArbiter;
    OperatorRegistry operatorRegistry;
    MeshFactory meshFactory;
    address tokenWeightingNode;
    OperatorServiceRegistry stakeRegistry;

    function _deployCore(CoreConfig memory c) internal {
        // Manager: impl (forge deploys and links its libraries) behind a UUPS proxy.
        CommitmentManager cmImpl = new CommitmentManager();
        manager = CommitmentManager(
            address(
                new ERC1967Proxy(
                    address(cmImpl), abi.encodeCall(CommitmentManager.initialize, (c.admin, c.unbondingPeriod, 14 days))
                )
            )
        );
        console.log("CommitmentManager:      ", address(manager));

        // Stateless backing adapters, then the manager-scoped distribution strategies.
        erc20Adapter = new ERC20StaticAdapter();
        erc4626Adapter = new ERC4626Adapter();
        indexYield = new IndexAppreciationYield(address(manager));
        flatFee = new FlatFeeAtCreate(address(manager));
        console.log("ERC20StaticAdapter:     ", address(erc20Adapter));
        console.log("ERC4626Adapter:         ", address(erc4626Adapter));
        console.log("IndexAppreciationYield: ", address(indexYield));
        console.log("FlatFeeAtCreate:        ", address(flatFee));

        // The registry's required arbiter must be a contract, not an EOA.
        manualArbiter = new ManualArbiter(c.arbiterOwner, address(manager));
        console.log("ManualArbiter:          ", address(manualArbiter));

        // Operator registry: commitments it accepts name the manual arbiter, are fully
        // forfeitable, are backed by the stake token, and bind no strategies.
        OperatorRegistry orImpl = new OperatorRegistry();
        operatorRegistry = OperatorRegistry(
            address(
                new ERC1967Proxy(
                    address(orImpl),
                    abi.encodeCall(
                        OperatorRegistry.initialize,
                        (
                            address(manager),
                            c.minOperatorStake,
                            c.maxOperators,
                            c.admin,
                            address(manualArbiter),
                            uint16(10_000),
                            c.stakeToken
                        )
                    )
                )
            )
        );
        manager.setOperatorRegistry(address(operatorRegistry));
        console.log("OperatorRegistry:       ", address(operatorRegistry));

        // Mesh: the registry is the TokenWeighting node's provider, so register, delegate,
        // release, forfeit and deregister credit and debit stake through it. The admin
        // weights the stake denom, then the registry is wired to the node once.
        FanInNode fanInImpl = new FanInNode();
        FanOutNode fanOutImpl = new FanOutNode();
        TokenWeighting twImpl = new TokenWeighting();
        meshFactory = new MeshFactory(address(fanInImpl), address(fanOutImpl), address(twImpl));
        tokenWeightingNode = meshFactory.deployTokenWeightingAt(c.weightingSalt, address(operatorRegistry), c.admin);
        TokenWeighting(tokenWeightingNode).updateWeight(operatorRegistry.stakeDenom(), c.stakeWeight);
        operatorRegistry.setMeshWiring(tokenWeightingNode, address(meshFactory));
        console.log("MeshFactory:            ", address(meshFactory));
        console.log("TokenWeighting:         ", tokenWeightingNode);

        // Service registry: reads voting power from the same node.
        OperatorServiceRegistry srImpl = new OperatorServiceRegistry();
        stakeRegistry = OperatorServiceRegistry(
            address(
                new ERC1967Proxy(
                    address(srImpl),
                    abi.encodeCall(
                        OperatorServiceRegistry.initialize,
                        (
                            address(operatorRegistry),
                            tokenWeightingNode,
                            c.admin,
                            c.serviceThreshold,
                            c.quorumNumerator,
                            c.quorumDenominator
                        )
                    )
                )
            )
        );
        console.log("OperatorServiceRegistry:", address(stakeRegistry));
    }
}
