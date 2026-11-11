# Distribution strategies — routing value out of a commitment

Strategies are pluggable `IDistributionStrategy` contracts you attach to a
commitment via `CommitmentParams.strategies` (a `StrategyBinding[]`). They route
value — backing-index appreciation, fixed fees, reward streams — to the
counterparty or back to the committer, through a validated movement pipeline the
manager enforces. Max **8** per commitment, **no duplicates**, no zero address
(`TooManyStrategies`, `DuplicateStrategy`, `ZeroAddress`).

```solidity
struct StrategyBinding { address strategy; bytes params; }
```

The hard part for an agent is encoding `params` correctly: it's ABI-encoded and
each strategy `abi.decode`s it with an **exact** type tuple. A mismatch reverts
during creation and aborts the whole commitment.

---

## The interface (for reference)

```solidity
interface IDistributionStrategy {
  function onCommitmentCreated(CreatedContext calldata ctx) external;                 // unguarded at create — revert aborts creation
  function distribute(DistributeContext calldata ctx) external returns (TokenMovement[] memory);
  function onCommitmentReleased(LifecycleContext calldata ctx) external returns (TokenMovement[] memory); // guarded at close
  function onCommitmentForfeited(ForfeitContext calldata ctx) external returns (TokenMovement[] memory);  // guarded at close
  function claim(ClaimContext calldata ctx, bytes calldata claimData) external returns (TokenMovement[] memory);
  function pending(ClaimContext calldata ctx, bytes calldata claimData) external view returns (uint256);
}
```

`CreatedContext` carries `strategyParams` (your `StrategyBinding.params`),
`originalAmount`, `maxPenaltyBps`, plus a `BaseContext {commitmentId, adapter,
token, committer, counterparty, currentEncumbered, timestamp}`. Close hooks are
**guarded** (gas-capped, park-don't-forfeit): a revert emits `StrategyHookFailed`
and parks the accrual instead of blocking the close — recover via
`sweepFailedHook` / `claim`. `onCommitmentCreated` is **unguarded** — a bad
binding (e.g. unfunded fee) correctly aborts creation.

Movements never touch the forfeit transfer itself; they shuffle value between the
ledger buckets within the bound commitment's `amount` cap (INV-4). The movement
**destination decides where the recipient sees the value**, and this trips people
up — a `claim` does *not* generically land in the manager free balance:

| `MovementKind` | Effect | Recipient reads it via |
|---|---|---|
| `FromEncumberedToEscrow` | accrual: committer.encumbered → strategy escrow | `escrowOf(token, strategy)` |
| `FromEscrowToExternal` | payout: escrow → recipient **wallet** (ERC-20 transfer out) | `token.balanceOf(recipient)` / the `Transfer` log |
| `FromEscrowToFree` | payout: escrow → recipient **free balance** (ledger credit) | `freeBalance(token, recipient)` |
| `FromEncumberedToExternal` | direct payout: committer.encumbered → recipient **wallet** | `token.balanceOf(recipient)` |

So when you verify a strategy payout, **check the right place**: both reference
strategies below pay the **counterparty** via `FromEscrowToExternal` — i.e. into the
counterparty's **wallet**, not their manager free balance. (Contrast the two-phase
*forfeit* payout, which is a pull-payment into the counterparty's **free** balance —
see `lifecycle.md`.)

---

## IndexAppreciationYield — share of backing appreciation

Routes a configured share of the backing token's **index appreciation** to the
counterparty as a commission/premium. Only meaningful when the backing actually
appreciates — i.e. an **ERC-4626 yield vault** priced by `ERC4626Adapter`. A
static ERC-20 (`indexNow == 1e18` forever) accrues nothing.

**`params` = `abi.encode(uint16 yieldShareBps)`** — bps (0–10000) of appreciation
sent to the counterparty. `> 10000` reverts `YieldBpsExceedsMax`.

```ts
import { encodeAbiParameters, parseAbiParameters } from 'viem'

const params = encodeAbiParameters(parseAbiParameters('uint16'), [1000]) // 10% of appreciation → counterparty
const strategies = [{ strategy: indexAppreciationYieldAddress, params }]
// …pass `strategies` in CommitmentParams.
```

Accrual (per `distribute`): `yield = currentEncumbered × (nowIndex − lastIndex) /
1e18`; `counterpartyUnits = (yield × yieldShareBps / 10000) × 1e18 / nowIndex`,
clamped to `currentEncumbered`, moved encumbered→escrow then claimable by the
counterparty. Trigger it with `distribute(id, strategy)` / `distributeAll(id)`;
the counterparty pulls with `claim(id, strategy, data)`. Read position with
`positionOf(commitmentId) → (lastIndex, yieldShareBps, owed)`.

Two consequences agents miss:
- **The premium is peeled from the committer's backing.** Each accrual debits
  `committer.encumbered` and shrinks the commitment's `amount` by the paid units.
  The committer's *share count* drops, but since the drop equals the appreciation
  share, their *value* is roughly preserved. Don't assert "amount unchanged" after a
  `distribute`/`claim` — assert `amount` fell by the premium.
- **`claimData` selects the path.** `0x` (or `abi.encode(false)`): the
  **counterparty** claims `owed` to their **wallet** (`FromEscrowToExternal`).
  `abi.encode(true)`: the **committer** reclaims abandoned accrual to their **free
  balance** (`FromEscrowToFree`), allowed only after `RECLAIM_WINDOW` past close.

This is the shipped reference strategy for commitment-bound yield-share premiums.

---

## FlatFeeAtCreate — fixed fee earned at creation

Pays the counterparty a fixed fee as a condition of creating the commitment. The
fee is **earned at create** and survives closure. It is **self-custody**: the
strategy holds committer-attributed credit that you must pre-fund with the
strategy's own `prefund(committer, token, fee)` **before** binding — otherwise
`onCommitmentCreated` reverts `FeeNotFunded(required, available)` and creation
aborts. Do **not** use `manager.fundStrategy` for this strategy — that escrow pot
has no funder attribution and the strategy no longer reads it.

**`params` = `abi.encode(uint256 fee)`** — fee in raw backing-token units. Zero
fee is a no-op binding.

```ts
import { encodeAbiParameters, parseAbiParameters } from 'viem'

const fee = parseUnits('10', 18)                  // 10 backing-token units
// 1) pre-fund YOUR committer credit on the strategy from your wallet:
await write(token, 'approve', [flatFeeAtCreateAddress, fee])
await write(flatFeeAtCreate, 'prefund', [committerAddress, token, fee])
// 2) bind it on the commitment (the create consumes the COMMITTER's credit):
const params = encodeAbiParameters(parseAbiParameters('uint256'), [fee])
const strategies = [{ strategy: flatFeeAtCreateAddress, params }]
// …pass `strategies` in CommitmentParams; only the counterparty may claim the fee.
```

Read with `feeOf(commitmentId) → (fee, token, collected, bound)` and
`creditOf(committer, token)` (unconsumed prefund). Only the counterparty may claim, and the fee pays to the counterparty's
**wallet** straight from the strategy's balance (it emits `DistributionPaid`
itself) — verify with `token.balanceOf`, not `freeBalance`.

Overfunded? `refundUnallocated(token, amount)` returns unconsumed credit to its
owner (the committer, even if a sponsor funded it — prefunding someone else is a
gift). Credit already consumed by a binding is an earned fee and is not
refundable.

**Ordering trap:** `prefund` pulls the fee from your **wallet** via
`transferFrom` (hence the `approve(token, [flatFeeAtCreateAddress, fee])` above) —
it is independent of your manager free balance. If you `deposit` *all* your
backing into the manager first, the wallet is empty and `prefund` reverts
`ERC20InsufficientAllowance`/transfer-failure. Prefund **before** depositing
the commitment backing, or deposit only `balance − fee`.

---

## Encoding cheat sheet

| Strategy | `params` decode | Encode (viem) | Pre-fund? |
|---|---|---|---|
| `IndexAppreciationYield` | `abi.decode(_, (uint16))` → `yieldShareBps` | `encodeAbiParameters(parseAbiParameters('uint16'), [bps])` | no |
| `FlatFeeAtCreate` | `abi.decode(_, (uint256))` → `fee` | `encodeAbiParameters(parseAbiParameters('uint256'), [fee])` | **yes — `strategy.prefund(committer, token, fee)` first** |

`CommitmentsRewardsCoordinator` is intentionally separate: it does **not**
implement `IDistributionStrategy` and is not bindable to commitments. Its
cumulative-Merkle claim path is described in `upper-layers.md`.

**Pitfall:** the decode type must match exactly. `abi.encode(uint32)` where the
strategy expects `uint16` reverts on decode and kills the create. Always encode
with the type in the table.
