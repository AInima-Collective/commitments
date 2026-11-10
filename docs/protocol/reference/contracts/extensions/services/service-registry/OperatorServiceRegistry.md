---
title: OperatorServiceRegistry
status: generated
source: src/extensions/services/service-registry/OperatorServiceRegistry.sol
generated: true
---
# OperatorServiceRegistry
**Inherits:**
UUPSUpgradeable, AccessControlUpgradeable, EIP712Upgradeable, IERC1271, [IServiceManager](/docs/protocol/reference/contracts/extensions/services/interfaces/IServiceManager), [IOperatorServiceRegistry](/docs/protocol/reference/contracts/extensions/services/interfaces/IOperatorServiceRegistry)

**Title:**
OperatorServiceRegistry

Thin service-middleware glue: service-operator enrollment, signing
keys, quorum/threshold, and ECDSA signature validation. It custodies
no stake (hence "service registry", not "stake registry"): per-operator
voting power is read from an external IVotingPowerSource (typically a
TokenWeighting mesh node). A future BLS service manager can reuse the
same source.


## State Variables
### DEFAULT_MAX_REFERENCE_BLOCK_AGE
Default `maxReferenceBlockAge` when storage is unset.
256 blocks ≈ 1h on a 12s chain — a window large enough for honest
envelope signing latency yet too short to outrun deregistration.


```solidity
uint96 public constant DEFAULT_MAX_REFERENCE_BLOCK_AGE = 256
```


### ENVELOPE_TYPEHASH
EIP-712 type hash for the quorum-signed `Envelope`. The dynamic
`payload` is hashed (`keccak256(payload)`) per the EIP-712 encoding
of `bytes`; `eventId`/`ordering` are fixed-size and encoded inline.

Field names/order MUST match `IServiceHandler.Envelope` exactly, or
off-chain EIP-712 signers and on-chain verification diverge.


```solidity
bytes32 public constant ENVELOPE_TYPEHASH = keccak256("Envelope(bytes20 eventId,bytes12 ordering,bytes payload)")
```


## Functions
### constructor

Disable initializers on implementation contract (proxy pattern).


```solidity
constructor() ;
```

### initialize

Initialize the OperatorServiceRegistry.


```solidity
function initialize(
    address operatorRegistry_,
    address votingPowerSource_,
    address admin_,
    uint256 thresholdWeight_,
    uint256 quorumNumerator_,
    uint256 quorumDenominator_
) external initializer;
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`operatorRegistry_`|`address`|OperatorRegistry used for eligibility checks.|
|`votingPowerSource_`|`address`|External source of per-operator voting power.|
|`admin_`|`address`|Address granted DEFAULT_ADMIN_ROLE.|
|`thresholdWeight_`|`uint256`|Minimum absolute voting power required from signers.|
|`quorumNumerator_`|`uint256`|Quorum fraction numerator.|
|`quorumDenominator_`|`uint256`|Quorum fraction denominator.|


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
function setVotingPowerSource(address newSource) external onlyRole(DEFAULT_ADMIN_ROLE);
```

### votingPowerSource

Returns the configured IVotingPowerSource.


```solidity
function votingPowerSource() external view returns (address);
```

### getVotingPower

Current voting power for an operator.


```solidity
function getVotingPower(address operator) external view returns (uint256);
```

### getVotingPowerAt

Historical voting power for an operator at a given block.


```solidity
function getVotingPowerAt(address operator, uint256 blockNumber) external view returns (uint256);
```

### getTotalPower

Current total voting power across all registered operators.


```solidity
function getTotalPower() external view returns (uint256);
```

### getTotalPowerAt

Historical total voting power at a given block.


```solidity
function getTotalPowerAt(uint256 blockNumber) external view returns (uint256);
```

### validate

Validates a signed envelope against quorum requirements.


```solidity
function validate(IServiceHandler.Envelope calldata envelope, IServiceHandler.SignatureData calldata signatureData)
    external
    view;
```

### isValidSignature

Should return whether the signature provided is valid for the provided data


```solidity
function isValidSignature(bytes32 digest, bytes memory _signatureData) external view returns (bytes4);
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`digest`|`bytes32`||
|`_signatureData`|`bytes`||


### getOperatorWeight

Returns the operator's current weight.


```solidity
function getOperatorWeight(address operator) external view returns (uint256);
```

### getLatestOperatorForSigningKey

Returns the operator address for a given signing key.


```solidity
function getLatestOperatorForSigningKey(address signingKeyAddress) external view returns (address);
```

### getServiceURI

Returns the service URI.


```solidity
function getServiceURI() external view returns (string memory);
```

### setServiceURI

Sets the service URI.


```solidity
function setServiceURI(string calldata _serviceURI) external onlyRole(DEFAULT_ADMIN_ROLE);
```

### getStakeRegistry

Returns the linked operator registry (eligibility source) address.


```solidity
function getStakeRegistry() external view returns (address);
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

### updateStakeThreshold

Update the minimum absolute voting power threshold.


```solidity
function updateStakeThreshold(uint256 thresholdWeight) external onlyRole(DEFAULT_ADMIN_ROLE);
```

### updateQuorum

Update the quorum fraction.


```solidity
function updateQuorum(uint256 quorumNumerator, uint256 quorumDenominator) external onlyRole(DEFAULT_ADMIN_ROLE);
```

### setMaxReferenceBlockAge

Update the max age (in blocks) accepted for `referenceBlock`
in `validate()` and `isValidSignature()`.

Reverts `ZeroAmount` on 0. Until first set, the default of 256 blocks (≈ 1h at
12s/block) applies.


```solidity
function setMaxReferenceBlockAge(uint96 newValue) external onlyRole(DEFAULT_ADMIN_ROLE);
```

### maxReferenceBlockAge

Returns the active `maxReferenceBlockAge` (lazy-init aware).


```solidity
function maxReferenceBlockAge() external view returns (uint96);
```

### _checkSignatures


```solidity
function _checkSignatures(
    bytes32 digest,
    address[] memory signers,
    bytes[] memory signatures,
    uint32 referenceBlock
) internal view;
```

### _getOperatorForSigningKey


```solidity
function _getOperatorForSigningKey(
    OperatorServiceRegistryStorage.Layout storage s,
    address signingKey,
    uint32 referenceBlock
) internal view returns (address operator);
```

### _getOperatorPower


```solidity
function _getOperatorPower(OperatorServiceRegistryStorage.Layout storage s, address operator, uint32 referenceBlock)
    internal
    view
    returns (uint256);
```

### _validateThresholdStake


```solidity
function _validateThresholdStake(
    OperatorServiceRegistryStorage.Layout storage s,
    uint256 signedWeight,
    uint32 referenceBlock
) internal view;
```

### _updateStakeThreshold


```solidity
function _updateStakeThreshold(uint256 thresholdWeight) internal;
```

### _updateQuorum


```solidity
function _updateQuorum(uint256 quorumNumerator, uint256 quorumDenominator) internal;
```

### _authorizeUpgrade

Only DEFAULT_ADMIN_ROLE can authorize upgrades.


```solidity
function _authorizeUpgrade(address) internal override onlyRole(DEFAULT_ADMIN_ROLE);
```
