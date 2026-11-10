---
title: IOperatorServiceRegistry
status: generated
source: src/extensions/services/interfaces/IOperatorServiceRegistry.sol
generated: true
---
# IOperatorServiceRegistry
**Title:**
IOperatorServiceRegistry

Interface for the OperatorServiceRegistry — a thin service-middleware glue
layer. Holds service-operator enrollment, signing keys, quorum/threshold,
and signature validation. It custodies no stake; operator voting power is
delegated to an external IVotingPowerSource (configurable, typically a
TokenWeighting mesh node).

Enrollment here is distinct from `OperatorRegistry.register()`: that backs an
operator with committed capital, whereas `enrollServiceOperator()` opts an
already-eligible operator into THIS service's signing/voting-power set.


## Functions
### enrollServiceOperator

Enroll the caller as a service operator (signing/voting-power
participant) in this middleware.

Caller must be an active operator in the linked OperatorRegistry. This
is service participation, not stake custody — no capital moves here.


```solidity
function enrollServiceOperator() external;
```

### withdrawServiceOperator

Withdraw a service operator from this middleware.

Callable by admin or the operator themselves. Clears the signing key
so historical signature validation at post-withdrawal blocks fails.


```solidity
function withdrawServiceOperator(address operator) external;
```

### updateOperatorSigningKey

Update the caller's signing key. The new key must sign a
domain-separated proof of possession (operator, this, chainid).


```solidity
function updateOperatorSigningKey(address newSigningKey, bytes memory signingKeySignature) external;
```

### setVotingPowerSource

Set the IVotingPowerSource used for operator weight lookups.

Admin only. Changing the source changes the power reading for the
current block onward; historical queries delegate to the *current*
source (no snapshots are taken inside the registry).


```solidity
function setVotingPowerSource(address newSource) external;
```

### votingPowerSource

Returns the configured IVotingPowerSource.


```solidity
function votingPowerSource() external view returns (address);
```

### operatorRegistered

Whether an address is registered in this middleware.


```solidity
function operatorRegistered(address operator) external view returns (bool);
```

### getOperatorSigningKeyAtBlock

Returns the operator's signing key at a given block.


```solidity
function getOperatorSigningKeyAtBlock(address operator, uint32 blockNumber) external view returns (address);
```

### getLatestOperatorSigningKey

Returns the operator's latest signing key.


```solidity
function getLatestOperatorSigningKey(address operator) external view returns (address);
```

### operatorRegistry

Returns the linked OperatorRegistry address (the eligibility source).


```solidity
function operatorRegistry() external view returns (address);
```

## Events
### OperatorRegistered

```solidity
event OperatorRegistered(address indexed operator);
```

### OperatorDeregistered

```solidity
event OperatorDeregistered(address indexed operator);
```

### OperatorSigningKeyUpdated

```solidity
event OperatorSigningKeyUpdated(address indexed operator, address indexed oldKey, address indexed newKey);
```

### StakeThresholdUpdated

```solidity
event StakeThresholdUpdated(uint256 newThreshold);
```

### VotingPowerSourceUpdated

```solidity
event VotingPowerSourceUpdated(address indexed oldSource, address indexed newSource);
```

### MaxReferenceBlockAgeUpdated
Emitted when admin updates the `maxReferenceBlockAge` gate.


```solidity
event MaxReferenceBlockAgeUpdated(uint96 oldValue, uint96 newValue);
```

## Errors
### NotActiveOperator

```solidity
error NotActiveOperator();
```

### AlreadyRegistered

```solidity
error AlreadyRegistered();
```

### NotRegistered

```solidity
error NotRegistered();
```

### InvalidSigningKey

```solidity
error InvalidSigningKey();
```

### SigningKeyAlreadyAssigned

```solidity
error SigningKeyAlreadyAssigned();
```

### InvalidSigningKeySignature

```solidity
error InvalidSigningKeySignature();
```

### NotAdminOrSelf

```solidity
error NotAdminOrSelf();
```

### InvalidVotingPowerSource

```solidity
error InvalidVotingPowerSource();
```

### InvalidOperatorRegistry

```solidity
error InvalidOperatorRegistry();
```

### InvalidAdmin

```solidity
error InvalidAdmin();
```
