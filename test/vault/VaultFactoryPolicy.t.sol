// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import "forge-std/Test.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

import {VaultFactory} from "src/periphery/vaults/VaultFactory.sol";
import {CommitmentsVault} from "src/periphery/vaults/CommitmentsVault.sol";
import {FanInNode} from "src/extensions/mesh/FanInNode.sol";
import {Factory} from "src/shared/factories/Factory.sol";
import {MockERC20} from "../helpers/MockERC20.sol";

/// @title VaultFactoryPolicyTest
/// @notice Covers the issue-#45 `Factory` whitelist/blacklist ladder on VaultFactory, with
///         self-verifying type ids. Vault enumeration is covered in `VaultFactory.t.sol`.
contract VaultFactoryPolicyTest is Test {
    VaultFactory internal factory;
    CommitmentsVault internal implementation;
    MockERC20 internal token;

    address internal admin = makeAddr("admin");
    address internal nonOwner = makeAddr("nonOwner");

    function setUp() public {
        implementation = new CommitmentsVault();
        factory = new VaultFactory(address(implementation));
        token = new MockERC20("Test", "TEST", 18);
    }

    // =========================================================================
    // Constructor self-verification
    // =========================================================================

    function test_constructor_whitelistsImplWithSelfVerifiedTypeId() public view {
        assertTrue(factory.isWhitelisted(address(implementation)), "impl whitelisted at construction");
        assertFalse(factory.isBlacklisted(address(implementation)), "impl not blacklisted");
        assertEq(
            factory.implementationTypeId(address(implementation)),
            implementation.factoryTypeId(),
            "recorded type id is the vault's self-declared id"
        );
    }

    function test_constructor_rejectsWrongTypeImpl() public {
        // A FanInNode reports a mesh type id, not the vault id — constructor must reject it.
        FanInNode wrongType = new FanInNode();
        vm.expectRevert(
            abi.encodeWithSelector(
                Factory.TypeIdMismatch.selector,
                address(wrongType),
                implementation.factoryTypeId(),
                wrongType.factoryTypeId()
            )
        );
        new VaultFactory(address(wrongType));
    }

    // =========================================================================
    // Blacklist valve
    // =========================================================================

    function test_blacklist_freezesDeployment() public {
        vm.expectEmit(true, false, false, false, address(factory));
        emit Factory.ImplementationBlacklisted(address(implementation));
        vm.prank(factory.owner());
        factory.blacklist(address(implementation));

        assertTrue(factory.isBlacklisted(address(implementation)), "impl blacklisted");

        vm.prank(factory.owner());
        vm.expectRevert(abi.encodeWithSelector(Factory.Blacklisted.selector, address(implementation)));
        factory.deployVault(address(token), admin, address(0));
    }

    function test_blacklist_isOneWay_cannotRewhitelist() public {
        CommitmentsVault impl2 = new CommitmentsVault();
        bytes32 tid = impl2.factoryTypeId();
        vm.startPrank(factory.owner());
        factory.blacklist(address(impl2));
        vm.expectRevert(abi.encodeWithSelector(Factory.Blacklisted.selector, address(impl2)));
        factory.whitelistImplementation(address(impl2), tid);
        vm.stopPrank();
    }

    function test_blacklist_onlyOwner() public {
        vm.prank(nonOwner);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, nonOwner));
        factory.blacklist(address(implementation));
    }

    // =========================================================================
    // whitelistImplementation external path
    // =========================================================================

    function test_whitelistImplementation_secondVaultImpl() public {
        CommitmentsVault impl2 = new CommitmentsVault();
        vm.expectEmit(true, true, false, false, address(factory));
        emit Factory.ImplementationWhitelisted(address(impl2), impl2.factoryTypeId());
        vm.prank(factory.owner());
        factory.whitelistImplementation(address(impl2), impl2.factoryTypeId());
        assertTrue(factory.isWhitelisted(address(impl2)), "second impl whitelisted");
    }

    function test_whitelist_rejectsAlreadyWhitelisted() public {
        bytes32 tid = implementation.factoryTypeId();
        vm.prank(factory.owner());
        vm.expectRevert(abi.encodeWithSelector(Factory.AlreadyWhitelisted.selector, address(implementation)));
        factory.whitelistImplementation(address(implementation), tid);
    }

    function test_whitelist_rejectsZeroImpl() public {
        vm.prank(factory.owner());
        vm.expectRevert(Factory.ZeroImplementation.selector);
        factory.whitelistImplementation(address(0), bytes32(0));
    }

    function test_whitelist_rejectsTypeIdMismatch() public {
        CommitmentsVault impl2 = new CommitmentsVault();
        vm.prank(factory.owner());
        vm.expectRevert(
            abi.encodeWithSelector(
                Factory.TypeIdMismatch.selector, address(impl2), keccak256("wrong"), impl2.factoryTypeId()
            )
        );
        factory.whitelistImplementation(address(impl2), keccak256("wrong"));
    }

    function test_whitelist_onlyOwner() public {
        CommitmentsVault impl2 = new CommitmentsVault();
        bytes32 tid = impl2.factoryTypeId();
        vm.prank(nonOwner);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, nonOwner));
        factory.whitelistImplementation(address(impl2), tid);
    }
}
