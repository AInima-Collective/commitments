---
title: FlatFeeAtCreate
status: generated
source: src/distributions/FlatFeeAtCreate.sol
generated: true
---
# FlatFeeAtCreate
**Inherits:**
[IDistributionStrategy](/docs/protocol/reference/contracts/core/interfaces/IDistributionStrategy), ReentrancyGuardTransient

**Title:**
FlatFeeAtCreate

A fixed fee paid to the commitment's counterparty as a condition of creation
(ERC-COMMITMENTS taxonomy, informative). Because `onCommitmentCreated` returns no
movements (§D.4), the fee is prefunded: the committer (or a sponsor) calls
`prefund(committer, token, fee)` beforehand; the creation hook consumes the
COMMITTER'S OWN credit and REVERTS the creation otherwise — a deliberate exercise
of the compatibility-refusal path.

Self-custody shape (§D "Strategies MAY expose additional surfaces"): prefunded tokens
are held by this contract, NOT in the manager's per-strategy escrow. Two reasons:
(1) `manager.fundStrategy` escrow carries no funder attribution, so a shared pot is
first-come — a front-runner could bind a fee equal to someone else's prefund and have
their counterparty drain it. Credit here is keyed by committer, so a
binding can only consume the credit of the commitment's own committer.
(2) The manager exposes no strategy-initiated escrow withdrawal (escrow debits exist
only inside the commitment-scoped, party-only movement pipeline, §D.5), so escrow-held
overfunding would be permanently stranded; self-custody makes `refundUnallocated`
possible. The fee payout is served directly from this contract's balance — `claim`
returns no movements and emits `DistributionPaid` itself, as §D.7 requires of
self-custody strategies.


## Constants
### manager

```solidity
address public immutable manager
```


## State Variables
### feeOf

```solidity
mapping(uint256 commitmentId => FeeState) public feeOf
```


### allocated
Per-token total of uncollected fee obligations; consuming a binding moves value
from `credit` into `allocated`, so balanceOf(this) ≥ Σcredit + allocated per token.


```solidity
mapping(address token => uint256) public allocated
```


### creditOf
Unconsumed prefund attributed to a committer, per token. Only the commitment's
own committer's credit can be consumed by `onCommitmentCreated`; unconsumed
credit is recoverable via `refundUnallocated`.


```solidity
mapping(address committer => mapping(address token => uint256)) public creditOf
```


## Functions
### constructor


```solidity
constructor(address manager_) ;
```

### onlyManager


```solidity
modifier onlyManager() ;
```

### prefund

Prefund the creation fee for `committer` in `token` units: pulls `amount` from
`msg.sender` and credits `committer` with the measured balance delta (same
fee-on-transfer defense as `manager.deposit`). Prefunding another account is a
gift — the credit (and any refund) belongs to `committer`, not the funder.


```solidity
function prefund(address committer, address token, uint256 amount) external nonReentrant;
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`committer`|`address`|The account whose future `createCommitment` this credit backs.|
|`token`|`address`|The fee token — must match the commitment's backing token at create time.|
|`amount`|`uint256`|Fee credit in `token` units (pre-transfer-fee).|


### refundUnallocated

Recover `amount` of `msg.sender`'s unconsumed credit in `token`. Credit already
consumed by a binding is an earned fee obligation and is NOT refundable.


```solidity
function refundUnallocated(address token, uint256 amount) external nonReentrant;
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`token`|`address`|The fee token to refund.|
|`amount`|`uint256`|Units to refund; must not exceed `creditOf[msg.sender][token]`.|


### onCommitmentCreated

Manager-only. Strategy initializes any per-commitment state and registers the
commitment as bound. MUST revert if the strategy cannot operate against
`ctx.base.adapter` / `ctx.base.token` (the compatibility-refusal mechanism).
Reverts abort commitment creation (NOT guarded — ERC §C.1).

`strategyParams` is `abi.encode(uint256 fee)` in backing-token units. Consumes the
COMMITTER'S credit — never a shared pot — so one party's prefund can never back
another party's binding.


```solidity
function onCommitmentCreated(CreatedContext calldata ctx) external onlyManager;
```

### claim

Caller-validated claim over the manager-mediated payout path. `claimData` is
strategy-specific (empty / merkle proof / signed envelope / reclaim flag / ...).
Self-custody strategies MAY return an empty array and serve claims on their own
surface instead. Allowed kinds: FromEscrowToExternal, FromEscrowToFree.

The counterparty collects the fee, paid directly from this contract's balance
(self-custody payout, §D.7 `DistributionPaid` emitted here). Available in any
commitment state — the fee was earned at creation.


```solidity
function claim(ClaimContext calldata ctx, bytes calldata)
    external
    onlyManager
    nonReentrant
    returns (TokenMovement[] memory);
```

### pending

Pending amount claimable by the implied recipient.


```solidity
function pending(ClaimContext calldata ctx, bytes calldata) external view returns (uint256);
```

### distribute

Permissionlessly advance accrual state. Called by the manager from
`manager.distribute(id, strategy)`; reverts bubble to the caller.
Allowed kinds: FromEncumberedToEscrow, FromEncumberedToExternal.


```solidity
function distribute(DistributeContext calldata) external view onlyManager returns (TokenMovement[] memory);
```

### onCommitmentReleased

Manager-only; called under guarded semantics (ERC §D.6) BEFORE the committer's
remaining encumbrance is freed, so the strategy can take its final accrual sweep.
Allowed kinds: FromEncumberedToEscrow, FromEscrowToExternal, FromEscrowToFree.


```solidity
function onCommitmentReleased(LifecycleContext calldata)
    external
    view
    onlyManager
    returns (TokenMovement[] memory);
```

### onCommitmentForfeited

Manager-only; called under guarded semantics (ERC §D.6), strictly AFTER the
manager-internal forfeit transfer. Disposes of strategy-side in-flight accrual only;
cannot affect the forfeit itself. `FromEncumbered*` caps run against the post-forfeit
residual. Allowed kinds: FromEncumberedToEscrow, FromEscrowToExternal, FromEscrowToFree.


```solidity
function onCommitmentForfeited(ForfeitContext calldata) external view onlyManager returns (TokenMovement[] memory);
```

## Events
### Prefunded
A prefund was credited to `committer` (pulled from `funder`).


```solidity
event Prefunded(address indexed funder, address indexed committer, address indexed token, uint256 amount);
```

### CreditRefunded
Unconsumed credit was refunded to its owner.


```solidity
event CreditRefunded(address indexed committer, address indexed token, uint256 amount);
```

## Errors
### OnlyManager

```solidity
error OnlyManager();
```

### FeeNotFunded

```solidity
error FeeNotFunded(uint256 required, uint256 available);
```

### AlreadyBound

```solidity
error AlreadyBound();
```

### NothingToClaim

```solidity
error NothingToClaim();
```

### NotAuthorized

```solidity
error NotAuthorized();
```

### InsufficientCredit

```solidity
error InsufficientCredit(uint256 requested, uint256 available);
```

### ZeroAmount

```solidity
error ZeroAmount();
```

### ZeroAddress

```solidity
error ZeroAddress();
```

## Structs
### FeeState

```solidity
struct FeeState {
    uint256 fee;
    address token;
    bool collected;
}
```
