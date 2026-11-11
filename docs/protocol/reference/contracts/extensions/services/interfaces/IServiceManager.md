---
title: IServiceManager
status: generated
source: src/extensions/services/interfaces/IServiceManager.sol
generated: true
---
# IServiceManager
**Title:**
IServiceManager

Generic envelope-verification vocabulary: a service manager validates
a signed `IServiceHandler.Envelope` against a quorum/threshold of
registered operator signatures. Consumed by `ServiceEnvelopeVerifier`
(and through it `AttestationArbiter`). The
name predates the protocol but the mechanism is not AVS-specific.


## Functions
### validate

Validates a signed envelope against quorum requirements.


```solidity
function validate(IServiceHandler.Envelope calldata envelope, IServiceHandler.SignatureData calldata signatureData)
    external
    view;
```

### getOperatorWeight

Returns the operator's current weight.


```solidity
function getOperatorWeight(address operator) external view returns (uint256);
```

### getServiceURI

Returns the service URI.


```solidity
function getServiceURI() external view returns (string memory);
```

### setServiceURI

Sets the service URI.


```solidity
function setServiceURI(string calldata _serviceURI) external;
```

### getLatestOperatorForSigningKey

Returns the operator address for a given signing key.


```solidity
function getLatestOperatorForSigningKey(address signingKeyAddress) external view returns (address);
```

### getStakeRegistry

Returns the linked operator registry (eligibility source) address.


```solidity
function getStakeRegistry() external view returns (address);
```

## Events
### ServiceURIUpdated

```solidity
event ServiceURIUpdated(string serviceURI);
```

### QuorumThresholdUpdated

```solidity
event QuorumThresholdUpdated(uint256 indexed numerator, uint256 indexed denominator);
```

## Errors
### LengthMismatch

```solidity
error LengthMismatch();
```

### InvalidLength

```solidity
error InvalidLength();
```

### NotSorted

```solidity
error NotSorted();
```

### InvalidSignature

```solidity
error InvalidSignature();
```

### SignerNotRegistered

```solidity
error SignerNotRegistered();
```

### InvalidReferenceBlock

```solidity
error InvalidReferenceBlock();
```

### StaleReferenceBlock
The caller passed a `referenceBlock` older than `maxReferenceBlockAge`
blocks behind the current head. Validation must use a recent snapshot.


```solidity
error StaleReferenceBlock(uint32 referenceBlock, uint96 maxAge);
```

### InsufficientSignedStake

```solidity
error InsufficientSignedStake();
```

### InsufficientQuorumZero

```solidity
error InsufficientQuorumZero();
```

### InsufficientQuorum

```solidity
error InsufficientQuorum(uint256 signerWeight, uint256 thresholdWeight, uint256 totalWeight);
```

### InvalidThresholdWeight

```solidity
error InvalidThresholdWeight();
```

### InvalidQuorumParameters

```solidity
error InvalidQuorumParameters();
```

### ZeroAmount

```solidity
error ZeroAmount();
```
