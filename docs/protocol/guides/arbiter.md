---
title: "Arbiter Guide"
status: current
---

# Arbiter Guide

An arbiter is any Ethereum address named at commitment creation to enforce that
commitment. This guide covers releasing, the two-phase forfeit, and agreements.

## What is an arbiter?

When a commitment is created, the committer sets an `arbiter` address. That
address — and only that address — can:

- **Release** the commitment (return the committer's encumbered units to them)
- **Initiate** a forfeit (start the penalty process)
- **Cancel** a pending forfeit (before it executes)

Note that *executing* a forfeit is permissionless once the pause-adjusted
manager execution delay has elapsed and manager forfeiture is not paused —
anyone can call it. The arbiter's authority is over *starting* and *stopping*
enforcement, not the mechanical execution.

The protocol makes no assumptions about what an arbiter is:

| Arbiter Type | Example |
|-------------|---------|
| operator service | Off-chain computation verified on-chain |
| DAO governance | A governor contract vote |
| Multisig | A Gnosis Safe with threshold signatures |
| Decentralized court | Kleros, UMA optimistic oracle |
| Oracle | Chainlink, RedStone, Pyth |
| ZK verifier | A contract verifying a zero-knowledge proof |
| EOA | A trusted individual |

## Capability introspection (`IArbiter`)

Naming a contract as arbiter is the trust act — the manager authenticates by
`msg.sender`, not by any interface check, so an EOA or a bare contract works
without implementing anything. Contract arbiters *should* nonetheless implement
[`IArbiter`](../reference/contracts/shared/arbitration/interfaces/IArbiter.md) so counterparties, services,
and indexers can introspect them **before** opting in:

```solidity
interface IArbiter is IERC165 {
    function commitmentManager() external view returns (address);
    function arbiterCapabilities() external view returns (uint256); // ArbiterCapabilities bitmap
    function arbiterMetadataURI() external view returns (string memory);
}
```

- `commitmentManager()` lets a caller confirm the arbiter targets the expected
  manager instance.
- `arbiterCapabilities()` is a bitmap (see `ArbiterCapabilities`) declaring which
  manager actions the arbiter can actually dispatch — `INITIATE_FORFEIT`,
  `CANCEL_FORFEIT`, `RELEASE_COMMITMENT`, `FORFEIT_AGREEMENT`,
  `RELEASE_AGREEMENT`, `SETTLE_AGREEMENT`, `MUTUAL_LOSS`. A counterparty that
  needs bilateral settle can refuse an arbiter that doesn't advertise
  `SETTLE_AGREEMENT`; a mutual can require `MUTUAL_LOSS`.
- `arbiterMetadataURI()` is an optional off-chain pointer (jurisdiction, policy,
  dispute process) for the human trust decision.

Discover support with ERC-165 and degrade gracefully for legacy marker arbiters:

```solidity
if (IERC165(arbiter).supportsInterface(type(IArbiter).interfaceId)) {
    uint256 caps = IArbiter(arbiter).arbiterCapabilities();
    require(ArbiterCapabilities.has(caps, ArbiterCapabilities.SETTLE_AGREEMENT), "arbiter can't settle");
}
```

The reference arbiters declare their surface honestly: `ManualArbiter` advertises
every capability (the owner drives all of them, including the mutual
passthroughs); `AttestationArbiter` advertises the full commitment, agreement
(including bilateral `SETTLE_AGREEMENT`), and `MUTUAL_LOSS` surface — its
EIP-712-typed envelope payload can express every one, dispatched under
strict per-target ordering; `OptimisticInsuranceArbiter` advertises just
`INITIATE_FORFEIT | CANCEL_FORFEIT`; and `OptimisticMutualArbiter` advertises
`MUTUAL_LOSS`. `TwoTierArbiter` advertises
`INITIATE_FORFEIT | CANCEL_FORFEIT` and routes a fast primary ruling through a
bounded appeal to a separate final controller. See the
[two-tier arbiter deployment guide](two-tier-arbiter.md) for its DAO, timing,
policy, and keeper requirements.

All five inherit `ArbiterBase` (`src/shared/arbitration/ArbiterBase.sol`). It
holds the immutable manager binding, `commitmentManager()`, ERC-165
`supportsInterface`, and the shared errors. A new arbiter can inherit it and
implement `arbiterCapabilities()` and `arbiterMetadataURI()`.

## Releasing a commitment

When the backed condition is satisfied and the committer should get their
capital back:

```solidity
manager.releaseCommitment(commitmentId);
```

This runs the bound strategies' release hooks (for any final accrual), then
returns the committer's remaining encumbered units to their free balance and
marks the commitment released. If the commitment backs an operator delegation,
the operator registry is notified via callback.

## Two-phase forfeit

Forfeiture is deliberately two-step, with a mandatory manager execution delay
between. This delay is also called `challengeWindow` in the contract for
compatibility, but it does not itself grant the committer a generic on-chain
challenge method. Claims, disputes, or appeals belong to the selected arbiter's
separate decision mechanism.

### Step 1 — initiate

```solidity
manager.initiateForfeit(commitmentId, penaltyBps);
```

- `penaltyBps` must be ≤ the commitment's `maxPenaltyBps`.
- You can forfeit *less* than the maximum — the penalty is proportional to the
  severity you choose.
- This starts the forfeit execution-delay timer. At most one proposal is active at a time.

### Step 2 — wait for the pause-adjusted execution delay

There is no zero-delay forfeit: `challengeWindow` is always ≥
`manager.MIN_CHALLENGE_WINDOW()` (1 day by default). During the delay, the
arbiter may cancel. A committer's way to contest, if one exists, is defined by
the arbiter mechanism or a published off-chain policy rather than by a generic
manager transaction.

```solidity
ICommitmentManager.Commitment memory c = manager.getCommitment(commitmentId);
ICommitmentManager.ForfeitProposal memory p = manager.getForfeitProposal(commitmentId);
(bool paused,,,, uint64 creditable) = manager.pauseState();
uint256 pauseOverlap = uint256(creditable) - uint256(p.cumulativePausedAtStart);
uint256 effectiveExecutionAt = uint256(p.initiatedAt) + c.challengeWindow + pauseOverlap;
// Executable once: !paused && effectiveExecutionAt <= block.timestamp
```

The subtraction is valid for an authentic manager snapshot because lifetime
pause credit is monotone. An integrator that observes `creditable <
p.cumulativePausedAtStart` should report inconsistent/unavailable timing rather
than wrap the value or invent a deadline. Lifetime credit is capped by
`maxPauseDuration`; pauses credited before this proposal are excluded by the
proposal snapshot.

### Step 3 — execute

After the effective delay elapses, **anyone** can execute while manager
forfeiture is not paused:

```solidity
manager.executeForfeit(commitmentId);
```

This credits the forfeited units to the counterparty's free balance (a pull
payment), returns any residual to the committer's free balance, then runs the
forfeit hooks. The forfeited magnitude is recorded in `forfeitedUnitsOf(id)` even
after the commitment's `amount` is zeroed at close.

### Cancel

Before execution, the arbiter can cancel:

```solidity
manager.cancelForfeit(commitmentId);
```

The commitment stays active; a new forfeit can be initiated later. If an arbiter
*abandons* a proposal, anyone can clear it after its TTL via
`cancelStaleForfeitProposal(commitmentId)`, which unblocks the committer's
unbond. Its wall-clock threshold is `effectiveExecutionAt +
FORFEIT_PROPOSAL_TTL`; stale cancellation can be available even while ordinary
execution is manager-paused.

### Escalated primary and appeal controllers

[`TwoTierArbiter`](two-tier-arbiter.md) wraps this same manager proposal in a
case-ID-scoped court lifecycle. An unappealed primary ruling proceeds normally;
an authorized appeal cancels and reopens the proposal, giving a separate appeal
controller a bounded period to affirm, change, or dismiss it. The commitment's
challenge window must cover the longer court decision window plus an execution
buffer.

## Managing agreements

For bilateral commitments (agreements), the arbiter controls both linked legs.

### Release both sides

```solidity
manager.releaseAgreement(agreementId);
```

Releases both commitments simultaneously; both committers get their units back.

### Forfeit both sides

```solidity
manager.forfeitAgreement(agreementId, penaltyBps);
```

Initiates forfeit proposals on **both** legs at the caller-supplied `penaltyBps`,
which must not exceed either leg's `maxPenaltyBps` (the two legs may carry
different maxima, so the tighter ceiling binds). Each still requires a separate
`executeForfeit()` after its pause-adjusted manager execution delay elapses. A
repeat call reverts `ForfeitPending` when every unresolved leg already has a
live proposal.

### Settle a directional flow

If the agreement was proposed with non-zero settlement caps, the arbiter can move
bounded value from one party to the other without a full forfeit:

```solidity
manager.settleAgreement(agreementId, fromProposer, units, evidenceHash);
```

`units` is capped per direction by the agreement's lifetime settlement caps.

## Querying commitment state

```solidity
ICommitmentManager.Commitment memory c = manager.getCommitment(commitmentId);
// c.committer, c.arbiter, c.counterparty, c.token, c.adapter
// c.amount, c.maxPenaltyBps, c.challengeWindow, c.expiresAt
// c.released, c.forfeited

ICommitmentManager.ForfeitProposal memory p = manager.getForfeitProposal(commitmentId);
// p.penaltyBps, p.initiatedAt, p.executed, p.cancelled

uint64 closed = manager.closedAt(commitmentId);          // 0 while active
uint256 forfeited = manager.forfeitedUnitsOf(commitmentId); // 0 if never forfeited
```

For any value owed to the counterparty through a bound strategy, query
`manager.pending(commitmentId, strategy, claimData)` rather than a built-in
yield field — payouts flow through the strategy, not the commitment struct.

## Best practices

1. **Set appropriate manager execution delays.** The 1-day `challengeWindow`
   floor is a minimum, not a recommendation. Match the delay to how quickly
   observers can discover a decision and use the arbiter-specific contest or
   cancellation process.

2. **Use proportional penalties.** Forfeit at the actual severity via `penaltyBps`,
   not always `maxPenaltyBps`. A minor breach shouldn't trigger the maximum.

3. **Publish context off-chain.** `ForfeitInitiated` is on-chain evidence that a
   forfeit began; consider publishing the *reason* off-chain (IPFS, a metadata
   URI) so the record is auditable.

4. **Check the pause state.** `executeForfeit` reverts when forfeiture is paused
   at the manager level. Query `manager.pauseState()` (its first value is the paused
   flag) before attempting it.
