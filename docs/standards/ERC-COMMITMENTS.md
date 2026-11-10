---
eip: XXXX
title: Commitments - Enforceable Agreements on Encumbered Token Backing
description: Parameterized, forfeitable commitments backed by encumbered ERC-20 tokens, with pluggable backing adapters, manager-validated distribution strategies, two-phase forfeiture, and committer-initiated unbond.
author: Jake Hartnell (@jakehartnell)
discussions-to: https://ethereum-magicians.org/t/<TBD>
status: draft
type: Standards Track
category: ERC
created: 2026-05-08
requires: 20
---

## Abstract

This ERC defines a composable protocol for on-chain enforceable agreements backed by encumbered tokens. A **commitment manager** custodies backing tokens against a per-`(token, user)` ledger of free and encumbered balances. A **commitment** is a parameterized lien on a committer's encumbered balance under the authority of an arbiter, who can release the backing or forfeit it to a counterparty. Forfeiture uses a two-phase mechanism with a configurable challenge window; an **exposure allocation** invariant prevents committers from over-promising forfeitable capital across commitments; a committer MAY exit any commitment unilaterally via an **unbond window** that preserves the arbiter's right to forfeit during the window.

Two pluggable interfaces generalize what backs a commitment and how value flows during its life:

- **`IBackingAdapter`** — a stateless, view-only contract describing a backing-token category: a value-per-unit index (`indexNow`) and an informational payout denomination. Any ERC-20 fitting an existing adapter category — raw tokens, ERC-4626 vault shares, LSTs, LP tokens, restaking receipts — is usable as backing immediately, with no migration of the underlying capital.
- **`IDistributionStrategy`** — a stateful contract that determines value flows for one or many commitments (premiums, sponsor-funded rewards, AVS-style distributions, fees, streams). Strategies never hold backing tokens and never execute transfers of them; they return `TokenMovement[]` instructions over a closed vocabulary, which the manager validates against per-strategy allow-lists and hard caps before applying.

The standard is organized as four Parts (A through D). Agreements (bilateral commitments), mesh topology, operator services, merkle rewards, and shared-loss mutuals are maintained as sibling extension standards: [`ERC-COMMITMENTS-AGREEMENTS`](./ERC-COMMITMENTS-AGREEMENTS.md), [`ERC-COMMITMENTS-MESH`](./ERC-COMMITMENTS-MESH.md), [`ERC-COMMITMENTS-SERVICES`](./ERC-COMMITMENTS-SERVICES.md), [`ERC-COMMITMENTS-REWARDS`](./ERC-COMMITMENTS-REWARDS.md), and [`ERC-COMMITMENTS-MUTUALS`](./ERC-COMMITMENTS-MUTUALS.md).

## Motivation

Restaking protocols (EigenLayer, Symbiotic, Karak) implement bespoke lien mechanisms tightly coupled to their specific operator/AVS architectures. There is no composable, protocol-agnostic primitive for:

1. **Encumbering tokens** — locking a portion of a user's holdings so they cannot be withdrawn, while the position retains whatever appreciation its token naturally carries.
2. **Parameterized enforcement** — specifying upfront who can forfeit, how much, and with what dispute window, without coupling to a specific enforcement mechanism.
3. **Committer liveness** — the committer MUST always be able to exit a commitment after at most one unbonding period, even if the arbiter is offline, malicious, or has lost keys.

The obvious way to solve these is a purpose-built encumbered ERC-4626 vault — a vault token with a built-in encumbrance ledger and forfeit entry point. That architecture has three structural limits:

4. **Adoption friction.** A user with capital in another yield venue (Morpho, Aave, Yearn, Pendle, ...) would have to withdraw it and re-deposit into the standard's vault — losing their position, accepting a new strategy, adding a trust dependency. Under this standard, the venue's share token itself is the backing: capital never leaves the venue.
5. **Token diversity forced through one shape.** Anything that isn't "single-asset ERC-4626 with the canonical strategy" would be out of scope. Backing adapters make token-category support a matter of deploying one small view contract per category, permissionlessly.
6. **Value flows forced through one mechanism.** A hard-coded premium primitive can route committer yield to the counterparty, but every other value flow — sponsor-funded rewards, AVS distribution to many earners, vested streams, flat fees — would require separate standards. Distribution strategies put all of these behind one interface with one validation discipline and one indexable event stream.

This ERC fills these gaps with a minimal set of layered interfaces. The blast-radius design goal throughout: adapters and strategies are plugins that can be wrong or malicious without compromising custody — the manager is the sole token custodian and sole movement executor, and a misbehaving plugin's worst case is bounded by what the affected commitment's own parties consented to.

## Specification

The key words "MUST", "MUST NOT", "REQUIRED", "SHALL", "SHALL NOT", "SHOULD", "SHOULD NOT", "RECOMMENDED", "MAY", and "OPTIONAL" in this document are to be interpreted as described in RFC 2119 and RFC 8174.

### 0. Units, Roles, Constants, and Conformance

#### 0.1 Units

All percentages, ratios, and weights in this standard are expressed in **basis points (bps)** with a denominator of `10_000`. `10_000 = 100.00%`. Implementations MUST NOT use any other percentage scale. The `Bps` suffix on a field name (`maxPenaltyBps`, `penaltyBps`) is a normative naming requirement.

Commitment amounts, ledger balances, escrow balances, and `TokenMovement.units` are denominated in **raw backing-token units** (the token's own smallest denomination). Adapter indices (`indexNow`) are scaled to a `1e18` base.

**View argument order (token-first).** Every per-token ledger view on the manager takes the token as its **first** argument: `freeBalance(token, user)`, `encumberedBalance(token, user)`, `escrowOf(token, strategy)`, `getUserExposure(token, user)`. This ordering is normative — the selectors differ from the transposed forms, and a mapping-backed view called with transposed arguments typically returns `0` rather than reverting, which is a silent-integration hazard.

#### 0.2 Roles

The standard refers to the following roles. A single Ethereum address MAY hold multiple roles simultaneously; the standard places no constraints on overlap.

| Role | Definition |
|---|---|
| **Committer** | The address whose encumbered balance backs a commitment. The committer is the only party who may call `requestUnbond` (§C.5) or `expireCommitment`. |
| **Arbiter** | The address authorized to release or forfeit a commitment. The protocol enforces only `msg.sender == commitment.arbiter`; it makes no assumptions about what the arbiter is (multisig, DAO governor, oracle contract, off-chain attestation service, dispute-resolution court, ZK verifier, EOA). |
| **Counterparty** | The address that receives forfeited backing and is the default recipient of commitment-bound strategy payouts. |
| **Commitment manager** | The contract that custodies backing tokens, maintains the per-`(token, user)` ledger and per-strategy escrow, owns the commitment state machine, and is the sole executor of `TokenMovement`s. |
| **Backing adapter** | A stateless, view-only contract describing a backing-token category (Part B). Selected per commitment at creation. |
| **Distribution strategy** | A stateful contract bound to one or more commitments that determines value flows by returning `TokenMovement[]` instructions (Part D). |
| **Funder** | Any address that credits a strategy's escrow via `fundStrategy` (§A.4) or a self-custody strategy's own balance via that strategy's surface. |
| **Contributor** | (§C.6) A third-party address that holds free balance and contributes it to a committer's encumbered position under a commitment. The committer is always the first contributor; that self-contribution opens the commitment to subsequent external contributions. |

#### 0.3 Constants

| Constant | Value | Normative |
|---|---|---|
| `MIN_CHALLENGE_WINDOW` | `86_400` (1 day) | MUST |
| `MAX_STRATEGIES` | `8` per commitment | MUST |
| `MAX_PROPOSAL_DURATION` | `30 days` | SHOULD |
| `MAX_METADATA_URI_LENGTH` | `512` bytes | SHOULD |
| `FORFEIT_PROPOSAL_TTL` | `14 days` past `initiatedAt + challengeWindow` | SHOULD |
| `HOOK_GAS_CAP` | `500_000` gas per lifecycle hook | SHOULD (floor; MAY be admin-raised) |
| `MIN_ACTIVATION_DELAY` | `86_400` (1 day) | SHOULD (when §0.6 pattern is used) |

The SHOULD-level values above are baselines, not arbitrary numbers. The threat each defends against and the rationale for the chosen value:

| Constant | Threat | Why this value |
|---|---|---|
| `MIN_CHALLENGE_WINDOW = 1 day` | Flash-forfeit without committer reaction window | Roughly the minimum useful human-reaction window for an off-hours forfeit; shorter values invite same-block griefing |
| `MAX_STRATEGIES = 8` | Unbounded strategy iteration turning forfeit/release gas unbounded | Eight hooks × `HOOK_GAS_CAP` keeps worst-case lifecycle gas comfortably under block limits while exceeding any plausible composition (premium + rewards + fee + stream = 4) |
| `MAX_PROPOSAL_DURATION = 30 days` | Indefinite proposal-state bloat; griefing by stalled proposals | Long enough for cross-timezone coordination, short enough to bound state and operator inattention |
| `FORFEIT_PROPOSAL_TTL = 14 days` past challenge-window | A stuck proposal blocks `finalizeUnbond` indefinitely | Two weeks of arbiter inactivity is a strong signal of capture or abandonment; the TTL converts that signal into a permissionless cancellation path |
| `HOOK_GAS_CAP = 500k` | A gas-guzzling strategy hook making forfeit/release unexecutable | Generous headroom for any reasonable hook (storage writes + an index read + event); small enough that 8 hooks fit in ordinary blocks. The min-gas guard (§D.6) makes the cap safe against starvation |
| `MIN_ACTIVATION_DELAY = 1 day` | Same as `MIN_CHALLENGE_WINDOW` — minimum useful reaction window | Reusing the same floor keeps the protocol's "minimum time for an affected party to react" semantic consistent across forfeit and parameter-change surfaces |

Implementations choosing to deviate from a SHOULD baseline are conformant but assume responsibility for re-validating these threat trade-offs in their deployment context.

**`MIN_CHALLENGE_WINDOW` is a floor, not merely a default.** The enforced minimum on production deployments MUST NOT be configurable below `86_400`; implementers MAY raise it. The reference manager enforces this on-chain: `initialize` sets the minimum to one day, values greater than or equal to one day are accepted, and shorter values (zero included) revert with `MinChallengeWindowBelowFloor()`. An implementation that exposes a weaker production setter deviates from this MUST. Administrators SHOULD route floor increases through the §0.6 staged-activation pattern rather than applying them immediately. Existing commitments retain their creation-time `challengeWindow`; a floor increase affects only future creations.

#### 0.4 Conformance levels

| Part / document | Status | Depends on |
|---|---|---|
| **Part A — Manager Custody and Ledger** | normative | ERC-20 |
| **Part B — Backing Adapters** | normative | — |
| **Part C — Commitments** | normative | Parts A, B |
| **Part D — Distribution Strategies and Token Movements** | normative | Parts A, B, C |
| [`ERC-COMMITMENTS-AGREEMENTS`](./ERC-COMMITMENTS-AGREEMENTS.md) | normative-optional sibling standard | Parts A, C, D |
| [`ERC-COMMITMENTS-MESH`](./ERC-COMMITMENTS-MESH.md) | normative-optional sibling standard | independent; composes with A–D |
| [`ERC-COMMITMENTS-SERVICES`](./ERC-COMMITMENTS-SERVICES.md) | normative-optional sibling standard | Parts A, C; composes with mesh §3 |
| [`ERC-COMMITMENTS-REWARDS`](./ERC-COMMITMENTS-REWARDS.md) | sibling standard | independent; shares the `DistributionPaid` event vocabulary only |
| [`ERC-COMMITMENTS-MUTUALS`](./ERC-COMMITMENTS-MUTUALS.md) (shared-loss mutuals) | normative-optional sibling standard | Parts A, C |

A conformant implementation MUST implement Parts A through D. Part D's interfaces are required surface even for deployments that ship no strategies — binding zero strategies to a commitment is conformant, and the entry points (`distribute`, `claim`, `fundStrategy`) MAY revert `UnknownStrategy` until strategies exist. The sibling documents are independent extensions; an implementation MAY claim conformance to any subset. The family structure mirrors the modular precedent set by [ERC-4337](https://eips.ethereum.org/EIPS/eip-4337) (core / entrypoint / paymaster) — each document is independently auditable and adoptable.

**Extensions MAY gate core entry points for opted-in positions.** An extension that links a commitment into a larger structure (an agreement leg, a mutual membership) MAY, and where its own accounting requires it MUST, reject the core per-commitment lifecycle calls on that commitment in favor of its own path — the position's holder consented to the extension's lifecycle by opting in. Two shipped examples: the agreements extension rejects `releaseCommitment` / `initiateForfeit` on an agreement leg with `UseAgreementPath` and makes `requestUnbond` propagate to the partner leg (see [`ERC-COMMITMENTS-AGREEMENTS`](./ERC-COMMITMENTS-AGREEMENTS.md) §3.1); the mutuals extension rejects the terminal-close, unbond, and forfeit-initiation paths on a member commitment with `CommitmentInMutual` (members exit via `requestMutualExit` → `releaseMutualMember`). The core Part C MUSTs (`releaseCommitment` arbiter-callable, `initiateForfeit` arbiter-only, `requestUnbond` committer-available) are therefore to be read as applying to commitments **not enrolled in such an extension**; an extension that gates a core entry point MUST document the gating normatively in its own specification, MUST preserve an equivalent committer-liveness exit path, and MUST use a distinguished error so integrators can route to the extension path.

**Interface detection.** The family does **not** define a blanket ERC-165 / `supportsInterface` matrix across the manager, adapters, strategies, and mesh nodes: integrators MUST NOT assume ERC-165 support on those surfaces, and capability discovery for them is by convention (deployment documentation, revert-probing). The one shipped capability-discovery surface is the reference `IArbiter` (`IArbiter is IERC165`, with an `arbiterCapabilities()` bitmap advertising which lifecycle actions — release, forfeit, settle-agreement, mutual-loss — an arbiter implements). `IArbiter` introspects an arbiter *contract*; it does not gate manager dispatch, which remains a plain `msg.sender == arbiter` check. A normative `supportsInterface` matrix for the remaining Parts is a candidate for a later revision of this standard.

**Selector & topic0 appendix.** Because argument order, event field order, and enum ordering are all identifier-affecting (§0.1, §C.7, §D.5), the canonical 4-byte function selectors, 32-byte event topic0 hashes, error selectors, and ERC-165 interface ids for the whole family are pinned in the [generated selector appendix](./generated/selectors.md). That appendix is generated from the compiled reference ABIs (`just selectors`), so it cannot drift from the implementation; integrators SHOULD verify load-bearing identifiers against it.

#### 0.5 EVM version requirement

Reference implementations are expected to use transient-storage reentrancy guards (EIP-1153) and therefore require the **Cancun** hardfork or later. Implementations targeting earlier execution layers MAY substitute a classical storage-slot reentrancy guard; the security property required is *non-reentrancy*, not the specific implementation.

**L2 portability.** Some app-rollups and niche L2s ship a non-Cancun EVM version. An implementation targeting such a chain MUST select a reentrancy guard appropriate to that chain — typically a classical `uint256` storage-slot guard — and SHOULD document the substitution in the deployment notes. Implementations targeting Cancun+ chains SHOULD prefer the transient-storage guard for the gas savings.

#### 0.6 Mutable parameter changes

Most parameters in this standard are **immutable post-creation** by design. Commitment fields (`token`, `adapter`, `amount`, `maxPenaltyBps`, `challengeWindow`, `arbiter`, `counterparty`, `expiresAt`, the bound strategy set) are all locked at creation. Immutability removes a class of governance / rugpull risks at the protocol level and lets integrators reason about a position's terms from a single read.

Where mutability is required — admin-controlled protocol parameters (`unbondingPeriod`, `hookGasCap`, `minChallengeWindow`), registry policy in extension recipes, service-level configuration — the standard RECOMMENDS the **`pendingX` + `effectiveAt` activation-delay pattern**. A staged change is observable on-chain throughout the delay window, so any party whose position depends on the parameter can react (deallocate, exit, escalate) before the change lands. This is the pattern used by [ELIP-001](https://github.com/eigenfoundation/ELIPs/blob/main/ELIPs/ELIP-001.md) for operator commission changes (7-day delay).

The recommended interface shape:

```solidity
struct PendingValue {
    uint256 newValue;       // staged value
    uint64  effectiveAt;    // block.timestamp at which newValue takes effect; 0 = no pending change
}

// Stages a change. MUST set pendingX = { newValue, block.timestamp + activationDelay }
// where activationDelay >= MIN_ACTIVATION_DELAY. MUST NOT mutate the live value.
function stageX(uint256 newValue) external onlyAuthorized;

// Activates a staged change. MUST revert if pendingX.effectiveAt is 0 or in the future.
// SHOULD be permissionless — anyone observing the state can land the change once
// the delay has elapsed.
function activateX() external;

// Cancels a staged change. MUST be callable by the address holding the staging
// role at the time of cancellation (which need not be the same address that
// staged the change — multisig signer rotation, role-key rotation, and similar
// authority changes are expected). MUST require pendingX.effectiveAt is non-zero
// and not yet activated.
function cancelStagedX() external onlyAuthorized;

// Exposes the staged change. MUST return (0, 0) when no change is pending.
function pendingX() external view returns (uint256 newValue, uint64 effectiveAt);
```

Implementations using this pattern SHOULD:
- Honor `MIN_ACTIVATION_DELAY` (§0.3) as the floor on the delay window.
- Emit `XPending(newValue, effectiveAt)` on staging and `XActivated(oldValue, newValue)` on activation.
- Reject backdoor immediate-effect setters that bypass the delay. If a true emergency path is required (e.g. circuit-breaker pause), it MUST be a separate, explicitly-named function with its own role guard, and SHOULD NOT be reusable as a parameter-change vector.
- Allow the staged change to be cancelled by the same authority before activation.

Implementations MAY:
- Use per-instance configurable delays (with `MIN_ACTIVATION_DELAY` as the floor).
- Maintain a queue of pending changes if multiple in-flight stages are needed; the simpler one-slot pattern above is preferred for parameters where supersession (later stage replaces earlier) is acceptable.

The activation-delay pattern is the recommended shape for every mutable parameter introduced by this standard, by reference implementations, or by extensions; future revisions MAY promote it to a requirement.

#### 0.7 Privacy considerations (non-normative)

This standard's per-commitment `amount` is a `uint256` and is publicly visible alongside the other commitment parameters (committer, arbiter, counterparty, exposure, bound strategies). The standard does NOT specify any private-amount or private-topology variant.

Future revisions MAY introduce a private-exposure variant where `amount` is replaced by a Pedersen commitment over hidden values. The protocol-level invariants of this standard are designed to be re-castable in such a variant: the exposure allocation invariant (§C.2, INV-3) `Σ commitment.amount × maxPenaltyBps ≤ Σ commitment.amount` is homomorphic over additive Pedersen commitments and admits a ZK range-proof formulation. Implementers exploring this direction are encouraged to:

- Preserve the structural roles (committer / arbiter / counterparty) so public and private deployments share tooling and audit assumptions.
- Preserve the invariant shape so the conformance suite can be ported to the private variant with minimal redesign.
- Treat the forfeit event as a public-accountability moment regardless of pre-forfeit privacy — forfeiture reveals at least the exposure that was forfeited, by construction.

A survey of add-on privacy primitives and their trade-offs is documented in the design note `docs/design/privacy.md`. That document is integrator-facing guidance, not a normative extension of this standard.

---

### Part A — Manager Custody and Ledger (normative)

The commitment manager is the custody root of the protocol. It holds backing tokens, maintains the canonical ledger, and is the only contract that moves them.

#### A.1 Custody model

For every backing token it has accepted, the manager MUST maintain:

- A per-`(token, user)` ledger entry `{ freeBalance, encumberedBalance }`. **Free balance** backs nothing and is withdrawable. **Encumbered balance** backs active commitments and cannot be withdrawn.
- A per-`(strategy, token)` **escrow** balance (§A.4) for strategies that opt into manager-mediated payouts.

```solidity
interface ICommitmentManager /* Part A surface */ {
    // --- Custody ---
    function deposit(address token, uint256 amount) external;                                 // credits msg.sender
    function depositFor(address token, uint256 amount, address onBehalfOf) external;           // credits onBehalfOf's free balance
    function depositWithPermit(address token, uint256 amount, uint256 deadline, uint8 v, bytes32 r, bytes32 s) external; // ERC-2612 approve+deposit
    function withdraw(address token, uint256 amount) external;
    function fundStrategy(address strategy, address token, uint256 amount) external;

    // --- Ledger views (token-first argument order, §0.1) ---
    function freeBalance(address token, address user) external view returns (uint256);
    function encumberedBalance(address token, address user) external view returns (uint256);
    function escrowOf(address token, address strategy) external view returns (uint256);

    // --- Config ---
    function unbondingPeriod() external view returns (uint64);
    function operatorRegistry() external view returns (address);      // 0 unless the services extension is wired

    // --- Circuit breaker ---
    function pauseForfeiture() external;
    function unpauseForfeiture() external;
    // Pause state is read through `pauseState()` (§A.6): its first return value is the paused flag.
}
```

The manager's token balance is canonical for the tokens it custodies: `IERC20(token).balanceOf(manager)` MUST equal the sum of all ledger and escrow entries for that token at all times (the **partition invariant**, §A.5 / INV-1).

#### A.2 Deposit and withdrawal

`deposit(token, amount)` MUST pull `amount` of `token` from `msg.sender` via `safeTransferFrom` and credit the caller's `freeBalance` by the **measured balance delta** (post-transfer balance minus pre-transfer balance), not by `amount`. For standard tokens the two are equal; the measured-delta rule prevents fee-on-transfer tokens from silently violating the partition invariant.

`withdraw(token, amount)` MUST debit the caller's `freeBalance` and `safeTransfer` `amount` to the caller. Free-balance withdrawal MUST NOT be subject to any unbonding delay: free balance backs no commitment, contributes to no exposure, and presents no forfeit surface. (The exit delay that protects arbiters lives on the *commitment* — §C.5 — not on the custody layer.)

**Non-standard token policy.** Rebasing tokens MUST NOT be accepted as backing — a balance that changes underneath the ledger breaks the partition invariant structurally. Fee-on-transfer tokens are tolerated at deposit time by the measured-delta rule but SHOULD be rejected by deployments that can screen for them, since outbound transfers (withdraw, forfeit payout withdrawal, escrow payout) deliver less than the debited ledger amount. Tokens with hooks (ERC-777-style) are subject to the reentrancy rule in §A.7.

#### A.3 Manager-internal ledger operations

All protocol-driven movements of backing are internal ledger arithmetic on the manager — no external token transfer occurs, conservation per token is exact, and the partition invariant holds trivially across each. The operations and their call sites:

| Operation | Effect | Driven by |
|---|---|---|
| **Encumber** | `free[committer] -= x; encumbered[committer] += x` | `createCommitment` (§C.1), agreement propose/accept (extension) |
| **Release encumbrance** | `encumbered[committer] -= x; free[committer] += x` | `releaseCommitment`, `expireCommitment`, `finalizeUnbond`, forfeit residual return (§C.3) |
| **Transfer encumbered** | `encumbered[a] -= x; encumbered[b] += x` | bilateral settlement ([agreements extension](./ERC-COMMITMENTS-AGREEMENTS.md) §5) |
| **Attribute encumbrance** | `free[contributor] -= x; encumbered[committer] += x` | `contributeEncumbered` (§C.6) |
| **Forfeit transfer** | `encumbered[committer] -= x; free[forfeitRecipient] += x` | `executeForfeit` (§C.3) |
| **Escrow debit/credit** | per §D.5 movement application | validated strategy movements (Part D) |

These operations are NOT expressible as `TokenMovement`s and are NOT available to strategies; they are the manager's own lifecycle code. Strategies can only emit the Part D movement vocabulary.

Each ledger operation MUST emit its corresponding event (§A.8) so indexers can mirror the ledger without state reads.

#### A.4 Strategy escrow and `fundStrategy`

The manager MUST maintain `escrow[strategy][token]` buckets for strategies that opt into manager-mediated payouts (Part D custody models, §D.8). Escrow is credited by:

- `fundStrategy(strategy, token, amount)` — permissionless; pulls `amount` from the caller (measured-delta rule as in §A.2) and credits `escrow[strategy][token]`. Emits `StrategyFunded`.
- Applied `FromEncumberedToEscrow` movements (§D.5).

Escrow is debited only by applied `FromEscrowToExternal` / `FromEscrowToFree` movements. Whether unspent escrow can be recovered (refund) is strategy-defined — strategies expose their own admin hooks for this, typically as a `claim`-path movement back to the funder. The manager imposes no refund policy.

A strategy's escrow is isolated: no movement kind can debit one strategy's escrow on behalf of another (INV-5).

#### A.5 Partition invariant

For every token `T` the manager custodies:

```
Σ_users (freeBalance[T][u] + encumberedBalance[T][u]) + Σ_strategies escrow[s][T]
    == IERC20(T).balanceOf(manager)
```

This MUST hold after every state-mutating call (INV-1). The invariant's scope is manager-custodied tokens only: reward tokens held in self-custody strategy contracts or pulled from external sources at claim time (§D.8) are a separate accounting space those strategies own; the manager makes no claims about them.

Implementations SHOULD maintain per-token aggregate counters (`totalFree`, `totalEncumbered`, `totalEscrow`) so the invariant is checkable in O(1) by monitoring and fuzz harnesses. The reference implementation returns them from `ledgerTotals(token)`, together with the mutual premium reserve aggregate `totalMutualPremium` that closes the extended partition ([mutuals extension](./ERC-COMMITMENTS-MUTUALS.md) INV-P1).

#### A.6 Circuit breaker

The manager MUST support pausing forfeit execution (`pauseForfeiture` / `unpauseForfeiture`); `executeForfeit` MUST revert while paused (§C.3). The manager MAY additionally support pausing deposits and withdrawals.

Pause and unpause SHOULD be held by separate roles (`PAUSER_ROLE` / `UNPAUSER_ROLE`) so a single compromised key cannot both pause and refuse to unpause.

##### A.6b Pause budget and window classification (erratum)

A bare circuit breaker is a griefing surface: any pauser can *pin* a committer (initiate a forfeit, then pause — unbond is blocked by the live proposal and the proposal cannot be executed or go stale-cancelled away), can let an honest loss be stale-cancelled by pausing across `challengeWindow + TTL`, and lets every challenge and exit window burn down on wall clock while the actions those windows exist to permit are inoperable.

Implementations MUST therefore bound what pausing can do to the protocol's clocks:

1. **Cumulative budget.** The manager MUST carry a lifetime pause budget `maxPauseDuration`, set at initialization and immutable. The pause time creditable against any window is clamped so the total credited never exceeds the budget. A per-episode time-box is NOT sufficient — sawtooth re-pausing defeats it. Once the budget is spent, pausing still hard-blocks `executeForfeit` (and the mutuals extension's `executeMutualLoss`) but MUST no longer stop any clock: an adversarial pauser cannot buy unbounded delay, and an unattended pause self-neutralizes.
2. **Window classification.** Clock-stopping MUST NOT be symmetric across all windows:
   - **Constraining windows elapse in effective time** (wall clock minus budget-clamped pause overlap): the forfeit challenge window (§C.3), the unbonding period (§C.5), commitment expiry (§C.1), and — in the extensions — the mutual-loss challenge window, deallocation window, and re-initiation rate limit. A pause cannot shrink contest time, and no party can wait out an exit delay while loss execution is frozen.
   - **Liveness backstops run on wall clock and are NEVER stopped**: the stale-TTLs (§C.4), agreement proposal expiries, and premium-stream clocks (members still at risk during a pause are still paid). Freezing the stale-TTLs *is* the pin. The stale threshold is `initiatedAt + challengeWindow_effective + TTL` — the window-end anchor moves out by the (budget-capped) pause credit, the TTL itself does not stop.
3. **Overlap snapshots.** A scalar accumulator cannot compute one window's pause overlap. Each timed record MUST snapshot the budget-clamped cumulative pause time at its own start (`cumulativePausedAtStart`); its overlap is the difference between the current clamped value and that snapshot, so a window started mid-pause credits only the episode's remainder.

Under this scheme the pin dies (the proposal goes stale at bounded wall clock and `cancelStaleForfeitProposal` re-opens unbonding even while paused), and the stale-cancel-vs-honest-loss tension resolves: the loss's challenge window clock-stops while its TTL runs; an honest arbiter re-initiates after an unpause if the TTL fired, with the rate limit clock-stopping alongside.

The manager SHOULD expose the accounting via a `pauseState()` view returning `(paused, pausedAt, cumulativePaused, maxPauseDuration, creditable)`. A `maxPauseDuration` of zero degrades to the pre-erratum behaviour (pure wall clock; the hard-block still applies), which is also the automatic posture of any pre-erratum deployment upgraded in place (all new storage is zero-initialized).

#### A.7 Reentrancy rule

All state-mutating manager entry points MUST be reentrancy-guarded, and — load-bearing for Part D — **all strategy hooks and all movement application MUST execute under the manager's reentrancy lock**. A strategy hook therefore cannot call back into any mutating manager entry point: such a call hits the lock and reverts, which for guarded lifecycle hooks (§D.6) is treated as hook failure, never as partial state. External token transfers to recipients MUST occur after state updates (checks-effects-interactions). Backing tokens with transfer hooks (ERC-777-style) MUST be treated with the same lock discipline.

#### A.8 Events and errors (Part A, normative)

```solidity
event Deposited(address indexed user, address indexed token, uint256 amount);
event Withdrawn(address indexed user, address indexed token, uint256 amount);
event StrategyFunded(address indexed funder, address indexed strategy, address indexed token, uint256 amount);

event EncumbranceIncreased(address indexed user, address indexed token, uint256 units);

/// Encumbrance returned to the holder's FREE balance (encumbered → free). Emitted on
/// commitment close (release / expire / finalize), forfeit-residual return, and
/// agreement-proposal cancel. `commitmentId == 0` is the sentinel for the
/// proposal-cancel path (no commitment exists yet).
event EncumbranceReleased(uint256 indexed commitmentId, address indexed user, address indexed token, uint256 units);

/// A strategy moved encumbered backing into its own escrow (FromEncumberedToEscrow, §D.5).
/// Encumbered goes down, escrow up; the committer's free balance is unchanged.
event EncumbranceMovedToEscrow(uint256 indexed commitmentId, address indexed strategy, address indexed token, uint256 units);

/// A strategy paid encumbered backing out of the manager (FromEncumberedToExternal, §D.5).
/// Encumbered goes down and the value leaves custody; paired with `DistributionPaid`,
/// which carries the recipient.
event EncumbrancePaidExternal(uint256 indexed commitmentId, address indexed strategy, address indexed token, uint256 units);

event EncumbranceContributed(uint256 indexed commitmentId, address indexed contributor, address indexed receiver, uint256 units);

event ForfeiturePauseToggled(bool paused);

error ZeroAddress();
error ZeroAmount();
error InsufficientFreeBalance(uint256 requested, uint256 available);
error InsufficientEncumberedBalance(uint256 requested, uint256 available);
error InsufficientEscrow(uint256 requested, uint256 available);
error ForfeitureIsPaused();
error Unauthorized();
```

**Why three decrement events instead of one.** A single combined `EncumbranceDecreased(user, token, units)` covering every encumbered-side debit would be **path-ambiguous**: a ledger-mirroring indexer could not tell from the event alone whether the holder's free balance grew (release), the value moved to a strategy's escrow, or the value left custody entirely — three cases with different conservation effects. The three events above partition the decrement paths so each can be mirrored without a state read; an implementation MUST NOT collapse them into a single combined decrement event. The forfeit-transfer path (encumbered → counterparty free) is carried by `ForfeitExecuted` (§C.7), and the bilateral-settlement path (encumbered → receiver free) by the agreements extension's `AgreementSettled`.

**Token screening.** The rebasing-token prohibition and fee-on-transfer screening of §A.2 are deployment policy; this standard does not mandate an on-chain screen or reserve an error for it (the reference implementation performs no on-chain token screening). Deployments that do screen SHOULD document the error they revert with.

---

### Part B — Backing Adapters (normative)

A backing adapter describes a **category** of backing token: how to read its value-per-unit index and what its payouts mean. One adapter serves every token of its category; the same adapter is reusable across managers.

#### B.1 Interface

```solidity
interface IBackingAdapter {
    /// @notice Current value-per-unit index for `token`, scaled to a 1e18 base.
    ///         For tokens with no internal appreciation (raw ERC-20s) this is the
    ///         constant 1e18. For appreciating receipts (ERC-4626 shares, LSTs)
    ///         it is the venue's units-to-underlying conversion at 1e18 scale.
    function indexNow(address token) external view returns (uint256);

    /// @notice The denomination in which `token`'s units are most meaningfully
    ///         priced (e.g. the underlying asset of an ERC-4626 vault).
    ///         INFORMATIONAL ONLY — see §B.3.
    function payoutDenomination(address token) external view returns (address);
}
```

#### B.2 Statelessness and trust model

Adapters MUST be stateless and view-only: no token custody, no state mutation, no authorization role anywhere in the protocol. The manager MUST interact with adapters exclusively through `staticcall`-semantics view reads.

Adapters are **untrusted inputs**, not protocol authorities. The adapter is selected per commitment at creation (§C.1) and is visible to every party before they consent — counterparties evaluate the `(token, adapter)` pair the way they evaluate the arbiter. A manipulated or dishonest `indexNow` (a donation-pumped external vault, a lying adapter) can distort what a strategy *computes*, but the manager's movement caps (§D.5, INV-4) bound what any computation can *move*: nothing beyond the affected commitment's own encumbrance, to nobody outside that commitment's parties. See Security Considerations §"Malicious or manipulated adapter".

#### B.3 `payoutDenomination` is metadata only

The manager MUST NOT unwrap, redeem, or convert backing on any payout path. Forfeit payouts and all `*ToExternal` movements deliver **raw backing-token units** (e.g. the ERC-4626 shares themselves, not their underlying). `payoutDenomination` exists so UIs, indexers, and counterparties can price what raw units mean; it imposes no manager behavior. Recipients who want the underlying unwrap it themselves on the venue's own surface.

(Rationale: any unwrap path would make forfeit solvency depend on a third-party venue's liveness and liquidity at forfeit time — exactly when adversarial conditions are most likely. Raw-unit delivery makes forfeit execution depend on nothing but ledger arithmetic over tokens the manager already holds.)

#### B.4 Reference adapters (informative)

| Adapter | `indexNow(token)` | `payoutDenomination(token)` | Serves |
|---|---|---|---|
| `ERC20StaticAdapter` | constant `1e18` | `token` | any plain ERC-20 |
| `ERC4626Adapter` | `IERC4626(token).convertToAssets(1e18)` | `IERC4626(token).asset()` | any ERC-4626 vault share |

*Worked example — composing on external capital.* Alice holds 1000 mUSDC (Morpho vault shares). She calls `manager.deposit(mUSDC, 1000e18)` — the shares move into the manager, the underlying USDC never leaves Morpho and keeps earning there. She creates a commitment with `token = mUSDC, adapter = ERC4626Adapter`. If she is later forfeited at 50%, the forfeit recipient is credited 250e18 *mUSDC shares* on the manager ledger (worth more underlying than at creation if the vault appreciated), withdraws them, and redeems against Morpho directly. `payoutDenomination` told the recipient's UI to price those units in USDC; the manager never touched Morpho.

---

### Part C — Commitments (normative)

A commitment is a parameterized lien on a committer's encumbered backing. It has terminating states (`released`, `forfeited`, `finalized`) and three release paths: arbiter-immediate, committer-with-window, and committer-at-expiry.

#### C.1 Commitment lifecycle

```solidity
struct StrategyBinding {
    address strategy;
    bytes params;          // strategy-specific; consumed by onCommitmentCreated, not stored by the manager
}

interface ICommitmentManager /* Part C surface */ {
    struct Commitment {
        address committer;
        address arbiter;
        address counterparty;
        address token;                 // backing token
        address adapter;               // backing adapter
        uint256 amount;                // raw backing-token units currently encumbered under this commitment
        uint16 maxPenaltyBps;          // 0..10_000
        uint64 challengeWindow;        // seconds
        uint64 createdAt;
        uint64 expiresAt;              // 0 = no expiry
        bool released;
        bool forfeited;
        // Optional metadata: only the hash is stored, as the on-chain anchor. The URI is
        // carried by `CommitmentCreated` and is not part of the stored record.
        bytes32 metadataHash;
    }

    struct CommitmentParams {
        address arbiter;
        address counterparty;
        address token;
        address adapter;
        uint256 amount;
        uint16 maxPenaltyBps;
        uint64 challengeWindow;
        uint64 expiresAt;
        StrategyBinding[] strategies;
        string metadataURI;
        bytes32 metadataHash;
    }

    /// Keyed by `commitmentId` in storage (`getForfeitProposal(commitmentId)`), so the id
    /// is NOT a struct field — the four fields pack into a single slot.
    struct ForfeitProposal {
        uint16 penaltyBps;
        uint64 initiatedAt;
        bool executed;
        bool cancelled;
    }

    /// `totalEncumbered` is the ledger's `encumberedBalance(token, user)`; only
    /// `totalForfeitable` needs its own storage.
    struct UserExposure {
        uint256 totalEncumbered;
        uint256 totalForfeitable;
    }

    // --- Core lifecycle ---
    function createCommitment(CommitmentParams calldata params) external returns (uint256 commitmentId);
    function createAndFund(uint256 depositAmount, CommitmentParams calldata params) external returns (uint256 commitmentId);
    function releaseCommitment(uint256 commitmentId) external;          // arbiter-immediate
    function expireCommitment(uint256 commitmentId) external;           // committer-at-expiry

    // --- Two-phase forfeit ---
    function initiateForfeit(uint256 commitmentId, uint16 penaltyBps) external;
    function executeForfeit(uint256 commitmentId) external;
    function cancelForfeit(uint256 commitmentId) external;
    function cancelStaleForfeitProposal(uint256 commitmentId) external;   // §C.4

    // --- Committer-initiated unbond ---
    function requestUnbond(uint256 commitmentId) external;              // §C.5
    function finalizeUnbond(uint256 commitmentId) external;
    function cancelUnbond(uint256 commitmentId) external;

    // --- Views ---
    function getCommitment(uint256 commitmentId) external view returns (Commitment memory);
    function getForfeitProposal(uint256 commitmentId) external view returns (ForfeitProposal memory);
    function getUserExposure(address token, address user) external view returns (UserExposure memory);  // token-first, §0.1
    function strategiesOf(uint256 commitmentId) external view returns (address[] memory);
    function unbondInitiatedAt(uint256 commitmentId) external view returns (uint64);
    function closedAt(uint256 commitmentId) external view returns (uint64);           // 0 while active
    function forfeitedUnitsOf(uint256 commitmentId) external view returns (uint256);  // units forfeited at execute
}
```

`createCommitment(params)` MUST:

- Reject `arbiter == address(0)` or `counterparty == address(0)`.
- Reject `amount == 0`.
- Reject `maxPenaltyBps > 10_000`.
- Reject `challengeWindow < MIN_CHALLENGE_WINDOW`.
- Reject `expiresAt != 0 && expiresAt <= block.timestamp`.
- Reject `params.strategies.length > MAX_STRATEGIES`.
- Reject metadata URI longer than `MAX_METADATA_URI_LENGTH`.
- Encumber `amount` units of `params.token` from the caller's free balance (manager-internal, §A.3).
- Maintain the exposure allocation invariant (§C.2) after creation.
- Assign a `commitmentId ≥ 1`. Identifier `0` MUST never identify a commitment — it is reserved as the non-attribution sentinel in `DistributionPaid` (§D.7, INV-10).
- For each `StrategyBinding` in order: call `strategy.onCommitmentCreated(ctx)` with the binding's `params` in the context, then emit `CommitmentBoundToStrategy(commitmentId, strategy, params)`. A revert in any `onCommitmentCreated` MUST abort the entire creation (this is the adapter/strategy-compatibility refusal mechanism — a strategy that cannot operate against the commitment's `(adapter, token)` refuses the binding here). Creation hooks are NOT subject to the §D.6 guarded-call treatment: there is no completed state to protect, so reverts bubble.
- The bound strategy set MUST be immutable post-creation. Adding or removing strategies on an active commitment is out of scope for this standard.

The manager MUST NOT persist `StrategyBinding.params` — it is delivered once via the creation context and once via the `CommitmentBoundToStrategy` event; strategies persist whatever they need.

`createAndFund(depositAmount, params)` is an atomic deposit-then-create: it credits `depositAmount` of `params.token` to the caller's free balance by the measured-balance-delta rule (§A.2, fee-on-transfer-safe; `depositAmount == 0` degenerates to a plain `createCommitment`), then performs `createCommitment(params)` in the same transaction. It MUST validate `params` **before** pulling any tokens, so a bad-parameter revert never moves funds. Any free balance left over after the encumbrance (e.g. a deposit larger than `params.amount`) stays withdrawable. This closes the deposit→create front-running window and is the recommended single-transaction onboarding path.

`releaseCommitment(id)` MUST be callable only by the commitment's `arbiter`. It MUST run each bound strategy's `onCommitmentReleased` hook under the guarded-call semantics of §D.6 **before** freeing the committer's remaining encumbrance, so strategies can take their final accrual sweep against the still-encumbered position.

`expireCommitment(id)` MUST be callable only by the committer, MUST require `expiresAt != 0 && block.timestamp >= expiresAt`, MUST revert if a forfeit proposal is active, and MUST run the same release-hook sequence as `releaseCommitment`.

**Metadata schema.** This standard does NOT define a normative schema for the off-chain document referenced by `metadataURI`. Deployments MAY adopt a project-specific schema (parties, terms, off-chain reference, semver, application class) and SHOULD publish it alongside their deployment, but MUST NOT assume cross-deployment interoperability of metadata content. Off-chain tooling SHOULD verify `keccak256(fetched_document) == metadataHash` before treating any field as authoritative; without that check, a stale URI or a mutated document is indistinguishable from a fresh one.

#### C.2 Exposure allocation invariant

For each `(user, token)` pair the following MUST hold at all times (INV-3):

```
totalForfeitable ≤ totalEncumbered
where, over all active commitments of that user backed by that token:
  totalEncumbered = Σ commitment.amount
  totalForfeitable  = Σ commitment.amount × maxPenaltyBps / 10_000
```

**Erratum: implied, not enforced by a revert.** Earlier drafts required the invariant to be checked, with a revert, when creating a commitment and when accepting an agreement ([agreements extension](./ERC-COMMITMENTS-AGREEMENTS.md)). That check cannot fail and is no longer required: each lien adds `amount × maxPenaltyBps / 10_000 ≤ amount` of exposure (`maxPenaltyBps ≤ 10_000` is validated first), and every later writer keeps a lien's forfeitable share at most its live amount. The invariant holds by construction. `totalEncumbered` is the ledger's `encumberedBalance` (INV-2), so implementations SHOULD NOT keep a second counter for it; the reference implementation stores only `totalForfeitable` and `getUserExposure` returns it beside the ledger balance, so INV-3 stays observable.

The invariant is automatically maintained when a commitment terminates, and is preserved by validated movements (§D.5) and contributions (§C.6) through the exposure-diff rule (see Rationale).

**Keying.** The invariant is keyed `(user, token)`, not `(user, token, adapter)`. Encumbrance is denominated in raw token units on a per-`(token, user)` ledger; the adapter is read-only pricing metadata and never changes accounting units, so two commitments on the same token under different adapters draw on the same fungible balance and the binding constraint is per-token. Implementations MAY additionally maintain per-`(user, token, adapter)` partitions (a strictly tighter accounting that implies the per-token invariant) but are not required to.

#### C.3 Two-phase forfeit

Forfeiture MUST be a two-phase process:

**Phase 1 — Initiate.** `initiateForfeit(id, penaltyBps)` MUST be callable only by the arbiter. `penaltyBps` MUST NOT exceed the commitment's `maxPenaltyBps`. Multiple concurrent active proposals on the same commitment MUST be rejected (INV-7).

**Phase 2 — Execute.** `executeForfeit(id)` MUST be callable by anyone after `initiatedAt + challengeWindow`. It MUST revert while forfeiture is paused (§A.6). On execution, in this order:

1. Mark the proposal executed and the commitment forfeited; decrement the committer's exposure by the commitment's full contribution.
2. **Forfeit transfer (manager-internal, unconditional):** compute `unitsToForfeit = amount × penaltyBps / 10_000`; move `unitsToForfeit` from the committer's encumbered balance to the **counterparty's free balance** on the ledger. The residual (`amount − unitsToForfeit`) stays encumbered through step 3.
3. Run each bound strategy's `onCommitmentForfeited` hook under the guarded-call semantics of §D.6. Hooks dispose of strategy-side in-flight accrual only; they execute strictly after the forfeit transfer and cannot affect it. Their `FromEncumbered*` movements draw on the still-encumbered residual (§D.4).
4. Return whatever residual the hooks left from the committer's encumbered balance to the committer's free balance.

The forfeit payout is a **ledger credit, not an external transfer** (pull-payment): the counterparty takes possession via the ordinary instant `withdraw` (§A.2). This guarantees `executeForfeit` can never be blocked by the recipient's token-level state (e.g. a blacklisted recipient on a centralized stablecoin), preserving forfeit liveness unconditionally.

**Cancel.** `cancelForfeit(id)` MUST be callable only by the arbiter while the proposal is neither executed nor cancelled.

#### C.4 Stale forfeit proposals

After `initiatedAt + challengeWindow + FORFEIT_PROPOSAL_TTL`, `cancelStaleForfeitProposal(id)` MUST be callable by anyone. This force-cancellation prevents a stuck proposal from indefinitely blocking unbond finalization (§C.5) when the arbiter has lost the ability to either execute or cancel.

#### C.5 Committer-initiated unbond

This subsection is the keystone of the committer-liveness guarantee. Without it, a committer whose arbiter is offline or malicious has no exit path unless `expiresAt` was set at creation time.

A commitment MUST support a committer-initiated unbond:

- **`requestUnbond(id)`** MUST be callable only by the committer on an active commitment with no pending unbond. It MUST set `unbondInitiatedAt[id] = block.timestamp`. It MUST NOT change the ledger, `totalEncumbered`, or `totalForfeitable`. The arbiter MUST retain the right to `initiateForfeit` and `executeForfeit` during the unbond window.
- **`finalizeUnbond(id)`** MUST be callable by anyone after `unbondInitiatedAt[id] + unbondingPeriod()` has elapsed, where `unbondingPeriod()` is a manager-level configuration that MUST be greater than zero. It MUST revert if any forfeit proposal is active. It MUST close the commitment with the same accounting effects as `releaseCommitment` (release hooks per §D.6, then free the remaining encumbrance, then decrement exposure).
- **`cancelUnbond(id)`** MUST be callable only by the committer and zero `unbondInitiatedAt[id]`. The commitment returns to its prior active state.

**Forfeit interaction.** A forfeit proposal whose `initiatedAt + challengeWindow` exceeds `unbondInitiatedAt + unbondingPeriod()` blocks `finalizeUnbond` until the proposal executes, cancels, or is force-cancelled per §C.4. This preserves arbiter authority during the unbond window.

**Stacking.** A committer in unbond MAY create new commitments backed by the same encumbered balance capacity (the encumbrance is still active and the exposure invariant still holds). This is intentional: the unbond is reversible via `cancelUnbond`.

**Three release paths.** With this section, a commitment has three committer-relevant release paths:

| Path | Caller | Latency | Requires |
|---|---|---|---|
| `releaseCommitment` | arbiter | immediate | arbiter cooperation |
| `expireCommitment` | committer | immediate at `expiresAt` | `expiresAt` set at creation |
| `requestUnbond` → `finalizeUnbond` | committer → anyone | `unbondingPeriod()` | none (always available) |

#### C.6 External contributions (OPTIONAL feature)

External contributions are an **OPTIONAL** feature: an implementation need not provide `contributeEncumbered` to be conformant. If it does, the requirements in this subsection are normative for that implementation.

A commitment MAY accept third-party contributions via `contributeEncumbered(commitmentId, units)`. Opt-in semantics: the commitment's committer opts in by being the FIRST contributor (the self-contribution auto-enables the commitment). After opt-in, any caller holding sufficient free balance of the commitment's token MAY contribute, growing the committer's encumbered position under the commitment by `units` and growing the committer's forfeitable exposure proportionally to `maxPenaltyBps`.

Use cases: external sponsorship (a DAO subsidizes underwriter coverage), agentic profit reinvestment (premium denominated as additional coverage on the underwriter's commitment).

Implementation is the manager-internal **attribute encumbrance** ledger operation (§A.3). Conservation: the manager's token balance is unchanged; `totalEncumbered` grows by `units`. Forfeitable updates MUST use the exposure-before/after diff rule (Rationale).

```solidity
function contributeEncumbered(uint256 commitmentId, uint256 units) external;

event ContributionsEnabled(uint256 indexed commitmentId, address indexed committer);
event EncumbranceContributed(uint256 indexed commitmentId, address indexed contributor, address indexed receiver, uint256 units);
```

Errors: `ContributionsDisabled`, `CommitmentInactive`, `ForfeitPending`, `UnbondPending`, `ZeroAmount`.

**Storage discipline.** The contribution-acceptance flag is held in a parallel mapping on the manager's namespaced (EIP-7201) storage, not on the `Commitment` struct. See Rationale §"Storage discipline: parallel mappings, not struct extensions".

#### C.7 Events and errors (Part C, normative)

```solidity
event CommitmentCreated(
    uint256 indexed commitmentId,
    address indexed committer,
    address indexed arbiter,
    address counterparty,
    address token,
    address adapter,
    uint256 amount,
    uint16 maxPenaltyBps,
    uint64 challengeWindow,
    uint64 expiresAt,          // 0 = no expiry; positioned after challengeWindow
    string metadataURI,
    bytes32 metadataHash
);
event CommitmentReleased(uint256 indexed commitmentId, address indexed arbiter);
event CommitmentExpired(uint256 indexed commitmentId, address indexed committer);

event ForfeitInitiated(uint256 indexed commitmentId, uint16 penaltyBps, uint64 challengeWindow);
event ForfeitExecuted(uint256 indexed commitmentId, uint256 unitsForfeited, address indexed counterparty);
event ForfeitCancelled(uint256 indexed commitmentId);
event ForfeitCancelledStale(uint256 indexed commitmentId);

event CommitmentUnbondRequested(uint256 indexed commitmentId, address indexed committer, uint64 maturesAt);
event CommitmentFinalized(uint256 indexed commitmentId);
event CommitmentUnbondCancelled(uint256 indexed commitmentId);

error ZeroArbiter();
error ZeroCounterparty();
error PenaltyExceedsMax();
error TooManyStrategies();
error NotArbiter();
error NotCommitter();
error CommitmentInactive();
error ForfeitPending();
error NoActiveForfeitProposal();
error ChallengeWindowActive();
error ChallengeWindowTooShort();
error MinChallengeWindowBelowFloor();
error CommitmentHasNoExpiry();
error CommitmentNotExpired();
error InvalidExpiry();
error URITooLong();
error UnbondAlreadyRequested();
error UnbondNotElapsed(uint64 maturesAt);
error NoUnbondPending();
error UnbondBlockedByForfeit();
error UnbondPending();          // operation blocked while an unbond is pending (e.g. contribute, settle)
error UseAgreementPath();       // per-leg lifecycle call on an agreement leg (agreements extension §3.1)
error ContributionsDisabled();  // §C.6
```

The full field list and ordering of `CommitmentCreated` are normative: `expiresAt` (positioned after `challengeWindow`) is part of the signature, so an event definition without it computes a **different topic0** and matches no logs from a conformant implementation.

#### C.8 Relayer extensions (RECOMMENDED canonical typehash)

A reference implementation MAY support EIP-712-relayed commitment creation via a `createCommitmentFor(committer, params, deadline, nonce, sig)` entry point and a companion `nonces(committer)` view. The function itself is non-normative; the typehash, however, SHOULD be canonical across deployments to prevent the fragmentation pattern observed in `permit`-shaped extensions (cf. ERC-2612 vs. ERC-4494 typehash drift).

Implementations supporting `createCommitmentFor` SHOULD use:

```
CreateCommitment(address committer,address arbiter,address counterparty,address token,address adapter,uint256 amount,uint16 maxPenaltyBps,uint64 challengeWindow,uint64 expiresAt,bytes32 strategiesHash,string metadataURI,bytes32 metadataHash,uint256 nonce,uint256 deadline)
```

where `strategiesHash = keccak256(abi.encode(params.strategies))`, with the standard EIP-712 domain separator `(name = "Commitments", version = "1", chainId, verifyingContract)`. Deployments that diverge from this typehash MUST publish the divergence in their integration documentation; otherwise relayer code targeting "the canonical Commitments typehash" will silently mis-validate against the divergent deployment.

---

### Part D — Distribution Strategies and Token Movements (normative)

Distribution strategies are the single mechanism for all value flows during a commitment's life: premiums, sponsor-funded rewards, cross-commitment AVS distribution, fees, streams. A strategy computes; the manager validates and executes.

#### D.1 Strategy interface

```solidity
interface IDistributionStrategy {
    /// @notice Manager-only. Strategy initializes any per-commitment state and/or
    ///         registers the commitment as bound. MUST revert if the strategy
    ///         cannot operate against ctx.base.adapter / ctx.base.token (the
    ///         compatibility-refusal mechanism). Reverts abort commitment creation.
    function onCommitmentCreated(CreatedContext calldata ctx) external;

    /// @notice Manager-only; called under §D.6 guarded semantics. Strategy finalizes
    ///         any in-flight accrual when the commitment releases.
    function onCommitmentReleased(LifecycleContext calldata ctx)
        external returns (TokenMovement[] memory);

    /// @notice Manager-only; called under §D.6 guarded semantics, strictly AFTER the
    ///         manager-internal forfeit transfer. Strategy decides what happens to its
    ///         in-flight accrual on forfeit (keep claimable / final sweep / repurpose).
    function onCommitmentForfeited(ForfeitContext calldata ctx)
        external returns (TokenMovement[] memory);

    /// @notice Permissionlessly advance accrual state. Called by the manager from
    ///         manager.distribute(id, strategy); anyone may trigger.
    function distribute(DistributeContext calldata ctx)
        external returns (TokenMovement[] memory);

    /// @notice Caller-validated claim, manager-mediated payout path. `claimData` is
    ///         strategy-specific (empty / merkle proof / signed envelope / reclaim
    ///         flag / ...). Strategies that self-custody reward tokens MAY expose
    ///         their own claim surface and return an empty array here; either way
    ///         the executing contract MUST emit DistributionPaid on payout (§D.7).
    function claim(ClaimContext calldata ctx, bytes calldata claimData)
        external returns (TokenMovement[] memory);

    /// @notice Pending amount claimable by the implied recipient.
    function pending(ClaimContext calldata ctx, bytes calldata claimData)
        external view returns (uint256);
}

struct BaseContext {
    uint256 commitmentId;
    address adapter;
    address token;
    address committer;
    address counterparty;
    uint256 currentEncumbered;   // commitment.amount at call time
    uint64  timestamp;
}

struct CreatedContext    { BaseContext base; uint256 originalAmount; uint16 maxPenaltyBps; uint64 challengeWindow; bytes strategyParams; }
struct DistributeContext { BaseContext base; address caller; }
struct ClaimContext      { BaseContext base; address caller; uint64 closedAt; }   // closedAt = 0 while active
struct LifecycleContext  { BaseContext base; }
struct ForfeitContext      { BaseContext base; uint16 penaltyBps; address forfeitRecipient; uint256 forfeitedUnits; }
```

Strategies hold their own state; the same strategy contract may be bound to one or many commitments. Strategies MAY expose additional interfaces and methods beyond `IDistributionStrategy` (e.g. a standalone claim path for non-commitment-bound earners, admin refund hooks, root submission). Conformance defines the minimum surface, not a maximum.

#### D.2 Movement vocabulary

Strategy-emitted movements use a **closed** vocabulary. Adding kinds requires a manager upgrade — the set below is normative and complete:

```solidity
enum MovementKind {
    FromEncumberedToEscrow,    // accrual: committer.encumbered → strategy escrow
    FromEscrowToExternal,      // payout: strategy escrow → recipient wallet (ERC-20 transfer out)
    FromEscrowToFree,          // payout: strategy escrow → recipient's free balance (ledger credit)
    FromEncumberedToExternal   // direct payout: committer.encumbered → recipient wallet
}

struct TokenMovement {
    MovementKind kind;
    address from;     // committer, or the strategy address as escrow sentinel
    address to;       // recipient
    address token;
    uint256 units;
}
```

Manager-internal lifecycle moves (§A.3) do not go through `TokenMovement` and are not available to strategies.

#### D.3 Manager entry points

```solidity
function distribute(uint256 commitmentId, address strategy) external;
function claim(uint256 commitmentId, address strategy, bytes calldata claimData) external;
function pending(uint256 commitmentId, address strategy, bytes calldata claimData) external view returns (uint256);
```

- `distribute(id, strategy)` MUST be permissionless, MUST revert `UnknownStrategy` if `strategy` is not bound to `id`, MUST revert `ForfeitPending` while a forfeit proposal is active on `id`, and MUST revert `CommitmentInactive` once the commitment is closed. It calls `strategy.distribute(ctx)` and applies the returned movements per §D.5. Reverts (from the strategy or from validation) bubble to the caller — the caller chose the strategy; failure is actionable feedback, not a liveness concern.
- `claim(id, strategy, claimData)` is shaped the same; caller authorization is the strategy's job (the context carries `caller`). Claims MUST remain available after the commitment closes (released or forfeited) so parked accrual is recoverable; `ClaimContext.closedAt` carries the close timestamp (0 while active) so strategies can implement post-close policies.
- Implementations MAY add a `distributeAll(commitmentId)` convenience defined as the fold of `distribute(id, s)` over `strategiesOf(id)` in array order.

**Iteration order.** Wherever multiple bound strategies are processed in one call (lifecycle hooks, `distributeAll`, the agreements extension's pre-settle distribute), the manager MUST iterate in `strategies[]` array order, validating and applying each strategy's movements before calling the next. Deterministic ordering is load-bearing for keepers and indexers.

#### D.4 Per-hook movement-kind matrix

Each call site admits a subset of movement kinds. The manager MUST reject (per §D.5 failure semantics) any movement outside its call site's row:

| Call site | Allowed kinds | Notes |
|---|---|---|
| `onCommitmentCreated` | *(none — hook returns no movements)* | Funding at create is via pre-funded escrow (`fundStrategy`) checked inside the hook |
| `distribute` | `FromEncumberedToEscrow`, `FromEncumberedToExternal` | Accrual against the committer's encumbered position |
| `claim` | `FromEscrowToExternal`, `FromEscrowToFree` | Payouts of previously-escrowed value |
| `onCommitmentReleased` | `FromEncumberedToEscrow`, `FromEscrowToExternal`, `FromEscrowToFree` | One final accrual sweep + optional immediate payouts |
| `onCommitmentForfeited` | `FromEncumberedToEscrow`, `FromEscrowToExternal`, `FromEscrowToFree` | `FromEncumbered*` caps run against the post-forfeit residual (the forfeit transfer has already executed) |

#### D.5 Movement validation pipeline

The manager is the **sole executor** of movements. For every movement a strategy returns, the manager MUST validate ALL of the following before applying, and MUST apply movements of one strategy's batch atomically (all validate, then all apply — see §D.6 for how lifecycle-hook batches fail as a unit):

**Universal rules:**
- The movement's kind is allowed at this call site (§D.4).
- `units > 0`.

**Per-kind allow-list and caps** (binding `c` = the commitment in context, `S` = the strategy the manager just called — taken from the manager's own call frame, never from the movement):

| Kind | `from` MUST be | `to` MUST be | `token` MUST be | Debit | Credit | Cap |
|---|---|---|---|---|---|---|
| `FromEncumberedToEscrow` | `c.committer` | `S` | `c.token` | committer's encumbered | `escrow[S][c.token]` | running total of all `FromEncumbered*` debits in this batch ≤ `c.amount` at call entry (INV-4) |
| `FromEscrowToExternal` | `S` | `c.committer` or `c.counterparty` | any | `escrow[S][token]` | ERC-20 `safeTransfer(to, units)` | escrow balance (INV-5) |
| `FromEscrowToFree` | `S` | `c.committer` or `c.counterparty` | any | `escrow[S][token]` | `freeBalance[token][to]` | escrow balance (INV-5) |
| `FromEncumberedToExternal` | `c.committer` | `c.committer` or `c.counterparty` | `c.token` | committer's encumbered | ERC-20 `safeTransfer(to, units)` | shares the `FromEncumbered*` running cap (INV-4) |

**Exposure-preserving shrink (manager-applied, never strategy-supplied).** For every applied `FromEncumbered*` debit of `units`, the manager itself MUST:

1. `c.amount -= units` (the ledger debit lowers the committer's `encumberedBalance`, the `totalEncumbered` of INV-3, by the same `units`)
2. `totalForfeitable[committer][token] -= (exposure_pre − exposure_post)` where `exposure = (c.amount × c.maxPenaltyBps) / 10_000` computed before and after step 1 (the exposure-diff rule — see Rationale), clamped to the current `totalForfeitable` as defense-in-depth.

Strategies return only `(kind, from, to, token, units)`; they cannot specify, skip, or scale exposure effects. The proportional shrink leaves `maxPenaltyBps / 10_000` constant per commitment, so INV-3 holds across any movement sequence.

**Forfeit-pending guard.** At the **`distribute` call site**, `FromEncumbered*` movements MUST NOT be applied while a forfeit proposal is active on the bound commitment — the encumbered position is spoken for until the proposal resolves, and `distribute` is permissionless, so without the guard anyone could race value out from under a pending forfeit. The reference implementation enforces this at entry: `distribute` reverts `ForfeitPending` (§D.3), the agreements extension's pre-settle distribute skips a leg with a live proposal, and the reentrancy guard stops a proposal appearing mid-call, so no distribute-site batch ever runs against a pending forfeit. The guard is deliberately scoped to the distribute site — it does NOT apply to lifecycle-hook batches. The committer-driven close paths (`expireCommitment`, `finalizeUnbond`) already revert `ForfeitPending` at the entry point before any hook runs; the forfeit-site batch runs strictly after the forfeit transfer against the post-forfeit residual (§D.4); and the arbiter-immediate `releaseCommitment` may run release hooks while the arbiter's own proposal is still pending — that is the arbiter abandoning their own forfeit, which only the arbiter could have executed. The guard is therefore scoped to the distribute site specifically, rather than applied unconditionally over all `FromEncumbered*` movements.

A validation failure in `distribute`/`claim` entry points reverts the transaction with the specific movement-validation error (see the Part D error vocabulary below). A validation failure inside a guarded lifecycle hook fails that strategy's batch per §D.6.

#### D.6 Lifecycle hooks and failure handling

Forfeit and release are the protocol's credibility-bearing transitions; they MUST NOT be vetoable by a strategy. The manager MUST call `onCommitmentForfeited` and `onCommitmentReleased` under **guarded semantics**:

1. **Atomic frame.** The strategy call, the validation of its returned movements, and their application MUST execute in one revertable frame (e.g. an external self-call), so that a strategy that *returns invalid movements* degrades identically to one that *reverts* — nothing from that strategy's batch applies, and the lifecycle transition continues.
2. **Gas cap.** The frame is called with at most `hookGasCap()` gas (≥ `HOOK_GAS_CAP`, §0.3).
3. **Min-gas guard.** Before each guarded call, the manager MUST verify `gasleft()` is sufficient that the frame genuinely receives the full cap under EIP-150's 63/64 forwarding rule (i.e. `gasleft() ≥ cap + cap/63 + reserve`), and MUST revert the **entire transaction** (`InsufficientGasForHook`) otherwise. This makes gas-starvation non-viable: a caller cannot hand-tune gas so that hooks fail while the forfeit lands — they can only fail their own transaction.
4. **Failure disposition — park, don't forfeit.** When a guarded frame reverts (strategy revert, invalid movements, out-of-gas within the cap), the manager MUST emit `StrategyHookFailed(commitmentId, strategy, hookSelector)` and continue with the next strategy and the lifecycle transition. The strategy's in-flight accrual is NOT forfeited and NOT redistributed: whatever sits in `escrow[strategy][token]` stays there, recoverable later through the strategy's own claim/admin surface (the `claim` path remains available post-close, §D.3). A failed hook moves no value to anyone — there is no prize for inducing failure.

Implementations SHOULD additionally expose a permissionless re-drive, `sweepFailedHook(commitmentId, strategy)`, that re-runs a failed lifecycle hook under the same guarded semantics once the underlying cause (e.g. a temporarily bricked dependency) clears.

`onCommitmentCreated` (reverts bubble, §C.1) and the user-initiated `distribute`/`claim` entry points (reverts bubble, §D.3) are NOT guarded — guarding exists to protect completed transitions, and those call sites have none.

#### D.7 Standardized events

The standard mandates two event signatures so indexers see a uniform stream regardless of which contract emits and regardless of whether tokens flowed through manager escrow or a strategy's own balance:

```solidity
/// @notice Emitted by the manager on createCommitment, once per bound strategy.
event CommitmentBoundToStrategy(
    uint256 indexed commitmentId,
    address indexed strategy,
    bytes strategyParams
);

/// @notice MUST be emitted on every payout to a recipient, regardless of execution
///         path. The manager emits it for every applied recipient-crediting movement
///         (FromEscrowToExternal, FromEscrowToFree, FromEncumberedToExternal); a
///         self-custody strategy emits it itself when its own surface pays out.
///         `commitmentId = 0` for cross-commitment or non-commitment-bound payouts.
///         `context` is strategy-defined (merkle rootId, stream id, ...).
event DistributionPaid(
    address indexed strategy,
    address indexed recipient,
    address indexed token,
    uint256 amount,
    uint256 commitmentId,
    bytes32 context
);

/// @notice Emitted when a guarded lifecycle hook fails (§D.6).
event StrategyHookFailed(uint256 indexed commitmentId, address indexed strategy, bytes4 hookSelector);
```

`CommitmentBoundToStrategy` lets indexers build a `strategy → commitments[]` map for attribution. `DistributionPaid` filters identically regardless of emitter. The standard does NOT mandate function signatures for self-custody claim paths — strategies expose whatever shape fits their data (`processClaim(rootId, token, cumulativeAmount, proof)`, `claimStream(streamId)`, ...) — only the event signature is fixed.

Errors (Part D):

```solidity
error UnknownStrategy();
error DuplicateStrategy();          // same strategy bound twice at creation
error InsufficientGasForHook();     // §D.6 min-gas guard
error NoFailedHook();               // sweepFailedHook with nothing to re-drive

// Movement validation (§D.4 / §D.5) — one error per failing branch, so integrators
// and tests can assert the exact rejection reason. There is no catch-all
// `InvalidMovement` error.
error MovementZeroUnits();
error MovementToEscrowNotAllowedOnClaim();
error MovementToExternalOnlyOnDistribute();
error MovementFromEscrowNotOnDistribute();
error MovementFromNotCommitter(address from, address committer);
error MovementWrongToken(address token, address expected);
error MovementEscrowRecipientNotStrategy(address to, address strategy);
error MovementRecipientNotParty(address to);
error MovementExceedsCommitment(uint256 units, uint256 amount);  // INV-4
error MovementFromNotStrategy(address from, address strategy);   // INV-5
```

#### D.8 Custody models

Reward-token custody is the strategy implementer's choice; the manager's custody requirement applies only to **backing** tokens:

| Model | Tokens live in | Atomicity | Typical use |
|---|---|---|---|
| **Manager escrow** | `escrow[strategy][token]` | Manager-validated, partition-invariant-covered | Premium strategies drawing from encumbered backing (escrow is REQUIRED for these — the source is manager-custodied by definition); fee strategies wanting create-time funding guarantees |
| **Self-custody** | the strategy contract | Strategy's own discipline; outside INV-1 scope | Cumulative-merkle distributors, AVS treasuries, existing reward infrastructure |
| **External pull** | a third contract, pulled at claim | Strategy's own discipline | Sablier-style streams, capital-efficient sponsor arrangements |

A self-custody or external-pull strategy returns empty movement arrays from the manager-mediated paths and serves users through its own surface — but MUST still emit `DistributionPaid` (§D.7) so the indexable stream stays uniform.

#### D.9 Worked example — one commitment, one strategy

Parties: **Alice** (committer, holds 1000e18 mUSDC vault shares), **Bob** (counterparty / operator), **Carol** (AVS service; arbiter). The bound strategy is `IndexAppreciationYield` with `yieldShareBps = 1000` (Bob earns 10% of Alice's backing appreciation as commission through manager escrow).

1. **Deposit.** Alice: `manager.deposit(mUSDC, 1000e18)`.
   Ledger: `free[mUSDC][Alice] = 1000e18`.
2. **Create.** Alice creates a commitment: `token = mUSDC`, `adapter = ERC4626Adapter`, `amount = 500e18`, `maxPenaltyBps = 5000`, `challengeWindow = 1 day`, strategies `[{indexYield, abi.encode(uint16(1000))}]`.
   Ledger: `free[Alice] = 500e18`, `encumbered[Alice] = 500e18`. Exposure: `totalEncumbered = 500e18`, `totalForfeitable = 250e18`. `indexYield` stores `{lastIndex: 1.00e18, yieldShareBps: 1000}`. One `CommitmentBoundToStrategy` event is emitted.
3. **Time passes.** mUSDC's index appreciates to `1.04e18`.
4. **Distribute (premium accrual).** Anyone: `manager.distribute(id, indexYield)`. The strategy reads `indexNow = 1.04e18`, computes Bob's commission: `yieldAccrued = 500e18 × 0.04 = 20e18` (underlying), `counterpartyYield = 2e18`, `yieldUnits = 2e18 × 1e18 / 1.04e18 ≈ 1.923e18` backing units. Returns `[FromEncumberedToEscrow(Alice → indexYield, mUSDC, 1.923e18)]`. The manager validates (units ≤ `c.amount` ✓, parties ✓), applies: `encumbered[Alice] = 498.077e18`, `c.amount = 498.077e18`, exposure shrunk by the exposure diff, `escrow[indexYield][mUSDC] = 1.923e18`. The strategy's ledger notes Bob is owed 1.923e18.
5. **Claim (premium).** Bob: `manager.claim(id, indexYield, "")`. Strategy validates `caller == counterparty`, returns `[FromEscrowToExternal(indexYield → Bob, mUSDC, 1.923e18)]`. Manager applies, transfers, and emits `DistributionPaid(indexYield, Bob, mUSDC, 1.923e18, id, 0)`.

Throughout, INV-1 holds for mUSDC inside the manager: `free + encumbered + escrow == balanceOf(manager)` at every step. Alice's remaining 498.077e18 encumbered backing continues appreciating naturally — she retains all yield not explicitly routed.

---

### Reference Strategy Taxonomy

This section catalogs the canonical strategy shapes. **`IndexAppreciationYield` is normative-optional** — yield-share premiums are expected to be the most common strategy shape, and cross-implementation consistency matters there: implementations offering index-appreciation premiums MUST implement them with these semantics. The remaining entries are informative.

#### IndexAppreciationYield (normative-optional; manager-escrow custody)

Routes a configured share of the backing's index appreciation to the counterparty as commission/premium. Per-commitment internal state: `{ lastIndex, yieldShareBps, owed }`.

- **`onCommitmentCreated`**: decode `yieldShareBps` from `strategyParams`; MUST revert if `yieldShareBps > 10_000`. Store `lastIndex = IBackingAdapter(ctx.base.adapter).indexNow(ctx.base.token)`.
- **`distribute`**: with `nowIndex = indexNow(token)`:

  ```
  if nowIndex ≤ lastIndex: return [] (flat or falling index — no-op, no event)
  yieldAccrued     = currentEncumbered × (nowIndex − lastIndex) / 1e18      // in payout-denomination value
  counterpartyYield = yieldAccrued × yieldShareBps / 10_000
  yieldUnits       = counterpartyYield × 1e18 / nowIndex                    // back to backing units
  yieldUnits       = min(yieldUnits, currentEncumbered)
  ```

  Return `[FromEncumberedToEscrow(committer → self, token, yieldUnits)]`; internally `owed += yieldUnits; lastIndex = nowIndex`. The manager's INV-4 cap independently re-enforces the clamp.
- **`claim`**: caller MUST be the counterparty (or the committer on the reclaim path below). Returns `[FromEscrowToExternal(self → counterparty, token, owed)]`; zeroes `owed`-claimable.
- **`onCommitmentReleased`**: one final accrual sweep identical to `distribute` (the manager runs release hooks before freeing encumbrance, §C.1, so the sweep still has an encumbered source). Accrual then waits in escrow for claim.
- **`onCommitmentForfeited`**: previously-escrowed accrual stays claimable by the counterparty. A final sweep against the post-forfeit residual MAY be taken (the §D.4 forfeit row permits it); implementations SHOULD cap the sweep so the counterparty's total of forfeit payout plus accrued premium never exceeds the commitment's pre-forfeit `amount`.
- **Abandonment TTL (RECOMMENDED policy).** If the counterparty has not claimed within 90 days of the commitment closing (`ClaimContext.closedAt`), the strategy SHOULD let the committer reclaim the parked accrual via the `claim` path with a reclaim flag in `claimData`, returning `[FromEscrowToFree(self → committer, token, owed)]`. This bounds the committer's exposure to an abandoned counterparty. The window is strategy-internal policy, not protocol surface.
- **Race against forfeit initiation.** `distribute` deliberately races `initiateForfeit`: anyone MAY advance accrual until a proposal is active (the manager rejects `FromEncumbered*` movements while one is, §D.5), so the counterparty earns appreciation up to forfeit-initiation time. The race is asymmetric in cost — `distribute` is permissionless, `initiateForfeit` is arbiter-only. Auction-style premium settlements that depend on this ordering MUST surface the assumption to integrators rather than treating the race as accidental.

**`yieldShareBps` and `maxPenaltyBps` are independent dimensions.** A commitment MAY combine `yieldShareBps + maxPenaltyBps > 10_000`. Premium accrual draws from realized appreciation, not from original principal; the two contend only at the universal movement cap (INV-4), which binds in the forfeit path but not at creation.

#### FlatFeeAtCreate (informative; self-custody)

A fixed fee paid to the commitment's **counterparty** as a condition of commitment creation. (The §D.5 recipient allow-list restricts manager-mediated payouts to the commitment's parties; a fee to an unrelated third party uses a self-custody strategy shape instead.) Per-commitment state: `{ fee, token, collected, bound }`. Because `onCommitmentCreated` returns no movements (§D.4), the fee is prefunded — but NOT via `fundStrategy`: the manager's escrow is a single per-`(strategy, token)` pot with no funder attribution, so escrow-prefunding a create-time obligation is a first-come pot (a front-runner can bind a fee sized to someone else's prefund and have their counterparty drain it), and escrow debits exist only inside the commitment-scoped, party-only movement pipeline (§D.5), leaving overfunding stranded. Instead the strategy self-custodies and keys credit by committer: the committer (or a sponsor) calls `prefund(committer, token, fee)` beforehand; `onCommitmentCreated` consumes the **committer's own** credit and **reverts the creation otherwise** — a deliberate exercise of the compatibility-refusal path. Unconsumed credit is recoverable via `refundUnallocated(token, amount)`. The counterparty collects via `manager.claim`; the strategy returns an empty movement array, pays from its own balance, and emits `DistributionPaid` itself (§D.7).

#### CounterpartyPremiumStream (informative; self-custody)

A pay-as-you-go premium stream from the commitment's counterparty to its committer. Per-commitment state is `{ ratePerSecond, funded, claimed, token, counterparty, startTime, bound }`, with the counterparty recorded at binding. The counterparty funds the strategy's own balance through `fundPremium`; accrual begins when the strategy is bound, is capped by cumulative funding, and freezes at the manager's recorded `closedAt`. The committer collects through `manager.claim`, while the strategy transfers from its own balance, returns an empty movement array, and emits `DistributionPaid`. After close, the counterparty may recover any unstreamed remainder through `reclaimUnstreamed`. This direction cannot use a manager-sourced `TokenMovement` because the movement vocabulary never debits the counterparty.

#### Node-local mesh reward accumulators (informative; not distribution strategies)

The shipped `FanOutNode` and `TokenWeighting` implementations maintain Synthetix-style per-token reward indices over their own stakers. They self-custody reward tokens and expose node-local claim surfaces described by the [mesh extension](./ERC-COMMITMENTS-MESH.md) §3. They do not implement `IDistributionStrategy`, are not bound to commitments, and never enter the manager's movement pipeline.

---

## Rationale

### Direct custody, not an encumbered vault

The natural alternative — a purpose-built encumbered ERC-4626 vault as Part A — was considered and rejected. A vault forces every position through one custody shape and one yield venue, and the protective machinery it requires — inflation-attack offsets, withdrawal-queue NAV snapshotting, donation-surface defenses — exists only to defend share-price accounting that direct custody never performs. Under direct custody, external yield venues are reached by depositing their share tokens as backing: capital never leaves Morpho/Yearn/the venue, the adoption-friction problem becomes a no-op, and the auditable custody surface shrinks to one contract whose solvency claim is raw-token conservation (INV-1) rather than NAV integrity.

### Backing units, not underlying assets

Commitment amounts are denominated in raw backing-token units. When the backing is an appreciating receipt (vault share, LST), the collateral backing a commitment appreciates without rebalancing — the property that makes vault shares good collateral, generalized to any appreciating token via its adapter's index.

### Adapters are stateless views

Everything the protocol needs to know about a backing token's venue, beyond the ledger the manager owns itself, is one number: a value-per-unit index (for an ERC-4626 share, `convertToAssets(1e18)`). `IBackingAdapter.indexNow` is that number, abstracted per token category. Making the adapter stateless and view-only means adapter deployment is permissionless and adapter risk is informational, not custodial — the worst an adapter can do is feed a strategy bad numbers, and the movement caps bound what bad numbers can move (INV-4).

### `payoutDenomination` is metadata only

An unwrap-on-payout path was considered and rejected for v1: it would couple `executeForfeit` to a third-party venue's redemption liveness and liquidity at the worst possible moment, and it would put venue-specific redemption code inside the custody root. Raw-unit delivery keeps forfeit execution dependent on nothing external; the metadata view preserves the UX benefit (UIs can price units) at zero protocol risk. Unwrap semantics remain available as a future extension adapter surface.

### Strategies emit movements; the manager is the sole executor

This is the blast-radius design. A buggy or malicious strategy can compute wrong amounts or corrupt its own state, but it cannot drain another strategy's escrow, cannot touch a stranger's balance, cannot break the partition invariant, and cannot bypass the forfeit state machine — every movement is validated against the per-strategy allow-list and the bound commitment's parties before applying. The risk profile is deliberately comparable to Morpho Blue's core: blast radius concentrated in a single core contract, surrounded by view-only or state-isolated plugins.

### Movement caps are the consent boundary

The thing to defend is simple to state: encumbered value must never leave faster than the committer consented to. With value flows generalized behind strategies, the defense is a single rule rather than per-mechanism guards: `FromEncumbered*` movements may only debit the bound commitment's committer, capped at that commitment's live `amount`, with the manager applying the exposure-preserving shrink itself (INV-4). A fully malicious `(adapter, strategy)` pair can at worst accelerate the transfer of value the committer already put at stake under that one commitment — never amounts beyond it, never to parties outside it, never anyone else's balance. That worst case is precisely what the committer consented to by binding them.

### Hybrid hook-failure handling

Forfeit and release must never depend on strategy cooperation: an honest deployment can still hit environmental reverts (a blacklisted address inside a strategy's refund path, a paused dependency), and a cross-commitment strategy with a bricked dependency must not block forfeites across every commitment bound to it. Hence guarded hooks. The two classic objections to try/catch are answered structurally: (a) **gas-starvation** — under EIP-150 a caller could otherwise hand-tune gas so hooks starve while the forfeit lands; the min-gas guard makes under-provisioned transactions revert entirely instead. (b) **forfeit-as-prize** — if hook failure forfeited accrual, inducing failure would be profitable; parking the accrual in the strategy's own escrow (recoverable through its surface) means a forced failure moves value to no one. The forfeit transfer itself executes before any hook and is pure ledger arithmetic — unconditional by construction.

### Instant free-balance withdrawal; manager unbonding period; pull-payment forfeit payout

Three custody-layer decisions, one principle — delays belong where forfeit surface exists. (a) Free balance backs nothing, so delaying its withdrawal protects nobody and just pushes users to just-in-time deposits. (b) The commitment-level unbond carries a mandatory period (`unbondingPeriod()`, manager-configured, > 0) because that delay IS the arbiter's enforcement window. (c) Forfeit payouts credit the recipient's free balance rather than transferring out, so a recipient whose address is frozen at the token contract cannot brick `executeForfeit`; the challenge window has already elapsed publicly, so no second delay is warranted.

### Exposure keyed `(committer, token)`

Encumbrance is raw token units in a per-`(token, user)` ledger; forfeit arithmetic is token-unit arithmetic; the adapter never changes units. Keying exposure per-adapter would fragment the ledger without changing any enforceable quantity — two same-token commitments under different adapters draw on the same fungible balance, so per-token is the binding constraint. Finer per-adapter partitions imply the per-token invariant and remain a valid implementer option.

### Bounded strategy set, ids from 1

`MAX_STRATEGIES` exists because forfeit/release iterate every bound strategy under the gas-cap regime: an unbounded list makes the min-gas guard demand unbounded gas, converting the guard itself into a forfeit-liveness DoS. Ids start at 1 because `DistributionPaid.commitmentId = 0` is the standardized non-attribution sentinel; a real commitment at id 0 would alias it and corrupt every consumer of the uniform event stream.

### Single-strategy distribute, array-order iteration

`distribute(id, strategy)` is single-strategy so keepers can advance one accrual cheaply; `distributeAll` is a trivial optional fold. All multi-strategy processing is fixed to `strategies[]` array order with apply-before-next semantics — determinism that keepers and indexers can rely on, and that makes the guarded-hook failure unit (one strategy's whole batch) well-defined.

### Adapter compatibility by revert

A strategy that cannot serve a `(adapter, token)` pair refuses at `onCommitmentCreated`, aborting creation atomically. A discoverability view (`supports(adapter, token)`) is friendlier but adds interface surface for an off-chain-solvable problem; it remains a candidate for a future revision.

### Relationship to `ERC-COMMITMENTS-REWARDS`

The rewards coordinator is an independent sibling standard, not a Part of this one: it never reads commitment state, is never called by the manager, does not implement `IDistributionStrategy`, and serves non-commitment earners equally well. The two standards share the `DistributionPaid` event signature so indexers can consume a uniform payout vocabulary. That event compatibility is not a strategy binding or a normative dependency.

### Two-phase forfeit with challenge window

A single-transaction forfeit enables flash-forfeit attacks where an arbiter initiates and executes in one block, giving the committer no time to respond. The two-phase mechanism with a mandatory challenge window (`MIN_CHALLENGE_WINDOW = 1 day`) provides dispute opportunity, an on-chain record (`ForfeitInitiated`), and composability — external protocols can monitor and take protective action before execution.

### Committer-initiated unbond

The committer-initiated unbond (§C.5) is a keystone without precedent in EigenLayer / Symbiotic / Karak. Its purpose is committer-liveness: a commitment MUST NOT lock backing indefinitely on the basis of an arbiter that has gone offline, lost keys, or turned malicious. The two-step lifecycle makes the exit path observable on-chain, retains arbiter authority during the window, and bounds worst-case lock time even against a stuck proposal (§C.4).

### Arbiter abstraction

The arbiter is any Ethereum address. The contract only checks `msg.sender == arbiter` — it makes no assumptions about what the arbiter is. This supports operator services, DAO governance, Kleros, multisigs, oracles, and ZK proof verifiers.

### Exposure allocation

Without exposure allocation, a committer with 1000 units could create two commitments of 1000 units each at 100% forfeiture — promising 2000 units of capacity from 1000 units of capital. The invariant prevents this without forcing 1-to-1: a committer with 1100 encumbered units could hold Commitment A (600 units, 50% max) and Commitment B (500 units, 40% max) for a total exposure of 500 ≤ 1100 — capital-efficient when commitments do not all max-forfeit.

### Exposure-before/after diff for INV-3

When any operation shifts `commitment.amount` (validated movements, bilateral settlement, contributions), the user's `totalForfeitable` must update to match. The naive update — `(units × maxPenaltyBps) / 10_000` — uses integer truncation that drifts by 1 wei on odd values; after many operations, terminal closure would compute a different decrement and INV-3 could violate by accumulated dust. The protocol-level rule: compute `exposure(post) − exposure(pre)` per commitment, never recompute from `units` directly. The contribution to `totalForfeitable` from any commitment then equals `(c.amount × c.maxPenaltyBps) / 10_000` exactly, at every instant.

### Family of standards

This document carries the core (custody, adapters, commitments, strategies). Agreements, mesh topology, and merkle rewards live in sibling documents because each is independently adoptable, independently auditable, and none is required for core conformance. This matches the modularity precedent of ERC-4337.

### Why no protocol-level escalation primitive

The arbiter abstraction plus the composition surface in the Composition Patterns appendix covers four of the five shapes that motivate an escalation primitive: subjective faults, arbiter capture, arbiter offline, and meta-arbiter consensus. Each is addressed by an integrator-defined contract that the commitment names as its `arbiter` — multi-sig, hybrid router, optimistic with veto window, deadman / fallback, K-of-M aggregator. The fifth shape — forking-style adjudication of policy legitimacy itself (the bEIGEN motivation) — this standard does not address: it would require either a protocol token (rejected — commitments is asset-agnostic) or ledger-forking semantics whose surface area and audit cost are disproportionate to the rare cases where forking is the only acceptable answer. This is a deliberate scope choice, not a gap.

### Activation-delay pattern for mutable parameters

§0.6 establishes the `pendingX` + `effectiveAt` shape as the recommended pattern for any future mutable parameter. The motivation is the same as the two-phase forfeit: a state transition that affects existing positions should be observable on-chain *before* it lands. Permissionless activation makes landing deterministic against the delay clock rather than the authority's liveness; the no-backdoor rule keeps staged state predictive of live state; the recommended (rather than required) status lets implementations adopt it incrementally.

### Storage discipline: parallel mappings, not struct extensions

Optional-extension state (the contribution flag, settlement caps in the agreements extension) lives in append-only parallel mappings on the manager's namespaced storage, not as fields on core structs. Extending structs in namespaced storage is a known wrong-slot risk class under EIP-7201; mappings are layout-safe to append, and storage cost is paid only by positions that opt into the extension.

### EIP-7201 namespaced storage

All upgradeable contracts use [EIP-7201](https://eips.ethereum.org/EIPS/eip-7201) namespaced storage. This prevents storage slot collisions during upgrades and allows safe composition of multiple inheritance chains. New storage fields MUST be appended to the end of the layout struct, and implementations MUST ship slot-derivation regression tests.

---

## Backwards Compatibility

This is a new standard; no backwards compatibility issues arise. It requires no changes to existing token contracts: ERC-20 tokens and ERC-4626 vaults serve as backing as-is, described by stateless adapters, with no migration of the underlying capital.

---

## Test Cases

The reference implementation ships a conformance harness exercising INV-1 through INV-10 across deposit, encumber, forfeit, unbond, expire, fund, distribute, claim, contribute, and hook-failure scenarios. In the reference repository the suites live at `test/manager/conformance/` (the partition/exposure invariant fuzz, INV-1..INV-10) and `test/conformance/` (cross-cutting suites, including the rewards-coordinator invariants), with per-subsystem conformance directories under `test/mesh/`, `test/registry/`, and `test/services/`.

The minimal worked example below illustrates the exposure allocation invariant (INV-3) and the ledger-consistency invariant (INV-2). The two-strategy lifecycle walkthrough is §D.9; the hook-failure walkthrough is in Security Considerations.

**Worked example — exposure allocation (INV-3)**

Setup: Alice deposits 1000 units of token T into the manager. `free[T][Alice] = 1000`, `encumbered[T][Alice] = 0`.

1. Alice creates Commitment A with `amount = 600`, `maxPenaltyBps = 5000` (50%).
   - `encumbered[T][Alice] = 600`, `free = 400`
   - `totalEncumbered(Alice, T) = 600`
   - `totalForfeitable(Alice, T) = 600 × 5000 / 10_000 = 300`
   - INV-3 holds: `300 ≤ 600`. INV-2 holds: `encumbered == Σ amounts = 600`.

2. Alice creates Commitment B with `amount = 400`, `maxPenaltyBps = 4000` (40%).
   - `encumbered[T][Alice] = 1000`, `free = 0`
   - `totalEncumbered = 1000`, `totalForfeitable = 300 + 160 = 460`
   - INV-3 holds: `460 ≤ 1000`.

3. Alice attempts a third commitment with any non-zero `amount`. The encumber operation reverts `InsufficientFreeBalance`.

4. Alice's arbiter releases Commitment A.
   - `encumbered -= 600 → 400`, `free += 600 → 600`
   - `totalEncumbered → 400`, `totalForfeitable → 160`
   - INV-3 still holds: `160 ≤ 400`. INV-1 held throughout: the manager's balance of T never changed.

---

## Reference Implementation

A reference implementation ships in the Commitments Protocol repository (the repository this document lives in). The shipped layout:

```
src/
├── core/
│   ├── interfaces/                     (ICommitmentManager, IBackingAdapter,
│   │                                    IDistributionStrategy)
│   └── manager/
│       ├── CommitmentManager.sol       (Parts A, C, D dispatch shell: custody root)
│       ├── storage/                    (EIP-7201 manager storage)
│       └── libraries/                  (ledger, exposure, lifecycle, movement, pause)
├── backing/
│   ├── ERC20StaticAdapter.sol          (Part B)
│   └── ERC4626Adapter.sol              (Part B)
├── distributions/
│   ├── StrategyBase.sol                (shared manager gate, errors, no-op hooks)
│   ├── IndexAppreciationYield.sol      (taxonomy: premium / commission)
│   ├── FlatFeeAtCreate.sol             (taxonomy: create-time fee)
│   └── CounterpartyPremiumStream.sol   (taxonomy: time-based premium stream)
└── extensions/
    ├── agreements/AgreementLib.sol     (agreement delegatecall library)
    ├── mutuals/MutualLib.sol           (mutual delegatecall library)
    ├── mesh/                           (mesh nodes and MeshFactory)
    ├── services/                       (operator registry and service manager)
    └── rewards/                        (standalone cumulative-merkle rewards; not Part D)
```

### Reference extensions (non-normative)

| Extension | Purpose |
|---|---|
| `createCommitmentFor(committer, params, deadline, nonce, sig)` | EIP-712 relayer pattern; canonical typehash per §C.8. |
| `nonces(committer)` | View companion to `createCommitmentFor`. |
| `distributeAll(commitmentId)` | Array-order fold of `distribute` over the bound strategies (§D.3). |
| `sweepFailedHook(commitmentId, strategy)` | Permissionless re-drive of a failed lifecycle hook (§D.6). |
| `setOperatorRegistry(address)` | Admin wiring of registry callbacks ([services extension](./ERC-COMMITMENTS-SERVICES.md) §2.4). |

---

## Security Considerations

### Reentrancy

All state-changing functions MUST use a reentrancy guard, and all strategy hooks and movement application execute under the manager's lock (§A.7). A strategy hook that calls back into a mutating manager entry point hits the lock; in guarded lifecycle hooks this degrades to hook failure (accrual parked), never partial state. Reference implementations use OpenZeppelin's `ReentrancyGuardTransient` (EIP-1153).

### Malicious or manipulated adapter

`indexNow` is an untrusted input: an adapter can lie, and an honest `ERC4626Adapter` can be fed a manipulated index by donation-pumping a thin external vault. The defense is NOT adapter vetting (that is the parties' job at creation) but the movement-cap pipeline (§D.5 / INV-4): whatever a strategy computes from a poisoned index, the applied movements only debit the bound commitment's committer, only up to that commitment's live `amount`, only toward that commitment's parties. The worst case of a fully malicious `(adapter, strategy)` pair equals the commitment's own encumbrance — the amount its committer consented to risk. Counterparties SHOULD nonetheless prefer adapters reading deep, established venues, since a manipulated index can still *accelerate* consented flows (e.g. prematurely maxing out a premium).

### Malicious strategy (blast radius)

A strategy can corrupt its own state, mis-compute amounts within its caps, refuse claims on its own surface, or revert in hooks. It cannot: touch another strategy's escrow (INV-5), debit any user other than the bound commitment's committer (§D.5), break the partition invariant (movements are conservation-checked applications), block forfeit or release (§D.6), or move anything during creation (§D.4). Users evaluate strategies at bind time exactly as they evaluate arbiters; the protocol's job is bounding the damage when that evaluation is wrong.

### Gas starvation of lifecycle hooks

Without the min-gas guard, an attacker could call `executeForfeit` with gas tuned so that (under EIP-150's 63/64 rule) each hook frame starves while the outer transaction completes — weaponizing the failure path. The §D.6 guard (`gasleft() ≥ cap + cap/63 + reserve` before each guarded call, else revert the whole transaction) removes the asymmetry: under-provisioned calls fail entirely, and a properly-provisioned call gives every hook its full cap. Conformance suites MUST include a crafted-gas test asserting the all-or-nothing property.

### Parked-accrual griefing

Hook failure parks accrual in the failing strategy's escrow rather than forfeiting it. The residual risk is *delay*, not loss: a strategy whose claim surface is also broken strands its own escrow until repaired or re-driven (`sweepFailedHook`). Since parked funds move to no one, inducing failure has no payoff; the griefing surface is bounded by the victim's own choice of strategy. Strategy authors SHOULD keep `claim` paths maximally simple (no external dependencies) even when lifecycle hooks have them.

### Fee-on-transfer and rebasing backing tokens

Rebasing tokens break INV-1 structurally and MUST be rejected (§A.2). Fee-on-transfer tokens are survivable at deposit (measured-delta crediting) but deliver short on every outbound transfer; deployments SHOULD screen them out. The conformance suite SHOULD include a fee-on-transfer mock asserting the deposit path credits the measured delta.

### Sentinel commitment id

`DistributionPaid.commitmentId = 0` means "no per-commitment attribution." Implementations MUST NOT assign id 0 to a real commitment (INV-10); indexers MUST NOT treat id-0 events as commitment-bound.

### Forfeit payout is a ledger credit

`executeForfeit` credits the counterparty's free balance instead of transferring out (§C.3), so token-level recipient state (blacklists, transfer hooks) cannot block execution. The counterparty's withdrawal can still fail at the token layer — that failure is theirs to resolve and does not affect protocol state.

### Challenge window timing

`challengeWindow < MIN_CHALLENGE_WINDOW` MUST be rejected. Implementers MAY raise the floor for higher-stakes deployments; they MUST NOT expose a production path that lowers the enforced floor below `MIN_CHALLENGE_WINDOW`. The reference implementation's `setMinChallengeWindow` rejects every value below one day, zero included.

### Stale forfeit proposals

A stuck forfeit proposal blocks `finalizeUnbond` until either side acts. The `FORFEIT_PROPOSAL_TTL` cap on stale proposals (§C.4) bounds committer exposure.

### Exposure allocation violation

A violation of `totalForfeitable ≤ totalEncumbered` would allow over-promising. It holds by construction rather than by a revert (§C.2 erratum): `maxPenaltyBps ≤ 10_000` MUST be validated on every `createCommitment` and agreement leg, and every amount change MUST use the exposure-diff rule.

### Circuit breaker role separation

Separate `PAUSER_ROLE` and `UNPAUSER_ROLE` prevent a single compromised key from both pausing and refusing to unpause.

---

## Invariants

A conformant implementation MUST maintain the following invariants at all times:

| # | Invariant | Statement |
|---|---|---|
| **INV-1** | Partition | Per manager-custodied token T: `Σ_users (free + encumbered) + Σ_strategies escrow == IERC20(T).balanceOf(manager)` |
| **INV-2** | Ledger consistency | Per `(user, token)`: `encumberedBalance == Σ commitment.amount` over that user's active commitments backed by that token |
| **INV-3** | Exposure | Per `(user, token)`: `Σ amount × maxPenaltyBps / 10_000 ≤ Σ amount` over active commitments |
| **INV-4** | Movement cap | Every applied `FromEncumbered*` movement debits only the bound commitment's committer, in the commitment's token, with the batch's running debit total ≤ the commitment's `amount` at call entry; the manager applies the exposure-preserving shrink itself (§D.5) |
| **INV-5** | Escrow isolation | `FromEscrow*` movements debit only the emitting strategy's own escrow; escrow balances never go negative; no movement credits one strategy's escrow from another's |
| **INV-6** | Terminal state | Per commitment: `¬(released ∧ forfeited)` |
| **INV-7** | Single forfeit | Per commitment: at most one `(¬cancelled ∧ ¬executed)` `ForfeitProposal` exists |
| **INV-8** | Single unbond | Per commitment: at most one pending unbond between create and finalize |
| **INV-9** | Bounded strategy set | Per commitment: `strategiesOf(id).length ≤ MAX_STRATEGIES`, immutable post-create |
| **INV-10** | Id floor | Every created commitment has `commitmentId ≥ 1`; `0` is reserved as the `DistributionPaid` sentinel |

Extensions define additional invariants in their own documents (e.g. INV-E1/INV-E2 in the [agreements extension](./ERC-COMMITMENTS-AGREEMENTS.md)).

---

## Conformance Harness

Reference implementations SHOULD ship a `test/conformance/` suite that exercises INV-1 through INV-10 against any address implementing Parts A–D. The harness consumes interface addresses (manager, adapters, strategies) and verifies the invariants across a representative scenario set: deposit, withdraw, encumber, forfeit, unbond, expire, fund-strategy, distribute, claim, contribute, hook failure (with reverting / gas-guzzling / invalid-movement / reentrant strategy mocks), and the crafted-gas starvation case. The partition invariant (INV-1) SHOULD be asserted by a handler-driven fuzz over the full operation set.

---

## Composition Patterns

Several recurring application patterns are expressible by composing the primitives in this standard family, without protocol-level extensions. The reference repository's `docs/protocol/use-cases/` directory carries worked-out implementations.

| Pattern | Composition | Protocol additions required |
|---|---|---|
| **Cross-venue underwriting (insurance)** | Two commitments under one shared arbiter on two backing tokens: a forfeit-side commitment on the collateral backing (underwriter → beneficiary), and a premium-side commitment with an `IndexAppreciationYield` strategy routing the insured side's appreciation to the underwriter. Forfeit proceeds are delivered as raw backing units of the collateral token; recovery into the insured venue is the beneficiary's deposit on that venue's own surface. | None. |
| **Mutual aid pool** | Bilateral agreement with non-zero per-direction settlement caps. The shared arbiter routes value to whichever member experiences a covered event via `settleAgreement`. Terminal breach is the standard forfeit path. | [Agreements extension](./ERC-COMMITMENTS-AGREEMENTS.md) §5. |
| **Two-party tranche (junior + senior)** | Bilateral agreement where the junior posts as proposer with full forfeitable exposure, the senior posts as acceptor with zero forfeitable exposure, and the junior pays the senior a periodic coupon via `settleAgreement`. Lifetime cap bounds total coupon; terminal loss forfeites junior to senior. | Agreements extension §5. |
| **Sponsored operator rewards** | A standalone [`CommitmentsRewardsCoordinator`](./ERC-COMMITMENTS-REWARDS.md) holds service-funded reward tokens; operators and delegators claim cumulative entitlements computed off-chain. The coordinator is not bound to commitments and does not implement `IDistributionStrategy`. | Rewards sibling standard; no Core protocol addition. |
| **Premium-share donation** | Single commitment with `maxPenaltyBps = 0` and an `IndexAppreciationYield` binding with `yieldShareBps > 0`. Committer's principal stays theirs; only a fraction of appreciation routes to the counterparty. Committer can exit at any time. | None. |
| **Operator delegation** | Operator self-stake commitment with the registry as counterparty; delegator commitments to the registry naming the operator. Voting power composed via `FanIn → TokenWeighting`. | [Services extension](./ERC-COMMITMENTS-SERVICES.md) (registry + service manager); [mesh extension](./ERC-COMMITMENTS-MESH.md) (voting-power composition). |
| **Escalation patterns** (when a single arbiter is not trustworthy enough) | The commitment names a contract as `arbiter`; that contract internally orchestrates one of: (a) **multi-sig arbiter** — Safe / DAO with N-of-M signers; (b) **hybrid router** — parametric fast path with committee slow path; (c) **optimistic with veto window** — parametric arbiter proposes, designated escalation arbiter can cancel-and-replace within a window; (d) **deadman / fallback arbiter** — time-based handoff to a secondary arbiter if the primary doesn't act within window W; (e) **meta-arbiter aggregator** — K-of-M consensus across independent arbiters before forfeiture. | None. The protocol enforces only `msg.sender == commitment.arbiter`. See Rationale §"Why no protocol-level escalation primitive". |

Patterns that are *not* expressible by composition — and that this standard explicitly defers as future work — include atomic cross-token enforcement (forfeit on one backing and credit on another in the same transaction with bilateral revert), strategy mutability on active commitments (add/remove post-create), NFT-shaped backings (`uint256 units` does not fit), and unwrap-on-payout adapter semantics.

---

## Copyright

Copyright and related rights waived via [CC0](../../LICENSE).
