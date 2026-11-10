// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import "forge-std/Test.sol";
import {ERC1967Proxy} from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";

import {CommitmentManager} from "src/core/manager/CommitmentManager.sol";
import {ICommitmentManager as ICM} from "src/core/interfaces/ICommitmentManager.sol";
import {StrategyBinding} from "src/core/interfaces/IDistributionStrategy.sol";
import {IBackingAdapter} from "src/core/interfaces/IBackingAdapter.sol";
import {IndexAppreciationYield} from "src/distributions/IndexAppreciationYield.sol";
import {RewardsCoordinatorFactory} from "src/extensions/rewards/RewardsCoordinatorFactory.sol";
import {MerkleSnapshot} from "src/extensions/rewards/MerkleSnapshot.sol";
import {CommitmentsRewardsCoordinator} from "src/extensions/rewards/CommitmentsRewardsCoordinator.sol";
import {MockERC20} from "../../helpers/MockERC20.sol";
import {MerkleHelper} from "../../rewards/MerkleHelper.sol";

/// @dev The worked example's appreciating venue: index 1.00e18 → 1.04e18.
contract MockIndexAdapter is IBackingAdapter {
    uint256 public index = 1e18;

    function setIndex(uint256 v) external {
        index = v;
    }

    function indexNow(address) external view returns (uint256) {
        return index;
    }

    function payoutDenomination(address token) external pure returns (address) {
        return token;
    }
}

/// @title WorkedExampleTest
/// @notice ERC-COMMITMENTS §D.9 end-to-end, with the spec's exact numbers: one commitment,
///         two strategies (IndexAppreciationYield in manager escrow + the rewards coordinator
///         in self-custody), Alice/Bob/Carol parties, 1.923e18 commission, 50e18 merkle claim.
contract WorkedExampleTest is Test {
    CommitmentManager internal manager;
    MockERC20 internal mUSDC;
    MockIndexAdapter internal adapter;
    IndexAppreciationYield internal indexYield;
    CommitmentsRewardsCoordinator internal merkleRewards;
    MerkleSnapshot internal snapshot;

    address internal alice = makeAddr("alice"); // committer
    address internal bob = makeAddr("bob"); // counterparty / operator
    address internal carol = makeAddr("carol"); // AVS service; arbiter
    address internal updater = makeAddr("updater");

    uint64 internal constant ROOT_DELAY = 1 days;

    // The spec's commission: 500e18 × 0.04 × 10% = 2e18 underlying → ×1e18/1.04e18 units.
    uint256 internal constant COMMISSION = uint256(2e18) * 1e18 / 1.04e18; // 1.923076923076923076e18

    function setUp() public {
        CommitmentManager impl = new CommitmentManager();
        manager = CommitmentManager(
            address(
                new ERC1967Proxy(
                    address(impl), abi.encodeCall(CommitmentManager.initialize, (makeAddr("admin"), 7 days, 14 days))
                )
            )
        );
        mUSDC = new MockERC20("Morpho USDC", "mUSDC", 18);
        adapter = new MockIndexAdapter();
        indexYield = new IndexAppreciationYield(address(manager));

        // Coordinator + snapshot via the factory (Carol's AVS owns the pair).
        RewardsCoordinatorFactory factory = new RewardsCoordinatorFactory(
            address(new CommitmentsRewardsCoordinator()), address(new MerkleSnapshot()), ROOT_DELAY
        );
        (address coordAddr, address snapAddr) = factory.deployCoordinator(carol, updater, ROOT_DELAY);
        merkleRewards = CommitmentsRewardsCoordinator(coordAddr);
        snapshot = MerkleSnapshot(snapAddr);

        mUSDC.mint(alice, 1_000e18);
        mUSDC.mint(carol, 10_000e18);
    }

    function _partitionHolds() internal view {
        (uint256 free, uint256 enc, uint256 esc) = manager.ledgerTotals(address(mUSDC));
        assertEq(free + enc + esc, mUSDC.balanceOf(address(manager)), "INV-1 inside the manager");
    }

    function test_workedExample_endToEnd() public {
        // ---- 1. Deposit. ----
        vm.startPrank(alice);
        mUSDC.approve(address(manager), type(uint256).max);
        manager.deposit(address(mUSDC), 1_000e18);
        vm.stopPrank();
        assertEq(manager.freeBalance(address(mUSDC), alice), 1_000e18);
        _partitionHolds();

        // ---- 2. Fund rewards (self-custody; the manager's ledger is untouched). ----
        vm.startPrank(carol);
        mUSDC.approve(address(merkleRewards), 10_000e18);
        merkleRewards.depositRewards(address(mUSDC), 10_000e18);
        vm.stopPrank();
        _partitionHolds();

        // ---- 3. Create: 500e18 @ 50%, [indexYield(10%)]. The rewards coordinator
        //         is a standalone self-custody distributor, NOT a manager strategy. ----
        ICM.CommitmentParams memory p;
        p.arbiter = carol;
        p.counterparty = bob;
        p.token = address(mUSDC);
        p.adapter = address(adapter);
        p.amount = 500e18;
        p.maxPenaltyBps = 5000;
        p.challengeWindow = 1 days;
        p.strategies = new StrategyBinding[](1);
        p.strategies[0] = StrategyBinding(address(indexYield), abi.encode(uint16(1000)));
        vm.prank(alice);
        uint256 id = manager.createCommitment(p);

        assertEq(manager.freeBalance(address(mUSDC), alice), 500e18);
        assertEq(manager.encumberedBalance(address(mUSDC), alice), 500e18);
        ICM.UserExposure memory mag = manager.getUserExposure(address(mUSDC), alice);
        assertEq(mag.totalEncumbered, 500e18);
        assertEq(mag.totalForfeitable, 250e18);
        (uint256 lastIndex, uint16 bps,) = indexYield.positionOf(id);
        assertEq(lastIndex, 1e18);
        assertEq(bps, 1000);
        _partitionHolds();

        // ---- 4. Time passes: index → 1.04; the AVS submits a root and it activates. ----
        adapter.setIndex(1.04e18);
        MerkleHelper.Leaf[] memory leaves = new MerkleHelper.Leaf[](1);
        leaves[0] = MerkleHelper.Leaf({earner: alice, token: address(mUSDC), cumulativeAmount: 50e18});
        bytes32 rootId = MerkleHelper.buildRoot(leaves);
        vm.prank(updater);
        snapshot.submitRoot(rootId);
        vm.warp(block.timestamp + ROOT_DELAY);

        // ---- 5. Distribute (premium accrual) — the spec's exact arithmetic. ----
        assertEq(COMMISSION, 1.923076923076923076e18, "the spec's 1.923e18");
        manager.distribute(id, address(indexYield));

        assertEq(manager.encumberedBalance(address(mUSDC), alice), 500e18 - COMMISSION); // 498.077e18
        assertEq(manager.getCommitment(id).amount, 500e18 - COMMISSION);
        assertEq(manager.escrowOf(address(mUSDC), address(indexYield)), COMMISSION);
        // Exposure-diff shrink: forfeitable tracks (amount × 5000 / 10_000) exactly.
        mag = manager.getUserExposure(address(mUSDC), alice);
        assertEq(mag.totalForfeitable, ((500e18 - COMMISSION) * 5000) / 10_000);
        _partitionHolds();

        // ---- 6. Claim (premium): Bob pulls his commission through the manager. ----
        vm.expectEmit(true, true, true, true);
        emit ICM.DistributionPaid(address(indexYield), bob, address(mUSDC), COMMISSION, id, bytes32(0));
        vm.prank(bob);
        manager.claim(id, address(indexYield), "");
        assertEq(mUSDC.balanceOf(bob), COMMISSION);
        _partitionHolds();

        // ---- 7. Claim (rewards): Alice claims directly on the coordinator's own
        //         self-custody surface, independent of the manager. ----
        bytes32[] memory proof = MerkleHelper.buildProof(leaves, 0);

        vm.expectEmit(true, true, true, true, address(merkleRewards));
        emit ICM.DistributionPaid(address(merkleRewards), alice, address(mUSDC), 50e18, 0, rootId);
        vm.prank(alice);
        merkleRewards.processClaim(rootId, address(mUSDC), 50e18, proof);
        assertEq(mUSDC.balanceOf(alice), 50e18);

        // The merkle strategy's balance is a separate accounting space: INV-1 still holds for
        // the manager's mUSDC, and Alice's remaining backing keeps appreciating naturally.
        _partitionHolds();
        assertEq(manager.encumberedBalance(address(mUSDC), alice), 500e18 - COMMISSION);
    }
}
