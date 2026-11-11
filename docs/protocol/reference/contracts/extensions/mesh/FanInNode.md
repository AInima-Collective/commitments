---
title: FanInNode
status: generated
source: src/extensions/mesh/FanInNode.sol
generated: true
---
# FanInNode
**Inherits:**
[IFanIn](/docs/protocol/reference/contracts/extensions/mesh/interfaces/IFanIn), [IEntity](/docs/protocol/reference/contracts/shared/interfaces/IEntity)

**Title:**
FanInNode

Aggregates stake from multiple providers with different denoms into a single consumer.
Prevents denom collision when two providers supply the same token string.


## State Variables
### _initialized
Tracks whether contract has been initialized (clone guard)


```solidity
bool private _initialized
```


### manager
Manager/owner — can register providers


```solidity
address public manager
```


### consumer
Single consumer — can release stake


```solidity
address public consumer
```


### inputDenoms
provider -> denomIn -> denomOut mapping


```solidity
mapping(address => mapping(bytes32 => bytes32)) public inputDenoms
```


### outputSources
denomOut -> (provider, denomIn) — for reverse lookup and collision detection


```solidity
mapping(bytes32 => ProviderEntry) public outputSources
```


### totalStake
denomOut -> total staked amount


```solidity
mapping(bytes32 => uint256) public totalStake
```


### security
denomOut -> SecurityLevel


```solidity
mapping(bytes32 => SecurityLevel) public security
```


## Functions
### factoryTypeId

A stable, unique identifier for this contract's type.

`FAN_IN_TYPE_ID`; self-verifies this implementation when `MeshFactory` whitelists it.


```solidity
function factoryTypeId() external pure returns (bytes32);
```
**Returns**

|Name|Type|Description|
|----|----|-----------|
|`<none>`|`bytes32`|The type id, a domain-separated keccak256 constant.|


### constructor

lock the implementation contract so it cannot be
initialized directly. Production deployments use `MeshFactory`,
which clones via EIP-1167; the clone reads zeroed storage and
can call `initialize`. This guard prevents an indexer-confusion
scenario where an attacker initializes the impl with rogue
consumer/manager and emits events that look authentic.


```solidity
constructor() ;
```

### onlyManager


```solidity
modifier onlyManager() ;
```

### onlyConsumer


```solidity
modifier onlyConsumer() ;
```

### initialize

Initialize the fan-in node (called once by factory or deployer after clone)


```solidity
function initialize(address consumer_, address manager_) external;
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`consumer_`|`address`|The single consumer address that receives aggregated stake|
|`manager_`|`address`|The manager/owner address that can register providers|


### registerProvider

Register a provider with its denom mapping


```solidity
function registerProvider(
    address provider,
    bytes32 denomIn,
    bytes32 denomOut,
    uint16 maxPenaltyBps,
    uint64 unbondingPeriod
) external onlyManager;
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`provider`|`address`|The provider address allowed to call stake()|
|`denomIn`|`bytes32`|The denom string the provider stakes with|
|`denomOut`|`bytes32`|The local denom this fan-in exposes to the consumer|
|`maxPenaltyBps`|`uint16`|Max forfeiture in basis points (0..10_000) for this provider's stake|
|`unbondingPeriod`|`uint64`|Unbonding period in seconds for this provider's stake|


### stake

Manager credits a registered provider's stake — maps denomIn to denomOut.

`onlyManager` is the verified-backing binding (plan STEP 3): the only entity
that can credit stake is the manager — for the wired pipeline that is the
OperatorRegistry, which credits exactly the amount of a commitment it has
verified (`committer == staker`, `counterparty == registry`). Because the
permissionless provider-driven path is gone, mesh stake can never diverge
above real, manager-verified encumbrance.


```solidity
function stake(address provider, bytes32 denomIn, uint256 amount) external onlyManager;
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`provider`|`address`|The registered provider whose stake is credited.|
|`denomIn`|`bytes32`|The denom being staked (must be registered for `provider`).|
|`amount`|`uint256`|The amount being staked.|


### releaseStake

Release stake back to its registered provider — decrements totalStake.

Callable by the consumer OR the manager. The manager path lets the
OperatorRegistry unwind mesh stake when a delegation is released/forfeited
(the registry is the manager that credited the stake, not the consumer).
provider is derived from `outputSources[denomOut]` rather than supplied by
the caller, preventing off-chain indexers from being poisoned by an
arbitrary provider address.


```solidity
function releaseStake(bytes32 denomOut, uint256 amount) external;
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`denomOut`|`bytes32`|The local denom to release|
|`amount`|`uint256`|The amount to release|


## Events
### ProviderRegistered

```solidity
event ProviderRegistered(
    address indexed provider, bytes32 denomIn, bytes32 denomOut, uint16 maxPenaltyBps, uint64 unbondingPeriod
);
```

### Staked

```solidity
event Staked(address indexed provider, bytes32 denomIn, bytes32 denomOut, uint256 amount);
```

### StakeReleased

```solidity
event StakeReleased(address indexed provider, bytes32 denomOut, uint256 amount);
```

## Errors
### AlreadyInitialized

```solidity
error AlreadyInitialized();
```

### OnlyManager

```solidity
error OnlyManager();
```

### OnlyConsumer

```solidity
error OnlyConsumer();
```

### DenomOutCollision

```solidity
error DenomOutCollision();
```

### InputAlreadyRegistered

```solidity
error InputAlreadyRegistered();
```

### UnregisteredProvider

```solidity
error UnregisteredProvider();
```

### InsufficientStake

```solidity
error InsufficientStake();
```

### ZeroAmount

```solidity
error ZeroAmount();
```

## Structs
### ProviderEntry

```solidity
struct ProviderEntry {
    address provider;
    bytes32 denomIn;
}
```

### SecurityLevel
`maxPenaltyBps` (0..10_000).


```solidity
struct SecurityLevel {
    uint16 maxPenaltyBps;
    uint64 unbondingPeriod;
}
```
