// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import "forge-std/Test.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

import {CommitmentManager} from "src/core/manager/CommitmentManager.sol";
import {ManagerTestBase} from "../helpers/ManagerTestBase.sol";
import {ICommitmentManager as ICM} from "src/core/interfaces/ICommitmentManager.sol";
import {FeeOnTransferERC20} from "../helpers/Mocks.sol";

/// @dev Malicious token that re-enters a nonReentrant manager entry point during its `transferFrom`
///      (the createAndFund deposit pull). Used to prove the reentrancy guard is held across the pull.
contract ReentrantToken is ERC20 {
    CommitmentManager public manager;
    bool public attack;

    constructor() ERC20("Re", "RE") {}

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }

    function setManager(CommitmentManager m) external {
        manager = m;
    }

    function setAttack(bool v) external {
        attack = v;
    }

    function transferFrom(address from, address to, uint256 amount) public override returns (bool) {
        if (attack) {
            attack = false;
            // Re-enter a nonReentrant surface while createAndFund holds the transient lock. The
            // guard fires in the modifier, BEFORE any body check (so it is not a ZeroAmount revert).
            manager.withdraw(address(this), 0);
        }
        return super.transferFrom(from, to, amount);
    }
}

/// @title CreateAndFundTest
/// @notice Behaviour of the single-tx `createAndFund` (deposit + create): surplus stays free, exact
///         amount, shortfall covered by prior free balance, revert-before-pull on bad params,
///         fee-on-transfer measured delta, single CommitmentCreated emit, and the reentrancy guard.
contract CreateAndFundTest is ManagerTestBase {
    address internal alice = makeAddr("alice"); // committer
    address internal arbiter = makeAddr("arbiter");
    address internal bob = makeAddr("bob"); // counterparty

    function setUp() public override {
        super.setUp();
        token.mint(alice, 1_000e18);
        vm.prank(alice);
        token.approve(address(manager), type(uint256).max);
    }

    function _params(uint256 amount) internal view returns (ICM.CommitmentParams memory) {
        return _baseParams(arbiter, bob, amount, 5000);
    }

    function _partitionHolds(address t) internal view {
        (uint256 free, uint256 enc, uint256 esc, uint256 mp) = manager.ledgerTotals(t);
        assertEq(free + enc + esc + mp, ERC20(t).balanceOf(address(manager)), "INV-1 partition");
    }

    // ---- Surplus stays free ----

    function test_createAndFund_surplusStaysWithdrawable() public {
        vm.prank(alice);
        uint256 id = manager.createAndFund(150e18, _params(100e18));

        assertEq(id, 1, "INV-10: first id is 1");
        assertEq(manager.encumberedBalance(address(token), alice), 100e18, "amount encumbered");
        assertEq(manager.freeBalance(address(token), alice), 50e18, "surplus stays free");

        ICM.Commitment memory c = manager.getCommitment(id);
        assertEq(c.amount, 100e18);
        assertEq(c.committer, alice);
        _partitionHolds(address(token));

        // Surplus is instantly withdrawable.
        vm.prank(alice);
        manager.withdraw(address(token), 50e18);
        assertEq(manager.freeBalance(address(token), alice), 0);
    }

    // ---- Exact amount ----

    function test_createAndFund_exactAmount() public {
        vm.prank(alice);
        uint256 id = manager.createAndFund(100e18, _params(100e18));

        assertEq(manager.encumberedBalance(address(token), alice), 100e18);
        assertEq(manager.freeBalance(address(token), alice), 0, "no surplus");
        assertEq(manager.getCommitment(id).amount, 100e18);
        _partitionHolds(address(token));
    }

    // ---- Shortfall covered by prior free balance ----

    function test_createAndFund_insufficientDepositWithPriorFreeSucceeds() public {
        vm.startPrank(alice);
        manager.deposit(address(token), 40e18); // prior free
        // depositAmount (60) < params.amount (100) — covered by the 40 prior free + 60 deposit.
        uint256 id = manager.createAndFund(60e18, _params(100e18));
        vm.stopPrank();

        assertEq(manager.encumberedBalance(address(token), alice), 100e18);
        assertEq(manager.freeBalance(address(token), alice), 0);
        assertEq(manager.getCommitment(id).amount, 100e18);
        _partitionHolds(address(token));
    }

    function test_createAndFund_insufficientDepositNoPriorFreeReverts() public {
        // depositAmount 60 credits free, encumber wants 100 => InsufficientFreeBalance(100, 60).
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(ICM.InsufficientFreeBalance.selector, 100e18, 60e18));
        manager.createAndFund(60e18, _params(100e18));

        // Whole tx reverted: nothing moved.
        assertEq(token.balanceOf(address(manager)), 0, "no residual custody");
        assertEq(token.balanceOf(alice), 1_000e18, "committer whole");
        assertEq(manager.freeBalance(address(token), alice), 0);
    }

    // ---- Bad params revert BEFORE the pull ----

    function test_createAndFund_badParamsRevertBeforePull() public {
        ICM.CommitmentParams memory p = _params(100e18);
        p.maxPenaltyBps = 20_000; // invalid (> 10_000) — validation must fail before any token pull.

        vm.prank(alice);
        vm.expectRevert(ICM.PenaltyExceedsMax.selector);
        manager.createAndFund(100e18, p);

        // Revert-before-pull: no tokens ever left the committer.
        assertEq(token.balanceOf(address(manager)), 0, "no pull on validation failure");
        assertEq(token.balanceOf(alice), 1_000e18, "committer balance untouched");
    }

    function test_createAndFund_zeroCounterpartyRevertBeforePull() public {
        ICM.CommitmentParams memory p = _params(100e18);
        p.counterparty = address(0);

        vm.prank(alice);
        vm.expectRevert(ICM.ZeroCounterparty.selector);
        manager.createAndFund(100e18, p);
        assertEq(token.balanceOf(address(manager)), 0, "no pull before validation");
    }

    // ---- Zero deposit degenerates to a plain create ----

    function test_createAndFund_zeroDepositDegeneratesToCreate() public {
        vm.startPrank(alice);
        manager.deposit(address(token), 100e18);
        uint256 walletBefore = token.balanceOf(alice);
        uint256 id = manager.createAndFund(0, _params(100e18)); // no pull
        vm.stopPrank();

        assertEq(manager.encumberedBalance(address(token), alice), 100e18);
        assertEq(token.balanceOf(alice), walletBefore, "zero deposit performs no token pull");
        assertEq(manager.getCommitment(id).amount, 100e18);
        _partitionHolds(address(token));
    }

    // ---- Fee-on-transfer measured delta ----

    function test_createAndFund_feeOnTransferMeasuredDelta() public {
        FeeOnTransferERC20 fee = new FeeOnTransferERC20(100); // 1% skim
        fee.mint(alice, 1_000e18);
        vm.startPrank(alice);
        fee.approve(address(manager), type(uint256).max);

        // Pull 100 => manager receives 99 (measured). Encumber exactly the 99 received.
        ICM.CommitmentParams memory p = _params(99e18);
        p.token = address(fee);
        uint256 id = manager.createAndFund(100e18, p);
        vm.stopPrank();

        assertEq(manager.encumberedBalance(address(fee), alice), 99e18, "encumbered = measured receipt");
        assertEq(manager.freeBalance(address(fee), alice), 0);
        assertEq(manager.getCommitment(id).amount, 99e18);
        _partitionHolds(address(fee));
    }

    // ---- Single CommitmentCreated emitted in one tx ----

    function test_createAndFund_emitsCommitmentCreatedOnce() public {
        vm.expectEmit(true, true, true, true, address(manager));
        emit ICM.CommitmentCreated(
            1, alice, arbiter, bob, address(token), address(adapter), 100e18, 5000, WINDOW, 0, "", bytes32(0)
        );
        vm.prank(alice);
        uint256 id = manager.createAndFund(120e18, _params(100e18));
        assertEq(id, 1);
    }

    // ---- Reentrancy guard held across the deposit pull ----

    function test_createAndFund_reentrancyGuardHeld() public {
        ReentrantToken rt = new ReentrantToken();
        rt.setManager(manager);
        rt.mint(alice, 1_000e18);
        vm.prank(alice);
        rt.approve(address(manager), type(uint256).max);
        rt.setAttack(true);

        ICM.CommitmentParams memory p = _params(50e18);
        p.token = address(rt);

        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSignature("ReentrancyGuardReentrantCall()"));
        manager.createAndFund(100e18, p);
    }
}
