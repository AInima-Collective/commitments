// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import {IFlowQuery, AvailableDenom} from "src/extensions/mesh/interfaces/IFlowQuery.sol";
import {IFlowQueryPath, DenomLink, InvalidDepth} from "src/extensions/mesh/interfaces/IFlowQueryPath.sol";

/// @title FlowPathLib
/// @notice Shared upstream-walk implementation for IFlowQueryPath.
///         Walks the denom-provenance chain from a node's local denom toward
///         the vault root, with cycle defense and non-mesh-provider tolerance.
library FlowPathLib {
    /// @notice Hard upper bound on `maxDepth` accepted by `walk`.
    /// @dev Linear-scan cycle detection is O(d²); 64 keeps that manageable
    ///      (~4k comparisons worst case, dwarfed by external-call costs).
    uint16 internal constant MAX_PATH_DEPTH = 64;

    /// @notice Walk the denom-provenance chain upstream from a local denom on `node`.
    /// @dev See IFlowQueryPath for the four-terminus model and cycle/non-mesh contract.
    /// @param node The starting mesh node (typically `this` when called from a node's
    ///        own `denomPath` implementation, or any IFlowQuery node when called from
    ///        an external helper).
    /// @param startLocal The local denom on `node` to trace.
    /// @param maxDepth Maximum path length to return.
    /// @return path Walked path in source-walked order.
    function walk(IFlowQuery node, bytes32 startLocal, uint16 maxDepth)
        internal
        view
        returns (DenomLink[] memory path)
    {
        if (maxDepth == 0 || maxDepth > MAX_PATH_DEPTH) revert InvalidDepth(maxDepth);

        DenomLink[] memory buf = new DenomLink[](maxDepth);
        uint256 len;

        // Entry 0: starting node + input denom + its nodeType.
        // We trust `node` is a valid IFlowQuery here because the caller (the
        // node's own `denomPath`) already implements it. Helpers should
        // validate before calling.
        bytes32 startType = node.nodeType();
        buf[0] = DenomLink({provider: address(node), denom: startLocal, nodeType: startType});
        len = 1;

        address curProvider = address(node);
        bytes32 curDenom = startLocal;

        while (len < maxDepth) {
            // Find the upstream link from current entry by inspecting the
            // current node's availableDenoms set. We use the unbounded
            // variant for simplicity; pagination is a per-node optimization
            // we can layer later if some node ever has so many denoms that
            // the walk OOG's. The walk is read-only, so the cost is on the
            // caller.
            (address srcProvider, bytes32 srcDenom, bool found) = _findUpstream(IFlowQuery(curProvider), curDenom);

            if (!found) {
                // The current denom is not present on the current node's
                // availableDenoms set, or its upstream lookup failed. We
                // treat this as a terminal with no sentinel — the absence
                // of a trailing (0, 0, 0) entry distinguishes this from the
                // explicit vault-rooted case below.
                break;
            }

            if (srcProvider == address(0)) {
                // Explicit vault-rooted terminus: the node states the denom
                // has no upstream source. Push a (0, 0, 0) sentinel so the
                // caller can see the explicit terminus.
                buf[len] = DenomLink({provider: address(0), denom: bytes32(0), nodeType: bytes32(0)});
                len++;
                break;
            }

            // Probe source for IFlowQuery support. We need both an extcodesize
            // check AND a try/catch:
            //   - extcodesize == 0 (EOA): Solidity 0.8 raises a non-catchable
            //     panic when calling a function that returns data on an
            //     address with no code, so we must short-circuit here before
            //     the call.
            //   - extcodesize > 0 but no IFlowQuery: try/catch catches a
            //     normal revert from the called contract.
            //   - extcodesize > 0 with IFlowQuery: read nodeType and continue.
            bytes32 srcNodeType;
            bool srcIsMesh;
            if (srcProvider.code.length > 0) {
                try IFlowQuery(srcProvider).nodeType() returns (bytes32 nt) {
                    srcNodeType = nt;
                    srcIsMesh = true;
                } catch {
                    // Has code but does not implement IFlowQuery.
                }
            }
            if (!srcIsMesh) {
                // Non-mesh provider (EOA, vault, registry, or any contract
                // that does not expose IFlowQuery). Record and stop.
                buf[len] = DenomLink({provider: srcProvider, denom: srcDenom, nodeType: bytes32(0)});
                len++;
                break;
            }

            // Cycle check via linear scan over the accumulated path.
            bool isCycle;
            for (uint256 i; i < len; i++) {
                if (buf[i].provider == srcProvider && buf[i].denom == srcDenom) {
                    isCycle = true;
                    break;
                }
            }

            // Push the upstream link unconditionally (cycle case included so
            // the caller can see the duplicate).
            buf[len] = DenomLink({provider: srcProvider, denom: srcDenom, nodeType: srcNodeType});
            len++;

            if (isCycle) break;

            curProvider = srcProvider;
            curDenom = srcDenom;
        }

        return _trim(buf, len);
    }

    /// @dev Look up the upstream provider/denom for a given local denom on a node.
    ///      Returns `(0, 0, false)` when `local` is not present in the node's
    ///      availableDenoms set, or `(0, 0, true)` for a vault-rooted denom
    ///      whose source is the zero address.
    function _findUpstream(IFlowQuery node, bytes32 local)
        private
        view
        returns (address sourceProvider, bytes32 sourceDenom, bool found)
    {
        // A non-mesh `node` would have already failed earlier (via the
        // try/catch on nodeType). Here we trust that `node` is a mesh node
        // and call `availableDenoms()` directly. If it reverts despite the
        // earlier nodeType success, we propagate — that's a misbehaving
        // implementation, not a graceful terminus.
        AvailableDenom[] memory denoms = node.availableDenoms();
        for (uint256 i; i < denoms.length; i++) {
            if (denoms[i].local == local) {
                return (denoms[i].sourceProvider, denoms[i].sourceDenom, true);
            }
        }
        return (address(0), bytes32(0), false);
    }

    function _trim(DenomLink[] memory buf, uint256 len) private pure returns (DenomLink[] memory) {
        if (len == buf.length) return buf;
        DenomLink[] memory result = new DenomLink[](len);
        for (uint256 i; i < len; i++) {
            result[i] = buf[i];
        }
        return result;
    }
}
