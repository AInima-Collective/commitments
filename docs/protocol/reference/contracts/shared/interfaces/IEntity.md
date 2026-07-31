---
title: IEntity
status: generated
source: src/shared/interfaces/IEntity.sol
generated: true
---
# IEntity
**Title:**
IEntity

Minimal self-identification surface for a contract that a `Factory` deploys
(as a clone or proxy implementation).

The `Factory` base calls `factoryTypeId()` when whitelisting an implementation and
checks it against the expected id. This makes whitelisting *self-verifying*: an
admin cannot accidentally whitelist a contract of the wrong type (a FanOut where a
FanIn was intended, an arbitrary contract where a vault was intended), because the
implementation itself asserts what it is. The value is a domain-separated constant,
e.g. `keccak256("commitments.vault")`.


## Functions
### factoryTypeId

A stable, unique identifier for this contract's type.


```solidity
function factoryTypeId() external pure returns (bytes32);
```
**Returns**

|Name|Type|Description|
|----|----|-----------|
|`<none>`|`bytes32`|The type id, a domain-separated keccak256 constant.|
