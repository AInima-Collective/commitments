// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import {IFlowQuery} from "src/extensions/mesh/interfaces/IFlowQuery.sol";

/// @notice One link in a denom-provenance chain.
/// @dev `provider == address(0)` and `nodeType == bytes32(0)` together signal a
///      vault-rooted terminal sentinel. Other terminal cases (non-mesh provider,
///      cycle, depth limit) are distinguishable by inspecting the path itself.
struct DenomLink {
    address provider; // mesh node holding this denom; address(0) for vault-rooted sentinel
    bytes32 denom; // local denom on `provider`
    bytes32 nodeType; // FAN_IN / FAN_OUT / TOKEN_WEIGHTING / 0 for vault-rooted; custom values per IFlowQuery
}

/// @title IFlowQueryPath
/// @notice Opt-in extension to IFlowQuery for single-call denom-provenance walks.
///         RECOMMENDED for production graphs >2 deep; clients can detect support
///         via try/catch on `denomPath` (this codebase does not use ERC165).
///
///         The walked path includes the input denom as entry 0 and walks upstream
///         until one of these termini, distinguishable from the path itself:
///
///         - **Explicit vault-rooted**: trailing entry has `provider == 0` and
///           `nodeType == 0`. The node stated the denom has no upstream source.
///         - **Non-mesh provider**: trailing entry has `provider != 0` and
///           `nodeType == 0`. The walk reached an address that does not
///           implement IFlowQuery (typical for an EOA depositor or a
///           CommitmentsVault).
///         - **Cycle**: trailing entry duplicates an earlier `(provider, denom)`
///           pair already in the path. Cycle break is the only case where two
///           entries share `(provider, denom)`.
///         - **Depth limit**: `path.length == maxDepth` and the last entry's
///           `nodeType != 0`. The chain extends further but was truncated.
///         - **Implicit terminus / unknown denom**: `path.length < maxDepth`
///           and there is no trailing sentinel. Either the input denom did not
///           exist on the starting node, or some intermediate node returned
///           no upstream entry for its current denom.
interface IFlowQueryPath is IFlowQuery {
    /// @notice Maximum depth this implementation supports for `denomPath`.
    /// @dev SHOULD be 64 unless the implementation has a documented reason
    ///      for a tighter bound. Reading this lets callers size requests
    ///      without trial-and-error reverts.
    function MAX_PATH_DEPTH() external view returns (uint16);

    /// @notice Walk the denom-provenance chain upstream from a local denom.
    /// @dev MUST NOT revert on cycles, non-mesh providers, or natural termini —
    ///      these are reported by the returned path's terminal entry. MUST
    ///      revert with `InvalidDepth` only on out-of-range `maxDepth`.
    /// @param local The local denom on this node to trace.
    /// @param maxDepth Maximum chain length to traverse; MUST satisfy
    ///        `1 <= maxDepth <= MAX_PATH_DEPTH()`.
    /// @return path The walked path in source-walked order. Length <= maxDepth.
    ///         The last entry's `provider == address(0)` indicates vault-rooted
    ///         termination. Otherwise the chain was truncated by a non-mesh
    ///         provider, a cycle, or the depth limit; callers distinguish by
    ///         inspecting the path itself.
    function denomPath(bytes32 local, uint16 maxDepth) external view returns (DenomLink[] memory path);
}

/// @notice Reverts when `denomPath` receives an out-of-range `maxDepth`.
error InvalidDepth(uint16 maxDepth);
