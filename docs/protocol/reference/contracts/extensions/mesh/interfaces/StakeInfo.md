---
title: StakeInfo
status: generated
source: src/extensions/mesh/interfaces/IFlowQuery.sol
generated: true
---
# StakeInfo
Stake info for a provider/consumer in IFlowQuery views.

`maxPenaltyBps`
(uint16, 0..10_000) for protocol-wide consistency. See `docs/units.md`.


```solidity
struct StakeInfo {
bytes32 denom;
uint16 maxPenaltyBps;
uint64 unbondingPeriod;
uint256 amount;
}
```
