---
title: ManualArbiter
status: generated
source: src/periphery/arbiters/ManualArbiter.sol
generated: true
---
# ManualArbiter
**Inherits:**
[ArbiterBase](/docs/protocol/reference/contracts/shared/arbitration/ArbiterBase), Ownable2Step

**Title:**
ManualArbiter

Minimal arbiter controlled by a single owner (EOA or multisig).
Every forfeit/release decision is a manual call from the owner.
Serves as the reference implementation for the simplest arbiter
shape — third parties can fork and replace the auth check with
committee votes, oracle predicates, ZK proofs, Kleros rulings, etc.

Intended for demos, bootstrap deployments, and services with a trusted
admin. Production AVS services should prefer `AttestationArbiter` (or
another policy-encoded arbiter) where the policy is auditable from
on-chain code alone.


## State Variables
### _metadataURI
Owner-settable off-chain metadata pointer (jurisdiction, policy,
dispute process). Empty until the owner sets it.


```solidity
string private _metadataURI
```


## Functions
### constructor


```solidity
constructor(address owner_, address manager_) Ownable(owner_) ArbiterBase(manager_);
```

### arbiterCapabilities

Bitmap of manager actions this arbiter is able to dispatch.

The owner drives every action manually, so ManualArbiter can reach
the entire arbiter-authenticated manager surface — commitment,
agreement, and mutual.


```solidity
function arbiterCapabilities() external pure returns (uint256);
```

### arbiterMetadataURI

Optional off-chain metadata pointer (URI) describing the
arbiter's policy, jurisdiction, or dispute process.

Empty string if the arbiter publishes no metadata. Not consumed
on-chain; surfaced for the human/service trust decision.


```solidity
function arbiterMetadataURI() external view returns (string memory);
```

### setMetadataURI

Set the off-chain metadata pointer surfaced via [arbiterMetadataURI](/docs/protocol/reference/contracts/periphery/arbiters/ManualArbiter#arbitermetadatauri).


```solidity
function setMetadataURI(string calldata uri) external onlyOwner;
```

### initiateForfeit

Initiate a forfeit on a commitment. Starts the challenge window.


```solidity
function initiateForfeit(uint256 commitmentId, uint16 penaltyBps) external onlyOwner;
```

### cancelForfeit

Cancel a pending forfeit (only during the challenge window).


```solidity
function cancelForfeit(uint256 commitmentId) external onlyOwner;
```

### release

Release an active commitment — frees the committer's encumbered backing.


```solidity
function release(uint256 commitmentId) external onlyOwner;
```

### forfeitAgreement

Forfeit both sides of an agreement atomically at `penaltyBps`.

The supplied penalty must fit each unresolved leg's independent ceiling; the tighter ceiling binds.


```solidity
function forfeitAgreement(uint256 agreementId, uint16 penaltyBps) external onlyOwner;
```

### releaseAgreement

Release both sides of an agreement atomically.


```solidity
function releaseAgreement(uint256 agreementId) external onlyOwner;
```

### settleAgreement

Arbiter-instructed bilateral settle within the agreement's per-direction
lifetime caps.


```solidity
function settleAgreement(uint256 agreementId, bool fromProposer, uint256 units, bytes32 evidenceHash)
    external
    onlyOwner;
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`agreementId`|`uint256`|Target agreement.|
|`fromProposer`|`bool`|Direction: true = proposer pays acceptor.|
|`units`|`uint256`|Encumbered backing units to move from payer to receiver.|
|`evidenceHash`|`bytes32`|Opaque arbiter audit-trail commitment (e.g. EAS UID).|


### activateMutual

Activate a mutual so it can accept losses. No loss can be
declared until the mutual is active.


```solidity
function activateMutual(uint256 mutualId) external onlyOwner;
```

### initiateMutualLoss

Declare a loss against a mutual, opening its challenge window.


```solidity
function initiateMutualLoss(uint256 mutualId, uint256 lossNumeraire, bytes32 evidenceHash) external onlyOwner;
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`mutualId`|`uint256`|Target mutual.|
|`lossNumeraire`|`uint256`|Loss amount denominated in the mutual's numeraire.|
|`evidenceHash`|`bytes32`|Opaque arbiter audit-trail commitment (e.g. EAS UID).|


### cancelMutualLoss

Cancel (veto) a pending mutual loss during its challenge window.


```solidity
function cancelMutualLoss(uint256 mutualId) external onlyOwner;
```

## Events
### MetadataURIUpdated
Emitted when the owner updates the arbiter's metadata URI.


```solidity
event MetadataURIUpdated(string uri);
```
