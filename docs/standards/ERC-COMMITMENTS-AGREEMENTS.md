---
eip: XXXX
title: Commitments - Agreements
description: Bilateral commitments with atomic enforcement, symmetric unbond, and capped bilateral settlement, as an extension to ERC-COMMITMENTS.
author: Jake Hartnell (@jakehartnell)
discussions-to: https://ethereum-magicians.org/t/<TBD>
status: draft
type: Standards Track
category: ERC
created: 2026-05-08
requires: ERC-COMMITMENTS
---

## Abstract

This ERC extends the core [`ERC-COMMITMENTS`](./ERC-COMMITMENTS.md) standard with **agreements** — pairs of linked commitments between two parties under a shared arbiter, with atomic forfeit and release, symmetric committer-liveness unbond, and an opt-in **bilateral settlement** primitive that lets the arbiter move a party's encumbered backing to the other party's free balance within per-direction lifetime caps. The two legs are fully independent: each carries its own backing token, adapter, encumbered amount, penalty ceiling, and strategy set, so cross-token agreements (e.g. DAO A's governance token against DAO B's) are first-class.

This document is maintained as a standalone extension. It depends on the core standard's manager-custody ledger (Part A), commitment lifecycle (Part C), and distribution-strategy machinery (Part D).

## Motivation

A single commitment is asymmetric: one committer, one arbiter, one counterparty. Many real agreements are bilateral — treaties, mutual-aid pools, two-party tranches, insurance arrangements with skin in the game on both sides. Modeling these as two independent commitments loses the properties that make them safe:

1. **Atomic enforcement.** Breach of a bilateral agreement should be forfeitable on both sides in one decision, not two races.
2. **Symmetric exit.** When one party exits via unbond, the other should not be left unilaterally exposed.
3. **Bounded value routing.** Periodic coupons, mutual-aid payouts, and performance fees between the two parties need an arbiter-instructed transfer path whose worst case both parties consented to up front.

## Specification

The key words "MUST", "MUST NOT", "REQUIRED", "SHALL", "SHALL NOT", "SHOULD", "SHOULD NOT", "RECOMMENDED", "MAY", and "OPTIONAL" in this document are to be interpreted as described in RFC 2119 and RFC 8174.

Terms not defined here — **committer**, **arbiter**, **backing token**, **backing adapter**, **distribution strategy**, **`StrategyBinding`**, **encumbered balance**, **exposure allocation** — are defined in the core standard. The manager referenced throughout is an `ERC-COMMITMENTS` Part A/C/D conformant commitment manager.

### 1. Conformance

| Extension | Status | Depends on |
|---|---|---|
| **Agreements** (§2–§4) | normative-optional | `ERC-COMMITMENTS` Parts A, C |
| **Bilateral settlement** (§5) | normative-optional extension of agreements | §2–§4 plus `ERC-COMMITMENTS` Part D guarded-hook machinery |

An implementation MAY claim agreement conformance without bilateral settlement. Bilateral settlement REQUIRES agreements.

### 2. Proposal and acceptance

An agreement is a pair of linked commitments between two parties, subject to the same arbiter. Each party encumbers backing under its own **leg**, and the two legs are fully independent: they MAY differ in backing token, adapter, encumbered amount, penalty ceiling, and strategy set.

```solidity
// Field ORDER is normative — the struct is `proposeAgreement`'s calldata shape,
// so a reordered struct produces silently mis-decoded proposals.

// Per-leg economic terms: one committer's side of an agreement.
struct LegTerms {
    address token;                       // backing token for THIS leg
    address adapter;                     // backing adapter that prices `token`
    uint256 amount;                      // raw units this committer encumbers
    uint16 maxPenaltyBps;                // THIS leg's forfeit ceiling (0..10_000)
    StrategyBinding[] strategies;        // strategies bound to THIS leg only (≤ MAX_STRATEGIES; MAY be empty)
}

struct AgreementParams {
    address arbiter;
    address acceptor;
    LegTerms proposerLeg;                // the proposer's side
    LegTerms acceptorLeg;                // the acceptor's side (independent token/adapter/amount/penalty/strategies)
    uint64 challengeWindow;
    uint64 proposalDuration;
    string metadataURI;
    bytes32 metadataHash;
    uint128 maxFlowProposerToAcceptor;   // §5 lifetime cap in proposerLeg.token; 0 = disabled that direction
    uint128 maxFlowAcceptorToProposer;   // §5 lifetime cap in acceptorLeg.token; 0 = disabled that direction
}

// Pending-proposal storage. Per-leg terms are flattened onto the struct; each
// leg's strategies live in a separate storage array.
struct AgreementProposal {
    address proposer;
    address acceptor;
    address arbiter;
    // proposer leg
    address proposerToken;
    address proposerAdapter;
    uint256 proposerAmount;
    uint16 proposerMaxPenaltyBps;
    // acceptor leg
    address acceptorToken;
    address acceptorAdapter;
    uint256 acceptorAmount;
    uint16 acceptorMaxPenaltyBps;
    // shared
    uint64 challengeWindow;
    uint64 expiresAt;
    bool accepted;
    bool cancelled;
    string metadataURI;
    bytes32 metadataHash;
}

function proposeAgreement(AgreementParams calldata params) external returns (uint256 proposalId);
function acceptAgreement(uint256 proposalId)
    external
    returns (uint256 agreementId, uint256 commitmentIdA, uint256 commitmentIdB);
function cancelAgreementProposal(uint256 proposalId) external;
function forfeitAgreement(uint256 agreementId, uint16 penaltyBps) external;
function releaseAgreement(uint256 agreementId) external;
function requestAgreementUnbond(uint256 agreementId) external;

/// The agreement a proposal produced (0 = never accepted); the canonical
/// terminal-state read for a proposalId.
function agreementOfProposal(uint256 proposalId) external view returns (uint256);
```

`proposeAgreement` MUST encumber the proposer's free balance of `proposerLeg.token` immediately (`proposerLeg.amount` units, moved free → encumbered on the manager's ledger) and MUST check the exposure allocation invariant (core INV-3) for the proposer before encumbering. Each leg MUST independently satisfy: non-zero `token` and `adapter`, non-zero `amount`, `maxPenaltyBps ≤ 10_000`, and `strategies.length ≤ MAX_STRATEGIES` (core §0.3). The proposal MUST expire after `proposalDuration` seconds. `proposalDuration` MUST NOT exceed `MAX_PROPOSAL_DURATION` (core §0.3).

**Independent legs.** The two legs are validated on their own token/adapter/amount/penalty/strategy set; there is **no** cross-leg equality requirement. A cross-token agreement (`proposerLeg.token != acceptorLeg.token`) is a first-class configuration, not an error. This is coherent with bilateral settlement (§5), which is denominated in the **payer** leg's token in each direction.

**Pending-proposal reads.** There is no proposal-struct getter. The immutable per-leg economic terms of a pending proposal are event-sourced via `AgreementProposedTerms` (§6) — one `getLogs` by `proposalId` is authoritative because the terms never change after propose. A proposal's terminal state resolves via `agreementOfProposal(proposalId)` (non-zero ⇒ accepted, and the returned value is the produced `agreementId`) or via the accept/cancel events.

`acceptAgreement` MUST be callable only by the named acceptor and MUST encumber the acceptor's free balance of `acceptorLeg.token`. It MUST create two linked commitments (proposer→acceptor, acceptor→proposer) sharing the same arbiter and `challengeWindow`, each carrying its own leg's `token`, `adapter`, `amount`, and `maxPenaltyBps`, linked under a shared `agreementId`. The exposure allocation invariant (core INV-3) MUST be checked for the acceptor before encumbrance. It returns `(agreementId, commitmentIdA, commitmentIdB)` — the proposer leg and the acceptor leg — so callers need no follow-up `getAgreementPair`.

**Strategy bindings.** Each leg carries its **own** strategy set (`LegTerms.strategies`, each bounded by `MAX_STRATEGIES`, core §0.3), bound only to that leg. On acceptance, for each leg the manager MUST invoke every bound strategy's `onCommitmentCreated` hook once with that leg's `CreatedContext` and MUST emit `CommitmentBoundToStrategy` once per (leg, strategy). A strategy that cannot serve its leg's `(adapter, token)` reverts at `onCommitmentCreated`, aborting acceptance atomically (the core's compatibility-refusal mechanism). Zero and duplicate strategy addresses within a leg's set are rejected at propose time.

`cancelAgreementProposal` MUST be callable by the proposer at any time pre-acceptance. After `expiresAt`, anyone MAY call it to clean up an expired proposal. In both cases the proposer's encumbrance and exposure tracking MUST be restored.

### 3. Atomic forfeit and release

`forfeitAgreement(id, penaltyBps)` MUST initiate forfeit proposals on both legs at the caller-supplied `penaltyBps`. Only the shared arbiter MAY call this. `penaltyBps` MUST NOT exceed either **unresolved** leg's `maxPenaltyBps`; the manager MUST validate against every unresolved leg and revert `PenaltyExceedsMax` **before** mutating either leg, so an out-of-range penalty never produces a partial one-leg forfeit. If one side is already resolved (released, forfeited, or finalized), the function MUST emit `AgreementPartialForfeit` for that side and proceed on the other. An unresolved leg that already has an active forfeit proposal is left unchanged; if no leg receives a new proposal, the function MUST revert `ForfeitPending`, so `AgreementForfeited` is emitted only when at least one proposal was written. To change the penalty of a live proposal, the arbiter cancels it first. Pass each leg's `maxPenaltyBps` for a full forfeit.

`releaseAgreement(id)` MUST release both commitments atomically. Only the shared arbiter MAY call this. Each leg's release runs that leg's bound-strategy `onCommitmentReleased` hooks under the core's guarded-hook semantics (core Part D §D.6) — a reverting strategy parks its accrual and the release completes.

#### 3.1 Per-leg lifecycle calls are blocked (normative)

Once a proposal is accepted, the two legs are managed **exclusively through the agreement path**. The manager MUST reject the core per-commitment *enforcement* entry points on any commitment that belongs to an agreement, reverting with a distinguished `UseAgreementPath` error; the committer-side unbond stays available but propagates:

- `releaseCommitment(legId)` MUST revert `UseAgreementPath` — single-leg release would break bilateral symmetry (one party freed while the other stays exposed). Release is all-or-nothing via `releaseAgreement`.
- `initiateForfeit(legId, penaltyBps)` MUST revert `UseAgreementPath` — forfeiture is atomic-both-legs via `forfeitAgreement`. Graduated penalty **is** directly supported: `forfeitAgreement(id, penaltyBps)` accepts any `penaltyBps` up to each unresolved leg's ceiling, so the arbiter can forfeit proportionally rather than always at the maximum. What remains unavailable on an agreement is **asymmetric** enforcement — a different penalty per leg, or one leg forfeited while the other is released. **Consequence the arbiter must understand before accepting the role:** on agreement legs the enforcement vocabulary is `forfeitAgreement(id, penaltyBps)` (both legs, one shared penalty), `releaseAgreement` (both legs), and — where caps were consented — bounded value routing via `settleAgreement` (§5). Parties who need per-leg asymmetric penalties SHOULD express that through the §5 settlement caps.
- `requestUnbond(legId)` remains available to either committer but MUST auto-propagate to the partner leg (§4) — it is never single-leg.

This gating is a deliberate, consented override of the core §C.1/§C.3 per-commitment MUSTs, per the core's extension-gating rule (core §0.4): the committer-liveness guarantee is preserved because the unbond path (§4) still exits both legs after one unbonding period with no arbiter cooperation.

### 4. Symmetric unbond

`requestUnbond(commitmentId)` (core §C.5) MUST auto-propagate to the partner commitment when the input commitment is part of an agreement. `finalizeUnbond` on either side after the window MUST be permitted. `cancelUnbond` on either side MUST cancel the unbond on both sides — the agreement simply continues.

`requestAgreementUnbond(agreementId)` is a convenience that performs `requestUnbond` on both sides explicitly and emits `AgreementUnbondRequested(agreementId)`.

This preserves the bilateral-symmetry guarantee under committer-liveness: when one party walks, both walk; when one party stays, neither party is forced out.

### 5. Bilateral settlement (normative-optional)

An agreement MAY opt into **bilateral settlement** — arbiter-instructed movement of one party's encumbered backing to the other party, bounded by per-direction lifetime caps. Use cases: symmetric mutual aid, two-party tranches with periodic coupon, performance-fee structures.

**Opt-in.** Caps are set on `AgreementParams` (§2), each denominated in the **payer** leg's token: `maxFlowProposerToAcceptor` in `proposerLeg.token`, `maxFlowAcceptorToProposer` in `acceptorLeg.token`. A per-direction cap of zero disables settlement in that direction (`settleAgreement` reverts with `SettlementCapZero`). Accepting a proposal that carries these caps is the acceptor's explicit consent to the arbiter shifting up to those amounts of the payer's collateral.

**Settlement.**

```solidity
function settleAgreement(
    uint256 agreementId,
    bool fromProposer,
    uint256 units,
    bytes32 evidenceHash
) external;

event AgreementSettled(
    uint256 indexed agreementId,
    bool fromProposer,
    uint256 units,
    uint256 cumulativeProposerToAcceptor,
    uint256 cumulativeAcceptorToProposer,
    bytes32 evidenceHash
);
```

`settleAgreement(agreementId, fromProposer, units, evidenceHash)` moves `units` denominated in the **payer** leg's token — the proposer leg when `fromProposer == true`, else the acceptor leg. It MUST:

- Be callable only by the agreement's shared arbiter (`NotArbiter`).
- Revert `ZeroAmount` if `units == 0`, and `SettlementCapExceeded(type(uint128).max, cap)` if `units > type(uint128).max`, where `cap` is the direction's `uint128` cap (the cumulative-flow counters are `uint128`, so the request is reported saturated).
- Revert if either leg is released or forfeited (`CommitmentInactive`), has an active forfeit proposal (`ForfeitPending`), or has a pending unbond on either side (`UnbondPending`).
- Revert if the per-direction cap is zero (`SettlementCapZero`), or if the ratcheted cumulative would exceed it (`SettlementCapExceeded(cumulAfter, cap)`).
- Revert `InsufficientCommitmentAmount(units, payerAmount)` if `units` exceeds the payer leg's current `amount`.
- **Advance strategy accrual at pre-settle principal.** Before shifting any principal, the manager MUST invoke `distribute` on every strategy bound to either leg, in each leg's `strategies[]` array order, via the core's guarded-hook mechanism (try/catch + min-gas guard, core §D.6). A leg that is resolved or has a pending forfeit is skipped for the pre-distribute; a strategy whose `distribute` reverts or returns invalid movements is skipped (its movements are not applied and `StrategyHookFailed` is emitted); the settlement proceeds. Accrual baselines reset at pre-settle principals so subsequent `distribute` calls accrue against the post-settle amounts, and no strategy can veto an arbiter settlement.
- Move `units` of the payer leg's token from the payer's **encumbered** balance to the receiver committer's **free** balance, as a manager-internal ledger operation. The settled value becomes liquid to the receiver — it is **not** re-encumbered under the agreement, so it carries no forfeit risk. Conservation: for the payer's token, the manager ledger's encumbered goes down and the receiver's free goes up by the same `units`; the per-token sums of the ledger and the manager's token balance are unchanged (core INV-1 holds across the move).
- Update **only** the payer leg's `commitment.amount` and the payer's per-`(user, token)` exposure (encumbered + forfeitable); the receiver leg is untouched. Forfeitable updates MUST use the exposure-before/after diff (not `(units × maxPenaltyBps) / 10_000` recomputation) to keep core INV-3 dust-free across integer truncation (see core Rationale §"Exposure-before/after diff").
- Update the payer-direction cumulative-flow counter and emit `AgreementSettled`.

**Storage discipline.** Per-direction caps and cumulative-flow counters live in parallel mappings on the manager's namespaced (EIP-7201) storage, not on the `AgreementProposal` struct. The `AgreementSettled` event is the on-chain transcript of cumulative state for indexers; on-chain reads go through the companion view:

```solidity
function getAgreementSettlement(uint256 agreementId)
    external view
    returns (uint128 maxPToA, uint128 maxAToP, uint128 cumulPToA, uint128 cumulAToP);
```

See core Rationale §"Storage discipline: parallel mappings, not struct extensions".

#### 5.1 Evidence-hash encoding (RECOMMENDED)

The `evidenceHash` parameter on `settleAgreement` is opaque at the protocol level — it is recorded on `AgreementSettled` for off-chain audit but the protocol does not constrain its meaning. To prevent fragmentation across deployments, implementations SHOULD adopt one of the following encodings and document the choice:

- **EIP-712 typed-data hash.** `evidenceHash` is the digest of an EIP-712 struct documenting the settlement (counterparties, amounts, attestation references, off-chain document URI). Verifiers confirm against the typed-data schema published by the deployment.
- **EAS attestation UID.** `evidenceHash` is the `bytes32` UID of an [Ethereum Attestation Service](https://attest.org) attestation; the off-chain payload lives at the EAS schema URI.
- **service-signed envelope hash.** `evidenceHash` is the keccak256 of a signed service attestation envelope produced by the arbiter's service. Verifiers check the envelope against the service's registered operator set and BLS aggregate.

This standard does not enforce any single encoding. Deployments that mix encodings within the same arbiter MUST surface the encoding type alongside the hash (e.g., as a typed event field on a sibling event, or in the off-chain attestation registry) so auditors can route to the correct verifier.

### 6. Events and errors

```solidity
event AgreementProposed(uint256 indexed proposalId, address indexed proposer, address indexed acceptor, string uri, bytes32 contentHash);

// Canonical read of a pending proposal's immutable per-leg economic terms (there is no
// struct getter). One getLogs by proposalId is authoritative. Only proposalId is indexed.
event AgreementProposedTerms(
    uint256 indexed proposalId,
    address arbiter,
    address proposerToken,
    address proposerAdapter,
    uint256 proposerAmount,
    uint16 proposerMaxPenaltyBps,
    address acceptorToken,
    address acceptorAdapter,
    uint256 acceptorAmount,
    uint16 acceptorMaxPenaltyBps,
    uint64 challengeWindow,
    uint64 expiresAt,
    uint128 maxFlowProposerToAcceptor,
    uint128 maxFlowAcceptorToProposer
);
event AgreementAccepted(uint256 indexed agreementId, uint256 indexed proposalId, uint256 commitmentIdA, uint256 commitmentIdB, string uri, bytes32 contentHash);
event AgreementProposalCancelled(uint256 indexed proposalId);
event AgreementProposalExpiredCancelled(uint256 indexed proposalId, address indexed proposer);
event AgreementForfeited(uint256 indexed agreementId);
event AgreementReleased(uint256 indexed agreementId);
event AgreementPartialForfeit(uint256 indexed agreementId, uint256 indexed commitmentId);
event AgreementUnbondRequested(uint256 indexed agreementId);
event AgreementSettled(uint256 indexed agreementId, bool fromProposer, uint256 units, uint256 cumulativeProposerToAcceptor, uint256 cumulativeAcceptorToProposer, bytes32 evidenceHash);

// Extension-specific errors.
error NotAcceptor();
error NotProposer();
error AlreadyAccepted();
error ProposalExpired();
error ProposalNotFound();
error ProposalDurationTooLong();
error AgreementBothResolved();
error AgreementNotFound();
error SettlementCapZero();
error SettlementCapExceeded(uint128 requested, uint128 cap);
error InsufficientCommitmentAmount(uint256 requested, uint256 available);
```

Agreement operations also surface errors reused from the core standard: `UseAgreementPath` (§3.1 — a per-leg lifecycle call on an agreement leg), `NotArbiter` (forfeit/release/settle authority), `PenaltyExceedsMax` (§3 penalty range and per-leg validation), `ZeroAmount` (`settleAgreement` with `units == 0`, and per-leg zero amount), `ExposureAllocationExceeded` (INV-3 check at propose/accept), `CommitmentInactive` / `ForfeitPending` / `UnbondPending` (`settleAgreement` state guards; `ForfeitPending` also when `forfeitAgreement` writes no new proposal), and the leg-validation errors `ZeroArbiter`, `ZeroCounterparty`, `ZeroAddress`, `TooManyStrategies`, `DuplicateStrategy`, `ChallengeWindowTooShort`, and `URITooLong`.

### 7. Invariants

| # | Invariant | Statement |
|---|---|---|
| **INV-E1** | Bilateral-flow bound | For each agreement with non-zero settlement caps: `cumulativeProposerToAcceptor ≤ maxFlowProposerToAcceptor` and `cumulativeAcceptorToProposer ≤ maxFlowAcceptorToProposer` |
| **INV-E2** | Leg-terms immutability | For each agreement leg, its `(token, adapter, maxPenaltyBps)` is fixed at acceptance; only `amount` changes, and only via `settleAgreement` on the payer leg |

All core invariants (INV-1 through INV-10) continue to hold across every agreement operation; in particular, `settleAgreement` preserves the partition invariant (core INV-1) and the exposure invariant (core INV-3) on both parties.

## Rationale

### Bilateral settlement on agreements, not on commitments

The bilateral-settlement primitive is scoped to agreements rather than to individual commitments because the two-party, shared-arbiter structure that settlement requires already exists in agreements. Both parties are explicit addresses; both already hold encumbered positions; the arbiter authorization model mirrors `forfeitAgreement`.

A more general design — "any party can route value between any two parties" via a `routeValue` primitive — was considered and rejected: the load-bearing case had no implementable semantics without either an unbounded loop over all position-holders or dilution-by-another-name, and both reductions reintroduced a front-running surface. Scoping settlement to agreements sidesteps the entire problem class. Cross-party value flows outside an agreement are the domain of distribution strategies (core Part D), which carry their own validation discipline.

### Independent legs and single-denomination settlement

Each leg carries its own `(token, adapter, amount, maxPenaltyBps)`, so the two sides of an agreement may be backed by entirely different tokens — a cross-token treaty (DAO A's governance token against DAO B's) is a first-class configuration. This is coherent because `settleAgreement` is denominated in the **payer** leg's token in each direction: it moves the payer's own collateral to the receiver, so the transfer is well-defined regardless of whether the two legs share a token. Because the settled value lands in the receiver's **free** balance rather than being re-encumbered, no cross-token re-pricing is ever required — the receiver simply becomes liquid in the payer's token. Forfeit remains per-leg-symmetric because each leg is forfeited against its own `maxPenaltyBps` at the one shared `penaltyBps`.

### Per-leg strategy bindings

Each leg carries its own strategy set, bound only to that leg, so the two sides may run different value-flow configurations (or none). The acceptor consents to both sets in one acceptance — the terms are event-sourced and immutable — and the settlement pre-distribute walks each leg's own list in array order. This keeps the settlement path deterministic while letting cross-token legs bind adapter-specific strategies independently.

### Settlement pre-distribute runs under guarded hooks

Settlement moves encumbered units between the legs, which silently shifts the accrual baseline of any bound strategy tracking per-commitment state; running `distribute` first keeps those baselines correct. But a plain external call into N strategies would let any one of them veto arbiter settlement by reverting. Routing the pre-distribute through the core's guarded-hook mechanism preserves baseline correctness in the happy path and degrades to "that strategy's baseline drifts; its accrual parks in escrow" in the failure path, never to a blocked settlement.

## Backwards Compatibility

This is a new extension of `ERC-COMMITMENTS`; it introduces no changes to the core standard's existing surface and has no impact on existing deployments. A commitment manager that does not implement the agreements entry points remains fully conformant to the core standard. An agreement leg is an ordinary core commitment (its `token`/`adapter`/`amount`/`maxPenaltyBps` are the core `Commitment` fields), so existing indexers and periphery that read `CommitmentCreated` observe agreement legs with no changes; the only new obligation is honoring the per-leg lifecycle gating (§3.1) via the `UseAgreementPath` revert.

## Test Cases

The reference implementation ships an agreements suite at `test/manager/Agreement.t.sol`, covering propose/accept (`ProposeAcceptTest`), atomic forfeit and release (`AgreementForfeitReleaseTest`), bilateral settlement including cap ratcheting and state guards (`SettlementTest`), third-party contributions (`ContributionTest`), the view/return-shape surface (`AgreementApiPolishTest`), and fully cross-token agreements (`CrossTokenAgreementTest`). Cross-token settlement, per-leg penalty ceilings, and payer-token-denominated flow caps are exercised there.

## Reference Implementation

The agreements extension is implemented as an external delegatecall library:

- `src/extensions/agreements/AgreementLib.sol` — propose/accept/cancel, atomic bilateral forfeit and release, symmetric unbond, and bilateral settlement (guarded pre-settle distribute plus the per-direction cap and encumbered→free shift).
- `src/core/manager/CommitmentManager.sol` — the thin dispatch wrappers (`proposeAgreement`, `acceptAgreement`, `cancelAgreementProposal`, `forfeitAgreement`, `releaseAgreement`, `requestAgreementUnbond`, `settleAgreement`) and the `getAgreementPair` / `agreementOf` / `agreementOfProposal` / `getAgreementSettlement` views.
- `src/core/interfaces/ICommitmentManager.sol` — the `LegTerms` / `AgreementParams` / `AgreementProposal` / `AgreementSettlement` structs, events, and errors.

## Security Considerations

### Agreement proposal griefing

The proposer's backing is encumbered immediately upon `proposeAgreement`, and proposals expire after a finite `proposalDuration`. This prevents costless proposal spam and indefinite capital lockup.

### Settlement with manipulated strategy state

`settleAgreement` applies strategy `distribute` movements under the core's full movement-validation pipeline (core §D.5): per-strategy allow-lists, per-commitment encumbrance caps, manager-applied exposure shrink. A malicious strategy bound to an agreement can at most accelerate value flows the parties consented to at acceptance; it cannot touch the settlement transfer itself, which is manager-internal.

### Arbiter authority over settlement

Within the consented caps, the arbiter can move value between the parties at will — that is the feature. Parties MUST size `maxFlowProposerToAcceptor` / `maxFlowAcceptorToProposer` as the worst-case loss they accept from arbiter discretion, exactly as they size `maxPenaltyBps` for forfeit exposure.

## Copyright

Copyright and related rights waived via [CC0](../../LICENSE).
