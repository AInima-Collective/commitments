// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import {Test} from "forge-std/Test.sol";
import {Clones} from "@openzeppelin/contracts/proxy/Clones.sol";
import {IAccessControl} from "@openzeppelin/contracts/access/IAccessControl.sol";

import {TokenWeighting} from "src/extensions/mesh/TokenWeighting.sol";
import {ITokenWeighting} from "src/extensions/mesh/interfaces/ITokenWeighting.sol";

contract TokenWeightingTransferGovernanceTest is Test {
    TokenWeighting public tw;

    address public provider = address(0x1);
    address public oldGov = address(0x2);
    address public newGov = address(0xBEEF);
    address public unauthorized = address(0x9);

    bytes32 public constant DENOM_WSETH = keccak256("wstETH");

    function setUp() public {
        address impl = address(new TokenWeighting());
        tw = TokenWeighting(Clones.clone(impl));
        tw.initialize(provider, oldGov);
    }

    function test_transferGovernance_updatesGovernanceSlot() public {
        vm.prank(oldGov);
        tw.transferGovernance(newGov);
        assertEq(tw.governance(), newGov);
    }

    function test_transferGovernance_grantsRolesToNewGovernance() public {
        vm.prank(oldGov);
        tw.transferGovernance(newGov);

        assertTrue(tw.hasRole(tw.DEFAULT_ADMIN_ROLE(), newGov));
        assertTrue(tw.hasRole(tw.REWARDER_ROLE(), newGov));
    }

    function test_transferGovernance_revokesRolesFromOldGovernance() public {
        vm.prank(oldGov);
        tw.transferGovernance(newGov);

        assertFalse(tw.hasRole(tw.DEFAULT_ADMIN_ROLE(), oldGov));
        assertFalse(tw.hasRole(tw.REWARDER_ROLE(), oldGov));
    }

    function test_transferGovernance_emitsEvent() public {
        vm.prank(oldGov);
        vm.expectEmit(true, true, false, true, address(tw));
        emit ITokenWeighting.GovernanceTransferred(oldGov, newGov);
        tw.transferGovernance(newGov);
    }

    function test_transferGovernance_revertsOnZeroAddress() public {
        vm.prank(oldGov);
        vm.expectRevert(ITokenWeighting.ZeroGovernance.selector);
        tw.transferGovernance(address(0));
    }

    function test_transferGovernance_revertsForNonGovernance() public {
        vm.prank(unauthorized);
        vm.expectRevert(ITokenWeighting.OnlyGovernance.selector);
        tw.transferGovernance(newGov);
    }

    function test_transferGovernance_oldGovernanceLosesUpdateWeightAccess() public {
        vm.prank(oldGov);
        tw.transferGovernance(newGov);

        vm.prank(oldGov);
        vm.expectRevert(ITokenWeighting.OnlyGovernance.selector);
        tw.updateWeight(DENOM_WSETH, 10000);
    }

    function test_transferGovernance_newGovernanceCanUpdateWeight() public {
        vm.prank(oldGov);
        tw.transferGovernance(newGov);

        vm.prank(newGov);
        tw.updateWeight(DENOM_WSETH, 10000);
        assertEq(tw.weights(DENOM_WSETH), 10000);
    }

    function test_transferGovernance_chained() public {
        address third = address(0xCAFE);
        vm.prank(oldGov);
        tw.transferGovernance(newGov);
        vm.prank(newGov);
        tw.transferGovernance(third);

        assertEq(tw.governance(), third);
        assertTrue(tw.hasRole(tw.DEFAULT_ADMIN_ROLE(), third));
        assertFalse(tw.hasRole(tw.DEFAULT_ADMIN_ROLE(), newGov));
        assertFalse(tw.hasRole(tw.DEFAULT_ADMIN_ROLE(), oldGov));
    }

    function test_transferGovernance_oldCannotGrantRolesAfterTransfer() public {
        vm.prank(oldGov);
        tw.transferGovernance(newGov);

        // Hoist external view calls before vm.expectRevert (which is consumed
        // by the very next call).
        bytes32 rewarderRole = tw.REWARDER_ROLE();
        bytes32 adminRole = tw.DEFAULT_ADMIN_ROLE();

        // Old governance no longer has DEFAULT_ADMIN_ROLE so external grantRole reverts.
        vm.prank(oldGov);
        vm.expectRevert(
            abi.encodeWithSelector(IAccessControl.AccessControlUnauthorizedAccount.selector, oldGov, adminRole)
        );
        tw.grantRole(rewarderRole, unauthorized);
    }
}
