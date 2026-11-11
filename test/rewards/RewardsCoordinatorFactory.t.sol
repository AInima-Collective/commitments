// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import "forge-std/Test.sol";

import {RewardsCoordinatorFactory} from "src/extensions/rewards/RewardsCoordinatorFactory.sol";
import {MerkleSnapshot} from "src/extensions/rewards/MerkleSnapshot.sol";
import {CommitmentsRewardsCoordinator} from "src/extensions/rewards/CommitmentsRewardsCoordinator.sol";
import {IMerkleSnapshot} from "src/extensions/rewards/interfaces/IMerkleSnapshot.sol";
import {ICommitmentsRewardsCoordinator} from "src/extensions/rewards/interfaces/ICommitmentsRewardsCoordinator.sol";
import {MockERC20} from "../helpers/MockERC20.sol";
import {MerkleHelper} from "./MerkleHelper.sol";

contract RewardsCoordinatorFactoryTest is Test {
    RewardsCoordinatorFactory internal factory;
    MerkleSnapshot internal snapImpl;
    CommitmentsRewardsCoordinator internal coordImpl;

    address internal serviceA = address(0xA1);
    address internal serviceB = address(0xB2);
    address internal updater = address(0xBEEF);

    uint64 internal constant MIN_DELAY = 1 days;
    uint64 internal constant DELAY = 7 days;

    event CoordinatorDeployed(
        address indexed service,
        address indexed coordinator,
        address indexed snapshot,
        address updater,
        uint64 activationDelay
    );

    function setUp() public {
        snapImpl = new MerkleSnapshot();
        coordImpl = new CommitmentsRewardsCoordinator();
        factory = new RewardsCoordinatorFactory(address(coordImpl), address(snapImpl), MIN_DELAY);
    }

    function test_deployCoordinator_returnsBothAddresses() public {
        (address coord, address snap) = factory.deployCoordinator(serviceA, updater, DELAY);
        assertTrue(coord != address(0));
        assertTrue(snap != address(0));
        assertTrue(coord != snap);
    }

    function test_deployCoordinator_setsUpdaterOnSnapshot() public {
        (, address snap) = factory.deployCoordinator(serviceA, updater, DELAY);
        // The snapshot now owns the updater-auth surface (no coordinator binding).
        assertEq(MerkleSnapshot(snap).activeUpdater(), updater);
    }

    function test_deployCoordinator_wiresCoordinatorToSnapshot() public {
        (address coord, address snap) = factory.deployCoordinator(serviceA, updater, DELAY);
        assertEq(address(CommitmentsRewardsCoordinator(coord).snapshot()), snap);
    }

    function test_deployCoordinator_setsServiceOnBoth() public {
        (address coord, address snap) = factory.deployCoordinator(serviceA, updater, DELAY);
        assertEq(MerkleSnapshot(snap).service(), serviceA);
        assertEq(CommitmentsRewardsCoordinator(coord).service(), serviceA);
    }

    function test_deployCoordinator_setsUpdater() public {
        (, address snap) = factory.deployCoordinator(serviceA, updater, DELAY);
        assertEq(MerkleSnapshot(snap).activeUpdater(), updater);
    }

    function test_deployCoordinator_setsActivationDelay() public {
        (, address snap) = factory.deployCoordinator(serviceA, updater, DELAY);
        assertEq(MerkleSnapshot(snap).activationDelay(), DELAY);
        assertEq(MerkleSnapshot(snap).minActivationDelay(), MIN_DELAY);
    }

    function test_deployCoordinator_zeroService_reverts() public {
        vm.expectRevert(IMerkleSnapshot.ZeroAddress.selector);
        factory.deployCoordinator(address(0), updater, DELAY);
    }

    function test_deployCoordinator_zeroUpdater_reverts() public {
        vm.expectRevert(IMerkleSnapshot.ZeroAddress.selector);
        factory.deployCoordinator(serviceA, address(0), DELAY);
    }

    function test_deployCoordinator_belowFloor_reverts() public {
        vm.expectRevert(IMerkleSnapshot.ActivationDelayBelowFloor.selector);
        factory.deployCoordinator(serviceA, updater, MIN_DELAY - 1);
    }

    function test_deployCoordinator_emitsCoordinatorDeployed() public {
        // We can't predict addresses without re-running the salt logic; just
        // assert the event topic shape matches.
        vm.recordLogs();
        (address coord, address snap) = factory.deployCoordinator(serviceA, updater, DELAY);
        Vm.Log[] memory logs = vm.getRecordedLogs();
        // Find the CoordinatorDeployed event.
        bytes32 topic = keccak256("CoordinatorDeployed(address,address,address,address,uint64)");
        bool found;
        for (uint256 i = 0; i < logs.length; ++i) {
            if (logs[i].topics.length > 0 && logs[i].topics[0] == topic) {
                assertEq(address(uint160(uint256(logs[i].topics[1]))), serviceA);
                assertEq(address(uint160(uint256(logs[i].topics[2]))), coord);
                assertEq(address(uint160(uint256(logs[i].topics[3]))), snap);
                found = true;
                break;
            }
        }
        assertTrue(found, "CoordinatorDeployed not found");
    }

    function test_deployCoordinator_perServiceUniqueAddresses() public {
        (address coordA, address snapA) = factory.deployCoordinator(serviceA, updater, DELAY);
        (address coordB, address snapB) = factory.deployCoordinator(serviceB, updater, DELAY);
        assertTrue(coordA != coordB);
        assertTrue(snapA != snapB);
    }

    function test_deployCoordinator_consistentImplementations() public {
        (address coord, address snap) = factory.deployCoordinator(serviceA, updater, DELAY);
        // Read implementation slot per ERC-1967 (same EIP-1967 standard).
        bytes32 slot = bytes32(uint256(keccak256("eip1967.proxy.implementation")) - 1);
        assertEq(address(uint160(uint256(vm.load(snap, slot)))), address(snapImpl));
        assertEq(address(uint160(uint256(vm.load(coord, slot)))), address(coordImpl));
    }

    function test_deployCoordinator_independent() public {
        (address coordA, address snapA) = factory.deployCoordinator(serviceA, updater, DELAY);
        (address coordB, address snapB) = factory.deployCoordinator(serviceB, updater, DELAY);

        // Deposit USDC into A; verify B sees nothing.
        MockERC20 usdc = new MockERC20("USDC", "USDC", 6);
        usdc.mint(address(this), 1_000e6);
        usdc.approve(coordA, 1_000e6);
        CommitmentsRewardsCoordinator(coordA).depositRewards(address(usdc), 500e6);
        assertEq(usdc.balanceOf(coordA), 500e6);
        assertEq(usdc.balanceOf(coordB), 0);

        // Disable on A leaves B unaffected.
        bytes32 root = bytes32(uint256(0xCAFE));
        vm.prank(updater);
        MerkleSnapshot(snapA).submitRoot(root);
        vm.prank(serviceA);
        MerkleSnapshot(snapA).disableRoot(root);
        assertEq(MerkleSnapshot(snapB).rootById(root).submittedAt, 0);
    }

    function test_deployCoordinator_factoryConstructorZeroImpl_reverts() public {
        vm.expectRevert(RewardsCoordinatorFactory.ZeroAddress.selector);
        new RewardsCoordinatorFactory(address(0), address(snapImpl), MIN_DELAY);
        vm.expectRevert(RewardsCoordinatorFactory.ZeroAddress.selector);
        new RewardsCoordinatorFactory(address(coordImpl), address(0), MIN_DELAY);
    }
}
