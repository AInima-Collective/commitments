---
title: FanOutLien
status: generated
source: src/extensions/mesh/interfaces/IFanOut.sol
generated: true
---
# FanOutLien
Tracks what a consumer holds against a specific staker/denom pair.

`exposure = amount × maxPenaltyBps / 10_000`. Named `FanOutLien` (not `Lien`)
to avoid colliding with the manager's "a commitment is a lien" vocabulary —
this is a distinct mesh struct, not a commitment.


```solidity
struct FanOutLien {
uint256 amount; // amount of stake (portionBps * locked / 10_000)
uint256 exposure; // amount * maxPenaltyBps / 10_000
}
```
