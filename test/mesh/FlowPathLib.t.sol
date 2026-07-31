// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import {Test} from "forge-std/Test.sol";
import {Clones} from "@openzeppelin/contracts/proxy/Clones.sol";
import {FanInNode} from "src/extensions/mesh/FanInNode.sol";
import {FlowPathLib} from "src/extensions/mesh/libraries/FlowPathLib.sol";
import {DenomLink, InvalidDepth} from "src/extensions/mesh/interfaces/IFlowQueryPath.sol";
import {FlowNodeTypes} from "src/extensions/mesh/interfaces/IFlowQuery.sol";
import {MockConsumer} from "../helpers/MockConsumer.sol";

/// @notice Unit tests for FlowPathLib via FanInNode. Other mesh nodes (FanOut,
///         TokenWeighting) get wired in iter B; this test file pins the
///         algorithmic behavior of the library against a single representative
///         node type.
contract FlowPathLibTest is Test {
    FanInNode public node;
    MockConsumer public consumer;

    address public manager = address(0x1);
    address public eoaProvider = address(0xE0A); // Non-mesh provider (EOA-like)
    address public unauthorized = address(0x9);

    bytes32 public constant DENOM_X = keccak256("X");
    bytes32 public constant DENOM_Y = keccak256("Y");
    bytes32 public constant DENOM_Z = keccak256("Z");
    bytes32 public constant DENOM_OUT_1 = keccak256("out1");

    uint16 public constant MAX_PENALTY = 1000;
    uint64 public constant UNBONDING_PERIOD = 7 days;

    function setUp() public {
        address impl = address(new FanInNode());
        node = FanInNode(Clones.clone(impl));
        consumer = new MockConsumer();
        node.initialize(address(consumer), manager);
    }

    // ============================================================
    // BASIC: NON-MESH PROVIDER TERMINUS (the typical real-world case)
    // ============================================================

    /// @notice The dominant real-world terminus: a denom whose source is an
    ///         EOA depositor (or any non-mesh contract). Walk should stop at
    ///         depth 1 with the EOA recorded and `nodeType == 0`.
    function test_walk_singleStep_nonMeshTerminus() public {
        vm.prank(manager);
        node.registerProvider(eoaProvider, DENOM_X, DENOM_OUT_1, MAX_PENALTY, UNBONDING_PERIOD);

        DenomLink[] memory path = node.denomPath(DENOM_OUT_1, 8);

        assertEq(path.length, 2, "path length");
        // entry 0: starting node + input denom + this node's nodeType
        assertEq(path[0].provider, address(node));
        assertEq(path[0].denom, DENOM_OUT_1);
        assertEq(path[0].nodeType, FlowNodeTypes.FAN_IN);
        // entry 1: EOA provider, nodeType == 0 (non-mesh terminus)
        assertEq(path[1].provider, eoaProvider);
        assertEq(path[1].denom, DENOM_X);
        assertEq(path[1].nodeType, bytes32(0));
    }

    // ============================================================
    // CYCLE DETECTION
    // ============================================================

    /// @notice A→A 2-cycle: register the FanIn as its own provider with crossed
    ///         denoms. Walking from one denom should detect the cycle and stop.
    function test_walk_breaksOnTwoCycle() public {
        // (A, denomIn=X) → denomOut=DENOM_OUT_1
        // (A, denomIn=DENOM_OUT_1) → denomOut=X — but X is not a registered output
        //   yet, so register a third entry that closes the loop.
        // Cleaner: register (A, X) → Y; (A, Y) → X. Walking from X loops back to X.
        vm.startPrank(manager);
        node.registerProvider(address(node), DENOM_X, DENOM_Y, MAX_PENALTY, UNBONDING_PERIOD);
        node.registerProvider(address(node), DENOM_Y, DENOM_X, MAX_PENALTY, UNBONDING_PERIOD);
        vm.stopPrank();

        DenomLink[] memory path = node.denomPath(DENOM_Y, 8);

        // Expected: [
        //   (node, Y, FAN_IN),
        //   (node, X, FAN_IN),  // upstream of Y
        //   (node, Y, FAN_IN),  // upstream of X = Y, cycle dup
        // ]
        assertEq(path.length, 3, "path length on 2-cycle");
        assertEq(path[0].provider, address(node));
        assertEq(path[0].denom, DENOM_Y);
        assertEq(path[1].provider, address(node));
        assertEq(path[1].denom, DENOM_X);
        assertEq(path[2].provider, address(node));
        assertEq(path[2].denom, DENOM_Y, "cycle dup denom");
        assertEq(path[2].nodeType, FlowNodeTypes.FAN_IN);
    }

    /// @notice Cycle exceeds maxDepth: a 2-cycle walked with maxDepth=2 should
    ///         truncate at depth 2 without reaching the cycle dup.
    function test_walk_truncatedByMaxDepthBeforeCycle() public {
        vm.startPrank(manager);
        node.registerProvider(address(node), DENOM_X, DENOM_Y, MAX_PENALTY, UNBONDING_PERIOD);
        node.registerProvider(address(node), DENOM_Y, DENOM_X, MAX_PENALTY, UNBONDING_PERIOD);
        vm.stopPrank();

        DenomLink[] memory path = node.denomPath(DENOM_Y, 2);

        // Truncated: [(node, Y), (node, X)] — no cycle dup pushed.
        assertEq(path.length, 2, "truncation length");
        assertEq(path[0].denom, DENOM_Y);
        assertEq(path[1].denom, DENOM_X);
        assertEq(path[1].nodeType, FlowNodeTypes.FAN_IN, "depth-limit terminus has nodeType != 0");
    }

    // ============================================================
    // DEPTH BOUNDS
    // ============================================================

    function test_walk_revertsOnZeroDepth() public {
        vm.prank(manager);
        node.registerProvider(eoaProvider, DENOM_X, DENOM_OUT_1, MAX_PENALTY, UNBONDING_PERIOD);

        vm.expectRevert(abi.encodeWithSelector(InvalidDepth.selector, uint16(0)));
        node.denomPath(DENOM_OUT_1, 0);
    }

    function test_walk_revertsAboveMaxPathDepth() public {
        vm.prank(manager);
        node.registerProvider(eoaProvider, DENOM_X, DENOM_OUT_1, MAX_PENALTY, UNBONDING_PERIOD);

        uint16 over = FlowPathLib.MAX_PATH_DEPTH + 1;
        vm.expectRevert(abi.encodeWithSelector(InvalidDepth.selector, over));
        node.denomPath(DENOM_OUT_1, over);
    }

    // ============================================================
    // UNKNOWN / UNREGISTERED DENOM
    // ============================================================

    /// @notice Asking for a denom not in the node's availableDenoms set returns
    ///         a single-entry path: [(node, denom, nodeType)] with no upstream.
    ///         No trailing sentinel — distinguishes from explicit vault-rooted.
    function test_walk_unregisteredDenom_returnsSingleEntry() public view {
        DenomLink[] memory path = node.denomPath(DENOM_Z, 8);

        assertEq(path.length, 1, "unknown denom: single-entry path");
        assertEq(path[0].provider, address(node));
        assertEq(path[0].denom, DENOM_Z);
        assertEq(path[0].nodeType, FlowNodeTypes.FAN_IN);
    }

    // ============================================================
    // CONSTANT
    // ============================================================

    function test_MAX_PATH_DEPTH_constant_is64() public view {
        assertEq(node.MAX_PATH_DEPTH(), 64);
        assertEq(FlowPathLib.MAX_PATH_DEPTH, 64);
    }

    // ============================================================
    // ENTRY-0 SHAPE
    // ============================================================

    /// @notice Entry 0 is always (this, local, this.nodeType()) regardless of
    ///         whether `local` exists. Pinned to lock the contract.
    function test_walk_entry0_alwaysStartingNodeAndDenom() public {
        DenomLink[] memory path1 = node.denomPath(DENOM_Z, 1);
        assertEq(path1.length, 1);
        assertEq(path1[0].provider, address(node));
        assertEq(path1[0].denom, DENOM_Z);
        assertEq(path1[0].nodeType, FlowNodeTypes.FAN_IN);

        // Same shape with a registered denom and depth=1 (truncated before
        // upstream is pushed).
        vm.prank(manager);
        node.registerProvider(eoaProvider, DENOM_X, DENOM_OUT_1, MAX_PENALTY, UNBONDING_PERIOD);
        DenomLink[] memory path2 = node.denomPath(DENOM_OUT_1, 1);
        assertEq(path2.length, 1);
        assertEq(path2[0].provider, address(node));
        assertEq(path2[0].denom, DENOM_OUT_1);
        assertEq(path2[0].nodeType, FlowNodeTypes.FAN_IN);
    }
}
