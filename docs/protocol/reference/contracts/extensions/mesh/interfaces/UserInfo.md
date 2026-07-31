---
title: UserInfo
status: generated
source: src/extensions/mesh/interfaces/IFanOut.sol
generated: true
---
# UserInfo
Per-staker tracking for a specific denomination.

`totalForfeitable = Σ(amount_i × maxPenaltyBps_i 10_000)`.


```solidity
struct UserInfo {
uint256 locked; // total stake from provider for this denom
uint256 maxLien; // max single consumer lien amount
uint256 totalForfeitable; // sum(amount_i * maxPenaltyBps_i 10_000) across all outflows
}
```
