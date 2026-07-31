// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import {ERC1967Proxy} from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";

import {OperatorRegistry} from "src/extensions/services/operator-registry/OperatorRegistry.sol";
import {IOperatorRegistry} from "src/extensions/services/interfaces/IOperatorRegistry.sol";
import {Multicallable} from "src/shared/utilities/Multicallable.sol";
import {ManagerTestBase} from "../helpers/ManagerTestBase.sol";

/// @title OperatorRegistryMulticallTest
/// @notice Covers the issue-#45 `Multicallable` mixin on the OperatorRegistry: the one-tx
///         register+configure and multi-delegate flows, `msg.sender` preservation through the
///         self-`delegatecall`, revert bubbling / atomicity, the non-payable value guard, and —
///         critically — that batching `nonReentrant` entry points through the (non-guarded)
///         multicall does NOT falsely trip the `ReentrancyGuardTransient` lock.
contract OperatorRegistryMulticallTest is ManagerTestBase {
    OperatorRegistry internal registry;

    address internal arbiter = makeAddr("arbiter");
    address internal operator = makeAddr("operatorMc");
    address internal staker = makeAddr("stakerMc");

    uint256 internal constant MIN_OPERATOR_STAKE = 100e18;
    uint256 internal constant DEPOSIT_AMOUNT = 1000e18;
    uint16 internal constant MAX_PENALTY_BPS = 5000;

    function setUp() public override {
        super.setUp();

        OperatorRegistry regImpl = new OperatorRegistry();
        registry = OperatorRegistry(
            address(
                new ERC1967Proxy(
                    address(regImpl),
                    abi.encodeCall(
                        OperatorRegistry.initialize,
                        (address(manager), MIN_OPERATOR_STAKE, 1024, admin, arbiter, uint16(0), address(token))
                    )
                )
            )
        );

        vm.prank(admin);
        manager.setOperatorRegistry(address(registry));

        _deposit(operator, DEPOSIT_AMOUNT);
        _deposit(staker, DEPOSIT_AMOUNT);
    }

    function _createCommitment(address committer, uint256 amount) internal returns (uint256 id) {
        id = _createAs(committer, _baseParams(arbiter, address(registry), amount, MAX_PENALTY_BPS));
    }

    // =========================================================================
    // One-tx register + configure (create+delegate-style batch)
    // =========================================================================

    /// @notice An operator batches `register` and `setOperatorMetadata` in a single tx. Both are
    ///         `nonReentrant`; running them sequentially through multicall must succeed (the guard
    ///         is entered/exited per sub-call, not nested), and `msg.sender` must be preserved so
    ///         `register`'s committer check and `setOperatorMetadata`'s active check both pass.
    function test_multicall_registerThenSetMetadata_oneTx() public {
        uint256 id = _createCommitment(operator, MIN_OPERATOR_STAKE);

        bytes[] memory calls = new bytes[](2);
        calls[0] = abi.encodeCall(OperatorRegistry.register, (id));
        calls[1] = abi.encodeCall(OperatorRegistry.setOperatorMetadata, ("ipfs://op", keccak256("op")));

        vm.prank(operator);
        registry.multicall(calls);

        assertTrue(registry.isOperator(operator), "operator active after batched register");
        assertTrue(registry.isEntity(operator), "MembershipBase.isEntity mirrors active");
        assertEq(registry.getOperatorStake(operator), MIN_OPERATOR_STAKE, "stake credited");
        IOperatorRegistry.OperatorMetadata memory m = registry.getOperatorMetadata(operator);
        assertEq(m.uri, "ipfs://op", "metadata set in same tx");
    }

    /// @notice A staker with two commitments batches two `delegate` calls to the same operator in
    ///         one tx — the canonical one-tx multi-delegate flow. Confirms both delegations credit
    ///         and the two `nonReentrant` calls compose without tripping the guard.
    function test_multicall_twoDelegates_oneTx() public {
        // Operator registers first (direct).
        uint256 opId = _createCommitment(operator, MIN_OPERATOR_STAKE);
        vm.prank(operator);
        registry.register(opId);

        uint256 d1 = _createCommitment(staker, MIN_OPERATOR_STAKE);
        uint256 d2 = _createCommitment(staker, MIN_OPERATOR_STAKE);

        bytes[] memory calls = new bytes[](2);
        calls[0] = abi.encodeCall(OperatorRegistry.delegate, (operator, d1));
        calls[1] = abi.encodeCall(OperatorRegistry.delegate, (operator, d2));

        vm.prank(staker);
        registry.multicall(calls);

        // self-stake + two delegations.
        assertEq(registry.getOperatorStake(operator), 3 * MIN_OPERATOR_STAKE, "both delegations credited in one tx");
    }

    // =========================================================================
    // Atomicity, msg.sender, value guard
    // =========================================================================

    /// @notice If any sub-call reverts, the whole batch reverts (all-or-nothing) and the failing
    ///         sub-call's revert reason bubbles up verbatim.
    function test_multicall_bubblesRevert_atomic() public {
        uint256 id = _createCommitment(operator, MIN_OPERATOR_STAKE);

        bytes[] memory calls = new bytes[](2);
        calls[0] = abi.encodeCall(OperatorRegistry.register, (id));
        // Second call re-registers the same operator -> AlreadyRegistered, must revert the batch.
        calls[1] = abi.encodeCall(OperatorRegistry.register, (id));

        vm.prank(operator);
        vm.expectRevert(IOperatorRegistry.AlreadyRegistered.selector);
        registry.multicall(calls);

        // Batch reverted atomically: the operator was NOT registered by the first sub-call.
        assertFalse(registry.isOperator(operator), "atomic: no partial state");
    }

    /// @notice `multicall` is non-payable: attaching value reverts, so the classic "same msg.value
    ///         reused across a loop" footgun cannot occur. register/delegate are not payable.
    function test_multicall_rejectsValue() public {
        uint256 id = _createCommitment(operator, MIN_OPERATOR_STAKE);
        bytes[] memory calls = new bytes[](1);
        calls[0] = abi.encodeCall(OperatorRegistry.register, (id));

        vm.deal(operator, 1 ether);
        vm.prank(operator);
        (bool ok,) = address(registry).call{value: 1}(abi.encodeCall(Multicallable.multicall, (calls)));
        assertFalse(ok, "non-payable multicall must reject value");
    }

    /// @notice An empty batch is a no-op that returns an empty results array.
    function test_multicall_empty_isNoop() public {
        bytes[] memory calls = new bytes[](0);
        vm.prank(operator);
        bytes[] memory results = registry.multicall(calls);
        assertEq(results.length, 0, "empty batch returns empty results");
    }
}
