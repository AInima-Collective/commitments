---
title: Outflow
status: generated
source: src/extensions/mesh/interfaces/IFanOut.sol
generated: true
---
# Outflow
A single outflow configuration: one consumer's slice of the staker's stake.

`maxPenaltyBps` is in basis points (0..10_000).


```solidity
struct Outflow {
address consumer;
uint16 maxPenaltyBps;
uint256 portionBps; // portion of staker's locked amount, out of 10000
}
```
