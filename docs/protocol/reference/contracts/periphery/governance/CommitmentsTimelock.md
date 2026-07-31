---
title: CommitmentsTimelock
status: generated
source: src/periphery/governance/CommitmentsTimelock.sol
generated: true
---
# CommitmentsTimelock
**Inherits:**
TimelockControllerUpgradeable

**Title:**
CommitmentsTimelock

Thin subclass of OZ TimelockControllerUpgradeable. Adds a `version()`
view for indexer disambiguation; otherwise stock semantics.
Intentionally NOT UUPS-upgradeable. Replacing the timelock means
deploying a new DAO instance — a fresh Timelock + Governor pair, and
a `transferGovernance` call on any TokenWeighting node it controls.
This is by design: the timelock is the protocol's slow-path safety
hatch, and an in-place upgrade would defeat that role.


## Functions
### constructor

**Note:**
oz-upgrades-unsafe-allow: constructor


```solidity
constructor() ;
```

### version

Identifier emitted to disambiguate timelock versions in the indexer.


```solidity
function version() external pure returns (string memory);
```
