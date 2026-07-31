---
title: DenomLink
status: generated
source: src/extensions/mesh/interfaces/IFlowQueryPath.sol
generated: true
---
# DenomLink
One link in a denom-provenance chain.

`provider == address(0)` and `nodeType == bytes32(0)` together signal a
vault-rooted terminal sentinel. Other terminal cases (non-mesh provider,
cycle, depth limit) are distinguishable by inspecting the path itself.


```solidity
struct DenomLink {
address provider; // mesh node holding this denom; address(0) for vault-rooted sentinel
bytes32 denom; // local denom on `provider`
bytes32 nodeType; // FAN_IN / FAN_OUT / TOKEN_WEIGHTING / 0 for vault-rooted; custom values per IFlowQuery
}
```
