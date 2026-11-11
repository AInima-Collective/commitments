---
title: IFanIn
status: generated
source: src/extensions/mesh/interfaces/IFanIn.sol
generated: true
---
# IFanIn
## Functions
### initialize

Initialize the fan-in node (called once by factory after clone)


```solidity
function initialize(address consumer, address manager) external;
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`consumer`|`address`|The single consumer address that receives aggregated stake|
|`manager`|`address`|The manager/owner address that can register providers|


### registerProvider

Register a provider with its denom mapping


```solidity
function registerProvider(
    address provider,
    bytes32 denomIn,
    bytes32 denomOut,
    uint16 maxPenaltyBps,
    uint64 unbondingPeriod
) external;
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`provider`|`address`|The provider address whose stake the manager credits via stake()|
|`denomIn`|`bytes32`|The denom string the provider stakes with|
|`denomOut`|`bytes32`|The local denom this fan-in exposes to the consumer|
|`maxPenaltyBps`|`uint16`|Max forfeiture in basis points (0..10_000) for this provider's stake|
|`unbondingPeriod`|`uint64`|Unbonding period in seconds for this provider's stake|


### stake

Credit a registered provider's stake — mapped from denomIn to denomOut.

Manager-only: only the verifying manager (e.g. OperatorRegistry) may credit
stake, so mesh stake can never exceed real, manager-verified backing. The
provider is passed explicitly rather than inferred from msg.sender.


```solidity
function stake(address provider, bytes32 denomIn, uint256 amount) external;
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`provider`|`address`|The registered provider whose stake is credited.|
|`denomIn`|`bytes32`|The denom being staked (must be registered for `provider`).|
|`amount`|`uint256`|The amount being staked.|


### totalStake

Total stake aggregated for a local output denom.


```solidity
function totalStake(bytes32 denomOut) external view returns (uint256);
```

### releaseStake

Consumer or manager releases stake back to its registered provider.

the provider is derived from `outputSources[denomOut]`
rather than passed in, so off-chain indexers cannot be poisoned by a consumer
emitting an arbitrary provider address.


```solidity
function releaseStake(bytes32 denomOut, uint256 amount) external;
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`denomOut`|`bytes32`|The local denom to release|
|`amount`|`uint256`|The amount to release|
