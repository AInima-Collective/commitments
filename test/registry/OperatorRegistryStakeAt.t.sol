// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import {ERC1967Proxy} from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";

import {OperatorRegistry} from "src/extensions/services/operator-registry/OperatorRegistry.sol";
import {IOperatorRegistry} from "src/extensions/services/interfaces/IOperatorRegistry.sol";
import {ManagerTestBase} from "../helpers/ManagerTestBase.sol";

/// @title OperatorRegistryStakeAtTest
/// @notice Covers issue #42 — historical stake reads via `stakeAt(operator, timestamp, hint)`.
///         Builds a multi-mutation timeline (register → delegate → delegate → release → forfeit),
///         then asserts:
///           - a VALID hint returns the historically-correct stake at several past timestamps;
///           - an INVALID/empty/out-of-range hint returns the SAME value (trustless fallback);
///           - a checkpoint is pushed on register, delegate, release, and forfeit;
///           - edge cases: before the first checkpoint (0), exactly on a boundary, and after the
///             last checkpoint (latest value).
contract OperatorRegistryStakeAtTest is ManagerTestBase {
    OperatorRegistry public registry;

    address public operator1 = makeAddr("operator1");
    address public staker1 = makeAddr("staker1");
    address public staker2 = makeAddr("staker2");
    address public arbiter = makeAddr("arbiter");

    uint256 public constant MIN_OPERATOR_STAKE = 100e18;
    uint256 public constant MAX_DELEGATIONS = 1024;
    uint256 public constant DEPOSIT_AMOUNT = 1000e18;
    uint16 public constant MAX_PENALTY_BPS = 5000;

    uint256 public constant DEL1 = 200e18; // staker1's delegation
    uint256 public constant DEL2 = 150e18; // staker2's delegation

    // Timeline timestamps captured after each mutation.
    uint64 internal tReg; // stake -> 100e18
    uint64 internal tDel1; // stake -> 300e18
    uint64 internal tDel2; // stake -> 450e18
    uint64 internal tRel; // stake -> 250e18 (staker1 released)
    uint64 internal tForf; // stake -> 100e18 (staker2 forfeited)

    function setUp() public override {
        super.setUp();

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

        vm.prank(admin);
        manager.setOperatorRegistry(address(registry));

        _deposit(operator1, DEPOSIT_AMOUNT);
        _deposit(staker1, DEPOSIT_AMOUNT);
        _deposit(staker2, DEPOSIT_AMOUNT);
    }

    // =========================================================================
    // Helpers
    // =========================================================================

    function _createTo(address committer, uint256 amount) internal returns (uint256 id) {
        id = _createAs(committer, _baseParams(arbiter, address(registry), amount, MAX_PENALTY_BPS));
    }

    /// @dev Build the full 5-checkpoint timeline for operator1. Each mutation is warped to a
    ///      distinct timestamp so no two checkpoints collapse. Returns the self-stake and the
    ///      two delegation commitment ids.
    function _buildTimeline() internal returns (uint256 selfId, uint256 del1Id, uint256 del2Id) {
        // T_reg: register (stake 100e18)
        vm.warp(block.timestamp + 1 days);
        selfId = _createTo(operator1, MIN_OPERATOR_STAKE);
        vm.prank(operator1);
        registry.register(selfId);
        tReg = uint64(block.timestamp);

        // T_del1: staker1 delegates (stake 300e18)
        vm.warp(block.timestamp + 1 days);
        del1Id = _createTo(staker1, DEL1);
        vm.prank(staker1);
        registry.delegate(operator1, del1Id);
        tDel1 = uint64(block.timestamp);

        // T_del2: staker2 delegates (stake 450e18)
        vm.warp(block.timestamp + 1 days);
        del2Id = _createTo(staker2, DEL2);
        vm.prank(staker2);
        registry.delegate(operator1, del2Id);
        tDel2 = uint64(block.timestamp);

        // T_rel: staker1's delegation released (stake 250e18)
        vm.warp(block.timestamp + 1 days);
        vm.prank(arbiter);
        manager.releaseCommitment(del1Id);
        tRel = uint64(block.timestamp);

        // T_forf: staker2's delegation forfeited (stake 100e18). initiate, warp window, execute.
        vm.warp(block.timestamp + 1 days);
        vm.prank(arbiter);
        manager.initiateForfeit(del2Id, MAX_PENALTY_BPS);
        vm.warp(block.timestamp + WINDOW + 1);
        manager.executeForfeit(del2Id);
        tForf = uint64(block.timestamp);
    }

    // =========================================================================
    // Valid-hint reads across the timeline
    // =========================================================================

    /// @dev A correct checkpoint index returns the exact stake covering that timestamp.
    ///      Checkpoint order: 0:tReg=100, 1:tDel1=300, 2:tDel2=450, 3:tRel=250, 4:tForf=100.
    function test_stakeAt_validHint_returnsHistoricalStake() public {
        _buildTimeline();

        assertEq(registry.stakeAt(operator1, tReg, 0), MIN_OPERATOR_STAKE, "hint 0 @ tReg");
        assertEq(registry.stakeAt(operator1, tDel1, 1), MIN_OPERATOR_STAKE + DEL1, "hint 1 @ tDel1");
        assertEq(registry.stakeAt(operator1, tDel2, 2), MIN_OPERATOR_STAKE + DEL1 + DEL2, "hint 2 @ tDel2");
        assertEq(registry.stakeAt(operator1, tRel, 3), MIN_OPERATOR_STAKE + DEL2, "hint 3 @ tRel");
        assertEq(registry.stakeAt(operator1, tForf, 4), MIN_OPERATOR_STAKE, "hint 4 @ tForf");

        // A hint that covers a timestamp strictly BETWEEN two checkpoints is still valid: the
        // checkpoint at `hint` covers [ts_hint, ts_{hint+1}). Midway through the tDel1 era:
        uint64 mid = uint64((uint256(tDel1) + uint256(tDel2)) / 2);
        assertEq(registry.stakeAt(operator1, mid, 1), MIN_OPERATOR_STAKE + DEL1, "hint 1 covers the interval");
    }

    // =========================================================================
    // Invalid / empty / out-of-range hint returns the SAME value (fallback path)
    // =========================================================================

    /// @dev A wrong, empty (0 on a populated trace), or out-of-range hint must never change the
    ///      answer — the binary-search fallback returns the identical historically-correct value.
    function test_stakeAt_badHint_equalsNoHintAnswer() public {
        _buildTimeline();

        uint64[6] memory ts = [tReg, tDel1, tDel2, tRel, tForf, uint64(block.timestamp + 365 days)];
        for (uint256 i; i < ts.length; ++i) {
            uint256 truth = registry.stakeAt(operator1, ts[i], 0); // hint 0 is wrong for most points
            // Out-of-range hint (way past length).
            assertEq(registry.stakeAt(operator1, ts[i], 9999), truth, "out-of-range hint must match");
            // A deliberately wrong in-range hint (last index) for early timestamps.
            assertEq(registry.stakeAt(operator1, ts[i], 4), truth, "wrong in-range hint must match");
            // And cross-check hint 0 against an explicit binary-search anchor (hint == len).
            assertEq(registry.stakeAt(operator1, ts[i], 5), truth, "hint == length falls back");
        }
    }

    /// @dev Fuzz: for any timestamp and any hint, the answer is invariant to the hint.
    function testFuzz_stakeAt_hintNeverChangesAnswer(uint64 ts, uint256 hint) public {
        _buildTimeline();
        uint256 withZero = registry.stakeAt(operator1, ts, 0);
        assertEq(registry.stakeAt(operator1, ts, hint), withZero, "hint must not change the answer");
    }

    // =========================================================================
    // Checkpoint pushed on every mutation (register / delegate / release / forfeit)
    // =========================================================================

    function test_stakeAt_checkpointPushedOnEachMutation() public {
        _buildTimeline();

        // Read back the stake in each era via the no-hint (binary-search) path — proves a
        // checkpoint was written at register, both delegates, the release, and the forfeit.
        assertEq(registry.stakeAt(operator1, tReg, 0), 100e18, "register checkpoint");
        assertEq(registry.stakeAt(operator1, tDel1, 0), 300e18, "delegate #1 checkpoint");
        assertEq(registry.stakeAt(operator1, tDel2, 0), 450e18, "delegate #2 checkpoint");
        assertEq(registry.stakeAt(operator1, tRel, 0), 250e18, "release checkpoint");
        assertEq(registry.stakeAt(operator1, tForf, 0), 100e18, "forfeit checkpoint");

        // Live stake matches the last checkpoint.
        assertEq(registry.getOperatorStake(operator1), 100e18, "live stake == last checkpoint");
    }

    /// @dev The mutation emits StakeCheckpointed with the post-mutation aggregate stake.
    function test_stakeAt_emitsStakeCheckpointed_onDelegate() public {
        vm.warp(block.timestamp + 1 days);
        uint256 selfId = _createTo(operator1, MIN_OPERATOR_STAKE);
        vm.prank(operator1);
        registry.register(selfId);

        vm.warp(block.timestamp + 1 days);
        uint256 delId = _createTo(staker1, DEL1);
        vm.expectEmit(true, true, false, true);
        emit IOperatorRegistry.StakeCheckpointed(operator1, uint64(block.timestamp), MIN_OPERATOR_STAKE + DEL1);
        vm.prank(staker1);
        registry.delegate(operator1, delId);
    }

    // =========================================================================
    // Edge cases
    // =========================================================================

    /// @dev A timestamp before the first checkpoint (or an operator that never staked) reads 0,
    ///      via both the hint and fallback paths.
    function test_stakeAt_beforeFirstCheckpoint_returnsZero() public {
        _buildTimeline();

        uint64 beforeFirst = tReg - 1;
        assertEq(registry.stakeAt(operator1, beforeFirst, 0), 0, "before first (hint 0)");
        assertEq(registry.stakeAt(operator1, beforeFirst, 9999), 0, "before first (bad hint)");

        // Operator that never registered: empty trace -> 0 for any timestamp/hint.
        assertEq(registry.stakeAt(staker1, uint64(block.timestamp), 0), 0, "empty trace -> 0");
        assertEq(registry.stakeAt(staker1, 0, 123), 0, "empty trace -> 0 (bad hint)");
    }

    /// @dev Exactly on a checkpoint boundary returns that checkpoint's value (inclusive lower
    ///      bound), not the previous era's.
    function test_stakeAt_exactlyOnBoundary_returnsThatCheckpoint() public {
        _buildTimeline();

        // On tDel1 the stake is already 300e18 (the delegation that set that checkpoint), and one
        // second earlier it is still the prior 100e18 era.
        assertEq(registry.stakeAt(operator1, tDel1, 1), 300e18, "on boundary -> new value");
        assertEq(registry.stakeAt(operator1, tDel1 - 1, 0), 100e18, "one second before boundary -> old value");
    }

    /// @dev A timestamp at/after the last checkpoint returns the latest value.
    function test_stakeAt_afterLastCheckpoint_returnsLatest() public {
        _buildTimeline();

        assertEq(registry.stakeAt(operator1, tForf, 4), 100e18, "on last checkpoint");
        assertEq(registry.stakeAt(operator1, tForf + 1000, 4), 100e18, "just after last (valid hint)");
        assertEq(registry.stakeAt(operator1, type(uint64).max, 0), 100e18, "far future (fallback)");
        assertEq(registry.stakeAt(operator1, type(uint64).max, 9999), 100e18, "far future (bad hint)");
    }

    /// @dev Multiple mutations in the SAME block collapse onto one checkpoint carrying the final
    ///      value (same-block rewrite), and the read reflects that final value.
    function test_stakeAt_sameBlockMutations_collapseToFinalValue() public {
        // register + delegate at the same timestamp (no warp between).
        vm.warp(block.timestamp + 1 days);
        uint256 selfId = _createTo(operator1, MIN_OPERATOR_STAKE);
        vm.prank(operator1);
        registry.register(selfId);

        uint256 delId = _createTo(staker1, DEL1);
        vm.prank(staker1);
        registry.delegate(operator1, delId);

        uint64 tNow = uint64(block.timestamp);
        // Both mutations shared this timestamp; the trace's tail carries the final 300e18.
        assertEq(registry.stakeAt(operator1, tNow, 0), MIN_OPERATOR_STAKE + DEL1, "same-block -> final value");
        // The hint that would point at a phantom "second" checkpoint is out of range; fallback
        // still returns the collapsed value.
        assertEq(registry.stakeAt(operator1, tNow, 1), MIN_OPERATOR_STAKE + DEL1, "collapsed, hint 1 out of range");
    }
}
