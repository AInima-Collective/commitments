---
title: IndexAppreciationYield
status: generated
source: src/distributions/IndexAppreciationYield.sol
generated: true
---
# IndexAppreciationYield
**Inherits:**
[StrategyBase](/docs/protocol/reference/contracts/distributions/StrategyBase)

**Title:**
IndexAppreciationYield

The normative-optional premium strategy of ERC-COMMITMENTS (Reference Strategy
Taxonomy): routes a configured share of the backing's index appreciation to the
counterparty as commission/premium, via manager escrow.

Per-commitment state: { lastIndex, yieldShareBps, owed }. One deployment serves any
number of commitments across managers? No — hooks are manager-only, so one deployment
per manager (the manager address is immutable).
Accrual math (normative for implementations offering index-appreciation premiums):
yieldAccrued      = currentEncumbered × (nowIndex − lastIndex) / 1e18
counterpartyYield = yieldAccrued × yieldShareBps / 10_000
yieldUnits        = counterpartyYield × 1e18 / nowIndex, clamped to currentEncumbered


## State Variables
### RECLAIM_WINDOW
Counterparty abandonment TTL: after this long past commitment close, the
committer may reclaim unclaimed accrual (strategy-internal policy, ERC taxonomy).


```solidity
uint64 public constant RECLAIM_WINDOW = 90 days
```


### _positions

```solidity
mapping(uint256 commitmentId => Position) internal _positions
```


## Functions
### constructor


```solidity
constructor(address manager_) StrategyBase(manager_);
```

### positionOf

Per-commitment premium state.


```solidity
function positionOf(uint256 commitmentId)
    external
    view
    returns (uint256 lastIndex, uint16 yieldShareBps, uint256 owed);
```

### onCommitmentCreated

Manager-only. Strategy initializes any per-commitment state and registers the
commitment as bound. MUST revert if the strategy cannot operate against
`ctx.base.adapter` / `ctx.base.token` (the compatibility-refusal mechanism).
Reverts abort commitment creation (NOT guarded — ERC §C.1).

`strategyParams` is `abi.encode(uint16 yieldShareBps)`. Reverts (aborting the
creation) on malformed params or an adapter whose `indexNow` is unreadable — the
v1 compatibility-refusal mechanism.


```solidity
function onCommitmentCreated(CreatedContext calldata ctx) external onlyManager;
```

### distribute

Permissionlessly advance accrual state. Called by the manager from
`manager.distribute(id, strategy)`; reverts bubble to the caller.
Allowed kinds: FromEncumberedToEscrow, FromEncumberedToExternal.


```solidity
function distribute(DistributeContext calldata ctx) external override onlyManager returns (TokenMovement[] memory);
```

### onCommitmentReleased

Manager-only; called under guarded semantics (ERC §D.6) BEFORE the committer's
remaining encumbrance is freed, so the strategy can take its final accrual sweep.
Allowed kinds: FromEncumberedToEscrow, FromEscrowToExternal, FromEscrowToFree.

One final accrual sweep — the manager runs release hooks BEFORE freeing the
encumbrance (ERC §C.1), so the sweep still has an encumbered source.


```solidity
function onCommitmentReleased(LifecycleContext calldata ctx)
    external
    override
    onlyManager
    returns (TokenMovement[] memory);
```

### onCommitmentForfeited

Manager-only; called under guarded semantics (ERC §D.6), strictly AFTER the
manager-internal forfeit transfer. Disposes of strategy-side in-flight accrual only;
cannot affect the forfeit itself. `FromEncumbered*` caps run against the post-forfeit
residual. Allowed kinds: FromEncumberedToEscrow, FromEscrowToExternal, FromEscrowToFree.

Previously-escrowed accrual stays claimable. A final sweep runs against the
post-forfeit residual, capped so the counterparty's total (forfeit payout + premium)
never exceeds the commitment's pre-forfeit amount (ERC taxonomy SHOULD).


```solidity
function onCommitmentForfeited(ForfeitContext calldata ctx)
    external
    override
    onlyManager
    returns (TokenMovement[] memory);
```

### claim

Caller-validated claim over the manager-mediated payout path. `claimData` is
strategy-specific (empty / merkle proof / signed envelope / reclaim flag / ...).
Self-custody strategies MAY return an empty array and serve claims on their own
surface instead. Allowed kinds: FromEscrowToExternal, FromEscrowToFree.

Counterparty claim: full owed, paid out of escrow as raw tokens. Committer reclaim
(abandonment TTL): `claimData = abi.encode(true)` after RECLAIM_WINDOW past close,
credited to the committer's free balance.


```solidity
function claim(ClaimContext calldata ctx, bytes calldata claimData)
    external
    onlyManager
    returns (TokenMovement[] memory);
```

### pending

Pending amount claimable by the implied recipient.

Owed (already escrowed) plus the live accrual a distribute would capture now.


```solidity
function pending(ClaimContext calldata ctx, bytes calldata) external view returns (uint256);
```

### _accrue

Compute and record the accrual since lastIndex; return the escrow-sweep movement.
State mutations live in the caller's frame: if the manager rejects the movement,
the owed/lastIndex updates revert with it.
`lastIndex` only advances when a non-zero accrual is actually banked, and then only
by the index delta that banked (floored) accrual consumed — rounded UP, so rounding
never favors the counterparty. Sub-unit remainders stay pending in index-delta form
instead of being dropped: `distribute` is permissionless, so an unconditional
ratchet would let the committer grind a small/low-decimal counterparty's premium to
zero with per-block calls whose per-call accrual floors to 0.


```solidity
function _accrue(uint256 commitmentId, address adapter, address token, address committer, uint256 encumbered)
    internal
    returns (TokenMovement[] memory moves);
```

### _accrualPreview

The taxonomy's accrual math, full precision via mulDiv.


```solidity
function _accrualPreview(Position storage pos, address adapter, address token, uint256 encumbered)
    internal
    view
    returns (uint256 yieldUnits, uint256 nowIndex);
```

## Errors
### YieldBpsExceedsMax

```solidity
error YieldBpsExceedsMax();
```

### ReclaimWindowActive

```solidity
error ReclaimWindowActive();
```

## Structs
### Position

```solidity
struct Position {
    uint256 lastIndex; // adapter index at last accrual
    uint16 yieldShareBps; // share of appreciation routed to the counterparty
    bool bound; // commitment is bound to this strategy
    uint256 owed; // escrowed backing units claimable by the counterparty
}
```
