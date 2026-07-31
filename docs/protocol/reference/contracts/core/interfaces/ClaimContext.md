---
title: ClaimContext
status: generated
source: src/core/interfaces/IDistributionStrategy.sol
generated: true
---
# ClaimContext
Context for `claim` / `pending`. `closedAt` is 0 while the commitment is active.


```solidity
struct ClaimContext {
BaseContext base;
address caller;
uint64 closedAt;
}
```
