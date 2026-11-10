// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import "forge-std/Test.sol";

import {ManagerTestBase} from "../helpers/ManagerTestBase.sol";
import {ICommitmentManager as ICM} from "src/core/interfaces/ICommitmentManager.sol";
import {StrategyBinding} from "src/core/interfaces/IDistributionStrategy.sol";
import {FlatFeeAtCreate} from "src/distributions/FlatFeeAtCreate.sol";
import {FeeOnTransferERC20} from "../helpers/Mocks.sol";
import {StrategyBase} from "src/distributions/StrategyBase.sol";

contract FlatFeeAtCreateTest is ManagerTestBase {
    FlatFeeAtCreate internal strategy;

    address internal alice = makeAddr("alice"); // committer
    address internal arbiter = makeAddr("arbiter");
    address internal bob = makeAddr("bob"); // counterparty / fee payee

    uint256 internal constant FEE = 10e18;

    function setUp() public override {
        super.setUp();
        strategy = new FlatFeeAtCreate(address(manager));

        token.mint(alice, 1_000e18);
        vm.startPrank(alice);
        token.approve(address(manager), type(uint256).max);
        token.approve(address(strategy), type(uint256).max);
        manager.deposit(address(token), 900e18);
        vm.stopPrank();
    }

    function _params() internal view returns (ICM.CommitmentParams memory p) {
        p = _baseParams(arbiter, bob, 100e18, 5000);
        p.challengeWindow = 1 days;
        p.strategies = new StrategyBinding[](1);
        p.strategies[0] = StrategyBinding(address(strategy), abi.encode(FEE));
    }

    function test_create_revertsUntilFeePrefunded() public {
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(FlatFeeAtCreate.FeeNotFunded.selector, FEE, 0));
        manager.createCommitment(_params());

        // Atomic abort: nothing encumbered.
        assertEq(manager.encumberedBalance(address(token), alice), 0);

        // Prefund the committer's credit, then create succeeds.
        vm.startPrank(alice);
        strategy.prefund(alice, address(token), FEE);
        uint256 id = manager.createCommitment(_params());
        vm.stopPrank();

        (uint256 fee, address feeToken, bool collected, bool bound) = strategy.feeOf(id);
        assertEq(fee, FEE);
        assertEq(feeToken, address(token));
        assertFalse(collected);
        assertTrue(bound);
        assertEq(strategy.creditOf(alice, address(token)), 0);
    }

    function test_secondBindingNeedsAdditionalFunding() public {
        vm.startPrank(alice);
        strategy.prefund(alice, address(token), FEE);
        manager.createCommitment(_params());

        // Credit now covers nothing further — the first binding consumed it all.
        vm.expectRevert(abi.encodeWithSelector(FlatFeeAtCreate.FeeNotFunded.selector, FEE, 0));
        manager.createCommitment(_params());

        strategy.prefund(alice, address(token), FEE);
        manager.createCommitment(_params());
        vm.stopPrank();
    }

    function test_claim_paysCounterpartyOnce() public {
        vm.startPrank(alice);
        strategy.prefund(alice, address(token), FEE);
        uint256 id = manager.createCommitment(_params());
        vm.stopPrank();

        assertEq(manager.pending(id, address(strategy), ""), FEE);

        // Self-custody payout: DistributionPaid is emitted by the strategy (ERC §D.7).
        vm.expectEmit(true, true, true, true, address(strategy));
        emit ICM.DistributionPaid(address(strategy), bob, address(token), FEE, id, bytes32(0));
        vm.prank(bob);
        manager.claim(id, address(strategy), "");

        assertEq(token.balanceOf(bob), FEE);
        assertEq(manager.pending(id, address(strategy), ""), 0);

        vm.prank(bob);
        vm.expectRevert(StrategyBase.NothingToClaim.selector);
        manager.claim(id, address(strategy), "");
    }

    function test_claim_survivesClose_andOnlyCounterparty() public {
        vm.startPrank(alice);
        strategy.prefund(alice, address(token), FEE);
        uint256 id = manager.createCommitment(_params());
        vm.stopPrank();

        vm.prank(alice);
        vm.expectRevert(StrategyBase.NotAuthorized.selector);
        manager.claim(id, address(strategy), "");

        // The fee was earned at creation: a forfeit doesn't void it.
        vm.prank(arbiter);
        manager.initiateForfeit(id, 5000);
        vm.warp(block.timestamp + 1 days);
        manager.executeForfeit(id);

        vm.prank(bob);
        manager.claim(id, address(strategy), "");
        assertEq(token.balanceOf(bob), FEE);
    }

    /// @dev Regression for issue #47 (S1): a front-runner must not be able to consume someone
    ///      else's prefund. Alice prefunds her own creation fee; Bob front-runs with a 1-wei
    ///      self-arbiter/self-counterparty commitment whose params encode Alice's full amount.
    ///      With committer-attributed credit, Bob's create reverts (he has no credit), Bob's
    ///      counterparty has nothing to claim, and Alice's own create still succeeds.
    function test_frontRun_cannotConsumeOthersCredit() public {
        // Alice prefunds, intending to create in a later tx.
        vm.prank(alice);
        strategy.prefund(alice, address(token), FEE);

        // Bob front-runs: minimal commitment, himself as arbiter + counterparty, fee params
        // sized to Alice's entire prefund.
        token.mint(bob, 1e18);
        vm.startPrank(bob);
        token.approve(address(manager), type(uint256).max);
        manager.deposit(address(token), 1e18);
        ICM.CommitmentParams memory p = _params();
        p.arbiter = bob;
        p.counterparty = bob;
        p.amount = 1;
        vm.expectRevert(abi.encodeWithSelector(FlatFeeAtCreate.FeeNotFunded.selector, FEE, 0));
        manager.createCommitment(p);
        vm.stopPrank();

        // Alice's credit is intact and her own create succeeds.
        assertEq(strategy.creditOf(alice, address(token)), FEE);
        vm.prank(alice);
        uint256 id = manager.createCommitment(_params());

        // The fee is claimable only by Alice's counterparty.
        vm.prank(bob);
        manager.claim(id, address(strategy), "");
        assertEq(token.balanceOf(bob), FEE);
    }

    /// @dev Regression for issue #47 (S1): overfunded credit must be recoverable, and refunds
    ///      must never touch already-allocated (earned) fee obligations.
    function test_refundUnallocated_recoversOverfunding() public {
        vm.startPrank(alice);
        strategy.prefund(alice, address(token), 3 * FEE);
        uint256 id = manager.createCommitment(_params()); // consumes FEE of credit
        assertEq(strategy.creditOf(alice, address(token)), 2 * FEE);

        // Cannot refund more than unconsumed credit — the allocated fee is out of reach.
        vm.expectRevert(abi.encodeWithSelector(FlatFeeAtCreate.InsufficientCredit.selector, 3 * FEE, 2 * FEE));
        strategy.refundUnallocated(address(token), 3 * FEE);

        uint256 before = token.balanceOf(alice);
        strategy.refundUnallocated(address(token), 2 * FEE);
        vm.stopPrank();

        assertEq(token.balanceOf(alice), before + 2 * FEE);
        assertEq(strategy.creditOf(alice, address(token)), 0);

        // The earned fee remains fully claimable after the refund.
        vm.prank(bob);
        manager.claim(id, address(strategy), "");
        assertEq(token.balanceOf(bob), FEE);
        assertEq(token.balanceOf(address(strategy)), 0);
    }

    /// @dev Sponsored prefund: credit belongs to the named committer, not the funder.
    function test_prefund_sponsorGiftsCreditToCommitter() public {
        token.mint(bob, FEE);
        vm.startPrank(bob);
        token.approve(address(strategy), FEE);
        strategy.prefund(alice, address(token), FEE);

        // The sponsor holds no credit and cannot refund the gift.
        vm.expectRevert(abi.encodeWithSelector(FlatFeeAtCreate.InsufficientCredit.selector, FEE, 0));
        strategy.refundUnallocated(address(token), FEE);
        vm.stopPrank();

        assertEq(strategy.creditOf(alice, address(token)), FEE);
        vm.prank(alice);
        manager.createCommitment(_params());
        assertEq(strategy.creditOf(alice, address(token)), 0);
    }

    /// @dev Measured-delta rule (ERC §A.2, same as `manager.deposit`): a fee-on-transfer token
    ///      must credit what actually arrived, or Σcredit + allocated would exceed the
    ///      strategy's balance and the last refunder/claimant would be short-changed.
    function test_prefund_feeOnTransfer_creditsMeasuredDelta() public {
        FeeOnTransferERC20 fot = new FeeOnTransferERC20(100); // 1% skim
        fot.mint(alice, 100e18);
        vm.startPrank(alice);
        fot.approve(address(strategy), type(uint256).max);
        strategy.prefund(alice, address(fot), 100e18);
        vm.stopPrank();

        assertEq(strategy.creditOf(alice, address(fot)), 99e18, "credited measured delta");
        assertEq(fot.balanceOf(address(strategy)), 99e18, "solvency: balance covers credit");
    }

    function test_prefund_zeroChecks() public {
        vm.startPrank(alice);
        vm.expectRevert(StrategyBase.ZeroAmount.selector);
        strategy.prefund(alice, address(token), 0);
        vm.expectRevert(FlatFeeAtCreate.ZeroAddress.selector);
        strategy.prefund(address(0), address(token), FEE);
        vm.expectRevert(StrategyBase.ZeroAmount.selector);
        strategy.refundUnallocated(address(token), 0);
        vm.stopPrank();
    }
}
