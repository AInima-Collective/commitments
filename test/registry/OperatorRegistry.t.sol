// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import {ERC1967Proxy} from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";

import {OperatorRegistry} from "src/extensions/services/operator-registry/OperatorRegistry.sol";
import {IOperatorRegistry} from "src/extensions/services/interfaces/IOperatorRegistry.sol";
import {ICommitmentManager as ICM} from "src/core/interfaces/ICommitmentManager.sol";
import {ManagerTestBase} from "../helpers/ManagerTestBase.sol";

/// @title OperatorRegistryTest
/// @notice Comprehensive tests covering OPER-01 through OPER-06 requirements against the real
///         direct-custody `CommitmentManager`. Tests register, delegate, deregister,
///         IServiceManager queries, and the forfeit/release hooks the manager fires once
///         `setOperatorRegistry` is wired.
contract OperatorRegistryTest is ManagerTestBase {
    OperatorRegistry public registry;

    address public operator1 = makeAddr("operator1");
    address public staker1 = makeAddr("staker1");
    address public staker2 = makeAddr("staker2");
    address public arbiter = makeAddr("arbiter");
    address public unauthorized = makeAddr("unauthorized");

    uint256 public constant MIN_OPERATOR_STAKE = 100e18;
    uint256 public constant MAX_DELEGATIONS = 1024;
    uint256 public constant DEPOSIT_AMOUNT = 500e18;
    uint16 public constant MAX_PENALTY_BPS = 5000;

    // =========================================================================
    // Setup
    // =========================================================================

    function setUp() public override {
        // 1. Real CommitmentManager proxy + MockERC20 + static adapter from the shared fixture.
        super.setUp();

        // 2. Deploy OperatorRegistry behind ERC1967Proxy.
        //    Policy: requiredArbiter=arbiter, minMaxPenaltyBps=0 (no floor) so tests that use
        //    varied maxPenaltyBps pass; requiredToken = the fixture's backing token.
        OperatorRegistry regImpl = new OperatorRegistry();
        registry = OperatorRegistry(
            address(
                new ERC1967Proxy(
                    address(regImpl),
                    abi.encodeCall(
                        OperatorRegistry.initialize,
                        (
                            address(manager),
                            MIN_OPERATOR_STAKE,
                            MAX_DELEGATIONS,
                            admin,
                            arbiter,
                            uint16(0),
                            address(token)
                        )
                    )
                )
            )
        );

        // 3. Wire registry into the manager so onDelegationReleased/Forfeited hooks fire.
        vm.prank(admin);
        manager.setOperatorRegistry(address(registry));

        // 4. Fund test participants' free balances inside the manager.
        _deposit(operator1, DEPOSIT_AMOUNT);
        _deposit(staker1, DEPOSIT_AMOUNT);
        _deposit(staker2, DEPOSIT_AMOUNT);
    }

    // =========================================================================
    // Helpers
    // =========================================================================

    /// @dev Create a commitment with the registry as counterparty (for registration or delegation).
    function _createCommitmentToRegistry(address committer, uint256 amount, uint16 penaltyBps)
        internal
        returns (uint256 commitmentId)
    {
        commitmentId = _createAs(committer, _baseParams(arbiter, address(registry), amount, penaltyBps));
    }

    /// @dev Register operator1 with MIN_OPERATOR_STAKE.
    function _registerOperator1() internal returns (uint256 commitmentId) {
        commitmentId = _createCommitmentToRegistry(operator1, MIN_OPERATOR_STAKE, MAX_PENALTY_BPS);
        vm.prank(operator1);
        registry.register(commitmentId);
    }

    /// @dev Full forfeit flow: initiate + warp past window + execute.
    function _executeFullForfeit(uint256 commitmentId, uint16 penaltyBps) internal {
        vm.prank(arbiter);
        manager.initiateForfeit(commitmentId, penaltyBps);
        vm.warp(block.timestamp + WINDOW + 1);
        manager.executeForfeit(commitmentId);
    }

    // =========================================================================
    // Test 1: Operator registers with valid commitment (OPER-01)
    // =========================================================================

    function testRegister_validCommitment_succeeds() public {
        uint256 commitmentId = _createCommitmentToRegistry(operator1, MIN_OPERATOR_STAKE, MAX_PENALTY_BPS);

        vm.prank(operator1);
        vm.expectEmit(true, false, false, true);
        emit IOperatorRegistry.OperatorRegistered(operator1, commitmentId, MIN_OPERATOR_STAKE);
        registry.register(commitmentId);

        assertTrue(registry.isOperator(operator1), "operator1 should be active");
        assertEq(registry.getOperatorStake(operator1), MIN_OPERATOR_STAKE, "stake should equal commitment amount");
        assertEq(registry.getOperatorCount(), 1, "should have 1 operator");
    }

    // =========================================================================
    // Test 2: Register reverts AlreadyRegistered if operator already registered (OPER-01)
    // =========================================================================

    function testRegister_alreadyRegistered_reverts() public {
        _registerOperator1();

        // Create a second commitment for the same operator
        uint256 commitmentId2 = _createCommitmentToRegistry(operator1, MIN_OPERATOR_STAKE, MAX_PENALTY_BPS);

        vm.prank(operator1);
        vm.expectRevert(IOperatorRegistry.AlreadyRegistered.selector);
        registry.register(commitmentId2);
    }

    // =========================================================================
    // Test 3: Register reverts InsufficientStake if amount < minOperatorStake (D-08)
    // =========================================================================

    function testRegister_insufficientStake_reverts() public {
        uint256 tooLittle = MIN_OPERATOR_STAKE - 1;
        uint256 commitmentId = _createCommitmentToRegistry(operator1, tooLittle, MAX_PENALTY_BPS);

        vm.prank(operator1);
        vm.expectRevert(
            abi.encodeWithSelector(IOperatorRegistry.InsufficientStake.selector, tooLittle, MIN_OPERATOR_STAKE)
        );
        registry.register(commitmentId);
    }

    // =========================================================================
    // Test 4: Register reverts if commitment counterparty != registry address (T-03-24)
    // =========================================================================

    function testRegister_wrongCounterparty_reverts() public {
        // Create commitment with a different counterparty (not the registry)
        uint256 commitmentId =
            _createAs(operator1, _baseParams(arbiter, makeAddr("notRegistry"), MIN_OPERATOR_STAKE, MAX_PENALTY_BPS));

        vm.prank(operator1);
        vm.expectRevert(IOperatorRegistry.WrongCounterparty.selector);
        registry.register(commitmentId);
    }

    // =========================================================================
    // Test 5: Register reverts if commitment committer != msg.sender (T-03-22)
    // =========================================================================

    function testRegister_notCommitmentOwner_reverts() public {
        // operator1 creates commitment
        uint256 commitmentId = _createCommitmentToRegistry(operator1, MIN_OPERATOR_STAKE, MAX_PENALTY_BPS);

        // staker1 tries to register with operator1's commitment
        vm.prank(staker1);
        vm.expectRevert(IOperatorRegistry.NotCommitmentOwner.selector);
        registry.register(commitmentId);
    }

    // =========================================================================
    // Test 6: Staker delegates to operator — totalDelegatedStake increases (OPER-03)
    // =========================================================================

    function testDelegate_validDelegation_increasesStake() public {
        _registerOperator1();

        uint256 delegateAmount = 200e18;
        uint256 commitmentId = _createCommitmentToRegistry(staker1, delegateAmount, MAX_PENALTY_BPS);

        vm.prank(staker1);
        vm.expectEmit(true, true, true, true);
        emit IOperatorRegistry.DelegationCreated(staker1, operator1, commitmentId, delegateAmount);
        registry.delegate(operator1, commitmentId);

        assertEq(
            registry.getOperatorStake(operator1),
            MIN_OPERATOR_STAKE + delegateAmount,
            "total stake should include delegation"
        );

        IOperatorRegistry.Operator memory op = registry.getOperator(operator1);
        assertEq(op.activeDelegationCount, 2, "should have 2 delegations (self + staker)");
    }

    // =========================================================================
    // Test 7: Delegate reverts if operator not active (OPER-03)
    // =========================================================================

    function testDelegate_operatorNotActive_reverts() public {
        // operator1 not registered
        uint256 commitmentId = _createCommitmentToRegistry(staker1, MIN_OPERATOR_STAKE, MAX_PENALTY_BPS);

        vm.prank(staker1);
        vm.expectRevert(IOperatorRegistry.NotRegistered.selector);
        registry.delegate(operator1, commitmentId);
    }

    // =========================================================================
    // Test 8: Delegate reverts MaxDelegationsExceeded when at capacity (T-03-28)
    // =========================================================================

    function testDelegate_maxDelegationsExceeded_reverts() public {
        // Set a low max for testing
        vm.prank(admin);
        registry.setMaxDelegationsPerOperator(1); // only self-stake allowed

        _registerOperator1(); // uses up the 1 slot

        uint256 commitmentId = _createCommitmentToRegistry(staker1, MIN_OPERATOR_STAKE, MAX_PENALTY_BPS);

        vm.prank(staker1);
        vm.expectRevert(abi.encodeWithSelector(IOperatorRegistry.MaxDelegationsExceeded.selector, 1, 1));
        registry.delegate(operator1, commitmentId);
    }

    // =========================================================================
    // Test 9: getOperatorStake returns correct total stake (self + delegated) (OPER-02)
    // =========================================================================

    function testGetOperatorStake_selfPlusDelegated_correct() public {
        _registerOperator1();

        uint256 delegateAmount1 = 150e18;
        uint256 delegateAmount2 = 200e18;

        uint256 commitmentId1 = _createCommitmentToRegistry(staker1, delegateAmount1, MAX_PENALTY_BPS);
        vm.prank(staker1);
        registry.delegate(operator1, commitmentId1);

        uint256 commitmentId2 = _createCommitmentToRegistry(staker2, delegateAmount2, MAX_PENALTY_BPS);
        vm.prank(staker2);
        registry.delegate(operator1, commitmentId2);

        uint256 expectedStake = MIN_OPERATOR_STAKE + delegateAmount1 + delegateAmount2;
        assertEq(registry.getOperatorStake(operator1), expectedStake, "total stake mismatch");
    }

    // =========================================================================
    // Test 10: isOperator returns true for registered, false for unregistered (OPER-02)
    // =========================================================================

    function testIsOperator_registeredAndUnregistered() public {
        assertFalse(registry.isOperator(operator1), "should be false before registration");

        _registerOperator1();

        assertTrue(registry.isOperator(operator1), "should be true after registration");
        assertFalse(registry.isOperator(staker1), "staker should not be an operator");
    }

    // =========================================================================
    // Test 11: getOperatorSet returns all active operators (OPER-06)
    // =========================================================================

    function testGetOperatorSet_returnsAllOperators() public {
        address operator2 = makeAddr("operator2");
        _deposit(operator2, DEPOSIT_AMOUNT);

        _registerOperator1();

        uint256 commitmentId2 = _createCommitmentToRegistry(operator2, MIN_OPERATOR_STAKE, MAX_PENALTY_BPS);
        vm.prank(operator2);
        registry.register(commitmentId2);

        address[] memory operators = registry.getOperatorSet();
        assertEq(operators.length, 2, "should have 2 operators");
        assertTrue(
            (operators[0] == operator1 && operators[1] == operator2)
                || (operators[0] == operator2 && operators[1] == operator1),
            "both operators should be in the set"
        );
    }

    // =========================================================================
    // Test 12: Operator deregisters — removed from operatorSet, marked inactive (OPER-01)
    // =========================================================================

    function testDeregister_removesFromSet_marksInactive() public {
        _registerOperator1();

        // Advance a block: a same-block register⇄deregister flip is blocked (issue #44).
        vm.roll(block.number + 1);
        vm.prank(operator1);
        vm.expectEmit(true, false, false, false);
        emit IOperatorRegistry.OperatorDeregistered(operator1);
        registry.deregister();

        assertFalse(registry.isOperator(operator1), "should be inactive after deregister");
        assertEq(registry.getOperatorCount(), 0, "operator list should be empty");
        assertEq(registry.getOperatorSet().length, 0, "getOperatorSet should return empty");
    }

    // =========================================================================
    // Test 13: Deregister reverts if operator has active delegations beyond self-stake (OPER-01)
    // =========================================================================

    function testDeregister_withActiveDelegations_reverts() public {
        _registerOperator1();

        // Add a delegation from staker1
        uint256 commitmentId = _createCommitmentToRegistry(staker1, MIN_OPERATOR_STAKE, MAX_PENALTY_BPS);
        vm.prank(staker1);
        registry.delegate(operator1, commitmentId);

        // Operator tries to deregister with active delegation
        vm.prank(operator1);
        vm.expectRevert(IOperatorRegistry.ActiveDelegationsExist.selector);
        registry.deregister();
    }

    // =========================================================================
    // Test 14: Forfeit on delegation commitment triggers onDelegationForfeited — operator stake decreases (OPER-05)
    // =========================================================================

    function testForfeit_delegationCommitment_decreasesOperatorStake() public {
        _registerOperator1();

        uint256 delegateAmount = 200e18;
        uint256 commitmentId = _createCommitmentToRegistry(staker1, delegateAmount, MAX_PENALTY_BPS);
        vm.prank(staker1);
        registry.delegate(operator1, commitmentId);

        uint256 stakeBefore = registry.getOperatorStake(operator1);

        // Execute forfeit via arbiter (OPER-05: operator service as arbiter)
        _executeFullForfeit(commitmentId, MAX_PENALTY_BPS);

        uint256 stakeAfter = registry.getOperatorStake(operator1);

        // Audit fix: on forfeit, full commitment amount is removed (not just penalty portion)
        // because the entire commitment is terminated
        assertEq(stakeAfter, stakeBefore - delegateAmount, "stake should decrease by full commitment amount");

        // v2 forfeit payouts are pull-payment credits to the counterparty's FREE balance —
        // the registry's free balance inside the manager holds the penalty portion.
        assertEq(
            manager.freeBalance(address(token), address(registry)),
            (delegateAmount * MAX_PENALTY_BPS) / 10_000,
            "forfeit proceeds should credit the registry's free balance"
        );
    }

    function testOnDelegationForfeited_emitsIndexedStaker() public {
        _registerOperator1();

        uint256 delegateAmount = 200e18;
        uint256 commitmentId = _createCommitmentToRegistry(staker1, delegateAmount, MAX_PENALTY_BPS);
        vm.prank(staker1);
        registry.delegate(operator1, commitmentId);

        uint256 forfeitedAmount = 100e18;
        vm.expectEmit(true, true, true, true, address(registry));
        emit IOperatorRegistry.DelegationForfeited(staker1, operator1, commitmentId, forfeitedAmount);
        vm.prank(address(manager));
        registry.onDelegationForfeited(commitmentId, forfeitedAmount, delegateAmount);
    }

    // =========================================================================
    // Test 15: Release on delegation commitment triggers onDelegationReleased — delegation removed (OPER-03)
    // =========================================================================

    function testRelease_delegationCommitment_removesStake() public {
        _registerOperator1();

        uint256 delegateAmount = 200e18;
        uint256 commitmentId = _createCommitmentToRegistry(staker1, delegateAmount, MAX_PENALTY_BPS);
        vm.prank(staker1);
        registry.delegate(operator1, commitmentId);

        uint256 stakeBefore = registry.getOperatorStake(operator1);

        // Arbiter releases the commitment
        vm.prank(arbiter);
        manager.releaseCommitment(commitmentId);

        uint256 stakeAfter = registry.getOperatorStake(operator1);
        assertEq(stakeAfter, stakeBefore - delegateAmount, "stake should decrease by full delegation amount");

        IOperatorRegistry.Operator memory op = registry.getOperator(operator1);
        assertEq(op.activeDelegationCount, 1, "should have only self-stake delegation remaining");
    }

    // =========================================================================
    // Test 16: Forfeit reduces stake below minOperatorStake — belowMinStake flag set (D-08)
    // =========================================================================

    function testForfeit_belowMinStake_flagSet() public {
        // Register with just min stake
        _registerOperator1();

        // Self-stake is MIN_OPERATOR_STAKE; the forfeit removes the full registered amount
        // from totalDelegatedStake, dropping the operator below the minimum.
        IOperatorRegistry.Operator memory op = registry.getOperator(operator1);
        uint256 selfCommitmentId = op.selfStakeCommitmentId;

        // Initiate forfeit, warp past window
        vm.prank(arbiter);
        manager.initiateForfeit(selfCommitmentId, MAX_PENALTY_BPS);
        vm.warp(block.timestamp + WINDOW + 1);

        // Expect the OperatorBelowMinStake event during executeForfeit (fired by hook)
        vm.expectEmit(true, false, false, false);
        emit IOperatorRegistry.OperatorBelowMinStake(operator1, 0, MIN_OPERATOR_STAKE);
        manager.executeForfeit(selfCommitmentId);

        IOperatorRegistry.Operator memory opAfter = registry.getOperator(operator1);
        assertTrue(opAfter.belowMinStake, "belowMinStake should be flagged after forfeit");
    }

    // =========================================================================
    // Test 17: getOperator returns correct Operator struct with all metrics (OPER-04)
    // =========================================================================

    function testGetOperator_returnsFullStruct() public {
        uint256 commitmentId = _registerOperator1();

        IOperatorRegistry.Operator memory op = registry.getOperator(operator1);
        assertEq(op.operator, operator1, "operator address mismatch");
        assertEq(op.selfStakeCommitmentId, commitmentId, "selfStakeCommitmentId mismatch");
        assertEq(op.totalDelegatedStake, MIN_OPERATOR_STAKE, "totalDelegatedStake mismatch");
        assertEq(op.activeDelegationCount, 1, "activeDelegationCount should be 1");
        assertTrue(op.active, "should be active");
        assertFalse(op.belowMinStake, "should not be below min stake");
        assertGt(op.registeredAt, 0, "registeredAt should be set");
    }

    // =========================================================================
    // Test 18: operator service as arbiter can forfeit operator commitment (OPER-05)
    // =========================================================================

    function testServiceArbiterForfeit_succeeds() public {
        // The arbiter acts as the operator service — it controls forfeit initiation
        _registerOperator1();

        IOperatorRegistry.Operator memory op = registry.getOperator(operator1);
        uint256 selfCommitmentId = op.selfStakeCommitmentId;

        uint256 stakeBefore = registry.getOperatorStake(operator1);

        // service arbiter initiates forfeit
        vm.prank(arbiter);
        manager.initiateForfeit(selfCommitmentId, 2500); // 25% in basis points

        vm.warp(block.timestamp + WINDOW + 1);
        manager.executeForfeit(selfCommitmentId);

        uint256 stakeAfter = registry.getOperatorStake(operator1);
        // Audit fix: full commitment amount removed on forfeit (not just penalty portion)
        assertEq(stakeAfter, stakeBefore - MIN_OPERATOR_STAKE, "service arbiter forfeit should reduce stake");
    }

    // =========================================================================
    // Test 19: getOperatorCount returns correct count (OPER-06)
    // =========================================================================

    function testGetOperatorCount_correctAfterRegistrationAndDeregistration() public {
        assertEq(registry.getOperatorCount(), 0, "initial count should be 0");

        address operator2 = makeAddr("operator2");
        _deposit(operator2, DEPOSIT_AMOUNT);

        _registerOperator1();
        assertEq(registry.getOperatorCount(), 1, "count should be 1 after operator1 registers");

        uint256 op2CommitmentId = _createCommitmentToRegistry(operator2, MIN_OPERATOR_STAKE, MAX_PENALTY_BPS);
        vm.prank(operator2);
        registry.register(op2CommitmentId);
        assertEq(registry.getOperatorCount(), 2, "count should be 2 after operator2 registers");

        // Advance a block: a same-block register⇄deregister flip is blocked (issue #44).
        vm.roll(block.number + 1);
        vm.prank(operator1);
        registry.deregister();
        assertEq(registry.getOperatorCount(), 1, "count should be 1 after operator1 deregisters");
    }

    // =========================================================================
    // Test 20: onDelegationForfeited reverts UnauthorizedCaller if caller != commitmentManager (T-03-23)
    // =========================================================================

    function testOnDelegationForfeited_unauthorizedCaller_reverts() public {
        vm.prank(unauthorized);
        vm.expectRevert(IOperatorRegistry.UnauthorizedCaller.selector);
        registry.onDelegationForfeited(0, 100e18, 100e18);
    }

    // =========================================================================
    // Bonus: onDelegationReleased reverts UnauthorizedCaller if caller != commitmentManager (T-03-23)
    // =========================================================================

    function testOnDelegationReleased_unauthorizedCaller_reverts() public {
        vm.prank(unauthorized);
        vm.expectRevert(IOperatorRegistry.UnauthorizedCaller.selector);
        registry.onDelegationReleased(0, 100e18);
    }

    // =========================================================================
    // SEC-02: onDelegationForfeited now decrements activeDelegationCount and clears routing maps
    // =========================================================================

    function test_onDelegationForfeited_decrements_activeDelegationCount() public {
        _registerOperator1();

        uint256 delegateAmount = 200e18;
        uint256 commitmentId = _createCommitmentToRegistry(staker1, delegateAmount, MAX_PENALTY_BPS);
        vm.prank(staker1);
        registry.delegate(operator1, commitmentId);

        IOperatorRegistry.Operator memory opBefore = registry.getOperator(operator1);
        assertEq(opBefore.activeDelegationCount, 2, "should have 2 delegations before forfeit");

        // Execute full forfeit
        _executeFullForfeit(commitmentId, MAX_PENALTY_BPS);

        IOperatorRegistry.Operator memory opAfter = registry.getOperator(operator1);
        assertEq(opAfter.activeDelegationCount, 1, "activeDelegationCount should be decremented to 1 after forfeit");
    }

    function test_onDelegationForfeited_cleans_routing_maps() public {
        _registerOperator1();

        uint256 delegateAmount = 200e18;
        uint256 commitmentId = _createCommitmentToRegistry(staker1, delegateAmount, MAX_PENALTY_BPS);
        vm.prank(staker1);
        registry.delegate(operator1, commitmentId);

        // Execute full forfeit
        _executeFullForfeit(commitmentId, MAX_PENALTY_BPS);

        // After forfeit, routing maps must be cleared.
        // We verify by attempting to forfeit the same commitmentId again via direct hook —
        // since operatorAddr would be address(0), onDelegationForfeited silently returns.
        // This confirms commitmentToOperator[commitmentId] == address(0).
        vm.prank(address(manager));
        // If routing is cleared, this is a no-op (operatorAddr == address(0)) — no revert expected.
        registry.onDelegationForfeited(commitmentId, 1, 1);

        // Also verify operator can deregister (only self-stake remains after delegation cleanup).
        IOperatorRegistry.Operator memory op = registry.getOperator(operator1);
        assertEq(op.activeDelegationCount, 1, "only self-stake remains");

        // Advance a block: a same-block register⇄deregister flip is blocked (issue #44).
        vm.roll(block.number + 1);
        vm.prank(operator1);
        registry.deregister(); // should succeed since only self-stake remains
        assertFalse(registry.isOperator(operator1), "operator deregistered after routing cleanup");
    }

    // =========================================================================
    // S9 (#55): deregister() must not conflate self-stake with third-party delegations
    // =========================================================================

    /// @dev Helper: deploy a second OperatorRegistry against the same manager/token/arbiter.
    function _deploySecondRegistry() internal returns (OperatorRegistry registry2) {
        OperatorRegistry impl2 = new OperatorRegistry();
        registry2 = OperatorRegistry(
            address(
                new ERC1967Proxy(
                    address(impl2),
                    abi.encodeCall(
                        OperatorRegistry.initialize,
                        (
                            address(manager),
                            MIN_OPERATOR_STAKE,
                            MAX_DELEGATIONS,
                            admin,
                            arbiter,
                            uint16(0),
                            address(token)
                        )
                    )
                )
            )
        );
    }

    /// @dev S9 precondition: an independently-closed self-stake flips `selfStakeActive` false
    ///      while the operator record stays active (the "zombie-active" state).
    function test_S9_selfStakeRelease_clearsSelfStakeActive() public {
        uint256 selfId = _registerOperator1();
        assertTrue(registry.getOperator(operator1).selfStakeActive, "self-stake live after register");

        vm.prank(arbiter);
        manager.releaseCommitment(selfId);

        IOperatorRegistry.Operator memory op = registry.getOperator(operator1);
        assertTrue(op.active, "operator stays active (zombie) when only the self-stake closes");
        assertFalse(op.selfStakeActive, "hook must clear selfStakeActive when the self-stake closes");
        assertEq(op.activeDelegationCount, 0, "count drops to 0");
    }

    /// @dev Encodes the S9 attack sequence end-to-end and asserts it is blocked at the
    ///      deregister step:
    ///        1. operator registers (self-stake), staker delegates
    ///        2. self-stake is released independently (arbiter) → zombie-active, count == 1
    ///        3. deregister previously PASSED the `count > 1` gate, drained the delegator's
    ///           mesh power, and left the delegation's routing stranded against a future
    ///           re-registration — now it must revert ActiveDelegationsExist
    ///        4. once the delegation also closes, deregister + re-register are clean and the
    ///           stale delegation's hook can no longer burn the new registration's stake.
    function test_S9_zombieActiveDeregister_withLiveDelegation_reverts() public {
        uint256 selfId = _registerOperator1();

        uint256 delegateAmount = 200e18;
        uint256 delegationId = _createCommitmentToRegistry(staker1, delegateAmount, MAX_PENALTY_BPS);
        vm.prank(staker1);
        registry.delegate(operator1, delegationId);

        // Step 2: self-stake closes independently → zombie-active with count == 1 (delegation).
        vm.prank(arbiter);
        manager.releaseCommitment(selfId);
        IOperatorRegistry.Operator memory op = registry.getOperator(operator1);
        assertTrue(op.active, "zombie-active");
        assertFalse(op.selfStakeActive, "self-stake closed");
        assertEq(op.activeDelegationCount, 1, "one live third-party delegation remains");

        // Step 3: the S9 gate — count == 1 is a THIRD-PARTY delegation, not the self-stake.
        vm.prank(operator1);
        vm.expectRevert(IOperatorRegistry.ActiveDelegationsExist.selector);
        registry.deregister();

        // The live delegation's accounting is untouched by the blocked deregister.
        assertEq(registry.getOperatorStake(operator1), delegateAmount, "delegated stake preserved");

        // Step 4: delegation closes → zombie can now deregister (count == 0, no self-stake).
        vm.prank(arbiter);
        manager.releaseCommitment(delegationId);
        // Advance a block: a same-block register⇄deregister flip is blocked (issue #44).
        vm.roll(block.number + 1);
        vm.prank(operator1);
        registry.deregister();
        assertFalse(registry.isOperator(operator1), "deregistered");

        // Re-register cleanly; the old delegation's routing was cleaned by its own hook, so a
        // replayed/stale hook is a no-op against the new record (no burned mesh/stake credit).
        // Advance another block before re-registering (register is also a toggle).
        vm.roll(block.number + 1);
        uint256 newSelfId = _createCommitmentToRegistry(operator1, MIN_OPERATOR_STAKE, MAX_PENALTY_BPS);
        vm.prank(operator1);
        registry.register(newSelfId);
        vm.prank(address(manager));
        registry.onDelegationReleased(delegationId, delegateAmount); // stale id — must be untracked
        IOperatorRegistry.Operator memory fresh = registry.getOperator(operator1);
        assertEq(fresh.totalDelegatedStake, MIN_OPERATOR_STAKE, "new registration's stake intact");
        assertEq(fresh.activeDelegationCount, 1, "new registration's count intact");
        assertTrue(fresh.selfStakeActive, "new self-stake live");
    }

    /// @dev Same zombie gate for the forfeit path of the self-stake.
    function test_S9_zombieActiveDeregister_afterSelfStakeForfeit_reverts() public {
        uint256 selfId = _registerOperator1();

        uint256 delegationId = _createCommitmentToRegistry(staker1, 200e18, MAX_PENALTY_BPS);
        vm.prank(staker1);
        registry.delegate(operator1, delegationId);

        _executeFullForfeit(selfId, MAX_PENALTY_BPS);
        assertFalse(registry.getOperator(operator1).selfStakeActive, "forfeit hook clears selfStakeActive");

        vm.prank(operator1);
        vm.expectRevert(IOperatorRegistry.ActiveDelegationsExist.selector);
        registry.deregister();
    }

    // =========================================================================
    // S12 (#58): single-registry hook routing — no phantom voting power
    // =========================================================================

    /// @dev A second registry deployed against the same manager is not the wired hook target:
    ///      it must refuse registrations instead of accruing phantom, unbacked voting power.
    function test_S12_register_onUnwiredRegistry_reverts() public {
        OperatorRegistry registry2 = _deploySecondRegistry();

        uint256 commitmentId =
            _createAs(operator1, _baseParams(arbiter, address(registry2), MIN_OPERATOR_STAKE, MAX_PENALTY_BPS));

        vm.prank(operator1);
        vm.expectRevert(abi.encodeWithSelector(IOperatorRegistry.RegistryNotWired.selector, address(registry)));
        registry2.register(commitmentId);
    }

    /// @dev delegate() is gated the same way as register().
    function test_S12_delegate_onUnwiredRegistry_reverts() public {
        OperatorRegistry registry2 = _deploySecondRegistry();

        uint256 commitmentId =
            _createAs(staker1, _baseParams(arbiter, address(registry2), MIN_OPERATOR_STAKE, MAX_PENALTY_BPS));

        vm.prank(staker1);
        vm.expectRevert(abi.encodeWithSelector(IOperatorRegistry.RegistryNotWired.selector, address(registry)));
        registry2.delegate(operator1, commitmentId);
    }

    /// @dev Hot-swapping (or clearing) the manager's registry slot while the outgoing registry
    ///      still tracks live commitments would orphan them — must revert without force.
    function test_S12_setOperatorRegistry_withLiveDelegations_reverts() public {
        _registerOperator1();
        assertEq(registry.trackedCommitmentCount(), 1, "self-stake tracked");

        OperatorRegistry registry2 = _deploySecondRegistry();

        vm.prank(admin);
        vm.expectRevert(abi.encodeWithSelector(ICM.OperatorRegistrySwapBlocked.selector, address(registry)));
        manager.setOperatorRegistry(address(registry2));

        // Clearing to zero orphans the same way.
        vm.prank(admin);
        vm.expectRevert(abi.encodeWithSelector(ICM.OperatorRegistrySwapBlocked.selector, address(registry)));
        manager.setOperatorRegistry(address(0));

        // Re-setting the SAME registry is a no-op and stays allowed.
        vm.prank(admin);
        manager.setOperatorRegistry(address(registry));
        assertEq(manager.operatorRegistry(), address(registry), "same-address re-set allowed");
    }

    /// @dev Swap is allowed once the outgoing registry tracks nothing.
    function test_S12_setOperatorRegistry_cleanOutgoingRegistry_succeeds() public {
        uint256 selfId = _registerOperator1();
        vm.prank(arbiter);
        manager.releaseCommitment(selfId);
        assertEq(registry.trackedCommitmentCount(), 0, "nothing tracked after release");

        OperatorRegistry registry2 = _deploySecondRegistry();
        vm.prank(admin);
        manager.setOperatorRegistry(address(registry2));
        assertEq(manager.operatorRegistry(), address(registry2), "swap allowed when clean");
    }

    /// @dev An outgoing registry that cannot report a tracked count fails closed.
    function test_S12_setOperatorRegistry_nonReportingOutgoing_reverts() public {
        address bogus = address(token); // no trackedCommitmentCount() and no fallback
        vm.prank(admin);
        manager.forceSetOperatorRegistry(bogus);

        vm.prank(admin);
        vm.expectRevert(abi.encodeWithSelector(ICM.OperatorRegistrySwapBlocked.selector, bogus));
        manager.setOperatorRegistry(address(registry));
    }

    /// @dev forceSetOperatorRegistry is the documented escape hatch — and once the manager is
    ///      re-pointed, the orphaned OLD registry refuses to grow.
    function test_S12_forceSetOperatorRegistry_bypassesGuard() public {
        _registerOperator1();
        OperatorRegistry registry2 = _deploySecondRegistry();

        vm.prank(admin);
        manager.forceSetOperatorRegistry(address(registry2));
        assertEq(manager.operatorRegistry(), address(registry2), "force swap succeeds");

        // The now-orphaned registry rejects further delegations (RegistryNotWired).
        uint256 commitmentId = _createCommitmentToRegistry(staker1, 100e18, MAX_PENALTY_BPS);
        vm.prank(staker1);
        vm.expectRevert(abi.encodeWithSelector(IOperatorRegistry.RegistryNotWired.selector, address(registry2)));
        registry.delegate(operator1, commitmentId);

        // Only DEFAULT_ADMIN_ROLE may force-set.
        vm.prank(unauthorized);
        vm.expectRevert();
        manager.forceSetOperatorRegistry(address(registry));
    }

    /// @dev trackedCommitmentCount mirrors live hook routing across the full lifecycle.
    function test_S12_trackedCommitmentCount_accounting() public {
        assertEq(registry.trackedCommitmentCount(), 0, "starts empty");

        _registerOperator1();
        assertEq(registry.trackedCommitmentCount(), 1, "register tracks the self-stake");

        uint256 delegationId = _createCommitmentToRegistry(staker1, 200e18, MAX_PENALTY_BPS);
        vm.prank(staker1);
        registry.delegate(operator1, delegationId);
        assertEq(registry.trackedCommitmentCount(), 2, "delegate tracks the delegation");

        _executeFullForfeit(delegationId, MAX_PENALTY_BPS);
        assertEq(registry.trackedCommitmentCount(), 1, "forfeit hook untracks");

        // Advance a block: a same-block register⇄deregister flip is blocked (issue #44).
        vm.roll(block.number + 1);
        vm.prank(operator1);
        registry.deregister(); // clears the live self-stake routing
        assertEq(registry.trackedCommitmentCount(), 0, "deregister untracks the live self-stake");
    }
}
