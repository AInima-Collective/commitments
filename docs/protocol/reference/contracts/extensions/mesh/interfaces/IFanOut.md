---
title: IFanOut
status: generated
source: src/extensions/mesh/interfaces/IFanOut.sol
generated: true
---
# IFanOut
**Inherits:**
[IFlowQuery](/docs/protocol/reference/contracts/extensions/mesh/interfaces/IFlowQuery)

**Title:**
IFanOut

Interface for the FanOutNode contract.
FanOut distributes one provider's committed stake to multiple consumers
with exposure allocation enforcement.


## Functions
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


### setOutflows

Configure consumer outflows for a specific denom

sum(portionBps) must be <= 10000 and consumers must be unique.
Re-validates exposure allocation.


```solidity
function setOutflows(bytes32 denom, Outflow[] calldata outflows) external;
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
function stake(bytes32 denom, uint256 amount) external;
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
function releaseStake(address staker, bytes32 denom, uint256 amount) external;
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
function distributeRewards(bytes32 stakeDenom, address rewardToken, uint256 rewardAmount) external;
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
function claimRewards(bytes32 stakeDenom, address rewardToken) external;
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`stakeDenom`|`bytes32`|The denom for which rewards are being claimed|
|`rewardToken`|`address`|The ERC20 reward token to claim|


### getUserInfo

Get per-staker info for a specific denom


```solidity
function getUserInfo(address staker, bytes32 denom) external view returns (UserInfo memory info);
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`staker`|`address`|The staker address|
|`denom`|`bytes32`|The stake denomination|

**Returns**

|Name|Type|Description|
|----|----|-----------|
|`info`|`UserInfo`|UserInfo struct with locked, maxLien, totalForfeitable|


### getOutflows

Get all outflows configured by a staker for a specific denom


```solidity
function getOutflows(address staker, bytes32 denom) external view returns (Outflow[] memory outflows);
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`staker`|`address`|The staker address|
|`denom`|`bytes32`|The stake denomination|

**Returns**

|Name|Type|Description|
|----|----|-----------|
|`outflows`|`Outflow[]`|Array of configured outflows|


### getLien

Get the lien a specific consumer holds against a staker/denom pair


```solidity
function getLien(address staker, bytes32 denom, address consumer) external view returns (FanOutLien memory lien);
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
|`lien`|`FanOutLien`|The FanOutLien struct (amount and exposure)|
