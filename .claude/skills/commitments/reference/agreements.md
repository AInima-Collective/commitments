# Agreements — bilateral commitments

An **agreement** is two linked commitments under a **shared arbiter**: a
proposer and an acceptor each post backing, and the arbiter can release or
forfeit *both legs atomically* or route bounded value flow between them. Use this
instead of two independent commitments whenever the promise is mutual (an escrow,
a swap of obligations, a cover/premium relationship).

Signatures verbatim from `src/core/interfaces/ICommitmentManager.sol`. A
commitment that belongs to an agreement **rejects the unilateral calls**
(`releaseCommitment`, `initiateForfeit`, …) with `UseAgreementPath` — always use
the `*Agreement` calls below.

---

## The two-step handshake

```solidity
function proposeAgreement(AgreementParams calldata params) external returns (uint256 proposalId);
function acceptAgreement(uint256 proposalId)
    external
    returns (uint256 agreementId, uint256 commitmentIdA, uint256 commitmentIdB);
function cancelAgreementProposal(uint256 proposalId) external; // proposer while live; ANYONE once expired
```

`proposeAgreement` **encumbers the proposer's `proposerLeg.amount` immediately**
(lock-early, anti-grief) — so the proposer must `deposit` first, exactly like
creation. `acceptAgreement` (acceptor only) encumbers the acceptor's
`acceptorLeg.amount` and atomically mints **two commitments**:

- **leg A**: committer = proposer, counterparty = acceptor, terms = `proposerLeg`
- **leg B**: committer = acceptor, counterparty = proposer, terms = `acceptorLeg`

The legs share the `arbiter` and `challengeWindow`, but each has an independent
token, adapter, amount, penalty ceiling, and strategy set. This permits
cross-token and asymmetric agreements. `acceptAgreement` reverts
`ProposalExpired` past the proposal window, `NotAcceptor`, `AlreadyAccepted`,
`ExposureAllocationExceeded`. Read with `getAgreementPair(agreementId) →
(cidA, cidB)` and `agreementOf(commitmentId) → agreementId`.

### `AgreementParams` (exact field order)

| Field | Type | Notes |
|---|---|---|
| `arbiter` | `address` | shared by both legs; non-zero |
| `acceptor` | `address` | the counterparty; non-zero |
| `proposerLeg` | `LegTerms` | proposer's independent backing terms |
| `acceptorLeg` | `LegTerms` | acceptor's independent backing terms |
| `challengeWindow` | `uint64` | ≥ 86400 |
| `proposalDuration` | `uint64` | seconds the proposal stays open; ≤ 30 days (`MAX_PROPOSAL_DURATION`) |
| `metadataURI` | `string` | ≤ 512 bytes |
| `metadataHash` | `bytes32` | content hash or 0 |
| `maxFlowProposerToAcceptor` | `uint128` | settlement cap, this direction (0 = disabled) |
| `maxFlowAcceptorToProposer` | `uint128` | settlement cap, other direction (0 = disabled) |

Each `LegTerms` has this exact field order:

| Field | Type | Notes |
|---|---|---|
| `token` | `address` | backing token for this leg |
| `adapter` | `address` | prices this leg's token |
| `amount` | `uint256` | amount this committer encumbers; > 0 |
| `maxPenaltyBps` | `uint16` | this leg's independent ceiling, 0–10000 |
| `strategies` | `StrategyBinding[]` | bound only to this leg; ≤ 8, no duplicates |

**Consent semantic:** the two `maxFlow…` caps are the acceptor's consent to value
ratcheting up to those amounts via `settleAgreement`. Both zero = settlement off.

---

## Arbiter actions on a live agreement

```solidity
function releaseAgreement(uint256 agreementId) external; // shared arbiter; releases both unresolved legs (guarded hooks first)
function forfeitAgreement(uint256 agreementId, uint16 penaltyBps) external; // shared arbiter; penalty must fit both unresolved legs
function settleAgreement(uint256 agreementId, bool fromProposer, uint256 units, bytes32 evidenceHash) external;
```

- `releaseAgreement` — frees both committers. Reverts `AgreementBothResolved` if
  nothing is open, `NotArbiter` otherwise.
- `forfeitAgreement` — opens a forfeit proposal at `penaltyBps` on each
  unresolved leg; the tighter of the two independent penalty ceilings binds.
  Each proposal executes through normal `executeForfeit` after the challenge
  window. A leg already resolved emits `AgreementPartialForfeit` instead.
- `settleAgreement` — arbiter moves `units` of **encumbered** backing from the
  payer leg to the receiver's free balance, in the payer leg's token
  (`fromProposer` picks direction), bounded by the per-direction lifetime cap.
  The receiver leg remains unchanged. Both legs must be active with no pending
  forfeit/unbond. Reverts:
  `SettlementCapZero` (that direction disabled), `SettlementCapExceeded(req, cap)`,
  `InsufficientCommitmentAmount(req, avail)`, `ForfeitPending`, `UnbondPending`,
  `ZeroAmount`. Read live caps + cumulative flow with
  `getAgreementSettlement(agreementId) → (maxPToA, maxAToP, cumulPToA, cumulAToP)`.

`settleAgreement` is the bilateral primitive that makes agreements expressive: a
NAV settlement, a partial payout, a periodic premium — all are arbiter-instructed
flows bounded by caps the acceptor consented to at accept time.

---

## Unbonding an agreement

```solidity
function requestAgreementUnbond(uint256 agreementId) external; // either committer; both legs unbond together
```

Symmetric: either side starts it, both legs mature together, then anyone calls
`finalizeUnbond` on each leg (see `lifecycle.md`). Blocked by an active forfeit
proposal, like the unilateral path.

---

## End-to-end example (proposer side)

```ts
// proposer has already deposited proposerLeg.amount of proposerToken into the manager
const params = {
  arbiter, acceptor,
  proposerLeg: {
    token: proposerToken,
    adapter: proposerAdapter,
    amount: parseUnits('500', 18),
    maxPenaltyBps: 10000,
    strategies: [],
  },
  acceptorLeg: {
    token: acceptorToken,
    adapter: acceptorAdapter,
    amount: parseUnits('250', 6),
    maxPenaltyBps: 5000,
    strategies: [],
  },
  challengeWindow: 86400n,
  proposalDuration: 7n * 86400n,   // open for 7 days (≤ 30d)
  metadataURI: 'ipfs://bafy.../agreement.json',
  metadataHash: '0x' + '00'.repeat(32),
  maxFlowProposerToAcceptor: parseUnits('500', 18), // denominated in proposerToken
  maxFlowAcceptorToProposer: 0n,                    // no reverse flow
}
const proposalId = await write(manager, 'proposeAgreement', [params])
// acceptor (after depositing acceptorLeg.amount) calls acceptAgreement;
// the ABI returns (agreementId, proposerCommitmentId, acceptorCommitmentId).
// arbiter can now settleAgreement / releaseAgreement / forfeitAgreement.
```
