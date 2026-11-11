---
title: AttestationArbiter
status: generated
source: src/periphery/arbiters/AttestationArbiter.sol
generated: true
---
# AttestationArbiter
**Inherits:**
[ArbiterBase](/docs/protocol/reference/contracts/shared/arbitration/ArbiterBase), `ServiceEnvelopeVerifier`

**Title:**
AttestationArbiter

Arbiter driven by signed envelopes from a operator set. Any
party can submit an envelope; the arbiter verifies the quorum
signed it and dispatches the encoded action to `CommitmentManager`.
This is the canonical operator-service flow: off-chain operators detect
misbehavior, sign an attestation, the arbiter routes it on-chain.
Policy lives in *what the operators are willing to sign* — the
arbiter just forwards once the crypto-economic bar is met.

The envelope's `payload` must be the ABI encoding of an `Attestation`
(`abi.encode(address(this), id, uint8(action), penaltyBps, deadline,
fromProposer, units, numeraire, evidenceHash)`) and the envelope's
`ordering` field must be the current per-`id` sequence number (see
`act`). Fields not read by the chosen action (e.g. `units` for a
`Release`) are ignored on dispatch but still bound by the signature.
Cross-arbiter replay is blocked by binding `address(this)` in the
payload; signatures don't cross different arbiters deployed from the
same codebase. Same-envelope replay is blocked by the shared
`ServiceEnvelopeVerifier` consumed-`eventId` set; cross-chain /
cross-instance replay is blocked by the bound service manager's EIP-712
domain separator (chain id + verifying instance folded into the digest). Stale replay across forfeit-proposal
INSTANCES (e.g. a withheld `CancelForfeit` signed for proposal #1
landing against a later proposal #2 on the same commitment) is blocked
by the strict per-`id` ordering sequence: every dispatched action bumps
the target's sequence, invalidating every envelope signed at an earlier
sequence value.


## State Variables
### _commitmentOrdering
Per-commitment strict-ordering sequence for commitment-scoped actions
(InitiateForfeit / CancelForfeit / Release). Envelopes must carry the
CURRENT value in `envelope.ordering`; each dispatch increments it.
Agreement-scoped dispatches also bump both leg commitments' sequences
(agreement actions create / settle forfeit proposals on the legs),
and commitment-scoped dispatches on an agreement leg bump the parent
agreement's sequence (leg actions change the state agreement-level
envelopes were signed against).


```solidity
mapping(uint256 commitmentId => uint96) private _commitmentOrdering
```


### _agreementOrdering
Per-agreement strict-ordering sequence for agreement-scoped actions
(ForfeitAgreement / ReleaseAgreement / SettleAgreement). Agreement ids
and commitment ids are independent counters in the manager, hence
separate mappings.


```solidity
mapping(uint256 agreementId => uint96) private _agreementOrdering
```


### _mutualOrdering
Per-mutual strict-ordering sequence for mutual-scoped actions
(ActivateMutual / InitiateMutualLoss / CancelMutualLoss). Mutual ids
are a third independent manager counter. Mutual actions do not cross
into the commitment/agreement scopes: the two-phase mutual-loss
lifecycle is a distinct subsystem from a member commitment's forfeit
lifecycle, so a mutual action bumps only this sequence.


```solidity
mapping(uint256 mutualId => uint96) private _mutualOrdering
```


## Functions
### constructor


```solidity
constructor(address manager_, address serviceManager_)
    ArbiterBase(manager_)
    ServiceEnvelopeVerifier(IServiceManager(serviceManager_));
```

### arbiterCapabilities

Bitmap of manager actions this arbiter is able to dispatch.

Reflects the current `Action` set exactly — the full commitment,
agreement (incl. bilateral settle), and mutual-loss arbiter surface.
`MUTUAL_LOSS` covers `activateMutual` / `initiateMutualLoss` /
`cancelMutualLoss` (the permissionless `executeMutualLoss` needs no
arbiter authority).


```solidity
function arbiterCapabilities() external pure returns (uint256);
```

### arbiterMetadataURI

Optional off-chain metadata pointer (URI) describing the
arbiter's policy, jurisdiction, or dispute process.

Policy lives in the operator set's signing rules, not on this
contract, so no static metadata pointer is published.


```solidity
function arbiterMetadataURI() external pure returns (string memory);
```

### commitmentOrdering

Current ordering sequence a commitment-scoped envelope
(InitiateForfeit / CancelForfeit / Release) must carry in
`envelope.ordering` for `commitmentId`.


```solidity
function commitmentOrdering(uint256 commitmentId) external view returns (uint96);
```

### agreementOrdering

Current ordering sequence an agreement-scoped envelope
(ForfeitAgreement / ReleaseAgreement / SettleAgreement) must carry
in `envelope.ordering` for `agreementId`.


```solidity
function agreementOrdering(uint256 agreementId) external view returns (uint96);
```

### mutualOrdering

Current ordering sequence a mutual-scoped envelope (ActivateMutual
InitiateMutualLoss / CancelMutualLoss) must carry in
`envelope.ordering` for `mutualId`.


```solidity
function mutualOrdering(uint256 mutualId) external view returns (uint96);
```

### act

Submit a signed envelope to dispatch an arbiter action.

envelope.payload MUST be the nine-field `Attestation`,
`abi.encode(address(this), uint256 id, uint8 action,
uint16 penaltyBps, uint256 deadline, bool fromProposer,
uint256 units, uint256 numeraire, bytes32 evidenceHash)`, and
envelope.ordering MUST be the uint96 big-endian encoding of the
current per-`id` sequence (`commitmentOrdering(id)` for
commitment-scoped actions, `agreementOrdering(id)` for
agreement-scoped actions, `mutualOrdering(id)` for mutual-scoped
actions). Any field mismatch, stale ordering, or failure to meet
signature quorum reverts.
Strict ordering means every dispatched action invalidates ALL
still-unconsumed envelopes signed at an earlier sequence for the
same target, binding each envelope to the exact state instance the
operators observed when signing — a `CancelForfeit` authorized for
one forfeit proposal can never cancel a later proposal on the same
commitment. Operators SHOULD nevertheless sign `CancelForfeit`
(and `Release`) authorizations with SHORT deadlines: until a
subsequent action bumps the sequence, a withheld envelope remains
submittable by anyone and the deadline is the only expiry.


```solidity
function act(IServiceHandler.Envelope calldata envelope, IServiceHandler.SignatureData calldata signatureData)
    external;
```

### _consumeOrdering

Strict-equality check-and-bump of the per-target ordering sequence.
The bump is bidirectional across the commitment/agreement scope
lattice: agreement-scoped actions additionally bump both leg
commitments' sequences (`forfeitAgreement` / `releaseAgreement`
create or settle forfeit proposals on the legs, so any withheld
leg-scoped envelope — e.g. a `CancelForfeit` signed for a prior leg
proposal — must go stale too), and commitment-scoped actions on an
agreement leg bump the parent agreement's sequence (e.g. a withheld
`ReleaseAgreement` signed before the arbiter initiated a forfeit on
a leg must not be able to release that leg out of the live
proposal). Sequences only move on successful dispatch — the whole
call reverts atomically otherwise.


```solidity
function _consumeOrdering(uint256 id, Action action, uint96 provided) internal;
```

### _dispatch


```solidity
function _dispatch(Action action, Attestation memory att) internal;
```

## Events
### Acted

```solidity
event Acted(Action indexed action, uint256 indexed id, uint16 penaltyBps, uint256 deadline);
```

## Errors
### ExpiredAttestation

```solidity
error ExpiredAttestation(uint256 deadline, uint256 blockTimestamp);
```

### WrongBoundArbiter

```solidity
error WrongBoundArbiter(address expected, address actual);
```

### InvalidAction

```solidity
error InvalidAction(uint8 action);
```

### OrderingMismatch

```solidity
error OrderingMismatch(uint96 expected, uint96 provided);
```

## Structs
### Attestation
Decoded envelope payload. All fields are static, so
`abi.encode(field, …)` and `abi.encode(Attestation{…})` produce
identical bytes — signers may build either. Fields unused by the
chosen action are ignored on dispatch (but bound by the signature).


```solidity
struct Attestation {
    address boundArbiter; // must equal address(this) — cross-arbiter replay guard
    uint256 id; // commitment / agreement / mutual id (per action scope)
    uint8 action; // Action enum
    uint16 penaltyBps; // InitiateForfeit / ForfeitAgreement
    uint256 deadline; // envelope expiry (unix seconds)
    bool fromProposer; // SettleAgreement: flow direction
    uint256 units; // SettleAgreement: settlement units
    uint256 numeraire; // InitiateMutualLoss: lossNumeraire
    bytes32 evidenceHash; // SettleAgreement / InitiateMutualLoss
}
```

## Enums
### Action

```solidity
enum Action {
    InitiateForfeit, // id = commitmentId    (commitment scope)
    CancelForfeit, // id = commitmentId    (commitment scope)
    Release, // id = commitmentId    (commitment scope)
    ForfeitAgreement, // id = agreementId     (agreement scope)
    ReleaseAgreement, // id = agreementId     (agreement scope)
    SettleAgreement, // id = agreementId     (agreement scope) — fromProposer, units, evidenceHash
    ActivateMutual, // id = mutualId        (mutual scope)
    InitiateMutualLoss, // id = mutualId        (mutual scope) — numeraire (lossNumeraire), evidenceHash
    CancelMutualLoss // id = mutualId        (mutual scope)
}
```
