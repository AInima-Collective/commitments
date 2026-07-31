---
title: IMeshFactory
status: generated
source: src/extensions/mesh/interfaces/IMeshFactory.sol
generated: true
---
# IMeshFactory
**Title:**
IMeshFactory

Factory for deploying FanIn, FanOut, and TokenWeighting mesh nodes as minimal clones.
Atomic clone + initialize to prevent front-running.


## Functions
### fanInImpl


```solidity
function fanInImpl() external view returns (address);
```

### fanOutImpl


```solidity
function fanOutImpl() external view returns (address);
```

### tokenWeightingImpl


```solidity
function tokenWeightingImpl() external view returns (address);
```

### deployFanIn

Deploy a FanIn clone and initialize it atomically


```solidity
function deployFanIn(address consumer, address manager) external returns (address clone);
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`consumer`|`address`|The single consumer for the fan-in node|
|`manager`|`address`|The manager/owner address|

**Returns**

|Name|Type|Description|
|----|----|-----------|
|`clone`|`address`|The address of the deployed FanIn clone|


### deployFanOut

Deploy a FanOut clone and initialize it atomically


```solidity
function deployFanOut(address provider, address manager) external returns (address clone);
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`provider`|`address`|The single provider for the fan-out node|
|`manager`|`address`|The manager/owner address|

**Returns**

|Name|Type|Description|
|----|----|-----------|
|`clone`|`address`|The address of the deployed FanOut clone|


### deployFanOutWithPenalty

Deploy a FanOut clone with a configured input penalty cap (, ).


```solidity
function deployFanOutWithPenalty(address provider, address manager, uint16 inputMaxPenaltyBps)
    external
    returns (address clone);
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`provider`|`address`|The single provider for the fan-out node|
|`manager`|`address`|The manager/owner address|
|`inputMaxPenaltyBps`|`uint16`|The cap in basis points (0..10_000) the provider committed upstream|

**Returns**

|Name|Type|Description|
|----|----|-----------|
|`clone`|`address`|The address of the deployed FanOut clone|


### deployTokenWeighting

Deploy a TokenWeighting clone and initialize it atomically


```solidity
function deployTokenWeighting(address provider, address governance) external returns (address clone);
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`provider`|`address`|The single provider for the token weighting node|
|`governance`|`address`|The governance address for weight updates|

**Returns**

|Name|Type|Description|
|----|----|-----------|
|`clone`|`address`|The address of the deployed TokenWeighting clone|


### deployFanInAt

Deploy a FanIn clone at a deterministic address derived from salt


```solidity
function deployFanInAt(bytes32 salt, address consumer, address manager) external returns (address clone);
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`salt`|`bytes32`|Arbitrary bytes32 salt for address derivation|
|`consumer`|`address`|The single consumer for the fan-in node|
|`manager`|`address`|The manager/owner address|

**Returns**

|Name|Type|Description|
|----|----|-----------|
|`clone`|`address`|The deployed clone address (predictable via Clones.predictDeterministicAddress)|


### deployFanOutAt

Deploy a FanOut clone at a deterministic address derived from salt


```solidity
function deployFanOutAt(bytes32 salt, address provider, address manager) external returns (address clone);
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`salt`|`bytes32`|Arbitrary bytes32 salt for address derivation|
|`provider`|`address`|The single provider for the fan-out node|
|`manager`|`address`|The manager/owner address|

**Returns**

|Name|Type|Description|
|----|----|-----------|
|`clone`|`address`|The deployed clone address|


### deployFanOutWithPenaltyAt

Deterministic FanOut deploy with a configured input penalty cap.


```solidity
function deployFanOutWithPenaltyAt(bytes32 salt, address provider, address manager, uint16 inputMaxPenaltyBps)
    external
    returns (address clone);
```

### deployTokenWeightingAt

Deploy a TokenWeighting clone at a deterministic address derived from salt


```solidity
function deployTokenWeightingAt(bytes32 salt, address provider, address governance) external returns (address clone);
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`salt`|`bytes32`|Arbitrary bytes32 salt for address derivation|
|`provider`|`address`|The single provider for the token weighting node|
|`governance`|`address`|The governance address for weight updates|

**Returns**

|Name|Type|Description|
|----|----|-----------|
|`clone`|`address`|The deployed clone address|


### predictFanInAddress

Predict the deterministic address for a FanIn clone with a given salt


```solidity
function predictFanInAddress(bytes32 salt) external view returns (address);
```

### predictFanOutAddress

Predict the deterministic address for a FanOut clone with a given salt


```solidity
function predictFanOutAddress(bytes32 salt) external view returns (address);
```

### predictTokenWeightingAddress

Predict the deterministic address for a TokenWeighting clone with a given salt


```solidity
function predictTokenWeightingAddress(bytes32 salt) external view returns (address);
```

## Events
### NodeDeployed
Emitted when a new node clone is deployed and initialized


```solidity
event NodeDeployed(address indexed impl, address indexed clone, string nodeType);
```

**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`impl`|`address`|The implementation contract address that was cloned|
|`clone`|`address`|The newly deployed clone address|
|`nodeType`|`string`|The node type string (e.g. "fan_in", "fan_out", "token_weighting")|
