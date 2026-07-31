---
title: CreatedContext
status: generated
source: src/core/interfaces/IDistributionStrategy.sol
generated: true
---
# CreatedContext
Context for `onCommitmentCreated`.


```solidity
struct CreatedContext {
BaseContext base;
uint256 originalAmount;
uint16 maxPenaltyBps;
uint64 challengeWindow;
bytes strategyParams;
}
```
