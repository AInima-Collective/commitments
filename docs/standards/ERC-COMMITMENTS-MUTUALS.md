---
eip: XXXX
title: Commitments - Mutuals
description: A shared-loss-index primitive that decouples custody from attribution, socializing one validated loss across a set of individually-custodied commitments, as an extension to ERC-COMMITMENTS.
author: Jake Hartnell (@jakehartnell)
discussions-to: https://ethereum-magicians.org/t/<TBD>
status: draft
type: Standards Track
category: ERC
created: 2026-06-21
requires: ERC-COMMITMENTS
---

> **Concept:** a *Mutual* — the `Mutual` primitive (a shared-loss index over a set of
> independently-custodied commitments). This sibling standard belongs to the Commitments
> standard family; its family name is **`ERC-COMMITMENTS-MUTUALS`** and it is listed as a
> normative-optional sibling in the core standard's §0.4 conformance table.
>
> **Core-lifecycle gating:** per the core's extension-gating rule (core §0.4), a member
> commitment's core per-commitment lifecycle entry points (release / expire / unbond /
> forfeit initiation) revert `CommitmentInMutual`; members exit exclusively via
> `requestMutualExit` → `releaseMutualMember` (deallocation window), and losses arrive
> exclusively through the mutual's own two-phase loss path, whose challenge-window floor
> (`MUTUAL_MIN_CHALLENGE_WINDOW`) is deliberately longer than the per-commitment floor.

## Abstract

This ERC extends [`ERC-COMMITMENTS`](./ERC-COMMITMENTS.md) with a **mutual**: a
manager-level accounting overlay under which a single validated loss is socialized — in one
`O(1)` write — across an arbitrary set of independent, individually-custodied member
commitments, and each member then settles its proportionate share of its **own** collateral
lazily and permissionlessly.

The thesis is the **decoupling of custody from attribution**. The core standard's custody
ledger is unchanged: every member's backing stays in its own `(token, committer)` encumbered
position, in whatever heterogeneous, exogenous collateral the member chose (USDC, ETH, a
yield-bearing vault share). What a mutual adds is a single shared **loss index**
`Lambda` (stored as `cumulativeLoss`, a 1e18-scaled fraction). A declared loss `L` does not
move, pool, or centralize any tokens; it **rebases attribution** by bumping `Lambda` once.
Each member subsequently owes `forfeitableUnits_i * (Lambda - lossSnapshot_i) / 1e18` **raw
units of its own token** — a dimensionless fraction of its own frozen allotment — settled
into the mutual's beneficiary through the *existing* balance-conserving
`LedgerLib.forfeitTransfer`. Because the loss is a fraction and not a numeraire amount,
heterogeneous collateral needs **no settlement-time oracle**.

Economically this is **Lloyd's several liability with a shared loss ratio**: each member is
liable only for its proportionate share, and the mutual's loss ratio is applied *severally*
to each member's own collateral. The motivating product is commitment-backed risk coverage
where collateral exogeneity (capital uncorrelated with the insured peril) must be preserved —
a property a custodied homogeneous pool destroys but a synthetic index keeps. The
per-commitment two-phase forfeit of the core standard is the **size-1 special case** of a
mutual at the full-penalty corner, related by *shared low-level helpers*, not by a refactor of
the core single-commitment path.

The key words "MUST", "MUST NOT", "REQUIRED", "SHALL", "SHALL NOT", "SHOULD", "SHOULD NOT",
"RECOMMENDED", "MAY", and "OPTIONAL" in this document are to be interpreted as described in
RFC 2119 and RFC 8174.

Terms not defined here — **committer**, **arbiter**, **counterparty**, **backing token**,
**backing adapter**, **encumbered balance**, **free balance**, **distribution strategy**,
**`StrategyBinding`**, **exposure allocation**, **two-phase forfeit**, **challenge window**,
**unbond** — are defined in the core standard. Agreement-specific lifecycle behavior is
interoperability guidance, not a Mutuals conformance dependency. The manager
referenced throughout is an `ERC-COMMITMENTS` Part A/C conformant commitment manager. The
reference manager also implements Part D, but Mutual membership forbids strategy bindings and
does not depend on strategy execution.

### Conformance

| Extension | Status | Depends on |
|---|---|---|
| **Mutuals — loss core** (§1–§5) | normative-optional | `ERC-COMMITMENTS` Parts A, C |
| **Homogeneous-numeraire mode** (`valuationAuthority == 0`) | normative-optional, oracle-free subset | §1–§5 |
| **Premium index** (§6) | normative-optional | §1–§5 |
| **Attested heterogeneous mode + junior absorber** (§7, `bandAdapter != 0`) | normative-optional | §1–§6 plus §8 trust model |
| **Trust and dispute model** (§8) | normative for attested mode | §1–§7 |
| **Periphery** (§9) | informative reference | §1–§7 |

An implementation MAY claim mutual conformance in homogeneous mode only, and MAY ship the
premium index (§6) independently of heterogeneous mode. Attested mode REQUIRES the §8 trust
constraints. The periphery contracts of §9 are reference compositions, not part of the
normative custody-root surface.

---

## 1. Storage

A conforming manager appends **nine** top-level fields to its EIP-7201 namespaced `Layout`
struct, at field **offsets 29..37**, after the Part D `forfeitedUnits` mapping (offset 28), in
three append-only groups: the **loss core** (offsets 29..32), the **premium reserve**
(offsets 33..34), and the **junior shortfall absorber** (offsets 35..37). The append is
**strictly additive**: no existing field is reordered, re-typed, or removed. The core
`Commitment` struct and its `getCommitment` ABI tuple MUST NOT be widened — mutual state lives
in *sibling mappings keyed by `commitmentId` / `mutualId`*, the same discipline used by
`unbondInitiatedAt`, `closedAt`, and `forfeitedUnits`. The layout is append-only, and
implementations MUST extend their storage-slot offset test
(`test/manager/StorageSlots.t.sol`) with probes for all **nine** new fields so any layout
drift fails loudly.

```solidity
// === Shared-loss mutuals — loss core (append-only; offsets 29..32) ===
mapping(uint256 => Mutual)             mutuals;             // mutualId => header
mapping(uint256 => Membership)         membership;          // commitmentId => membership (sparse)
uint256                                nextMutualId;        // 1-indexed; 0 == not-a-member sentinel
mapping(uint256 => MutualLossProposal) mutualLossProposals; // mutualId => pending two-phase loss

// === Premium reserve — the FOURTH partition compartment (append-only; offsets 33..34) ===
mapping(uint256 => uint256) mutualPremiumPool;   // mutualId => premium reserve (funded − claimed)
mapping(address => uint256) totalMutualPremium;  // numeraire => Σ mutualPremiumPool (O(1) INV-P1 aggregate)

// === Junior shortfall absorber — the FIFTH partition compartment (append-only; offsets 35..37) ===
mapping(uint256 => uint256)                    mutualJuniorPool;  // mutualId => junior reserve (funded − drawn)
mapping(address => uint256)                    totalMutualJunior; // numeraire => Σ mutualJuniorPool (O(1) INV-P13 aggregate)
mapping(uint256 => mapping(address => uint64)) mutualHaircutBps;  // mutualId => collateral => haircut bps (immutable)
```

The premium reserve (`mutualPremiumPool` / `totalMutualPremium`) and the junior absorber
(`mutualJuniorPool` / `totalMutualJunior`) are **genuine partition compartments**, not free-
floating balances: each is `funded − claimed` (resp. `funded − drawn`) numeraire per mutual,
tracked by a per-token aggregate so the extended `O(1)` partition check stays closed. The
premium reserve extends the core INV-1 partition to **INV-P1**
(`totalFree + totalEncumbered + totalEscrow + totalMutualPremium == balanceOf`) and the junior
reserve extends it once more to **INV-P13** (adding `+ totalMutualJunior`). Both compartments
are mutated **only** through dedicated `LedgerLib` helper pairs (`freeToMutualPremium` /
`mutualPremiumToFree` and `freeToMutualJunior` / `mutualJuniorToFree`, INV-P0) so INV-P1/P13
hold on the manager's *actual* token balance. See the premium index (§6) and the
heterogeneous-mode junior absorber (§7) for the normative mechanics.

`nextMutualId` is lazily initialized to `1` on first `createMutual`; mutual id `0` is reserved as
the `Membership.mutualId` "not-a-member" sentinel. `membership` is sparse: a zero
`mutualId` means the commitment is not a member.

### 1.1 `Mutual`

```solidity
struct Mutual {
    address arbiter;            // sole authority to INITIATE a mutual loss
    address numeraire;          // unit of account for creditedValue & L (pricing only; never moved)
    address beneficiary;        // who settled units pay to (typically a ClaimRouter) — REQUIRED
    address valuationAuthority; // attests creditedValue in attested mode; MUST != arbiter; 0 = homogeneous
    uint64  challengeWindow;    // >= MUTUAL_MIN_CHALLENGE_WINDOW
    uint64  deallocationWindow; // post-exit-request slashable window; >= challengeWindow
    uint64  lastInitiatedAt;    // re-initiation rate-limit cursor (griefing guard)
    uint128 totalShares;        // Σ creditedValue of non-exited members. join / release ONLY — never on loss
    uint256 cumulativeLoss;     // Lambda, 1e18-scaled fraction. Monotonic non-decreasing, <= 1e18
    bool    active;             // set by the arbiter; members can only join an active mutual
    bool    terminal;           // wound down: no new joins / losses
    // ---- Premium index (reward side, §6; append-only) ----
    uint256 premiumPerShareStored; // Pi — premium-per-unit-cover, 1e27-scaled. Monotone non-decreasing
    uint128 activeCover;           // Σ effCover_i over active members = the premium denominator (live cover)
    uint256 settledTotal;          // Σ settledUnits — cross-checks activeCover == totalShares − settledTotal (INV-P9)
    uint128 rewardRate;            // streamed numeraire per second (Synthetix). 0 == never/no-longer funded
    uint64  lastUpdate;            // last _pokePremium time, clamped to periodFinish
    uint64  periodFinish;          // end of the current stream; accrual stops here
    uint256 premiumRemainder;      // sub-1e27 dust carried forward between pokes (no value ever lost)
    uint256 bankedTotal;           // Σ rewardBank_i — outstandingBank for the funding-time solvency guard (INV-P2)
    // ---- Heterogeneous mode (§7; append-only; all zero in homogeneous & attested-unconfigured) ----
    address bandAdapter;           // 0 = homogeneous / attested-unconfigured; nonzero ⇒ heterogeneous
    uint64  valuationFloorBps;     // band lower bound on premiumWeight as floorBps*adapterValue/1e4 (INV-P11)
    uint64  valuationCeilBps;      // band upper bound; <= 1e4 (no inflation above the adapter value, INV-P11)
    uint64  juniorBps;             // premium-funding split routed to the junior shortfall absorber (0 = no split)
}
```

The first eleven fields (`arbiter` … `terminal`) are the loss-path core. The eight premium
fields (`premiumPerShareStored` … `bankedTotal`) drive the reward-side index `Pi` (§6); the
four heterogeneous fields (`bandAdapter` … `juniorBps`) drive attested-mode weighting and the
junior absorber (§7). **All twelve appended fields default to zero**, so a mutual that never
funds premium and is never configured heterogeneous is byte-for-byte the pure-loss primitive: a
mutual is *heterogeneous* iff `bandAdapter != 0`, and the premium index is inert while
`rewardRate == 0`. A conforming implementation MUST declare all appended fields in the exact
order shown (the struct is fuzz-locked by the storage-slot test).

### 1.2 `Membership`

```solidity
struct Membership {
    uint256 mutualId;          // 0 == not a member (single, non-rebindable)
    uint256 forfeitableUnits; // E_i = amount * maxPenaltyBps / 10_000, FROZEN at join (raw units, the loss base)
    uint256 settledUnits;     // cumulative owedUnits already forfeited (remaining = E_i - settledUnits)
    uint128 creditedValue;    // valuation(token, E_i) in numeraire, FROZEN at join (totalShares accounting)
    uint256 lossSnapshot;     // Lambda at join / last settle — liable only for cumulativeLoss - snapshot
    uint64  unbondRequestedAt;// 0 == active; nonzero starts the deallocation window (still slashable until elapsed)
    // ---- Premium index (reward side, §6; append-only) ----
    uint128 premiumWeight;    // numeraire PREMIUM weight; == creditedValue in homogeneous, band-derived in heterogeneous
    uint256 premiumSnapshot;  // Pi at join / last sync — earns only Pi-growth after (reward non-retroactivity, INV-P5)
    uint256 rewardBank;       // accrued-but-unclaimed premium in numeraire (paid to the committer on claim/release)
}
```

The first six fields are the loss-path core. The three appended fields carry the reward side:
`premiumWeight` is the member's premium-denominator weight, **kept distinct from
`creditedValue`** so a reward re-mark can never touch the loss denominator (INV-P6) — it equals
`creditedValue` in homogeneous mode and is band-derived in heterogeneous mode (§7);
`premiumSnapshot` is the member's `Pi` cursor; `rewardBank` is accrued-but-unclaimed premium,
paid to the committer on claim or release. All three MUST be declared in this order.

Both `forfeitableUnits` (`E_i`, the raw-unit loss base) and `creditedValue` (the numeraire
capacity weight) MUST be stored. Settlement reads only `forfeitableUnits` and never a price;
`creditedValue` is decremented from `totalShares` at exactly the value it was added, so exit
cannot drift the denominator. `settledUnits` MUST be stored explicitly (not re-derived from the
live `commitment.amount`) so the surviving-partial decrement and the terminal close are
closed-form (§4, INV-G9).

### 1.3 `MutualLossProposal`

```solidity
struct MutualLossProposal {
    uint256 lossNumeraire; // declared loss L in the mutual's numeraire
    uint64  initiatedAt;   // 0 == none
    bytes32 evidenceHash;  // off-chain evidence commitment
    address proposer;      // the mutual arbiter that initiated
    bool    executed;
    bool    cancelled;
}
```

`MutualLossProposal` mirrors the core `ForfeitProposal`; at most one is active per mutual
(`initiatedAt != 0 && !executed && !cancelled`) — the analog of the core standard's INV-7. The
proposal records `proposer` and `evidenceHash` so the dispute model is storage-complete, but
**no native-token bond field is held in the custody root**: bond custody is delegated to the
pluggable mutual arbiter (§8, §9), keeping the manager ETH-free.

### 1.4 `MutualParams`

```solidity
struct MutualParams {
    address arbiter;
    address numeraire;
    address beneficiary;
    address valuationAuthority; // 0 = homogeneous-numeraire mode (oracle-free; numeraire == member token)
    uint64  challengeWindow;
    uint64  deallocationWindow;
}
```

### 1.5 `HeteroConfig`

Heterogeneous-mode configuration, applied **once** via `configureHeterogeneous` before the
mutual is activated and immutable thereafter (§7). Only meaningful for mutuals created with a
non-zero `valuationAuthority`; homogeneous mutuals can never be configured.

```solidity
struct HeteroConfig {
    address   bandAdapter;       // manipulation-resistant valuation adapter (TWAP / 4626 rate); REQUIRED, != 0
    uint64    valuationFloorBps; // band lower bound (<= ceil)
    uint64    valuationCeilBps;  // band upper bound (<= 1e4)
    uint64    juniorBps;         // premium split routed to the junior absorber (<= 1e4)
    address[] collaterals;       // per-collateral haircut keys (parallel to haircutBps)
    uint64[]  haircutBps;        // per-collateral haircut bps (each <= 1e4); parallel to collaterals
}
```

The `collaterals`/`haircutBps` arrays MUST be equal length; each entry populates the
`mutualHaircutBps[mutualId][collateral]` storage mapping (offset 37). All band/junior fields
drive **only** the premium side (§7); none is ever read into the loss denominator.

### 1.6 Parameters

A conforming implementation defines the following constants (reference values in parentheses):

- `MUTUAL_MIN_CHALLENGE_WINDOW` (2 days) — the mutual challenge-window floor. It MUST be
  **strictly longer** than the per-commitment `>= 1 day` floor, because one declaration moves
  the whole mutual.
- `MUTUAL_PROPOSAL_TTL` (7 days) — grace after the window during which a stale, abandoned
  declaration can be permissionlessly force-cancelled.
- `MIN_REINIT_INTERVAL` (1 hour) — minimum spacing between *re*-initiations (rate-limits
  initiate→cancel→re-initiate capital-freeze griefing).
- `LAMBDA_ONE` (1e18) — the fully-attributed loss fraction (the loss index `Lambda` scale).
- `MAX_TOTAL_SHARES` (`type(uint128).max`) — the `totalShares` / `activeCover` ceiling enforced
  at join.
- `PI_ONE` (1e27) — the premium-per-cover index `Pi` scale (§6). Higher than `LAMBDA_ONE`
  because premium streams continuously over a possibly-large `activeCover` denominator, so
  per-second deltas must not round to zero; the sub-`1e27` dust is carried in `premiumRemainder`.
- `MIN_STREAM_DURATION` (1 minute) and `MAX_STREAM_DURATION` (365 days) — the inclusive bounds on
  a premium stream's `duration` (§6); outside them `fundMutualPremium` reverts
  `StreamDurationOutOfBounds`. A live stream's end never moves earlier, so a short duration
  cannot compress one.
- `BPS` (10_000) — the basis-points denominator for the heterogeneous band / haircut /
  junior-split arithmetic (§7).

---

## 2. The shared loss index

### 2.1 The fixed-denominator additive index

`Lambda` (`cumulativeLoss`) is a **1e18-scaled cumulative loss fraction**: `Lambda == 1e18`
means 100% of every member's frozen `forfeitableUnits` is owed. It is **monotonic
non-decreasing** and **hard-capped at `1e18`**.

The denominator of the index is `totalShares`, and the central rule is:

> **`totalShares` changes ONLY on join (`+=`) and release (`-=`), NEVER on loss.**

This is the MasterChef `accRewardPerShare` discipline: members joining or leaving move the
base; the loss *event* does not. On execute, a declared loss `L` (in numeraire) bumps the index
once:

```
headroom = (LAMBDA_ONE - cumulativeLoss) * totalShares / LAMBDA_ONE   // numeraire the clamp permits
applied  = min(L, headroom)
cumulativeLoss += applied * LAMBDA_ONE / totalShares                  // single write; totalShares UNCHANGED
if (cumulativeLoss > LAMBDA_ONE) cumulativeLoss = LAMBDA_ONE          // belt against rounding
```

`headroom` is the maximum further numeraire loss admissible at the current `Lambda`; `applied`
clamps `L` to it. When `applied < L`, the manager MUST emit `MutualLossShortfall(mutualId,
L - applied)` — the beneficiary's under-recovery is **observable, never silent**. The index is
never driven past `1e18`, and no surviving member is ever asked for more than its `E_i`.

Each member then owes, at settle:

```
owedUnits = forfeitableUnits_i * (cumulativeLoss - lossSnapshot_i) / LAMBDA_ONE   // round DOWN
```

Because `creditedValue_i = valuation(token_i, E_i)`, forfeiting fraction `f = applied /
totalShares` of `E_i` delivers fraction `f` of frozen value, and
`Σ f * creditedValue_i = f * totalShares = applied`. The basket is worth the applied loss in
numeraire-at-join terms. Rounding member-owed **down** guarantees `Σ settled <= L` (a direct
sum; the residual dust is bounded by `members × 1 wei`).

### 2.2 Why the denominator is fixed

A tempting alternative is an additive index *with* a shrinking denominator:
`Lambda += L / totalCapacity` together with `totalCapacity -= L` after each loss. That design
is **incorrect**: the second loss is computed against the reduced denominator but applied to
the original units, over-collecting by a factor of `C / (C - L1)` and driving `Lambda` past 1.

Worked counterexample — two members, each `creditedValue = 50`, `totalShares = 100`, two losses
of `L = 50`:

| Model | After L1 = 50 | After L2 = 50 | Result |
|---|---|---|---|
| Shrinking denominator (`totalCapacity -= L`) | `Lambda = 50/100 = 0.5`, `cap = 50` | `Lambda += 50/50 = 1.0` → **`Lambda = 1.5`** | 150% attributed; settle underflows or under-pays |
| **Fixed denominator (this spec)** | `Lambda += 50/100 = 0.5` | `Lambda += 50/100 = 0.5` → **`Lambda = 1.0`** | 100% attributed; each owes exactly `E_i`; a third loss is clamped to shortfall |

The fixed-denominator form additionally gives the clean linear `owed = E_i * (Lambda - snap)`,
matches the protocol's 1e18 fixed-point conventions, and has the simplest dust-bound proof
(`Σ settled <= L` is a direct sum, not a product of survival ratios).

### 2.3 Headroom, shortfall, and capacity flight

Capacity flight (members exiting before a loss) is handled by the **clamp**, not by the
denominator. When a member exits, `totalShares -= creditedValue_i`; a subsequent loss then has a
smaller denominator and a larger `f`, but the `Lambda <= 1e18` clamp guarantees no surviving
member is asked for more than its `E_i`. The unappliable excess is recorded as
`MutualLossShortfall`. This denominator-shrinkage coupling is a genuine fragility relative to
fully-independent liens (a systemic event that triggers exits shrinks headroom and bites the
clamp sooner); it is *bounded*, not eliminated, by the deallocation window (§3.5) and any
leverage cap an implementation layers on top.

If `totalShares == 0` at execute (every member has exited), the declared loss cannot be applied:
the manager MUST mark the mutual `terminal`, emit `MutualLossShortfall(mutualId, L)` for the full
`L`, emit `MutualLossExecuted(mutualId, 0, cumulativeLoss)`, and emit `MutualTerminated(mutualId)`
— winding the mutual down cleanly rather than leaving the proposal wedged.

---

## 3. Lifecycle

**Membership event indexing (normative).** `MemberJoined` indexes `(mutualId, commitmentId,
committer)`. `MemberSettled`, `MemberExitRequested`, and `MemberReleased` index `(mutualId,
commitmentId)`, so integrators can query every membership lifecycle transition within one mutual.

### 3.1 `createMutual`

```solidity
function createMutual(MutualParams calldata params) external returns (uint256 mutualId);
```

Permissionless. The caller names the `arbiter`, `numeraire`, `beneficiary`, and
`valuationAuthority`. The manager MUST revert with:

- `ZeroAddress` if `arbiter`, `numeraire`, or `beneficiary` is the zero address;
- `MutualChallengeWindowTooShort` if `challengeWindow < MUTUAL_MIN_CHALLENGE_WINDOW`;
- `DeallocationWindowTooShort` if `deallocationWindow < challengeWindow`;
- `ValuationAuthorityIsArbiter` if `valuationAuthority != 0 && valuationAuthority == arbiter`
  (§8 — pricing trust MUST be separable from loss-declaration trust).

`valuationAuthority == 0` selects **homogeneous-numeraire mode** (oracle-free). The mutual starts
inactive (`active == false`, `terminal == false`, `totalShares == 0`, `cumulativeLoss == 0`).
The manager emits `MutualCreated(mutualId, arbiter, numeraire, beneficiary, valuationAuthority)`.

### 3.2 `activateMutual`

```solidity
function activateMutual(uint256 mutualId) external;
```

Arbiter-only (`NotMutualArbiter` otherwise). Reverts `MutualIsTerminal` on a wound-down mutual.
Flips `active = true`. No member may join and no loss may be declared until the mutual is
active, so activation means the arbiter accepts the mutual; `targetCapacity` on a registry
listing is informational and gates nothing. Emits `MutualActivated(mutualId)`.

### 3.3 `joinMutual`

```solidity
function joinMutual(
    uint256 mutualId,
    CommitmentParams calldata params,
    uint128 creditedValue,
    bytes calldata attestation
) external returns (uint256 commitmentId);
```

Creates a **fresh** commitment (committer = caller) via the core create path and joins
it to `mutualId` atomically, freezing both `E_i` and `creditedValue`. Creating fresh — rather
than attaching a pre-existing commitment — makes the constraints structural. A committer MAY
join the same mutual more than once; each join creates an independent commitment-scoped
membership. The manager MUST enforce, in order:

1. Mutual exists (`MutualNotFound`), is active and non-terminal (`MutualNotActive`), and
   `cumulativeLoss < LAMBDA_ONE` (`MutualExhausted`) — a wiped-out mutual takes no new members,
   since a joiner at `Lambda = 1e18` could never owe anything. It is not made terminal: existing
   members still settle, claim premium, and release.
2. No loss is pending (`MutualLossPending`) — capacity is frozen during a declaration.
3. `params.arbiter == mutual.arbiter` (`MutualArbiterMismatch`).
4. `params.counterparty == mutual.beneficiary` (`MutualBeneficiaryMismatch`) — **no
   forfeit-to-self**; settled units pay the mutual beneficiary.
5. `params.strategies.length == 0` (`MemberStrategyForbidden`) — member commitments carry
   NO distribution-strategy bindings (§5, OBJ-7).
6. `E_i = params.amount * params.maxPenaltyBps / 10_000` is non-zero (`InvalidCreditedValue`).

The credited weight is then resolved by mode:

- **Homogeneous mode (`valuationAuthority == 0`).** `params.token` MUST equal `mutual.numeraire`
  (`NumeraireMismatch`); `E_i` MUST NOT exceed `MAX_TOTAL_SHARES` (`TotalSharesOverflow`); and
  `creditedValue` is **set equal to `E_i`**. This subset is oracle-free: every member posts the
  single numeraire token, and the credited weight is the member's own frozen units.
- **Attested mode (`valuationAuthority != 0`).** The supplied `creditedValue` MUST be non-zero
  (`InvalidCreditedValue`) and MUST be signed by the mutual's `valuationAuthority` over a digest
  binding `("MutualValuation", chainid, manager, mutualId, committer, token, E_i,
  creditedValue)` (`InvalidValuationAttestation`). The manager never derives the weight from a
  live, pumpable adapter read — the attestation *is* the (bounded, off-chain) trust (§8).

After validation the manager creates the commitment, adds `creditedValue` to `totalShares`
(checked against `MAX_TOTAL_SHARES`, `TotalSharesOverflow`), writes the membership with
`settledUnits = 0`, `lossSnapshot = mutual.cumulativeLoss` (the **no-retroactive-loss**
guarantee — liable only for future `Lambda` growth), and `unbondRequestedAt = 0`, and emits
`MemberJoined(mutualId, commitmentId, committer, creditedValue, E_i)`.

### 3.4 Two-phase mutual loss

```solidity
function initiateMutualLoss(uint256 mutualId, uint256 lossNumeraire, bytes32 evidenceHash) external; // arbiter
function executeMutualLoss(uint256 mutualId) external;       // anyone, after window
function cancelMutualLoss(uint256 mutualId) external;        // arbiter
function cancelStaleMutualLoss(uint256 mutualId) external;   // anyone, after window + TTL
```

**Phase 1 — `initiateMutualLoss`.** Arbiter-only (`NotMutualArbiter`); mutual active and
non-terminal (`MutualNotActive`); `lossNumeraire != 0` (`ZeroAmount`); no loss already pending
(`MutualLossPending`). Re-initiation is rate-limited: if `lastInitiatedAt != 0` and
`block.timestamp < lastInitiatedAt + MIN_REINIT_INTERVAL`, revert `ReinitTooSoon` (the *first*
honest declaration is never blocked). Records the proposal, stamps `lastInitiatedAt`, and emits
`MutualLossInitiated(mutualId, lossNumeraire, evidenceHash, proposer)`. From this point joins and
exits are frozen until the proposal resolves.

**Phase 2 — `executeMutualLoss`.** Permissionless. A pending proposal MUST exist
(`NoMutualLossPending`); the challenge window MUST have elapsed
(`block.timestamp >= initiatedAt + challengeWindow`, else `MutualChallengeWindowActive`); and the
global `forfeiturePaused` circuit breaker MUST be false (`ForfeitureIsPaused`). The manager marks
the proposal `executed`, then applies the §2.1 index bump (or the §2.3 empty-mutual terminal
path). Emits `MutualLossShortfall` if clamped, then `MutualLossExecuted(mutualId, applied,
cumulativeLoss)`. `Lambda` bumps **only here**, exactly once per declaration.

**`cancelMutualLoss`.** Arbiter-only cancel of a pending declaration; sets `cancelled`, emits
`MutualLossCancelled(mutualId, false)`.

**`cancelStaleMutualLoss`.** Permissionless force-cancel of an abandoned declaration once
`block.timestamp >= initiatedAt + challengeWindow + MUTUAL_PROPOSAL_TTL`
(`MutualChallengeWindowActive` before that); emits `MutualLossCancelled(mutualId, true)`. This
prevents a never-executed proposal from freezing capacity forever.

### 3.5 Lazy, permissionless settlement

```solidity
function settleMemberLoss(uint256 commitmentId) external;
function settleMembers(uint256[] calldata commitmentIds) external;
```

`settleMemberLoss` is **permissionless** and **idempotent**. It reconciles one member to the
*current* `Lambda` — so `K` deferred losses collapse into one `O(1)` settle (it reads the live
index, not a per-loss loop). There is no challenge window here: the *declaration* carried the one
shared window. The flow:

```
m = membership[commitmentId];  require m.mutualId != 0     // NotMutualMember
lambda = mutuals[m.mutualId].cumulativeLoss
if (lambda == m.lossSnapshot) return                           // nothing new (idempotent)
_syncMember(m)                                                 // poke + bank premium on pre-loss cover (INV-P8)
owed = m.forfeitableUnits * (lambda - m.lossSnapshot) / 1e18   // round DOWN
owed = min(owed, m.forfeitableUnits - m.settledUnits)          // Belt 1: remaining liability (INV-G3)
owed = min(owed, c.amount)                                     // Belt 2: live commitment amount (INV-G10)
if (owed > 0):
    ExposureLib.decrementForfeited(committer, token, owed)    // INV-G9: both legs by owed
    LedgerLib.forfeitTransfer(token, committer, beneficiary, owed)  // encumbered -> beneficiary free
    m.settledUnits += owed
    c.amount       -= owed                                     // residual stays ENCUMBERED; commitment survives
m.lossSnapshot = lambda
emit MemberSettled(mutualId, commitmentId, owed, lambda)
```

The two clamps are both load-bearing. Belt 1 caps cumulative `owed` at `E_i`. Belt 2 is required
because `forfeitTransfer` checks the **aggregate** per-(token,user) encumbered balance while the
mutual accounts per-commitment `c.amount`; the clamp is what keeps a user holding *multiple*
member commitments on one token correct. Settlement is strict CEI — the exposure decrement and
the balance-conserving ledger move are the only effects, and member commitments carry no hooks
(§5), so there is no external-call reentrancy surface and **`onCommitmentForfeited` never fires
on a mutual settle**. The commitment **survives** settlement (it may take future losses or
eventually be released) — the key difference from the one-shot terminal `executeForfeit`.

`settleMembers` is a bounded batch convenience that loops `settleMemberLoss` (reverts
`EmptyBatch` on empty input). Because settlement is permissionless, the `O(N)` physical movement
of a claim can never brick on a single uncooperative member.

### 3.6 Two-step exit

```solidity
function requestMutualExit(uint256 commitmentId) external;   // committer; starts deallocation window
function releaseMutualMember(uint256 commitmentId) external;  // permissionless once eligible
```

Exit is **two-step**, implementing the EigenLayer deallocation-delay applied to liens — the
defense against an informed member exiting *ahead of* a loss it can see coming.

Let `elapsed` be the pause-adjusted time since `unbondRequestedAt`. The deallocation window is
`elapsed < deallocationWindow`; the **exit window** follows it, `deallocationWindow <= elapsed <
2 * deallocationWindow`. A request not released inside its exit window **lapses**, so a matured
request is not a standing option to leave the moment a loss becomes visible.

**`requestMutualExit`.** Committer-only (`NotCommitter`); member must be in a mutual
(`NotMutualMember`); no loss pending (`MutualLossPending`); no live request
(`UnbondAlreadyRequested` while a prior request has not lapsed). Stamps
`unbondRequestedAt = block.timestamp` and a fresh pause snapshot; on a lapsed request this starts
a new one. The line **stays in `totalShares` and remains mutual-slashable** until the deallocation
window elapses, and keeps earning premium until release. Emits
`MemberExitRequested(mutualId, commitmentId, unbondRequestedAt + deallocationWindow)`; the exit
window runs from that `slashableUntil` for one more `deallocationWindow`.

**`releaseMutualMember`.** Permissionless, but eligible only when: exit was requested
(`ExitNotRequested`); `elapsed >= deallocationWindow` (else `DeallocationWindowActive`);
`elapsed < 2 * deallocationWindow` (else `ExitRequestLapsed`; the member requests again);
no loss is pending (`MutualLossPending`); and the member is fully settled to the current index
(`lossSnapshot == cumulativeLoss`, else `MemberUnsettled` — INV-G5). It then performs a
**mutual-aware terminal decrement** (§4, *not* the core `_closeWithHooks` bps-derived decrement),
returns the residual `c.amount` to the committer's free balance via `releaseEncumbrance`, zeroes
`c.amount`, marks the commitment `released`, removes `creditedValue` from `totalShares`, deletes
the membership, and emits `MemberReleased(mutualId, commitmentId)`.

Release also carries the member's **premium exit leg** (§6): it pokes the index and banks the
member's accrued premium up to the current `Pi`, exits the member from *both* premium
denominators (`activeCover -= effCover`, `settledTotal -= settledUnits`, keeping
`activeCover == totalShares − settledTotal` exact), and — the leg the loss-only description
omits — **auto-pays the member's accrued `rewardBank` to the committer** through the premium
reserve (`mutualPremiumToFree`), zeroing `rewardBank`, decrementing `bankedTotal`, and emitting
`MemberPremiumClaimed(commitmentId, committer, amount)`. A member therefore never has to make a
separate `claimMemberPremium` call to recover its premium at exit. If releasing the *last*
member (`totalShares == 0`), the manager performs a **terminal sweep** of any residual premium
and junior reserve to the beneficiary (emitting `MutualPremiumSwept` / `MutualJuniorSwept`) so
INV-P1 / INV-P13 close at zero.

### 3.7 Views

```solidity
function getMutual(uint256 mutualId) external view returns (Mutual memory);
function getMembership(uint256 commitmentId) external view returns (Membership memory);
function getMutualLossProposal(uint256 mutualId) external view returns (MutualLossProposal memory);
function pendingMemberLoss(uint256 commitmentId) external view returns (uint256 owedUnits);
```

`pendingMemberLoss` returns the raw units the commitment would owe the beneficiary if settled at
the current `Lambda`, applying the same two clamps as `settleMemberLoss` (returns 0 for a
non-member or an already-settled member).

---

## 4. Invariants

A conforming implementation MUST preserve the core invariants (INV-1 partition, INV-3 exposure
allocation, INV-4 movement cap) and additionally enforce the following. These SHOULD be locked
by the conformance fuzz alongside the core invariants.

- **INV-G1 (loss conservation).** Cumulative settled value `<= Σ` declared `L`. Holds by the
  fixed denominator + per-loss `min(L, headroom)` clamp + round-member-down.
- **INV-G2 (index bounds).** `0 <= cumulativeLoss <= 1e18`, monotonic non-decreasing. Holds by
  the `applied = min(L, headroom)` clamp and the post-bump belt clamp.
- **INV-G3 (per-member cap).** Per member, cumulative `owedUnits <= forfeitableUnits` (`E_i`).
  Holds because `E_i * Lambda <= E_i` for `Lambda <= 1e18`, plus the `settledUnits` belt.
- **INV-G4 (no retroactive loss).** A member joining at `Lambda = l0` is never liable for losses
  before its join. Holds by `lossSnapshot = cumulativeLoss` at join.
- **INV-G5 (settled-and-windowed exit).** A mutual member cannot release with unsettled
  `cumulativeLoss - lossSnapshot`, nor before the deallocation window elapses, nor after its
  exit window lapses. Enforced by `releaseMutualMember`'s gates. A pending loss still blocks
  release, so a request can lapse while a loss is pending; that is intended.
- **INV-G6 (single membership).** One commitment maps to at most one mutual; `mutualId` is single
  and non-rebindable (a fresh `joinMutual` mints a new commitment).
- **INV-G7 (bounded valuation).** `creditedValue` is never an unbounded live manager read; in
  homogeneous mode it equals `E_i`, in attested mode it is authority-signed and SHOULD be
  band-bounded against an adapter read by the periphery (§8).
- **INV-G8 (close-path isolation).** A member commitment can never enter an agreement, and can
  never be terminally single-forfeited or closed through the normal path while the mutual still
  expects to draw its `E_i` (§5).
- **INV-G9 (gap-preserving partial decrement).** The surviving-partial settle decrement moves
  **both** exposure legs (`totalEncumbered` and `totalForfeitable`) by the **same** `owedUnits`.
  Because the forfeited units are drawn entirely from the member's frozen forfeitable allotment
  `E_i`, the per-commitment gap `(encumbered − forfeitable) = amount_join − E_i =
  amount_join × (1 − bps/10_000)` is **invariant across every settle**, so the aggregate INV-3
  (`totalForfeitable <= totalEncumbered`) holds by construction — even for a user simultaneously
  backing other high-penalty commitments on the same token. The naive variants (decrement
  forfeitable by `owedUnits × bps/10_000`, or by `owedUnits` on a `c.amount × bps/10_000` base)
  desync the two legs and are explicitly rejected. `releaseMutualMember` likewise uses a
  mutual-aware terminal decrement: `totalEncumbered -= c.amount` (the residual
  `amount_join − settledUnits`) and `totalForfeitable -= (forfeitableUnits − settledUnits)` (the
  *remaining* liability only) — **not** the core close's `c.amount × maxPenaltyBps / 10_000`,
  which would double-count units already removed by prior settles.
- **INV-G10 (per-commitment settle clamp).** Every settle debit is clamped to the live
  `c.amount`; this clamp over the aggregate-checking `forfeitTransfer` is never droppable for a
  user with multiple member commitments on one token.

The premium index (§6) and the heterogeneous junior absorber (§7) add the following. A
homogeneous, never-funded mutual has all premium/junior state at zero, so these hold trivially.

- **INV-P0 (helper-only reserve mutation).** The premium and junior reserves are mutated **only**
  through their `LedgerLib` helper pairs; the index poke `_pokePremium` NEVER writes a reserve.
- **INV-P1 (extended partition — premium).** Per token,
  `totalFree + totalEncumbered + totalEscrow + totalMutualPremium == balanceOf(manager)`. The
  premium reserve is a genuine fourth compartment (`funded − claimed`).
- **INV-P2 (funding-time solvency).** At every `fundMutualPremium`,
  `rewardRate × duration + bankedTotal <= mutualPremiumPool` — everything the stream can still
  pay plus everything already banked is covered by the reserve. This is the *single* premium
  solvency check.
- **INV-P5 (reward non-retroactivity).** A member joining at `Pi = p0` earns only `Pi` growth
  after its join (`premiumSnapshot = Pi` at join).
- **INV-P6 (weight isolation).** `premiumWeight` is stored distinct from `creditedValue`; a
  reward-side re-mark writes only `premiumWeight` and the premium aggregates, never the loss
  denominator (`creditedValue` / `totalShares` / `lossSnapshot` / `Lambda` / headroom).
- **INV-P8 (poke-before-change).** `_pokePremium` runs immediately before every mutation of
  `activeCover` or `Pi` (MasterChef discipline).
- **INV-P9 (cover exactness).** `activeCover == totalShares − settledTotal == Σ effCover_i`
  (the `totalShares − settledTotal` leg is homogeneous-only; heterogeneous mutuals hold the
  running-delta identity `activeCover == Σ effCover_i`, INV-P9′).
- **INV-P10 (bank never bricks a loss).** Premium banking inside settle/release is failure-
  isolated (saturating, skip-not-revert on the infeasible overflow path), so a premium-arithmetic
  edge can never wedge the loss legs; a deferred accrual is recovered on a later poke, never lost.
- **INV-P11 (band bound).** In heterogeneous mode `premiumWeight` is band-clamped to
  `[floorBps, ceilBps] × adapterValue / 1e4` with `ceilBps <= 1e4` (no inflation above the
  adapter value); a `remark` is **down-only** (monotone non-increasing).
- **INV-P13 (extended partition — junior).** Per token,
  `totalFree + totalEncumbered + totalEscrow + totalMutualPremium + totalMutualJunior ==
  balanceOf(manager)`. The junior reserve is a genuine fifth compartment (`funded − drawn`); it
  never earns `Pi` and is never part of `activeCover` / `totalShares`.
- **INV-P14 (haircut bound).** The heterogeneous `premiumWeight` is haircut by the per-collateral
  `mutualHaircutBps` after banding, so `weight <= (1 − haircut)/1e4 × bandWeight`.

The relationship to the core path is precise: a size-1 mutual taking one `Lambda = 1e18` loss
matches `initiateForfeit(maxPenaltyBps) + executeForfeit` **on the forfeited-units leg**. The
*full* ledger delta coincides only at `maxPenaltyBps == 10_000`, where the residual is zero;
for `maxPenaltyBps < 10_000` single forfeit *releases* the residual `c.amount − E_i` to the
committer's free balance while a mutual settle leaves the residual encumbered. The standard's
claim is "mutual settle shares the low-level helpers and reduces to single forfeit at the
full-penalty corner," not "single forfeit is literally a size-1 mutual."

---

## 5. Cross-cutting close-path gating

A member commitment's `E_i` and `creditedValue` are frozen at join and may be drawn by the
mutual as future loss. Therefore a member commitment MUST NOT be terminally closed, forfeited,
mutated, or entangled through any non-mutual path — doing so would leave `totalShares` stale and
re-spend units the mutual still expects to draw (INV-1 / INV-4 double-spend). The standard
realizes this as a **single gate at the internal convergence point** plus negative checks on the
remaining entry surfaces, rather than scattering guards on the named wrappers.

The convergence gate lives in the internal `_closeWithHooks` — the single point through which
`release`, `expire`, `finalizeUnbond`, `batchReleaseCommitments`, and the agreements close path
all flow: if `membership[commitmentId].mutualId != 0`, revert `CommitmentInMutual`. Every
higher path inherits the gate. In addition, the manager MUST revert `CommitmentInMutual` (or the
appropriate mutual error) on:

- **`initiateForfeitCore`** — a member commitment is forfeited only through its mutual's shared
  index, never the single-commitment two-phase path.
- **the agreements `accept` / settle surface** — a member commitment MUST never enter an
  agreement (INV-G8).
- **`requestUnbondCore`** — mutual members exit via `requestMutualExit` (the deallocation
  window), not the normal committer unbond.
- **`contributeEncumbered`** — third-party contributions would drift the frozen `E_i` /
  `creditedValue` and desync the shared-loss accounting.
- **strategy bindings** — barred structurally at `joinMutual` (`params.strategies.length == 0`),
  so no `FromEncumbered*`-emitting or forfeit-reactive hook can drift `E_i` or mis-fire the
  one-shot `onCommitmentForfeited` semantics that a mutual settle deliberately never uses.

The discipline for an implementer is to grep every caller of `_closeWithHooks`,
`releaseEncumbrance`, and `forfeitTransfer`, prove none can terminally close or single-forfeit a
member commitment while the mutual still expects its `E_i`, and add a negative test per path.

---

## 6. Premium index

A mutual carries an optional **premium (reward) side** alongside the loss index: a policyholder
streams numeraire to the members that are actively bearing cover, priced entirely off-chain. It
is a second MasterChef-style accumulator, `Pi` (`premiumPerShareStored`, `PI_ONE = 1e27`-scaled),
whose denominator is **`activeCover`**, the live deliverable cover — *not* `totalShares`. The two
indices are identical in pull-accumulator shape and disjoint in denominator: `Lambda` rebases
attribution over `totalShares`; `Pi` distributes premium over `activeCover`. A mutual that never
funds premium keeps `rewardRate == 0` and every premium field zero, so the premium machinery is a
byte-for-byte no-op on the pure-loss path (short-circuited in `_pokePremium`).

`activeCover` is maintained exactly: `activeCover == totalShares − settledTotal == Σ effCover_i`
(INV-P9). A member's `effCover_i` is its `premiumWeight` scaled by its *remaining* deliverable
liability `(E_i − settledUnits)`, so a loss settle shrinks the premium denominator by the same
delta it shrinks the member's cover. Every mutation of `activeCover` or `Pi` is preceded by a poke
(`_pokePremium`, INV-P8), which advances `Pi` to `min(now, periodFinish)`, carries sub-`1e27` dust
in `premiumRemainder`, and never touches a reserve (INV-P0).

### 6.1 The premium reserve is a partition compartment

The premium reserve `mutualPremiumPool[mutualId]` is `funded − claimed` numeraire and is a
**genuine partition compartment** — the fourth, alongside free / encumbered / escrow — tracked by
the per-token aggregate `totalMutualPremium` (§1 storage, offsets 33..34). It is credited only by
`fundMutualPremium` and debited only by `claimMemberPremium` / `reclaimPremium` / terminal-sweep,
each through the `LedgerLib` `freeToMutualPremium` / `mutualPremiumToFree` helper pair (INV-P0), so
the extended partition **INV-P1**
(`totalFree + totalEncumbered + totalEscrow + totalMutualPremium == balanceOf(manager)`) holds on
the manager's actual balance. Premium solvency is enforced at a single point — funding time —
by the full-funding guard **INV-P2**: `rewardRate × duration + bankedTotal <= mutualPremiumPool`.

### 6.2 API

```solidity
function fundMutualPremium(uint256 mutualId, uint256 amount, uint64 duration) external; // policyholder
function claimMemberPremium(uint256 commitmentId) external;                             // permissionless
function claimMembersPremium(uint256[] calldata commitmentIds) external;                // bounded batch
function reclaimPremium(uint256 mutualId) external;                                      // policyholder-of-record
function settleAndClaim(uint256 commitmentId) external;                                  // settle loss then claim
function pendingMemberPremium(uint256 commitmentId) external view returns (uint256 claimable);
function getMutualPremiumState(uint256 mutualId) external view returns (
    uint256 premiumPerShareStored, uint128 activeCover, uint256 settledTotal,
    uint128 rewardRate, uint64 lastUpdate, uint64 periodFinish,
    uint256 premiumRemainder, uint256 bankedTotal, uint256 premiumPool
);
```

**`fundMutualPremium`.** Pulls `amount` of the mutual's numeraire by **measured balance-delta**
(fee-on-transfer / rebasing safe), pokes the index, then (re)starts a Synthetix stream over
`duration` seconds with the standard leftover-roll. While a stream is live its end never moves
earlier: `newFinish = max(periodFinish, now + duration)`, and the new rate is
`(premium + leftover) / (newFinish - now)`. A short-duration funding of a live stream therefore
tops up the rate over the existing end instead of paying the leftover out early. With no live
stream, `newFinish = now + duration`. The manager sets only a future *rate*; pricing lives
entirely in the periphery. It reverts:

- `MutualIsTerminal` on a wound-down mutual;
- `MutualExhausted` when `cumulativeLoss == LAMBDA_ONE` (no cover left to pay for);
- `HeterogeneousPremiumUnsupported` when the mutual is attested (`valuationAuthority != 0`) but
  not yet `configureHeterogeneous`-configured — the money path stays closed until a `bandAdapter`
  is set;
- `StreamDurationOutOfBounds` when `duration ∉ [MIN_STREAM_DURATION, MAX_STREAM_DURATION]`
  (1 minute … 365 days) **or** the new `periodFinish` would overflow `uint64`;
- `NoActiveCover` when `activeCover == 0` (no live cover to distribute to);
- `RewardRateOverflow` when the computed `rewardRate` would not fit `uint128`;
- `PremiumRateDecreased` — **the S6 live-stream-rate guard**: while a stream is running
  (`now < periodFinish`) funding may only maintain or raise `rewardRate`. This closes the classic
  Synthetix `notifyRewardAmount` griefing where a 1-wei fund over a huge window re-spreads the
  leftover, collapses the rate (often to 0 by integer division), and stalls the stream — a live
  risk precisely because funding is permissionless;
- `PremiumStreamUnderfunded` when the funding-time solvency guard (INV-P2) fails:
  `rewardRate * (newFinish - now) + bankedTotal` must not exceed the premium reserve.

On success it emits `MutualPremiumFunded(mutualId, funder, received, rewardRate, periodFinish)`,
where `received` is the **measured** receipt.

**`claimMemberPremium`** is permissionless and CEI-strict: it syncs the member (poke + accrue on
live `effCover`), zeroes `rewardBank` before the reserve→free move, decrements `bankedTotal`, and
pays the committer, emitting `MemberPremiumClaimed(commitmentId, committer, amount)` (a zero
balance is a no-op emit). `claimMembersPremium` is the bounded batch (reverts `EmptyBatch`).
`settleAndClaim` is pure dispatch — `settleMemberLoss` then `claimMemberPremium` under one
reentrancy guard, two independent CEI passes with no shared accounting.

**`reclaimPremium`** lets the policyholder-of-record (the mutual `beneficiary`) defund the
*unstreamed* remainder and halt the stream (`periodFinish = now`, `rewardRate = 0`); already-banked
premium stays claimable, and the funding guard still holds because the future-streamable amount and
its matching reserve are removed together. Emits `PremiumReclaimed(mutualId, recipient, unstreamed)`.
A terminal sweep of a wound-down mutual's residual reserve emits
`MutualPremiumSwept(mutualId, recipient, amount)` so INV-P1 closes at zero.

### 6.3 Events and errors

Events: `MutualPremiumFunded`, `MemberPremiumClaimed`, `PremiumReclaimed`, `MutualPremiumSwept`.

Errors: `NoActiveCover`, `PremiumStreamUnderfunded`, `InsufficientMutualPremium`,
`RewardRateOverflow`, `StreamDurationOutOfBounds`, `PremiumRateDecreased`,
`HeterogeneousPremiumUnsupported`.

---

## 7. Attested heterogeneous mode and the junior absorber

A mutual with a non-zero `valuationAuthority` MAY additionally be placed in **heterogeneous mode**,
which unlocks band-bounded premium re-marking and a junior shortfall absorber. A mutual is
heterogeneous **iff `bandAdapter != 0`**. Heterogeneous state drives **only the premium (reward)
side — never the loss denominator** — so a homogeneous mutual (all §7 fields zero, `juniorBps == 0`)
is byte-for-byte the pure primitive.

### 7.1 API

```solidity
function configureHeterogeneous(uint256 mutualId, HeteroConfig calldata config) external; // valuationAuthority
function remark(uint256 mutualId, uint256 commitmentId) external;                          // permissionless, down-only
function getMutualJuniorPool(uint256 mutualId) external view returns (uint256 juniorPool);
```

**`configureHeterogeneous`** is **immutable and pre-activation**: `valuationAuthority`-only
(`NotValuationAuthority` — homogeneous mutuals have `valuationAuthority == 0` and so can never be
configured), allowed only while `!active && !terminal` (`MutualAlreadyActive` / `MutualIsTerminal`),
and only once (`MutualAlreadyConfigured` if `bandAdapter != 0`). It validates the band and split
(`InvalidHeteroConfig` for `bandAdapter == 0`, `valuationCeilBps > 1e4`,
`valuationFloorBps > valuationCeilBps`, `juniorBps > 1e4`, a haircut `> 1e4`, or a
`collaterals`/`haircutBps` length mismatch), writes the four `Mutual` band/junior fields
(`bandAdapter`, `valuationFloorBps`, `valuationCeilBps`, `juniorBps`) and the per-collateral
`mutualHaircutBps` mapping, and emits
`MutualHeterogeneousConfigured(mutualId, bandAdapter, valuationFloorBps, valuationCeilBps, juniorBps)`.
Configuring re-enables `fundMutualPremium` for an attested mutual and switches new joins to
band+haircut premium pricing.

At join, a heterogeneous member's `premiumWeight` is derived from the **manipulation-resistant
`bandAdapter`** (a TWAP or ERC-4626 rate — never the attestation and never a live, donation-pumpable
spot read): the adapter value of `E_i` raw units is band-clamped to
`[valuationFloorBps, valuationCeilBps] × adapterValue / 1e4` (with `valuationCeilBps <= 1e4`, so the
result never exceeds the adapter value — no inflation, INV-P11) and then haircut by the
per-collateral `mutualHaircutBps` (INV-P14). This feeds `premiumWeight` / `effCover` / `activeCover`
only; `creditedValue`, `totalShares`, `Lambda`, and headroom are untouched.

**`remark`** is a permissionless **down-only** re-mark of one member's `premiumWeight`: it recomputes
the band+haircut weight and ratchets to `min(current, recomputed)` (monotone non-increasing,
INV-P11), banks accrued premium on the old `effCover` first (INV-P8), then shrinks `activeCover` by
the deliverable-cover delta. It reverts `NotMutualMember` off-member, `NotHeterogeneous` on a
homogeneous mutual, and `MutualLossPending` while a loss is pending (INV-P12); an appreciation /
unchanged weight is a no-op emit. It writes **only** `premiumWeight` and the premium aggregates —
never the loss denominator — so a remarker can neither wedge nor delay a claim (INV-P6). Emits
`MemberRemarked(commitmentId, oldWeight, newWeight)`.

### 7.2 The junior shortfall absorber

The junior pool `mutualJuniorPool[mutualId]` is a **shortfall absorber** and the **fifth partition
compartment**: `funded − drawn` numeraire, tracked by the per-token aggregate `totalMutualJunior`
(§1 storage, offsets 35..37), mutated only through the `LedgerLib` `freeToMutualJunior` /
`mutualJuniorToFree` helper pair. It extends the partition once more to **INV-P13**
(`… + totalMutualPremium + totalMutualJunior == balanceOf(manager)`). It **never earns `Pi`** and is
**never part of `activeCover` / `totalShares`**.

It is funded as a fixed `juniorBps` split of each premium receipt (subordinate capital that is
excluded from the stream and from the INV-P2 solvency accounting), emitting
`MutualJuniorFunded(mutualId, funder, amount)`. At a loss settle it is drawn — **oracle-free**, a
fixed `mutualHaircutBps` fraction of the owed units, not a live price — to top up the beneficiary's
numeraire recovery, bounded by the available reserve (`InsufficientMutualJunior` guards any direct
debit past the reserve; the settle-time draw is clamped to the pool so it can never revert and brick
a loss, INV-P13). The draw emits `MutualJuniorDrawn(commitmentId, amount)`; a terminal sweep emits
`MutualJuniorSwept(mutualId, recipient, amount)`. For a homogeneous mutual `juniorBps == 0`, so the
pool is never funded and this entire subsystem stays zero and inert.

### 7.3 Events and errors

Events: `MutualHeterogeneousConfigured`, `MemberRemarked`, `MutualJuniorFunded`,
`MutualJuniorDrawn`, `MutualJuniorSwept`.

Errors: `NotValuationAuthority`, `NotHeterogeneous`, `MutualAlreadyConfigured`,
`MutualAlreadyActive`, `InvalidHeteroConfig`, `InsufficientMutualJunior`.

---

## 8. Trust and dispute model

**The homogeneous-numeraire subset is oracle-free.** When `valuationAuthority == 0`, every member
posts the mutual's single `numeraire` token and `creditedValue == E_i`; the manager reads no
price and the loss is a dimensionless fraction of like units. There is no settlement-time oracle
and no pricing trust. This is the subset a conforming implementation SHOULD ship and audit first.

**Attested mode relocates trust; it does not eliminate it.** In heterogeneous mode a mis-set
`creditedValue_i` is profitable in two directions — inflate yours to dilute everyone's loss
fraction (and skim any premium weighted by `creditedValue_i`), or deflate a victim's to make it
over-pay. Opaqueness alone just moves that attack onto the `valuationAuthority`. The standard
therefore (a) **REQUIRES `valuationAuthority != arbiter`** (enforced at `createMutual`) so a
single key cannot control pricing *and* loss declaration, and (b) RECOMMENDS the periphery
**band-bound** the attested weight within `[lo, hi] × adapter.value(token, E_i)` so even the
authorized attestor cannot set it arbitrarily — the adapter read is a *sanity band*, not the
denominator. The manager MUST NOT place a live, donation-pumpable adapter read directly into the
loss-fraction denominator. The attestation is a self-contained ECDSA signature over a digest
binding chainid + manager + the exact `(mutualId, committer, token, E_i, creditedValue)` — no
EIP-712 plumbing is threaded through the delegatecall library.

**Bond custody lives in the periphery, not the custody root.** One declaration moves the whole
mutual, so the mutual challenge path SHOULD be bonded/optimistic. The standard deliberately
keeps **native-token bond custody OUT of the manager**: `MutualLossProposal` stores `proposer`
and `evidenceHash` (making the dispute model storage-complete) but no bond. The bond, the veto,
and the slash live in a pluggable mutual arbiter (§9, `OptimisticMutualArbiter`), mirroring how the
per-commitment path delegates to `OptimisticInsuranceArbiter`. This keeps the custody root
ETH-free and the dispute economics swappable without touching the core.

---

## 9. Periphery (informative)

The following reference contracts compose the core primitive into the *Mutual*
product. They are off the core custody path and are not part of the normative manager surface.

**`MutualRegistry`** — a thin product wrapper. `registerMutual` calls
`manager.createMutual` and records the off-chain-meaningful coverage terms 1:1 against the
returned `mutualId`: `creator`, `targetCapacity`, `termEnd`, `perilURI` (at most 512 bytes, else
`URITooLong`), `perilHash`. The numeraire and beneficiary are read from the core `Mutual`. It is
the indexer's binding target and the frontend's read surface.
Capacity / loss accounting all live in the manager's `Mutual`; the registry only annotates
and exposes a capacity view (`isFilled`, `capacity` read `getMutual(mutualId).totalShares`
against the recorded target; `allMutualIds`, `mutualCount`). It emits `MutualRegistered`.

**`OptimisticMutualArbiter`** — the pluggable mutual arbiter where the dispute model lives. A
proposer posts an ERC-20 `bond` (`>= minBond`) and calls `proposeLoss`, which the arbiter relays
to `manager.initiateMutualLoss`, opening the mutual challenge window. A dispute committee (the
`owner`) MAY `veto` during the window — that calls `manager.cancelMutualLoss` and slashes the
bond to `treasury`. If undisputed, anyone calls `manager.executeMutualLoss` directly once the
window elapses, and anyone calls `reclaimBond` to return the bond to the proposer (gated on
`manager.getMutualLossProposal(mutualId).executed`). One active claim per mutual mirrors the
manager's one-active-proposal rule. `reclaimBond` and `reclaimOnCancelled` are permissionless and
always refund the proposer; a new `proposeLoss` also refunds a prior unreclaimed claim whose
manager proposal executed or was cancelled, so an abandoned bond never blocks the next
declaration. Only a claim still pending in the manager reverts `ClaimActive`. `activate`
(owner-gated) flips the mutual active; members can join only after it. `proposeLossFor` also
references a `LinkedMutualPolicy` binding of the same mutual and emits its `{notional, expiry,
policyholder}` in `CoverBindingSnapshotted`; the snapshot is not stored and gates nothing.
Events: `LossProposed`, `LossVetoed`, `BondReclaimed`, `CoverBindingSnapshotted`.

**`ClaimRouter`** — the mutual beneficiary. Settled member units land in this contract's
**free** balance in the manager. Settlement is permissionless: anyone calls
`manager.settleMembers`, so a claim can never brick on one uncooperative member. The designated
immutable `claimant` (policyholder) calls `collect(token, to)` to `withdraw` and transfer out a
single token, or `settleAndCollect(commitmentIds, token, to)` to do both. The default product is
**basket settlement** — the claimant receives the members' raw heterogeneous collateral tokens
as-is, one token per `collect` call; any swap to a single unit is an explicit, opt-in step the
claimant performs after collection. The router never swaps. Events: `Settled`, `Collected`.

**`LinkedMutualPolicy` + `PremiumScheduler`** — the premium binding and pricing periphery for the
§6 stream. `PremiumScheduler` is the pricing brain: a two-slope kinked utilization-curve plus an
MCR/leverage cap that turns notional cover sold into an annualized rate. `LinkedMutualPolicy` is
the funding executor: `bindCover(mutualId, notional, duration)` prices the premium off the
scheduler, pulls it from the caller, and calls `manager.fundMutualPremium`; `fundStandby` funds
the existing stream with a reservation fee and returns the premium it pulled; expired bindings
lapse permissionlessly. The policy reads each mutual's numeraire from the core once and caches it. Pricing lives
entirely here — the custody root only sets a future rate under INV-P2. Events: `CoverBound`,
`StandbyFunded`, `BindingExpired`.

---

## 10. Security considerations

- **Claimant collection is `O(N)`.** The "`O(1)`" property is honest about the *writer* (one
  loss declaration, one `Lambda` bump; each member settle is `O(1)` and `K`-deferral collapses)
  but **not the payee**: the policyholder/`ClaimRouter` must trigger (or fund a keeper to
  trigger) `N` settles, receives an `N`-leg heterogeneous basket, and may need up to `N` swaps
  for a usable unit — a regression versus a pool's single `redeem`. The mitigation is the bounded
  `settleMembers([])` batch plus a protocol-funded keeper bounty as the *expected* claim path,
  not a fallback. Implementations MUST NOT loop over a mutual-members array on any non-admin
  custody-root path.
- **Basket settlement / collateral drift.** Capacity is **frozen at join**. Realized coverage is
  `(1 − δ)/h` for collateral drawdown `δ` and haircut `h`, not "worth the loss by construction":
  if a loss lands after a drawdown, the delivered basket is worth less in numeraire than the
  frozen `creditedValue`. The haircut (credited-value reduction at join) is the only buffer and a
  one-time guess. Heterogeneous mode ships the two mitigations first-class: per-collateral haircut
  tiers (`mutualHaircutBps`) and the **junior shortfall absorber** (§7), a `juniorBps` premium
  split drawn at settle to top up numeraire recovery. Both SHOULD be sized to a stress drawdown;
  they *bound* the shortfall, they do not eliminate it (any residual is still surfaced as
  `MutualLossShortfall`). The homogeneous-numeraire subset has no drift and is unaffected.
- **Denominator-shrinkage coupling.** A shared `totalShares` couples members: capacity flight
  during a systemic event shrinks the denominator and bites the `Lambda <= 1e18` clamp sooner — a
  wrong-way fragility independent liens do not have. It is bounded (not eliminated) by the
  deallocation window and any MCR-analog leverage cap the periphery imposes; the resulting
  under-recovery is always surfaced as `MutualLossShortfall`.
- **Adverse selection / no variation margin.** If premium accrues on a frozen weight while loss
  delivers a fraction of a basket at current price, a rational underwriter is rewarded for posting
  the most volatile collateral that clears the static join-time haircut. Heterogeneous mode blunts
  (does not remove) this with the **down-only `remark`** (§7): premium accrues on `premiumWeight`,
  which is band-derived and can be permissionlessly ratcheted *down* as a member's collateral
  depreciates — never up — so a decayed position stops earning full premium. Fine-grained pricing
  (utilization-curve premium, deductible/co-insurance) remains a periphery concern, in scope for
  any production deployment of the heterogeneous basket.
- **Premium-stream integrity (permissionless funding).** `fundMutualPremium` is permissionless, so
  the Synthetix `notifyRewardAmount` griefing surface is closed by four guards (§6): the stream
  `duration` is bounded to `[MIN_STREAM_DURATION, MAX_STREAM_DURATION]`
  (`StreamDurationOutOfBounds`, which also fences the `uint64 periodFinish` cast against
  truncation-into-the-past), a live stream's end never moves earlier (so a dust fund cannot
  compress it), a live stream's `rewardRate` may only be maintained or raised
  (`PremiumRateDecreased`), and solvency is enforced once at funding time (INV-P2). The premium and
  junior reserves are true partition compartments (INV-P1 / INV-P13) mutated only through their
  `LedgerLib` helper pairs, and premium banking inside a loss settle is failure-isolated
  (skip-not-revert, INV-P10) so a premium-arithmetic edge can never brick a validated loss.
- **Frozen-at-join valuation.** `creditedValue` and `E_i` are immutable post-join by design;
  contributions, strategy sweeps, agreements, and normal close paths are all barred so nothing
  can drift them (§5). The settle clamp on live `c.amount` (INV-G10) and the gap-preserving
  decrement (INV-G9) jointly keep the aggregate exposure invariant intact under partial,
  out-of-order, multi-mutual settlement.
- **Index integrity.** `Lambda` is monotonic, capped, and bumped exactly once per declaration at
  execute (never at initiate), after a challenge window strictly longer than the per-commitment
  floor. Re-initiation is rate-limited and stale proposals are permissionlessly cancellable, so
  the join/exit freeze a pending loss imposes is neither a free nor a permanent capital trap.

## 11. Backwards compatibility

This is a normative-optional extension of `ERC-COMMITMENTS`. It introduces no change to the core custody ledger, the commitment lifecycle, or any other sibling extension: a manager that does not implement the mutuals surface remains fully conformant to the core standard. Mutual membership only ever *adds* gating on commitments a member explicitly enrolls (§5) — the terminal-close, unbond, and forfeit-initiation paths revert `CommitmentInMutual` on a member commitment, with committer-liveness preserved through the mutual exit path. Non-member commitments and existing deployments are unaffected. The nine storage mappings are appended (offsets 29..37) with no reordering of prior fields.

## 12. Reference implementation

- `src/extensions/mutuals/MutualLib.sol` — the loss index (Λ), premium index (Π), attested heterogeneous mode, and junior absorber core logic (an external delegatecall library of the manager).
- `src/core/interfaces/ICommitmentManager.sol` — the mutual structs, events, and errors.
- `src/core/manager/storage/CommitmentManagerStorage.sol` — the nine append-only mutual mappings (offsets 29..37).
- `src/extensions/mutuals/` — owning extension directory for `MutualRegistry`, `LinkedMutualPolicy`, `PremiumScheduler`, `ClaimRouter`, and `OptimisticMutualArbiter`.

## 13. Test cases

- `test/manager/Mutual.t.sol`, `test/mutual/Mutual.t.sol`, `test/mutual/PremiumPolicy.t.sol` — the loss, premium, and heterogeneous mutual suites.
- `test/manager/conformance/PartitionInvariant.t.sol` — the extended partition-invariant fuzz (INV-P1 premium compartment, INV-P13 junior compartment).
- `test/manager/StorageSlots.t.sol` — locks the mutual storage offsets.
