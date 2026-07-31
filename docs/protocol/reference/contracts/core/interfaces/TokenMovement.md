---
title: TokenMovement
status: generated
source: src/core/interfaces/IDistributionStrategy.sol
generated: true
---
# TokenMovement
One movement instruction returned by a strategy hook. The manager is the
sole executor: every movement is validated against the per-kind allow-list
and caps of ERC §D.5 before applying.


```solidity
struct TokenMovement {
MovementKind kind;
address from; // committer, or the strategy address as escrow sentinel
address to; // recipient
address token;
uint256 units;
}
```
