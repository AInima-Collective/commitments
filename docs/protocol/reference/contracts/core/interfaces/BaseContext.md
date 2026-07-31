---
title: BaseContext
status: generated
source: src/core/interfaces/IDistributionStrategy.sol
generated: true
---
# BaseContext
Fields shared by every strategy-hook context (ERC §D.1).


```solidity
struct BaseContext {
uint256 commitmentId;
address adapter;
address token;
address committer;
address counterparty;
uint256 currentEncumbered; // commitment.amount at call time
uint64 timestamp;
}
```
