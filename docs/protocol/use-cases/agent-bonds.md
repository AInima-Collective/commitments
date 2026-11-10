---
title: "Agent accountability bonds (ERC-8004)"
status: current
---

# Agent accountability bonds (ERC-8004)

**Pattern:** an **AI agent** with an [ERC-8004](https://eips.ethereum.org/EIPS/eip-8004)
on-chain identity posts a slashable, **yield-bearing** bond behind an explicit,
content-addressed SLA — "I will keep drawdown under X%", "I will execute intents
within N blocks", "I will keep this endpoint live". Users check the bond before
delegating to the agent; a breach is priced through the `OptimisticInsuranceArbiter`'s
bond game (no committee, no oracle) and, after the manager's challenge window, the
agent's backing is forfeited to the harmed counterparty. No breach → the agent
unbonds and exits with its principal **plus the vault yield that accrued while the
capital sat encumbered**.

This page is the implementation guide. A runnable end-to-end test lives at
`test/manager/integration/AgentBond.t.sol`.

> **Why this composes.** Restaking-style operator bonds and agent SLAs are the same
> shape: capital pre-positioned behind a promise, with an arbiter deciding breaches.
> Commitments expresses both through one primitive; ERC-8004 adds the missing piece —
> a portable, queryable identity for the *agent* side, so "who is this committer?"
> resolves to an agent registration file (services, endpoints, trust models) instead
> of a bare address. In the ERC-8004 / x402 agent-commerce loop
> (*discover → trust → call → pay → rate*), the bond hardens the **trust** step from
> "reputation says they behaved before" to "capital says they pay if they don't."

## Components

| Component | Role |
|---|---|
| **Agent `A`** | The AI agent's controlling account. Registers in the ERC-8004 Identity Registry, posts the bond as committer. |
| **Identity Registry** | Canonical ERC-8004 registry (`0x8004A169FB4a3325136EB29fA0ceB6D2e539a432`, same address on 20+ chains). `agentId` is an ERC-721 tokenId; `tokenURI` is the agent's registration file. Vendored source: `src/vendor/erc8004/IdentityRegistryUpgradeable.sol`; dev bootstrap: `ERC8004IdentityRegistryDev`. |
| **User `U`** | Consumer of the agent's service; counterparty on the bond, receives forfeit proceeds. |
| **Vault `V`** | Yield-bearing `CommitmentsVault` (any ERC-4626 works). The bond is denominated in shares, priced through `ERC4626Adapter`, so the collateral keeps earning while encumbered. |
| **`OptimisticInsuranceArbiter`** | Reality.eth-style claim game on the bond. Anyone can assert a breach with a bond; the top-of-stack answer wins by timeout. Source: `src/periphery/arbiters/OptimisticInsuranceArbiter.sol`. |
| **SLA metadata** | Off-chain JSON pinned by `metadataURI` + `metadataHash` on the commitment. The chain enforces *quorum-free optimistic resolution*, not the SLA itself — watchers price breaches against the pinned terms. |

## Setup

```solidity
// 1. The agent registers its ERC-8004 identity (once, reusable across bonds).
//    agentId is an ERC-721 tokenId and STARTS AT ZERO — resolve the agent via
//    ownerOf/balanceOf, never by treating 0 as "no agent".
vm.prank(agentAccount);
uint256 agentId = identityRegistry.register("ipfs://agent-registration.json");

// 2. Capital goes to work: underlying -> vault shares -> manager free balance.
vm.startPrank(agentAccount);
usdc.approve(address(vault), capital);
uint256 bondShares = vault.deposit(capital, agentAccount);
vault.approve(address(manager), bondShares);
manager.deposit(address(vault), bondShares);
vm.stopPrank();

// 3. The bond: fully slashable, SLA terms content-addressed on-chain.
//    challengeWindow must be >= the arbiter's answerTimeout (enforced at proposeClaim).
ICM.CommitmentParams memory p;
p.arbiter         = address(optimisticArbiter);
p.counterparty    = user;                        // or a beneficiary/router contract
p.token           = address(vault);              // backing = vault shares
p.adapter         = address(erc4626Adapter);     // prices shares at convertToAssets(1e18)
p.amount          = bondShares;
p.maxPenaltyBps   = 10_000;                      // full forfeit on breach
p.challengeWindow = 2 days;
p.metadataURI     = "ipfs://agent-sla.json";
p.metadataHash    = keccak256(slaJsonBytes);     // binds the exact terms

vm.prank(agentAccount);
uint256 bondId = manager.createCommitment(p);
```

The SLA document is plain JSON, e.g.:

```json
{
  "type": "agent-sla.v1",
  "agentRegistry": "eip155:10:0x8004A169FB4a3325136EB29fA0ceB6D2e539a432",
  "agentId": 42,
  "service": "intent-execution",
  "maxDrawdownBps": 500,
  "responseBlocks": 10,
  "term": { "start": 1780000000, "end": 1790000000 }
}
```

Embedding `agentRegistry` + `agentId` in the SLA (and pinning it via `metadataHash`)
ties the bond to the identity in both directions: the UI resolves the committer
address to a registered agent, and the SLA names which agent identity is on the hook.

## Breach flow

1. **Claim.** A user (or any watcher) calls
   `arbiter.proposeClaim(bondId, amountBps, evidenceHash, templateId, bond)` with a
   USDC bond ≥ the floor. This immediately opens the manager-side forfeit hold, so
   the agent cannot `finalizeUnbond`/`expire` out of custody while the claim is
   pending (starting the unbond *timer* stays allowed — the hold blocks the exit).
2. **Dispute game.** The agent counter-asserts `0` ("no breach") at ≥ 2× the top
   bond; the claimant escalates back. Each dispute re-initiates the hold at the
   capped counter-answer and restarts both timers. Depth is capped at 8 doublings.
3. **Timeout.** After `answerTimeout` with no new bond, `finalizeClaim` resolves the
   top-of-stack answer; after the commitment's challenge window, `executeClaim`
   drives `manager.executeForfeit`.
4. **Payout.** The forfeited shares land in the user's **free balance**
   (pull-payment): `manager.withdraw(address(vault), shares)` then
   `vault.redeem(...)` to the underlying. Because the collateral kept earning, the
   payout carries the accrued yield — slashed *productive* capital, not idle margin.
   Losing dispute bonds split `winnerShareBps` to the winning asserter, remainder to
   the treasury.

A false claim runs the same game in reverse: the agent's `0` answer stands, the hold
is cancelled, the bond commitment stays live, and the agent pockets the winner's
share of the claimant's forfeited bond — being claimed against is positive-EV for an
honest agent.

## Happy flow

No claim lands during the term: the agent calls `requestUnbond(bondId)`, waits out
the manager's unbonding period (the arbiter retains forfeit authority the whole
way — a breach discovered late can still be claimed), `finalizeUnbond`, then
`withdraw` + `redeem`. Exit value = principal + vault yield accrued over the term.

## Surfacing

The dev seed (`script/Simulate.s.sol`) deploys the canonical registry behind a dev
proxy, registers an agent persona, and posts an agent bond. The indexer binds the
registry (broadcast-discovered on dev, the canonical address on production chains)
into an `agent` table; the frontend resolves committer/operator addresses against it
and renders the agent badge on `OperatorIdentity` surfaces. An account is "an agent"
iff it owns at least one registry token — remember ids start at 0.

## Try it in the app

- **`/app/agents`** — every registered agent as an identity card (name, services,
  trust models from the registration file) with its bond rollup; click through to
  `/app/agents/:agentId` for the full identity + bonds list.
- **Commitment detail** — the bond's SLA JSON renders inline (resolved from the
  `data:`/IPFS metadata URI, hash-verified by the indexer), and when the arbiter is
  the `OptimisticInsuranceArbiter` a **Propose claim** action opens the bond game:
  pick a claim size, post the quoted bond, and you land on `/app/claims/:id` where
  dispute / finalize / execute live. Dev-seed timers are 60s, so the whole game
  plays out live.
- **`/app/marketplace`** — vault-covering pools render in the same grid as every
  other coverage pool, badged **vault-funded** (the offering-type axis: cover is
  paid by the vault itself rather than bought as a policy) and filterable by
  that type in the toolbar. The card swaps the buy-cover action for a
  **View vault →** link and keeps the one-tap **Underwrite →** deep link into
  the mutual's join flow.

## The underwritten vault (a coverage market on the vault's own yield)

The strongest form of the pattern covers **many** users at once, makes the breach
condition on-chain observable, **and pays the parties who carry the risk**: the
agent is the strategy manager of a `CommitmentsVault`; a mutual whose numeraire is
that vault's own shares underwrites a drawdown floor on its NAV; and the premium
that pays those underwriters is skimmed from the vault's own realized yield — so
**every deposit is automatically covered**, with no individual cover purchase.
A runnable end-to-end test lives at
`test/manager/integration/AgentVaultUnderwriting.t.sol`.

Three pieces close the loop (`src/periphery/vaults/`):

- **`PremiumSkimStrategy`** (`strategies/PremiumSkimStrategy.sol`; abstract, dev
  concrete `strategies/SkimmingMockStrategy.sol`)
  — the agent's yield strategy with a high-water-mark skim: a permissionless
  `skim()` charges `skimBps` of NEW gains above the charged mark, pays
  `operatorFeeBps` of that fee to the agent (its fixed operator leg) and routes
  the remainder to the conduit. Losses push gains under the mark ⇒ no skim until
  full recovery, and the peril floor is defined against the *post-skim* HWM, so a
  skim can never present as a breach.
- **`VaultCoverConduit`** — keyless policyholder-of-record. `poke()` deposits the
  skimmed underlying into the vault (shares mint to the conduit), inverts the
  scheduler's linear standby quote into the longest stream the budget affords,
  and funds the mutual's premium stream via `LinkedMutualPolicy.fundStandby`.
  Standby, not `bindCover`: mutual loss coverage is **structural** (a validated
  loss marks members down regardless of any recorded notional), so a notional
  binding buys nothing — the vault pays the reservation fee on the pool's whole
  unallocated capacity instead.
- **`ForfeitDonationBeneficiary`** — the mutual's `beneficiary`. Loss settlements
  land in its manager free balance; its permissionless `sweep()` redeems the
  settled shares and donates the proceeds back into the vault.

```
depositors  ──deposit──▶ Vault V (strategy run by agent A; auto-covered)
underwriters ─deposit──▶ shares of V ──▶ manager ──▶ joinMutual (numeraire = V)
agent A ────── one of the underwriters (its main pay = premium on its stake)

yield:  strategy earns → skim() → operator fee → agent
                                → premium share → conduit.poke()
                                → fundStandby ⇒ premium streams to underwriters

breach: strategy loses beyond the floor → NAV drop (on-chain fact)
  → anyone proposes the loss (DAI-bonded) → unvetoed 2-day window elapses
  → executeMutualLoss (Λ bumps) → settleMembers: underwriters marked down pro-rata
  → beneficiary.sweep(): withdraw shares → redeem → donate(assets) into V
  ⇒ NAV/share restored to the floor: depositors made whole by underwriter capital,
    pro-rata, no court, no admin keys — and the cover was paid for by the vault
```

Because the agent underwrites **the vault it manages**, it eats its own losses
twice — as a depositor and as a marked-down underwriter — while its upside is
explicit: the operator fee plus premium on its stake. Third parties co-underwrite
on identical terms, so the bond becomes a two-sided market instead of dead-weight
collateral. Loss convention: `lossShares = convertToShares(floorAssets −
totalAssets)` with `floorAssets = (10_000 − maxDrawdownBps)/10_000 × post-skim
HWM assets` (the HWM is on-chain readable as `strategy.principal() +
strategy.chargedGains()`).

**Denomination gotchas:** the mutual arbiter's loss-declaration bonds must be
denominated in the market's payout asset (`OptimisticMutualArbiter.bondToken` is
immutable — one instance per denomination), and the premium/cover figures are in
vault **shares** (the numeraire), not the underlying.

**Premium-stream lapse ≠ cover lapse:** if the skim runs dry, the conduit simply
accumulates and underwriters stop accruing premium — members remain slashable the
whole time. The next `skim()`/`poke()` resumes the stream (and pays the backlog).

**Try it:** the dev seed deploys the cvaDAI market — three depositors, three
underwriters (the agent leads), a live premium stream funded by a first skim —
and `just demo-agent-breach` drives the whole loop: 8% strategy loss, bonded loss
declaration, 2-day window warp, Λ markdown, settlement sweep, NAV restored to the
floor. Watch it from the vault page ("automatically covered" card), the mutual
page, and `/app/agents`.

## Variations

- **Bilateral instead of pooled.** A single-bond vault-manager shape — one
  bond commitment with the `ForfeitDonationBeneficiary` as counterparty and the
  `OptimisticInsuranceArbiter` claim game (`test/manager/integration/AgentVaultManager.t.sol`)
  — is the right fit when there is no underwriter market to assemble: same
  restitution leg, no premium machinery.
- **Many users, one bond.** Point `counterparty` at a beneficiary/router contract
  (cf. `VaultAForfeitBeneficiary` in the cross-vault pattern) that donates forfeit
  proceeds to a vault shared by the harmed users, instead of a single address.
- **Parametric instead of optimistic.** Swap the arbiter for `AttestationArbiter`
  with an operator quorum watching the SLA metric (the insure-APY pattern) when the
  breach condition is machine-checkable and a service exists to attest it.
- **AI first, human fallback.** Use
  [`TwoTierArbiter`](../guides/two-tier-arbiter.md) when an AI-governed DAO should
  rule quickly but a bonded agent or beneficiary must be able to escalate the
  ruling to a separate human-governed DAO with final authority.
- **Reputation coupling.** After settlement, either party posts ERC-8004
  `ReputationRegistry` feedback keyed by the claim outcome — the bond game produces
  exactly the kind of costly signal reputation systems want to aggregate.
