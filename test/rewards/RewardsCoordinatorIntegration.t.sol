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

/// @notice End-to-end protocol-shape test exercising the full lifecycle:
///         factory deploy → deposit → root submit → activation window → claim →
///         cumulative root → claim delta → adversarial branches.
contract RewardsCoordinatorIntegrationTest is Test {
    RewardsCoordinatorFactory internal factory;
    MerkleSnapshot internal snapImpl;
    CommitmentsRewardsCoordinator internal coordImpl;

    address internal service = address(0x5E);
    address internal updater = address(0xBEEF);
    address internal alice = address(0xA11CE);
    address internal bob = address(0xB0B);

    uint64 internal constant MIN_DELAY = 1 days;
    uint64 internal constant DELAY = 7 days;

    function setUp() public {
        snapImpl = new MerkleSnapshot();
        coordImpl = new CommitmentsRewardsCoordinator();
        factory = new RewardsCoordinatorFactory(address(coordImpl), address(snapImpl), MIN_DELAY);
    }

    function _deploy() internal returns (CommitmentsRewardsCoordinator coord, MerkleSnapshot snap) {
        (address coordAddr, address snapAddr) = factory.deployCoordinator(service, updater, DELAY);
        coord = CommitmentsRewardsCoordinator(coordAddr);
        snap = MerkleSnapshot(snapAddr);
    }

    function _fund(MockERC20 t, address to, uint256 amount, address coord) internal {
        t.mint(to, amount);
        vm.prank(to);
        t.approve(coord, amount);
        vm.prank(to);
        CommitmentsRewardsCoordinator(coord).depositRewards(address(t), amount);
    }

    function _submit(MerkleSnapshot snap, MerkleHelper.Leaf[] memory leaves) internal returns (bytes32 rootId) {
        rootId = MerkleHelper.buildRoot(leaves);
        vm.prank(updater);
        snap.submitRoot(rootId);
    }

    function _claim(CommitmentsRewardsCoordinator coord, bytes32 rootId, MerkleHelper.Leaf[] memory leaves, uint256 idx)
        internal
        returns (uint256 paid)
    {
        bytes32[] memory proof = MerkleHelper.buildProof(leaves, idx);
        vm.prank(leaves[idx].earner);
        paid = coord.processClaim(rootId, leaves[idx].token, leaves[idx].cumulativeAmount, proof);
    }

    // -------------------------------------------------------------------------
    // Golden path: deploy → deposit → submit → claim → re-submit → claim delta
    // -------------------------------------------------------------------------

    function test_goldenPath_twoRootsTwoTokensTwoEarners() public {
        (CommitmentsRewardsCoordinator coord, MerkleSnapshot snap) = _deploy();

        MockERC20 usdc = new MockERC20("USDC", "USDC", 6);
        MockERC20 weth = new MockERC20("WETH", "WETH", 18);
        _fund(usdc, address(this), 1_000e6, address(coord));
        _fund(weth, address(this), 500e18, address(coord));

        // Root 1: alice 100 USDC + 50 WETH; bob 200 USDC + 100 WETH.
        MerkleHelper.Leaf[] memory leaves1 = new MerkleHelper.Leaf[](4);
        leaves1[0] = MerkleHelper.Leaf({earner: alice, token: address(usdc), cumulativeAmount: 100e6});
        leaves1[1] = MerkleHelper.Leaf({earner: alice, token: address(weth), cumulativeAmount: 50e18});
        leaves1[2] = MerkleHelper.Leaf({earner: bob, token: address(usdc), cumulativeAmount: 200e6});
        leaves1[3] = MerkleHelper.Leaf({earner: bob, token: address(weth), cumulativeAmount: 100e18});

        bytes32 root1 = _submit(snap, leaves1);
        vm.warp(block.timestamp + DELAY);

        assertEq(_claim(coord, root1, leaves1, 0), 100e6);
        assertEq(_claim(coord, root1, leaves1, 1), 50e18);
        assertEq(_claim(coord, root1, leaves1, 2), 200e6);
        assertEq(_claim(coord, root1, leaves1, 3), 100e18);

        assertEq(usdc.balanceOf(alice), 100e6);
        assertEq(weth.balanceOf(alice), 50e18);
        assertEq(usdc.balanceOf(bob), 200e6);
        assertEq(weth.balanceOf(bob), 100e18);

        // Root 2: cumulative bumps. alice 150 USDC, bob 250 USDC. WETH unchanged.
        MerkleHelper.Leaf[] memory leaves2 = new MerkleHelper.Leaf[](2);
        leaves2[0] = MerkleHelper.Leaf({earner: alice, token: address(usdc), cumulativeAmount: 150e6});
        leaves2[1] = MerkleHelper.Leaf({earner: bob, token: address(usdc), cumulativeAmount: 250e6});

        bytes32 root2 = _submit(snap, leaves2);
        vm.warp(block.timestamp + DELAY);

        assertEq(_claim(coord, root2, leaves2, 0), 50e6); // 150 - 100
        assertEq(_claim(coord, root2, leaves2, 1), 50e6); // 250 - 200

        assertEq(coord.claimed(alice, address(usdc)), 150e6);
        assertEq(coord.claimed(bob, address(usdc)), 250e6);
    }

    // -------------------------------------------------------------------------
    // Adversarial: malicious updater swap blocked by activation delay
    // -------------------------------------------------------------------------

    function test_maliciousUpdaterSwap_blockedAndCancellable() public {
        (, MerkleSnapshot snap) = _deploy();

        address attacker = address(0xBAD);

        vm.prank(service);
        snap.stageUpdater(attacker);

        // Attacker can't submit yet (strict-flip).
        vm.warp(block.timestamp + DELAY);
        vm.prank(attacker);
        vm.expectRevert(IMerkleSnapshot.NotUpdater.selector);
        snap.submitRoot(bytes32(uint256(0xDEAD)));

        // Service notices and cancels.
        vm.prank(service);
        snap.cancelStagedUpdater();

        (address pending,) = snap.pendingUpdater();
        assertEq(pending, address(0));
        assertEq(snap.activeUpdater(), updater);
    }

    // -------------------------------------------------------------------------
    // Adversarial: cumulative regression rejected
    // -------------------------------------------------------------------------

    function test_regressionAttack_rejected() public {
        (CommitmentsRewardsCoordinator coord, MerkleSnapshot snap) = _deploy();
        MockERC20 usdc = new MockERC20("USDC", "USDC", 6);
        _fund(usdc, address(this), 1_000e6, address(coord));

        // Root 1: alice cumulative 200.
        MerkleHelper.Leaf[] memory leaves1 = new MerkleHelper.Leaf[](2);
        leaves1[0] = MerkleHelper.Leaf({earner: alice, token: address(usdc), cumulativeAmount: 200e6});
        leaves1[1] = MerkleHelper.Leaf({earner: bob, token: address(usdc), cumulativeAmount: 0});
        bytes32 root1 = _submit(snap, leaves1);
        vm.warp(block.timestamp + DELAY);
        _claim(coord, root1, leaves1, 0);

        // Root 2: alice regresses to 100. Claim must revert CumulativeRegression.
        MerkleHelper.Leaf[] memory leaves2 = new MerkleHelper.Leaf[](2);
        leaves2[0] = MerkleHelper.Leaf({earner: alice, token: address(usdc), cumulativeAmount: 100e6});
        leaves2[1] = MerkleHelper.Leaf({earner: bob, token: address(usdc), cumulativeAmount: 0});
        bytes32 root2 = _submit(snap, leaves2);
        vm.warp(block.timestamp + DELAY);

        bytes32[] memory proof2 = MerkleHelper.buildProof(leaves2, 0);
        vm.prank(alice);
        vm.expectRevert(ICommitmentsRewardsCoordinator.CumulativeRegression.selector);
        coord.processClaim(root2, address(usdc), 100e6, proof2);
    }

    // -------------------------------------------------------------------------
    // Adversarial: disable during activation window
    // -------------------------------------------------------------------------

    function test_disableDuringWindow_killsRoot() public {
        (CommitmentsRewardsCoordinator coord, MerkleSnapshot snap) = _deploy();
        MockERC20 usdc = new MockERC20("USDC", "USDC", 6);
        _fund(usdc, address(this), 1_000e6, address(coord));

        MerkleHelper.Leaf[] memory leaves = new MerkleHelper.Leaf[](2);
        leaves[0] = MerkleHelper.Leaf({earner: alice, token: address(usdc), cumulativeAmount: 100e6});
        leaves[1] = MerkleHelper.Leaf({earner: bob, token: address(usdc), cumulativeAmount: 50e6});
        bytes32 root = _submit(snap, leaves);

        // Service catches a bad root and disables it before activeAt.
        vm.prank(service);
        snap.disableRoot(root);

        vm.warp(block.timestamp + DELAY);
        bytes32[] memory proof = MerkleHelper.buildProof(leaves, 0);
        vm.prank(alice);
        vm.expectRevert(ICommitmentsRewardsCoordinator.RootNotActive.selector);
        coord.processClaim(root, address(usdc), 100e6, proof);
    }

    // -------------------------------------------------------------------------
    // Activation window timing
    // -------------------------------------------------------------------------

    function test_activationWindow_blocksThenUnblocks() public {
        (CommitmentsRewardsCoordinator coord, MerkleSnapshot snap) = _deploy();
        MockERC20 usdc = new MockERC20("USDC", "USDC", 6);
        _fund(usdc, address(this), 1_000e6, address(coord));

        MerkleHelper.Leaf[] memory leaves = new MerkleHelper.Leaf[](2);
        leaves[0] = MerkleHelper.Leaf({earner: alice, token: address(usdc), cumulativeAmount: 100e6});
        leaves[1] = MerkleHelper.Leaf({earner: bob, token: address(usdc), cumulativeAmount: 50e6});
        bytes32 root = _submit(snap, leaves);

        bytes32[] memory proof = MerkleHelper.buildProof(leaves, 0);

        // 6 days in: still pending.
        vm.warp(block.timestamp + 6 days);
        vm.prank(alice);
        vm.expectRevert(ICommitmentsRewardsCoordinator.RootNotActive.selector);
        coord.processClaim(root, address(usdc), 100e6, proof);

        // Cross the boundary.
        vm.warp(block.timestamp + 1 days);
        vm.prank(alice);
        uint256 paid = coord.processClaim(root, address(usdc), 100e6, proof);
        assertEq(paid, 100e6);
    }

    // -------------------------------------------------------------------------
    // Service isolation across multiple deployments
    // -------------------------------------------------------------------------

    function test_twoServicesIsolated() public {
        (CommitmentsRewardsCoordinator coordA, MerkleSnapshot snapA) = _deploy();
        (address coordBaddr, address snapBaddr) = factory.deployCoordinator(address(0xC0FFEE), address(0xCAB), DELAY);
        CommitmentsRewardsCoordinator coordB = CommitmentsRewardsCoordinator(coordBaddr);
        MerkleSnapshot snapB = MerkleSnapshot(snapBaddr);

        MockERC20 usdc = new MockERC20("USDC", "USDC", 6);

        // Fund both coordinators.
        usdc.mint(address(this), 2_000e6);
        usdc.approve(address(coordA), 1_000e6);
        usdc.approve(address(coordB), 1_000e6);
        coordA.depositRewards(address(usdc), 1_000e6);
        coordB.depositRewards(address(usdc), 1_000e6);

        // Alice has leaves in both services.
        MerkleHelper.Leaf[] memory leavesA = new MerkleHelper.Leaf[](1);
        leavesA[0] = MerkleHelper.Leaf({earner: alice, token: address(usdc), cumulativeAmount: 300e6});
        bytes32 rootA = MerkleHelper.buildRoot(leavesA);
        vm.prank(updater);
        snapA.submitRoot(rootA);

        MerkleHelper.Leaf[] memory leavesB = new MerkleHelper.Leaf[](1);
        leavesB[0] = MerkleHelper.Leaf({earner: alice, token: address(usdc), cumulativeAmount: 700e6});
        bytes32 rootB = MerkleHelper.buildRoot(leavesB);
        vm.prank(address(0xCAB));
        snapB.submitRoot(rootB);

        vm.warp(block.timestamp + DELAY);

        // Both claims succeed; no cross-talk.
        bytes32[] memory proofA = MerkleHelper.buildProof(leavesA, 0);
        bytes32[] memory proofB = MerkleHelper.buildProof(leavesB, 0);
        vm.prank(alice);
        coordA.processClaim(rootA, address(usdc), 300e6, proofA);
        vm.prank(alice);
        coordB.processClaim(rootB, address(usdc), 700e6, proofB);

        assertEq(usdc.balanceOf(alice), 1_000e6);
        assertEq(coordA.claimed(alice, address(usdc)), 300e6);
        assertEq(coordB.claimed(alice, address(usdc)), 700e6);
    }
}
