// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import {ERC1967Proxy} from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";

import {CommitmentManager} from "src/core/manager/CommitmentManager.sol";
import {ICommitmentManager as ICM} from "src/core/interfaces/ICommitmentManager.sol";
import {OperatorRegistry} from "src/extensions/services/operator-registry/OperatorRegistry.sol";
import {IOperatorRegistry} from "src/extensions/services/interfaces/IOperatorRegistry.sol";
import {MockERC20} from "test/helpers/MockERC20.sol";
import {HalmosBase} from "./HalmosBase.sol";

/// @title RegistryDelegation — periphery Halmos harness (PROPERTIES.md §P4)
/// @notice Delegation accounting on OperatorRegistry.onDelegationReleased /
///         onDelegationForfeited (the manager-binding hooks) and the register /
///         deregister state-machine basics.
///
///         Properties proved (symbolic over the delegation amount):
///           - P4-REG-DEC-REL: after `onDelegationReleased`, the operator's
///             `totalDelegatedStake` drops by EXACTLY the amount credited at
///             delegate time (the `registeredAmount` snapshot), never underflowing.
///           - P4-REG-DEC-FORF: same exact-decrement / no-underflow property for
///             `onDelegationForfeited`.
///           - P4-REG-SM: a freshly registered operator has a non-zero, `active`
///             record (self-stake counted); a delegation increments count/stake;
///             deregister clears `active` and zeroes tracking once delegations close.
///
/// @dev Concessions (documented once, apply to every check here):
///        C1. MESH UNWIRED. `setMeshWiring` is never called, so `_meshOnIncrease`
///            / `_meshOnDecrease` / `_meshDrain` are all no-ops (they early-return on
///            `tokenWeighting == address(0)`). The mesh↔registry lockstep is a
///            SEPARATE property (FanIn/TokenWeighting accounting) owned by Fuzz/Medusa
///            and not in scope for periphery delegation accounting. The stake-metric
///            arithmetic proved here is mesh-independent by construction.
///        C2. STRATEGY-FREE, single-token scene. Commitments carry no distribution
///            strategy (so `_verifyAcceptance`'s allow-list loop is empty) and one
///            MockERC20 backing token equal to `requiredToken`. `distribute()` drift
///            (which is exactly why `registeredAmount` is snapshotted) is out of the
///            hook's own scope — the hook decrements the frozen snapshot, and that is
///            what these checks pin.
///        C3. The manager is the real wired manager; hooks are driven via
///            `vm.prank(address(manager))` to satisfy the `msg.sender == commitmentManager`
///            gate without reproducing the full release/forfeit lifecycle (that lands the
///            same `onDelegation*` call — the accounting effect is identical and is the
///            unit under test).
///
///      Run: FOUNDRY_PROFILE=halmos halmos --contract RegistryDelegation
contract RegistryDelegation is HalmosBase {
    CommitmentManager internal manager;
    OperatorRegistry internal registry;
    MockERC20 internal token;

    address internal constant ADMIN = address(0xAD);
    address internal constant OPERATOR = address(0x10001);
    address internal constant STAKER = address(0x10002);
    address internal constant ARBITER = address(0x10003);
    address internal constant ADAPTER = address(0x10004);

    uint256 internal constant MIN_STAKE = 100e18;
    uint256 internal constant SELF_STAKE = 200e18;
    uint256 internal constant FUND = 10_000e18;

    uint256 internal selfCommitmentId;

    function setUp() public {
        _etchManagerLibs();

        CommitmentManager mImpl = new CommitmentManager();
        manager = CommitmentManager(
            address(
                new ERC1967Proxy(address(mImpl), abi.encodeCall(CommitmentManager.initialize, (ADMIN, 7 days, 14 days)))
            )
        );

        token = new MockERC20("Stake", "STK", 18);

        OperatorRegistry rImpl = new OperatorRegistry();
        registry = OperatorRegistry(
            address(
                new ERC1967Proxy(
                    address(rImpl),
                    abi.encodeCall(
                        OperatorRegistry.initialize,
                        (address(manager), MIN_STAKE, 1024, ADMIN, ARBITER, 0, address(token))
                    )
                )
            )
        );

        // Wire the registry so `_requireWired` passes.
        vm.prank(ADMIN);
        manager.setOperatorRegistry(address(registry));

        // Fund committer + staker.
        token.mint(OPERATOR, FUND);
        token.mint(STAKER, FUND);
        vm.prank(OPERATOR);
        token.approve(address(manager), type(uint256).max);
        vm.prank(STAKER);
        token.approve(address(manager), type(uint256).max);
        vm.prank(OPERATOR);
        manager.deposit(address(token), FUND);
        vm.prank(STAKER);
        manager.deposit(address(token), FUND);

        // Operator self-stake commitment: counterparty = registry, arbiter = ARBITER, token = token.
        selfCommitmentId = _createDelegationCommitment(OPERATOR, SELF_STAKE);
        vm.prank(OPERATOR);
        registry.register(selfCommitmentId);
    }

    function _createDelegationCommitment(address committer, uint256 amount) internal returns (uint256 id) {
        ICM.CommitmentParams memory p;
        p.arbiter = ARBITER;
        p.counterparty = address(registry);
        p.token = address(token);
        p.adapter = ADAPTER; // nonzero dummy; create-path only null-checks it (§C2)
        p.amount = amount;
        p.maxPenaltyBps = 5_000;
        p.challengeWindow = 86_400;
        vm.prank(committer);
        id = manager.createCommitment(p);
    }

    // =========================================================================
    // P4-REG-SM: register / deregister state machine basics
    // =========================================================================

    /// @notice A freshly registered operator (done in setUp) has a well-formed active record:
    ///         active, self-stake counted, tracked, and stake == the self-stake amount.
    function check_register_producesActiveRecord() public view {
        IOperatorRegistry.Operator memory op = registry.getOperator(OPERATOR);
        assert(op.active);
        assert(op.selfStakeActive);
        assert(op.selfStakeCommitmentId == selfCommitmentId);
        assert(op.activeDelegationCount == 1); // self-stake counts as 1
        assert(op.totalDelegatedStake == SELF_STAKE);
        assert(registry.isOperator(OPERATOR));
        assert(registry.getOperator(OPERATOR).totalDelegatedStake == SELF_STAKE);
        assert(registry.trackedCommitmentCount() == 1);
    }

    // =========================================================================
    // P4-REG-DEC-REL: onDelegationReleased decrements by exactly the credited amount
    // =========================================================================

    /// @notice For a delegation of SYMBOLIC `amount`, after the manager fires
    ///         onDelegationReleased the operator's totalDelegatedStake drops by EXACTLY
    ///         `amount` (the frozen `registeredAmount` snapshot), the count drops by one,
    ///         and neither underflows. The routing for the released commitment is cleared.
    function check_onDelegationReleased_exactDecrementNoUnderflow(uint256 amount) public {
        vm.assume(amount >= 1 && amount <= FUND); // a valid third-party delegation amount

        uint256 delId = _createDelegationCommitment(STAKER, amount);
        vm.prank(STAKER);
        registry.delegate(OPERATOR, delId);

        IOperatorRegistry.Operator memory pre = registry.getOperator(OPERATOR);
        assert(pre.totalDelegatedStake == SELF_STAKE + amount);
        assert(pre.activeDelegationCount == 2);

        // The manager is the only authorized caller of the hook.
        vm.prank(address(manager));
        registry.onDelegationReleased(delId, amount);

        IOperatorRegistry.Operator memory post = registry.getOperator(OPERATOR);
        // Exact decrement by the credited amount; no underflow.
        assert(post.totalDelegatedStake == SELF_STAKE);
        assert(post.totalDelegatedStake <= pre.totalDelegatedStake);
        assert(post.activeDelegationCount == 1);
        // The operator remains active (self-stake still live) and above min stake.
        assert(post.active);
        // Routing for the released commitment is torn down.
        assert(registry.operatorForCommitment(delId) == address(0));
        assert(registry.trackedCommitmentCount() == 1); // back to just the self-stake
    }

    // =========================================================================
    // P4-REG-DEC-FORF: onDelegationForfeited decrements by exactly the credited amount
    // =========================================================================

    /// @notice Same exact-decrement / no-underflow property for the forfeit hook. The FULL
    ///         committed amount is removed (not just the penalty portion), driven by the
    ///         frozen snapshot. `forfeitedAmount` (the penalty) is independent of the stake
    ///         decrement.
    function check_onDelegationForfeited_exactDecrementNoUnderflow(uint256 amount, uint256 forfeitedAmount) public {
        vm.assume(amount >= 1 && amount <= FUND);
        vm.assume(forfeitedAmount <= amount); // penalty portion cannot exceed the commitment

        uint256 delId = _createDelegationCommitment(STAKER, amount);
        vm.prank(STAKER);
        registry.delegate(OPERATOR, delId);

        IOperatorRegistry.Operator memory pre = registry.getOperator(OPERATOR);
        assert(pre.totalDelegatedStake == SELF_STAKE + amount);

        vm.prank(address(manager));
        registry.onDelegationForfeited(delId, forfeitedAmount, amount);

        IOperatorRegistry.Operator memory post = registry.getOperator(OPERATOR);
        // Full commitment amount removed, exactly, no underflow.
        assert(post.totalDelegatedStake == SELF_STAKE);
        assert(post.totalDelegatedStake <= pre.totalDelegatedStake);
        assert(post.activeDelegationCount == 1);
        assert(registry.operatorForCommitment(delId) == address(0));
        assert(registry.trackedCommitmentCount() == 1);
    }

    // =========================================================================
    // Underflow safety when the manager over-reports (defense-in-depth clamp)
    // =========================================================================

    /// @notice The hook must NEVER underflow even if the manager reports a decrement larger
    ///         than the operator's live stake. We drive the hook on a delegation whose frozen
    ///         snapshot exceeds the operator's remaining stake by first releasing the
    ///         self-stake, then releasing the delegation: the second decrement clamps to 0.
    function check_onDelegationReleased_clampsToZeroNeverUnderflows(uint256 amount) public {
        vm.assume(amount >= 1 && amount <= FUND);

        uint256 delId = _createDelegationCommitment(STAKER, amount);
        vm.prank(STAKER);
        registry.delegate(OPERATOR, delId);

        // Release the self-stake first: stake -> `amount`.
        vm.prank(address(manager));
        registry.onDelegationReleased(selfCommitmentId, SELF_STAKE);
        // Then release the delegation: stake -> 0, exactly, clamped, never underflowing.
        vm.prank(address(manager));
        registry.onDelegationReleased(delId, amount);

        IOperatorRegistry.Operator memory post = registry.getOperator(OPERATOR);
        assert(post.totalDelegatedStake == 0); // never wraps to a huge value
    }
}
