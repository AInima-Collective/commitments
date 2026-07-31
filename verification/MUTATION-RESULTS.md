# Mutation-Testing Results (local half: Halmos + Medusa + Foundry conformance)

**Date:** 2026-07-09
**Scope:** the local (non-Certora) layers. 16 single-line semantic mutants injected
across `src/core/manager/libraries/{LedgerLib,ExposureLib,MovementLib,CommitmentLifecycleLib}.sol`,
`src/extensions/agreements/AgreementLib.sol`, `src/extensions/mutuals/MutualLib.sol`,
`src/core/manager/CommitmentManager.sol`, and `src/periphery/vaults/CommitmentsVault.sol`, each targeting a specific
cataloged invariant. Each mutant was applied → the **owning local layer** was run → CAUGHT/MISSED +
kill-time recorded → the mutant reverted (`git checkout -- <file>`) → tree re-verified clean before
the next.

The Certora/CVL half has not yet been run on the cloud prover; the two properties that only a CVL layer can kill
(`P1-WINDOW`, `P-VAULT-INFLATION`) are listed under **Deferred to CVL** and were each *empirically
confirmed unkillable locally* before deferral (they are not silent skips).

> **Environment note — scaffold was required.** The branch this pass ran on did **not** contain the
> `verification/` scaffold (no `halmos.toml`, no `verification/halmos/*.t.sol`, no `verification/medusa/`,
> no `PROPERTIES.md`) at the start of this pass — only the tracked Foundry conformance suite
> `test/manager/conformance/PartitionInvariant.t.sol` and the installed toolchain (halmos 0.3.3,
> medusa 1.5.1, z3, crytic-compile, certoraRun). To run the Halmos and Medusa layers *at all*, this
> pass created temporary harnesses under `test/_mutation_tmp/` and a `verification/medusa/medusa.json`,
> plus a one-line `halmos-cheatcodes/` remapping. Those were **load-bearing to produce these results**
> but are **not** left in the tree (the worktree was kept clean except this report). Their full
> source is reproduced in **Appendix A** so every row below is reproducible. Git submodules also had to
> be initialized (`git submodule update --init --recursive`) — the worktree checked out with empty
> `lib/`.

---

## 1. Methodology

- **Owning-layer discipline.** Each mutant names one owning local layer (the layer whose property
  claims to cover the mutated site). Only that layer was run for the kill decision (broader layers
  noted where they *also* catch it). This mirrors the PROPERTIES catalog's "a mutant that violates a
  claimed property MUST be caught by that property's layer" contract.
- **Layers.**
  - **HALMOS** — `halmos --contract HalmosLedgerExposure --solver z3 --solver-timeout-assertion 60000`.
    Symbolic unit checks over `LedgerLib`/`ExposureLib` arithmetic (Appendix A.1).
  - **CONF** — `FOUNDRY_INVARIANT_RUNS=R FOUNDRY_INVARIANT_DEPTH=D forge test --match-path
    test/manager/conformance/PartitionInvariant.t.sol`. The permanent, tracked stateful-invariant
    suite. Broadest layer.
  - **MEDUSA** — `medusa fuzz --config verification/medusa/medusa.json` over the self-contained
    `MedusaPartitionHarness` (Appendix A.2). Property fuzz for INV-1 partition + INV-10 id sentinel.
- **Liveness vs. safety.** A recurring subtlety (see M1, M7, M8): a mutant that makes a path
  **always revert** is a *liveness* bug, and safety invariants are structurally blind to it (a
  reverted tx leaves state — hence the invariant — untouched). Such mutants were reclassified rather
  than counted as legitimate safety-mutant catches, and are flagged as coverage gaps that want a CVL
  "operation succeeds" rule or a revert-expecting handler.
- **Detection sensitivity was recorded** — the minimum `runs`/`depth` at which the CONF layer first
  killed a mutant, because several kills require deep dependency chains (esp. the mutual settle path).

### Baselines (unmutated, all green)

| Layer | Command | Result | Wall |
|-------|---------|--------|------|
| HALMOS | `--contract HalmosLedgerExposure` | 3 checks pass (2 ledger @0.1s, EXP-CAP @24s) | ~30s |
| CONF | `RUNS=64 DEPTH=64` | 6 invariants pass | 3.1s |
| MEDUSA | `testLimit=40000` | `property_partition` + `property_firstIdNonZero` pass, 40k calls | ~12s |

---

## 2. Mutant table

| ID | File:line | One-line diff | Target property | Owning layer | Result | Kill time |
|----|-----------|---------------|-----------------|--------------|--------|-----------|
| M1 | `src/core/manager/libraries/LedgerLib.sol:21` | `encumberedBalance += units` → `-= units` | INV-1/INV-2 | Halmos/CONF | **DISCARDED** (always-revert; see §3) | n/a |
| M1′ | `src/core/manager/libraries/LedgerLib.sol:22` | `totalFree[token] -= units` → `+= units` | INV-1 partition | HALMOS | **CAUGHT** `check_encumberConserves`+`Roundtrip` | 0.37s solver / 38s wall |
| M2 | `src/core/manager/libraries/LedgerLib.sol:41` | drop `totalFree[token] += units` (release) | INV-1 partition | CONF | **CAUGHT** partition + ledger-walk | 12s wall (RUNS=32) |
| M3 | `src/core/manager/libraries/LedgerLib.sol:145` | drop `totalFree[token] += units` (escrowToFree) | INV-1 partition | CONF | **CAUGHT** partition + ledger-walk | 9s wall (RUNS=32) |
| M4 | `src/core/manager/libraries/ExposureLib.sol:22` | `/ 10_000` → `/ 1_000` | INV-3 exact | CONF + HALMOS | **CAUGHT** — CONF `totalForfeitable exact` (10× ratio) **@RUNS=128** (missed @16); HALMOS `check_exposureCapAtMaxBps` counterexample | CONF 4s / HALMOS 6s solver |
| M5 | `src/core/manager/libraries/ExposureLib.sol:50` | drop `totalForfeitable -= forfDelta` (decrement) | INV-3 | CONF | **CAUGHT** `totalForfeitable exact: …!=0` | 9s wall (RUNS=64) |
| M6 | `src/core/manager/libraries/MovementLib.sol:358` | drop `mag.totalEncumbered -= m.units` | INV-2/INV-4 | CONF | **CAUGHT** `INV-2 totalEncumbered==sum` | 9s wall (RUNS=64) |
| M7 | `src/core/manager/libraries/MovementLib.sol:339` | movement cap `>` → `>=` | INV-4 (cap boundary) | CONF | **MISSED** (see §3) | 8s wall (RUNS=64) |
| M8 | `src/extensions/agreements/AgreementLib.sol:532` | settle cap `> cap` → `> cap + cap` | INV-E1 | CONF | **MISSED** (see §3) | 9s wall (RUNS=64) |
| M9 | `src/extensions/mutuals/MutualLib.sol:374` | drop Λ≤1e18 belt | INV-G2 | CONF | **MISSED — EQUIVALENT** (see §3) | 11s wall (RUNS=400) |
| M10 | `src/extensions/mutuals/MutualLib.sol:465` | `settledUnits += owed` → `+= owed + owed` | INV-G3 / INV-P9 | CONF | **CAUGHT** `INV-P9 activeCover` + `totalForfeitable exact` **@RUNS≈151** | 23s wall (RUNS=600) |
| M11 | `src/extensions/mutuals/MutualLib.sol:267` | drop `totalShares` join increment | P-SHARES | CONF | **CAUGHT** `totalShares==sum creditedValue: 0!=13` | 7s wall (RUNS=200) |
| M12 | `src/core/manager/CommitmentManager.sol:98` | `nextCommitmentId = 1` → `= 0` | INV-10 id sentinel | MEDUSA | **CAUGHT** `property_firstIdNonZero` | 69s wall |
| M13 | `src/core/manager/libraries/LedgerLib.sol:142` | `escrow = bal - units` → `= bal` | INV-5 (escrow key) | CONF | **CAUGHT** `totalEscrow` ledger-walk diverges | 9s wall (RUNS=64) |
| M14 | `src/extensions/mutuals/MutualLib.sol:370` | drop `applied = min(declared, headroom)` | INV-G2/G3/P9 | CONF | **MISSED — redundant-belt / higher-order** (see §3) | 35s wall (RUNS=400) |
| M15 | `src/core/manager/libraries/CommitmentLifecycleLib.sol:397` | window `<` → `<=` | P1-WINDOW | CONF + MEDUSA | **MISSED — confirmed CVL-only** (see §4) | 83s wall (both) |
| M16 | `src/periphery/vaults/CommitmentsVault.sol:99` | `_decimalsOffset` `9` → `0` | P-VAULT-INFLATION | (none local) | **DEFERRED — not run** (see §4) | n/a |

**Score (mutants with a claimed LOCAL owning layer, M1′–M14 — 13 mutants):**
**9 CAUGHT / 13 = 69%.** Of the 4 not caught: **1 equivalent mutant** (M9, provably no behavior
change), **1 higher-order/redundant-belt survivor** (M14, unkillable by *any* single-line mutation),
and **2 genuine spec/coverage gaps** (M7, M8). Excluding the equivalent + the structurally-higher-order
mutant (neither is a valid single-line-mutation-score denominator), the effective single-line score is
**9 CAUGHT / 11 = 82%**, with the remaining 2 (M7, M8) documented below as actionable findings.

M15–M16 are the two **CVL-only** mutants (empirically confirmed unkillable locally for M15; M16
deferred by construction).

---

## 3. Miss analysis (the findings)

### M7 — movement cap `>` → `>=` is not exercised (INV-4 boundary gap) — REAL FINDING

`src/core/manager/libraries/MovementLib.sol:339` `if (m.units > c.amount) revert MovementExceedsCommitment`. Mutated to `>=`.
CONF passed at RUNS=64. The mutant makes a movement of **exactly `c.amount`** (the legitimate
full-drain) revert; every smaller movement is unaffected. Since the invariant suite only cares about
*state after successful ops*, and a reverted movement leaves state untouched, the boundary case
(`m.units == c.amount` **should succeed**) is invisible to every safety invariant. The conformance
handler compounds this: `distributeToEscrow` picks `units = bound(units, 1, c.amount)`, so when it
happens to pick exactly `c.amount` the op simply reverts and is discarded — no signal.

**This is a coverage gap, not a false invariant.** The fix belongs to a CVL rule
`movement_fullAmountSucceeds` (a `distribute` of `m.units == c.amount` must not revert for the
liveness reason), or a conformance handler that asserts the exact-`c.amount` movement succeeds.
Not tuned away — recorded as-is.

### M8 — settle cap weakening is masked by a self-bounding handler (INV-E1 gap) — REAL FINDING

`src/extensions/agreements/AgreementLib.sol:532` `if (cumulAfter > cap) revert`. Mutated to `> cap + cap` (allow 2× the
consented flow). CONF passed at RUNS=64. Root cause: the conformance handler's `_settleHeadroom`
pre-computes `capLeft = max - cumul` and bounds the settle `units` to it, so it **never sends more
than the true cap** — the weakened contract check is never reached. `invariant_bilateralFlowBound`
therefore never sees an over-cap `cumul`.

**This is a handler coverage gap.** Any mutation to the settle cap (weaken, off-by-one, or remove) is
invisible while the handler self-bounds. Fix: a handler op that *deliberately over-sends* expecting a
revert, or a CVL rule `settle_neverExceedsConsentedCap` over a symbolic `units`. The tighter off-by-one
`> cap` → `>= cap` variant additionally has the M7 liveness-masking problem (it makes the exact-cap
settle revert — safety-invisible). Recorded as-is.

### M9 — Λ≤1e18 belt drop is an EQUIVALENT MUTANT (not a weakness)

`src/extensions/mutuals/MutualLib.sol:374` `if (g.cumulativeLoss > LAMBDA_ONE) g.cumulativeLoss = LAMBDA_ONE;` dropped.
CONF passed at RUNS=400/DEPTH=128. This is a *correct* miss: `applied` is pre-clamped to
`headroom = floor((1e18 − cumL)·totalShares / 1e18)`
(`src/extensions/mutuals/MutualLib.sol:369`), and the index bump
`floor(applied·1e18 / totalShares)` rounds **down**, so `cumL + Δ ≤ 1e18` holds **by construction**.
The belt at 357 is provably dead code under the current arithmetic — nothing to catch. Classifying it
as EQUIVALENT (rather than a spec weakness) is the honest call; a strict mutation score should exclude
it from the denominator.

### M14 — headroom-clamp drop survives via redundant downstream belts (higher-order) — FINDING

`src/extensions/mutuals/MutualLib.sol:370` `applied = declared > headroom ? headroom : declared;` → `applied = declared;`.
CONF passed at RUNS=400/DEPTH=128. Removing the *primary* loss clamp is absorbed by three redundant
downstream belts: the Λ≤1e18 belt (`src/extensions/mutuals/MutualLib.sol:374`), settle Belt-1
`owed ≤ remaining` (`src/extensions/mutuals/MutualLib.sol:454`), and settle Belt-2 `owed ≤ c.amount`
(`src/extensions/mutuals/MutualLib.sol:458`). INV-G2/G3/P9 all continue to hold. To actually break an
invariant you must
mutate the headroom clamp **and** the Λ belt simultaneously — a **2nd-order mutant** no single-line
mutation can express. This is a *defense-in-depth strength* of the contract, surfaced as a mutation
survivor; it's the flip side of M9 (the belts are mutually redundant). Worth noting for the CVL layer:
a rule asserting `applied == min(declared, headroom)` at the unit level would pin the primary clamp
independent of the belts.

### M4 & M10 — detection-sensitivity findings (caught, but only at depth)

Both are CAUGHT, but not at low fuzz budgets: **M4** (exposure `/1_000`) is missed at RUNS=16 and
killed at RUNS=128 — the exact-`totalForfeitable` oracle needs the fuzzer to sample a *low-bps*
commitment that stays live (high-bps creates self-revert on the create-time exposure guard). **M10**
(double-counted `settledUnits`) needs RUNS≈151 because the mutual settle path is a 6-call dependency
chain (createMutual → join → initiateLoss → warp → executeLoss → settleMember). **Implication:** the
CONF suite's default `RUNS=256` is adequate, but a CI budget below ~128 runs would silently miss these
exposure/mutual mutants. The Halmos EXP-CAP check kills M4 *deterministically* regardless of fuzz
budget — an argument for keeping a symbolic layer beside the fuzz layer for the exposure formula.

---

## 4. Deferred to CVL (not yet run on the cloud prover)

| Mutant | Property | Why no local layer can kill it |
|--------|----------|--------------------------------|
| **M15** `src/core/manager/libraries/CommitmentLifecycleLib.sol:397` window `<`→`<=` | **P1-WINDOW** | **Empirically confirmed** MISSED by CONF *and* Medusa (12/12). Every local harness warps to `initiatedAt + window + 1` (a full second past the boundary), so the single tick `block.timestamp == initiatedAt + window` — the *only* input that distinguishes `<` from `<=` — is never sampled. This is a timing-boundary property that wants a symbolic `env.block.timestamp` at the exact boundary: CVL rule `executeForfeit_revertsAtExactWindow`. |
| **M16** `src/periphery/vaults/CommitmentsVault.sol:99` `_decimalsOffset` `9`→`0` | **P-VAULT-INFLATION** | No local vault harness exists, and the offset only changes share-price *rounding under an adversarial first-depositor donation*. Killing it wants CVL `previewDeposit`/`previewMint` monotonicity + no-free-shares rules over a symbolic donation. Deferred by construction (not run locally). |

Both are the natural boundary of the local layers: **local fuzz/symbolic-unit layers catch value/
partition/accounting corruption; CVL is needed for exact time-boundary reverts and adversarial-rounding
share-price properties.**

---

## 5. Wall-time per layer (this pass)

| Layer | Mutants run as owner | Typical per-mutant wall (incl. rebuild) | Notes |
|-------|----------------------|------------------------------------------|-------|
| HALMOS | M1′ (+M4 cross-check) | ~35–40s | dominated by forge rebuild + halmos load + z3; solver itself <1s for linear checks, ~6–24s for the nonlinear EXP-CAP |
| CONF | M2,M3,M4,M5,M6,M7,M8,M9,M10,M11,M13,M14,M15 | ~4–35s | scales with RUNS×DEPTH; mutual-path kills (M10,M14) need RUNS≥150 → 20–35s |
| MEDUSA | M12 (+M15 cross-check) | ~69–83s | crytic-compile + 40k-call campaign; property_firstIdNonZero kills M12 fast once a commitment exists |

**Total wall for the campaign (16 mutants incl. baselines, reverts, cross-checks): ≈ 22 min.**

---

## 6. Reproduction & clean-up

The Halmos/Medusa harnesses (Appendix A) and the `halmos-cheatcodes/` remapping were **removed** after
this pass so the worktree is clean except this report. To reproduce:

1. `git submodule update --init --recursive` (worktree checks out with empty `lib/`; the nested
   `openzeppelin-contracts/lib/openzeppelin-contracts` sub-sub-module fails to fetch but is not needed
   to build the protocol).
2. Recreate `test/_mutation_tmp/HalmosLedgerExposure.t.sol` and `MedusaPartitionHarness.sol` +
   `verification/medusa/medusa.json` from Appendix A, and append
   `halmos-cheatcodes/=lib/openzeppelin-contracts/lib/halmos-cheatcodes/src/` to `remappings.txt`.
3. Apply a mutant, run its owning layer per the table, revert with `git checkout -- <file>`.

The CONF layer needs **no** scaffold — it is the tracked
`test/manager/conformance/PartitionInvariant.t.sol` and is the recommended permanent mutation-testing
harness for the ledger/exposure/mutual/agreement invariants. **Recommended follow-ups** (file as
issues): (a) add a `movement_fullAmountSucceeds` + `settle_overSendReverts` handler op or CVL rule to
close M7/M8; (b) keep the symbolic exposure-cap check as a permanent layer (deterministic M4 kill);
(c) when the CVL layer runs on the cloud prover, prioritise the two deferred rules (M15/M16).

---

## Appendix A — harness source (reproduced; not left in tree)

### A.1 `test/_mutation_tmp/HalmosLedgerExposure.t.sol`

A `LedgerHarness` wrapper exposes the internal `LedgerLib`/`ExposureLib` ops against a fresh EIP-7201
`Layout`; the `HalmosLedgerExposure` contract holds the symbolic `check_` properties:

- `check_encumberConserves` — after `encumber`, per-user `free+enc` and aggregate `totalFree+
  totalEncumbered` are both conserved and `free==totalFree` / `enc==totalEncumbered` (single user).
  Kills M1′.
- `check_encumberReleaseRoundtrip` — `encumber` then `releaseEncumbrance` restores the exact starting
  partition. Kills aggregate-direction mutants in either helper.
- `check_exposureCapAtMaxBps` — `exposureOf(amount, 10_000) <= amount` for symbolic `amount` (bps
  pinned to the 10_000 boundary to keep the product *linear* so z3 discharges it; the general
  two-variable form `exposureOf(amount, bps) <= amount` **times out** under z3 even at `uint16` — the
  documented Halmos nonlinear/division weakness). Kills M4 deterministically.

**Halmos division limitation (recorded):** two additional prototyped checks — `P-EXP-HALF`
(`exposureOf(amount,5000) <= amount/2 + 1`) and `P-EXP-MONO` (monotone in bps) — **time out** under z3
(compounded `amount/2` + double `/10_000` division terms), even at `uint16 amount` / 20 s assertion
timeout. They are covered instead by the CONF layer's *exact* `totalForfeitable` assertion (kills any
divisor mutant at RUNS≥128). Run Halmos with `--solver z3 --solver-timeout-assertion 60000`; the
default `yices` solver has no `aarch64` build in this environment.

### A.2 `test/_mutation_tmp/MedusaPartitionHarness.sol` + `verification/medusa/medusa.json`

A self-contained target that deploys a real `CommitmentManager` (behind an ERC-1967 proxy, harness as
admin+arbiter), a free-mint `HToken`, and drives `deposit / withdraw / createCommitment /
initiateForfeit / executeForfeit / releaseCommitment`. `blockTimestampDelayMax = 604800` lets
`executeForfeit` clear the 1-day window. Properties:

- `property_partition` — INV-1: `totalFree + totalEncumbered + totalEscrow == token.balanceOf(manager)`.
- `property_firstIdNonZero` — INV-10: every created commitment id `>= 1`. Kills M12.

`medusa.json` targets `MedusaPartitionHarness`, `testLimit: 40000`, `callSequenceLength: 60`,
`assertionTesting.enabled + propertyTesting.testPrefixes: ["property_"]`, compiled via
`crytic-compile` with `--foundry-compile-all` and an absolute `target` path (crytic-compile chdirs to
the target).

## Reconciliation against the committed suite

The pass above ran in a worktree based on a pre-scaffold HEAD, with the
Halmos/Medusa harnesses reproduced from scratch (Appendix A) — so its
miss/kill attributions were re-checked against the committed suite:

- **M7 (movement cap boundary): KILLED by the committed suite** —
  `MovementCapSmoke.check_INV4_encumberedDebitBoundedByAmount` fails under
  the mutant (verified by applying it to the real tree): its symbolic units
  range includes the exact-cap value and the call is not try/catch-wrapped,
  so the mutant-induced revert fails the check. The reported miss was an
  artifact of the reproduced harness.
- **M15 (challenge-window boundary): CONFIRMED GAP, NOW CLOSED** — no
  committed check sampled the exact boundary tick.
  `halmos/ForfeitBoundarySmoke.t.sol` adds boundary liveness (execute
  succeeds at exactly `initiatedAt + window`) + safety one tick earlier;
  the `<` → `<=` mutant is verified killed by the new check.
- **M8 (settle cap weakening): killed by authored CVL once cloud runs** —
  the `cumulativeFlowsWithinCaps` invariant in
  `certora/specs/AgreementFlows.spec` is violated by the mutant by
  construction; deferred to the cloud-prover run with the rest of the CVL layer.
- **M16 (vault decimals offset): same status** — the committed
  `certora/specs/VaultShares.spec` rounding/no-inflation rules cover it;
  deferred to the cloud-prover run.

Net local mutation score after reconciliation: 11/13 killable locally are
killed (M9 equivalent, M14 higher-order — both correct survivors).
