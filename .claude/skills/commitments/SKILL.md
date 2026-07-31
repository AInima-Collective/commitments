---
name: commitments
description: Drive the entire Commitments Protocol from an AI agent — fund the CommitmentManager, create and manage commitments (release, two-phase forfeit, unbond, contributions), run bilateral agreements and mutuals, pick and operate shipped arbiters (manual, attestation, optimistic insurance), attach distribution strategies, back with vault shares via adapters, and reach operator services, mesh, governance, and rewards. Use whenever an agent or user wants to stake productive capital behind an enforceable on-chain promise or operate any shipped part of the protocol.
---

# Commitments Protocol — agent operating guide

This skill teaches an agent to operate the **v2 Commitments Protocol**: a
direct-custody `CommitmentManager` over a per-`(token,user)` free/encumbered
ledger, backing adapters that price any ERC-20/4626 token, parameterized liens
("commitments") with two-phase arbiter-driven forfeiture, bilateral agreements,
pluggable distribution strategies, and a mesh/governance layer that aggregates
stake into voting power.

Every signature here is cross-checked against `src/core/interfaces/ICommitmentManager.sol`,
`src/core/interfaces/IDistributionStrategy.sol`, `src/periphery/arbiters/*`,
`src/periphery/vaults/*`, `src/backing/*`, and `src/distributions/*`. **Ignore any older guide
that uses positional `createCommitment` args, `maxPenaltyPct` (0–100), or a
`yieldShareBps` field on the commitment** — those are v1 and wrong. Penalties are
**basis points (0–10000)** everywhere.

> This skill supersedes the older single-purpose `create-commitment` skill.

---

## Mental model (read this first)

The **CommitmentManager is the custody root.** It holds every token and keeps a
per-`(token, user)` ledger split into:

- **free balance** — withdrawable any time, backs nothing.
- **encumbered balance** — locked behind one or more active commitments.
- (plus per-strategy **escrow**, an isolated third bucket for strategy payouts.)

`Σ(free + encumbered) + Σ escrow == token.balanceOf(manager)` per token (INV-1).

A **commitment** is a unilateral, parameterized lien: the *committer* moves
`amount` of a backing `token` from free → encumbered and grants an `arbiter` the
authority to **forfeit** up to a ceiling (`maxPenaltyBps`) of that stake to a
`counterparty`. Until forfeiture/release the stake stays encumbered — and if the
token is a yield-bearing ERC-4626 share, it **keeps earning the whole time**.

An **agreement** is two linked commitments with a *shared arbiter* — a bilateral
promise where both sides post backing and value can flow between them
(bounded by per-direction caps) via `settleAgreement`.

The five layers, bottom up: **Vault** (clean ERC-4626 backing) → **Adapters +
Strategies** (pricing + value routing) → **CommitmentManager** (custody) →
**Mesh/Registry** (aggregate stake into voting power) → **Services/Governance**.

### The two invariants you must respect

1. **bps everywhere**: `maxPenaltyBps`, `penaltyBps`, `yieldShareBps` are
   0–10000. `5000` = 50%. `> 10000` reverts. `50` means **0.5%**, not 50%.
2. **Exposure allocation (INV-3)**, per `(user, token)` across all active
   commitments: `Σ(amount × maxPenaltyBps / 10000) ≤ Σ amount`. A single
   commitment with `maxPenaltyBps ≤ 10000` always passes; stacking high-penalty
   commitments against the same pool trips `ExposureAllocationExceeded`. Read it
   with `getUserExposure(token, user) → (totalEncumbered, totalForfeitable)`
   (token-first arg order, like all manager views).

---

## Routing — where to go for each task

| You want to… | Read |
|---|---|
| Fund the manager, create a commitment, release/expire it, run two-phase **forfeit**, **unbond**, contribute to someone's stake, or trigger strategy distribution | `reference/lifecycle.md` |
| Choose or operate a shipped **arbiter** (Manual / Attestation / Optimistic-insurance) | `reference/arbitration.md` |
| Run a **bilateral agreement**: propose → accept → settle → forfeit/release | `reference/agreements.md` |
| Attach **distribution strategies** (yield-share, flat fee) and encode their `params` | `reference/strategies.md` |
| Back with **vault shares**, deploy a vault, or pick the right **adapter** | `reference/vault-adapters.md` |
| Register operators, build a **mesh**, enroll an operator service, deploy **governance**, or distribute **rewards** | `reference/upper-layers.md` |

The core create flow is inline below because it's the most common task; the rest
lives in the reference files so the agent reads depth on demand.

---

## Core flow — create a commitment (the 80% case)

Creation reads from your **free balance**, so you must **deposit first**.

```ts
import { parseUnits } from 'viem'

// Backing = ERC-4626 vault shares (canonical) or any plain ERC-20.
const token   = vaultShareAddress          // the backing token you encumber
const adapter = erc4626AdapterAddress       // ERC4626Adapter for shares; ERC20StaticAdapter for plain ERC-20
const amount  = parseUnits('1000', 18)      // RAW backing-token units (mind decimals!)

// 1. (Optional) get vault shares: underlying.approve(vault); vault.deposit(assets, you) → shares.
//    The backing `token` is then the VAULT SHARE address, not the underlying. See reference/vault-adapters.md.

// 2. Fund the manager from your wallet (deposit FIRST — creation pulls free balance, not wallet):
await write(token, 'approve', [manager, amount])
await write(manager, 'deposit', [token, amount])   // credits MEASURED delta (fee-on-transfer safe; no rebasing tokens)

// 3. Verify it landed:
const free = await read(manager, 'freeBalance', [token, me])
if (free < amount) throw new Error('deposit did not credit enough free balance')

// 4. Create:
const params = {
  arbiter:        me,            // self-arbitrated; or a deployed arbiter (see reference/arbitration.md). NON-ZERO.
  counterparty:   beneficiary,   // forfeiture beneficiary. NON-ZERO.
  token,
  adapter,
  amount,
  maxPenaltyBps:  5000,          // 50% forfeiture ceiling (NOT 50). 0–10000.
  challengeWindow: 86400n,       // seconds between initiate & execute forfeit. MIN 86400 (1 day).
  expiresAt:       0n,           // unix expiry; 0 = none. A past non-zero value reverts InvalidExpiry.
  strategies:      [],           // StrategyBinding[]: { strategy, params }. Max 8, no dups. See reference/strategies.md.
  metadataURI:    'ipfs://bafy.../commitment.json',  // ≤ 512 bytes
  metadataHash:   '0x' + '00'.repeat(32),            // bytes32(0) or content hash
}
const commitmentId = await write(manager, 'createCommitment', [params])
// returns commitmentId ≥ 1 (0 is a reserved sentinel); emits CommitmentCreated.
```

Variants: `createCommitmentFor(committer, params, deadline, nonce, sig)` — gasless
relay via an EIP-712 signature from `committer` (read `nonces(committer)` first);
`batchCreateCommitments(params[])` — many at once, same committer, atomic.

**Verify:** `freeBalance` drops by `amount`, `encumberedBalance` rises by `amount`,
`getUserExposure(token, me)` shows `totalForfeitable = amount × maxPenaltyBps / 10000`.

---

## Finding deployed addresses

Local dev (`just dev-up`) writes addresses to `frontend/.env.local`
(`VITE_COMMITMENT_MANAGER_ADDRESS`, `VITE_ERC4626_ADAPTER_ADDRESS`,
`VITE_COMMITMENTS_VAULT_ADDRESS`, `VITE_MANUAL_ARBITER_ADDRESS`, …). The same
addresses are in `broadcast/Simulate.s.sol/31337/run-latest.json`. The indexer
serves live state at `:65422` (`/commitments/urgent`, `/account/:address`, …).

---

## Global pitfalls (apply to every flow)

- **Deposit before create / propose.** Encumbrance is pulled from free balance,
  never from your wallet. `amount > freeBalance` → `InsufficientFreeBalance`.
- **bps, not percent.** `5000` = 50%. `> 10000` → `PenaltyExceedsMax`.
- **Challenge window floor.** `< 86400` → `ChallengeWindowTooShort` (1 day min).
- **Raw decimals.** `amount` is raw token units; vault shares and underlying may
  differ in decimals (e.g. `CommitmentsVault` shares are `underlying decimals − 9`).
- **Zero arbiter / counterparty revert** even when self-arbitrating — set
  `arbiter = you`.
- **Adapter must price the token.** `ERC4626Adapter` for vault shares,
  `ERC20StaticAdapter` for plain ERC-20. Wrong adapter → wrong strategy math.
- **Forfeiture is two-phase and never instant** — `initiateForfeit` (arbiter)
  then `executeForfeit` (anyone, after the window). See `reference/lifecycle.md`.
- **Agreements use the agreement-path calls.** A commitment that belongs to an
  agreement rejects `releaseCommitment` / `initiateForfeit` with `UseAgreementPath`;
  use `releaseAgreement` / `forfeitAgreement`. See `reference/agreements.md`.
- **No rebasing tokens.** `deposit` credits the measured delta and the ledger
  invariant assumes balances don't rebase out from under it.
