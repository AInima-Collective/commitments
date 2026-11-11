---
title: IOperatorRegistry
status: generated
source: src/extensions/services/interfaces/IOperatorRegistry.sol
generated: true
---
# IOperatorRegistry
**Title:**
IOperatorRegistry

Interface for the OperatorRegistry — a operator directory
backed by committed stake. Implements IServiceManager-compatible views.


## Functions
### register

Register as an operator using a pre-created commitment.

Operator must first call CommitmentManager.createCommitment with counterparty = this registry.
Then call register() with the resulting commitmentId to complete registration.
Verifies: committer == msg.sender, counterparty == address(this), amount >= minOperatorStake.


```solidity
function register(uint256 commitmentId) external;
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`commitmentId`|`uint256`|ID of the pre-created commitment (counterparty must be this registry).|


### deregister

Deregister as an operator.

Operator must have no active delegations beyond their own self-stake commitment.


```solidity
function deregister() external;
```

### delegate

Delegate stake to an operator using a pre-created commitment.

Staker must first call CommitmentManager.createCommitment with counterparty = this registry.
Then call delegate(operator, commitmentId) to register the delegation.


```solidity
function delegate(address operator, uint256 commitmentId) external;
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`operator`|`address`|The operator to delegate to.|
|`commitmentId`|`uint256`|ID of the pre-created commitment (counterparty must be this registry).|


### registerWithSig

Register `operator` as an operator using an EIP-712 signature, letting a relayer
submit the operator's signed intent. Signature auth replaces *who submits* — the
commitment still IS the stake and every acceptance-policy check is identical to the
direct `register` path (`operator` must be the commitment's committer).

The digest is over `Register(address operator,uint256 commitmentId,uint256 nonce,
uint256 deadline)`. Verified with `SignatureChecker.isValidSignatureNow`, so both EOAs
and EIP-1271 contract signers are accepted. Replay-protected by the per-signer nonce;
reverts once `block.timestamp > deadline`. A same-block register/deregister cooldown
applies (see `SameBlockToggle`).


```solidity
function registerWithSig(
    address operator,
    uint256 commitmentId,
    uint256 deadline,
    uint256 nonce,
    bytes calldata signature
) external;
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`operator`|`address`|The operator to register; MUST be the commitment's committer and the signer.|
|`commitmentId`|`uint256`|ID of the pre-created commitment (counterparty must be this registry).|
|`deadline`|`uint256`|Unix timestamp after which the signature is no longer valid.|
|`nonce`|`uint256`|The signer's current nonce (see `sigNonces`); consumed on success.|
|`signature`|`bytes`|EIP-712 signature by `operator` (ECDSA or EIP-1271).|


### delegateWithSig

Delegate `staker`'s stake to `operator` using an EIP-712 signature, letting a
relayer submit the staker's signed intent. Acceptance-policy behavior is identical
to the direct `delegate` path (`staker` must be the commitment's committer).

The digest is over `Delegate(address staker,address operator,uint256 commitmentId,
uint256 nonce,uint256 deadline)`. Verified with `SignatureChecker.isValidSignatureNow`
(EOA or EIP-1271). Replay-protected by the per-signer nonce; reverts past `deadline`.


```solidity
function delegateWithSig(
    address staker,
    address operator,
    uint256 commitmentId,
    uint256 deadline,
    uint256 nonce,
    bytes calldata signature
) external;
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

Returns the full operator record, including its current `totalDelegatedStake`.


```solidity
function getOperator(address operator) external view returns (Operator memory);
```

### getOperatorCount

Returns total count of registered active operators.


```solidity
function getOperatorCount() external view returns (uint256);
```

### trackedCommitmentCount

Number of registration/delegation commitments this registry currently tracks
(ids with live hook routing). The manager consults this before re-pointing its
single operator-registry hook slot so live delegations are never silently
orphaned.


```solidity
function trackedCommitmentCount() external view returns (uint256);
```

### onDelegationReleased

Called by CommitmentManager when a delegation commitment is released.

Only callable by the authorized commitmentManager.


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

Only callable by the authorized commitmentManager.


```solidity
function onDelegationForfeited(uint256 commitmentId, uint256 forfeitedAmount, uint256 fullAmount) external;
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`commitmentId`|`uint256`|The forfeited commitment.|
|`forfeitedAmount`|`uint256`|Backing-token units forfeited (penalty portion).|
|`fullAmount`|`uint256`|Full commitment amount (for proper totalDelegatedStake accounting).|


### reconcile

Close a routed commitment whose release or forfeit hook failed in the manager.

Permissionless. Runs the same close path as the hooks when the commitment is still
routed here but the manager shows it released or forfeited, and emits the matching
`DelegationReleased` or `DelegationForfeited`. Reverts `CommitmentNotTracked` when it
is not routed here and `CommitmentStillOpen` when it is still open in the manager.


```solidity
function reconcile(uint256 commitmentId) external;
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`commitmentId`|`uint256`|The commitment to reconcile.|


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
function setMeshWiring(address tokenWeighting, address meshFactory) external;
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`tokenWeighting`|`address`|The TokenWeighting sink (its provider must be this registry).|
|`meshFactory`|`address`|The MeshFactory used to clone per-operator FanIn nodes.|


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

### getAcceptancePolicy

Returns the registry's commitment-acceptance policy.


```solidity
function getAcceptancePolicy()
    external
    view
    returns (address arbiter, uint16 minMaxPenaltyBps, address requiredToken);
```
**Returns**

|Name|Type|Description|
|----|----|-----------|
|`arbiter`|`address`|The required arbiter — `commitment.arbiter` must equal this for register/delegate to succeed. Immutable post-init.|
|`minMaxPenaltyBps`|`uint16`|The required floor on `commitment.maxPenaltyBps`. Tightenable by admin (raise-only).|
|`requiredToken`|`address`|The required backing token — `commitment.token` must equal this. Immutable post-init.|


### tightenPolicy

Raise the `minMaxPenaltyBps` floor. Forward-looking only — does not
retroactively reject previously-registered operators.

Only DEFAULT_ADMIN_ROLE may call. Reverts if `newFloor <= current` or `newFloor > 10_000`.


```solidity
function tightenPolicy(uint16 newFloor) external;
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
function setStrategyAllowed(address strategy, bool allowed) external;
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


### setOperatorMetadata

Set or update the caller's operator metadata.

Only active registered operators may call. Emits OperatorMetadataUpdated.
Reverts with URITooLong if uri length exceeds the protocol cap (512 bytes).


```solidity
function setOperatorMetadata(string calldata uri, bytes32 contentHash) external;
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
function getOperatorMetadata(address operator) external view returns (OperatorMetadata memory);
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`operator`|`address`|The operator to query.|

**Returns**

|Name|Type|Description|
|----|----|-----------|
|`<none>`|`OperatorMetadata`|Current OperatorMetadata (uri, contentHash, updatedAt).|


### sweepForfeitProceeds

Sweep forfeit proceeds credited to the registry's free balance in
the manager into a treasury payout address.

DEFAULT_ADMIN_ROLE only. Forfeit payouts are pull-payment credits to
the counterparty's FREE balance inside the manager; without this
entry point proceeds where the registry is the counterparty would
be stranded. Calls `manager.withdraw(token, amount)` and forwards.


```solidity
function sweepForfeitProceeds(address token, uint256 amount, address payTo) external;
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`token`|`address`|Backing token to sweep.|
|`amount`|`uint256`|Units to withdraw from the registry's manager free balance.|
|`payTo`|`address`|Destination for the swept tokens.|


## Events
### OperatorRegistered

```solidity
event OperatorRegistered(address indexed operator, uint256 commitmentId, uint256 stake);
```

### OperatorDeregistered

```solidity
event OperatorDeregistered(address indexed operator);
```

### DelegationCreated
`commitmentId` is indexed (free topic slot) so a client can filter the full
create/release/forfeit lifecycle of a single delegation commitment by its id.


```solidity
event DelegationCreated(
    address indexed staker, address indexed operator, uint256 indexed commitmentId, uint256 amount
);
```

### DelegationReleased

```solidity
event DelegationReleased(
    address indexed staker, address indexed operator, uint256 indexed commitmentId, uint256 amount
);
```

### DelegationForfeited

```solidity
event DelegationForfeited(
    address indexed staker, address indexed operator, uint256 indexed commitmentId, uint256 forfeitedAmount
);
```

### OperatorBelowMinStake
Emitted when a release or forfeit leaves an active operator below `minOperatorStake`.


```solidity
event OperatorBelowMinStake(address indexed operator, uint256 currentStake, uint256 minStake);
```

### MinOperatorStakeUpdated
Emitted when admin changes `minOperatorStake`.


```solidity
event MinOperatorStakeUpdated(uint256 oldValue, uint256 newValue);
```

### MaxDelegationsPerOperatorUpdated
Emitted when admin changes `maxDelegationsPerOperator`.


```solidity
event MaxDelegationsPerOperatorUpdated(uint256 oldValue, uint256 newValue);
```

### OperatorMetadataUpdated
Emitted whenever an operator writes or updates their metadata.


```solidity
event OperatorMetadataUpdated(address indexed operator, string uri, bytes32 contentHash, uint64 timestamp);
```

### AcceptancePolicyTightened
Emitted when admin raises the minMaxPenaltyBps floor. Arbiter is
immutable, so there is no ArbiterChanged event.


```solidity
event AcceptancePolicyTightened(uint16 oldFloor, uint16 newFloor);
```

### ForfeitRecipientPending
Emitted on `onDelegationForfeited` so monitors can detect forfeited
delegations whose proceeds land as a free-balance credit to the
registry inside the manager and would otherwise be stranded.
The backing token is readable via
`manager.getCommitment(commitmentId).token`.


```solidity
event ForfeitRecipientPending(address indexed operator, uint256 indexed commitmentId, uint256 forfeitedAmount);
```

### ForfeitRecipientSwept
Emitted when admin sweeps forfeit proceeds from the registry's
manager free balance to a treasury payout address.


```solidity
event ForfeitRecipientSwept(address indexed token, address indexed payTo, uint256 amount);
```

### MeshWired
Emitted when the mesh pipeline is wired (TokenWeighting sink + MeshFactory).
One-time; thereafter register/delegate auto-credit mesh voting power and
release/forfeit/deregister auto-decrement it.


```solidity
event MeshWired(address indexed tokenWeighting, address indexed meshFactory);
```

### OperatorFanInDeployed
Emitted when a per-operator FanIn node is deployed for an operator.


```solidity
event OperatorFanInDeployed(address indexed operator, address indexed fanIn, bytes32 stakeDenom);
```

### NonceIncreased
Emitted when a signer bumps their EIP-712 nonce via `increaseNonce`,
invalidating any outstanding `registerWithSig`/`delegateWithSig`
signature that carried the previous nonce.


```solidity
event NonceIncreased(address indexed account, uint256 newNonce);
```

**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`account`|`address`|The signer whose nonce advanced.|
|`newNonce`|`uint256`|The signer's nonce after the bump (all prior nonces are now spent).|

### StrategyAllowlistUpdated
Emitted when the admin adds or removes a distribution strategy from the
register/delegate safe-strategy allow-list. Only allow-listed
strategies may be bound to a registration/delegation commitment.


```solidity
event StrategyAllowlistUpdated(address indexed strategy, bool allowed);
```

**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`strategy`|`address`|The distribution strategy toggled.|
|`allowed`|`bool`|True if the strategy is now bindable on register/delegate commitments.|

## Errors
### AlreadyRegistered

```solidity
error AlreadyRegistered();
```

### NotRegistered

```solidity
error NotRegistered();
```

### InsufficientStake

```solidity
error InsufficientStake(uint256 provided, uint256 minimum);
```

### MaxDelegationsExceeded

```solidity
error MaxDelegationsExceeded(uint256 current, uint256 max);
```

### UnauthorizedCaller

```solidity
error UnauthorizedCaller();
```

### NotCommitmentOwner

```solidity
error NotCommitmentOwner();
```

### WrongCounterparty

```solidity
error WrongCounterparty();
```

### ActiveDelegationsExist

```solidity
error ActiveDelegationsExist();
```

### CommitmentAlreadyDelegated

```solidity
error CommitmentAlreadyDelegated();
```

### URITooLong
Thrown when metadata URI exceeds the length cap.


```solidity
error URITooLong();
```

### OperatorNotActive
Thrown when a non-operator or inactive operator calls setOperatorMetadata.


```solidity
error OperatorNotActive();
```

### WrongArbiter
Thrown when register/delegate is called with a commitment whose arbiter
does not match the registry's required arbiter.


```solidity
error WrongArbiter(address expected, address actual);
```

### PenaltyTooLow
Thrown when a commitment's maxPenaltyBps is below the registry's floor.


```solidity
error PenaltyTooLow(uint16 minRequired, uint16 actual);
```

### PolicyNotTightening
Thrown when tightenPolicy is called with a value <= the current floor.


```solidity
error PolicyNotTightening(uint16 currentFloor, uint16 attempted);
```

### ZeroArbiter
Thrown when a zero address is supplied where a non-zero arbiter is required.


```solidity
error ZeroArbiter();
```

### PenaltyExceedsMax
Thrown when a penalty bps value exceeds 10_000 (100%).


```solidity
error PenaltyExceedsMax();
```

### ZeroPayoutAddress
payout address must be non-zero.


```solidity
error ZeroPayoutAddress();
```

### ZeroToken
Thrown when a zero address is supplied where a non-zero token is required.


```solidity
error ZeroToken();
```

### WrongToken
Thrown when a commitment's backing token does not match the
registry's required token.


```solidity
error WrongToken(address expected, address actual);
```

### StrategiesNotAllowed
A register/delegate commitment binds a distribution strategy that is not on
the admin's safe-strategy allow-list. Unvetted strategy movements can shrink
`c.amount` under the registry's accounting, leaving phantom totalDelegatedStake;
only allow-listed (non-draining) strategies are accepted. Also thrown, with an
empty allow-list, for any bound strategy — the default reject-all behavior.


```solidity
error StrategiesNotAllowed();
```

### ZeroStrategy
`setStrategyAllowed` called with the zero address.


```solidity
error ZeroStrategy();
```

### MeshAlreadyWired
setMeshWiring called more than once. The mesh pipeline is immutable
once wired — rerouting it is a trust transition that warrants a redeploy.


```solidity
error MeshAlreadyWired();
```

### ZeroMeshAddress
setMeshWiring called with a zero TokenWeighting or MeshFactory.


```solidity
error ZeroMeshAddress();
```

### RegistryNotWired
register/delegate called while this registry is not the manager's wired
operator registry (`manager.operatorRegistry() != address(this)`). An
unwired registry never receives the release/forfeit hooks, so accepting
stake here would mint phantom, unbacked voting power.


```solidity
error RegistryNotWired(address wiredRegistry);
```

**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`wiredRegistry`|`address`|The registry the manager currently notifies (may be address(0)).|

### SignatureExpired
A `registerWithSig`/`delegateWithSig` call arrived after its `deadline`.


```solidity
error SignatureExpired();
```

### InvalidNonce
The `nonce` in a signed register/delegate intent does not match the signer's
current on-chain nonce — replay protection.


```solidity
error InvalidNonce();
```

### InvalidSignature
The supplied signature did not recover to (or validate for, EIP-1271) the
claimed signer over the EIP-712 register/delegate digest.


```solidity
error InvalidSignature();
```

### SameBlockToggle
An account attempted to register and deregister within the same block. A
same-block cooldown blocks register⇄deregister flip griefing.


```solidity
error SameBlockToggle();
```

### CommitmentClosed
register/delegate was called with a commitment that is already released or forfeited.


```solidity
error CommitmentClosed();
```

### CommitmentNotTracked
`reconcile` was called for a commitment that is not routed to this registry.


```solidity
error CommitmentNotTracked();
```

### CommitmentStillOpen
`reconcile` was called for a commitment that is still open in the manager.


```solidity
error CommitmentStillOpen();
```

## Structs
### Operator
Operator record tracking registration and stake.

Field order is packing-sensitive: `operator` (160) + `registeredAt` (64) +
`active` (8) = 232 bits share slot 0. The struct fits in 4 storage slots
(0: address+flag, 1: selfStakeCommitmentId, 2: totalDelegatedStake,
3: activeDelegationCount + selfStakeActive). An operator is below the minimum when
`totalDelegatedStake < minOperatorStake()`; that is derived, not stored.


```solidity
struct Operator {
    address operator;
    uint64 registeredAt;
    bool active;
    uint256 selfStakeCommitmentId;
    uint256 totalDelegatedStake; // self + delegated stake in required-token units
    uint32 activeDelegationCount; // number of active delegations including self-stake
    bool selfStakeActive; // true while the self-stake commitment is still tracked
}
```

### OperatorMetadata
Mutable metadata sidecar for an operator.

Stored in a mapping(address => OperatorMetadata) separate from the hot-path Operator record,
so setOperatorMetadata does not touch storage slots read by isOperator/getOperatorSet/getOperator.


```solidity
struct OperatorMetadata {
    string uri;
    bytes32 contentHash;
    uint64 updatedAt; // block.timestamp of last setOperatorMetadata call; 0 = never set
}
```
