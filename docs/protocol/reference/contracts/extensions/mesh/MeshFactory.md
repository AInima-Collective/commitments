---
title: MeshFactory
status: generated
source: src/extensions/mesh/MeshFactory.sol
generated: true
---
# MeshFactory
**Inherits:**
[IMeshFactory](/docs/protocol/reference/contracts/extensions/mesh/interfaces/IMeshFactory), `Factory`, `Multicallable`

**Title:**
MeshFactory

Deploys FanIn, FanOut, and TokenWeighting mesh nodes as minimal clones.
Each deploy*() call atomically clones the implementation and calls initialize() in the same
transaction, preventing initializer front-running.
Gas cost per clone + initialize is below 200k.

Shares the extracted `Factory` base: the three node implementations are
whitelisted at construction, each self-verified against its `FACTORY_TYPE_ID`, so the
factory can only ever clone vetted node types. The `deploy*` entry points remain
PERMISSIONLESS (the OperatorRegistry lazily clones per-operator FanIn nodes) — they
just gate on the whitelist/blacklist ladder, so the factory owner can `blacklist` a
node implementation to freeze new clones of it. `Multicallable` lets a caller batch
several node deploys (e.g. FanIn + TokenWeighting) into one transaction.


## Constants
### FAN_IN_TYPE_ID
Must equal `FanInNode.FACTORY_TYPE_ID`. Hardcoded so the factory asserts each slot's
node type and the implementation self-confirms it (a FanOut cannot fill the FanIn slot).


```solidity
bytes32 private constant FAN_IN_TYPE_ID = keccak256("commitments.mesh.fan_in")
```


### FAN_OUT_TYPE_ID
Must equal `FanOutNode.FACTORY_TYPE_ID`.


```solidity
bytes32 private constant FAN_OUT_TYPE_ID = keccak256("commitments.mesh.fan_out")
```


### TOKEN_WEIGHTING_TYPE_ID
Must equal `TokenWeighting.FACTORY_TYPE_ID`.


```solidity
bytes32 private constant TOKEN_WEIGHTING_TYPE_ID = keccak256("commitments.mesh.token_weighting")
```


### fanInImpl
FanIn implementation contract (immutable)


```solidity
address public immutable fanInImpl
```


### fanOutImpl
FanOut implementation contract (immutable)


```solidity
address public immutable fanOutImpl
```


### tokenWeightingImpl
TokenWeighting implementation contract (immutable)


```solidity
address public immutable tokenWeightingImpl
```


## Functions
### constructor

Whitelists each implementation via the `Factory` base, self-verifying it against
the node's `FACTORY_TYPE_ID`. The deployer becomes the owner of the
implementation-set controls (whitelist additions / blacklist valve).


```solidity
constructor(address _fanInImpl, address _fanOutImpl, address _tokenWeightingImpl) Factory(msg.sender);
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`_fanInImpl`|`address`|Address of the deployed FanInNode implementation|
|`_fanOutImpl`|`address`|Address of the deployed FanOutNode implementation|
|`_tokenWeightingImpl`|`address`|Address of the deployed TokenWeighting implementation|


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

salt is scoped to `keccak256(msg.sender, salt)` so a front-runner
cannot claim a predicted address with attacker-controlled init parameters.


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
function deployTokenWeightingAt(bytes32 salt, address provider, address governance)
    external
    returns (address clone);
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

prediction MUST mirror the salt scoping used by the deploy*At
variants. The caller passes their own bytes32; this function scopes by
`msg.sender` so the prediction matches the address the SAME caller would
get on deploy.


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

### _scopeSalt

scope a caller-supplied salt by `msg.sender` so deterministic
addresses are isolated per-caller. Two callers using the same `salt` will
derive different addresses.


```solidity
function _scopeSalt(bytes32 salt) internal view returns (bytes32);
```
