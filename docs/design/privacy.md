---
title: Privacy posture and add-on layers
status: draft
---

# Privacy posture and add-on layers

> **Design note.** This is forward-looking research, not current protocol
> behavior. Nothing described here is shipped; the transparent posture in the
> first section is the only part that reflects the protocol as built.

The Commitments protocol is **transparent by design**. Depositor identity, counterparty identity, arbiter identity, exposures, exposure allocation, agreement topology, mesh aggregation, and forfeit telemetry are all readable on-chain or computable from public events. This is not an oversight — the protocol's safety guarantees (§C.4 stale-proposal cancellation, §C.5 committer liveness, INV-3 exposure allocation) require enough observability for any affected party to detect adverse state and react within the challenge window.

A maximally-private commitments protocol — one that hides parties, exposures, and topology — is *incompatible with the design as written*. What this document scopes is **selective disclosure**: hide what doesn't need to be public, expose what does, and let arbiters and counterparties see more than the world does.

## What is publicly observable today

On a fully synced archive node, an observer can derive:

| Surface | Source | What leaks |
|---|---|---|
| Identity graph | `CommitmentCreated` events; `Commitment` state | Depositor, arbiter, counterparty addresses for every commitment |
| Exposures | `Commitment.amount`, `maxPenaltyBps`, strategy bindings | Position size, forfeit exposure, distribution policy |
| Topology | `AgreementAccepted`, mesh provider/consumer registration | Full bilateral agreement graph + mesh DAG |
| Deal terms | `metadataURI`, `metadataHash` | Pointer + integrity tag; the *existence* and *length* of the encrypted blob always leak |
| Forfeit telemetry | `ForfeitInitiated`, `ForfeitExecuted`, `ForfeitCancelled` | Who, when, against whom, on what exposure |
| Yield routing | `StrategyFunded`, `EncumbranceMovedToEscrow`, `DistributionPaid` | Counterparty earnings stream, NAV growth windows |

The minimum set of public predicates the protocol *requires* for the safety properties to hold:

- The vault MUST publicly expose `totalSupply`, `totalAssets`, and the invariant `totalForfeitable ≤ totalEncumbered` (§C.2).
- A depositor whose shares are affected by a forfeit MUST be able to detect the proposal and challenge it (§C.3 challenge window).
- Arbiters MUST be publicly identifiable so a depositor can evaluate them before locking shares.

Everything else is, in principle, on the table for a privacy add-on layer.

## Three-layer MVP synthesis

A coherent "private commitments" path composes three add-on layers:

### Layer 1 — Pseudonymous parties via stealth addresses + Privacy Pools on-ramp

**What it adds.** The link between a depositor's funding source (a KYC'd CEX wallet, a doxxed long-lived address) and the address that authors a commitment becomes unprovable. Operators receive forfeit payouts and yield incentives at one-shot stealth addresses derived from a published meta-address rather than at a stable wallet.

**Primitives.**
- [ERC-5564](https://eips.ethereum.org/EIPS/eip-5564) stealth addresses + [ERC-6538](https://eips.ethereum.org/EIPS/eip-6538) meta-address registry. Production: [Fluidkey](https://fluidkey.com/), Umbra Cash.
- [Privacy Pools (0xbow)](https://privacypools.com/) for sanctioned-set on-ramps. Production on Ethereum mainnet since 2024. [Buterin / Illum / Nadler / Schär / Soleimani (2023)](https://papers.ssrn.com/sol3/papers.cfm?abstract_id=4563364) is the canonical paper.
- Optionally [Railgun](https://railgun.org/) for jurisdictions where Privacy Pools is unsuitable.

**Protocol changes.** Minimal. An optional `proofOfAssociation` field on the commitment manager (compliance-conscious deployments require it; permissive deployments accept zero) and an `authorMetaAddress` registry for operators / arbiters who want stealth payouts.

**Trade-off.** Recovery friction. A depositor with one stealth-address-per-commitment loses access to *every* commitment that derived from a lost meta-address. Document the key-management story carefully or restrict stealth-mode to operators / arbiters where the wallet is operationally hot anyway.

### Layer 2 — Encrypted-to-arbiter metadata + tlock commit-reveal of forfeit evidence

**What it adds.** Commitment terms become private from the world but legible to the arbiter who must enforce them. Forfeit evidence is sealed until the challenge window approaches close, then auto-revealed by [drand](https://drand.love/blog/2023/03/02/timelock-encryption/) — preventing the forfeit proposer from fishing for arbiter bias before committing.

**Primitives.**
- Encrypt commitment metadata to the arbiter's registered pubkey via threshold-network re-encryption. Production: [Lit Protocol](https://litprotocol.com/) programmable key pairs, [TACo](https://taco.threshold.network/) (NuCypher proxy re-encryption on the Threshold Network).
- [tlock](https://eprint.iacr.org/2023/189) for time-released forfeit evidence; [drand](https://drand.love/) is the production threshold-BLS network. Operator services commonly use drand for randomness, so the integration story is short.
- Per-direction salted-hash commit-reveal as a fallback for deployments that cannot accept an external threshold network.

**Protocol changes.** Three optional fields:
- `encryptedMetadataPointer: { cid, encryptionScheme, decryptionConditionHash }` on the commitment.
- `arbiterPubkey: bytes` on the arbiter registration (or computed off-chain from a known scheme).
- `revealDeadline: uint64`, `tlockRound: uint64` on forfeit proposals.

**Trade-off.** The arbiter's pubkey holder is a single point of compromise. A leaked or rotated arbiter key leaks all metadata that was encrypted to it (no forward secrecy without a threshold scheme). Threshold decryption (via Lit / TACo / a future operator-set MPC) becomes viable once a single pubkey shows up as a real attack surface.

### Layer 3 — Hidden amounts via Pedersen commitments + Noir range proofs (one invariant first)

**What it adds.** Per-commitment amounts and per-exposure bps become hidden behind Pedersen commitments. The vault tracks aggregates as homomorphic sums; the chain verifies the exposure allocation invariant (§C.2) over hidden values via SNARK range proofs, without ever seeing an individual commitment's `amount`.

**Primitives.**
- Pedersen commitments + Halo2 / PLONK range proofs (Confidential Transactions lineage; production in Monero, Grin, parts of Zcash).
- [Noir](https://noir-lang.org/) for circuit authoring; `nargo codegen-verifier` produces a Solidity verifier on BN254.
- Pectra (2025) added BLS12-381 precompiles via [EIP-2537](https://eips.ethereum.org/EIPS/eip-2537), making Halo2/PLONK verifiers on BLS12-381 dramatically cheaper.

**Protocol changes.** Substantial. The `Commitment` struct's `amount` field becomes a Pedersen commitment; the vault tracks `C_totalEncumbered` and `C_totalForfeitable` as homomorphic running sums; every state-changing call ships a SNARK proving the homomorphic update is well-formed and the per-commitment amount is in `[0, 2^64)`. Ship as a new `PrivateManager` deployment alongside the public manager — not as a migration.

**Trade-off.** A bug in the Halo2 circuit silently lets someone over-commit beyond their vault balance, bypassing INV-1. Audit must include formal verification or hand-checked circuit review. Per-operation gas overhead is ~500k–1M.

This is where the meaningful privacy gain lives — but it's also the most engineering-intensive piece, and it builds on Layers 1 and 2 being solid first.

## What this framing deliberately defers

| Defer | Why |
|---|---|
| Hidden topology / mixer-style agreements | Real privacy gain, but cost is high (~500k+ gas per agreement settle, ring proofs at forfeit time) and depends on Layers 1–3 being solid first |
| Anonymous BLS subset signing for operator attestations | Useful only when targeted-bribery / coercion against specific operators becomes a credible threat |
| Full TEE / MPC arbiter | Strong upgrade for Layer 2 once "encrypt to a single pubkey" is shown to be insufficient; until then, the simple version compounds enough adoption-risk to defer |
| FHE-based confidential variables | Too slow for the protocol's hot path (CKKS / TFHE are 100–1000× plaintext for arbitrary EVM-shaped logic) |
| Verifiable encryption (Camenisch-Shoup) | No turnkey on-chain Solidity verifier of audit quality |
| Aztec / Aleo / Miden as host chain | Migrating the manager + vault to a private-by-default L2 is a full rewrite, not an add-on layer |

## Compliance vs. privacy

The cleanest defensible posture:

- **Do not add a regulator backdoor.** A view-key escrow at the protocol layer creates a high-value compromise target and aligns the standard with a specific jurisdiction's enforcement priorities.
- **Push compliance into the on-ramp.** Privacy Pools' [association-set construction](https://papers.ssrn.com/sol3/papers.cfm?abstract_id=4563364) lets users prove their funds came from a sanctioned subset (excluding OFAC-listed addresses) without the protocol knowing or caring about identity. 0xbow has run this in production since 2024 without enforcement action.
- **Document the choice.** A deployment that selects a permissive on-ramp (Railgun) vs. a curated one (Privacy Pools) is making a deliberate sanctions-posture decision; surface that in the deployment notes.

For deployments that *do* need selective deanonymization (Zcash-style view keys, or [MACI](https://maci.pse.dev/)-coordinator-style tally-then-reveal), build it at the application layer — outside the standard.

## Audit-time worries (for any of the three layers)

1. **Key custody for arbiters.** Whoever holds the arbiter's decryption key is now a target. Without a threshold scheme, this is a single point of compromise that did not exist before.
2. **Range-proof soundness.** A bug in a hidden-exposure circuit silently lets someone bypass INV-1 / INV-3. Formal verification or independent circuit review is non-optional.
3. **Forward secrecy of metadata.** Symmetric keys posted on chain are forever — if the arbiter's key leaks years later, *all* historical metadata leaks. Threshold-network re-encryption helps; pure encrypt-to-arbiter does not.
4. **Privacy cliff during forfeiture.** A forfeit event today reveals "X forfeited Y by Z." With private amounts, the reveal still happens at forfeit time. The privacy of *unforfeited* commitments is preserved; the privacy of *forfeited* commitments is not. This is probably correct — forfeiture is a public-accountability moment — but should be explicit in the deployment's threat model.
5. **Indexer / frontend reliance on plaintext.** The Ponder indexer and Sigma.js graph pages rely on plaintext events. Privacy-track contracts will need a parallel "view-key indexer" that operates on encrypted events with the user's view key. This is a meaningful new piece of infra.

## Per-area summary

| Dimension | Public predicate the protocol needs | Add-on layer that closes the gap |
|---|---|---|
| Parties | Arbiters publicly identifiable | Stealth addresses for operator/arbiter payouts; Privacy Pools on-ramp for depositors |
| Exposures | INV-3 (`totalForfeitable ≤ totalEncumbered`) checkable on every state-changing call | Pedersen-commitment `amount` + Halo2 range proof; aggregates remain checkable as homomorphic sums |
| Deal terms | Existence and counterparties; not the body | Encrypted-to-arbiter metadata with optional threshold-network decryption; tlock commit-reveal for forfeit evidence |
| Topology | Aggregate stake; not the edges | (Deferred) Semaphore arbiter-rings + mixer-style agreements |
| Operator-side compute | Aggregated attestation; not which operators signed which inputs | (Deferred) TEE-backed service components; anonymous BLS subset signing |
| Compliance | None at the protocol layer | Privacy Pools association sets at the on-ramp; deployment-level policy choice |

## See also

- [ERC-COMMITMENTS](../standards/ERC-COMMITMENTS.md) Part C — the lifecycle sections (§C.2 exposure allocation, §C.3 two-phase forfeit, §C.4 stale proposals, §C.5 committer unbond) whose observability requirements bound what any privacy layer may hide.
- [ERC-5564 / 6538](https://eips.ethereum.org/EIPS/eip-5564), [Privacy Pools paper](https://papers.ssrn.com/sol3/papers.cfm?abstract_id=4563364), [Noir](https://noir-lang.org/), [tlock](https://eprint.iacr.org/2023/189), [Lit Protocol](https://litprotocol.com/), [TACo](https://taco.threshold.network/) — the primitives this document leans on.

---

*This document is a forward-looking research note, not a build plan. Gas and proving-cost figures are point-in-time estimates; re-verify before acting on them.*
