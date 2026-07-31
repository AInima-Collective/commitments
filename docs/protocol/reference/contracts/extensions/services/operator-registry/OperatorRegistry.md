---
title: OperatorRegistry
status: generated
source: src/extensions/services/operator-registry/OperatorRegistry.sol
generated: true
---
# OperatorRegistry
**Inherits:**
UUPSUpgradeable, AccessControlUpgradeable, EIP712Upgradeable, ReentrancyGuardTransient, [IOperatorRegistry](/docs/protocol/reference/contracts/extensions/services/interfaces/IOperatorRegistry), `Multicallable`, `MembershipBase`

**Title:**
OperatorRegistry

operator directory backed by committed stake.

Operators register by presenting a pre-created commitment with this registry as counterparty.
Stakers delegate by creating commitments with this registry as counterparty and calling delegate().
Exposes IServiceManager-compatible views: getOperatorStake, isOperator, getOperatorSet.
CommitmentManager calls back onDelegationReleased onDelegationForfeited when relevant
commitments are closed.
Security properties (threat model, 03-04-PLAN.md):
T-03-22: register() verifies commitment.committer == msg.sender
T-03-23: onDelegation* requires msg.sender == s.commitmentManager
T-03-24: register/delegate verify counterparty == address(this) from on-chain commitment data
T-03-26: deregistered operators marked inactive; re-register requires fresh commitment
T-03-27: onDelegationForfeited updates totalDelegatedStake atomically
T-03-28: maxDelegationsPerOperator cap (default 1024)


## Constants
### MAX_METADATA_URI_LENGTH
Maximum length of a metadata URI in bytes. Bounds gas cost of setOperatorMetadata.


```solidity
uint256 public constant MAX_METADATA_URI_LENGTH = 512
```


### REGISTER_TYPEHASH
EIP-712 typehash for a signature-delegated `registerWithSig` intent.
`operator` must equal the commitment's committer and be the signer.


```solidity
bytes32 public constant REGISTER_TYPEHASH =
    keccak256("Register(address operator,uint256 commitmentId,uint256 nonce,uint256 deadline)")
```


### DELEGATE_TYPEHASH
EIP-712 typehash for a signature-delegated `delegateWithSig` intent.
`staker` must equal the commitment's committer and be the signer.


```solidity
bytes32 public constant DELEGATE_TYPEHASH =
    keccak256("Delegate(address staker,address operator,uint256 commitmentId,uint256 nonce,uint256 deadline)")
```


## Functions
### constructor

Disable initializers on implementation contract (proxy pattern)


```solidity
constructor() ;
```

### initialize

Initialize the OperatorRegistry.


```solidity
function initialize(
    address commitmentManager_,
    uint256 minOperatorStake_,
    uint256 maxDelegationsPerOperator_,
    address admin_,
    address requiredArbiter_,
    uint16 minMaxPenaltyBps_,
    address requiredToken_
) external initializer;
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`commitmentManager_`|`address`|The CommitmentManager this registry is wired to.|
|`minOperatorStake_`|`uint256`|Minimum backing-token units required to register as operator.|
|`maxDelegationsPerOperator_`|`uint256`|Maximum delegations per operator (default 1024).|
|`admin_`|`address`|Address granted DEFAULT_ADMIN_ROLE.|
|`requiredArbiter_`|`address`|Commitments presented to register/delegate must have this arbiter. Immutable.|
|`minMaxPenaltyBps_`|`uint16`|Floor on commitment.maxPenaltyBps (0..10_000). Raise-only via tightenPolicy.|
|`requiredToken_`|`address`|Commitments presented to register/delegate must be backed by this token. Stake quantities (`minOperatorStake`, `totalDelegatedStake`) are denominated in its raw units; accepting arbitrary tokens would make them incoherent. Immutable.|


### register

Register as an operator using a pre-created commitment.

Pattern :
1. Operator calls CommitmentManager.createCommitment(arbiter, address(registry), amount,...)
2. Operator calls registry.register(commitmentId) to complete registration.
Verification: committer == msg.sender, counterparty == this,
amount >= minOperatorStake.


```solidity
function register(uint256 commitmentId) external nonReentrant;
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`commitmentId`|`uint256`|ID of the pre-created commitment (counterparty must be this registry).|


### registerWithSig

Register `operator` as an operator using an EIP-712 signature, letting a relayer
submit the operator's signed intent. Signature auth replaces *who submits* — the
commitment still IS the stake and every acceptance-policy check is identical to the
direct `register` path (`operator` must be the commitment's committer).

Signature auth replaces *who submits*, not *what's allowed*: the recovered signer is
used verbatim as the operator identity, so `_register` runs the identical committer /
counterparty / acceptance-policy / cooldown checks as the direct path.


```solidity
function registerWithSig(
    address operator,
    uint256 commitmentId,
    uint256 deadline,
    uint256 nonce,
    bytes calldata signature
) external nonReentrant;
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`operator`|`address`|The operator to register; MUST be the commitment's committer and the signer.|
|`commitmentId`|`uint256`|ID of the pre-created commitment (counterparty must be this registry).|
|`deadline`|`uint256`|Unix timestamp after which the signature is no longer valid.|
|`nonce`|`uint256`|The signer's current nonce (see `sigNonces`); consumed on success.|
|`signature`|`bytes`|EIP-712 signature by `operator` (ECDSA or EIP-1271).|


### _register

Registration core shared by `register` (account = msg.sender) and `registerWithSig`
(account = verified signer). All auth/policy checks key off `account`, so both entry
points behave identically once the caller's intent is authorized.


```solidity
function _register(OperatorRegistryStorage.Layout storage s, address account, uint256 commitmentId) internal;
```

### deregister

Deregister as an operator.

Operator must have no active delegations beyond their own self-stake.
Removes operator from the enumerable list using swap-and-pop.


```solidity
function deregister() external nonReentrant;
```

### delegate

Delegate stake to an operator using a pre-created commitment.

Pattern :
1. Staker calls CommitmentManager.createCommitment(arbiter, address(registry), amount,...)
2. Staker calls registry.delegate(operator, commitmentId) to register the delegation.


```solidity
function delegate(address operator, uint256 commitmentId) external nonReentrant;
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`operator`|`address`|The operator to delegate to.|
|`commitmentId`|`uint256`|ID of the pre-created commitment (counterparty must be this registry).|


### delegateWithSig

Delegate `staker`'s stake to `operator` using an EIP-712 signature, letting a
relayer submit the staker's signed intent. Acceptance-policy behavior is identical
to the direct `delegate` path (`staker` must be the commitment's committer).

Signature auth replaces *who submits*, not *what's allowed*: the recovered signer is
the staker identity, so `_delegate` runs the identical committer / counterparty /
acceptance-policy checks as the direct path.


```solidity
function delegateWithSig(
    address staker,
    address operator,
    uint256 commitmentId,
    uint256 deadline,
    uint256 nonce,
    bytes calldata signature
) external nonReentrant;
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`staker`|`address`|The delegator; MUST be the commitment's committer and the signer.|
|`operator`|`address`|The operator to delegate to.|
|`commitmentId`|`uint256`|ID of the pre-created commitment (counterparty must be this registry).|
|`deadline`|`uint256`|Unix timestamp after which the signature is no longer valid.|
|`nonce`|`uint256`|The signer's current nonce (see `sigNonces`); consumed on success.|
|`signature`|`bytes`|EIP-712 signature by `staker` (ECDSA or EIP-1271).|


### _delegate

Delegation core shared by `delegate` (staker = msg.sender) and `delegateWithSig`
(staker = verified signer). All auth/policy checks key off `staker`.


```solidity
function _delegate(OperatorRegistryStorage.Layout storage s, address staker, address operator, uint256 commitmentId)
    internal;
```

### increaseNonce

Bump the caller's EIP-712 nonce, invalidating any outstanding
`registerWithSig`/`delegateWithSig` signature that carried the previous nonce.

The escape hatch for a signer who wants to revoke an intent before a relayer submits
it. Emits `NonceIncreased`.


```solidity
function increaseNonce() external;
```

### sigNonces

The current EIP-712 nonce for `account`, consumed by the signed register/delegate
paths. A valid signature must carry exactly this value.


```solidity
function sigNonces(address account) external view returns (uint256);
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`account`|`address`|The signer to query.|

**Returns**

|Name|Type|Description|
|----|----|-----------|
|`<none>`|`uint256`|The signer's current nonce.|


### _verifySig

Validate and consume an EIP-712 signed register/delegate intent. Checks the deadline,
matches and increments the signer's nonce, and verifies the signature with
`SignatureChecker.isValidSignatureNow` so both EOAs and EIP-1271 contract signers work.
The nonce is consumed on the same conditions the direct path would apply — after this
returns, the caller runs the identical `_register`/`_delegate` core.


```solidity
function _verifySig(
    OperatorRegistryStorage.Layout storage s,
    address signer,
    bytes32 structHash,
    uint256 deadline,
    uint256 nonce,
    bytes calldata signature
) internal;
```

### _guardToggle

Same-block register/deregister flip guard. Reverts if `account` already
toggled its registration state this block, then records the current block. Cheap
anti-grief mirroring the spirit of the forfeit challenge window; applied to BOTH the
direct and signed paths so the two behave identically (a relayer must not be able to
do what the operator itself cannot).
Stores `block.number + 1`, not `block.number`: the mapping's zero-initialized
"never toggled" sentinel would otherwise collide with a legitimate first toggle at
block 0, spuriously reverting. Real chains are never at block 0, but forge-script
simulation and a fresh anvil both start there (Foundry unit tests default to block 1,
which is why this only surfaces off-chain).


```solidity
function _guardToggle(OperatorRegistryStorage.Layout storage s, address account) internal;
```

### onDelegationReleased

Called by CommitmentManager when a delegation commitment is released.

Called by CommitmentManager when a commitment with this registry as counterparty is released.
Silently ignores commitments not tracked by this registry.


```solidity
function onDelegationReleased(uint256 commitmentId, uint256 amount) external;
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`commitmentId`|`uint256`|The released commitment.|
|`amount`|`uint256`|Backing-token units released.|


### onDelegationForfeited

Called by CommitmentManager when a delegation commitment is forfeited.

Called by CommitmentManager when a commitment with this registry as counterparty is forfeited.
Silently ignores commitments not tracked by this registry.


```solidity
function onDelegationForfeited(uint256 commitmentId, uint256 forfeitedAmount, uint256 fullAmount) external;
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`commitmentId`|`uint256`|The forfeited commitment.|
|`forfeitedAmount`|`uint256`|Backing-token units forfeited (penalty portion).|
|`fullAmount`|`uint256`|Full commitment amount (for proper totalDelegatedStake accounting).|


### getOperatorStake

Returns the total stake (self + delegated) for an operator in required-token units.


```solidity
function getOperatorStake(address operator) external view returns (uint256);
```

### stakeAt

Returns an operator's aggregate `totalDelegatedStake` as of a past `timestamp`,
read from the timestamped checkpoint trace. Lets an arbiter adjudicating
an offense at time T, epoch/snapshot rewards, or a dispute read stake-at-offense
on-chain rather than only the live value.

A checkpoint is pushed on every stake mutation (register/delegate/release/forfeit).
This is a SEPARATE, `block.timestamp`-keyed path from TokenWeighting's block-number
OZ Checkpoints (governance votes) and from the per-commitment `registeredAmount` freeze
(which snapshots one commitment's credited amount for exact hook decrements). Semantics:
returns 0 for a `timestamp` before the first checkpoint (or an operator that never
staked); the checkpoint value exactly on a boundary; and the latest value for a
`timestamp` at/after the last checkpoint.


```solidity
function stakeAt(address operator, uint64 timestamp, uint256 hint) external view returns (uint256);
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`operator`|`address`|The operator to query.|
|`timestamp`|`uint64`|The historical Unix timestamp to read stake as-of.|
|`hint`|`uint256`|A checkpoint index guess for an O(1) answer. If it covers `timestamp` the read is O(1); otherwise the call falls back to a bounded binary search. TRUSTLESS — a wrong/empty/out-of-range hint only costs gas, never correctness: both paths return the identical historically-correct value.|

**Returns**

|Name|Type|Description|
|----|----|-----------|
|`<none>`|`uint256`|The operator's `totalDelegatedStake` in required-token units as of `timestamp`.|


### isOperator

Returns whether an address is a registered, active operator.


```solidity
function isOperator(address operator) external view returns (bool);
```

### getOperatorSet

Returns all active operator addresses.

Gas-bounded by min stake requirement; practically bounded.


```solidity
function getOperatorSet() external view returns (address[] memory);
```

### getOperator

Returns full operator struct with all performance metrics.


```solidity
function getOperator(address operator) external view returns (Operator memory);
```

### getOperatorCount

Returns total count of registered active operators.


```solidity
function getOperatorCount() external view returns (uint256);
```

### isEntity

Whether `account` is a registered entity.


```solidity
function isEntity(address account) public view override returns (bool);
```

### totalEntities

The number of registered entities.


```solidity
function totalEntities() public view override returns (uint256);
```

### entity

The entity at index `index` (order not stable across removals).


```solidity
function entity(uint256 index) public view override returns (address);
```

### trackedCommitmentCount

Number of registration/delegation commitments this registry currently tracks
(ids with live hook routing). The manager consults this before re-pointing its
single operator-registry hook slot so live delegations are never silently
orphaned.


```solidity
function trackedCommitmentCount() external view returns (uint256);
```

### minOperatorStake

Returns the minimum required-token units required to register as an operator.


```solidity
function minOperatorStake() external view returns (uint256);
```

### maxDelegationsPerOperator

Returns the maximum number of delegations an operator can accept.


```solidity
function maxDelegationsPerOperator() external view returns (uint256);
```

### commitmentManager

Returns the address of the wired CommitmentManager.


```solidity
function commitmentManager() external view returns (address);
```

### setMinOperatorStake

Update the minimum operator stake threshold.


```solidity
function setMinOperatorStake(uint256 minStake_) external onlyRole(DEFAULT_ADMIN_ROLE);
```

### setMaxDelegationsPerOperator

Update the maximum delegations per operator cap.


```solidity
function setMaxDelegationsPerOperator(uint256 max_) external onlyRole(DEFAULT_ADMIN_ROLE);
```

### getAcceptancePolicy

Returns the registry's commitment-acceptance policy.


```solidity
function getAcceptancePolicy() external view returns (address arbiter, uint16 floor, address token);
```
**Returns**

|Name|Type|Description|
|----|----|-----------|
|`arbiter`|`address`|The required arbiter — `commitment.arbiter` must equal this for register/delegate to succeed. Immutable post-init.|
|`floor`|`uint16`|minMaxPenaltyBps The required floor on `commitment.maxPenaltyBps`. Tightenable by admin (raise-only).|
|`token`|`address`|requiredToken The required backing token — `commitment.token` must equal this. Immutable post-init.|


### tightenPolicy

Raise the `minMaxPenaltyBps` floor. Forward-looking only — does not
retroactively reject previously-registered operators.

Only DEFAULT_ADMIN_ROLE may call. Reverts if `newFloor <= current` or `newFloor > 10_000`.


```solidity
function tightenPolicy(uint16 newFloor) external onlyRole(DEFAULT_ADMIN_ROLE);
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`newFloor`|`uint16`|New minimum penalty bps. Must be strictly greater than current.|


### setStrategyAllowed

Add or remove a distribution strategy from the register/delegate safe-strategy
allow-list. Only allow-listed strategies may be bound to a registration or
delegation commitment; an empty allow-list rejects all strategies.

DEFAULT_ADMIN_ROLE only. Admins MUST only allow-list non-draining (self-custody)
strategies — one that emits `FromEncumbered*` movements would shrink the committed
stake and leave phantom voting power. The shipped
`OperatorCommissionCoupon` is such a safe strategy. Emits `StrategyAllowlistUpdated`.


```solidity
function setStrategyAllowed(address strategy, bool allowed) external onlyRole(DEFAULT_ADMIN_ROLE);
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`strategy`|`address`|The distribution strategy to toggle. Must be non-zero.|
|`allowed`|`bool`|True to permit binding it on register/delegate commitments; false to remove.|


### isStrategyAllowed

Whether `strategy` is on the register/delegate safe-strategy allow-list.


```solidity
function isStrategyAllowed(address strategy) external view returns (bool);
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`strategy`|`address`|The distribution strategy to query.|

**Returns**

|Name|Type|Description|
|----|----|-----------|
|`<none>`|`bool`|True if allow-listed and therefore bindable on register/delegate commitments.|


### operatorForCommitment

The operator a tracked register/delegate commitment routes to, or `address(0)`
if the commitment is not (or is no longer) a tracked delegation.

Cleared when the commitment is released/forfeited. A commission strategy should
latch this value while the delegation is active (see `OperatorCommissionCoupon`).


```solidity
function operatorForCommitment(uint256 commitmentId) external view returns (address);
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`commitmentId`|`uint256`|The commitment to resolve.|

**Returns**

|Name|Type|Description|
|----|----|-----------|
|`<none>`|`address`|The operator address, or `address(0)`.|


### _requireWired

Wired-registry guard: register/delegate only while this registry is the manager's wired
operator registry. The manager notifies exactly ONE registry on release/forfeit;
a registry that is not (or is no longer) wired would credit voting power it can
never unwind — phantom, unbacked stake in governance/service quorums.


```solidity
function _requireWired(OperatorRegistryStorage.Layout storage s) internal view;
```

### _verifyAcceptance

Verifies a commitment matches the registry's acceptance policy.
Called from register() and delegate() after the existing committer/
counterparty/status checks. Four gates: arbiter must match exactly;
maxPenaltyBps must meet or exceed the current floor; the backing token
must be the registry's required token (stake quantities are denominated
in it); and every bound distribution strategy must be admin-allow-listed.
Strategy bindings were originally banned outright because
encumbrance-draining movements (`FromEncumbered*`) shrink `c.amount`
under the registry's snapshot accounting and leave phantom
totalDelegatedStake. The allow-list narrows that ban to
"unvetted strategies only": the admin curates a set of non-draining
(self-custody) strategies — such as OperatorCommissionCoupon, which lets
a delegator route commission to the operator — that are safe to bind. An
empty allow-list (the default) preserves the original reject-all behavior.


```solidity
function _verifyAcceptance(
    OperatorRegistryStorage.Layout storage s,
    ICommitmentManager.Commitment memory c,
    uint256 commitmentId
) internal view;
```

### setOperatorMetadata

Set or update the caller's operator metadata.

Only active registered operators may call. Overwrites any prior sidecar
record with (uri, contentHash, uint64(block.timestamp)) and emits the update event.
Metadata is stored in a sidecar map isolated from the hot-path Operator record so
isOperator getOperatorStake getOperatorSet reads are unaffected.


```solidity
function setOperatorMetadata(string calldata uri, bytes32 contentHash) external nonReentrant;
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`uri`|`string`|Metadata URI (may be empty string for "no URI").|
|`contentHash`|`bytes32`|keccak256 of canonical content; 0x0 = "no hash".|


### getOperatorMetadata

Read an operator's current metadata sidecar.

Returns zero struct if never set.


```solidity
function getOperatorMetadata(address operator) external view returns (IOperatorRegistry.OperatorMetadata memory);
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`operator`|`address`|The operator to query.|

**Returns**

|Name|Type|Description|
|----|----|-----------|
|`<none>`|`IOperatorRegistry.OperatorMetadata`|Current OperatorMetadata (uri, contentHash, updatedAt).|


### sweepForfeitProceeds

Sweep forfeit proceeds credited to the registry's free balance in
the manager into a treasury payout address.

Forfeit proceeds for delegations land as a pull-payment credit to this
registry's FREE balance inside the manager. Without this entry point
the proceeds would be stranded — the manager gates `withdraw` on
`msg.sender`, and the registry has no other path that calls it.


```solidity
function sweepForfeitProceeds(address token, uint256 amount, address payTo)
    external
    nonReentrant
    onlyRole(DEFAULT_ADMIN_ROLE);
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`token`|`address`|Backing token to sweep.|
|`amount`|`uint256`|Units to withdraw from the registry's manager free balance.|
|`payTo`|`address`|Destination for the swept tokens.|


### setMeshWiring

Wire this registry into the mesh so register/delegate automatically
credit per-operator voting power through a per-operator FanIn into the
TokenWeighting sink, and release/forfeit/deregister automatically
decrement it. DEFAULT_ADMIN_ROLE only; callable once.

The registry must be the TokenWeighting `provider` and the per-operator
FanIn `manager`. The single stake denom is derived from `requiredToken`
(`bytes32(uint160(requiredToken))`), enforcing one-token↔one-denom: a unit
of this registry's encumbered capital can only ever contribute to this one
denom's voting power.


```solidity
function setMeshWiring(address tokenWeighting_, address meshFactory_) external onlyRole(DEFAULT_ADMIN_ROLE);
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`tokenWeighting_`|`address`||
|`meshFactory_`|`address`||


### tokenWeighting

The TokenWeighting sink this registry feeds (address(0) if unwired).


```solidity
function tokenWeighting() external view returns (address);
```

### stakeDenom

The single mesh stake denom this registry credits, derived from
`requiredToken`. Injective per token → one-token↔one-denom.


```solidity
function stakeDenom() external view returns (bytes32);
```

### operatorFanIn

The per-operator FanIn node for an operator (address(0) if none yet).


```solidity
function operatorFanIn(address operator) external view returns (address);
```

### _stakeDenom

The single mesh denom this registry credits, derived injectively from the
required backing token. One-token↔one-denom: a unit of this registry's
encumbered capital can only ever contribute to this denom's voting power,
which blocks a cross-path double-count of the same encumbered capital.


```solidity
function _stakeDenom(OperatorRegistryStorage.Layout storage s) internal view returns (bytes32);
```

### _meshOnIncrease

Credit `amount` of `operator` stake into the mesh: into its per-operator
FanIn (lazily deployed) and the TokenWeighting sink keyed to the operator.
Both receive the SAME verified amount, so the FanIn aggregate and the
operator's TokenWeighting power stay in lockstep with totalDelegatedStake.
No-op when mesh is unwired.


```solidity
function _meshOnIncrease(OperatorRegistryStorage.Layout storage s, address operator, uint256 amount) internal;
```

### _meshDrain

Drive `operator`'s mesh voting power to EXACTLY zero, releasing its full
live FanIn aggregate and TokenWeighting stake read directly from the mesh.
Used on deregister so an inactive operator can never retain phantom mesh
power, regardless of any stale/stranded routing left by an independently
released or forfeited self-stake. Reading the live stake (rather than a
stored snapshot) makes the unwind exact: it releases precisely what is
there, so it never under-releases (leaving residue) nor over-releases
(reverting) — correctness does not depend on the `_meshOnDecrease` clamp.
No-op when mesh is unwired.


```solidity
function _meshDrain(OperatorRegistryStorage.Layout storage s, address operator) internal;
```

### _meshOnDecrease

Decrement `amount` of `operator` stake from the mesh. Clamps to the live
stake so a registry wired mid-life (operators credited before wiring) can
never underflow the FanIn/TokenWeighting accounting. No-op when unwired.


```solidity
function _meshOnDecrease(OperatorRegistryStorage.Layout storage s, address operator, uint256 amount) internal;
```

### _pushStakeCheckpoint

Append (or same-block rewrite) a timestamped checkpoint of `operator`'s aggregate
`totalDelegatedStake`. Called on every stake mutation (register/delegate/release/
forfeit) with the operator's POST-mutation stake. Checkpoints are kept strictly
increasing in timestamp: if the tail checkpoint shares this block's timestamp it is
overwritten in place (multiple same-block mutations collapse to the final value),
otherwise a new checkpoint is appended. This keeps `stakeAt`'s binary search and hint
validation well-defined. Reverts on the (practically-unreachable) `uint192` overflow
rather than silently truncating a checkpoint value.


```solidity
function _pushStakeCheckpoint(OperatorRegistryStorage.Layout storage s, address operator, uint256 newStake)
    internal;
```

### _authorizeUpgrade

Only DEFAULT_ADMIN_ROLE can authorize upgrades


```solidity
function _authorizeUpgrade(address) internal override onlyRole(DEFAULT_ADMIN_ROLE);
```
