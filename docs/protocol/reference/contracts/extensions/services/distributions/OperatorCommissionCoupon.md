---
title: OperatorCommissionCoupon
status: generated
source: src/extensions/services/distributions/OperatorCommissionCoupon.sol
generated: true
---
# OperatorCommissionCoupon
**Inherits:**
[IDistributionStrategy](/docs/protocol/reference/contracts/core/interfaces/IDistributionStrategy), ReentrancyGuardTransient

**Title:**
OperatorCommissionCoupon

Lets a delegator route a commission to the operator they delegate to. A delegation
commitment names the OperatorRegistry as its counterparty, so the operator is not a
party to the commitment and cannot be paid through the manager's movement pipeline
(§D.5, whose recipients are committer/counterparty only). This strategy carries the
commission alongside the delegation instead: the delegator funds a flat commission
here, and the operator — resolved from the registry — collects it.

Self-custody shape (like `FlatFeeAtCreate`): the commission is held by THIS contract, not
in the manager's escrow, and every `IDistributionStrategy` hook returns an EMPTY movement
array. That is the whole point for a delegation: the registry rejects strategies that
drain `c.amount` (they leave phantom `totalDelegatedStake`), so a commission
strategy must never touch the encumbered backing. Because it never does, the registry
admin can safely allow-list it (`setStrategyAllowed`) and a delegator can bind it on the
delegation commitment. The payout is served directly from this contract's balance —
`claim` returns no movements and emits `DistributionPaid` itself (§D.7).
Operator latch: the registry clears `operatorForCommitment` when the delegation closes,
so the strategy captures ("latches") the operator the first time it observes an active
delegation — on `fundCommission`, `latchOperator`, or the operator's first `claim`. Once
latched the operator can collect even after the commitment closes. Commission that is
never latched (the delegation closed before the operator claimed or latched) is
reclaimable by the delegator via `refundCommission` — so an operator should `claim` or
`latchOperator` while the delegation is live.


## Constants
### manager

```solidity
address public immutable manager
```


### registry

```solidity
address public immutable registry
```


## State Variables
### couponOf

```solidity
mapping(uint256 commitmentId => Coupon) public couponOf
```


## Functions
### constructor


```solidity
constructor(address manager_, address registry_) ;
```

### onlyManager


```solidity
modifier onlyManager() ;
```

### fundCommission

Deposit `amount` of commission for `commitmentId`. Only the commitment's committer
(the delegator) may fund — the refund path returns to the committer, so allowing
arbitrary funders would misattribute it. Pulls the measured balance delta
(fee-on-transfer safe). Latches the operator opportunistically if the delegation is
already active.


```solidity
function fundCommission(uint256 commitmentId, uint256 amount) external nonReentrant;
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`commitmentId`|`uint256`|The delegation commitment to attach commission to.|
|`amount`|`uint256`|Commission units to add, in the commitment's backing token.|


### latchOperator

Capture the operator this delegation currently routes to, fixing who may claim the
commission even after the commitment closes and the registry clears its routing.
Permissionless (typically called by the operator right after delegation). No-op if
already latched or the commitment is not currently delegated.


```solidity
function latchOperator(uint256 commitmentId) external;
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`commitmentId`|`uint256`|The active delegation commitment.|


### refundCommission

Reclaim commission that was never latched to an operator — the delegation closed (or
never happened) before the operator claimed or latched. Only the committer may call,
and only while the commitment is not currently delegated and no operator was latched.


```solidity
function refundCommission(uint256 commitmentId) external nonReentrant;
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`commitmentId`|`uint256`|The commitment to reclaim commission from.|


### claimableOf

Commission currently claimable by the operator for `commitmentId`.


```solidity
function claimableOf(uint256 commitmentId) external view returns (uint256);
```

### onCommitmentCreated

Manager-only. Strategy initializes any per-commitment state and registers the
commitment as bound. MUST revert if the strategy cannot operate against
`ctx.base.adapter` / `ctx.base.token` (the compatibility-refusal mechanism).
Reverts abort commitment creation (NOT guarded — ERC §C.1).

Records the backing token and the delegator (committer); `strategyParams` is unused.
Never reverts on a valid token, so it cannot block delegation-commitment creation.


```solidity
function onCommitmentCreated(CreatedContext calldata ctx) external onlyManager;
```

### claim

Caller-validated claim over the manager-mediated payout path. `claimData` is
strategy-specific (empty / merkle proof / signed envelope / reclaim flag / ...).
Self-custody strategies MAY return an empty array and serve claims on their own
surface instead. Allowed kinds: FromEscrowToExternal, FromEscrowToFree.

The operator collects the commission, paid directly from this contract's balance
(self-custody payout, §D.7 `DistributionPaid` emitted here). Latches the operator on
first claim so later claims survive the commitment's close.


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

No-op: commission is held self-custody, so there is nothing to accrue into escrow and
no movement to emit. Keeping it empty guarantees the strategy never drains `c.amount`.


```solidity
function distribute(DistributeContext calldata) external view onlyManager returns (TokenMovement[] memory);
```

### onCommitmentReleased

Manager-only; called under guarded semantics (ERC §D.6) BEFORE the committer's
remaining encumbrance is freed, so the strategy can take its final accrual sweep.
Allowed kinds: FromEncumberedToEscrow, FromEscrowToExternal, FromEscrowToFree.

No-op — the commission obligation is independent of the delegation close (mirrors
`FlatFeeAtCreate`). Never drains encumbrance.


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

### _tryLatch

Latch the operator from the registry if not yet set and a delegation is live.


```solidity
function _tryLatch(uint256 commitmentId, Coupon storage cp) internal;
```

## Events
### CommissionFunded
The delegator deposited `amount` of commission for `commitmentId`.


```solidity
event CommissionFunded(uint256 indexed commitmentId, address indexed committer, uint256 amount);
```

### OperatorLatched
The operator for `commitmentId` was captured, fixing who may claim the commission.


```solidity
event OperatorLatched(uint256 indexed commitmentId, address indexed operator);
```

### CommissionRefunded
Unclaimed, unlatched commission was returned to the delegator.


```solidity
event CommissionRefunded(uint256 indexed commitmentId, address indexed committer, uint256 amount);
```

## Errors
### OnlyManager

```solidity
error OnlyManager();
```

### AlreadyBound

```solidity
error AlreadyBound();
```

### NotBound

```solidity
error NotBound();
```

### NotAuthorized

```solidity
error NotAuthorized();
```

### NothingToClaim

```solidity
error NothingToClaim();
```

### NotDelegated

```solidity
error NotDelegated();
```

### StreamEnded

```solidity
error StreamEnded();
```

### Delegated

```solidity
error Delegated();
```

### ZeroAmount

```solidity
error ZeroAmount();
```

## Structs
### Coupon

```solidity
struct Coupon {
    uint256 funded;
    uint256 claimed;
    address token;
    address committer;
    address operator;
    bool bound;
}
```

**Properties**

|Name|Type|Description|
|----|----|-----------|
|`funded`|`uint256`|Total commission the delegator has deposited for this commitment.|
|`claimed`|`uint256`|Total commission already paid to the operator.|
|`token`|`address`|Backing token of the commitment (commission is paid in the same token).|
|`committer`|`address`|The delegator who funds the commission and receives any refund.|
|`operator`|`address`|The latched operator; `address(0)` until an active delegation is observed.|
|`bound`|`bool`|Set once at binding.|
