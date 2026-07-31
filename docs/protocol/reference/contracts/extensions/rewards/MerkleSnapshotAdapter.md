---
title: MerkleSnapshotAdapter
status: generated
source: src/extensions/rewards/MerkleSnapshotAdapter.sol
generated: true
---
# MerkleSnapshotAdapter
**Inherits:**
ReentrancyGuardTransient, `ServiceEnvelopeVerifier`, [IServiceHandler](/docs/protocol/reference/contracts/extensions/services/interfaces/IServiceHandler)

**Title:**
MerkleSnapshotAdapter

Validates quorum-signed envelopes and forwards merkle roots to
a bound `MerkleSnapshot.submitRoot`. Set as the snapshot's active
`updater` via the snapshot's §0.6 staged-swap surface
(`stageUpdater(adapter)` → `activateUpdater()`).
The snapshot is service-agnostic; auth on `submitRoot` resolves
against the snapshot's own `activeUpdater()`, which is this contract
once activated.

Non-upgradeable, with immutable bindings. Replay protection and the
domain-separated quorum validation are inherited from the shared
`ServiceEnvelopeVerifier` base — the same path the AttestationArbiter
uses — so the two core envelope consumers can't drift apart.


## Constants
### snapshot
The bound merkle snapshot.


```solidity
IMerkleSnapshot public immutable snapshot
```


## Functions
### constructor


```solidity
constructor(IServiceManager serviceManager_, IMerkleSnapshot snapshot_) ServiceEnvelopeVerifier(serviceManager_);
```

### handleSignedEnvelope


```solidity
function handleSignedEnvelope(
    IServiceHandler.Envelope calldata envelope,
    IServiceHandler.SignatureData calldata signatureData
) external nonReentrant;
```

### getServiceManager

Returns the address of the service manager used for validation.


```solidity
function getServiceManager() external view returns (address);
```

## Events
### RootRelayed
Emitted when an envelope is validated and its merkle root is
forwarded to the bound snapshot.


```solidity
event RootRelayed(bytes20 indexed eventId, bytes32 indexed merkleRoot, bytes32 ipfsHash, string ipfsCid);
```

## Errors
### ZeroAddress

```solidity
error ZeroAddress();
```

### ZeroRoot

```solidity
error ZeroRoot();
```
