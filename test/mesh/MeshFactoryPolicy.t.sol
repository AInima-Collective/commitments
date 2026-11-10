// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import {Test} from "forge-std/Test.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

import {MeshFactory} from "src/extensions/mesh/MeshFactory.sol";
import {FanInNode} from "src/extensions/mesh/FanInNode.sol";
import {FanOutNode} from "src/extensions/mesh/FanOutNode.sol";
import {TokenWeighting} from "src/extensions/mesh/TokenWeighting.sol";
import {Factory} from "src/shared/factories/Factory.sol";
import {IEntity} from "src/shared/interfaces/IEntity.sol";
import {FAN_IN_TYPE_ID, TOKEN_WEIGHTING_TYPE_ID} from "src/extensions/mesh/interfaces/IMeshFactory.sol";

/// @title MeshFactoryPolicyTest
/// @notice Covers the issue-#45 shared `Factory` base on MeshFactory: constructor self-verifies
///         each node implementation against its slot type id, the blacklist valve freezes a node
///         type, deploys stay permissionless, and `Multicallable` batches multiple node deploys.
contract MeshFactoryPolicyTest is Test {
    MeshFactory internal factory;
    FanInNode internal fanInImpl;
    FanOutNode internal fanOutImpl;
    TokenWeighting internal twImpl;

    address internal consumer = address(0x10);
    address internal manager = address(0x11);
    address internal governance = address(0x13);
    address internal nonOwner = makeAddr("nonOwner");
    address internal randomCaller = makeAddr("randomCaller");

    function setUp() public {
        fanInImpl = new FanInNode();
        fanOutImpl = new FanOutNode();
        twImpl = new TokenWeighting();
        factory = new MeshFactory(address(fanInImpl), address(fanOutImpl), address(twImpl));
    }

    // =========================================================================
    // Constructor self-verification
    // =========================================================================

    function test_constructor_whitelistsAllThreeImpls() public view {
        assertTrue(factory.isWhitelisted(address(fanInImpl)), "fanIn whitelisted");
        assertTrue(factory.isWhitelisted(address(fanOutImpl)), "fanOut whitelisted");
        assertTrue(factory.isWhitelisted(address(twImpl)), "tw whitelisted");
        assertEq(factory.implementationTypeId(address(fanInImpl)), fanInImpl.factoryTypeId(), "fanIn type id");
        assertEq(factory.owner(), address(this), "deployer owns impl-set controls");
    }

    function test_constructor_rejectsWrongTypeInFanInSlot() public {
        // A FanOut in the FanIn slot: the factory expects the fan_in id, the impl reports fan_out.
        vm.expectRevert(
            abi.encodeWithSelector(
                Factory.TypeIdMismatch.selector,
                address(fanOutImpl),
                keccak256("commitments.mesh.fan_in"),
                fanOutImpl.factoryTypeId()
            )
        );
        new MeshFactory(address(fanOutImpl), address(fanOutImpl), address(twImpl));
    }

    // =========================================================================
    // Blacklist valve
    // =========================================================================

    function test_blacklist_freezesNodeType() public {
        vm.expectEmit(true, false, false, false, address(factory));
        emit Factory.ImplementationBlacklisted(address(fanInImpl));
        factory.blacklist(address(fanInImpl));

        vm.expectRevert(abi.encodeWithSelector(Factory.Blacklisted.selector, address(fanInImpl)));
        factory.deployFanIn(consumer, manager);

        // Other node types are unaffected.
        address tw = factory.deployTokenWeighting(consumer, governance);
        assertEq(IEntity(tw).factoryTypeId(), TOKEN_WEIGHTING_TYPE_ID, "unaffected node type still deploys");
    }

    function test_blacklist_onlyOwner() public {
        vm.prank(nonOwner);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, nonOwner));
        factory.blacklist(address(fanInImpl));
    }

    // =========================================================================
    // Deploys remain permissionless (behavior preserved)
    // =========================================================================

    function test_deploy_remainsPermissionless() public {
        vm.prank(randomCaller);
        address clone = factory.deployFanIn(consumer, manager);
        assertEq(IEntity(clone).factoryTypeId(), FAN_IN_TYPE_ID, "any caller can clone a whitelisted node");
    }

    // =========================================================================
    // Multicallable: batch node deploys in one tx
    // =========================================================================

    function test_multicall_batchesNodeDeploys() public {
        bytes[] memory calls = new bytes[](2);
        calls[0] = abi.encodeCall(MeshFactory.deployFanIn, (consumer, manager));
        calls[1] = abi.encodeCall(MeshFactory.deployTokenWeighting, (consumer, governance));

        bytes[] memory results = factory.multicall(calls);
        address fanIn = abi.decode(results[0], (address));
        address tw = abi.decode(results[1], (address));

        assertEq(IEntity(fanIn).factoryTypeId(), FAN_IN_TYPE_ID, "fan_in deployed in batch");
        assertEq(IEntity(tw).factoryTypeId(), TOKEN_WEIGHTING_TYPE_ID, "token_weighting deployed in batch");
    }
}
