---
title: ForfeitContext
status: generated
source: src/core/interfaces/IDistributionStrategy.sol
generated: true
---
# ForfeitContext
Context for `onCommitmentForfeited`. Delivered strictly AFTER the manager-internal
forfeit transfer; `base.currentEncumbered` is the post-forfeit residual.


```solidity
struct ForfeitContext {
BaseContext base;
uint16 penaltyBps;
address forfeitRecipient;
uint256 forfeitedUnits;
}
```
