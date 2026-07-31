---
title: ITokenWeighting
status: generated
source: src/extensions/mesh/interfaces/ITokenWeighting.sol
generated: true
---
# ITokenWeighting
**Inherits:**
[IFlowQuery](/docs/protocol/reference/contracts/extensions/mesh/interfaces/IFlowQuery), [IVotingPowerSource](/docs/protocol/reference/contracts/shared/interfaces/IVotingPowerSource)

**Title:**
ITokenWeighting

Interface for the TokenWeighting sink node — normalizes multi-asset stake into
unified governance-compatible voting power using configurable per-denom weights.
Historical voting power is queryable at past block numbers via OZ Checkpoints.Trace256.
Inherits IVotingPowerSource so consumers (service managers) can depend on
the narrow voting-power surface without pulling in the full mesh interface.


## Functions
### initialize

Initialize the token weighting node (called once by factory or deployer after clone)


```solidity
function initialize(address provider_, address governance_) external;
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`provider_`|`address`|The single provider address allowed to call stake/releaseStake|
|`governance_`|`address`|The governance address allowed to update weights|


### stake

Provider credits stake to a staker on a specific denom.

The provider is the only authorized caller; `staker` is the address whose
voting power is updated. This enables one provider contract (e.g. an
OperatorRegistry) to route multi-staker stake into a single TokenWeighting
sink — each staker gets its own per-denom row and its own power checkpoints.


```solidity
function stake(address staker, bytes32 denom, uint256 amount) external;
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`staker`|`address`|The address whose stake is being credited.|
|`denom`|`bytes32`|The denom being staked.|
|`amount`|`uint256`|The amount being staked.|


### releaseStake

Provider debits stake from a staker — decrements stake and updates checkpoints.


```solidity
function releaseStake(address staker, bytes32 denom, uint256 amount) external;
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`staker`|`address`|The address whose stake is being debited.|
|`denom`|`bytes32`|The denom to release.|
|`amount`|`uint256`|The amount to release.|


### updateWeight

Governance updates the per-denom normalization weight.

`weightBps` is a full-precision (uint256) governance factor applied as
`power = rawStake * weightBps / 10_000`. It is NOT capped at 10_000: it
simultaneously absorbs (a) decimal normalization of heterogeneous backing
tokens into a single common voting unit and (b) risk policy (haircut). E.g.
to map a 1e6-decimal token into a 1e18 common "dollar" unit at par,
`weightBps = 1e16`; a 1e18-decimal token at a governance-chosen rate `r`
(in common units per whole token) with haircut `h` uses
`weightBps = r * h / 1e18 * 10_000`. No price oracle is involved — the
factor is governance-set.


```solidity
function updateWeight(bytes32 denom, uint256 weightBps) external;
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`denom`|`bytes32`|The denom whose weight to update (registers new denom if first call)|
|`weightBps`|`uint256`|Full-precision normalization factor (e.g., 1e16, 3.2e7)|


### retireDenom

Governance retires a denom so it stops contributing to voting power
and stops accepting new stake — the bounded-set counterpart to
`updateWeight`, needed because the unbounded `_denoms` set drives the
O(denoms) cost of the quorum-validation voting-power queries.

A denom that never accrued stake is purged from the iterated set outright
(it contributed zero at every block, so no historical query changes). A
denom with stake history is instead made inert via a weight-0 epoch: its
contribution is zero from this block onward while every block before the
retirement still resolves the weight in force then — so `getVotingPowerAt`
`getTotalPowerAt` at past blocks are unchanged. Re-activate a retired
denom by calling `updateWeight` with a non-zero weight.


```solidity
function retireDenom(bytes32 denom) external;
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`denom`|`bytes32`|The denom to retire.|


### denomCount

The number of registered (iterated) denoms. Bounded by MAX_DENOMS.


```solidity
function denomCount() external view returns (uint256);
```

### isDenomRetired

Whether `denom` is retired (inert, weight-0, rejecting new stake).


```solidity
function isDenomRetired(bytes32 denom) external view returns (bool);
```

### currentStake

Current raw (pre-weight) stake credited to a staker for a denom.


```solidity
function currentStake(address staker, bytes32 denom) external view returns (uint256);
```

### transferGovernance

Transfer governance to a new address. The caller must be the current
governance. The new address receives DEFAULT_ADMIN_ROLE and REWARDER_ROLE;
the old address loses both. Single-step — used to hand a TokenWeighting
node off to a Governor's Timelock.


```solidity
function transferGovernance(address newGovernance) external;
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`newGovernance`|`address`|The new governance address (must be non-zero)|


### distributeRewards

Distribute rewards to stakers proportional to their stake via per-share accumulator


```solidity
function distributeRewards(bytes32 stakeDenom, address rewardToken, uint256 rewardAmount) external;
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`stakeDenom`|`bytes32`|The denom used to calculate proportional shares|
|`rewardToken`|`address`|The ERC20 token being distributed as rewards|
|`rewardAmount`|`uint256`|The total reward amount to distribute|


### claimRewards

Claim accumulated rewards for a given stake denom and reward token


```solidity
function claimRewards(bytes32 stakeDenom, address rewardToken) external;
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`stakeDenom`|`bytes32`|The denom whose stake determines reward share|
|`rewardToken`|`address`|The ERC20 reward token to claim|


## Events
### Initialized

```solidity
event Initialized(address indexed provider, address indexed governance);
```

### Staked

```solidity
event Staked(address indexed staker, bytes32 indexed denom, uint256 amount);
```

### StakeReleased

```solidity
event StakeReleased(address indexed staker, bytes32 indexed denom, uint256 amount);
```

### WeightUpdated

```solidity
event WeightUpdated(bytes32 indexed denom, uint256 oldWeightBps, uint256 newWeightBps);
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

### GovernanceTransferred

```solidity
event GovernanceTransferred(address indexed oldGovernance, address indexed newGovernance);
```

### DenomRetired
A denom with stake history was retired: a weight-0 epoch zeroes its
contribution from this block onward (history before it is preserved),
and it rejects new stake until re-activated by `updateWeight`.


```solidity
event DenomRetired(bytes32 indexed denom, uint256 previousWeightBps);
```

### DenomPurged
A never-staked denom was purged from the iterated set outright,
reclaiming a slot. Removing it changes no historical query (it
contributed zero at every block).


```solidity
event DenomPurged(bytes32 indexed denom);
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

### OnlyGovernance

```solidity
error OnlyGovernance();
```

### ZeroAmount

```solidity
error ZeroAmount();
```

### ZeroWeightBps

```solidity
error ZeroWeightBps();
```

### ZeroTotalStake

```solidity
error ZeroTotalStake();
```

### InsufficientStake

```solidity
error InsufficientStake();
```

### UnregisteredDenom

```solidity
error UnregisteredDenom();
```

### RewardTooSmall

```solidity
error RewardTooSmall();
```

### RewardTokenLimit
thrown when distributeRewards would push the per-denom reward-token
set above MAX_REWARD_TOKENS (32). Bounds the cost of stake/release iteration.


```solidity
error RewardTokenLimit();
```

### ZeroGovernance

```solidity
error ZeroGovernance();
```

### DenomCapReached
thrown when registering a NEW denom would exceed MAX_DENOMS. Bounds the
O(denoms) cost of the voting-power queries used in quorum validation.
Retire an unused denom to reclaim a slot.


```solidity
error DenomCapReached();
```

### AlreadyRetired
thrown when retiring a denom that is already retired.


```solidity
error AlreadyRetired();
```

### DenomIsRetired
thrown when the provider stakes into a retired denom.


```solidity
error DenomIsRetired();
```
