// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import "forge-std/Test.sol";
import {ERC1967Proxy} from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";

import {CommitmentManager} from "src/core/manager/CommitmentManager.sol";
import {ICommitmentManager as ICM} from "src/core/interfaces/ICommitmentManager.sol";
import {StrategyBinding} from "src/core/interfaces/IDistributionStrategy.sol";
import {PremiumScheduler} from "src/extensions/mutuals/PremiumScheduler.sol";
import {LinkedMutualPolicy} from "src/extensions/mutuals/LinkedMutualPolicy.sol";
import {ILinkedMutualPolicy} from "src/extensions/mutuals/interfaces/ILinkedMutualPolicy.sol";
import {OptimisticMutualArbiter} from "src/extensions/mutuals/OptimisticMutualArbiter.sol";
import {ClaimRouter} from "src/extensions/mutuals/ClaimRouter.sol";
import {MutualRegistry} from "src/extensions/mutuals/MutualRegistry.sol";
import {MockERC20} from "../helpers/MockERC20.sol";

/// @title PremiumPolicyTest
/// @notice Periphery pricing layer: PremiumScheduler (utilization-curve pricing + MCR cap + capture defense),
///         LinkedMutualPolicy (atomic bind/fund + cover bindings + standby), and the
///         OptimisticMutualArbiter cover-binding snapshot. Locks the periphery pricing properties as checked
///         assertions: pricing monotonicity, capacity-flight repricing, the MCR/leverage cap,
///         bindCover atomicity, expireBinding utilization decay, advisory-only snapshots
///         (premium-without-cover still settles), the standby fee routing through the existing
///         stream, and capture resistance.
contract PremiumPolicyTest is Test {
    CommitmentManager internal manager;
    PremiumScheduler internal scheduler;
    LinkedMutualPolicy internal policy;
    OptimisticMutualArbiter internal arbiter;
    ClaimRouter internal router;
    MockERC20 internal usdc;
    MockERC20 internal bondTok;

    address internal admin = makeAddr("admin");
    address internal committee = makeAddr("committee"); // arbiter owner
    address internal treasury = makeAddr("treasury");
    address internal pricingOwner = makeAddr("pricingOwner"); // scheduler owner (independent)
    address internal policyholder = makeAddr("policyholder");
    address internal proposer = makeAddr("proposer");
    address internal u1 = makeAddr("u1");
    address internal u2 = makeAddr("u2");
    address internal adapter = makeAddr("adapter");

    uint64 internal constant MUTUAL_WINDOW = 2 days;
    uint64 internal constant MEMBER_WINDOW = 1 days;
    uint64 internal constant YEAR = 365 days;
    uint256 internal constant MIN_BOND = 100e18;

    // Curve: base 2%/yr, slope1 10%/yr, slope2 50%/yr, kink 80%, leverage 5x.
    uint256 internal constant BASE = 0.02e18;
    uint256 internal constant SLOPE1 = 0.1e18;
    uint256 internal constant SLOPE2 = 0.5e18;
    uint256 internal constant KINK = 0.8e18;
    uint256 internal constant MAX_LEV = 50_000; // 5x

    function setUp() public {
        CommitmentManager impl = new CommitmentManager();
        manager = CommitmentManager(
            address(
                new ERC1967Proxy(address(impl), abi.encodeCall(CommitmentManager.initialize, (admin, 7 days, 14 days)))
            )
        );
        usdc = new MockERC20("USD Coin", "USDC", 18);
        bondTok = new MockERC20("Bond", "BOND", 18);

        scheduler = new PremiumScheduler(address(manager), pricingOwner);
        policy = new LinkedMutualPolicy(address(manager), address(scheduler));
        arbiter = new OptimisticMutualArbiter(address(manager), address(bondTok), MIN_BOND, treasury, committee);
        router = new ClaimRouter(address(manager), policyholder);

        vm.startPrank(pricingOwner);
        scheduler.setPolicy(address(policy));
        scheduler.setDefaultCurve(BASE, SLOPE1, SLOPE2, KINK, MAX_LEV);
        vm.stopPrank();
        vm.prank(committee);
        arbiter.setCoverPolicy(address(policy));

        // Underwriters deposit collateral.
        for (uint256 i; i < 2; i++) {
            address u = i == 0 ? u1 : u2;
            usdc.mint(u, 1_000_000e18);
            vm.startPrank(u);
            usdc.approve(address(manager), type(uint256).max);
            manager.deposit(address(usdc), 1_000_000e18);
            vm.stopPrank();
        }
        // Policyholder funds premium straight from its wallet.
        usdc.mint(policyholder, 1_000_000e18);
        vm.prank(policyholder);
        usdc.approve(address(policy), type(uint256).max);
        // Proposer bonds.
        bondTok.mint(proposer, 1_000e18);
        vm.prank(proposer);
        bondTok.approve(address(arbiter), type(uint256).max);
    }

    // ---------------------------------------------------------------------
    // Helpers
    // ---------------------------------------------------------------------

    function _mutual() internal returns (uint256 gid) {
        ICM.MutualParams memory p = ICM.MutualParams({
            arbiter: address(arbiter),
            numeraire: address(usdc),
            beneficiary: address(router),
            challengeWindow: MUTUAL_WINDOW,
            deallocationWindow: MUTUAL_WINDOW
        });
        gid = manager.createMutual(p);
        vm.prank(committee);
        arbiter.activate(gid);
    }

    function _join(uint256 gid, address who, uint256 amount) internal returns (uint256 cid) {
        ICM.CommitmentParams memory p;
        p.arbiter = address(arbiter);
        p.counterparty = address(router);
        p.token = address(usdc);
        p.adapter = adapter;
        p.amount = amount;
        p.maxPenaltyBps = 10_000; // E_i == amount == creditedValue
        p.challengeWindow = MEMBER_WINDOW;
        p.strategies = new StrategyBinding[](0);
        vm.prank(who);
        cid = manager.joinMutual(gid, p);
    }

    /// @dev A mutual with 200e18 of active cover (two equal underwriters).
    function _filledMutual() internal returns (uint256 gid, uint256 c1, uint256 c2) {
        gid = _mutual();
        c1 = _join(gid, u1, 100e18);
        c2 = _join(gid, u2, 100e18);
    }

    function _activeCover(uint256 gid) internal view returns (uint128 a) {
        (, a,,,,,,,) = manager.getMutualPremiumState(gid);
    }

    function _poolState(uint256 gid) internal view returns (uint128 rate, uint64 finish, uint256 pool) {
        (,,, rate,, finish,,, pool) = manager.getMutualPremiumState(gid);
    }

    function _bind(uint256 gid, uint256 notional, uint64 duration) internal returns (uint256 id) {
        vm.prank(policyholder);
        id = policy.bindCover(gid, notional, duration);
    }

    // ---------------------------------------------------------------------
    // Pricing: monotonicity, scaling, capacity flight
    // ---------------------------------------------------------------------

    function test_quote_baseRateAtZeroUtilization() public {
        (uint256 gid,,) = _filledMutual();
        // u == 0 => rate == base. premium = 100e18 * 0.02 * 1yr = 2e18.
        assertEq(scheduler.quote(gid, 100e18, YEAR), 2e18, "premium at u=0 == notional*base");
    }

    function test_quote_scalesWithNotionalAndDuration() public {
        (uint256 gid,,) = _filledMutual();
        uint256 q1 = scheduler.quote(gid, 100e18, YEAR);
        assertEq(scheduler.quote(gid, 200e18, YEAR), 2 * q1, "linear in notional");
        assertEq(scheduler.quote(gid, 100e18, 2 * YEAR), 2 * q1, "linear in duration");
    }

    function test_quote_monotonicInUtilization() public {
        (uint256 gid,,) = _filledMutual();
        uint256 qBefore = scheduler.quote(gid, 50e18, YEAR); // sold 0, u 0
        _bind(gid, 100e18, YEAR); // sold -> 100e18, u 0.5
        uint256 qAfter = scheduler.quote(gid, 50e18, YEAR);
        assertGt(qAfter, qBefore, "rate rises as utilization rises");
    }

    function test_capacityFlightRaisesPrice() public {
        (uint256 gid, uint256 c1,) = _filledMutual();
        _bind(gid, 100e18, YEAR); // sold 100e18, activeCover 200e18, u 0.5
        uint256 qBefore = scheduler.quote(gid, 1e18, YEAR);

        // A loss settles, shrinking deliverable cover (capacity flight). sold is unchanged, so u rises.
        vm.prank(proposer);
        arbiter.proposeLoss(gid, 100e18, bytes32("ev"), MIN_BOND);
        vm.warp(block.timestamp + MUTUAL_WINDOW + 1);
        manager.executeMutualLoss(gid);
        manager.settleMemberLoss(c1);

        assertLt(_activeCover(gid), 200e18, "cover shrank");
        assertGt(scheduler.quote(gid, 1e18, YEAR), qBefore, "scarcer cover prices higher");
    }

    // ---------------------------------------------------------------------
    // MCR / leverage cap
    // ---------------------------------------------------------------------

    function test_leverageCap_reverts() public {
        (uint256 gid,,) = _filledMutual(); // activeCover 200e18
        vm.prank(pricingOwner);
        scheduler.setMutualCurve(gid, BASE, SLOPE1, SLOPE2, KINK, 10_000); // 1x cap == 200e18
        vm.expectRevert(abi.encodeWithSelector(PremiumScheduler.LeverageCapExceeded.selector, 201e18, 200e18));
        scheduler.quote(gid, 201e18, YEAR);
        // Exactly at the cap is allowed.
        assertGt(scheduler.quote(gid, 200e18, YEAR), 0, "at-cap notional prices");
    }

    function test_leverageCap_zeroCoverReverts() public {
        uint256 gid = _mutual(); // no members => activeCover 0 => cap 0
        vm.expectRevert(abi.encodeWithSelector(PremiumScheduler.LeverageCapExceeded.selector, 1e18, 0));
        scheduler.quote(gid, 1e18, YEAR);
    }

    // ---------------------------------------------------------------------
    // bindCover atomicity
    // ---------------------------------------------------------------------

    function test_bindCover_fundsStreamAtomically() public {
        (uint256 gid,,) = _filledMutual();
        uint256 phBefore = usdc.balanceOf(policyholder);
        uint256 premium = scheduler.quote(gid, 100e18, YEAR); // 2e18

        uint256 id = _bind(gid, 100e18, YEAR);

        // Stream funded: pool credited the premium, rate/finish set.
        (uint128 rate, uint64 finish, uint256 pool) = _poolState(gid);
        assertEq(pool, premium, "pool == premium funded");
        assertEq(uint256(rate), premium / YEAR, "rewardRate == premium/duration");
        assertEq(uint256(finish), block.timestamp + YEAR, "periodFinish set");
        // Binding recorded; utilization bumped; policyholder paid exactly the premium.
        ILinkedMutualPolicy.CoverBinding memory b = policy.getCoverBinding(id);
        assertEq(b.notional, 100e18);
        assertEq(b.policyholder, policyholder);
        assertEq(b.premiumPaid, premium);
        assertTrue(b.active);
        assertEq(policy.getActiveNotionalSold(gid), 100e18, "sold bumped");
        assertEq(phBefore - usdc.balanceOf(policyholder), premium, "policyholder paid exactly the premium");
        // Nothing stranded in the policy contract.
        assertEq(usdc.balanceOf(address(policy)), 0, "no premium stranded in policy");
    }

    function test_bindCover_revertLeavesNoState() public {
        (uint256 gid,,) = _filledMutual();
        vm.prank(pricingOwner);
        scheduler.setMutualCurve(gid, BASE, SLOPE1, SLOPE2, KINK, 10_000); // 1x cap
        uint256 phBefore = usdc.balanceOf(policyholder);

        vm.prank(policyholder);
        vm.expectRevert(); // LeverageCapExceeded, before any token pull
        policy.bindCover(gid, 201e18, YEAR);

        assertEq(policy.nextBindingId(), 1, "no binding id consumed");
        assertEq(policy.getActiveNotionalSold(gid), 0, "no notional recorded");
        assertEq(usdc.balanceOf(policyholder), phBefore, "no premium pulled on a reverted bind");
        (uint128 rate,,) = _poolState(gid);
        assertEq(uint256(rate), 0, "no stream started");
    }

    function test_bindCover_zeroPremiumQuoteReverts() public {
        (uint256 gid,,) = _filledMutual();
        vm.prank(pricingOwner);
        scheduler.setMutualCurve(gid, 0, 0, 0, KINK, MAX_LEV); // all-zero curve => premium 0
        vm.prank(policyholder);
        vm.expectRevert(LinkedMutualPolicy.ZeroPremiumQuote.selector);
        policy.bindCover(gid, 100e18, YEAR);
    }

    // ---------------------------------------------------------------------
    // expireBinding utilization decay
    // ---------------------------------------------------------------------

    function test_expireBinding_decaysUtilization() public {
        (uint256 gid,,) = _filledMutual();
        uint256 id = _bind(gid, 100e18, YEAR);
        assertEq(policy.getActiveNotionalSold(gid), 100e18);

        vm.expectRevert(LinkedMutualPolicy.BindingNotExpired.selector);
        policy.expireBinding(id);

        vm.warp(block.timestamp + YEAR + 1);
        policy.expireBinding(id); // permissionless
        assertEq(policy.getActiveNotionalSold(gid), 0, "notional left utilization");
        assertFalse(policy.getCoverBinding(id).active, "binding inactive");

        vm.expectRevert(LinkedMutualPolicy.BindingInactive.selector);
        policy.expireBinding(id); // idempotent guard
    }

    // ---------------------------------------------------------------------
    // Cover-binding snapshot is advisory ONLY (premium-without-cover still settles)
    // ---------------------------------------------------------------------

    function test_snapshot_advisoryOnly_premiumWithoutCoverStillSettles() public {
        // Mutual A: a loss proposed WITH a binding snapshot.
        (uint256 gA, uint256 cA,) = _filledMutual();
        uint256 id = _bind(gA, 100e18, YEAR);
        ILinkedMutualPolicy.CoverBinding memory b = policy.getCoverBinding(id);
        // The snapshot is emitted for auditability, but it gates nothing.
        vm.expectEmit(address(arbiter));
        emit OptimisticMutualArbiter.CoverBindingSnapshotted(gA, id, 100e18, b.expiry, policyholder);
        vm.prank(proposer);
        arbiter.proposeLossFor(gA, 100e18, bytes32("ev"), MIN_BOND, id);
        vm.warp(block.timestamp + MUTUAL_WINDOW + 1);
        manager.executeMutualLoss(gA);
        manager.settleMemberLoss(cA);
        uint256 owedA = manager.getMembership(cA).settledUnits;

        // Mutual B: a loss proposed with NO binding and NO premium ever funded — still settles identically.
        (uint256 gB, uint256 cB,) = _filledMutual();
        vm.prank(proposer);
        arbiter.proposeLoss(gB, 100e18, bytes32("ev"), MIN_BOND); // plain path, no snapshot
        vm.warp(block.timestamp + MUTUAL_WINDOW + 1);
        manager.executeMutualLoss(gB);
        manager.settleMemberLoss(cB);
        assertEq(manager.getMembership(cB).settledUnits, owedA, "premium-without-cover settles identically");
    }

    // ---------------------------------------------------------------------
    // Standby reservation fee — funds the existing stream, no binding, no new index
    // ---------------------------------------------------------------------

    function test_standby_fundsExistingStreamNoBinding() public {
        (uint256 gid, uint256 c1,) = _filledMutual();
        // Some cover is sold, leaving standby capacity (200e18 cover - 50e18 sold).
        _bind(gid, 50e18, YEAR);
        uint256 idCounterBefore = policy.nextBindingId();
        uint256 soldBefore = policy.getActiveNotionalSold(gid);
        (,, uint256 poolBefore) = _poolState(gid);

        uint256 quoted = scheduler.quoteStandby(gid, YEAR);
        uint256 balBefore = usdc.balanceOf(policyholder);

        vm.prank(policyholder);
        uint256 paid = policy.fundStandby(gid, YEAR);

        (uint128 rate,, uint256 poolAfter) = _poolState(gid);
        assertEq(paid, quoted, "returns the quoted standby premium");
        assertEq(balBefore - usdc.balanceOf(policyholder), paid, "returns what it pulled");
        assertGt(poolAfter, poolBefore, "standby topped up the reserve");
        assertGt(uint256(rate), 0, "stream running");
        assertEq(policy.nextBindingId(), idCounterBefore, "no binding minted");
        assertEq(policy.getActiveNotionalSold(gid), soldBefore, "no notional added by standby");

        // The existing Pi stream distributes it to underwriters (no new index).
        vm.warp(block.timestamp + 30 days);
        assertGt(manager.pendingMemberPremium(c1), 0, "underwriter accrues standby-funded premium");
    }

    // ---------------------------------------------------------------------
    // End-to-end: join -> bind -> earn -> loss -> accrual reflects reduced cover
    // ---------------------------------------------------------------------

    function test_endToEnd_bindEarnLossSettle() public {
        (uint256 gid, uint256 c1, uint256 c2) = _filledMutual();
        _bind(gid, 150e18, 100 days);

        vm.warp(block.timestamp + 50 days);
        assertGt(manager.pendingMemberPremium(c1), 0, "u1 earns premium");
        assertGt(manager.pendingMemberPremium(c2), 0, "u2 earns premium");

        // u1 claims; payment lands in its free balance.
        uint256 free1 = manager.freeBalance(address(usdc), u1);
        manager.claimMemberPremium(c1);
        assertGt(manager.freeBalance(address(usdc), u1) - free1, 0, "u1 collected premium");

        // A loss settles on u1: its deliverable cover (and thus future premium weight) drops.
        vm.prank(proposer);
        arbiter.proposeLoss(gid, 100e18, bytes32("ev"), MIN_BOND);
        vm.warp(block.timestamp + MUTUAL_WINDOW + 1);
        manager.executeMutualLoss(gid);
        uint128 coverBefore = _activeCover(gid);
        manager.settleMemberLoss(c1);
        assertLt(_activeCover(gid), coverBefore, "settled loss shrinks deliverable cover");
    }

    // ---------------------------------------------------------------------
    // Registry metadata cap
    // ---------------------------------------------------------------------

    function test_registry_perilURITooLong_reverts() public {
        MutualRegistry registry = new MutualRegistry(address(manager));
        ICM.MutualParams memory p; // rejected before the manager is called
        vm.expectRevert(MutualRegistry.URITooLong.selector);
        registry.registerMutual(p, 0, 0, string(new bytes(513)), bytes32(0));
    }
}
