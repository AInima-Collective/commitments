---
title: OptimisticMutualArbiter
status: generated
source: src/extensions/mutuals/OptimisticMutualArbiter.sol
generated: true
---
# OptimisticMutualArbiter
**Inherits:**
[IArbiter](/docs/protocol/reference/contracts/shared/arbitration/interfaces/IArbiter), Ownable2Step, ReentrancyGuardTransient

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
calls `manager.executeMutualLoss` directly once the window elapses, and the honest
proposer reclaims the bond here. One active claim per mutual (mirrors the manager's INV-7).


## Constants
### manager

```solidity
ICommitmentManager public immutable manager
```


### bondToken

```solidity
IERC20 public immutable bondToken
```


### minBond

```solidity
uint256 public immutable minBond
```


## State Variables
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
    Ownable(owner_);
```

### commitmentManager

Returns the CommitmentManager this arbiter dispatches to.

Implementations should make this immutable to preserve the trust
model commitments opt into when naming this contract as arbiter.


```solidity
function commitmentManager() external view returns (address);
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

### supportsInterface

Returns true if this contract implements the interface defined by
`interfaceId`. See the corresponding
https://eips.ethereum.org/EIPS/eip-165#how-interfaces-are-identified[ERC section]
to learn more about how these ids are created.
This function call must use less than 30 000 gas.


```solidity
function supportsInterface(bytes4 interfaceId) external pure returns (bool);
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

Activate a mutual whose arbiter is this contract (owner-gated — the assembler/committee
flips it once target capacity is filled).


```solidity
function activate(uint256 mutualId) external onlyOwner;
```

### proposeLoss

Post a bond and declare a mutual loss, opening the manager's mutual challenge window.
No cover binding is referenced (the snapshot fields stay zero).


```solidity
function proposeLoss(uint256 mutualId, uint256 lossNumeraire, bytes32 evidenceHash, uint256 bond)
    external
    nonReentrant;
```

### proposeLossFor

Post a bond and declare a mutual loss, snapshotting a cover binding into the claim for
AUDITABILITY ONLY. Reads `{notional, expiry, policyholder}` from the LinkedMutual-
Policy and records it on the `Claim`; the snapshot gates NOTHING — the core settles
whatever is validated regardless of whether a funded policy exists (plan Risk #2,
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

Shared propose body. Bond custody + claim recording + manager initiation; the snapshot
args are advisory-only (zero for the plain path).


```solidity
function _proposeLoss(
    uint256 mutualId,
    uint256 lossNumeraire,
    bytes32 evidenceHash,
    uint256 bond,
    uint256 coverBindingId,
    uint256 snapshotNotional,
    uint64 snapshotExpiry,
    address snapshotPolicyholder
) internal;
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

After an UNDISPUTED loss has executed in the manager, the honest proposer reclaims
the bond. Reverts until the manager has marked the proposal executed.


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
### ZeroAddress

```solidity
error ZeroAddress();
```

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

### NotProposer

```solidity
error NotProposer();
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

```solidity
struct Claim {
    address proposer;
    uint256 bond;
    uint64 proposedAt;
    bool vetoed;
    bool resolved; // bond reclaimed or slashed
    // ---- Cover-binding snapshot (auditability ONLY; NEVER a settlement gate) ----
    // Captured from the LinkedMutualPolicy at propose time so periphery/indexer can surface
    // "this loss does / does not match an active, funded policy". The core settles regardless;
    // a plain `proposeLoss` (no binding) leaves all four fields zero. (ERC §6 / plan Risk #2.)
    uint256 coverBindingId; // 0 == no binding referenced
    uint256 snapshotNotional;
    uint64 snapshotExpiry;
    address snapshotPolicyholder;
}
```
