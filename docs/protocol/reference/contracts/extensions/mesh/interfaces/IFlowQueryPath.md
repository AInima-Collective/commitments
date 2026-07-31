---
title: IFlowQueryPath
status: generated
source: src/extensions/mesh/interfaces/IFlowQueryPath.sol
generated: true
---
# IFlowQueryPath
**Inherits:**
[IFlowQuery](/docs/protocol/reference/contracts/extensions/mesh/interfaces/IFlowQuery)

**Title:**
IFlowQueryPath

Opt-in extension to IFlowQuery for single-call denom-provenance walks.
RECOMMENDED for production graphs >2 deep; clients can detect support
via try/catch on `denomPath` (this codebase does not use ERC165).
The walked path includes the input denom as entry 0 and walks upstream
until one of these termini, distinguishable from the path itself:
- **Explicit vault-rooted**: trailing entry has `provider == 0` and
`nodeType == 0`. The node stated the denom has no upstream source.
- **Non-mesh provider**: trailing entry has `provider != 0` and
`nodeType == 0`. The walk reached an address that does not
implement IFlowQuery (typical for an EOA depositor or a
CommitmentsVault).
- **Cycle**: trailing entry duplicates an earlier `(provider, denom)`
pair already in the path. Cycle break is the only case where two
entries share `(provider, denom)`.
- **Depth limit**: `path.length == maxDepth` and the last entry's
`nodeType != 0`. The chain extends further but was truncated.
- **Implicit terminus / unknown denom**: `path.length < maxDepth`
and there is no trailing sentinel. Either the input denom did not
exist on the starting node, or some intermediate node returned
no upstream entry for its current denom.


## Functions
### MAX_PATH_DEPTH

Maximum depth this implementation supports for `denomPath`.

SHOULD be 64 unless the implementation has a documented reason
for a tighter bound. Reading this lets callers size requests
without trial-and-error reverts.


```solidity
function MAX_PATH_DEPTH() external view returns (uint16);
```

### denomPath

Walk the denom-provenance chain upstream from a local denom.

MUST NOT revert on cycles, non-mesh providers, or natural termini —
these are reported by the returned path's terminal entry. MUST
revert with `InvalidDepth` only on out-of-range `maxDepth`.


```solidity
function denomPath(bytes32 local, uint16 maxDepth) external view returns (DenomLink[] memory path);
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`local`|`bytes32`|The local denom on this node to trace.|
|`maxDepth`|`uint16`|Maximum chain length to traverse; MUST satisfy `1 <= maxDepth <= MAX_PATH_DEPTH()`.|

**Returns**

|Name|Type|Description|
|----|----|-----------|
|`path`|`DenomLink[]`|The walked path in source-walked order. Length <= maxDepth. The last entry's `provider == address(0)` indicates vault-rooted termination. Otherwise the chain was truncated by a non-mesh provider, a cycle, or the depth limit; callers distinguish by inspecting the path itself.|
