---
title: MerkleSnapshot
status: generated
source: src/extensions/rewards/MerkleSnapshot.sol
generated: true
---
# MerkleSnapshot
**Inherits:**
Initializable, UUPSUpgradeable, ReentrancyGuardTransient, [IMerkleSnapshot](/docs/protocol/reference/contracts/extensions/rewards/interfaces/IMerkleSnapshot)

**Title:**
MerkleSnapshot

Reusable on-chain root storage for cumulative-merkle distribution.
The "dumb storage" half of the snapshot/coordinator separation, now
self-contained for updater auth.

Locked behaviors:
- submitRoot: gated by the active `updater` (read directly from this
contract's own storage — no external call into the coordinator).
- disableRoot: service-only; reverts after `activeAt`.
- setActivationDelay: service-only; immediate effect.
- stageUpdater / activateUpdater / cancelStagedUpdater: §0.6
staged-swap with strict-flip semantics. Relocated here from the
coordinator to break the snapshot↔coordinator circular dependency.
- minActivationDelay: immutable post-init.
- UUPS upgrades: authorized by `service`.


## Functions
### constructor

Disable initializers on the implementation contract (proxy pattern).


```solidity
constructor() ;
```

### initialize

Initialize the snapshot proxy. Called once by the factory.


```solidity
function initialize(address service_, uint64 activationDelay_, uint64 minActivationDelay_, address updater_)
    external
    initializer;
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`service_`|`address`|Service controller (`disableRoot`, `setActivationDelay`, the staged-updater swap, upgrades).|
|`activationDelay_`|`uint64`|Initial per-service activation delay.|
|`minActivationDelay_`|`uint64`|Floor on `activationDelay`. Immutable post-init.|
|`updater_`|`address`|Initial trusted updater for `submitRoot`.|


### onlyService


```solidity
modifier onlyService() ;
```

### onlyUpdater


```solidity
modifier onlyUpdater() ;
```

### submitRoot

Submit a new merkle root. Caller must equal the active `updater`.


```solidity
function submitRoot(bytes32 merkleRoot) external onlyUpdater nonReentrant returns (bytes32 rootId);
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
function disableRoot(bytes32 rootId) external onlyService nonReentrant;
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
function setActivationDelay(uint64 newDelay) external onlyService;
```

### stageUpdater

Stage a new updater. Service-only. Reverts if a stage already
exists (use `cancelStagedUpdater` first). `effectiveAt` is
`block.timestamp + activationDelay`.


```solidity
function stageUpdater(address newUpdater) external onlyService nonReentrant;
```

### activateUpdater

Promote the staged updater to active. Permissionless after
`effectiveAt`. Reverts `NoStagedUpdater` if no stage,
`StagedUpdaterNotReady` if `block.timestamp < effectiveAt`. Once
activated, the new updater is the only address authorized to
submit roots — strict-flip semantics, no elapsed-but-not-activated
grace.


```solidity
function activateUpdater() external nonReentrant;
```

### cancelStagedUpdater

Cancel a pending stage. Service-only.


```solidity
function cancelStagedUpdater() external onlyService nonReentrant;
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

### _authorizeUpgrade


```solidity
function _authorizeUpgrade(address) internal view override onlyService;
```
