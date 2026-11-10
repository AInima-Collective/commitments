// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import {IAccessControl} from "@openzeppelin/contracts/access/IAccessControl.sol";
import {ERC1967Proxy} from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";

import {OperatorRegistry} from "src/extensions/services/operator-registry/OperatorRegistry.sol";
import {IOperatorRegistry} from "src/extensions/services/interfaces/IOperatorRegistry.sol";
import {OperatorCommissionCoupon} from "src/extensions/services/distributions/OperatorCommissionCoupon.sol";
import {ICommitmentManager as ICM} from "src/core/interfaces/ICommitmentManager.sol";
import {StrategyBinding} from "src/core/interfaces/IDistributionStrategy.sol";
import {NoopStrategy} from "../manager/mocks/StrategyMocks.sol";
import {ManagerTestBase} from "../helpers/ManagerTestBase.sol";

/// @title OperatorCommissionTest
/// @notice Covers the operator-commission feature (issue #60): the registry's admin-curated
///         safe-strategy allow-list and the `OperatorCommissionCoupon` self-custody strategy that
///         routes a delegator's commission to the operator.
contract OperatorCommissionTest is ManagerTestBase {
    OperatorRegistry internal registry;
    OperatorCommissionCoupon internal coupon;
    NoopStrategy internal noop;

    address internal operator1 = makeAddr("operator1");
    address internal staker1 = makeAddr("staker1");
    address internal trustedArbiter = makeAddr("trustedArbiter");
    address internal nonAdmin = makeAddr("nonAdmin");

    uint256 internal constant DEPOSIT = 1000e18;
    uint256 internal constant MIN_STAKE = 10e18;
    uint16 internal constant FLOOR = 5000;

    function setUp() public override {
        super.setUp();

        OperatorRegistry regImpl = new OperatorRegistry();
        registry = OperatorRegistry(
            address(
                new ERC1967Proxy(
                    address(regImpl),
                    abi.encodeCall(
                        OperatorRegistry.initialize,
                        (address(manager), MIN_STAKE, uint256(1024), admin, trustedArbiter, FLOOR, address(token))
                    )
                )
            )
        );
        vm.prank(admin);
        manager.setOperatorRegistry(address(registry));

        coupon = new OperatorCommissionCoupon(address(manager), address(registry));
        noop = new NoopStrategy();

        _deposit(operator1, DEPOSIT);
        _deposit(staker1, DEPOSIT);
    }

    // ---- Helpers ------------------------------------------------------------

    function _registerOperator1() internal returns (uint256 selfCid) {
        selfCid = _createAs(operator1, _baseParams(trustedArbiter, address(registry), 100e18, 10_000));
        vm.prank(operator1);
        registry.register(selfCid);
    }

    /// @dev Delegation commitment to the registry with the commission coupon bound.
    function _createDelegationWithCoupon(address committer, uint256 amount) internal returns (uint256 commitmentId) {
        ICM.CommitmentParams memory p = _baseParams(trustedArbiter, address(registry), amount, 10_000);
        p.strategies = new StrategyBinding[](1);
        p.strategies[0] = StrategyBinding(address(coupon), "");
        commitmentId = _createAs(committer, p);
    }

    /// @dev Give `who` `amount` of extra wallet balance and approve the coupon to pull it.
    function _fundWallet(address who, uint256 amount) internal {
        token.mint(who, amount);
        vm.prank(who);
        token.approve(address(coupon), amount);
    }

    // =========================================================================
    // Registry allow-list
    // =========================================================================

    function testSetStrategyAllowed_adminToggles() public {
        assertFalse(registry.isStrategyAllowed(address(coupon)), "not allowed by default");

        vm.expectEmit(true, false, false, true, address(registry));
        emit IOperatorRegistry.StrategyAllowlistUpdated(address(coupon), true);
        vm.prank(admin);
        registry.setStrategyAllowed(address(coupon), true);
        assertTrue(registry.isStrategyAllowed(address(coupon)));

        vm.prank(admin);
        registry.setStrategyAllowed(address(coupon), false);
        assertFalse(registry.isStrategyAllowed(address(coupon)), "removable");
    }

    function testSetStrategyAllowed_revertsNonAdmin() public {
        vm.prank(nonAdmin);
        vm.expectRevert(
            abi.encodeWithSelector(IAccessControl.AccessControlUnauthorizedAccount.selector, nonAdmin, bytes32(0))
        );
        registry.setStrategyAllowed(address(coupon), true);
    }

    function testSetStrategyAllowed_revertsZero() public {
        vm.prank(admin);
        vm.expectRevert(IOperatorRegistry.ZeroStrategy.selector);
        registry.setStrategyAllowed(address(0), true);
    }

    function testDelegate_revertsUnlistedStrategy() public {
        _registerOperator1();
        // A bound-but-unlisted strategy still reverts (default reject-all preserved).
        ICM.CommitmentParams memory p = _baseParams(trustedArbiter, address(registry), 50e18, 10_000);
        p.strategies = new StrategyBinding[](1);
        p.strategies[0] = StrategyBinding(address(noop), "");
        uint256 delegCid = _createAs(staker1, p);

        vm.prank(staker1);
        vm.expectRevert(IOperatorRegistry.StrategiesNotAllowed.selector);
        registry.delegate(operator1, delegCid);
    }

    function testDelegate_acceptsAllowlistedStrategy() public {
        _registerOperator1();
        vm.prank(admin);
        registry.setStrategyAllowed(address(coupon), true);

        uint256 delegCid = _createDelegationWithCoupon(staker1, 50e18);
        vm.prank(staker1);
        registry.delegate(operator1, delegCid);

        assertEq(registry.getOperator(operator1).totalDelegatedStake, 150e18, "delegation credited with coupon bound");
        assertEq(registry.operatorForCommitment(delegCid), operator1, "routing resolvable");
    }

    function testDelegate_revertsAfterStrategyRemoved() public {
        _registerOperator1();
        vm.prank(admin);
        registry.setStrategyAllowed(address(coupon), true);
        vm.prank(admin);
        registry.setStrategyAllowed(address(coupon), false);

        uint256 delegCid = _createDelegationWithCoupon(staker1, 50e18);
        vm.prank(staker1);
        vm.expectRevert(IOperatorRegistry.StrategiesNotAllowed.selector);
        registry.delegate(operator1, delegCid);
    }

    // =========================================================================
    // Commission strategy — end to end
    // =========================================================================

    function testCommission_endToEnd_operatorPaid() public {
        _registerOperator1();
        vm.prank(admin);
        registry.setStrategyAllowed(address(coupon), true);

        uint256 delegCid = _createDelegationWithCoupon(staker1, 50e18);

        // Delegator funds a 5e18 commission and delegates.
        _fundWallet(staker1, 5e18);
        vm.prank(staker1);
        coupon.fundCommission(delegCid, 5e18);

        vm.prank(staker1);
        registry.delegate(operator1, delegCid);

        // Operator collects the commission through the manager claim path.
        vm.expectEmit(true, true, true, true);
        emit ICM.DistributionPaid(address(coupon), operator1, address(token), 5e18, delegCid, bytes32(0));
        vm.prank(operator1);
        manager.claim(delegCid, address(coupon), "");

        assertEq(token.balanceOf(operator1), 5e18, "operator paid commission");
        assertEq(coupon.claimableOf(delegCid), 0, "nothing left to claim");

        // Non-draining: the delegated backing (and thus operator stake) is untouched.
        assertEq(manager.getCommitment(delegCid).amount, 50e18, "commission never drains the stake");
        assertEq(registry.getOperator(operator1).totalDelegatedStake, 150e18, "no phantom stake shift");
    }

    function testCommission_fundGuards() public {
        vm.prank(admin);
        registry.setStrategyAllowed(address(coupon), true);
        uint256 delegCid = _createDelegationWithCoupon(staker1, 50e18);

        // Unbound id.
        _fundWallet(staker1, 5e18);
        vm.prank(staker1);
        vm.expectRevert(OperatorCommissionCoupon.NotBound.selector);
        coupon.fundCommission(999, 1e18);

        // Non-committer cannot fund.
        _fundWallet(operator1, 5e18);
        vm.prank(operator1);
        vm.expectRevert(OperatorCommissionCoupon.NotAuthorized.selector);
        coupon.fundCommission(delegCid, 1e18);

        // Zero amount.
        vm.prank(staker1);
        vm.expectRevert(OperatorCommissionCoupon.ZeroAmount.selector);
        coupon.fundCommission(delegCid, 0);
    }

    function testCommission_claimAuth() public {
        _registerOperator1();
        vm.prank(admin);
        registry.setStrategyAllowed(address(coupon), true);
        uint256 delegCid = _createDelegationWithCoupon(staker1, 50e18);
        _fundWallet(staker1, 5e18);
        vm.prank(staker1);
        coupon.fundCommission(delegCid, 5e18);

        // Not delegated yet → no operator to authorize.
        vm.prank(operator1);
        vm.expectRevert(OperatorCommissionCoupon.NotDelegated.selector);
        manager.claim(delegCid, address(coupon), "");

        vm.prank(staker1);
        registry.delegate(operator1, delegCid);

        // A stranger (even the delegator) cannot claim the operator's commission.
        vm.prank(staker1);
        vm.expectRevert(OperatorCommissionCoupon.NotAuthorized.selector);
        manager.claim(delegCid, address(coupon), "");
    }

    function testCommission_survivesClose_viaLatch() public {
        _registerOperator1();
        vm.prank(admin);
        registry.setStrategyAllowed(address(coupon), true);
        uint256 delegCid = _createDelegationWithCoupon(staker1, 50e18);
        _fundWallet(staker1, 5e18);
        vm.prank(staker1);
        coupon.fundCommission(delegCid, 5e18);
        vm.prank(staker1);
        registry.delegate(operator1, delegCid);

        // Operator latches while the delegation is live, then the delegation is released.
        vm.expectEmit(true, true, false, false, address(coupon));
        emit OperatorCommissionCoupon.OperatorLatched(delegCid, operator1);
        coupon.latchOperator(delegCid);

        vm.prank(trustedArbiter);
        manager.releaseCommitment(delegCid);
        assertEq(registry.operatorForCommitment(delegCid), address(0), "registry cleared routing at close");

        // The latched operator can still collect after close.
        vm.prank(operator1);
        manager.claim(delegCid, address(coupon), "");
        assertEq(token.balanceOf(operator1), 5e18, "latched claim survives close");
    }

    function testCommission_refundBeforeDelegation() public {
        vm.prank(admin);
        registry.setStrategyAllowed(address(coupon), true);
        uint256 delegCid = _createDelegationWithCoupon(staker1, 50e18);
        _fundWallet(staker1, 5e18);
        vm.prank(staker1);
        coupon.fundCommission(delegCid, 5e18);

        // Never delegated: the delegator can reclaim the unlatched commission.
        uint256 before = token.balanceOf(staker1);
        vm.expectEmit(true, true, false, true, address(coupon));
        emit OperatorCommissionCoupon.CommissionRefunded(delegCid, staker1, 5e18);
        vm.prank(staker1);
        coupon.refundCommission(delegCid);
        assertEq(token.balanceOf(staker1) - before, 5e18, "commission refunded");
    }

    function testCommission_refundBlockedAfterLatch() public {
        _registerOperator1();
        vm.prank(admin);
        registry.setStrategyAllowed(address(coupon), true);
        uint256 delegCid = _createDelegationWithCoupon(staker1, 50e18);
        _fundWallet(staker1, 5e18);

        // Funding after delegation auto-latches the operator.
        vm.prank(staker1);
        registry.delegate(operator1, delegCid);
        vm.prank(staker1);
        coupon.fundCommission(delegCid, 5e18);

        (,,,, address latched,) = coupon.couponOf(delegCid);
        assertEq(latched, operator1, "auto-latched on fund after delegation");

        // The delegator cannot claw back an earned commission.
        vm.prank(staker1);
        vm.expectRevert(OperatorCommissionCoupon.Delegated.selector);
        coupon.refundCommission(delegCid);
    }

    function testCommission_refundBlockedWhileDelegatedEvenIfUnlatched() public {
        _registerOperator1();
        vm.prank(admin);
        registry.setStrategyAllowed(address(coupon), true);
        uint256 delegCid = _createDelegationWithCoupon(staker1, 50e18);

        // Fund BEFORE delegating (no latch), then delegate.
        _fundWallet(staker1, 5e18);
        vm.prank(staker1);
        coupon.fundCommission(delegCid, 5e18);
        vm.prank(staker1);
        registry.delegate(operator1, delegCid);

        // Live delegation blocks refund even though no latch was recorded yet.
        vm.prank(staker1);
        vm.expectRevert(OperatorCommissionCoupon.Delegated.selector);
        coupon.refundCommission(delegCid);
    }
}
