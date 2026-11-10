---
title: IMerkleSnapshot
status: generated
source: src/extensions/rewards/interfaces/IMerkleSnapshot.sol
generated: true
---
# IMerkleSnapshot
**Title:**
IMerkleSnapshot

Reusable on-chain root storage for cumulative-merkle distribution. The
snapshot is intentionally narrow: it stores roots, gates submit on its
own active updater, and gates disable on the service. It is the
"dumb storage" half of the snapshot/coordinator separation locked in
.
The snapshot is reusable beyond rewards — the same primitive backs
attestations, governance, and any cumulative-merkle pattern — so the
interface deliberately omits all rewards-specific concepts.

Auth split ():
- submitRoot: callable only by the active `updater`
- disableRoot: callable only by `service`
- setActivationDelay: callable only by `service`
- stageUpdater / cancelStagedUpdater: callable only by `service`
- activateUpdater: permissionless after `effectiveAt`
- upgrades (UUPS): authorized by `service`
- minActivationDelay: immutable post-init

The §0.6 staged-updater swap surface (`stageUpdater` /
`activateUpdater` / `cancelStagedUpdater` / `activeUpdater` /
`pendingUpdater`) lives on the snapshot. It was relocated here from
the coordinator so the snapshot owns its own `submitRoot` auth and
the snapshot↔coordinator deploy-time circular dependency is broken.


## Functions
### submitRoot

Submit a new merkle root. Caller must equal the active `updater`.


```solidity
function submitRoot(bytes32 merkleRoot) external returns (bytes32 rootId);
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`merkleRoot`|`bytes32`|The new cumulative root to install. Must be non-zero and unseen.|

**Returns**

|Name|Type|Description|
|----|----|-----------|
|`rootId`|`bytes32`|Identical to `merkleRoot` (content-hash identity).|


### disableRoot

Disable a root before it activates. Service-only. Reverts after `activeAt`.

the activation delay window is the disable window. Optimistic
challenges are out of scope.


```solidity
function disableRoot(bytes32 rootId) external;
```

### setActivationDelay

Update the per-service activation delay. Service-only. Affects future
roots only (existing in-flight roots retain their submitted-time
`activeAt`). Reverts if `newDelay < minActivationDelay`.

Per immediate-effect parameter. The §0.6 activation-delay
pattern protects parameters that affect *existing* positions; this
parameter only affects *future* roots, so synchronous mutation is
appropriate.


```solidity
function setActivationDelay(uint64 newDelay) external;
```

### stageUpdater

Stage a new updater. Service-only. Reverts if a stage already
exists (use `cancelStagedUpdater` first). `effectiveAt` is
`block.timestamp + activationDelay`.


```solidity
function stageUpdater(address newUpdater) external;
```

### activateUpdater

Promote the staged updater to active. Permissionless after
`effectiveAt`. Reverts `NoStagedUpdater` if no stage,
`StagedUpdaterNotReady` if `block.timestamp < effectiveAt`. Once
activated, the new updater is the only address authorized to
submit roots — strict-flip semantics, no elapsed-but-not-activated
grace.


```solidity
function activateUpdater() external;
```

### cancelStagedUpdater

Cancel a pending stage. Service-only.


```solidity
function cancelStagedUpdater() external;
```

### rootById

Root metadata by content hash.


```solidity
function rootById(bytes32 rootId) external view returns (RewardsRoot memory);
```

### isActive

True if the root exists, is not disabled, and `block.timestamp >= activeAt`.


```solidity
function isActive(bytes32 rootId) external view returns (bool);
```

### service

Service controller (set immutably at init).


```solidity
function service() external view returns (address);
```

### activationDelay

Live activation delay in seconds.


```solidity
function activationDelay() external view returns (uint64);
```

### minActivationDelay

Activation-delay floor. Constructor-passed; immutable post-init.


```solidity
function minActivationDelay() external view returns (uint64);
```

### activeUpdater

Currently authorized updater. The only address allowed to call
`submitRoot`.

Deliberately strict: this returns the *activated*
updater only. A staged-but-not-yet-activated swap does not flip
this view, even after `effectiveAt`.


```solidity
function activeUpdater() external view returns (address);
```

### pendingUpdater

The staged (but not yet activated) updater, if any.


```solidity
function pendingUpdater() external view returns (address newUpdater, uint64 effectiveAt);
```

## Events
### RootSubmitted

```solidity
event RootSubmitted(bytes32 indexed rootId, uint64 submittedAt, uint64 activeAt);
```

### RootDisabled

```solidity
event RootDisabled(bytes32 indexed rootId);
```

### ActivationDelayUpdated

```solidity
event ActivationDelayUpdated(uint64 oldDelay, uint64 newDelay);
```

### UpdaterPending

```solidity
event UpdaterPending(address indexed newUpdater, uint64 effectiveAt);
```

### UpdaterActivated

```solidity
event UpdaterActivated(address indexed oldUpdater, address indexed newUpdater);
```

### UpdaterStageCancelled

```solidity
event UpdaterStageCancelled(address indexed stagedUpdater);
```

## Errors
### NotUpdater

```solidity
error NotUpdater();
```

### NotService

```solidity
error NotService();
```

### RootAlreadySubmitted

```solidity
error RootAlreadySubmitted();
```

### RootNotFound

```solidity
error RootNotFound();
```

### RootAlreadyDisabled

```solidity
error RootAlreadyDisabled();
```

### RootAlreadyActive

```solidity
error RootAlreadyActive();
```

### ZeroRoot

```solidity
error ZeroRoot();
```

### ZeroAddress

```solidity
error ZeroAddress();
```

### ActivationDelayBelowFloor

```solidity
error ActivationDelayBelowFloor();
```

### NoStagedUpdater

```solidity
error NoStagedUpdater();
```

### StagedUpdaterNotReady

```solidity
error StagedUpdaterNotReady();
```

### StagedUpdaterAlreadyExists

```solidity
error StagedUpdaterAlreadyExists();
```

## Structs
### RewardsRoot
Per-root metadata, keyed by the root itself (rootId == merkleRoot).


```solidity
struct RewardsRoot {
    uint64 submittedAt;
    uint64 activeAt;
    bool disabled;
}
```
