---
title: FanOutNode
status: generated
source: src/extensions/mesh/FanOutNode.sol
generated: true
---
# FanOutNode
**Inherits:**
[IFanOut](/docs/protocol/reference/contracts/extensions/mesh/interfaces/IFanOut), [IFlowQueryPath](/docs/protocol/reference/contracts/extensions/mesh/interfaces/IFlowQueryPath), [IEntity](/docs/protocol/reference/contracts/shared/interfaces/IEntity), ReentrancyGuard

**Title:**
FanOutNode

Distributes one provider's committed stake to multiple consumers via configurable outflows.
Enforces the exposure allocation invariant: totalForfeitable <= locked * inputMaxPenaltyBps / 10_000.
Implements pull-based reward accumulator (Synthetix/Compound per-share pattern).
Implements IFlowQuery for topology discovery and IFlowQueryPath for
single-call provenance walks.


## Constants
### FACTORY_TYPE_ID
`IEntity` type id: `keccak256("commitments.mesh.fan_out")`. Self-verifies this
implementation when `MeshFactory` whitelists it.


```solidity
bytes32 internal constant FACTORY_TYPE_ID = keccak256("commitments.mesh.fan_out")
```


### PRECISION
Precision multiplier for reward per share accumulator


```solidity
uint256 private constant PRECISION = 1e18
```


### MAX_REWARD_TOKENS
defensive cap on distinct reward tokens per stakeDenom.
Mirrors TokenWeighting; bounds iteration cost in stake/releaseStake.


```solidity
uint256 public constant MAX_REWARD_TOKENS = 32
```


## State Variables
### inputMaxPenaltyBps
Max input-side penalty in basis points (0..10_000) — set per-node at init.

Represents the maxPenaltyBps the provider committed upstream. renamed
the input-side `maxPenaltyBps` (0..10_000) the provider committed upstream.


```solidity
uint16 public inputMaxPenaltyBps
```


### _initialized
Tracks whether contract has been initialized (clone guard)


```solidity
bool private _initialized
```


### provider
The single provider whose stake is being distributed


```solidity
address public provider
```


### manager
Manager/owner — can do admin operations (currently none needed beyond init)


```solidity
address public manager
```


### _userInfo
staker -> denom -> UserInfo


```solidity
mapping(address => mapping(bytes32 => UserInfo)) internal _userInfo
```


### _outflows
staker -> denom -> Outflow[]


```solidity
mapping(address => mapping(bytes32 => Outflow[])) internal _outflows
```


### _liens
staker -> denom -> consumer -> FanOutLien


```solidity
mapping(address => mapping(bytes32 => mapping(address => FanOutLien))) internal _liens
```


### _consumers
Consumer enumeration for IFlowQuery


```solidity
address[] internal _consumers
```


### _isKnownConsumer
Whether an address is a known consumer (has been added via setOutflows)


```solidity
mapping(address => bool) internal _isKnownConsumer
```


### rewardsPerShare
Reward accumulator: stakeDenom -> rewardToken -> accumulated per-share (scaled by PRECISION)


```solidity
mapping(bytes32 => mapping(address => uint256)) public rewardsPerShare
```


### rewardDebt
Reward debt: staker -> stakeDenom -> rewardToken -> debt at last claim


```solidity
mapping(address => mapping(bytes32 => mapping(address => uint256))) public rewardDebt
```


### totalStake
Total stake per denom (sum of all stakers' locked for this denom)


```solidity
mapping(bytes32 => uint256) public totalStake
```


### _denomsStaked
Denoms that have been staked (for IFlowQuery enumeration)


```solidity
bytes32[] internal _denomsStaked
```


### _isKnownDenom
Whether a denom has been recorded in _denomsStaked


```solidity
mapping(bytes32 => bool) internal _isKnownDenom
```


### _rewardTokens
Reward tokens distributed for each stakeDenom (for debt updates on stake/release)


```solidity
mapping(bytes32 => EnumerableSet.AddressSet) internal _rewardTokens
```


### pendingRewards
Pending rewards accumulated during releaseStake (claimed via claimRewards)


```solidity
mapping(address => mapping(bytes32 => mapping(address => uint256))) public pendingRewards
```


### _caps
staker -> denom -> consumer -> AllocationCap (provider-curated caps)


```solidity
mapping(address => mapping(bytes32 => mapping(address => AllocationCap))) internal _caps
```


### _priority
staker -> denom -> priority-ordered consumer list (greedy-fill order)


```solidity
mapping(address => mapping(bytes32 => address[])) internal _priority
```


### _inPriority
staker -> denom -> consumer -> whether present in the priority list


```solidity
mapping(address => mapping(bytes32 => mapping(address => bool))) internal _inPriority
```


### _capacity
consumer -> denom -> ConsumerCapacity (consumer-published inflow ceiling)


```solidity
mapping(address => mapping(bytes32 => ConsumerCapacity)) internal _capacity
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

lock the implementation contract so direct
`initialize` on the impl reverts. Clones (via MeshFactory)
reset storage and so are unaffected.


```solidity
constructor() ;
```

### onlyProvider


```solidity
modifier onlyProvider() ;
```

### onlyRegisteredConsumer


```solidity
modifier onlyRegisteredConsumer() ;
```

### initialize

Initialize the fan-out node (called once by factory after clone)


```solidity
function initialize(address provider_, address manager_) external;
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`provider_`|`address`|The single provider address whose stake is distributed|
|`manager_`|`address`|The manager/owner address that can configure outflows|


### initializeWithPenalty

Initialize with a specific input max penalty in bps.


```solidity
function initializeWithPenalty(address provider_, address manager_, uint16 inputMaxPenaltyBps_) external;
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`provider_`|`address`|The single provider address|
|`manager_`|`address`|The manager/owner address|
|`inputMaxPenaltyBps_`|`uint16`|The max penalty bps the provider committed to upstream (0..10_000)|


### setOutflows

Configure consumer outflows for a specific denom

the invariant on portionBps sum is `<= 10_000`,
not `== 10_000`. This relaxation is required because `releaseStake`
shrinks the matching outflow's portion proportionally so a subsequent
`stake()` cannot resurrect a previously-released lien. The provider
is free to leave a portion unallocated; any unallocated locked stake
is simply not subject to any consumer's lien.


```solidity
function setOutflows(bytes32 denom, Outflow[] calldata outflows) external nonReentrant onlyProvider;
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`denom`|`bytes32`|The stake denomination being distributed|
|`outflows`|`Outflow[]`|Array of consumer outflows (portions must sum to <= 10000, no duplicate consumers)|


### stake

Provider increases their staked amount for a denom

Only callable by the registered provider. Re-validates exposure allocation.


```solidity
function stake(bytes32 denom, uint256 amount) external nonReentrant onlyProvider;
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`denom`|`bytes32`|The stake denomination|
|`amount`|`uint256`|The amount being staked|


### releaseStake

Consumer releases stake back upstream

Only callable by a registered consumer. Decrements the lien.


```solidity
function releaseStake(address staker, bytes32 denom, uint256 amount) external nonReentrant onlyRegisteredConsumer;
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`staker`|`address`|The staker whose lien is being reduced|
|`denom`|`bytes32`|The stake denomination|
|`amount`|`uint256`|The amount to release|


### setAllocationCap

Provider sets or updates a consumer's two-limit allocation cap.

Effective cap consumed by `allocate` is
`min(absoluteLimit, pool * shareLimit / 1e18[, consumerCapacity])`.
Registers the consumer for enumeration and appends it to the priority
list on first configuration. Does NOT move funds or mutate liens — call
`allocate` to (re)compute liens from the current caps.


```solidity
function setAllocationCap(
    bytes32 denom,
    address consumer,
    uint256 absoluteLimit,
    uint256 shareLimit,
    uint16 maxPenaltyBps
) external nonReentrant onlyProvider;
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`denom`|`bytes32`|The stake denomination being curated.|
|`consumer`|`address`|The consumer this cap applies to.|
|`absoluteLimit`|`uint256`|Hard ceiling on this consumer's fill, in stake units.|
|`shareLimit`|`uint256`|Fraction of the provider pool, 1e18-scaled (<= 1e18).|
|`maxPenaltyBps`|`uint16`|Exposure penalty for this consumer's lien (<= inputMaxPenaltyBps).|


### reorderPriority

Provider reorders the greedy-fill priority list for a denom.

`order` must be an exact permutation of the current priority list
(same length, same members, no duplicates). Reordering does not move
funds or recompute liens — call `allocate` afterwards to apply the new
fill order.


```solidity
function reorderPriority(bytes32 denom, address[] calldata order) external nonReentrant onlyProvider;
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`denom`|`bytes32`|The stake denomination whose priority order is being changed.|
|`order`|`address[]`|The new full ordering of the existing consumers.|


### allocate

Recompute all consumer liens for a denom from the curated caps + priority.

Greedy-fill: walk the priority list in order, filling each consumer to its
effective cap `min(absoluteLimit, pool * shareLimit / 1e18[, capacity])`
until the pool is exhausted. Rebuilds the outflow records + liens +
`totalForfeitable` used by the rest of the node, then re-validates the
exposure invariant. PURE ALGEBRA — no ERC20 transfer occurs.


```solidity
function allocate(bytes32 denom) external nonReentrant onlyProvider;
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`denom`|`bytes32`|The stake denomination to (re)allocate.|


### publishCapacity

Consumer publishes or raises its own inflow capacity for a denom.

Permissionless self-service: `msg.sender` is the consumer. The ceiling
may only be set (first call) or RAISED here; use `decreaseLimit` to
throttle down. Checked by `allocate` via the effective-cap min().


```solidity
function publishCapacity(bytes32 denom, uint256 ceiling) external nonReentrant;
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`denom`|`bytes32`|The stake denomination this ceiling applies to.|
|`ceiling`|`uint256`|The maximum inflow the consumer will accept.|


### decreaseLimit

Consumer ratchets its own inflow capacity strictly DOWN (permissionless).

The consumer's unilateral throttle — no provider cooperation required.
If no capacity was published yet, this sets the first ceiling (a decrease
from the implicit "unbounded"). Otherwise `newCeiling` must be strictly
below the current ceiling (MONOTONIC-DOWN). Enforced by `allocate`.


```solidity
function decreaseLimit(bytes32 denom, uint256 newCeiling) external nonReentrant;
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`denom`|`bytes32`|The stake denomination to throttle.|
|`newCeiling`|`uint256`|The new, lower inflow ceiling.|


### getAllocationCap

Read a consumer's curated allocation cap.


```solidity
function getAllocationCap(address staker, bytes32 denom, address consumer)
    external
    view
    returns (AllocationCap memory cap);
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`staker`|`address`|The staker (provider) whose curation is read.|
|`denom`|`bytes32`|The stake denomination.|
|`consumer`|`address`|The consumer whose cap is read.|

**Returns**

|Name|Type|Description|
|----|----|-----------|
|`cap`|`AllocationCap`|The AllocationCap struct (zeroed with `set == false` if unconfigured).|


### getPriority

Read the greedy-fill priority order for a staker/denom.


```solidity
function getPriority(address staker, bytes32 denom) external view returns (address[] memory order);
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`staker`|`address`|The staker (provider).|
|`denom`|`bytes32`|The stake denomination.|

**Returns**

|Name|Type|Description|
|----|----|-----------|
|`order`|`address[]`|The ordered consumer list walked by `allocate`.|


### capacity

Consumer-published inflow ceiling for a denom.


```solidity
function capacity(address consumer, bytes32 denom) external view returns (uint256 ceiling, bool set);
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`consumer`|`address`|The consumer address.|
|`denom`|`bytes32`|The stake denomination.|

**Returns**

|Name|Type|Description|
|----|----|-----------|
|`ceiling`|`uint256`|The published ceiling (meaningless unless `set`).|
|`set`|`bool`|Whether the consumer has published any capacity.|


### allocatable

Remaining inflow room for a consumer right now = ceiling - current lien.

Returns `type(uint256).max` when the consumer has published no ceiling
(treated as unbounded). Otherwise saturating-subtracts the consumer's
current lien against the provider from the published ceiling.


```solidity
function allocatable(address consumer, bytes32 denom) external view returns (uint256 room);
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`consumer`|`address`|The consumer address.|
|`denom`|`bytes32`|The stake denomination.|

**Returns**

|Name|Type|Description|
|----|----|-----------|
|`room`|`uint256`|The additional inflow the consumer would still accept.|


### effectiveCap

The effective allocation cap a consumer would receive on the next `allocate`.

`min(absoluteLimit, pool * shareLimit / 1e18[, publishedCapacity])`.


```solidity
function effectiveCap(address staker, bytes32 denom, address consumer) external view returns (uint256);
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`staker`|`address`|The staker (provider) whose pool is measured.|
|`denom`|`bytes32`|The stake denomination.|
|`consumer`|`address`|The consumer whose effective cap is computed.|

**Returns**

|Name|Type|Description|
|----|----|-----------|
|`<none>`|`uint256`|The effective cap in stake units.|


### deallocatable

Dry-run of how much a consumer could unwind (`releaseStake`) right now.

Simulate-and-revert pseudo-view over the mutating unwind path: it probes
the release ceiling through a self-call that always reverts with the
computed amount, so no state is ever persisted. The bound mirrors
`releaseStake` (which permits up to the full lien `amount`).


```solidity
function deallocatable(address staker, bytes32 denom, address consumer) external view returns (uint256 amount);
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`staker`|`address`|The staker whose lien would be unwound.|
|`denom`|`bytes32`|The stake denomination.|
|`consumer`|`address`|The consumer that would call `releaseStake`.|

**Returns**

|Name|Type|Description|
|----|----|-----------|
|`amount`|`uint256`|The maximum releasable stake right now.|


### probeUnwind

Internal probe for `deallocatable`; ALWAYS reverts with `UnwindProbe`.

Only self-callable. Measures the max releasable amount along the mutating
unwind path and returns it via a revert so the caller's state is rolled
back. Not meant to be called directly.


```solidity
function probeUnwind(address staker, bytes32 denom, address consumer) external view;
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`staker`|`address`|The staker whose lien would be unwound.|
|`denom`|`bytes32`|The stake denomination.|
|`consumer`|`address`|The consumer that would call `releaseStake`.|


### distributeRewards

Consumer distributes rewards proportional to stake

Only callable by a registered consumer. Updates per-share accumulator.
Uses SafeERC20.safeTransferFrom to pull reward tokens from consumer.


```solidity
function distributeRewards(bytes32 stakeDenom, address rewardToken, uint256 rewardAmount)
    external
    nonReentrant
    onlyRegisteredConsumer;
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`stakeDenom`|`bytes32`|The denom used to calculate proportional shares|
|`rewardToken`|`address`|The ERC20 token being distributed as rewards|
|`rewardAmount`|`uint256`|The total reward amount to distribute|


### claimRewards

Staker claims their pro-rata rewards

Pull-based: staker calls this to receive pending rewards.
Uses Synthetix/Compound per-share pattern.


```solidity
function claimRewards(bytes32 stakeDenom, address rewardToken) external nonReentrant;
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`stakeDenom`|`bytes32`|The denom for which rewards are being claimed|
|`rewardToken`|`address`|The ERC20 reward token to claim|


### getUserInfo

Get per-staker info for a specific denom


```solidity
function getUserInfo(address staker, bytes32 denom) external view returns (UserInfo memory);
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`staker`|`address`|The staker address|
|`denom`|`bytes32`|The stake denomination|

**Returns**

|Name|Type|Description|
|----|----|-----------|
|`<none>`|`UserInfo`|info UserInfo struct with locked, maxLien, totalForfeitable|


### getOutflows

Get all outflows configured by a staker for a specific denom


```solidity
function getOutflows(address staker, bytes32 denom) external view returns (Outflow[] memory);
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`staker`|`address`|The staker address|
|`denom`|`bytes32`|The stake denomination|

**Returns**

|Name|Type|Description|
|----|----|-----------|
|`<none>`|`Outflow[]`|outflows Array of configured outflows|


### getLien

Get the lien a specific consumer holds against a staker/denom pair


```solidity
function getLien(address staker, bytes32 denom, address consumer) external view returns (FanOutLien memory);
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`staker`|`address`|The staker address|
|`denom`|`bytes32`|The stake denomination|
|`consumer`|`address`|The consumer address|

**Returns**

|Name|Type|Description|
|----|----|-----------|
|`<none>`|`FanOutLien`|lien The FanOutLien struct (amount and exposure)|


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


```solidity
function providers() external view returns (ProviderInfo[] memory);
```

### consumers


```solidity
function consumers() external view returns (ConsumerInfo[] memory);
```

### availableDenoms


```solidity
function availableDenoms() external view returns (AvailableDenom[] memory);
```

### providersPaged

Paginated providers — `offset` may exceed length (returns empty array).

FanOut has a single provider; pagination collapses to one entry when offset == 0.


```solidity
function providersPaged(uint256 offset, uint256 limit) external view returns (ProviderInfo[] memory);
```

### consumersPaged


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


### _validateExposureAllocation

Validate the exposure allocation invariant:
totalForfeitable <= locked * inputMaxPenaltyBps 10_000 (bps)


```solidity
function _validateExposureAllocation(uint256 locked, uint256 newTotalForfeitable) internal view;
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`locked`|`uint256`|The staker's total locked amount for the denom|
|`newTotalForfeitable`|`uint256`|The proposed new totalForfeitable value|


### _writeAllocation

Write one consumer's outflow record + virtual lien from a computed fill.
`portionBps` is derived (floored) for legacy compatibility with the static
path (releaseStake shrink + stake re-validation); the lien stores the EXACT
fill so cap precision is never lost. Returns the exposure booked.


```solidity
function _writeAllocation(address staker, bytes32 denom, address consumer, uint256 fill, uint256 pool)
    internal
    returns (uint256 exposure);
```

### _effectiveCap

Effective curated cap for a consumer: min of the absolute limit, the
pool-share limit, and (if published) the consumer's own capacity.


```solidity
function _effectiveCap(address staker, bytes32 denom, address consumer, uint256 pool)
    internal
    view
    returns (uint256);
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`staker`|`address`|The staker (provider) whose pool is measured.|
|`denom`|`bytes32`|The stake denomination.|
|`consumer`|`address`|The consumer whose cap is computed.|
|`pool`|`uint256`|The provider's locked amount for the denom.|


### _clearOutflowsAndLiens

Clear existing outflows array and associated liens for a staker/denom


```solidity
function _clearOutflowsAndLiens(address staker, bytes32 denom) internal;
```

### _getOutflowPenalty

Look up the maxPenaltyBps for a specific consumer in the outflows


```solidity
function _getOutflowPenalty(address staker, bytes32 denom, address consumer) internal view returns (uint16);
```

## Events
### Initialized

```solidity
event Initialized(address indexed provider, address indexed manager);
```

### OutflowsSet

```solidity
event OutflowsSet(address indexed staker, bytes32 indexed denom, uint256 numConsumers);
```

### Staked

```solidity
event Staked(address indexed staker, bytes32 indexed denom, uint256 amount);
```

### StakeReleased

```solidity
event StakeReleased(address indexed staker, bytes32 indexed denom, address indexed consumer, uint256 amount);
```

### RewardsDistributed

```solidity
event RewardsDistributed(bytes32 indexed stakeDenom, address indexed rewardToken, uint256 rewardAmount);
```

### RewardsClaimed

```solidity
event RewardsClaimed(
    address indexed staker, bytes32 indexed stakeDenom, address indexed rewardToken, uint256 amount
);
```

### AllocationCapSet
Emitted when the provider sets/updates a consumer's two-limit cap.


```solidity
event AllocationCapSet(
    address indexed staker,
    bytes32 indexed denom,
    address indexed consumer,
    uint256 absoluteLimit,
    uint256 shareLimit,
    uint16 maxPenaltyBps
);
```

### PriorityReordered
Emitted when the provider reorders the greedy-fill priority list.


```solidity
event PriorityReordered(address indexed staker, bytes32 indexed denom);
```

### Allocated
Emitted after a curated `allocate()` pass rebuilds the liens.


```solidity
event Allocated(address indexed staker, bytes32 indexed denom, uint256 allocated, uint256 unallocated);
```

**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`staker`|`address`||
|`denom`|`bytes32`||
|`allocated`|`uint256`|Total stake filled across all consumers this pass.|
|`unallocated`|`uint256`|Pool remainder left unbound (subject to no lien).|

### CapacityPublished
Emitted when a consumer publishes/raises its inflow capacity for a denom.


```solidity
event CapacityPublished(address indexed consumer, bytes32 indexed denom, uint256 ceiling);
```

### CapacityDecreased
Emitted when a consumer ratchets its inflow capacity down (monotonic).


```solidity
event CapacityDecreased(address indexed consumer, bytes32 indexed denom, uint256 newCeiling);
```

## Errors
### AlreadyInitialized

```solidity
error AlreadyInitialized();
```

### OnlyProvider

```solidity
error OnlyProvider();
```

### OnlyRegisteredConsumer

```solidity
error OnlyRegisteredConsumer();
```

### InvalidPortionSum

```solidity
error InvalidPortionSum();
```

### DuplicateConsumer
setOutflows received the same consumer twice; duplicates would
collapse into one lien slot and desync totalForfeitable.


```solidity
error DuplicateConsumer();
```

### ExposureAllocationExceeded

```solidity
error ExposureAllocationExceeded();
```

### InsufficientLien

```solidity
error InsufficientLien();
```

### ZeroTotalStake

```solidity
error ZeroTotalStake();
```

### ZeroAmount

```solidity
error ZeroAmount();
```

### RewardTooSmall

```solidity
error RewardTooSmall();
```

### RewardTokenLimit
distributeRewards would push the per-denom token set above
MAX_REWARD_TOKENS. Bounds stake/release iteration cost.


```solidity
error RewardTokenLimit();
```

### InvalidShareLimit
`shareLimit` exceeds 1e18 (100% of the pool).


```solidity
error InvalidShareLimit();
```

### PenaltyExceedsInput
A cap's `maxPenaltyBps` exceeds the node's `inputMaxPenaltyBps`.


```solidity
error PenaltyExceedsInput();
```

### NotAPermutation
`reorderPriority` was not given an exact permutation of the current list.


```solidity
error NotAPermutation();
```

### CapacityNotIncreasing
`publishCapacity` would lower the ceiling — use `decreaseLimit` instead.


```solidity
error CapacityNotIncreasing();
```

### LimitNotDecreasing
`decreaseLimit` did not strictly lower the existing ceiling.


```solidity
error LimitNotDecreasing();
```

### UnwindProbe
Sentinel carrying the dry-run result of `deallocatable` (never persisted).


```solidity
error UnwindProbe(uint256 amount);
```

## Structs
### AllocationCap
A provider-curated two-limit cap for a single consumer.

Effective cap at allocation time is
`min(absoluteLimit, pool * shareLimit / 1e18[, consumerCapacity])`.
This is exposure/allocation ALGEBRA only — no funds move. Liens remain
virtual claims over the manager-custodied capital.


```solidity
struct AllocationCap {
    uint256 absoluteLimit; // hard ceiling in stake units
    uint256 shareLimit; // fraction of the provider pool, 1e18-scaled (1e18 == 100%)
    uint16 maxPenaltyBps; // exposure penalty for this consumer's lien (0..10_000)
    bool set; // whether a cap has been configured for this consumer
}
```

### ConsumerCapacity
A consumer-published inflow ceiling for a denom.

`set == false` means "unbounded / no published ceiling". Once set, the
ceiling is MONOTONIC-DOWN through `decreaseLimit` (permissionless) and may
only be raised through `publishCapacity`.


```solidity
struct ConsumerCapacity {
    uint256 ceiling; // max inflow the consumer will accept for this denom
    bool set; // whether the consumer has published a capacity
}
```
