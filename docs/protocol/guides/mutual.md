---
title: "Build a Mutual"
status: current
---

# Build a Mutual

This guide walks through standing up a **shared-loss mutual** — a pool where
many members each post backing, collectively cover a peril, earn premium while
they're on risk, and share any loss *severally* (each member is liable only for
their own proportional slice, never another member's default).

A mutual is a first-class extension of the manager, not a separate contract: the
pool's accounting lives in the manager alongside the per-commitment ledger, and
each member is an ordinary commitment tagged with a membership. Two running
indices do all the work:

- **Λ (loss index)** — a monotonic, fixed-denominator accumulator. Executing a
  loss bumps Λ once; each member then owes `forfeitableUnits × (Λ − theirSnapshot)`.
  Because the denominator (`totalShares`) never moves on a loss, the bump is O(1)
  and no member is ever asked for more than the units they froze at join.
- **Π (premium index)** — a Synthetix-style per-share accumulator streaming
  premium to members in proportion to their live, deliverable cover.

## The cast

| Role | Who | Responsibility |
|------|-----|----------------|
| Creator | anyone | Registers the mutual and its terms |
| Arbiter | a contract (e.g. `OptimisticMutualArbiter`) | Sole authority to declare a loss; activates the pool |
| Beneficiary | a `ClaimRouter` | Receives settled member units and forwards them to the claimant |
| Member | a backer | Posts backing, earns premium, is severally liable for losses |
| Policyholder | the covered party | Funds the premium stream via a cover policy |

The reference periphery — `MutualRegistry` (a listing directory),
`OptimisticMutualArbiter` (bonded, optimistic loss arbitration), `ClaimRouter`
(beneficiary), `PremiumScheduler` + `LinkedMutualPolicy` (cover pricing) — lives
in `src/extensions/mutuals/`. You can wire your own; the manager only cares about the
`arbiter`, `numeraire`, and `beneficiary` addresses.

## 1. Create and activate

Create the pool through `MutualRegistry` (which also lists it for discovery) or
directly via `manager.createMutual`. Every member backs with the numeraire token,
so the pool needs no oracle.

```solidity
ICommitmentManager.MutualParams memory params = ICommitmentManager.MutualParams({
    arbiter: address(arbiter),        // OptimisticMutualArbiter
    numeraire: address(usdc),         // the token every member posts
    beneficiary: address(claimRouter),// receives settled units
    challengeWindow: 2 days,          // ≥ MUTUAL_MIN_CHALLENGE_WINDOW (2 days)
    deallocationWindow: 2 days        // ≥ challengeWindow
});

// Via the registry (lists + creates); returns the mutualId.
uint256 mutualId = mutualRegistry.registerMutual(
    params,
    5_000e18,          // targetCapacity (advisory listing metadata)
    termEnd,           // listing term end (unix seconds)
    "ipfs://peril",   // perilURI
    perilHash
);

// The arbiter activates the pool — no loss can be declared until it is active.
arbiter.activate(mutualId); // OptimisticMutualArbiter: onlyOwner
```

Both `deallocationWindow ≥ challengeWindow ≥ 2 days` must hold.

## 2. Members join

A member posts backing to the manager, then joins the pool. `joinMutual` creates
the member's commitment *and* the membership atomically. The commitment's
`arbiter` must equal the mutual's arbiter, its `counterparty` must equal the
mutual's beneficiary (no self-forfeiture), and it must bind **no** distribution
strategies.

```solidity
// Member deposits backing first.
vm.startPrank(member);
usdc.approve(address(manager), 1_500e18);
manager.deposit(address(usdc), 1_500e18);
vm.stopPrank();

ICommitmentManager.CommitmentParams memory p;
p.arbiter = address(arbiter);          // == mutual.arbiter
p.counterparty = address(claimRouter); // == mutual.beneficiary
p.token = address(usdc);               // == mutual.numeraire
p.adapter = adapter;
p.amount = 1_500e18;
p.maxPenaltyBps = 10_000;              // 100% forfeitable → E_i = amount
p.challengeWindow = 1 days;            // per-commitment floor
p.strategies = new StrategyBinding[](0); // members bind no strategies

vm.prank(member);
uint256 commitmentId = manager.joinMutual(mutualId, p);
```

At join the member freezes two quantities: `forfeitableUnits` (`E_i =
amount × maxPenaltyBps / 10000`, the most they can ever lose) and `creditedValue`
(their share of `totalShares`). Both equal `E_i`.

A mutual whose Λ has reached `1e18` is wiped out. `joinMutual` reverts
`MutualExhausted`.

## 3. Premium: fund the stream, members claim

A policyholder buys cover, which funds a premium stream over a duration. The
reference `LinkedMutualPolicy` prices the premium via `PremiumScheduler` and
calls `manager.fundMutualPremium` for you:

```solidity
vm.prank(policyholder);
usdc.approve(address(coverPolicy), type(uint256).max);
uint256 bindingId = coverPolicy.bindCover(mutualId, 2_000e18, 180 days);
// internally: manager.fundMutualPremium(mutualId, premium, duration)
```

To fund a stream directly (bypassing the pricing periphery):

```solidity
manager.fundMutualPremium(mutualId, premiumAmount, 180 days);
```

Premium accrues continuously to each member in proportion to their **live
deliverable cover** (their remaining, still-backed liability). A member banks and
withdraws their accrued premium to their free balance at any time:

```solidity
manager.claimMemberPremium(commitmentId);
// or, in one call across many members:
manager.claimMembersPremium(commitmentIds);
```

Premium funding is solvency-guarded: a stream can never promise more than the
reserve holds, and its rate can only be increased, never griefed downward.
While a stream is live its end never moves earlier: the new end is
`max(periodFinish, now + duration)`. Funding reverts `MutualExhausted` once Λ is
at `1e18`.

## 4. A claim: propose → challenge → execute → settle → collect

Loss resolution is two-phase and optimistic. With `OptimisticMutualArbiter`,
anyone can *propose* a loss by posting a bond; the arbiter owner can *veto*
within the challenge window; if unchallenged, the loss *executes* permissionlessly
and members *settle*.

```solidity
// Phase 1 — propose a loss, bonded. Opens the challenge window.
vm.prank(proposer);
arbiter.proposeLoss(mutualId, 1_500e18, keccak256("evidence"), minBond);

// (optional) the arbiter owner vetoes a bad claim within the window:
//   arbiter.veto(mutualId);  // slashes the proposer's bond

// Phase 2 — after the window, anyone executes. Λ bumps once.
vm.warp(block.timestamp + 2 days + 1);
manager.executeMutualLoss(mutualId);

// Each member settles their several share: units move member → beneficiary.
manager.settleMemberLoss(commitmentId);      // one member
manager.settleMembers(commitmentIds);        // batch

// The claimant pulls the settled units out of the ClaimRouter.
vm.prank(policyholder);
uint256 paid = claimRouter.settleAndCollect(commitmentIds, address(usdc), policyholder);

// Anyone returns an unchallenged proposer's bond; it always goes to the proposer.
arbiter.reclaimBond(mutualId);
```

A new `proposeLoss` first refunds a prior claim whose manager proposal has
executed or been cancelled. It reverts `ClaimActive` only while the prior
proposal is still pending in the manager.

Executing a loss bumps Λ by `applied × 1e18 / totalShares`, clamped so Λ never
exceeds `1e18`. Each member then owes `forfeitableUnits × (Λ − lossSnapshot)`,
capped by both their remaining frozen units and their live commitment amount — so
a member's total loss can never exceed the units they posted. If members exited
before the loss shrank the pool, any un-applicable excess is emitted as a
`MutualLossShortfall` rather than over-charging survivors.

## 5. Exit

A member leaves in two steps, mirroring per-commitment unbonding. They stay
slashable *and* keep earning premium through the deallocation window — capacity
can't flee an in-flight loss.

```solidity
manager.requestMutualExit(commitmentId);          // starts the deallocation window
vm.warp(block.timestamp + deallocationWindow + 1);
manager.settleMemberLoss(commitmentId);           // settle any pending loss first
manager.releaseMutualMember(commitmentId);        // frees remaining backing, auto-pays premium
```

Release is open from one `deallocationWindow` after the request until two
(pause-adjusted). At or after the end, `releaseMutualMember` reverts
`ExitRequestLapsed`. The member then calls `requestMutualExit` again, which
starts a fresh window.

`releaseMutualMember` removes exactly the `creditedValue` the member added,
returns their remaining backing to their free balance, and pays out any accrued
premium. When the last member leaves, the mutual sweeps its premium reserve to
the beneficiary and terminates. Exit requests and release are blocked while a loss
is pending, so a request can lapse while a loss is pending.

## Accounting notes

- **Several liability.** `totalShares` (the Λ denominator) changes only on
  join/release, never on loss — so one member's settlement never dilutes another,
  and the loss bump is a single storage write.
- **`activeCover`** tracks live deliverable cover and shrinks as members settle or
  exit; it's the Π denominator, and `activeCover == totalShares − settledTotal`
  holds as an invariant.
- **One token.** Members back in the numeraire and `creditedValue = E_i`, so no
  oracle is read anywhere.
- **Windows.** `MUTUAL_MIN_CHALLENGE_WINDOW` is 2 days (stricter than the 1-day
  per-commitment floor); `deallocationWindow ≥ challengeWindow`.

## References

- Normative spec: [ERC-COMMITMENTS-MUTUALS](../../standards/ERC-COMMITMENTS-MUTUALS.md)
  (loss index and premium index).
- Core logic and periphery: `src/extensions/mutuals/`.
- Related: the [Integrator guide](integrator.md) for single-commitment coverage
  and the `CounterpartyPremiumStream` strategy.
