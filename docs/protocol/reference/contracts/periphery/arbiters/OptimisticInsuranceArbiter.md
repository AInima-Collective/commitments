---
title: OptimisticInsuranceArbiter
status: generated
source: src/periphery/arbiters/OptimisticInsuranceArbiter.sol
generated: true
---
# OptimisticInsuranceArbiter
**Inherits:**
[IArbiter](/docs/protocol/reference/contracts/shared/arbitration/interfaces/IArbiter), ReentrancyGuardTransient

**Title:**
OptimisticInsuranceArbiter

Reality.eth-style optimistic claim resolution for insurance
policies expressed as Commitments Protocol commitments. Sits
between the parametric `AttestationArbiter` and discretionary
`ManualArbiter` on the trust dial: claims resolve via bond
timeout without any third party. The most-committed (top-of-stack)
answer wins once the optimistic timer elapses with no new dispute.
Claim lifecycle:
```
Idle ─proposeClaim───────────────▶ Proposed ──disputeClaim──▶ Proposed (loop)
│ manager.initiateForfeit       │        │ manager cancel + re-initiate
│ (the exit-blocking hold)      │        │ at the (capped) counter answer
│ timeout (finalizeClaim)
▼
winner == 0: cancel the hold, settle bonds (Settled)
winner  > 0: Forfeiture (hold already sits at the winning bps)
│ ── manager challenge window ──
▼
executeClaim ─▶ manager.executeForfeit (skipped when already
executed externally — execution is permissionless); bonds settle
```
The manager-side forfeit proposal is opened AT PROPOSE TIME so the
committer cannot exit through `finalizeUnbond` / `expire` while a
claim is pending (`_forfeitActive` blocks both). Each dispute
re-initiates the hold at the capped counter-answer, so the manager
proposal always mirrors the current top-of-stack assertion and its
challenge window restarts with the answer timer. `proposeClaim`
requires `commitment.challengeWindow >= answerTimeout`, which
guarantees the (permissionless) `manager.executeForfeit` can never
fire before the claim itself is finalizable — external execution
therefore always enforces exactly the winning answer.
Every state has a liveness path to resolution or refund: an
undisputed `Proposed` claim can be cancelled by its proposer; any
`Proposed` claim resolves by timeout via `finalizeClaim` (settling
bonds directly when the commitment was resolved externally); a
`Proposed` claim that nobody finalizes for `CLAIM_STALE_TTL` past
its deadline can be unwound by anyone via `cancelStaleClaim`
(settling — not refunding — when the hold was already executed
externally, so the bond game never contradicts an enforced
forfeit); and a
`Forfeiture` claim whose manager proposal was stale-cancelled
externally unwinds through `executeClaim`, refunding every bond.
No state can strand funds.

Storage is plain mappings + immutables, NOT upgradeable. Reference
arbiter convention: trust is rooted in opt-in to a specific
deployed address; upgradeability collapses that property. Bond
token is configurable at deploy; geometric escalation `≥ 2 × top`
with `MAX_BOND_DOUBLINGS = 8` (=256× minBond) caps the dispute
game depth. The proposer bond floor additionally scales with the
adapter-quoted claim value (`bondBps`) so min-bond false claims
against large commitments are not positive-EV. Templates are
off-chain only — the arbiter stores `bytes32 templateId` per claim
but does not validate against an on-chain registry.
KNOWN TRADE-OFF (propose-time hold): `manager.executeForfeit` on a
timed-out hold is permissionless, and executing a forfeit — even at
0 bps — terminally closes the commitment. So once a top-of-stack
answer has stood for the full challenge window, anyone (notably the
committer, via a cheap low-bps self-claim that nobody disputes) can
close the commitment at that answer's penalty, exiting coverage
without the unbonding period. This is contestable — any watcher can
`disputeClaim` within `answerTimeout` (the counterparty holds the
last slot of an alternating bond war started by the committer), and
`finalizeClaim` (callable no later than the external execute, since
`challengeWindow >= answerTimeout`) resolves a 0-answer by
cancelling the hold and KEEPING the commitment alive. Counterparties
relying on continuous coverage must watch `ClaimProposed` and
finalize denials promptly; prefer commitments whose
`challengeWindow` comfortably exceeds `answerTimeout`.


## Constants
### MAX_BOND_DOUBLINGS
Maximum bond stack depth. 8 doublings ≡ 256× minBond. Above
this, dispute griefing risks pricing legitimate disputers out;
the dispute game is capped and the optimistic timeout resolves
the top-of-stack answer.


```solidity
uint8 public constant MAX_BOND_DOUBLINGS = 8
```


### CLAIM_STALE_TTL
After `lastBondAt + answerTimeout + CLAIM_STALE_TTL`, anyone
can call `cancelStaleClaim` to release the depositor.
Mirrors `CommitmentManager.FORFEIT_PROPOSAL_TTL` semantics.


```solidity
uint64 public constant CLAIM_STALE_TTL = 14 days
```


### manager
CommitmentManager this arbiter dispatches to.


```solidity
ICommitmentManager public immutable manager
```


### bondToken
bond asset for proposeClaim disputeClaim.


```solidity
IERC20 public immutable bondToken
```


### minBond
Minimum bond floor for `proposeClaim` and the first
`disputeClaim` step. Subsequent disputes are gated by the
geometric `≥ 2 × top` rule.


```solidity
uint256 public immutable minBond
```


### bondBps
Value-scaled component of the proposer bond floor, in bps of
the adapter-quoted claim value: `proposeClaim` requires
`bond >= max(minBond, claimValue * bondBps / 10_000)` where
`claimValue = amount * amountBps / 10_000 * indexNow / 1e18`,
priced via the commitment's own adapter. 0 disables scaling
(flat `minBond` floor only). NOTE: the quote is denominated in
the adapter's payout denomination while the bond is posted in
`bondToken` — deployers MUST size `bondBps` with the
bondToken/denomination relationship in mind (the canonical
deployment bonds in the same asset the backing is priced in).


```solidity
uint16 public immutable bondBps
```


### answerTimeout
Optimistic answer timeout per claim. The timer resets on
every new bond. Commitments claimed against through this
arbiter must carry `challengeWindow >= answerTimeout`
(enforced in `proposeClaim`) so the manager-side hold can
never be executed before the claim is finalizable.


```solidity
uint64 public immutable answerTimeout
```


### winnerShareBps
Share of forfeited losing bonds routed to the asserter
holding the winning answer. Remainder goes to `treasury`.
10_000 ≡ winner-take-all (reality.eth default); 0 ≡ all to
treasury (insurance-fund pattern).


```solidity
uint16 public immutable winnerShareBps
```


### treasury
Recipient of the non-winner share of forfeited bonds.
May be address(0) only if `winnerShareBps == 10_000`.


```solidity
address public immutable treasury
```


## State Variables
### _claims

```solidity
mapping(uint256 claimId => Claim) private _claims
```


### activeClaimOf

```solidity
mapping(uint256 commitmentId => uint256 activeClaimId) public activeClaimOf
```


### nextClaimId

```solidity
uint256 public nextClaimId
```


## Functions
### constructor


```solidity
constructor(
    address manager_,
    address bondToken_,
    uint256 minBond_,
    uint16 bondBps_,
    uint64 answerTimeout_,
    uint16 winnerShareBps_,
    address treasury_
) ;
```

### commitmentManager

Returns the CommitmentManager this arbiter dispatches to.

Implementations should make this immutable to preserve the trust
model commitments opt into when naming this contract as arbiter.


```solidity
function commitmentManager() external view returns (address);
```

### arbiterCapabilities

Bitmap of manager actions this arbiter is able to dispatch.

The optimistic claim game only ever opens, re-prices, and cancels a
forfeit hold on the insured commitment — it never releases early,
touches agreements, or arbitrates mutuals.


```solidity
function arbiterCapabilities() external pure returns (uint256);
```

### arbiterMetadataURI

Optional off-chain metadata pointer (URI) describing the
arbiter's policy, jurisdiction, or dispute process.

Terms are encoded in the on-chain bond game, not an off-chain
pointer; returns empty.


```solidity
function arbiterMetadataURI() external pure returns (string memory);
```

### supportsInterface

Returns true if this contract implements the interface defined by
`interfaceId`. See the corresponding
https://eips.ethereum.org/EIPS/eip-165#how-interfaces-are-identified[ERC section]
to learn more about how these ids are created.
This function call must use less than 30 000 gas.


```solidity
function supportsInterface(bytes4 interfaceId) external pure returns (bool);
```

### getClaim

Full claim struct (including the bond stack) for `claimId`.


```solidity
function getClaim(uint256 claimId) external view returns (Claim memory);
```

### getBondStackTop

Top-of-stack assertion and its optimistic deadline for `claimId`.


```solidity
function getBondStackTop(uint256 claimId)
    external
    view
    returns (address asserter, uint16 amountBps, uint128 bond, uint64 deadline);
```

### bondFloor

The minimum bond `proposeClaim` accepts for a claim of
`amountBps` against `commitmentId`:
`max(minBond, claimValue * bondBps / 10_000)`, where the claim
value is quoted via the commitment's backing adapter.


```solidity
function bondFloor(uint256 commitmentId, uint16 amountBps) external view returns (uint256);
```

### proposeClaim

Open a new claim against `commitmentId`. Pulls `bond` from
msg.sender; `bond ≥ bondFloor(commitmentId, amountBps)`. The
proposer asserts the policy should pay out at `amountBps` of
the encumbered amount. Immediately opens the manager-side
forfeit proposal at `amountBps` so the committer cannot exit
(unbond/expire) while the claim is pending. Requires the
commitment's `challengeWindow >= answerTimeout` so the hold
cannot be executed before the claim resolves.


```solidity
function proposeClaim(
    uint256 commitmentId,
    uint16 amountBps,
    bytes32 evidenceHash,
    bytes32 templateId,
    uint128 bond
) external nonReentrant returns (uint256 claimId);
```

### disputeClaim

Dispute the top-of-stack assertion. New bond must be at least
`2 × top.bond`. Disputer cannot be the most recent asserter
(no self-dispute griefing). Stack depth is capped at
`MAX_BOND_DOUBLINGS`; beyond that, the optimistic timeout
resolves the top-of-stack answer. Re-initiates the manager-side
hold at the (capped) counter answer so the pending forfeit
proposal always mirrors the current top of stack and its
challenge window restarts with the answer timer.


```solidity
function disputeClaim(uint256 claimId, uint16 counterAmountBps, bytes32 evidenceHash, uint128 bond)
    external
    nonReentrant;
```

### cancelClaim

Proposer cancels their own claim while no dispute has landed.
Refunds the proposer's bond, cancels the manager-side hold, and
frees the commitment so future claims can open. State => Cancelled.


```solidity
function cancelClaim(uint256 claimId) external nonReentrant;
```

### finalizeClaim

Finalize a claim once the optimistic timer has elapsed without
a new dispute. The top-of-stack answer wins by exhaustion.
Normally the manager-side hold already sits at the (capped)
winning answer, so this just transitions to Forfeiture (or
cancels the hold and settles bonds directly when the winning
answer is "no payout"). Degrades gracefully when the manager
side was resolved externally: an already-executed forfeit
settles bonds at the winning answer; a stale-cancelled hold is
re-initiated (commitment still active) or — when the committer
exited in the gap — the bond game settles with no lien left to
enforce. No path can strand bonds.


```solidity
function finalizeClaim(uint256 claimId) external nonReentrant;
```

### executeClaim

Execute the manager-side forfeit after its challenge window.
Tolerates external resolution (`manager.executeForfeit` is
permissionless and `cancelStaleForfeitProposal` can fire past
the TTL): an already-executed forfeit skips the manager call
and settles bonds; a stale-cancelled proposal unwinds the claim
and refunds every bond. Moves to Settled (or Cancelled on the
unwind path) and distributes bonds.


```solidity
function executeClaim(uint256 claimId) external nonReentrant;
```

### cancelStaleClaim

Anyone can cancel a stale claim — one where the optimistic
timer has long since elapsed and nobody finalized. Refunds
all bonds to their asserters, releases the manager-side hold,
and frees the commitment. Exception: if the hold was already
executed externally (permissionless past its window), the
top-of-stack answer IS enforced on-chain, so the bond game
settles at it exactly as `finalizeClaim` would — a losing
disputer cannot wait out the TTL to reclaim a bond that the
enforced result forfeits.


```solidity
function cancelStaleClaim(uint256 claimId) external nonReentrant;
```

### _settle

Settle terminal bookkeeping shared by every finalize path that
skips (or already passed) the manager-side execution.


```solidity
function _settle(uint256 claimId, uint16 finalizedBps) internal;
```

### _bondFloor

max(minBond, adapter-quoted claim value scaled by bondBps).


```solidity
function _bondFloor(ICommitmentManager.Commitment memory cm, uint16 amountBps)
    internal
    view
    returns (uint256 floor);
```

### _proposalActive

An initiated proposal that is neither executed nor cancelled.


```solidity
function _proposalActive(ICommitmentManager.ForfeitProposal memory p) internal pure returns (bool);
```

### _capped

Cap an asserted amount to the commitment's consented maximum.


```solidity
function _capped(uint16 amountBps, uint16 maxPenaltyBps) internal pure returns (uint16);
```

### _refundAllBonds

Refund every bond in the stack to its asserter (no winner).


```solidity
function _refundAllBonds(Claim storage c) internal;
```

### _distributeBonds

Walk the bond stack: refund every entry whose `amountBps`
matches the winning amount; the rest forfeit. Forfeit pool
splits `winnerShareBps` to the LAST winning asserter (the most
committed correct answer) and the remainder to `treasury`.


```solidity
function _distributeBonds(uint256 claimId) internal;
```

## Events
### ClaimProposed

```solidity
event ClaimProposed(
    uint256 indexed claimId,
    uint256 indexed commitmentId,
    address indexed proposer,
    uint16 amountBps,
    uint128 bond,
    bytes32 evidenceHash,
    bytes32 templateId
);
```

### ClaimDisputed

```solidity
event ClaimDisputed(
    uint256 indexed claimId, address indexed disputer, uint16 amountBps, uint128 bond, bytes32 evidenceHash
);
```

### ClaimCancelled

```solidity
event ClaimCancelled(uint256 indexed claimId);
```

### ClaimRuled

```solidity
event ClaimRuled(uint256 indexed claimId, uint16 winningAmtBps, address indexed source);
```

### ClaimFinalized

```solidity
event ClaimFinalized(uint256 indexed claimId, uint16 winningAmtBps);
```

### ClaimSettled

```solidity
event ClaimSettled(uint256 indexed claimId, uint256 winnerPayout, uint256 treasuryPayout, uint256 winningRefunds);
```

### ClaimStaleCancelled

```solidity
event ClaimStaleCancelled(uint256 indexed claimId);
```

### ClaimUnwound
The manager-side forfeit proposal was cancelled externally
(`cancelStaleForfeitProposal`) after the claim entered
Forfeiture — the lien resolution failed, so the claim unwinds
and every bond is refunded to its asserter.


```solidity
event ClaimUnwound(uint256 indexed claimId);
```

## Errors
### WrongBondToken

```solidity
error WrongBondToken();
```

### BondBelowFloor

```solidity
error BondBelowFloor(uint256 minimum, uint256 provided);
```

### BondNotDoubled

```solidity
error BondNotDoubled(uint256 required, uint256 provided);
```

### InvalidAmountBps

```solidity
error InvalidAmountBps(uint16 amountBps);
```

### CommitmentNotActive

```solidity
error CommitmentNotActive(uint256 commitmentId);
```

### WrongArbiter

```solidity
error WrongArbiter(address expected, address actual);
```

### ClaimAlreadyActive

```solidity
error ClaimAlreadyActive(uint256 commitmentId, uint256 existingClaimId);
```

### UnknownClaim

```solidity
error UnknownClaim(uint256 claimId);
```

### WrongClaimState

```solidity
error WrongClaimState(ClaimState expected, ClaimState actual);
```

### LastAsserterCannotDispute

```solidity
error LastAsserterCannotDispute();
```

### MaxDoublingsReached

```solidity
error MaxDoublingsReached();
```

### NotProposer

```solidity
error NotProposer(address proposer, address caller);
```

### AlreadyDisputed

```solidity
error AlreadyDisputed();
```

### TimeoutNotElapsed

```solidity
error TimeoutNotElapsed(uint64 readyAt, uint64 nowTs);
```

### AmountAboveCommitmentMax

```solidity
error AmountAboveCommitmentMax(uint16 commitmentMax, uint16 claimAmount);
```

### TreasuryRequired

```solidity
error TreasuryRequired();
```

### ZeroAnswerTimeout

```solidity
error ZeroAnswerTimeout();
```

### InvalidWinnerShareBps

```solidity
error InvalidWinnerShareBps();
```

### StaleTtlNotElapsed

```solidity
error StaleTtlNotElapsed(uint64 readyAt, uint64 nowTs);
```

### ChallengeWindowTooShort

```solidity
error ChallengeWindowTooShort(uint64 required, uint64 actual);
```

### ClaimAlreadyEnforced

```solidity
error ClaimAlreadyEnforced(uint256 claimId);
```

## Structs
### BondEntry

```solidity
struct BondEntry {
    address asserter;
    uint16 amountBps;
    uint128 bond;
}
```

### Claim

```solidity
struct Claim {
    uint256 commitmentId;
    uint16 winningAmtBps;
    uint64 lastBondAt;
    ClaimState state;
    bytes32 templateId;
    BondEntry[] stack;
}
```

## Enums
### ClaimState

```solidity
enum ClaimState {
    None,
    Proposed,
    Resolved,
    Forfeiture,
    Settled,
    Cancelled
}
```
