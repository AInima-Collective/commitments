---
title: IFlowQuery
status: generated
source: src/extensions/mesh/interfaces/IFlowQuery.sol
generated: true
---
# IFlowQuery
**Title:**
IFlowQuery

Topology-discovery interface for mesh nodes.
`nodeType()` returns `bytes32` for stable client-side dispatch; reserved
constants are `FAN_IN`, `FAN_OUT`, `TOKEN_WEIGHTING`. The free-form
`nodeTypeName()` returns the human-readable string. Paginated views are
RECOMMENDED for production use — the unbounded variants are convenient
for small graphs but cost O(N·M) and can run out of gas at scale.


## Functions
### nodeType

Reserved nodeType constants. Implementations of additional node types
SHOULD reserve their own bytes32 constants.


```solidity
function nodeType() external view returns (bytes32);
```

### nodeTypeName


```solidity
function nodeTypeName() external view returns (string memory);
```

### providers


```solidity
function providers() external view returns (ProviderInfo[] memory);
```

### consumers


```solidity
function consumers() external view returns (ConsumerInfo[] memory);
```

### availableDenoms


```solidity
function availableDenoms() external view returns (AvailableDenom[] memory);
```

### providersPaged

Paginated providers — `offset` may exceed length (returns empty array).


```solidity
function providersPaged(uint256 offset, uint256 limit) external view returns (ProviderInfo[] memory);
```

### consumersPaged


```solidity
function consumersPaged(uint256 offset, uint256 limit) external view returns (ConsumerInfo[] memory);
```

### availableDenomsPaged


```solidity
function availableDenomsPaged(uint256 offset, uint256 limit) external view returns (AvailableDenom[] memory);
```
