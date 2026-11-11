# Arbitration — choosing and operating an arbiter

The `arbiter` named in `CommitmentParams.arbiter` is the **entire trust model**:
it is the only party that can `releaseCommitment` (let the committer off) or
`initiateForfeit` (start taking the stake). The address is chosen at creation and
the manager gates every release/forfeit on `msg.sender == commitment.arbiter`, so
depositors opt into a specific arbiter **instance** and its policy. The arbiter
contract calls *into* the manager — the manager never calls the arbiter.

**Trust dial**, most discretion → least: `ManualArbiter` (a human/owner decides)
→ `OptimisticInsuranceArbiter` (bonded assertions resolve by timeout) →
`AttestationArbiter` (operator quorum signs). The more discretion, the more the
counterparty must trust whoever controls it.

You can also **self-arbitrate** (`arbiter = you`) for reputation-backed or
self-imposed commitments — simplest, but the counterparty trusts you directly.

Reference implementations live in `src/periphery/arbiters/`. All three dispatch through the same
manager calls; what differs is *who is allowed to make them*.

---

## ManualArbiter — owner decides

`Ownable2Step` owner makes every call by hand. Good for demos, bootstrap, or a
multisig as the human-in-the-loop. Fork it to add your own auth (committee vote,
oracle predicate, Kleros ruling).

```solidity
constructor(address owner_, address manager_);

function initiateForfeit(uint256 commitmentId, uint16 penaltyBps) external; // onlyOwner
function cancelForfeit(uint256 commitmentId) external;                      // onlyOwner
function release(uint256 commitmentId) external;                            // onlyOwner → manager.releaseCommitment
function forfeitAgreement(uint256 agreementId, uint16 penaltyBps) external; // onlyOwner
function releaseAgreement(uint256 agreementId) external;                    // onlyOwner
function settleAgreement(uint256 agreementId, bool fromProposer, uint256 units, bytes32 evidenceHash) external; // onlyOwner
function activateMutual(uint256 mutualId) external;                         // onlyOwner
function initiateMutualLoss(uint256 mutualId, uint256 lossNumeraire, bytes32 evidenceHash) external; // onlyOwner
function cancelMutualLoss(uint256 mutualId) external;                       // onlyOwner
```

Operating flow: as owner, `initiateForfeit(id, penaltyBps)` → wait the
commitment's `challengeWindow` → anyone (or you) calls `manager.executeForfeit(id)`. To
let the committer off instead, `release(id)`. No signing, no envelopes.

---

## AttestationArbiter — operator quorum signs

Off-chain operators detect (mis)behavior and sign an attestation; anyone submits
it; the arbiter verifies quorum against an `OperatorServiceRegistry` and routes
the action. Policy lives in *what operators are willing to sign*.

```solidity
constructor(address manager_, address serviceManager_);
function act(IServiceHandler.Envelope calldata envelope, IServiceHandler.SignatureData calldata signatureData) external;
```

The **envelope payload** is the ABI encoding of the arbiter's `Attestation`
struct: `(boundArbiter, id, action, penaltyBps, deadline, fromProposer, units,
numeraire, evidenceHash)`. Actions cover commitment initiate/cancel/release,
agreement forfeit/release/settle, and mutual activate/initiate-loss/cancel-loss.
Unused fields remain signed but are ignored for that action. Binding
`address(this)` and the strict per-target `ordering` sequence block replay.

Operators sign the `Envelope` EIP-712 digest for the service-registry proxy.
`SignatureData = {address[] signers (ascending), bytes[] signatures, uint32
referenceBlock}`. `serviceManager.validate()` checks that the signers are
currently enrolled and hold enough voting power at a recent `referenceBlock`.
Reverts include `WrongBoundArbiter`, `ExpiredAttestation`, `InvalidAction`, and
`OrderingMismatch`; successful dispatch emits `Acted`.

---

## OptimisticInsuranceArbiter — bonded optimistic claims

Reality.eth-style: an asserter bonds a claimed payout; a counter-asserter may
post ≥ 2× the top bond and replace the answer. After the answer timer expires,
the top of the bounded bond stack wins by exhaustion—there is no fallback
arbitrator. Bonds are an ERC-20; the winner takes a `winnerShareBps` cut of
forfeited bonds, and the rest goes to a treasury (insurance-fund pattern).

```solidity
constructor(address manager_, address bondToken_, uint256 minBond_, uint16 bondBps_,
            uint64 answerTimeout_, uint16 winnerShareBps_, address treasury_);

function proposeClaim(uint256 commitmentId, uint16 amountBps, bytes32 evidenceHash, bytes32 templateId, uint128 bond) external returns (uint256 claimId);
function disputeClaim(uint256 claimId, uint16 counterAmountBps, bytes32 evidenceHash, uint128 bond) external; // bond ≥ max(2×top, minBond)
function cancelClaim(uint256 claimId) external;            // proposer, only before any dispute
function bondFloor(uint256 commitmentId, uint16 amountBps) external view returns (uint256);
function finalizeClaim(uint256 claimId) external;          // timeout selects the top answer; manager hold is capped to maxPenaltyBps
function executeClaim(uint256 claimId) external;           // after the manager challenge window → manager.executeForfeit + distribute bonds
function cancelStaleClaim(uint256 claimId) external;       // after answerTimeout + 14d
function getClaim(uint256 claimId) external view returns (/* Claim */);
function getBondStackTop(uint256 claimId) external view returns (address asserter, uint16 amountBps, uint128 bond, uint64 deadline);
```

Lifecycle: `proposeClaim` (bond ≥ `minBond`, `amountBps ≤ commitment.maxPenaltyBps`)
→ optional `disputeClaim` rounds (each resets the timer; cap `MAX_BOND_DOUBLINGS = 8`)
→ `finalizeClaim` (top-of-stack wins on timeout) transitions the synchronized
manager-side hold to enforcement → after the manager's window, `executeClaim`
runs `manager.executeForfeit` and settles bonds. The initial bond floor is
`max(minBond, adapter-quoted claim value × bondBps / 10_000)`. A zero winning
amount denies the claim and refunds all bonds. The commitment must already name
**this arbiter** as its `arbiter` (`proposeClaim` reverts `WrongArbiter`
otherwise), and its challenge window must be at least `answerTimeout`.

---

## Choosing — quick guide

| Need | Use |
|---|---|
| Self-imposed / reputation-backed, no third party | self-arbitrate (`arbiter = you`) |
| A human or multisig decides outcomes | `ManualArbiter` |
| An operator AVS attests SLA breaches off-chain | `AttestationArbiter` |
| Insurance cover where claims usually settle uncontested | `OptimisticInsuranceArbiter` |

Whichever you pick, pass its **address** as `CommitmentParams.arbiter` at
creation. For an agreement, both legs share one arbiter (`AgreementParams.arbiter`).
