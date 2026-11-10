// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import {IAccessControl} from "@openzeppelin/contracts/access/IAccessControl.sol";
import {ERC1967Proxy} from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";

import {OperatorRegistry} from "src/extensions/services/operator-registry/OperatorRegistry.sol";
import {IOperatorRegistry} from "src/extensions/services/interfaces/IOperatorRegistry.sol";
import {ICommitmentManager as ICM} from "src/core/interfaces/ICommitmentManager.sol";
import {StrategyBinding} from "src/core/interfaces/IDistributionStrategy.sol";
import {NoopStrategy} from "../manager/mocks/StrategyMocks.sol";
import {ManagerTestBase} from "../helpers/ManagerTestBase.sol";
import {MockERC20} from "../helpers/MockERC20.sol";

/// @title OperatorRegistryAcceptanceTest
/// @notice Acceptance policy enforced on register/delegate against the real
///         `CommitmentManager`: commitment.arbiter must equal requiredArbiter;
///         commitment.maxPenaltyBps must be >= minMaxPenaltyBps floor;
///         commitment.token must equal requiredToken; no bound distribution
///         strategies (audit H-5). Also covers the forfeit-proceeds sweep (audit H-4)
///         and the registeredAmount snapshot under contribution-driven drift.
contract OperatorRegistryAcceptanceTest is ManagerTestBase {
    OperatorRegistry public registry;
    NoopStrategy public noop;
    MockERC20 public otherToken;

    address public operator1 = makeAddr("operator1");
    address public staker1 = makeAddr("staker1");
    address public trustedArbiter = makeAddr("trustedArbiter");
    address public otherArbiter = makeAddr("otherArbiter");
    address public nonAdmin = makeAddr("nonAdmin");

    uint256 public constant DEPOSIT = 1000e18;
    uint256 public constant MIN_STAKE = 10e18;
    uint16 public constant FLOOR = 5000; // 50% floor for most tests

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

        noop = new NoopStrategy();
        otherToken = new MockERC20("Other", "OTH", 18);

        _deposit(operator1, DEPOSIT);
        _deposit(staker1, DEPOSIT);
    }

    // ---- Helpers ------------------------------------------------------------

    /// @dev Strategy-free commitment to the registry, backed by the required token.
    function _createCommitment(address committer, address arbiter_, uint16 penaltyBps, uint256 amount)
        internal
        returns (uint256 commitmentId)
    {
        commitmentId = _createAs(committer, _baseParams(arbiter_, address(registry), amount, penaltyBps));
    }

    /// @dev Commitment to the registry backed by a DIFFERENT token (deposits it first).
    function _createCommitmentBackedBy(address committer, MockERC20 token_, uint16 penaltyBps, uint256 amount)
        internal
        returns (uint256 commitmentId)
    {
        token_.mint(committer, amount);
        vm.startPrank(committer);
        token_.approve(address(manager), amount);
        manager.deposit(address(token_), amount);
        vm.stopPrank();

        ICM.CommitmentParams memory p = _baseParams(trustedArbiter, address(registry), amount, penaltyBps);
        p.token = address(token_);
        commitmentId = _createAs(committer, p);
    }

    /// @dev Policy-conformant commitment except for a bound distribution strategy.
    function _createStrategyBoundCommitment(address committer, uint256 amount) internal returns (uint256 commitmentId) {
        ICM.CommitmentParams memory p = _baseParams(trustedArbiter, address(registry), amount, 10_000);
        p.strategies = new StrategyBinding[](1);
        p.strategies[0] = StrategyBinding(address(noop), "");
        commitmentId = _createAs(committer, p);
    }

    /// @dev Full forfeit flow on a registry-tracked commitment.
    function _executeFullForfeit(uint256 commitmentId, uint16 penaltyBps) internal {
        vm.prank(trustedArbiter);
        manager.initiateForfeit(commitmentId, penaltyBps);
        vm.warp(block.timestamp + WINDOW + 1);
        manager.executeForfeit(commitmentId);
    }

    // =========================================================================
    // register — acceptance
    // =========================================================================

    function testRegister_acceptsCommitmentMatchingPolicy() public {
        uint256 cid = _createCommitment(operator1, trustedArbiter, 10_000, 100e18);
        vm.prank(operator1);
        registry.register(cid);
        assertTrue(registry.isOperator(operator1), "operator should be registered");
        assertEq(registry.getOperator(operator1).totalDelegatedStake, 100e18, "stake mismatch");
    }

    function testRegister_acceptsCommitmentExactlyAtPenaltyFloor() public {
        uint256 cid = _createCommitment(operator1, trustedArbiter, FLOOR, 100e18);
        vm.prank(operator1);
        registry.register(cid);
        assertTrue(registry.isOperator(operator1));
    }

    // =========================================================================
    // register — rejection
    // =========================================================================

    function testRegister_revertsWrongArbiter() public {
        uint256 cid = _createCommitment(operator1, otherArbiter, 10_000, 100e18);
        vm.prank(operator1);
        vm.expectRevert(abi.encodeWithSelector(IOperatorRegistry.WrongArbiter.selector, trustedArbiter, otherArbiter));
        registry.register(cid);
    }

    function testRegister_revertsPenaltyBelowFloor() public {
        uint16 tooLow = FLOOR - 1;
        uint256 cid = _createCommitment(operator1, trustedArbiter, tooLow, 100e18);
        vm.prank(operator1);
        vm.expectRevert(abi.encodeWithSelector(IOperatorRegistry.PenaltyTooLow.selector, FLOOR, tooLow));
        registry.register(cid);
    }

    function testRegister_revertsArbiterEvenWhenPenaltyHigh() public {
        // Wrong arbiter but 100% penalty — arbiter check fires first.
        uint256 cid = _createCommitment(operator1, otherArbiter, 10_000, 100e18);
        vm.prank(operator1);
        vm.expectRevert(abi.encodeWithSelector(IOperatorRegistry.WrongArbiter.selector, trustedArbiter, otherArbiter));
        registry.register(cid);
    }

    function testRegister_revertsWrongToken() public {
        // Registry requires `token`; commitment is backed by `otherToken`.
        uint256 cid = _createCommitmentBackedBy(operator1, otherToken, 10_000, 100e18);
        vm.prank(operator1);
        vm.expectRevert(
            abi.encodeWithSelector(IOperatorRegistry.WrongToken.selector, address(token), address(otherToken))
        );
        registry.register(cid);
    }

    function testRegister_revertsStrategiesBound() public {
        // Strategy movements can shrink c.amount under the registry's accounting (audit H-5) —
        // registration commitments must carry no bound strategies.
        uint256 cid = _createStrategyBoundCommitment(operator1, 100e18);
        vm.prank(operator1);
        vm.expectRevert(IOperatorRegistry.StrategiesNotAllowed.selector);
        registry.register(cid);
    }

    // =========================================================================
    // delegate — acceptance + rejection
    // =========================================================================

    function testDelegate_acceptsMatchingPolicy() public {
        // First register an operator with a valid commitment
        uint256 selfCid = _createCommitment(operator1, trustedArbiter, 10_000, 100e18);
        vm.prank(operator1);
        registry.register(selfCid);

        uint256 delegCid = _createCommitment(staker1, trustedArbiter, 10_000, 50e18);
        vm.prank(staker1);
        registry.delegate(operator1, delegCid);

        assertEq(registry.getOperator(operator1).totalDelegatedStake, 150e18, "delegated stake not added");
    }

    function testDelegate_revertsWrongArbiter() public {
        uint256 selfCid = _createCommitment(operator1, trustedArbiter, 10_000, 100e18);
        vm.prank(operator1);
        registry.register(selfCid);

        uint256 delegCid = _createCommitment(staker1, otherArbiter, 10_000, 50e18);
        vm.prank(staker1);
        vm.expectRevert(abi.encodeWithSelector(IOperatorRegistry.WrongArbiter.selector, trustedArbiter, otherArbiter));
        registry.delegate(operator1, delegCid);
    }

    function testDelegate_revertsPenaltyBelowFloor() public {
        uint256 selfCid = _createCommitment(operator1, trustedArbiter, 10_000, 100e18);
        vm.prank(operator1);
        registry.register(selfCid);

        uint16 tooLow = FLOOR - 1;
        uint256 delegCid = _createCommitment(staker1, trustedArbiter, tooLow, 50e18);
        vm.prank(staker1);
        vm.expectRevert(abi.encodeWithSelector(IOperatorRegistry.PenaltyTooLow.selector, FLOOR, tooLow));
        registry.delegate(operator1, delegCid);
    }

    function testDelegate_revertsWrongToken() public {
        uint256 selfCid = _createCommitment(operator1, trustedArbiter, 10_000, 100e18);
        vm.prank(operator1);
        registry.register(selfCid);

        uint256 delegCid = _createCommitmentBackedBy(staker1, otherToken, 10_000, 50e18);
        vm.prank(staker1);
        vm.expectRevert(
            abi.encodeWithSelector(IOperatorRegistry.WrongToken.selector, address(token), address(otherToken))
        );
        registry.delegate(operator1, delegCid);
    }

    function testDelegate_revertsStrategiesBound() public {
        uint256 selfCid = _createCommitment(operator1, trustedArbiter, 10_000, 100e18);
        vm.prank(operator1);
        registry.register(selfCid);

        uint256 delegCid = _createStrategyBoundCommitment(staker1, 50e18);
        vm.prank(staker1);
        vm.expectRevert(IOperatorRegistry.StrategiesNotAllowed.selector);
        registry.delegate(operator1, delegCid);
    }

    // =========================================================================
    // initialize — validation
    // =========================================================================

    function testInit_revertsZeroArbiter() public {
        OperatorRegistry impl = new OperatorRegistry();
        bytes memory initData = abi.encodeCall(
            OperatorRegistry.initialize,
            (address(manager), MIN_STAKE, uint256(1024), admin, address(0), uint16(10_000), address(token))
        );
        vm.expectRevert(IOperatorRegistry.ZeroArbiter.selector);
        new ERC1967Proxy(address(impl), initData);
    }

    function testInit_revertsZeroToken() public {
        OperatorRegistry impl = new OperatorRegistry();
        bytes memory initData = abi.encodeCall(
            OperatorRegistry.initialize,
            (address(manager), MIN_STAKE, uint256(1024), admin, trustedArbiter, uint16(10_000), address(0))
        );
        vm.expectRevert(IOperatorRegistry.ZeroToken.selector);
        new ERC1967Proxy(address(impl), initData);
    }

    function testInit_revertsPenaltyExceedsMax() public {
        OperatorRegistry impl = new OperatorRegistry();
        bytes memory initData = abi.encodeCall(
            OperatorRegistry.initialize,
            (address(manager), MIN_STAKE, uint256(1024), admin, trustedArbiter, uint16(10_001), address(token))
        );
        vm.expectRevert(IOperatorRegistry.PenaltyExceedsMax.selector);
        new ERC1967Proxy(address(impl), initData);
    }

    function testInit_acceptsZeroFloor() public {
        OperatorRegistry impl = new OperatorRegistry();
        bytes memory initData = abi.encodeCall(
            OperatorRegistry.initialize,
            (address(manager), MIN_STAKE, uint256(1024), admin, trustedArbiter, uint16(0), address(token))
        );
        ERC1967Proxy proxy = new ERC1967Proxy(address(impl), initData);
        (address arb, uint16 floor, address reqToken) = OperatorRegistry(address(proxy)).getAcceptancePolicy();
        assertEq(arb, trustedArbiter);
        assertEq(floor, 0);
        assertEq(reqToken, address(token));
    }

    // =========================================================================
    // tightenPolicy
    // =========================================================================

    function testTightenPolicy_raisesFloor() public {
        vm.expectEmit(false, false, false, true, address(registry));
        emit IOperatorRegistry.AcceptancePolicyTightened(FLOOR, 8000);
        vm.prank(admin);
        registry.tightenPolicy(8000);

        (, uint16 floor,) = registry.getAcceptancePolicy();
        assertEq(floor, 8000);
    }

    function testTightenPolicy_revertsLowering() public {
        vm.prank(admin);
        vm.expectRevert(abi.encodeWithSelector(IOperatorRegistry.PolicyNotTightening.selector, FLOOR, FLOOR - 1000));
        registry.tightenPolicy(FLOOR - 1000);
    }

    function testTightenPolicy_revertsEqual() public {
        vm.prank(admin);
        vm.expectRevert(abi.encodeWithSelector(IOperatorRegistry.PolicyNotTightening.selector, FLOOR, FLOOR));
        registry.tightenPolicy(FLOOR);
    }

    function testTightenPolicy_revertsAboveMax() public {
        vm.prank(admin);
        vm.expectRevert(IOperatorRegistry.PenaltyExceedsMax.selector);
        registry.tightenPolicy(10_001);
    }

    function testTightenPolicy_revertsNonAdmin() public {
        vm.prank(nonAdmin);
        vm.expectRevert(
            abi.encodeWithSelector(
                IAccessControl.AccessControlUnauthorizedAccount.selector,
                nonAdmin,
                bytes32(0) // DEFAULT_ADMIN_ROLE
            )
        );
        registry.tightenPolicy(8000);
    }

    function testTightenPolicy_forwardOnly() public {
        // Register an operator at the floor
        uint256 cid = _createCommitment(operator1, trustedArbiter, FLOOR, 100e18);
        vm.prank(operator1);
        registry.register(cid);
        assertTrue(registry.isOperator(operator1));

        // Admin raises floor above the existing registration's penalty
        vm.prank(admin);
        registry.tightenPolicy(8000);

        // Existing operator is NOT retroactively ejected
        assertTrue(registry.isOperator(operator1), "forward-only tightening should grandfather existing registrations");
        assertEq(registry.getOperator(operator1).totalDelegatedStake, 100e18, "stake should be unchanged");

        // But a new registration at the old floor now reverts
        uint256 newCid = _createCommitment(staker1, trustedArbiter, FLOOR, 100e18);
        vm.prank(staker1);
        vm.expectRevert(abi.encodeWithSelector(IOperatorRegistry.PenaltyTooLow.selector, 8000, FLOOR));
        registry.register(newCid);
    }

    // =========================================================================
    // getAcceptancePolicy
    // =========================================================================

    function testGetAcceptancePolicy_returnsConfiguredValues() public view {
        (address arb, uint16 floor, address reqToken) = registry.getAcceptancePolicy();
        assertEq(arb, trustedArbiter);
        assertEq(floor, FLOOR);
        assertEq(reqToken, address(token));
    }

    // =========================================================================
    // sweepForfeitProceeds (audit H-4)
    // =========================================================================

    /// @dev End-to-end: register → delegate → two-phase forfeit credits the registry's FREE
    ///      balance inside the manager → admin sweeps to a treasury address.
    function testSweepForfeitProceeds_endToEnd() public {
        uint256 selfCid = _createCommitment(operator1, trustedArbiter, 10_000, 100e18);
        vm.prank(operator1);
        registry.register(selfCid);

        uint256 delegCid = _createCommitment(staker1, trustedArbiter, 10_000, 50e18);
        vm.prank(staker1);
        registry.delegate(operator1, delegCid);

        // Forfeit the delegation at 100% — the registry (counterparty) is credited pull-payment.
        vm.prank(trustedArbiter);
        manager.initiateForfeit(delegCid, 10_000);
        vm.warp(block.timestamp + WINDOW + 1);

        vm.expectEmit(true, true, false, true, address(registry));
        emit IOperatorRegistry.ForfeitRecipientPending(operator1, delegCid, 50e18);
        manager.executeForfeit(delegCid);

        assertEq(
            manager.freeBalance(address(token), address(registry)),
            50e18,
            "forfeit proceeds should credit the registry's manager free balance"
        );

        // Admin sweeps to the treasury payout address.
        address payTo = makeAddr("treasury");
        vm.expectEmit(true, true, false, true, address(registry));
        emit IOperatorRegistry.ForfeitRecipientSwept(address(token), payTo, 50e18);
        vm.prank(admin);
        registry.sweepForfeitProceeds(address(token), 50e18, payTo);

        assertEq(token.balanceOf(payTo), 50e18, "swept tokens should land at payTo");
        assertEq(manager.freeBalance(address(token), address(registry)), 0, "registry free balance drained");
    }

    function testSweepForfeitProceeds_revertsNonAdmin() public {
        vm.prank(nonAdmin);
        vm.expectRevert(
            abi.encodeWithSelector(IAccessControl.AccessControlUnauthorizedAccount.selector, nonAdmin, bytes32(0))
        );
        registry.sweepForfeitProceeds(address(token), 1e18, nonAdmin);
    }

    function testSweepForfeitProceeds_revertsZeroPayout() public {
        vm.prank(admin);
        vm.expectRevert(IOperatorRegistry.ZeroPayoutAddress.selector);
        registry.sweepForfeitProceeds(address(token), 1e18, address(0));
    }

    // =========================================================================
    // registeredAmount snapshot (audit H-5)
    // =========================================================================

    /// @dev `contributeEncumbered` can GROW c.amount after the registry snapshotted it at
    ///      delegate() time. On release the registry must decrement by the snapshot, not the
    ///      drifted runtime amount — otherwise the operator is left with phantom stake removed.
    function testRegisteredAmountSnapshot_releaseAfterContributionGrowth() public {
        uint256 selfCid = _createCommitment(operator1, trustedArbiter, 10_000, 100e18);
        vm.prank(operator1);
        registry.register(selfCid);

        uint256 delegCid = _createCommitment(staker1, trustedArbiter, 10_000, 50e18);
        vm.prank(staker1);
        registry.delegate(operator1, delegCid);
        assertEq(registry.getOperator(operator1).totalDelegatedStake, 150e18, "snapshot credited at delegate time");

        // The committer is the first contributor (opt-in), growing c.amount 50e18 → 75e18.
        vm.prank(staker1);
        manager.contributeEncumbered(delegCid, 25e18);
        assertEq(manager.getCommitment(delegCid).amount, 75e18, "runtime amount drifted upward");

        // Release passes the drifted amount (75e18) to the hook; the registry must
        // decrement the snapshotted 50e18, leaving exactly the self-stake.
        vm.prank(trustedArbiter);
        manager.releaseCommitment(delegCid);

        assertEq(
            registry.getOperator(operator1).totalDelegatedStake,
            100e18,
            "release must decrement the registered snapshot"
        );
        IOperatorRegistry.Operator memory op = registry.getOperator(operator1);
        assertEq(op.activeDelegationCount, 1, "only self-stake remains");
        assertGe(op.totalDelegatedStake, registry.minOperatorStake(), "not below the minimum");
    }

    /// @dev Same drift scenario through the forfeit path: onDelegationForfeited receives the
    ///      drifted fullAmount but must decrement the registered snapshot.
    function testRegisteredAmountSnapshot_forfeitAfterContributionGrowth() public {
        uint256 selfCid = _createCommitment(operator1, trustedArbiter, 10_000, 100e18);
        vm.prank(operator1);
        registry.register(selfCid);

        uint256 delegCid = _createCommitment(staker1, trustedArbiter, FLOOR, 50e18);
        vm.prank(staker1);
        registry.delegate(operator1, delegCid);

        vm.prank(staker1);
        manager.contributeEncumbered(delegCid, 25e18); // c.amount: 50e18 → 75e18

        // 50% forfeit of the drifted 75e18 → 37.5e18 credited to the registry.
        _executeFullForfeit(delegCid, FLOOR);

        assertEq(
            registry.getOperator(operator1).totalDelegatedStake,
            100e18,
            "forfeit must decrement the registered snapshot"
        );
        assertEq(
            manager.freeBalance(address(token), address(registry)),
            37.5e18,
            "penalty computed on the drifted runtime amount"
        );
    }

    // =========================================================================
    // Fuzz
    // =========================================================================

    function testFuzz_register_rejectsAllBelowFloor(uint16 bps) public {
        vm.assume(bps < FLOOR);
        uint256 cid = _createCommitment(operator1, trustedArbiter, bps, 100e18);
        vm.prank(operator1);
        vm.expectRevert(abi.encodeWithSelector(IOperatorRegistry.PenaltyTooLow.selector, FLOOR, bps));
        registry.register(cid);
    }

    function testFuzz_register_acceptsAtOrAboveFloor(uint16 bps) public {
        vm.assume(bps >= FLOOR && bps <= 10_000);
        uint256 cid = _createCommitment(operator1, trustedArbiter, bps, 100e18);
        vm.prank(operator1);
        registry.register(cid);
        assertTrue(registry.isOperator(operator1));
    }
}
