// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import "forge-std/Test.sol";
import {ERC1967Proxy} from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";

import {CommitmentsRewardsCoordinator} from "src/extensions/rewards/CommitmentsRewardsCoordinator.sol";
import {ICommitmentsRewardsCoordinator} from "src/extensions/rewards/interfaces/ICommitmentsRewardsCoordinator.sol";
import {MerkleSnapshot} from "src/extensions/rewards/MerkleSnapshot.sol";
import {IMerkleSnapshot} from "src/extensions/rewards/interfaces/IMerkleSnapshot.sol";
import {MockERC20} from "../helpers/MockERC20.sol";
import {MerkleHelper} from "./MerkleHelper.sol";

contract CommitmentsRewardsCoordinatorTest is Test {
    using MerkleHelper for MerkleHelper.Leaf[];

    CommitmentsRewardsCoordinator internal coord;
    MerkleSnapshot internal snap;
    MockERC20 internal usdc;
    MockERC20 internal weth;

    address internal service = address(0xCAFE);
    address internal updater = address(0xBEEF);
    address internal alice = address(0xA11CE);
    address internal bob = address(0xB0B);
    address internal stranger = address(0xF00D);

    uint64 internal constant MIN_DELAY = 1 days;
    uint64 internal constant INIT_DELAY = 7 days;

    event RewardsDeposited(address indexed depositor, address indexed token, uint256 amount);
    event RewardsClaimed(
        bytes32 indexed rootId,
        address indexed earner,
        address indexed token,
        uint256 amountPaidOut,
        uint256 cumulativeAfter
    );
    event ClaimsFrozenSet(address indexed by);
    event ClaimsUnfrozen(address indexed by);

    function setUp() public {
        // No circular dependency anymore: the snapshot owns its own updater auth,
        // so it deploys first and the coordinator simply points at it.
        MerkleSnapshot snapImpl = new MerkleSnapshot();
        CommitmentsRewardsCoordinator coordImpl = new CommitmentsRewardsCoordinator();

        ERC1967Proxy snapProxy = new ERC1967Proxy(
            address(snapImpl), abi.encodeCall(MerkleSnapshot.initialize, (service, INIT_DELAY, MIN_DELAY, updater))
        );
        snap = MerkleSnapshot(address(snapProxy));

        ERC1967Proxy coordProxy = new ERC1967Proxy(
            address(coordImpl), abi.encodeCall(CommitmentsRewardsCoordinator.initialize, (service, address(snap)))
        );
        coord = CommitmentsRewardsCoordinator(address(coordProxy));

        usdc = new MockERC20("USDC", "USDC", 6);
        weth = new MockERC20("WETH", "WETH", 18);

        usdc.mint(address(this), 1_000_000e6);
        weth.mint(address(this), 1_000e18);
        usdc.approve(address(coord), type(uint256).max);
        weth.approve(address(coord), type(uint256).max);
    }

    function _submitRoot(MerkleHelper.Leaf[] memory leaves) internal returns (bytes32 rootId) {
        rootId = MerkleHelper.buildRoot(leaves);
        vm.prank(updater);
        snap.submitRoot(rootId);
        vm.warp(block.timestamp + INIT_DELAY);
    }

    // -------------------------------------------------------------------------
    // Initialization
    // -------------------------------------------------------------------------

    function test_initialize_correctState() public view {
        assertEq(coord.service(), service);
        assertEq(address(coord.snapshot()), address(snap));
        assertEq(snap.activeUpdater(), updater);
        assertEq(coord.frozen(), false);
    }

    function test_initialize_zeroService_reverts() public {
        CommitmentsRewardsCoordinator fresh = new CommitmentsRewardsCoordinator();
        bytes memory data = abi.encodeCall(CommitmentsRewardsCoordinator.initialize, (address(0), address(snap)));
        vm.expectRevert(ICommitmentsRewardsCoordinator.ZeroAddress.selector);
        new ERC1967Proxy(address(fresh), data);
    }

    function test_initialize_zeroSnapshot_reverts() public {
        CommitmentsRewardsCoordinator fresh = new CommitmentsRewardsCoordinator();
        bytes memory data = abi.encodeCall(CommitmentsRewardsCoordinator.initialize, (service, address(0)));
        vm.expectRevert(ICommitmentsRewardsCoordinator.ZeroAddress.selector);
        new ERC1967Proxy(address(fresh), data);
    }

    function test_initialize_doubleInit_reverts() public {
        vm.expectRevert();
        coord.initialize(service, address(snap));
    }

    // -------------------------------------------------------------------------
    // depositRewards
    // -------------------------------------------------------------------------

    function test_depositRewards_anyDepositor() public {
        usdc.mint(stranger, 1_000e6);
        vm.prank(stranger);
        usdc.approve(address(coord), 1_000e6);

        vm.prank(stranger);
        coord.depositRewards(address(usdc), 1_000e6);
        assertEq(usdc.balanceOf(address(coord)), 1_000e6);
    }

    function test_depositRewards_zeroAmount_reverts() public {
        vm.expectRevert(ICommitmentsRewardsCoordinator.ZeroAmount.selector);
        coord.depositRewards(address(usdc), 0);
    }

    function test_depositRewards_zeroToken_reverts() public {
        vm.expectRevert(ICommitmentsRewardsCoordinator.ZeroAddress.selector);
        coord.depositRewards(address(0), 100);
    }

    function test_depositRewards_emitsEvent() public {
        vm.expectEmit(true, true, true, true);
        emit RewardsDeposited(address(this), address(usdc), 500e6);
        coord.depositRewards(address(usdc), 500e6);
    }

    function test_depositRewards_increasesBalance() public {
        coord.depositRewards(address(usdc), 200e6);
        coord.depositRewards(address(usdc), 300e6);
        assertEq(usdc.balanceOf(address(coord)), 500e6);
    }

    function test_depositRewards_multipleTokens_succeed() public {
        coord.depositRewards(address(usdc), 100e6);
        coord.depositRewards(address(weth), 1e18);
        assertEq(usdc.balanceOf(address(coord)), 100e6);
        assertEq(weth.balanceOf(address(coord)), 1e18);
    }

    // -------------------------------------------------------------------------
    // processClaim — happy path
    // -------------------------------------------------------------------------

    function _twoLeaf(address e0, address t0, uint256 c0, address e1, address t1, uint256 c1)
        internal
        pure
        returns (MerkleHelper.Leaf[] memory leaves)
    {
        leaves = new MerkleHelper.Leaf[](2);
        leaves[0] = MerkleHelper.Leaf({earner: e0, token: t0, cumulativeAmount: c0});
        leaves[1] = MerkleHelper.Leaf({earner: e1, token: t1, cumulativeAmount: c1});
    }

    function test_processClaim_singleEarnerSingleToken_succeeds() public {
        coord.depositRewards(address(usdc), 1_000e6);
        MerkleHelper.Leaf[] memory leaves = _twoLeaf(alice, address(usdc), 100e6, bob, address(usdc), 50e6);
        bytes32 rootId = _submitRoot(leaves);

        bytes32[] memory proof = MerkleHelper.buildProof(leaves, 0);
        vm.prank(alice);
        uint256 paid = coord.processClaim(rootId, address(usdc), 100e6, proof);
        assertEq(paid, 100e6);
        assertEq(usdc.balanceOf(alice), 100e6);
        assertEq(coord.claimed(alice, address(usdc)), 100e6);
    }

    function test_processClaim_paysOutCumulativeMinusClaimed() public {
        coord.depositRewards(address(usdc), 1_000e6);

        MerkleHelper.Leaf[] memory leaves1 = _twoLeaf(alice, address(usdc), 100e6, bob, address(usdc), 50e6);
        bytes32 root1 = _submitRoot(leaves1);
        bytes32[] memory proof1 = MerkleHelper.buildProof(leaves1, 0);
        vm.prank(alice);
        coord.processClaim(root1, address(usdc), 100e6, proof1);

        // Submit a second cumulative root: alice up to 250.
        MerkleHelper.Leaf[] memory leaves2 = _twoLeaf(alice, address(usdc), 250e6, bob, address(usdc), 75e6);
        bytes32 root2 = _submitRoot(leaves2);
        bytes32[] memory proof2 = MerkleHelper.buildProof(leaves2, 0);
        vm.prank(alice);
        uint256 paid2 = coord.processClaim(root2, address(usdc), 250e6, proof2);
        assertEq(paid2, 150e6); // 250 - 100
        assertEq(coord.claimed(alice, address(usdc)), 250e6);
        assertEq(usdc.balanceOf(alice), 250e6);
    }

    function test_processClaim_emitsRewardsClaimed() public {
        coord.depositRewards(address(usdc), 1_000e6);
        MerkleHelper.Leaf[] memory leaves = _twoLeaf(alice, address(usdc), 42e6, bob, address(usdc), 0);
        bytes32 rootId = _submitRoot(leaves);
        bytes32[] memory proof = MerkleHelper.buildProof(leaves, 0);

        vm.expectEmit(true, true, true, true);
        emit RewardsClaimed(rootId, alice, address(usdc), 42e6, 42e6);
        vm.prank(alice);
        coord.processClaim(rootId, address(usdc), 42e6, proof);
    }

    function test_processClaim_zeroDelta_reverts() public {
        coord.depositRewards(address(usdc), 1_000e6);
        MerkleHelper.Leaf[] memory leaves = _twoLeaf(alice, address(usdc), 100e6, bob, address(usdc), 0);
        bytes32 rootId = _submitRoot(leaves);
        bytes32[] memory proof = MerkleHelper.buildProof(leaves, 0);

        vm.prank(alice);
        coord.processClaim(rootId, address(usdc), 100e6, proof);

        // Re-claim same cumulative — must revert NoOp (Q2).
        vm.prank(alice);
        vm.expectRevert(ICommitmentsRewardsCoordinator.NoOp.selector);
        coord.processClaim(rootId, address(usdc), 100e6, proof);
    }

    // -------------------------------------------------------------------------
    // processClaim — adversarial
    // -------------------------------------------------------------------------

    function test_processClaim_invalidProof_reverts() public {
        coord.depositRewards(address(usdc), 1_000e6);
        MerkleHelper.Leaf[] memory leaves = _twoLeaf(alice, address(usdc), 100e6, bob, address(usdc), 50e6);
        bytes32 rootId = _submitRoot(leaves);

        bytes32[] memory bogus = new bytes32[](1);
        bogus[0] = bytes32(uint256(0xDEAD));
        vm.prank(alice);
        vm.expectRevert(ICommitmentsRewardsCoordinator.InvalidProof.selector);
        coord.processClaim(rootId, address(usdc), 100e6, bogus);
    }

    function test_processClaim_disabledRoot_reverts() public {
        coord.depositRewards(address(usdc), 1_000e6);
        MerkleHelper.Leaf[] memory leaves = _twoLeaf(alice, address(usdc), 100e6, bob, address(usdc), 50e6);
        bytes32 rootId = MerkleHelper.buildRoot(leaves);
        vm.prank(updater);
        snap.submitRoot(rootId);
        vm.prank(service);
        snap.disableRoot(rootId);

        vm.warp(block.timestamp + INIT_DELAY);
        bytes32[] memory proof = MerkleHelper.buildProof(leaves, 0);
        vm.prank(alice);
        vm.expectRevert(ICommitmentsRewardsCoordinator.RootNotActive.selector);
        coord.processClaim(rootId, address(usdc), 100e6, proof);
    }

    function test_processClaim_pendingActivation_reverts() public {
        coord.depositRewards(address(usdc), 1_000e6);
        MerkleHelper.Leaf[] memory leaves = _twoLeaf(alice, address(usdc), 100e6, bob, address(usdc), 50e6);
        bytes32 rootId = MerkleHelper.buildRoot(leaves);
        vm.prank(updater);
        snap.submitRoot(rootId);
        // Do NOT warp past activeAt.

        bytes32[] memory proof = MerkleHelper.buildProof(leaves, 0);
        vm.prank(alice);
        vm.expectRevert(ICommitmentsRewardsCoordinator.RootNotActive.selector);
        coord.processClaim(rootId, address(usdc), 100e6, proof);
    }

    function test_processClaim_unknownRoot_reverts() public {
        coord.depositRewards(address(usdc), 1_000e6);
        bytes32[] memory proof;
        vm.prank(alice);
        vm.expectRevert(ICommitmentsRewardsCoordinator.RootNotActive.selector);
        coord.processClaim(bytes32(uint256(0xBEEF)), address(usdc), 100e6, proof);
    }

    function test_processClaim_cumulativeRegression_reverts() public {
        coord.depositRewards(address(usdc), 1_000e6);

        // Root 1: alice cumulative 200.
        MerkleHelper.Leaf[] memory leaves1 = _twoLeaf(alice, address(usdc), 200e6, bob, address(usdc), 0);
        bytes32 root1 = _submitRoot(leaves1);
        bytes32[] memory proof1 = MerkleHelper.buildProof(leaves1, 0);
        vm.prank(alice);
        coord.processClaim(root1, address(usdc), 200e6, proof1);

        // Root 2 regresses alice to 100 (cumulative going backwards).
        MerkleHelper.Leaf[] memory leaves2 = _twoLeaf(alice, address(usdc), 100e6, bob, address(usdc), 0);
        bytes32 root2 = _submitRoot(leaves2);
        bytes32[] memory proof2 = MerkleHelper.buildProof(leaves2, 0);
        vm.prank(alice);
        vm.expectRevert(ICommitmentsRewardsCoordinator.CumulativeRegression.selector);
        coord.processClaim(root2, address(usdc), 100e6, proof2);
    }

    function test_processClaim_insufficientBalance_reverts() public {
        // No deposit! Claim must revert.
        MerkleHelper.Leaf[] memory leaves = _twoLeaf(alice, address(usdc), 100e6, bob, address(usdc), 50e6);
        bytes32 rootId = _submitRoot(leaves);
        bytes32[] memory proof = MerkleHelper.buildProof(leaves, 0);

        vm.prank(alice);
        vm.expectRevert(ICommitmentsRewardsCoordinator.InsufficientBalance.selector);
        coord.processClaim(rootId, address(usdc), 100e6, proof);
    }

    function test_processClaim_zeroToken_reverts() public {
        bytes32[] memory proof;
        vm.prank(alice);
        vm.expectRevert(ICommitmentsRewardsCoordinator.ZeroAddress.selector);
        coord.processClaim(bytes32(0), address(0), 100e6, proof);
    }

    function test_processClaim_wrongEarner_reverts() public {
        coord.depositRewards(address(usdc), 1_000e6);
        MerkleHelper.Leaf[] memory leaves = _twoLeaf(alice, address(usdc), 100e6, bob, address(usdc), 50e6);
        bytes32 rootId = _submitRoot(leaves);
        bytes32[] memory proofForAlice = MerkleHelper.buildProof(leaves, 0);

        // Bob calls with Alice's leaf and proof — leaf hash uses msg.sender so won't match.
        vm.prank(bob);
        vm.expectRevert(ICommitmentsRewardsCoordinator.InvalidProof.selector);
        coord.processClaim(rootId, address(usdc), 100e6, proofForAlice);
    }

    // -------------------------------------------------------------------------
    // Multi-token
    // -------------------------------------------------------------------------

    function test_processClaim_multipleTokensInSameRoot_independentAccounting() public {
        coord.depositRewards(address(usdc), 1_000e6);
        coord.depositRewards(address(weth), 10e18);

        MerkleHelper.Leaf[] memory leaves = new MerkleHelper.Leaf[](2);
        leaves[0] = MerkleHelper.Leaf({earner: alice, token: address(usdc), cumulativeAmount: 100e6});
        leaves[1] = MerkleHelper.Leaf({earner: alice, token: address(weth), cumulativeAmount: 1e18});
        bytes32 rootId = _submitRoot(leaves);

        bytes32[] memory proofUsdc = MerkleHelper.buildProof(leaves, 0);
        bytes32[] memory proofWeth = MerkleHelper.buildProof(leaves, 1);

        vm.prank(alice);
        coord.processClaim(rootId, address(usdc), 100e6, proofUsdc);
        vm.prank(alice);
        coord.processClaim(rootId, address(weth), 1e18, proofWeth);

        assertEq(coord.claimed(alice, address(usdc)), 100e6);
        assertEq(coord.claimed(alice, address(weth)), 1e18);
    }

    function test_processClaim_crossTokenRegressionDoesNotCrossContaminate() public {
        coord.depositRewards(address(usdc), 1_000e6);
        coord.depositRewards(address(weth), 10e18);

        // First root: alice gets 100 USDC, 1 WETH.
        MerkleHelper.Leaf[] memory leaves1 = new MerkleHelper.Leaf[](2);
        leaves1[0] = MerkleHelper.Leaf({earner: alice, token: address(usdc), cumulativeAmount: 100e6});
        leaves1[1] = MerkleHelper.Leaf({earner: alice, token: address(weth), cumulativeAmount: 1e18});
        bytes32 root1 = _submitRoot(leaves1);
        vm.prank(alice);
        coord.processClaim(root1, address(usdc), 100e6, MerkleHelper.buildProof(leaves1, 0));
        vm.prank(alice);
        coord.processClaim(root1, address(weth), 1e18, MerkleHelper.buildProof(leaves1, 1));

        // Second root: alice usdc regresses to 50 (would be CumulativeRegression),
        // but weth rises to 2 (should still claim 1 more).
        MerkleHelper.Leaf[] memory leaves2 = new MerkleHelper.Leaf[](2);
        leaves2[0] = MerkleHelper.Leaf({earner: alice, token: address(usdc), cumulativeAmount: 50e6});
        leaves2[1] = MerkleHelper.Leaf({earner: alice, token: address(weth), cumulativeAmount: 2e18});
        bytes32 root2 = _submitRoot(leaves2);

        vm.prank(alice);
        vm.expectRevert(ICommitmentsRewardsCoordinator.CumulativeRegression.selector);
        coord.processClaim(root2, address(usdc), 50e6, MerkleHelper.buildProof(leaves2, 0));

        // WETH still works.
        vm.prank(alice);
        uint256 paid = coord.processClaim(root2, address(weth), 2e18, MerkleHelper.buildProof(leaves2, 1));
        assertEq(paid, 1e18);
    }

    // -------------------------------------------------------------------------
    // Emergency freeze (drain-window fix)
    // -------------------------------------------------------------------------

    /// @notice The load-bearing freeze test. A fraudulent root has ALREADY
    ///         activated (so `disableRoot` reverts and is no longer an option).
    ///         Without a freeze, the holder of a winning leaf could drain the
    ///         coordinator. `freeze()` halts `processClaim`; `unfreeze()`
    ///         restores it.
    function test_freeze_haltsLiveClaim_thenUnfreezeRestores() public {
        coord.depositRewards(address(usdc), 1_000e6);
        MerkleHelper.Leaf[] memory leaves = _twoLeaf(alice, address(usdc), 100e6, bob, address(usdc), 50e6);
        bytes32 rootId = _submitRoot(leaves); // submits + warps past activeAt -> ACTIVE root
        bytes32[] memory proof = MerkleHelper.buildProof(leaves, 0);

        // Sanity: the root is live and disableRoot is no longer possible.
        assertTrue(snap.isActive(rootId), "root must be active for this scenario");
        vm.prank(service);
        vm.expectRevert(IMerkleSnapshot.RootAlreadyActive.selector);
        snap.disableRoot(rootId);

        // Service freezes the coordinator: the active root can no longer drain it.
        vm.prank(service);
        vm.expectEmit(true, true, true, true);
        emit ClaimsFrozenSet(service);
        coord.freeze();
        assertTrue(coord.frozen());

        vm.prank(alice);
        vm.expectRevert(ICommitmentsRewardsCoordinator.ClaimsFrozen.selector);
        coord.processClaim(rootId, address(usdc), 100e6, proof);
        assertEq(usdc.balanceOf(alice), 0, "no funds left while frozen");

        // Service lifts the freeze; claims work again.
        vm.prank(service);
        vm.expectEmit(true, true, true, true);
        emit ClaimsUnfrozen(service);
        coord.unfreeze();
        assertFalse(coord.frozen());

        vm.prank(alice);
        uint256 paid = coord.processClaim(rootId, address(usdc), 100e6, proof);
        assertEq(paid, 100e6);
        assertEq(usdc.balanceOf(alice), 100e6);
    }

    function test_freeze_byNonService_reverts() public {
        vm.prank(stranger);
        vm.expectRevert(ICommitmentsRewardsCoordinator.NotService.selector);
        coord.freeze();
    }

    function test_freeze_alreadyFrozen_reverts() public {
        vm.prank(service);
        coord.freeze();
        vm.prank(service);
        vm.expectRevert(ICommitmentsRewardsCoordinator.AlreadyFrozen.selector);
        coord.freeze();
    }

    function test_unfreeze_byNonService_reverts() public {
        vm.prank(service);
        coord.freeze();
        vm.prank(stranger);
        vm.expectRevert(ICommitmentsRewardsCoordinator.NotService.selector);
        coord.unfreeze();
    }

    function test_unfreeze_notFrozen_reverts() public {
        vm.prank(service);
        vm.expectRevert(ICommitmentsRewardsCoordinator.NotFrozen.selector);
        coord.unfreeze();
    }
}
