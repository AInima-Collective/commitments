# Property catalog — formal verification

This file is the single source of truth for property → layer → status across
the verification stack. A PR that changes a covered contract must keep this
table honest — CI treats stale specs as failures, not skips.

**Layers**: `CVL` = Certora rule/invariant (`certora/`), `Halmos` = symbolic
`check_*` harness (`halmos/`), `Fuzz` = Foundry invariant suite
(`test/manager/conformance/`), `Medusa` = coverage-guided campaign on the same
handlers (`medusa/`).

Covered production sources use the final repository layout: manager interfaces and
implementation under `src/core/`, manager libraries under
`src/core/manager/libraries/`, Agreement and Mutual delegatecall libraries under
`src/extensions/agreements/` and `src/extensions/mutuals/`, feature contracts under
`src/extensions/{mesh,rewards,services}/`, and the vault under
`src/periphery/vaults/`. The property statements and coverage claims below are
unchanged by that path migration.

**Status values**: `verified` (green proof/harness in CI) · `fuzz-only`
(sampled, no proof) · `planned` (not yet attempted) · `expected-fail(#issue)`
(violation found, tracked, rule kept failing until fix) · `gap` (deliberately
unverified, reason given).

## Verification assumptions (stated once, apply everywhere)

- **Standard tokens**: no fee-on-transfer, rebasing, or transfer hooks —
  matches the ERC's deployment-side screening stance. `deposit` credits
  measured deltas, so fee-on-transfer degrades gracefully but is out of proof
  scope.
- **Gas is abstracted** by Certora/Halmos. Any property whose truth depends on
  the 500k hook gas cap (`MovementLib._guardedCall` park-don't-forfeit) is
  owned by Medusa/Foundry with real gas — never claimed as proved.
- Proofs run against implementations linked with their delegatecall libraries
  (Certora `files` scene / Halmos static-link profile); proxy storage-slot
  regressions stay owned by `test/StorageSlots.t.sol` + `test/manager/StorageSlots.t.sol`.

## P0 — Ledger soundness

| ID | Property | Layers | Status |
|---|---|---|---|
| INV-1 / INV-P13 | Partition: `Σ(free+encumbered) + Σescrow + Σ(premiumPool+juniorPool) == balanceOf(manager)` per token | CVL ghost sums; Fuzz; Medusa | fuzz-only; Medusa smoke green 2026-07-09; tier-1 aggregate CVL authored+typechecked (`certora/specs/ManagerLedger.spec`); not yet run on the cloud prover (tier-2 ghost walk planned) |
| INV-2 | Per-actor encumbered == Σ active commitment amounts | CVL; Fuzz | fuzz-only (CVL planned) |
| INV-3 | `totalForfeitable ≤ totalEncumbered` per (user, token) | CVL; Fuzz | fuzz-only; CVL authored+typechecked (`certora/specs/ManagerLedger.spec`); not yet run on the cloud prover |
| INV-4 | Strategy movement debits ≤ bound commitment's `amount`; recipients restricted to commitment parties | CVL; Halmos | **Halmos verified** (`halmos/MovementCapSmoke.t.sol`, non-vacuity mutation-checked; symbolic-`units` debit-bound check runs at `maxPenaltyBps == 0` to linearize the exposure math — nonzero-penalty cap interaction owned by Fuzz/Medusa); distribute-path CVL authored+typechecked (`certora/specs/ManagerLedger.spec`); not yet run on the cloud prover |
| INV-5 | Escrow isolation: no movement debits another strategy's escrow | CVL; Halmos | **Halmos verified** (`halmos/EscrowIsolationSmoke.t.sol`, non-vacuity mutation-checked); claim-path CVL authored+typechecked (`certora/specs/ManagerLedger.spec`); not yet run on the cloud prover |
| INV-10 | `commitmentId ≥ 1`; 0 reserved as non-attribution sentinel | Halmos; CVL | **Halmos verified** on `createCommitment` (`halmos/CreateCommitmentSmoke.t.sol`) + `createAndFund` / `batchCreateCommitments` (`halmos/CreatePathsSmoke.t.sol`), all non-vacuity mutation-checked; `createCommitmentFor` (EIP-712 relayer) documented as a Halmos gap in that file. **CVL locally proven** (open-source CertoraProver, 2026-07-09): `initializeSeedsIdCounter` / `createCommitmentReturnsNonZeroId` / `createAndFundReturnsNonZeroId` all "Not violated" — the create rules assume the initialized state (`nextCommitmentId ≥ 1`), discharged by the initialize/monotonicity rules since the prover otherwise starts from the unreachable pre-`initialize` storage. Parametric `idCounterNeverReturnsToZero` first full run (2026-07-12): ~120 methods "Not violated"; 4 instances triaged, none a protocol bug — `joinMutual` (spurious: the initial scene lacked a token model, so the unresolved IERC20 call on a symbolic token address havoc'd the manager itself → fixed by adopting the standard DummyERC20 DISPATCHER scene), `initialize` + `upgradeToAndCall` (filtered with in-spec justification: unreachable inconsistent init state / arbitrary-implementation havoc), `createCommitmentFor` (hashing-bound tool limit → `optimistic_hashing` + bound 512, faithful to the MAX_METADATA_URI_LENGTH / MAX_STRATEGIES caps), `batchReleaseCommitments` (timeout; not yet re-run with the token model in scene). Full parametric rerun still outstanding |
| P0-FREE | `freeBalance` withdrawable in full at any time (no path locks free funds) | CVL rule | CVL authored+typechecked (`certora/specs/ManagerLedger.spec`); not yet run on the prover. Tier-2 discharge authored+typechecked (`ManagerLedgerTier2.spec`): ghost sums via EIP-7201 slot-pattern hooks prove Σ per-user free/encumbered and Σ per-strategy escrow equal the O(1) aggregates (walk + mirror-consistency invariants); with the walk proven, `free(u) ≤ totalFree` follows since every entry is a uint256 term of the sum. Not yet run on the prover |

## P1 — Forfeit / unbond lifecycle

| ID | Property | Layers | Status |
|---|---|---|---|
| P1-WINDOW | Forfeit cannot execute before `initiatedAt + challengeWindow`; `challengeWindow ≥ 86_400` and immutable per commitment | CVL; Halmos | CVL authored+typechecked (`certora/specs/ManagerLifecycle.spec`); not yet run on the cloud prover |
| INV-7 | No two concurrent active forfeit proposals on one commitment | CVL | CVL authored+typechecked (`certora/specs/ManagerLifecycle.spec`); not yet run on the cloud prover |
| P1-PULL | Forfeit payout is ledger credit only (pull payment) — no external transfer in the execute path | CVL; Halmos | no-strategy case CVL authored+typechecked (`certora/specs/ManagerLifecycle.spec`); not yet run on the cloud prover |
| P1-LIVE | Committer liveness: `requestUnbond → finalizeUnbond` reachable from every active-commitment state (incl. stale-forfeit force-cancel, ERC §C.5) | CVL parametric; Fuzz | maturity + stale-forfeit composite CVL authored+typechecked (`certora/specs/ManagerLifecycle.spec`); not yet run on the cloud prover |
| INV-6 | Terminal exclusivity: `¬(released ∧ forfeited)` per commitment, both flags sticky | CVL | covered by `terminalFlagsMonotoneAndExclusive` in `certora/specs/ManagerLifecycle.spec` (authored+typechecked; not yet run on the cloud prover) |
| INV-8 | At most one pending unbond per commitment between create and finalize | CVL; Fuzz | fuzz-only (promoted from ERC invariant table; CVL rule planned with tier-2) |
| INV-9 | `strategiesOf(id).length ≤ MAX_STRATEGIES (8)`, immutable post-create | Halmos; Fuzz | fuzz-only (create-path bound enforced in `_validateCreateParams`; targeted Halmos check planned) |
| P1-FSM | Only spec-legal status transitions (Active→Released/Expired/Forfeited/Unbonded …) | CVL | terminal flags + proposal lifecycle CVL authored+typechecked (`certora/specs/ManagerLifecycle.spec`); not yet run on the cloud prover |

## P2 — Agreements + mutuals

| ID | Property | Layers | Status |
|---|---|---|---|
| INV-E1 | Bilateral cumulative flows per direction never exceed caps | CVL; Fuzz | fuzz-only (CVL planned) |
| INV-P9/P9' | Mutual active-cover identities; `deliverable ≤ c.amount` | Fuzz; CVL (homogeneous identity) | fuzz-only |
| INV-G2/G3/G6 | `cumulativeLoss ≤ 1e18`; `totalShares == Σ creditedValue`; `settledUnits ≤ forfeitableUnits` | Fuzz; Halmos (allocation math) | **Halmos verified** (`halmos/MutualMathSmoke.t.sol`, homogeneous 1-mutual/2-member scene, symbolic loss/join ≤ 1_000e18, all non-vacuity mutation-checked): INV-G2 `executeMutualLoss` Λ-cap; INV-G6 `settleMembers` Belt-1 clamp; INV-G3 verified as the per-join **delta** form (`ΔtotalShares == creditedValue == E_i` at a concrete `maxPenaltyBps` to keep `E_i = amount·bps/1e4` linear — the full Σ identity is impractical symbolically, the delta is the inductive step). Heterogeneous band/haircut weight owned by Fuzz/Medusa. Fuzz aggregate still green |
| P2-MONO | Loss index Λ monotone non-decreasing; premium index rate non-decrease (S6) | Halmos; Fuzz | **Halmos verified** (`halmos/MutualMathSmoke.t.sol`, non-vacuity mutation-checked): loss half is the INV-G2 `Λ' ≥ Λ` monotonicity assert; premium half asserts the S6 premium-per-cover index Π (`premiumPerShareStored`) never decreases across `fundMutualPremium` + time-warp + poke (symbolic funding amount ≤ 1_000e18, concrete 1-day duration to satisfy the S6 live-stream rate-non-decrease guard). Fuzz still green |

## P3 — Vault + strategies

| ID | Property | Layers | Status |
|---|---|---|---|
| P3-PPS | Share-price non-decrease under deposit/withdraw round-trips; no first-depositor inflation | CVL (MetaMorpho/workshop base); Fuzz | fuzz-only; CVL authored+typechecked (`certora/specs/VaultShares.spec`, conf `confs/VaultShares.conf`) — share-price non-decrease across deposit/mint/withdraw/redeem/donate on the **idle vault** (no strategy; strategy-set case is a documented gap deferred to the honest-oracle obligation, owned by Fuzz/Medusa), plus division-free no-inflation core (`depositRedeemRoundTripNoGain` / `mintWithdrawRoundTripNoFreeShares`, robust to attacker `donate()`). `totalSupply == Σ balances` deliberately skipped (ERC20 property, no aggregate ghost in scene — assumption A5). Not yet run on the cloud prover |
| P3-ROUND | `deposit/mint/withdraw/redeem` rounding favors the vault | CVL; Halmos | CVL authored+typechecked (`certora/specs/VaultShares.spec`, conf `confs/VaultShares.conf`) — the standard four rounding directions asserted as division-free cross-products against the exact virtual-shares (offset 9) ratio, each pinned to the OZ preview↔action equality (deposit/redeem floor, mint/withdraw ceil) plus the `convertTo{Shares,Assets}` floor identities. Not yet run on the cloud prover |
| P3-PARK | Hook failure (revert/OOG/return-bomb) parks, never blocks release/forfeit/finalize or corrupts partition; a later `sweepFailedHook` re-drives | Medusa/Fuzz ONLY (gas-precise) | fuzz-only — **never claim proof coverage** — Medusa campaign green 2026-07-09 (`medusa/AdversarialStrategies.sol` + Wave 6 of `medusa/MedusaManagerHarness.sol`; `property_park_lifecycleAlwaysLands` / `property_park_markerWellFormed` / `property_park_sweepClearsOrPersists` + `property_partition_inv1`) |

## P4 — Periphery (Halmos-only + gaps)

Targeted Halmos harnesses (18 checks, all non-vacuity mutation-checked; every
concession documented in the harness NatSpec). No CVL coverage in v1
(documented gap). Each harness inherits `HalmosBase`; the manager-in-scene
harnesses etch the five delegatecall libs.

| ID | Property | Layers | Status |
|---|---|---|---|
| P4-REG | Registry delegation accounting: `onDelegationReleased` / `onDelegationForfeited` decrement the operator's `totalDelegatedStake` by EXACTLY the credited (`registeredAmount`) snapshot and never underflow (clamp-to-zero); register produces an active, self-stake-counted record | Halmos | **Halmos verified** (`halmos/RegistryDelegation.t.sol`, 4 checks, non-vacuity mutation-checked). Symbolic over the delegation amount. Concessions: mesh UNWIRED (the `_meshOn*` no-ops; registry↔mesh lockstep is a separate Fuzz/Medusa property), strategy-free single-token scene, hooks driven via `vm.prank(manager)` (same accounting effect as the full release/forfeit lifecycle). CVL: documented gap |
| P4-MESH | Mesh visited-set cycle termination: the denom-provenance walk (`FlowPathLib.walk` via `denomPath`) on a concrete 2-node cycle TERMINATES (returns, no revert/divergence) with the fixed length-3 cycle-break path; the `MAX_PATH_DEPTH == 64` guard rejects out-of-range `maxDepth`; below the cycle length the walk truncates at the depth bound | Halmos | **Halmos verified** (`halmos/MeshTermination.t.sol`, 3 checks, non-vacuity mutation-checked). Depth bound 64 (`FlowPathLib.MAX_PATH_DEPTH`). Concessions: 2×`FanInNode` clones for both cycle nodes (walk is node-type-agnostic over the shared IFlowQuery surface), OZ-`Clones.clone`d directly (impl constructor locks init; MeshFactory whitelist bypassed). `maxDepth` pinned CONCRETE at {3, 32, 64} — `walk` allocates `new DenomLink[](maxDepth)` and halmos rejects a symbolic dynamic-array length (`NotConcreteError`); the returned path is invariant across all `maxDepth ≥ 3` so the three depths fully characterize the family. CVL: documented gap |
| P4-MERKLE | Merkle claim non-replay (cumulative model): a valid claim pays exactly the leaf amount once; the identical second claim reverts `NoOp` (pays 0 — no double-pay); a below-recorded cumulative reverts `CumulativeRegression`; an off-tree amount reverts `InvalidProof` | Halmos | **Halmos verified** (`halmos/MerkleClaimReplay.t.sol`, 3 checks, non-vacuity mutation-checked). Hand-built 2-leaf tree (OZ sorted-pair hashing), symbolic claimed amount. `processClaim` leaf = `keccak256(abi.encode(msg.sender, token, cumulativeAmount))`. Concessions: `activationDelay == 0` (root active same block; activation timing is orthogonal), coordinator funded via `depositRewards`, standard (no-fee) token. CVL: documented gap |
| P4-712 | EIP-712 relayer-create envelope (`createCommitmentFor` / `CREATE_COMMITMENT_TYPEHASH`): the verified typed-data digest DIFFERS the instant any signed field (amount/counterparty/arbiter/nonce/deadline) differs — params A does not authorize params B; the same envelope cannot be replayed (`InvalidNonce`); an expired deadline reverts (`SignatureExpired`); the untampered envelope succeeds | Halmos | **Halmos verified** (`halmos/Eip712Envelope.t.sol`, 8 checks, non-vacuity mutation-checked). Digest-binding checks symbolic over the tampered field; nonce-replay/deadline/happy end-to-end through the real manager. **SYMBOLIC-TAMPER GAP** (documented): halmos models `ecrecover` as an UNINTERPRETED function and does not discriminate signatures even over a CONCRETE tampered digest (confirmed: symbolic tamper → spurious witness `p_arbiter == 0x01`; concrete tamper → empty `∅` counterexample). So "tampered params revert end-to-end" is NOT halmos-provable — owned by Foundry (real ecrecover). What halmos proves soundly is the digest-binding half (keccak256 is modeled): a signature authorizes exactly one digest, so a provably-different digest is a provably-different (unauthorized) envelope. CVL: documented gap |

## ERC MUST-clause mapping

The full clause-by-clause mapping lives in `PROPERTIES-ERC-MAP.md`:
**285 normative MUST/MUST NOT/SHALL rows** across the seven spec files —
79 mapped to catalog IDs above, 154 `NEW-*` proposed properties, 52
documented gaps (off-chain / ABI-shape / deployment-policy, each with a
reason). Its deviate-risk list has been self-reviewed line-by-line against
the implementation (see the verification notes in that file — 12/12 items
conform, one led to the INV-E2 spec strengthening). Still outstanding:
line-by-line review of the remaining rows and promotion decisions for the
`NEW-*` placeholders.
