---
title: FanOutNode
status: generated
source: src/extensions/mesh/FanOutNode.sol
generated: true
---
# FanOutNode
**Inherits:**
[IFanOut](/docs/protocol/reference/contracts/extensions/mesh/interfaces/IFanOut), [IEntity](/docs/protocol/reference/contracts/shared/interfaces/IEntity), ReentrancyGuardTransient

**Title:**
FanOutNode

Distributes one provider's committed stake to multiple consumers via configurable outflows.
Enforces the exposure allocation invariant: totalForfeitable <= locked * inputMaxPenaltyBps / 10_000.
Implements pull-based reward accumulator (Synthetix/Compound per-share pattern).


## State Variables
### MAX_REWARD_TOKENS
defensive cap on distinct reward tokens per stakeDenom.
Mirrors TokenWeighting; bounds iteration cost in stake/releaseStake.


```solidity
uint256 public constant MAX_REWARD_TOKENS = 32
```


### inputMaxPenaltyBps
Max input-side penalty in basis points (0..10_000), set per node at init.

The `maxPenaltyBps` the provider committed upstream.


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


### _isKnownConsumer
Whether an address is a known consumer (has been added via setOutflows)


```solidity
mapping(address => bool) internal _isKnownConsumer
```


### rewardsPerShare
Reward accumulator: stakeDenom -> rewardToken -> accumulated per-share (scaled by WAD)


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


## Functions
### factoryTypeId

A stable, unique identifier for this contract's type.

`FAN_OUT_TYPE_ID`; self-verifies this implementation when `MeshFactory` whitelists it.


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

`inputMaxPenaltyBps` defaults to 10_000 (no limit beyond outflow validation).


```solidity
function initialize(address provider_, address manager_) external;
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`provider_`|`address`|The single provider address whose stake is distributed|
|`manager_`|`address`|Recorded in the `Initialized` event only; it has no powers on the node. Only the provider configures outflows.|


### initializeWithPenalty

Initialize with a specific input max penalty in bps.


```solidity
function initializeWithPenalty(address provider_, address manager_, uint16 inputMaxPenaltyBps_) external;
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`provider_`|`address`|The single provider address|
|`manager_`|`address`|Recorded in the `Initialized` event only; it has no powers on the node.|
|`inputMaxPenaltyBps_`|`uint16`|The max penalty bps the provider committed to upstream (0..10_000)|


### _initialize


```solidity
function _initialize(address provider_, address manager_, uint16 inputMaxPenaltyBps_) private;
```

### setOutflows

Configure consumer outflows for a specific denom

the invariant on portionBps sum is `<= 10_000`,
not `== 10_000`. This relaxation is required because `releaseStake`
shrinks the matching outflow's portion proportionally so a subsequent
`stake()` cannot resurrect a previously-released lien. The provider
is free to leave a portion unallocated; any unallocated locked stake
is simply not subject to any consumer's lien.


```solidity
function setOutflows(bytes32 denom, Outflow[] calldata outflows) external onlyProvider;
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
function stake(bytes32 denom, uint256 amount) external onlyProvider;
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
function releaseStake(address staker, bytes32 denom, uint256 amount) external onlyRegisteredConsumer;
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`staker`|`address`|The staker whose lien is being reduced|
|`denom`|`bytes32`|The stake denomination|
|`amount`|`uint256`|The amount to release|


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
|`<none>`|`UserInfo`|info UserInfo struct with locked, totalForfeitable|


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


### _clearOutflowsAndLiens

Clear existing outflows array and associated liens for a staker/denom


```solidity
function _clearOutflowsAndLiens(address staker, bytes32 denom) internal;
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
