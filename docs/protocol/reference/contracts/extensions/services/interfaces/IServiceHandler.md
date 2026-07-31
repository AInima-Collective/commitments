---
title: IServiceHandler
status: generated
source: src/extensions/services/interfaces/IServiceHandler.sol
generated: true
---
# IServiceHandler
**Title:**
IServiceHandler

Interface for service handlers that receive signed envelopes.


## Functions
### handleSignedEnvelope

Handles a signed envelope from the aggregator.


```solidity
function handleSignedEnvelope(Envelope calldata envelope, SignatureData calldata signatureData) external;
```

### getServiceManager

Returns the address of the service manager used for validation.


```solidity
function getServiceManager() external view returns (address);
```

## Structs
### SignatureData
Signature data accompanying an envelope.


```solidity
struct SignatureData {
    address[] signers;
    bytes[] signatures;
    uint32 referenceBlock;
}
```

### Envelope
Envelope containing event data from the operator service.


```solidity
struct Envelope {
    bytes20 eventId;
    bytes12 ordering; // Consumer-defined sequencing (e.g. AttestationArbiter's strict per-target ordering)
    bytes payload;
}
```
