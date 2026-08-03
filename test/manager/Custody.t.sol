// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import "forge-std/Test.sol";
import {ERC1967Proxy} from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

import {CommitmentManager} from "src/core/manager/CommitmentManager.sol";
import {ICommitmentManager as ICM} from "src/core/interfaces/ICommitmentManager.sol";
import {MockERC20} from "../helpers/MockERC20.sol";
import {MockERC20Permit} from "../helpers/MockERC20Permit.sol";

/// @dev Fee-on-transfer mock: skims `feeBps` on every transfer. Used to prove the
///      measured-delta rule keeps the ledger honest (ERC §A.2).
contract FeeOnTransferERC20 is ERC20 {
    uint16 public feeBps;

    constructor(uint16 feeBps_) ERC20("Fee", "FEE") {
        feeBps = feeBps_;
    }

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }

    function _update(address from, address to, uint256 value) internal override {
        if (from != address(0) && to != address(0)) {
            uint256 fee = (value * feeBps) / 10_000;
            super._update(from, address(0xdead), fee);
            super._update(from, to, value - fee);
        } else {
            super._update(from, to, value);
        }
    }
}

contract CustodyTest is Test {
    CommitmentManager internal manager;
    MockERC20 internal token;

    address internal admin = makeAddr("admin");
    address internal alice = makeAddr("alice");
    address internal bob = makeAddr("bob");
    address internal strategy = makeAddr("strategy");
    address internal pauser = makeAddr("pauser");
    address internal unpauser = makeAddr("unpauser");

    uint64 internal constant UNBONDING = 7 days;

    function setUp() public {
        CommitmentManager impl = new CommitmentManager();
        manager = CommitmentManager(
            address(
                new ERC1967Proxy(
                    address(impl), abi.encodeCall(CommitmentManager.initialize, (admin, UNBONDING, 14 days))
                )
            )
        );
        token = new MockERC20("Backing", "BCK", 18);

        token.mint(alice, 1_000e18);
        token.mint(bob, 1_000e18);
        vm.prank(alice);
        token.approve(address(manager), type(uint256).max);
        vm.prank(bob);
        token.approve(address(manager), type(uint256).max);

        vm.startPrank(admin);
        manager.grantRole(manager.PAUSER_ROLE(), pauser);
        manager.grantRole(manager.UNPAUSER_ROLE(), unpauser);
        vm.stopPrank();
    }

    function _partitionHolds() internal view {
        (uint256 free, uint256 enc, uint256 esc) = manager.ledgerTotals(address(token));
        assertEq(free + enc + esc, token.balanceOf(address(manager)), "INV-1 partition");
    }

    // =========================================================================
    // Initialization
    // =========================================================================

    function test_initialize_rejectsZeroAdminAndZeroUnbonding() public {
        CommitmentManager impl = new CommitmentManager();
        vm.expectRevert(ICM.ZeroAddress.selector);
        new ERC1967Proxy(address(impl), abi.encodeCall(CommitmentManager.initialize, (address(0), UNBONDING, 14 days)));
        vm.expectRevert(ICM.ZeroAmount.selector);
        new ERC1967Proxy(address(impl), abi.encodeCall(CommitmentManager.initialize, (admin, 0, 14 days)));
    }

    function test_initialize_setsConfigDefaults() public view {
        assertEq(manager.unbondingPeriod(), UNBONDING);
        assertEq(manager.MIN_CHALLENGE_WINDOW(), 86_400);
        assertEq(manager.hookGasCap(), 500_000);
        assertFalse(manager.forfeiturePaused());
    }

    // =========================================================================
    // Deposit
    // =========================================================================

    function test_deposit_creditsFreeBalance() public {
        vm.expectEmit(true, true, false, true);
        emit ICM.Deposited(alice, address(token), 100e18);
        vm.prank(alice);
        manager.deposit(address(token), 100e18);

        assertEq(manager.freeBalance(address(token), alice), 100e18);
        assertEq(token.balanceOf(address(manager)), 100e18);
        _partitionHolds();
    }

    function test_deposit_zeroAmountReverts() public {
        vm.prank(alice);
        vm.expectRevert(ICM.ZeroAmount.selector);
        manager.deposit(address(token), 0);
    }

    function test_deposit_feeOnTransfer_creditsMeasuredDelta() public {
        FeeOnTransferERC20 fee = new FeeOnTransferERC20(100); // 1% skim
        fee.mint(alice, 100e18);
        vm.startPrank(alice);
        fee.approve(address(manager), type(uint256).max);
        manager.deposit(address(fee), 100e18);
        vm.stopPrank();

        // 1% skimmed in transit: the ledger credits what actually arrived.
        assertEq(manager.freeBalance(address(fee), alice), 99e18, "credited measured delta");
        (uint256 free,,) = manager.ledgerTotals(address(fee));
        assertEq(free, 99e18);
        assertEq(fee.balanceOf(address(manager)), 99e18, "INV-1 holds for fee token");
    }

    // =========================================================================
    // depositFor (relayer onboarding, #60)
    // =========================================================================

    function test_depositFor_pullsFromPayerCreditsBeneficiary() public {
        // bob pays; alice's free balance is credited.
        vm.expectEmit(true, true, false, true);
        emit ICM.Deposited(alice, address(token), 100e18);
        vm.prank(bob);
        manager.depositFor(address(token), 100e18, alice);

        assertEq(manager.freeBalance(address(token), alice), 100e18, "beneficiary credited");
        assertEq(manager.freeBalance(address(token), bob), 0, "payer not credited");
        assertEq(token.balanceOf(bob), 900e18, "payer's tokens pulled");
        assertEq(token.balanceOf(address(manager)), 100e18);
        _partitionHolds();
    }

    function test_depositFor_zeroBeneficiaryReverts() public {
        vm.prank(bob);
        vm.expectRevert(ICM.ZeroAddress.selector);
        manager.depositFor(address(token), 100e18, address(0));
    }

    function test_depositFor_zeroAmountReverts() public {
        vm.prank(bob);
        vm.expectRevert(ICM.ZeroAmount.selector);
        manager.depositFor(address(token), 0, alice);
    }

    function test_depositFor_feeOnTransfer_creditsMeasuredDelta() public {
        FeeOnTransferERC20 fee = new FeeOnTransferERC20(100); // 1% skim
        fee.mint(bob, 100e18);
        vm.startPrank(bob);
        fee.approve(address(manager), type(uint256).max);
        manager.depositFor(address(fee), 100e18, alice);
        vm.stopPrank();

        assertEq(manager.freeBalance(address(fee), alice), 99e18, "beneficiary credited measured delta");
        assertEq(fee.balanceOf(address(manager)), 99e18, "INV-1 holds for fee token");
    }

    // =========================================================================
    // depositWithPermit (ERC-2612, #60)
    // =========================================================================

    bytes32 internal constant PERMIT_TYPEHASH =
        keccak256("Permit(address owner,address spender,uint256 value,uint256 nonce,uint256 deadline)");

    function _permitSig(MockERC20Permit tkn, uint256 ownerKey, address owner, uint256 value, uint256 deadline)
        internal
        view
        returns (uint8 v, bytes32 r, bytes32 s)
    {
        bytes32 structHash =
            keccak256(abi.encode(PERMIT_TYPEHASH, owner, address(manager), value, tkn.nonces(owner), deadline));
        bytes32 digest = keccak256(abi.encodePacked("\x19\x01", tkn.DOMAIN_SEPARATOR(), structHash));
        (v, r, s) = vm.sign(ownerKey, digest);
    }

    function test_depositWithPermit_oneTx_noPriorApprove() public {
        (address owner, uint256 ownerKey) = makeAddrAndKey("permitOwner");
        MockERC20Permit ptoken = new MockERC20Permit("Permit Backing", "pBCK", 18);
        ptoken.mint(owner, 500e18);
        uint256 deadline = block.timestamp + 1 hours;

        (uint8 v, bytes32 r, bytes32 s) = _permitSig(ptoken, ownerKey, owner, 100e18, deadline);
        // No approve() beforehand — the permit sets the allowance in the same tx.
        vm.expectEmit(true, true, false, true);
        emit ICM.Deposited(owner, address(ptoken), 100e18);
        vm.prank(owner);
        manager.depositWithPermit(address(ptoken), 100e18, deadline, v, r, s);

        assertEq(manager.freeBalance(address(ptoken), owner), 100e18, "credited via permit");
        assertEq(ptoken.balanceOf(address(manager)), 100e18);
        assertEq(ptoken.allowance(owner, address(manager)), 0, "permit allowance fully consumed");
    }

    function test_depositWithPermit_toleratesFrontRunPermit() public {
        // A griefer submits the signed permit first (consuming the ERC-2612 nonce). The deposit
        // must still succeed because the allowance is already in place.
        (address owner, uint256 ownerKey) = makeAddrAndKey("permitOwner2");
        MockERC20Permit ptoken = new MockERC20Permit("Permit Backing", "pBCK", 18);
        ptoken.mint(owner, 500e18);
        uint256 deadline = block.timestamp + 1 hours;
        (uint8 v, bytes32 r, bytes32 s) = _permitSig(ptoken, ownerKey, owner, 100e18, deadline);

        // Front-run: anyone can land the permit.
        ptoken.permit(owner, address(manager), 100e18, deadline, v, r, s);

        // The same signature now reverts inside permit() (nonce consumed) — try/catch swallows it
        // and the deposit proceeds on the standing allowance.
        vm.prank(owner);
        manager.depositWithPermit(address(ptoken), 100e18, deadline, v, r, s);
        assertEq(manager.freeBalance(address(ptoken), owner), 100e18, "deposit survives front-run permit");
    }

    function test_depositWithPermit_zeroAmountReverts() public {
        (address owner, uint256 ownerKey) = makeAddrAndKey("permitOwner3");
        MockERC20Permit ptoken = new MockERC20Permit("Permit Backing", "pBCK", 18);
        uint256 deadline = block.timestamp + 1 hours;
        (uint8 v, bytes32 r, bytes32 s) = _permitSig(ptoken, ownerKey, owner, 0, deadline);
        vm.prank(owner);
        vm.expectRevert(ICM.ZeroAmount.selector);
        manager.depositWithPermit(address(ptoken), 0, deadline, v, r, s);
    }

    // =========================================================================
    // Withdraw
    // =========================================================================

    function test_withdraw_instant_noDelay() public {
        vm.startPrank(alice);
        manager.deposit(address(token), 100e18);
        manager.withdraw(address(token), 40e18); // same block, no queue, no warp
        vm.stopPrank();

        assertEq(manager.freeBalance(address(token), alice), 60e18);
        assertEq(token.balanceOf(alice), 940e18);
        _partitionHolds();
    }

    function test_withdraw_overFreeBalanceReverts() public {
        vm.startPrank(alice);
        manager.deposit(address(token), 100e18);
        vm.expectRevert(abi.encodeWithSelector(ICM.InsufficientFreeBalance.selector, 101e18, 100e18));
        manager.withdraw(address(token), 101e18);
        vm.stopPrank();
    }

    function test_withdraw_emitsEvent() public {
        vm.startPrank(alice);
        manager.deposit(address(token), 100e18);
        vm.expectEmit(true, true, false, true);
        emit ICM.Withdrawn(alice, address(token), 100e18);
        manager.withdraw(address(token), 100e18);
        vm.stopPrank();
    }

    // =========================================================================
    // fundStrategy
    // =========================================================================

    function test_fundStrategy_creditsEscrow() public {
        vm.expectEmit(true, true, true, true);
        emit ICM.StrategyFunded(alice, strategy, address(token), 50e18);
        vm.prank(alice);
        manager.fundStrategy(strategy, address(token), 50e18);

        assertEq(manager.escrowOf(address(token), strategy), 50e18);
        (,, uint256 esc) = manager.ledgerTotals(address(token));
        assertEq(esc, 50e18);
        _partitionHolds();
    }

    function test_fundStrategy_zeroChecks() public {
        vm.startPrank(alice);
        vm.expectRevert(ICM.ZeroAddress.selector);
        manager.fundStrategy(address(0), address(token), 1);
        vm.expectRevert(ICM.ZeroAmount.selector);
        manager.fundStrategy(strategy, address(token), 0);
        vm.stopPrank();
    }

    function test_fundStrategy_isolatedPerStrategy() public {
        address strategy2 = makeAddr("strategy2");
        vm.startPrank(alice);
        manager.fundStrategy(strategy, address(token), 30e18);
        manager.fundStrategy(strategy2, address(token), 20e18);
        vm.stopPrank();

        assertEq(manager.escrowOf(address(token), strategy), 30e18);
        assertEq(manager.escrowOf(address(token), strategy2), 20e18);
        _partitionHolds();
    }

    // =========================================================================
    // Circuit breaker
    // =========================================================================

    function test_pause_roles() public {
        vm.prank(pauser);
        manager.pauseForfeiture();
        assertTrue(manager.forfeiturePaused());

        // Pauser cannot unpause (role separation).
        vm.prank(pauser);
        vm.expectRevert();
        manager.unpauseForfeiture();

        vm.prank(unpauser);
        manager.unpauseForfeiture();
        assertFalse(manager.forfeiturePaused());
    }

    function test_pause_unauthorizedReverts() public {
        vm.prank(alice);
        vm.expectRevert();
        manager.pauseForfeiture();
    }

    // =========================================================================
    // Admin config
    // =========================================================================

    function test_setUnbondingPeriod() public {
        vm.prank(admin);
        manager.setUnbondingPeriod(3 days);
        assertEq(manager.unbondingPeriod(), 3 days);

        vm.prank(admin);
        vm.expectRevert(ICM.ZeroAmount.selector);
        manager.setUnbondingPeriod(0);
    }

    function test_setMinChallengeWindow_acceptsProtocolFloor() public {
        vm.prank(admin);
        manager.setMinChallengeWindow(1 days);
        assertEq(manager.MIN_CHALLENGE_WINDOW(), 1 days);
    }

    function test_setMinChallengeWindow_acceptsValueAboveProtocolFloor() public {
        vm.prank(admin);
        manager.setMinChallengeWindow(2 days);
        assertEq(manager.MIN_CHALLENGE_WINDOW(), 2 days);
    }

    function test_setMinChallengeWindow_rejectsNonZeroValueBelowProtocolFloor() public {
        vm.prank(admin);
        vm.expectRevert(ICM.MinChallengeWindowBelowFloor.selector);
        manager.setMinChallengeWindow(86_399);
        assertEq(manager.MIN_CHALLENGE_WINDOW(), 1 days, "failed update leaves default active");
    }

    function test_setMinChallengeWindow_zeroRestoresLazyDefault() public {
        vm.prank(admin);
        manager.setMinChallengeWindow(2 days);
        vm.prank(admin);
        manager.setMinChallengeWindow(0);
        assertEq(manager.MIN_CHALLENGE_WINDOW(), 86_400, "0 restores default");
    }

    function test_setHookGasCap_floorEnforced() public {
        vm.prank(admin);
        manager.setHookGasCap(1_000_000);
        assertEq(manager.hookGasCap(), 1_000_000);

        vm.prank(admin);
        vm.expectRevert(ICM.ZeroAmount.selector);
        manager.setHookGasCap(499_999);

        vm.prank(admin);
        manager.setHookGasCap(0);
        assertEq(manager.hookGasCap(), 500_000, "0 restores default");
    }

    function test_adminSetters_unauthorizedRevert() public {
        vm.startPrank(alice);
        vm.expectRevert();
        manager.setUnbondingPeriod(1);
        vm.expectRevert();
        manager.setMinChallengeWindow(1);
        vm.expectRevert();
        manager.setHookGasCap(0);
        vm.expectRevert();
        manager.setOperatorRegistry(address(0));
        vm.stopPrank();
    }

    // =========================================================================
    // Fuzz: deposit/withdraw round-trips conserve the partition
    // =========================================================================

    function testFuzz_depositWithdrawRoundtrip(uint256 depositAmt, uint256 withdrawAmt) public {
        depositAmt = bound(depositAmt, 1, 1_000e18);
        withdrawAmt = bound(withdrawAmt, 1, depositAmt);

        vm.startPrank(alice);
        manager.deposit(address(token), depositAmt);
        manager.withdraw(address(token), withdrawAmt);
        vm.stopPrank();

        assertEq(manager.freeBalance(address(token), alice), depositAmt - withdrawAmt);
        _partitionHolds();
    }
}
