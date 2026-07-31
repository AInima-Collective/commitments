---
title: IDistributionStrategy
status: generated
source: src/core/interfaces/IDistributionStrategy.sol
generated: true
---
# IDistributionStrategy
**Title:**
IDistributionStrategy

Stateful plugin bound to one or more commitments that determines value flows by
returning `TokenMovement[]` instructions the manager validates and applies
(ERC-COMMITMENTS Part D).

Strategies hold their own state; the same strategy contract may be bound to many
commitments. Strategies MAY expose additional surfaces beyond this interface
(standalone claim paths, admin refund hooks, root submission) — conformance defines
the minimum surface, not a maximum. Every contract that executes a payout MUST emit
`DistributionPaid` (ERC §D.7), whether that contract is the manager or the strategy.


## Functions
### onCommitmentCreated

Manager-only. Strategy initializes any per-commitment state and registers the
commitment as bound. MUST revert if the strategy cannot operate against
`ctx.base.adapter` / `ctx.base.token` (the compatibility-refusal mechanism).
Reverts abort commitment creation (NOT guarded — ERC §C.1).


```solidity
function onCommitmentCreated(CreatedContext calldata ctx) external;
```

### onCommitmentReleased

Manager-only; called under guarded semantics (ERC §D.6) BEFORE the committer's
remaining encumbrance is freed, so the strategy can take its final accrual sweep.
Allowed kinds: FromEncumberedToEscrow, FromEscrowToExternal, FromEscrowToFree.


```solidity
function onCommitmentReleased(LifecycleContext calldata ctx) external returns (TokenMovement[] memory);
```

### onCommitmentForfeited

Manager-only; called under guarded semantics (ERC §D.6), strictly AFTER the
manager-internal forfeit transfer. Disposes of strategy-side in-flight accrual only;
cannot affect the forfeit itself. `FromEncumbered*` caps run against the post-forfeit
residual. Allowed kinds: FromEncumberedToEscrow, FromEscrowToExternal, FromEscrowToFree.


```solidity
function onCommitmentForfeited(ForfeitContext calldata ctx) external returns (TokenMovement[] memory);
```

### distribute

Permissionlessly advance accrual state. Called by the manager from
`manager.distribute(id, strategy)`; reverts bubble to the caller.
Allowed kinds: FromEncumberedToEscrow, FromEncumberedToExternal.


```solidity
function distribute(DistributeContext calldata ctx) external returns (TokenMovement[] memory);
```

### claim

Caller-validated claim over the manager-mediated payout path. `claimData` is
strategy-specific (empty / merkle proof / signed envelope / reclaim flag / ...).
Self-custody strategies MAY return an empty array and serve claims on their own
surface instead. Allowed kinds: FromEscrowToExternal, FromEscrowToFree.


```solidity
function claim(ClaimContext calldata ctx, bytes calldata claimData) external returns (TokenMovement[] memory);
```

### pending

Pending amount claimable by the implied recipient.


```solidity
function pending(ClaimContext calldata ctx, bytes calldata claimData) external view returns (uint256);
```
