---
title: IVotingPowerSource
status: generated
source: src/shared/interfaces/IVotingPowerSource.sol
generated: true
---
# IVotingPowerSource
**Title:**
IVotingPowerSource

Shared interface for any contract that exposes per-address voting power with
checkpointed history. Implemented by TokenWeighting and any future sources
(e.g. LST oracles, PoA lists). Consumed by service managers
(ECDSA or BLS) to decouple signature validation from stake accounting.


## Functions
### getVotingPower

Current voting power for an address.


```solidity
function getVotingPower(address who) external view returns (uint256);
```

### getVotingPowerAt

Historical voting power for an address at a given block.


```solidity
function getVotingPowerAt(address who, uint256 blockNumber) external view returns (uint256);
```

### getTotalPower

Current total voting power across all addresses tracked by this source.


```solidity
function getTotalPower() external view returns (uint256);
```

### getTotalPowerAt

Historical total voting power at a given block.


```solidity
function getTotalPowerAt(uint256 blockNumber) external view returns (uint256);
```
