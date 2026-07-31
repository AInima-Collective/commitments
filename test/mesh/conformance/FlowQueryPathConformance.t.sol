// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import {Test} from "forge-std/Test.sol";
import {Clones} from "@openzeppelin/contracts/proxy/Clones.sol";

import {FanInNode} from "src/extensions/mesh/FanInNode.sol";
import {FanOutNode} from "src/extensions/mesh/FanOutNode.sol";
import {TokenWeighting} from "src/extensions/mesh/TokenWeighting.sol";

import {FlowPathLib} from "src/extensions/mesh/libraries/FlowPathLib.sol";
import {IFlowQueryPath, DenomLink, InvalidDepth} from "src/extensions/mesh/interfaces/IFlowQueryPath.sol";
import {FlowNodeTypes} from "src/extensions/mesh/interfaces/IFlowQuery.sol";

import {Outflow} from "src/extensions/mesh/interfaces/IFanOut.sol";
import {MockConsumer} from "../../helpers/MockConsumer.sol";

/// @title FlowQueryPathConformanceBase
/// @notice Behavior any IFlowQueryPath implementation MUST satisfy. Subclasses
///         deploy and configure a concrete node type, then inherit these tests.
///         Each subclass's `setUp` MUST populate `node`, `KNOWN_DENOM`, and
///         `knownProvider` (an EOA — non-mesh — for the single-step terminus
///         test).
abstract contract FlowQueryPathConformanceBase is Test {
    IFlowQueryPath internal node;
    bytes32 internal KNOWN_DENOM;
    address internal knownProvider;
    bytes32 internal expectedNodeType;

    bytes32 internal constant UNKNOWN_DENOM = keccak256("conformance:unknown");

    // ============================================================
    // CONFORMANCE TESTS
    // ============================================================

    /// @notice Walk a registered denom whose source is a non-mesh address.
    ///         Result MUST be 2 entries: starting node + non-mesh terminus.
    function test_conformance_walkSingleStep_nonMeshTerminus() public view {
        DenomLink[] memory path = node.denomPath(KNOWN_DENOM, 8);

        assertEq(path.length, 2, "single-step path length");
        assertEq(path[0].provider, address(node), "entry 0 provider");
        assertEq(path[0].denom, KNOWN_DENOM, "entry 0 denom");
        assertEq(path[0].nodeType, expectedNodeType, "entry 0 nodeType");
        assertEq(path[1].provider, knownProvider, "entry 1 provider");
        assertEq(path[1].nodeType, bytes32(0), "non-mesh terminus has nodeType == 0");
    }

    /// @notice Walking a denom NOT in availableDenoms returns a single-entry
    ///         path with no trailing sentinel. Distinguishes the implicit-terminus
    ///         case from explicit vault-rooted (`(0,0,0)` sentinel).
    function test_conformance_unregisteredDenom_returnsSingleEntry() public view {
        DenomLink[] memory path = node.denomPath(UNKNOWN_DENOM, 8);

        assertEq(path.length, 1, "unknown-denom: single entry");
        assertEq(path[0].provider, address(node));
        assertEq(path[0].denom, UNKNOWN_DENOM);
        assertEq(path[0].nodeType, expectedNodeType);
    }

    function test_conformance_zeroDepth_reverts() public {
        vm.expectRevert(abi.encodeWithSelector(InvalidDepth.selector, uint16(0)));
        node.denomPath(KNOWN_DENOM, 0);
    }

    function test_conformance_overMaxDepth_reverts() public {
        uint16 over = node.MAX_PATH_DEPTH() + 1;
        vm.expectRevert(abi.encodeWithSelector(InvalidDepth.selector, over));
        node.denomPath(KNOWN_DENOM, over);
    }

    function test_conformance_MAX_PATH_DEPTH_matchesLib() public view {
        assertEq(node.MAX_PATH_DEPTH(), FlowPathLib.MAX_PATH_DEPTH);
    }

    /// @notice Entry 0 invariant: regardless of registration state, entry 0
    ///         is always (this, local, this.nodeType()).
    function test_conformance_entry0_invariant() public view {
        DenomLink[] memory path = node.denomPath(KNOWN_DENOM, 1);
        assertEq(path.length, 1);
        assertEq(path[0].provider, address(node));
        assertEq(path[0].denom, KNOWN_DENOM);
        assertEq(path[0].nodeType, expectedNodeType);
    }
}

// ============================================================
// FanInNode conformance
// ============================================================

contract FanInPathConformance is FlowQueryPathConformanceBase {
    FanInNode internal fanIn;
    MockConsumer internal consumer;
    address internal manager = address(0x1A);
    address internal eoaProvider = address(0xE0A);

    bytes32 internal constant DENOM_IN = keccak256("in");
    bytes32 internal constant DENOM_OUT = keccak256("out");

    function setUp() public {
        address impl = address(new FanInNode());
        fanIn = FanInNode(Clones.clone(impl));
        consumer = new MockConsumer();
        fanIn.initialize(address(consumer), manager);

        vm.prank(manager);
        fanIn.registerProvider(eoaProvider, DENOM_IN, DENOM_OUT, 1000, 7 days);

        node = IFlowQueryPath(address(fanIn));
        KNOWN_DENOM = DENOM_OUT;
        knownProvider = eoaProvider;
        expectedNodeType = FlowNodeTypes.FAN_IN;
    }
}

// ============================================================
// FanOutNode conformance
// ============================================================

contract FanOutPathConformance is FlowQueryPathConformanceBase {
    FanOutNode internal fanOut;
    address internal manager = address(0x2A);
    address internal eoaProvider = address(0xE0B);

    bytes32 internal constant DENOM = keccak256("conformance:fanout-denom");

    function setUp() public {
        address impl = address(new FanOutNode());
        fanOut = FanOutNode(Clones.clone(impl));
        // Phase 21.1 signature: provider, manager, inputMaxPenaltyBps.
        fanOut.initializeWithPenalty(eoaProvider, manager, 5000);

        // Populate the denom set by recording stake (accounting only — no
        // tokens move in FanOutNode.stake).
        vm.prank(eoaProvider);
        fanOut.stake(DENOM, 1000e18);

        node = IFlowQueryPath(address(fanOut));
        KNOWN_DENOM = DENOM;
        knownProvider = eoaProvider;
        expectedNodeType = FlowNodeTypes.FAN_OUT;
    }
}

// ============================================================
// TokenWeighting conformance
// ============================================================

contract TokenWeightingPathConformance is FlowQueryPathConformanceBase {
    TokenWeighting internal tw;
    address internal governance = address(0x3A);
    address internal eoaProvider = address(0xE0C);
    address internal staker = address(0xC0FFEE);

    bytes32 internal constant DENOM = keccak256("conformance:tw-denom");

    function setUp() public {
        address impl = address(new TokenWeighting());
        tw = TokenWeighting(Clones.clone(impl));
        tw.initialize(eoaProvider, governance);

        // Populate the denom set by recording stake on behalf of a staker.
        vm.prank(eoaProvider);
        tw.stake(staker, DENOM, 1000e18);

        node = IFlowQueryPath(address(tw));
        KNOWN_DENOM = DENOM;
        knownProvider = eoaProvider;
        expectedNodeType = FlowNodeTypes.TOKEN_WEIGHTING;
    }
}

// ============================================================
// Cross-node integration walk
// ============================================================

/// @notice Exercises the multi-hop walk across two distinct mesh node types.
///         Topology: TokenWeighting TW with provider = FanOut F; F's provider
///         is an EOA. Walking TW.denomPath(DENOM, 8) traverses TW → F → EOA
///         and returns 3 entries with the FanOut hop's nodeType set to
///         FAN_OUT (proving the try/catch nodeType probe works for cross-node
///         hops, not just single-step EOA termini).
contract CrossNodeWalkIntegration is Test {
    TokenWeighting internal tw;
    FanOutNode internal fanOut;
    address internal governance = address(0x4A);
    address internal eoaProvider = address(0xE0D);
    address internal staker = address(0xC0FFEE);

    bytes32 internal constant DENOM = keccak256("integration:cross-node");

    function setUp() public {
        // Deploy FanOut: provider = EOA, manager = governance.
        address foImpl = address(new FanOutNode());
        fanOut = FanOutNode(Clones.clone(foImpl));
        fanOut.initializeWithPenalty(eoaProvider, governance, 5000);
        // Record a stake so DENOM appears on FanOut's availableDenoms.
        vm.prank(eoaProvider);
        fanOut.stake(DENOM, 1000e18);

        // Deploy TokenWeighting: provider = FanOut, governance = governance.
        address twImpl = address(new TokenWeighting());
        tw = TokenWeighting(Clones.clone(twImpl));
        tw.initialize(address(fanOut), governance);
        // Record a stake from FanOut on behalf of staker so DENOM appears on
        // TokenWeighting's availableDenoms with sourceProvider = FanOut.
        vm.prank(address(fanOut));
        tw.stake(staker, DENOM, 1000e18);
    }

    function test_crossNodeWalk_TwoHopsToEoa() public view {
        DenomLink[] memory path = tw.denomPath(DENOM, 8);

        assertEq(path.length, 3, "TW -> FO -> EOA = 3 entries");

        // entry 0: TokenWeighting (this) with TOKEN_WEIGHTING type
        assertEq(path[0].provider, address(tw));
        assertEq(path[0].denom, DENOM);
        assertEq(path[0].nodeType, FlowNodeTypes.TOKEN_WEIGHTING, "entry 0 nodeType");

        // entry 1: FanOut hop with FAN_OUT type — this is what proves the
        // multi-hop try/catch on nodeType actually works
        assertEq(path[1].provider, address(fanOut), "entry 1 provider = FanOut");
        assertEq(path[1].denom, DENOM);
        assertEq(path[1].nodeType, FlowNodeTypes.FAN_OUT, "entry 1 nodeType = FAN_OUT");

        // entry 2: EOA non-mesh terminus
        assertEq(path[2].provider, eoaProvider, "entry 2 provider = EOA");
        assertEq(path[2].nodeType, bytes32(0), "EOA terminus has nodeType == 0");
    }

    /// @notice Same chain but maxDepth = 2 truncates before reaching the EOA.
    ///         Last entry's nodeType is FAN_OUT (still a mesh node), and there
    ///         is no trailing sentinel — distinguishes truncation from terminus.
    function test_crossNodeWalk_truncatedAtFanOut() public view {
        DenomLink[] memory path = tw.denomPath(DENOM, 2);

        assertEq(path.length, 2, "truncated to 2 entries");
        assertEq(path[0].provider, address(tw));
        assertEq(path[1].provider, address(fanOut));
        assertEq(path[1].nodeType, FlowNodeTypes.FAN_OUT, "depth-limit terminus is mesh");
    }
}
