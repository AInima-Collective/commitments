---
title: OptimisticMutualArbiter
status: generated
source: src/extensions/mutuals/OptimisticMutualArbiter.sol
generated: true
---
# OptimisticMutualArbiter
**Inherits:**
[ArbiterBase](/docs/protocol/reference/contracts/shared/arbitration/ArbiterBase), Ownable2Step, ReentrancyGuardTransient

**Title:**
OptimisticMutualArbiter

The pluggable mutual arbiter for a Mutual: a bonded/optimistic loss-
declaration path that sits between a claim proposer and the custody root's two-phase
`initiateMutualLoss` / `executeMutualLoss`. This is where the dispute model lives —
the Mutuals core (ERC-COMMITMENTS-MUTUALS) deliberately keeps native-token bond custody OUT of the
manager and
delegates it to a pluggable arbiter (mirrors `OptimisticInsuranceArbiter` for the
per-commitment path).

Flow: a proposer posts an ERC-20 `bond` and declares a loss; the manager's mutual challenge
window opens. A dispute committee (the `owner`) may VETO during the window — that cancels
the declaration in the manager and slashes the bond to `treasury`. If undisputed, anyone
calls `manager.executeMutualLoss` directly once the window elapses, and anyone reclaims the
bond to the proposer here (or the next `proposeLoss` does it). One active claim per mutual
(mirrors the manager's INV-7).


## State Variables
### bondToken

```solidity
IERC20 public immutable bondToken
```


### minBond

```solidity
uint256 public immutable minBond
```


### treasury

```solidity
address public treasury
```


### coverPolicy
The LinkedMutualPolicy whose cover bindings `proposeLossFor` snapshots. Owner-set
after deploy (avoids a constructor-signature break / policy<->arbiter deploy cycle).
Optional: when unset, only the plain `proposeLoss` (no snapshot) is usable.


```solidity
address public coverPolicy
```


### claims
mutualId => active/last claim.


```solidity
mapping(uint256 => Claim) public claims
```


## Functions
### constructor


```solidity
constructor(address manager_, address bondToken_, uint256 minBond_, address treasury_, address owner_)
    Ownable(owner_)
    ArbiterBase(manager_);
```

### arbiterCapabilities

Bitmap of manager actions this arbiter is able to dispatch.

Drives the mutual loss lifecycle only (`activateMutual` via
[activate](/docs/protocol/reference/contracts/extensions/mutuals/OptimisticMutualArbiter#activate), `initiateMutualLoss` via [proposeLoss](/docs/protocol/reference/contracts/extensions/mutuals/OptimisticMutualArbiter#proposeloss), `cancelMutualLoss`
via [veto](/docs/protocol/reference/contracts/extensions/mutuals/OptimisticMutualArbiter#veto)); it never touches per-commitment or agreement actions.


```solidity
function arbiterCapabilities() external pure returns (uint256);
```

### arbiterMetadataURI

Optional off-chain metadata pointer (URI) describing the
arbiter's policy, jurisdiction, or dispute process.

The bonded dispute terms live in on-chain state; no off-chain
pointer is published.


```solidity
function arbiterMetadataURI() external pure returns (string memory);
```

### setTreasury


```solidity
function setTreasury(address treasury_) external onlyOwner;
```

### setCoverPolicy

Wire the LinkedMutualPolicy whose cover bindings `proposeLossFor` snapshots. Set
post-deploy to avoid a constructor break and the policy<->arbiter deploy cycle.


```solidity
function setCoverPolicy(address coverPolicy_) external onlyOwner;
```

### activate

Activate a mutual whose arbiter is this contract (owner-gated). Members can only join
an active mutual, so activation means the committee accepts the mutual; it does not
wait for target capacity.


```solidity
function activate(uint256 mutualId) external onlyOwner;
```

### proposeLoss

Post a bond and declare a mutual loss, opening the manager's mutual challenge window.
No cover binding is referenced.


```solidity
function proposeLoss(uint256 mutualId, uint256 lossNumeraire, bytes32 evidenceHash, uint256 bond)
    external
    nonReentrant;
```

### proposeLossFor

Post a bond and declare a mutual loss, snapshotting a cover binding into the claim for
AUDITABILITY ONLY. Reads `{notional, expiry, policyholder}` from the LinkedMutual-
Policy and emits it in `CoverBindingSnapshotted`; the snapshot gates NOTHING — the core
settles whatever is validated regardless of whether a funded policy exists (plan Risk #2,
premium-without-cover is accepted arbiter/social trust). Otherwise identical to
`proposeLoss`. The binding must belong to `mutualId`.


```solidity
function proposeLossFor(
    uint256 mutualId,
    uint256 lossNumeraire,
    bytes32 evidenceHash,
    uint256 bond,
    uint256 coverBindingId
) external nonReentrant;
```

### _proposeLoss

Shared propose body. Bond custody + claim recording + manager initiation. A prior
unresolved claim whose manager proposal has executed or been cancelled is refunded to
its proposer first; only a claim still pending in the manager reverts `ClaimActive`.


```solidity
function _proposeLoss(uint256 mutualId, uint256 lossNumeraire, bytes32 evidenceHash, uint256 bond) internal;
```

### veto

Dispute committee veto, only WITHIN the manager's mutual challenge window: cancel the
declaration in the manager and slash the proposer's bond to the treasury. Gating to
the window preserves the optimistic guarantee — an undisputed proposal that survives
its window can no longer be vetoed-and-slashed (it simply executes).


```solidity
function veto(uint256 mutualId) external onlyOwner nonReentrant;
```

### reclaimBond

After an UNDISPUTED loss has executed in the manager, return the bond to the
proposer. Permissionless: the refund always goes to `proposer`. Reverts until the
manager has marked the proposal executed.


```solidity
function reclaimBond(uint256 mutualId) external nonReentrant;
```

### reclaimOnCancelled

Recover the bond and clear the claim when the manager proposal was CANCELLED without
executing — notably by the permissionless `cancelStaleMutualLoss` (reachable by
anyone after window + TTL, e.g. if forfeiture was paused or the proposer never
executed). Without this the bond would be permanently stuck and `proposeLoss` would
revert `ClaimActive` forever, bricking the mutual's claim path (red-team #1).
The proposer is refunded (a stale-cancel is not a committee judgment of bad faith;
the `veto` path is the one that slashes).


```solidity
function reclaimOnCancelled(uint256 mutualId) external nonReentrant;
```

### _refund

Mark the claim resolved and return its bond to the proposer.


```solidity
function _refund(uint256 mutualId, Claim storage c) private;
```

## Events
### LossProposed

```solidity
event LossProposed(uint256 indexed mutualId, address indexed proposer, uint256 lossNumeraire, uint256 bond);
```

### LossVetoed

```solidity
event LossVetoed(uint256 indexed mutualId, address indexed proposer, uint256 slashedBond);
```

### BondReclaimed

```solidity
event BondReclaimed(uint256 indexed mutualId, address indexed proposer, uint256 bond);
```

### TreasuryUpdated

```solidity
event TreasuryUpdated(address indexed treasury);
```

### CoverPolicyUpdated

```solidity
event CoverPolicyUpdated(address indexed coverPolicy);
```

### CoverBindingSnapshotted

```solidity
event CoverBindingSnapshotted(
    uint256 indexed mutualId, uint256 indexed coverBindingId, uint256 notional, uint64 expiry, address policyholder
);
```

## Errors
### BondTooLow

```solidity
error BondTooLow();
```

### ClaimActive

```solidity
error ClaimActive();
```

### NoClaim

```solidity
error NoClaim();
```

### AlreadyResolved

```solidity
error AlreadyResolved();
```

### LossNotExecuted

```solidity
error LossNotExecuted();
```

### VetoWindowClosed

```solidity
error VetoWindowClosed();
```

### LossNotCancelled

```solidity
error LossNotCancelled();
```

### CoverPolicyUnset

```solidity
error CoverPolicyUnset();
```

### BindingMutualMismatch

```solidity
error BindingMutualMismatch();
```

## Structs
### Claim
The cover-binding snapshot `proposeLossFor` takes is emitted in `CoverBindingSnapshotted`,
not stored: nothing on chain reads it.


```solidity
struct Claim {
    address proposer;
    uint64 proposedAt;
    bool resolved; // bond reclaimed or slashed
    uint256 bond;
}
```
