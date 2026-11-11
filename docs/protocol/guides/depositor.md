---
title: "Depositor Guide"
status: current
---

# Depositor Guide

This guide walks through the lifecycle of a depositor: funding your ledger
balance, backing an agreement with a commitment, and getting your capital back.

## The custody model

The `CommitmentManager` is the custody root. When you deposit a backing token,
the manager holds it and credits your **free balance** — a per-`(token, user)`
ledger entry. Creating a commitment moves some of that free balance into your
**encumbered balance**, where it backs a lien until the commitment is released
or forfeited.

```
free balance      → withdrawable at any time, backs nothing
encumbered balance → locked by your active commitments
```

Backing can be *any* ERC-20. Raw tokens (USDC, WETH) price at a flat 1.0; yield
-bearing ERC-4626 vault shares (including the protocol's own `CommitmentsVault`)
keep earning while encumbered, because the manager custodies the *shares* and the
underlying stays deployed. Which token you use is your choice — the manager is
token-agnostic.

## 1. Fund your ledger balance

Approve the manager, then deposit the backing token:

```solidity
IERC20(token).approve(address(manager), amount);
manager.deposit(token, amount); // credits your free balance
```

Two convenience variants:

```solidity
// Deposit on someone else's behalf (credits `onBehalfOf`, pulls from you):
manager.depositFor(token, amount, onBehalfOf);

// One-tx approve+deposit via an ERC-2612 permit (no separate approve):
manager.depositWithPermit(token, amount, deadline, v, r, s);
```

If your backing is yield-bearing vault shares, first mint them from the vault,
then deposit the shares into the manager:

```solidity
IERC20(asset).approve(address(vault), assets);
uint256 shares = vault.deposit(assets, msg.sender); // ERC-4626, instant
IERC20(vault).approve(address(manager), shares);
manager.deposit(address(vault), shares);
```

## 2. Check your balance

```solidity
uint256 free = manager.freeBalance(token, msg.sender);       // withdrawable
uint256 locked = manager.encumberedBalance(token, msg.sender); // backing commitments
```

You can only withdraw or commit free balance.

## 3. Create a commitment

A commitment is a parameterized lien: it names an **arbiter** (who can release
or forfeit), a **counterparty** (who receives forfeited value), a backing
**token** and its pricing **adapter**, and the enforcement terms. Parameters are
passed as a `CommitmentParams` struct:

```solidity
uint256 commitmentId = manager.createCommitment(
    ICommitmentManager.CommitmentParams({
        arbiter: arbiterAddress,       // who can forfeit or release
        counterparty: counterpartyAddr, // who receives forfeited value
        token: token,                   // backing token
        adapter: adapterAddress,        // pricing adapter for `token`
        amount: amount,                 // raw backing units to encumber
        maxPenaltyBps: 5000,            // ≤ 50% of `amount` is forfeitable
        challengeWindow: 86400,         // 24h between forfeit initiation and execution
        expiresAt: 0,                   // 0 = no self-expiry
        strategies: new StrategyBinding[](0), // optional value-flow plugins (§ Value flows)
        metadataURI: "",
        metadataHash: bytes32(0)
    })
);
```

Your `amount` units are now encumbered — they can't be withdrawn until the
commitment closes.

### Understanding the parameters

| Parameter | Range | Meaning |
|-----------|-------|---------|
| `maxPenaltyBps` | 0–10000 | Maximum share of `amount` the arbiter can forfeit, in basis points. `5000` = 50%, `10000` = 100%. |
| `challengeWindow` | seconds | Delay between a forfeit being *initiated* and being *executable*. Must be ≥ `manager.MIN_CHALLENGE_WINDOW()` (1 day by default) — there is no zero-delay forfeit. |
| `adapter` | address | The `IBackingAdapter` that prices `token` (a static adapter for raw ERC-20s, an ERC-4626 adapter for vault shares). |
| `expiresAt` | unix time | If non-zero, you can self-release after this time via `expireCommitment`. |
| `strategies` | array | Optional distribution strategies bound to the commitment (see below). |

### Exposure allocation

You can hold many commitments against the same token as long as the exposure
allocation invariant holds (INV-3):

```
Σ (amount × maxPenaltyBps / 10000)  ≤  Σ amount
     (totalForfeitable)                (totalEncumbered)
```

across your active commitments in that token. Because only the *forfeitable*
portion counts against the cap, commitments with sub-100% penalties can overlap.
Query your current position with `manager.getUserExposure(token, user)`.

## 4. Value flows (yield share, fees, premiums)

Commitments don't carry a built-in yield-split field. Instead, *any* value flow —
a share of the backing's appreciation, a flat fee, an insurance premium — is
expressed by binding a **distribution strategy** at creation. Two reference
strategies ship with the protocol:

- **`IndexAppreciationYield`** — routes a share of the backing token's index
  appreciation to the counterparty.
- **`FlatFeeAtCreate`** — pays the counterparty a fixed fee up front.

```solidity
StrategyBinding[] memory strategies = new StrategyBinding[](1);
strategies[0] = StrategyBinding({
    strategy: address(indexAppreciationYield),
    params: abi.encode(/* strategy-specific config, e.g. share bps */)
});
// ...pass `strategies` in CommitmentParams above.
```

Accrual is advanced permissionlessly with `manager.distribute(id, strategy)` and
paid out with `manager.claim(id, strategy, claimData)`. `pending()` shows live
accrual that `claim()` pays only once `distribute()` has banked it, so call them in
that order (a contract can make both calls in one transaction):

```solidity
manager.distribute(commitmentId, strategy);
manager.claim(commitmentId, strategy, claimData);
```

## 5. After resolution

### If released

The arbiter calls `releaseCommitment(commitmentId)`. Your encumbered units return
to your free balance (after any final strategy accrual), and you can withdraw them.

### If forfeited

The arbiter initiates a forfeit; after the manager's pause-adjusted execution
delay elapses, **anyone** can execute it while forfeiture is not paused. The
delay is stored as `challengeWindow`, but it does not create a generic contest
transaction. The forfeited units are credited to the counterparty's free
balance (a pull payment), and the residual returns to your free balance.

Example — 1000 units, `maxPenaltyBps = 5000` (50%), arbiter forfeits at 3000 (30%):

- 300 units credited to the counterparty
- 700 units returned to your free balance

## 6. Get your capital out

Free balance is instant — it backs nothing:

```solidity
manager.withdraw(token, amount); // transfers `token` back to you immediately
```

To reclaim capital that's still *encumbered* by one of your own commitments
(when there's no arbiter to release it), use the committer unbond path. It's a
timelock, not a queue: the arbiter keeps forfeit authority during the window.

```solidity
manager.requestUnbond(commitmentId);          // starts the timer
// ...wait manager.unbondingPeriod() seconds...
manager.finalizeUnbond(commitmentId);          // closes; encumbered → free
manager.cancelUnbond(commitmentId);            // (optional) abort before finalizing
```

`finalizeUnbond` reverts while a forfeit proposal is active.

## 7. Agreements (bilateral commitments)

An agreement links two commitments under one arbiter, released or forfeited
together. The legs share the arbiter and challenge window, but each leg has its
own token, adapter, amount, penalty ceiling, and strategy set. Cross-token and
otherwise asymmetric agreements are supported.

### As proposer

```solidity
uint256 proposalId = manager.proposeAgreement(
    ICommitmentManager.AgreementParams({
        arbiter: arbiterAddress,
        acceptor: acceptorAddress,
        proposerLeg: ICommitmentManager.LegTerms({
            token: proposerToken,
            adapter: proposerAdapter,
            amount: 1000,
            maxPenaltyBps: 5000,
            strategies: new ICommitmentManager.StrategyBinding[](0)
        }),
        acceptorLeg: ICommitmentManager.LegTerms({
            token: acceptorToken,
            adapter: acceptorAdapter,
            amount: 800,
            maxPenaltyBps: 3000,
            strategies: new ICommitmentManager.StrategyBinding[](0)
        }),
        challengeWindow: 86400,
        proposalDuration: 172800,       // 48h for the acceptor to act
        metadataURI: "",
        metadataHash: bytes32(0),
        maxFlowProposerToAcceptor: 0,   // 0/0 disables settlement flow
        maxFlowAcceptorToProposer: 0
    })
);
```

Your `proposerLeg.amount` is encumbered immediately. If the acceptor doesn't
act in time, reclaim it:

```solidity
manager.cancelAgreementProposal(proposalId); // your units return to free
```

### As acceptor

```solidity
(uint256 agreementId, uint256 proposerCommitmentId, uint256 acceptorCommitmentId) =
    manager.acceptAgreement(proposalId);
// The returned commitment ids match manager.getAgreementPair(agreementId).
```

Both sides are now committed; the arbiter can `releaseAgreement` or
`forfeitAgreement` both legs atomically.

## Common patterns

### Relayed / gasless creation

A relayer can submit a commitment you signed off-chain, so a contract wallet
(Safe, 4337, or any ERC-1271 signer) or a gasless UX works out of the box:

```solidity
manager.createCommitmentFor(committer, params, deadline, nonce, sig);
```

Revoke an outstanding authorization you signed but no longer want submitted:

```solidity
manager.invalidateCreateAuthorization(); // bumps your nonce
```

### Back an operator

To self-stake as an operator or delegate to one, create a commitment with the
operator registry as the counterparty, then register — see the
[Operator Guide](./operator.md).
