---
title: StrategyBinding
status: generated
source: src/core/interfaces/IDistributionStrategy.sol
generated: true
---
# StrategyBinding
A strategy bound to a commitment at creation, with strategy-specific params.

The manager MUST NOT persist `params` — it is delivered once via the creation
context and once via the `CommitmentBoundToStrategy` event (ERC §C.1).


```solidity
struct StrategyBinding {
address strategy;
bytes params;
}
```
