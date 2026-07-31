---
title: FanInNode
status: generated
source: src/extensions/mesh/FanInNode.sol
generated: true
---
# FanInNode
**Inherits:**
[IFanIn](/docs/protocol/reference/contracts/extensions/mesh/interfaces/IFanIn), [IFlowQueryPath](/docs/protocol/reference/contracts/extensions/mesh/interfaces/IFlowQueryPath), [IEntity](/docs/protocol/reference/contracts/shared/interfaces/IEntity), ReentrancyGuard

**Title:**
FanInNode

Aggregates stake from multiple providers with different denoms into a single consumer.
Prevents denom collision when two providers supply the same token string.
Implements IFlowQuery for topology discovery and IFlowQueryPath for
single-call provenance walks.


## Constants
### FACTORY_TYPE_ID
`IEntity` type id: `keccak256("commitments.mesh.fan_in")`. Self-verifies this
implementation when `MeshFactory` whitelists it.


```solidity
bytes32 internal constant FACTORY_TYPE_ID = keccak256("commitments.mesh.fan_in")
```


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
Single consumer — can release stake and distribute rewards


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


### _providers
Ordered list of registered provider addresses (for enumeration)


```solidity
address[] internal _providers
```


### _isKnownProvider
Whether an address is already a known provider


```solidity
mapping(address => bool) internal _isKnownProvider
```


### _denomOuts
Ordered list of registered denomOut values (for enumeration)


```solidity
bytes32[] internal _denomOuts
```


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


### constructor

lock the implementation contract so it cannot be
initialized directly. Production deployments use `MeshFactory`
which clones via; the clone reads zeroed storage and
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
function stake(address provider, bytes32 denomIn, uint256 amount) external nonReentrant onlyManager;
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
function releaseStake(bytes32 denomOut, uint256 amount) external nonReentrant;
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`denomOut`|`bytes32`|The local denom to release|
|`amount`|`uint256`|The amount to release|


### nodeType

Reserved nodeType constants. Implementations of additional node types
SHOULD reserve their own bytes32 constants.


```solidity
function nodeType() external pure returns (bytes32);
```

### nodeTypeName


```solidity
function nodeTypeName() external pure returns (string memory);
```

### providers

Returns all registered providers with their current stake info


```solidity
function providers() external view returns (ProviderInfo[] memory);
```

### consumers

Returns the single consumer with all aggregated stake info


```solidity
function consumers() external view returns (ConsumerInfo[] memory);
```

### availableDenoms

Returns all available denominations with source provider info


```solidity
function availableDenoms() external view returns (AvailableDenom[] memory);
```

### providersPaged

Paginated providers — `offset` may exceed length (returns empty array).


```solidity
function providersPaged(uint256 offset, uint256 limit) external view returns (ProviderInfo[] memory);
```

### consumersPaged

FanIn has a single consumer; pagination just collapses to "the one consumer"
when offset == 0, else empty. Kept for interface uniformity.


```solidity
function consumersPaged(uint256 offset, uint256 limit) external view returns (ConsumerInfo[] memory);
```

### availableDenomsPaged


```solidity
function availableDenomsPaged(uint256 offset, uint256 limit) external view returns (AvailableDenom[] memory);
```

### MAX_PATH_DEPTH

Maximum depth this implementation supports for `denomPath`.

SHOULD be 64 unless the implementation has a documented reason
for a tighter bound. Reading this lets callers size requests
without trial-and-error reverts.


```solidity
function MAX_PATH_DEPTH() external pure returns (uint16);
```

### denomPath

Walk the denom-provenance chain upstream from a local denom.

MUST NOT revert on cycles, non-mesh providers, or natural termini —
these are reported by the returned path's terminal entry. MUST
revert with `InvalidDepth` only on out-of-range `maxDepth`.


```solidity
function denomPath(bytes32 local, uint16 maxDepth) external view returns (DenomLink[] memory);
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`local`|`bytes32`|The local denom on this node to trace.|
|`maxDepth`|`uint16`|Maximum chain length to traverse; MUST satisfy `1 <= maxDepth <= MAX_PATH_DEPTH()`.|

**Returns**

|Name|Type|Description|
|----|----|-----------|
|`<none>`|`DenomLink[]`|path The walked path in source-walked order. Length <= maxDepth. The last entry's `provider == address(0)` indicates vault-rooted termination. Otherwise the chain was truncated by a non-mesh provider, a cycle, or the depth limit; callers distinguish by inspecting the path itself.|


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
