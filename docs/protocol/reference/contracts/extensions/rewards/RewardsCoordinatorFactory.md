---
title: RewardsCoordinatorFactory
status: generated
source: src/extensions/rewards/RewardsCoordinatorFactory.sol
generated: true
---
# RewardsCoordinatorFactory
**Title:**
RewardsCoordinatorFactory

Per-service deployment of the (`MerkleSnapshot`,
`CommitmentsRewardsCoordinator`) pair. Each call yields fresh
proxies wired to immutable shared implementations.

The snapshot↔coordinator circular dependency was removed: the snapshot
now owns the updater-auth surface and never references the
coordinator, while the coordinator references only the snapshot. The
pair is therefore deployed in a simple sequential order — snapshot
first, then coordinator — with plain `ERC1967Proxy` instances. No
CREATE2 address prediction and no custom uninitialized-proxy are
needed anymore.

per-service factory-spawned. Mirrors `VaultFactory` and `MeshFactory`
patterns elsewhere in the protocol.


## State Variables
### coordinatorImplementation
The shared coordinator implementation. New services proxy to it.


```solidity
address public immutable coordinatorImplementation
```


### snapshotImplementation
The shared snapshot implementation. New services proxy to it.


```solidity
address public immutable snapshotImplementation
```


### minActivationDelay
Activation-delay floor enforced at deployment.


```solidity
uint64 public immutable minActivationDelay
```


## Functions
### constructor


```solidity
constructor(address coordImpl_, address snapImpl_, uint64 minActivationDelay_) ;
```

### deployCoordinator

Deploy a fresh (snapshot, coordinator) pair for `service`. The
caller is recorded as the funder of the deploy txns; neither
needs to be the eventual `service`. Initial `updater` is set on
the snapshot at deployment.


```solidity
function deployCoordinator(address service, address updater, uint64 activationDelay)
    external
    returns (address coordinator, address snapshot);
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`service`|`address`|The address that will control disable, upgrades, and the staged updater swap surface (on the snapshot).|
|`updater`|`address`|The initial trusted updater for `submitRoot` calls. May be a contract (Safe, governor, service adapter) or EOA.|
|`activationDelay`|`uint64`|The per-service delay. Must satisfy `activationDelay >= minActivationDelay()`.|

**Returns**

|Name|Type|Description|
|----|----|-----------|
|`coordinator`|`address`|The freshly deployed coordinator proxy.|
|`snapshot`|`address`|The freshly deployed snapshot proxy.|


## Events
### CoordinatorDeployed

```solidity
event CoordinatorDeployed(
    address indexed service,
    address indexed coordinator,
    address indexed snapshot,
    address updater,
    uint64 activationDelay
);
```

## Errors
### ZeroAddress

```solidity
error ZeroAddress();
```
