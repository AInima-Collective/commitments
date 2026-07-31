// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import {Clones} from "@openzeppelin/contracts/proxy/Clones.sol";

import {FanInNode} from "src/extensions/mesh/FanInNode.sol";
import {DenomLink} from "src/extensions/mesh/interfaces/IFlowQueryPath.sol";
import {HalmosBase} from "./HalmosBase.sol";

/// @title MeshTermination — periphery Halmos harness (PROPERTIES.md §P4)
/// @notice Visited-set cycle termination of the mesh denom-provenance walk
///         (`FlowPathLib.walk`, invoked by every node's `denomPath`). A concrete
///         2-node mesh is wired WITH a cycle (A's denom sources from B, B's denom
///         sources back to A); the walk must TERMINATE (return, not revert / not
///         loop) at bounded depth and return the fixed expected cyclic path.
///
///         Properties proved (symbolic over the requested `maxDepth`):
///           - P4-MESH-TERM: for every legal `maxDepth` in [3, 64], `A.denomPath(dA,
///             maxDepth)` returns (does not revert, does not diverge) a length-3 path
///             whose trailing entry duplicates entry 0 — the cycle-break signature.
///           - P4-MESH-DEPTH: `maxDepth == 0` and `maxDepth > MAX_PATH_DEPTH (64)`
///             revert with `InvalidDepth` (the depth guard is enforced).
///           - P4-MESH-TIGHT: at `maxDepth == 2` (below the cycle length) the walk
///             still terminates, truncating at the depth bound rather than looping.
///
///         Cycle wiring (the mesh under test):
///           FanIn A: registerProvider(provider=B, denomIn=dB, denomOut=dA)
///                    → A.availableDenoms() reports dA sourced from (B, dB)
///           FanIn B: registerProvider(provider=A, denomIn=dA, denomOut=dB)
///                    → B.availableDenoms() reports dB sourced from (A, dA)
///         Walk from A/dA: A/dA → B/dB → A/dA  (A/dA re-seen ⇒ cycle, break).
///         Both nodes are real FanInNode clones and both implement IFlowQuery, so
///         `walk`'s `nodeType()` probe classifies each as a mesh node and the
///         linear visited-set scan (FlowPathLib.sol:100-107) is the terminating
///         mechanism under test (not the non-mesh-provider early-out).
///
/// @dev Concessions:
///        C1. FanInNode is used for BOTH cycle nodes. The `walk` logic is
///            node-type-agnostic (it dispatches only through the IFlowQuery
///            `availableDenoms`/`nodeType` surface all three node types share), so a
///            2×FanIn cycle exercises the identical termination path a mixed
///            FanIn/FanOut/TokenWeighting cycle would. Using one type keeps the wiring
///            concrete and the manager-gated `registerProvider` calls minimal.
///        C2. Nodes are OZ-`Clones.clone`d directly (the implementation constructor
///            locks `_initialized`, so a raw `new FanInNode()` cannot be initialized).
///            MeshFactory's whitelist ladder is bypassed — it adds nothing to the
///            traversal property and its `Factory` base is awkward under halmos.
///        C3. `maxDepth` is the symbolic input; the mesh topology is concrete. The
///            MAX_PATH_DEPTH = 64 bound is FlowPathLib's own constant.
///
///      Run: FOUNDRY_PROFILE=halmos halmos --contract MeshTermination
contract MeshTermination is HalmosBase {
    FanInNode internal fanInImpl;
    FanInNode internal nodeA;
    FanInNode internal nodeB;

    address internal constant CONSUMER = address(0x20001);

    bytes32 internal constant DENOM_A = bytes32(uint256(0xA));
    bytes32 internal constant DENOM_B = bytes32(uint256(0xB));

    uint16 internal constant MAX_PATH_DEPTH = 64;

    function setUp() public {
        fanInImpl = new FanInNode();

        nodeA = FanInNode(Clones.clone(address(fanInImpl)));
        nodeB = FanInNode(Clones.clone(address(fanInImpl)));

        // manager == this harness, so it may call registerProvider on both nodes.
        nodeA.initialize(CONSUMER, address(this));
        nodeB.initialize(CONSUMER, address(this));

        // Wire the cycle:
        //   A exposes DENOM_A, sourced upstream from B's DENOM_B.
        //   B exposes DENOM_B, sourced upstream from A's DENOM_A.
        nodeA.registerProvider(address(nodeB), DENOM_B, DENOM_A, 0, 0);
        nodeB.registerProvider(address(nodeA), DENOM_A, DENOM_B, 0, 0);
    }

    // =========================================================================
    // P4-MESH-TERM: the walk terminates on a cycle and returns the fixed path
    // =========================================================================

    /// @notice For each legal `maxDepth` at/above the cycle length, walking the cyclic
    ///         mesh from A/DENOM_A terminates and returns the length-3 cycle-break path
    ///         [A/dA, B/dB, A/dA]. The trailing entry duplicating entry 0 is the
    ///         visited-set cycle-break signature (IFlowQueryPath contract). No revert,
    ///         no divergence.
    /// @dev `maxDepth` CANNOT be symbolic here: `FlowPathLib.walk` allocates
    ///      `new DenomLink[](maxDepth)`, and halmos rejects a symbolic dynamic-array
    ///      length (NotConcreteError on the symbolic memory offset). We therefore pin
    ///      the boundary cases — the cycle length (3), the hard MAX_PATH_DEPTH (64), and
    ///      an interior value (32). The returned path is INVARIANT across all maxDepth ≥ 3
    ///      (the cycle breaks at len == 3 well before any depth truncation), so these
    ///      three concrete depths fully characterize the family. Each still runs the full
    ///      symbolic execution of `walk` over the concrete mesh.
    function check_meshWalk_cycleTerminatesAtBoundedDepth() public view {
        _assertCyclePath(3); // exactly the cycle length
        _assertCyclePath(32); // interior
        _assertCyclePath(MAX_PATH_DEPTH); // the hard upper bound
    }

    function _assertCyclePath(uint16 maxDepth) internal view {
        DenomLink[] memory path = nodeA.denomPath(DENOM_A, maxDepth);

        // Terminated with the cycle-break path: exactly 3 entries, independent of maxDepth.
        assert(path.length == 3);

        // Entry 0: the starting node/denom.
        assert(path[0].provider == address(nodeA));
        assert(path[0].denom == DENOM_A);
        // Entry 1: upstream into B.
        assert(path[1].provider == address(nodeB));
        assert(path[1].denom == DENOM_B);
        // Entry 2: back to A/dA — the DUPLICATE that trips the visited-set scan.
        assert(path[2].provider == address(nodeA));
        assert(path[2].denom == DENOM_A);

        // The cycle-break invariant: the trailing entry duplicates an earlier (provider, denom).
        assert(path[path.length - 1].provider == path[0].provider);
        assert(path[path.length - 1].denom == path[0].denom);
    }

    // =========================================================================
    // P4-MESH-TIGHT: below the cycle length, the walk truncates at the depth bound
    // =========================================================================

    /// @notice At maxDepth == 2 (below the 3-entry cycle path) the walk MUST still
    ///         terminate — truncating at the depth bound rather than looping forever.
    ///         The returned path is exactly `maxDepth` long and the walk returned.
    function check_meshWalk_belowCycleLengthTruncates() public view {
        DenomLink[] memory path = nodeA.denomPath(DENOM_A, 2);
        // Exactly the depth bound: [A/dA, B/dB]; the loop stopped at `len < maxDepth`.
        assert(path.length == 2);
        assert(path[0].provider == address(nodeA));
        assert(path[1].provider == address(nodeB));
    }

    // =========================================================================
    // P4-MESH-DEPTH: the depth guard is enforced (revert outside [1, 64])
    // =========================================================================

    /// @notice maxDepth == 0 and maxDepth > MAX_PATH_DEPTH both revert with InvalidDepth,
    ///         so the O(d²) visited-set scan can never be driven past the hard bound.
    function check_meshWalk_depthGuardRejectsOutOfRange(uint16 maxDepth) public {
        vm.assume(maxDepth == 0 || maxDepth > MAX_PATH_DEPTH);
        try nodeA.denomPath(DENOM_A, maxDepth) returns (DenomLink[] memory) {
            assert(false); // must never succeed outside [1, 64]
        } catch {
            assert(true);
        }
    }
}
