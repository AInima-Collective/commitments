// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import "forge-std/Test.sol";
import {ERC1967Proxy} from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";

import {CommitmentManager} from "src/core/manager/CommitmentManager.sol";
import {ICommitmentManager as ICM} from "src/core/interfaces/ICommitmentManager.sol";
import {StrategyBinding} from "src/core/interfaces/IDistributionStrategy.sol";
import {MutualRegistry} from "src/extensions/mutuals/MutualRegistry.sol";
import {ClaimRouter} from "src/extensions/mutuals/ClaimRouter.sol";
import {OptimisticMutualArbiter} from "src/extensions/mutuals/OptimisticMutualArbiter.sol";
import {MockERC20} from "../helpers/MockERC20.sol";

/// @title MutualE2ETest
/// @notice End-to-end Position-A flow: registry creates a mutual with a bonded optimistic arbiter and
///         a ClaimRouter beneficiary; underwriters join; a loss is proposed (bonded), executes after
///         the window, members settle permissionlessly into the router, and the policyholder
///         collects the basket. Also covers the dispute (veto + bond slash) path.
contract MutualE2ETest is Test {
    CommitmentManager internal manager;
    MutualRegistry internal registry;
    OptimisticMutualArbiter internal arbiter;
    ClaimRouter internal router;
    MockERC20 internal usdc;
    MockERC20 internal bondTok;

    address internal admin = makeAddr("admin");
    address internal committee = makeAddr("committee"); // arbiter owner / dispute resolver
    address internal treasury = makeAddr("treasury");
    address internal policyholder = makeAddr("policyholder");
    address internal proposer = makeAddr("proposer");
    address internal u1 = makeAddr("u1");
    address internal u2 = makeAddr("u2");
    address internal adapter = makeAddr("adapter");

    uint64 internal constant MUTUAL_WINDOW = 2 days;
    uint256 internal constant MIN_BOND = 100e18;

    function setUp() public {
        CommitmentManager impl = new CommitmentManager();
        manager = CommitmentManager(
            address(
                new ERC1967Proxy(address(impl), abi.encodeCall(CommitmentManager.initialize, (admin, 7 days, 14 days)))
            )
        );
        usdc = new MockERC20("USD Coin", "USDC", 18);
        bondTok = new MockERC20("Bond", "BOND", 18);

        registry = new MutualRegistry(address(manager));
        arbiter = new OptimisticMutualArbiter(address(manager), address(bondTok), MIN_BOND, treasury, committee);
        router = new ClaimRouter(address(manager), policyholder);

        // Underwriters fund the manager.
        for (uint256 i; i < 2; i++) {
            address u = i == 0 ? u1 : u2;
            usdc.mint(u, 1_000_000e18);
            vm.startPrank(u);
            usdc.approve(address(manager), type(uint256).max);
            manager.deposit(address(usdc), 1_000_000e18);
            vm.stopPrank();
        }
        bondTok.mint(proposer, 1_000e18);
        vm.prank(proposer);
        bondTok.approve(address(arbiter), type(uint256).max);
    }

    function _registerMutual() internal returns (uint256 mutualId) {
        ICM.MutualParams memory p = ICM.MutualParams({
            arbiter: address(arbiter),
            numeraire: address(usdc),
            beneficiary: address(router),
            valuationAuthority: address(0),
            challengeWindow: MUTUAL_WINDOW,
            deallocationWindow: MUTUAL_WINDOW
        });
        mutualId = registry.registerMutual(p, 200e18, uint64(block.timestamp + 30 days), "ipfs://peril", bytes32("h"));
        vm.prank(committee);
        arbiter.activate(mutualId);
    }

    function _join(uint256 mutualId, address who, uint256 amount) internal returns (uint256 cid) {
        ICM.CommitmentParams memory p;
        p.arbiter = address(arbiter);
        p.counterparty = address(router);
        p.token = address(usdc);
        p.adapter = adapter;
        p.amount = amount;
        p.maxPenaltyBps = 10_000;
        p.challengeWindow = 1 days;
        p.strategies = new StrategyBinding[](0);
        vm.prank(who);
        cid = manager.joinMutual(mutualId, p, 0, "");
    }

    function test_e2e_proposeExecuteSettleCollect() public {
        uint256 gid = _registerMutual();
        uint256 c1 = _join(gid, u1, 100e18);
        uint256 c2 = _join(gid, u2, 100e18);

        // Capacity filled.
        assertTrue(registry.isFilled(gid), "filled");
        (uint128 filled, uint128 target) = registry.capacity(gid);
        assertEq(filled, 200e18);
        assertEq(target, 200e18);

        // Bonded loss proposal (50% of capacity).
        vm.prank(proposer);
        arbiter.proposeLoss(gid, 100e18, bytes32("evidence"), MIN_BOND);
        assertEq(bondTok.balanceOf(address(arbiter)), MIN_BOND, "bond held");

        // Execute after the window (permissionless on the manager).
        vm.warp(block.timestamp + MUTUAL_WINDOW + 1);
        manager.executeMutualLoss(gid);

        // Members settle into the router; policyholder collects the basket.
        uint256[] memory ids = new uint256[](2);
        ids[0] = c1;
        ids[1] = c2;
        vm.prank(policyholder);
        uint256 collected = router.settleAndCollect(ids, address(usdc), policyholder);
        assertEq(collected, 100e18, "policyholder collects the declared loss");
        assertEq(usdc.balanceOf(policyholder), 100e18, "basket delivered");

        // Honest proposer reclaims the bond.
        vm.prank(proposer);
        arbiter.reclaimBond(gid);
        assertEq(bondTok.balanceOf(proposer), 1_000e18, "bond returned");
    }

    function test_e2e_disputeVetoSlashesBond() public {
        uint256 gid = _registerMutual();
        _join(gid, u1, 100e18);

        vm.prank(proposer);
        arbiter.proposeLoss(gid, 50e18, bytes32("bogus"), MIN_BOND);

        // Committee vetoes within the window.
        vm.prank(committee);
        arbiter.veto(gid);
        assertEq(bondTok.balanceOf(treasury), MIN_BOND, "bond slashed to treasury");

        // The declaration is cancelled — execute reverts.
        vm.warp(block.timestamp + MUTUAL_WINDOW + 1);
        vm.expectRevert(ICM.NoMutualLossPending.selector);
        manager.executeMutualLoss(gid);
    }

    /// @dev Red-team #1: a permissionless stale-cancel must not brick the bond / claim path.
    function test_reclaimOnCancelled_afterStaleCancel() public {
        uint256 gid = _registerMutual();
        _join(gid, u1, 100e18);
        vm.prank(proposer);
        arbiter.proposeLoss(gid, 50e18, bytes32("e"), MIN_BOND);

        // Proposer never executes; anyone stale-cancels after window + TTL (2d + 7d).
        vm.warp(block.timestamp + MUTUAL_WINDOW + 7 days + 1);
        manager.cancelStaleMutualLoss(gid);

        uint256 before = bondTok.balanceOf(proposer);
        arbiter.reclaimOnCancelled(gid); // permissionless recovery
        assertEq(bondTok.balanceOf(proposer) - before, MIN_BOND, "bond recovered, not stuck");

        // ...and the mutual's claim path is alive again.
        vm.prank(proposer);
        arbiter.proposeLoss(gid, 30e18, bytes32("e2"), MIN_BOND);
        assertEq(bondTok.balanceOf(address(arbiter)), MIN_BOND, "fresh claim accepted");
    }

    /// @dev Red-team #3: veto must not fire after the challenge window (optimistic guarantee).
    function test_veto_afterWindowReverts() public {
        uint256 gid = _registerMutual();
        _join(gid, u1, 100e18);
        vm.prank(proposer);
        arbiter.proposeLoss(gid, 50e18, bytes32("e"), MIN_BOND);

        vm.warp(block.timestamp + MUTUAL_WINDOW + 1);
        vm.prank(committee);
        vm.expectRevert(OptimisticMutualArbiter.VetoWindowClosed.selector);
        arbiter.veto(gid);
    }

    function test_claimRouter_onlyClaimantCollects() public {
        uint256 gid = _registerMutual();
        uint256 c1 = _join(gid, u1, 100e18);
        vm.prank(proposer);
        arbiter.proposeLoss(gid, 100e18, bytes32("e"), MIN_BOND);
        vm.warp(block.timestamp + MUTUAL_WINDOW + 1);
        manager.executeMutualLoss(gid);
        uint256[] memory ids = new uint256[](1);
        ids[0] = c1;
        router.settle(ids); // permissionless settle
        vm.expectRevert(ClaimRouter.NotClaimant.selector);
        router.collect(address(usdc), address(0xdead));
    }
}
