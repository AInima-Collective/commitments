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

Note that *executing* a forfeit is permissionless once the challenge window has
elapsed — anyone can call it. The arbiter's authority is over *starting* and
*stopping* enforcement, not the mechanical execution.

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
`MUTUAL_LOSS`.

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

Forfeiture is deliberately two-step, with a mandatory challenge window between.

### Step 1 — initiate

```solidity
manager.initiateForfeit(commitmentId, penaltyBps);
```

- `penaltyBps` must be ≤ the commitment's `maxPenaltyBps`.
- You can forfeit *less* than the maximum — the penalty is proportional to the
  severity you choose.
- This starts the challenge-window timer. At most one proposal is active at a time.

### Step 2 — wait for the challenge window

The window gives the committer (and observers) time to react. There is no
zero-delay forfeit: `challengeWindow` is always ≥ `manager.MIN_CHALLENGE_WINDOW()`
(1 day by default).

```solidity
ICommitmentManager.Commitment memory c = manager.getCommitment(commitmentId);
ICommitmentManager.ForfeitProposal memory p = manager.getForfeitProposal(commitmentId);
// Executable once: p.initiatedAt + c.challengeWindow <= block.timestamp
```

### Step 3 — execute

After the window elapses, **anyone** can execute:

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
`cancelStaleForfeitProposal(commitmentId)`, which unblocks the committer's unbond.

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
`executeForfeit()` after its challenge window elapses.

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

1. **Set appropriate challenge windows.** The 1-day floor is a minimum, not a
   recommendation — longer windows give committers more room to dispute. Match
   the window to how quickly your resolution evidence is contestable.

2. **Use proportional penalties.** Forfeit at the actual severity via `penaltyBps`,
   not always `maxPenaltyBps`. A minor breach shouldn't trigger the maximum.

3. **Publish context off-chain.** `ForfeitInitiated` is on-chain evidence that a
   forfeit began; consider publishing the *reason* off-chain (IPFS, a metadata
   URI) so the record is auditable.

4. **Check the pause state.** `executeForfeit` reverts when forfeiture is paused
   at the manager level. Query `manager.forfeiturePaused()` before attempting it.
