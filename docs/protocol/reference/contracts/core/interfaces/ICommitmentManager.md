---
title: ICommitmentManager
status: generated
source: src/core/interfaces/ICommitmentManager.sol
generated: true
---
# ICommitmentManager
**Title:**
ICommitmentManager

Full interface for the direct-custody commitment manager (ERC-COMMITMENTS Parts A–D
plus the agreements extension). The manager is the custody root: it holds backing
tokens, maintains the per-(token, user) free/encumbered ledger and per-strategy escrow,
owns the commitment state machine, and is the sole executor of token movements.

Getter naming convention: use `getX` for record or aggregate snapshots (especially struct
returns), bare `x(...)` for scalar ledger/configuration/state reads, and `xOf(...)` for
per-key collections or relationships. Existing getter names remain unchanged for ABI
stability; new views should follow these categories.


## Functions
### deposit

Pull `amount` of `token` from the caller and credit the caller's free balance
by the measured balance delta (fee-on-transfer defense, ERC §A.2).


```solidity
function deposit(address token, uint256 amount) external;
```

### depositFor

Deposit `amount` of `token` pulled from the caller into `onBehalfOf`'s free balance.
Measured-delta rule as in `deposit`. The `Deposited` event credits `onBehalfOf`.


```solidity
function depositFor(address token, uint256 amount, address onBehalfOf) external;
```

### depositWithPermit

Deposit via an ERC-2612 permit — collapses approve + deposit into one tx. Measured-
delta rule as in `deposit`; a front-run (already-consumed) permit is tolerated.


```solidity
function depositWithPermit(address token, uint256 amount, uint256 deadline, uint8 v, bytes32 r, bytes32 s_) external;
```

### withdraw

Debit the caller's free balance and transfer `amount` of `token` out. Instant:
free balance backs nothing and is never subject to an unbonding delay.


```solidity
function withdraw(address token, uint256 amount) external;
```

### fundStrategy

Permissionlessly credit `escrow[strategy][token]` by pulling `amount` from the
caller (measured-delta rule). Refund policy is strategy-defined (ERC §A.4).

WARNING: escrow is a single per-(strategy,token) pot with NO funder attribution —
the funder appears only in the `StrategyFunded` event. Unless the target strategy
attributes funding on its own surface (e.g. a `prefund` that calls this itself),
anything sent here is pooled, first-come, and non-refundable: escrow debits exist
only inside the commitment-scoped movement pipeline (§D.5). Do not prefund
user-attributed obligations through this surface directly.


```solidity
function fundStrategy(address strategy, address token, uint256 amount) external;
```

### freeBalance

Free (withdrawable) balance of `user` in `token`.


```solidity
function freeBalance(address token, address user) external view returns (uint256);
```

### encumberedBalance

Encumbered (commitment-backing) balance of `user` in `token`.


```solidity
function encumberedBalance(address token, address user) external view returns (uint256);
```

### escrowOf

Escrow balance held for `strategy` in `token`. Arg order is `(token, strategy)` to
match the rest of the view surface (token first).


```solidity
function escrowOf(address token, address strategy) external view returns (uint256);
```

### unbondingPeriod

Manager-level unbonding period (seconds) for committer-initiated unbond. Always > 0.


```solidity
function unbondingPeriod() external view returns (uint64);
```

### operatorRegistry

Operator registry wired for delegation release/forfeit hooks (0 = disabled).
Registries verify `operatorRegistry() == address(this)` before accepting
registrations/delegations — an unwired registry never receives the hooks, so
any stake it credited would be phantom, unbacked voting power.


```solidity
function operatorRegistry() external view returns (address);
```

### pauseForfeiture

Pause forfeit execution (PAUSER_ROLE).


```solidity
function pauseForfeiture() external;
```

### unpauseForfeiture

Unpause forfeit execution (UNPAUSER_ROLE).


```solidity
function unpauseForfeiture() external;
```

### forfeiturePaused

Whether forfeit execution is paused.


```solidity
function forfeiturePaused() external view returns (bool);
```

### pauseState

Pause-budget accounting (ERC §A.6 erratum): the raw episode state plus the
budget-clamped total (`creditable`) that constraining windows subtract as
stopped-clock time. `creditable` is monotone non-decreasing and never exceeds
`maxPauseDuration`; once they are equal the budget is spent and further pauses
stop no clocks.


```solidity
function pauseState()
    external
    view
    returns (bool paused, uint64 pausedAt, uint64 cumulativePaused, uint64 maxPauseDuration, uint64 creditable);
```

### createCommitment

Create a commitment, encumbering `params.amount` of `params.token` from the
caller's free balance. Runs each strategy's `onCommitmentCreated` in array order;
a revert in any hook aborts creation (compatibility refusal, ERC §C.1).


```solidity
function createCommitment(CommitmentParams calldata params) external returns (uint256 commitmentId);
```
**Returns**

|Name|Type|Description|
|----|----|-----------|
|`commitmentId`|`uint256`|The new commitment's id (always ≥ 1; 0 is reserved, INV-10).|


### createAndFund

Deposit `depositAmount` of `params.token` and create a commitment in a single tx,
encumbering `params.amount` from the now-funded free balance. Collapses the usual
deposit → create into one call. The deposit is credited by the MEASURED balance delta
(fee-on-transfer defense, ERC §A.2), so `params.amount` is encumbered from the sum of
the caller's prior free balance and the measured receipt.

Params are validated BEFORE the token pull (revert-before-pull), so a rejected commitment
never moves funds. Surplus (`depositAmount > params.amount`) stays in the caller's free
balance and is instantly withdrawable; a smaller `depositAmount` succeeds only when the
caller's prior free balance covers the shortfall (else `InsufficientFreeBalance`);
`depositAmount == 0` degenerates to a plain create against existing free balance.


```solidity
function createAndFund(uint256 depositAmount, CommitmentParams calldata params)
    external
    returns (uint256 commitmentId);
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`depositAmount`|`uint256`|Raw units of `params.token` to pull from the caller before creating.|
|`params`|`CommitmentParams`|Commitment parameters (see `createCommitment`).|

**Returns**

|Name|Type|Description|
|----|----|-----------|
|`commitmentId`|`uint256`|The new commitment's id (always ≥ 1; 0 is reserved, INV-10).|


### releaseCommitment

Arbiter-immediate release. Runs release hooks (guarded, ERC §D.6) BEFORE freeing
the committer's remaining encumbrance.


```solidity
function releaseCommitment(uint256 commitmentId) external;
```

### expireCommitment

Committer self-release after `expiresAt`. Same hook sequence as release.


```solidity
function expireCommitment(uint256 commitmentId) external;
```

### initiateForfeit

Arbiter-only. Starts the challenge-window timer; at most one active proposal (INV-7).


```solidity
function initiateForfeit(uint256 commitmentId, uint16 penaltyBps) external;
```

### executeForfeit

Anyone, after the challenge window. Manager-internal forfeit transfer credits the
counterparty's FREE balance (pull-payment); residual returns to the committer.
Forfeit hooks run guarded, strictly after the transfer (ERC §C.3).


```solidity
function executeForfeit(uint256 commitmentId) external;
```

### cancelForfeit

Arbiter-only cancel of a pending proposal.


```solidity
function cancelForfeit(uint256 commitmentId) external;
```

### cancelStaleForfeitProposal

Anyone, after `initiatedAt + challengeWindow + FORFEIT_PROPOSAL_TTL`. Unblocks
committer unbond when the arbiter has abandoned (ERC §C.4).


```solidity
function cancelStaleForfeitProposal(uint256 commitmentId) external;
```

### requestUnbond

Committer-only. Starts the unbond timer; changes no ledger state. The arbiter
retains forfeit authority during the window (ERC §C.5).


```solidity
function requestUnbond(uint256 commitmentId) external;
```

### finalizeUnbond

Anyone, after `unbondInitiatedAt + unbondingPeriod()`. Reverts if a forfeit proposal
is active. Closes with the same accounting as release (hooks first).


```solidity
function finalizeUnbond(uint256 commitmentId) external;
```

### cancelUnbond

Committer-only. Returns the commitment to its prior active state.


```solidity
function cancelUnbond(uint256 commitmentId) external;
```

### contributeEncumbered

Contribute free balance into a commitment's encumbered position. The committer
opts in by being the first contributor; external contributions are accepted after.


```solidity
function contributeEncumbered(uint256 commitmentId, uint256 units) external;
```

### getCommitment


```solidity
function getCommitment(uint256 commitmentId) external view returns (Commitment memory);
```

### getForfeitProposal


```solidity
function getForfeitProposal(uint256 commitmentId) external view returns (ForfeitProposal memory);
```

### getAgreementPair

Commitment pair of an agreement ([0, 0] if unknown).


```solidity
function getAgreementPair(uint256 agreementId) external view returns (uint256, uint256);
```

### agreementOf

The agreement a commitment belongs to (0 = not agreed).


```solidity
function agreementOf(uint256 commitmentId) external view returns (uint256);
```

### agreementOfProposal

The agreement a proposal produced (0 = never accepted). Reverse of the accept-time
link, so a proposer or indexer can map `proposalId → agreementId` in one read.


```solidity
function agreementOfProposal(uint256 proposalId) external view returns (uint256);
```

### getUserExposure


```solidity
function getUserExposure(address token, address user) external view returns (UserExposure memory);
```

### strategiesOf


```solidity
function strategiesOf(uint256 commitmentId) external view returns (address[] memory);
```

### unbondInitiatedAt


```solidity
function unbondInitiatedAt(uint256 commitmentId) external view returns (uint64);
```

### getUserCommitmentIds


```solidity
function getUserCommitmentIds(address user) external view returns (uint256[] memory);
```

### closedAt

Close timestamp of a commitment (0 = still active). `getCommitment().amount` is
zeroed at close, so this is the only surviving on-chain signal that a commitment
ever existed and when it settled.


```solidity
function closedAt(uint256 commitmentId) external view returns (uint64);
```

### forfeitedUnitsOf

Units forfeited at `executeForfeit` (0 = never forfeited). Persisted so consumers
can reconstruct the forfeit magnitude after the commitment `amount` is zeroed.


```solidity
function forfeitedUnitsOf(uint256 commitmentId) external view returns (uint256);
```

### acceptsContributions

Whether the commitment accepts third-party `contributeEncumbered` calls (ERC §C.6).


```solidity
function acceptsContributions(uint256 commitmentId) external view returns (bool);
```

### distribute

Permissionlessly advance one bound strategy's accrual. Reverts bubble (ERC §D.3).


```solidity
function distribute(uint256 commitmentId, address strategy) external;
```

### distributeAll

Convenience fold of `distribute` over `strategiesOf(id)` in array order.


```solidity
function distributeAll(uint256 commitmentId) external;
```

### claim

Strategy-mediated claim. Remains available after the commitment closes so parked
accrual is recoverable (ERC §D.3).


```solidity
function claim(uint256 commitmentId, address strategy, bytes calldata claimData) external;
```

### distributeAndClaim

Distribute one strategy's accrual then claim it, atomically. Resolves the ordering
footgun where `pending()` shows live accrual but `claim()` pays only banked accrual.


```solidity
function distributeAndClaim(uint256 commitmentId, address strategy, bytes calldata claimData) external;
```

### pending

Pending amount claimable via `claim` for the caller-implied recipient.


```solidity
function pending(uint256 commitmentId, address strategy, bytes calldata claimData) external view returns (uint256);
```

### sweepFailedHook

Permissionless re-drive of a failed lifecycle hook under the same guarded
semantics (ERC §D.6).


```solidity
function sweepFailedHook(uint256 commitmentId, address strategy) external;
```

### hookGasCap

Per-hook gas cap for guarded lifecycle hooks (≥ HOOK_GAS_CAP floor).


```solidity
function hookGasCap() external view returns (uint64);
```

### proposeAgreement


```solidity
function proposeAgreement(AgreementParams calldata params) external returns (uint256 proposalId);
```

### acceptAgreement

Accept a proposal, minting the two linked commitments.


```solidity
function acceptAgreement(uint256 proposalId)
    external
    returns (uint256 agreementId, uint256 commitmentIdA, uint256 commitmentIdB);
```
**Returns**

|Name|Type|Description|
|----|----|-----------|
|`agreementId`|`uint256`|The new agreement id.|
|`commitmentIdA`|`uint256`|The proposer's leg.|
|`commitmentIdB`|`uint256`|The acceptor's leg. Returning the pair here saves callers a follow-up `getAgreementPair` round-trip.|


### cancelAgreementProposal


```solidity
function cancelAgreementProposal(uint256 proposalId) external;
```

### forfeitAgreement

Initiate forfeit on both legs atomically (shared-arbiter-only), each at `penaltyBps`.


```solidity
function forfeitAgreement(uint256 agreementId, uint16 penaltyBps) external;
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`agreementId`|`uint256`||
|`penaltyBps`|`uint16`|Penalty applied to both legs; MUST be ≤ each unresolved leg's `maxPenaltyBps` (the two legs MAY carry different maxima, so the tighter ceiling binds). Pass a value ≤ the smaller of the two legs' `maxPenaltyBps` for a full forfeit.|


### releaseAgreement


```solidity
function releaseAgreement(uint256 agreementId) external;
```

### requestAgreementUnbond


```solidity
function requestAgreementUnbond(uint256 agreementId) external;
```

### settleAgreement

Arbiter-instructed value flow between the two parties of an agreement, bounded
by per-direction lifetime caps. Manager-internal encumbered transfer.


```solidity
function settleAgreement(uint256 agreementId, bool fromProposer, uint256 units, bytes32 evidenceHash) external;
```

### getAgreementSettlement


```solidity
function getAgreementSettlement(uint256 agreementId)
    external
    view
    returns (uint128 maxPToA, uint128 maxAToP, uint128 cumulPToA, uint128 cumulAToP);
```

### createMutual

Create a Mutual. Starts inactive; the creator (assembler/arbiter) activates
it once capacity is filled. `valuationAuthority == 0` selects the oracle-free
homogeneous-numeraire subset (every member posts the mutual's `numeraire` token and
`creditedValue == E_i` by construction).


```solidity
function createMutual(MutualParams calldata params) external returns (uint256 mutualId);
```

### activateMutual

Flip an inactive mutual active (arbiter or creator). No new losses until active.


```solidity
function activateMutual(uint256 mutualId) external;
```

### configureHeterogeneous

Configure heterogeneous mode (valuationAuthority-only, while inactive & non-terminal).
Sets the manipulation-resistant band adapter, the band bounds, the junior split, and
the per-collateral haircuts. Immutable after this call; reverts otherwise. Only valid
for mutuals created with a non-zero `valuationAuthority` (homogeneous mutuals can never
be configured). Once configured, premium funding (`fundMutualPremium`) is re-enabled and
new joins derive their `premiumWeight` from the band+haircut instead of the attestation.


```solidity
function configureHeterogeneous(uint256 mutualId, HeteroConfig calldata config) external;
```

### remark

Permissionless down-only re-mark of one member's premium weight (heterogeneous only).
Recomputes the band+haircut weight and ratchets `premiumWeight` to the MIN of the
current and recomputed value (monotone non-increasing, INV-P11). Reverts while a mutual
loss is pending (INV-P12). Writes ONLY `premiumWeight` and the premium aggregates —
never the loss denominator (`creditedValue` / `totalShares` / Lambda / headroom).


```solidity
function remark(uint256 mutualId, uint256 commitmentId) external;
```

### joinMutual

Create a fresh commitment and join it to `mutualId` atomically, freezing the opaque
capacity weight `creditedValue`. In homogeneous mode `creditedValue` is ignored and
set to `E_i`; in attested mode it must be signed by the mutual's `valuationAuthority`.


```solidity
function joinMutual(
    uint256 mutualId,
    CommitmentParams calldata params,
    uint128 creditedValue,
    bytes calldata attestation
) external returns (uint256 commitmentId);
```

### initiateMutualLoss

Phase 1 (mutual arbiter only): declare a loss `lossNumeraire`, starting the mutual
challenge window. Freezes joins/exits/releases until resolved.


```solidity
function initiateMutualLoss(uint256 mutualId, uint256 lossNumeraire, bytes32 evidenceHash) external;
```

### executeMutualLoss

Phase 2 (anyone, after the window): bump Lambda once by the clamped loss fraction.


```solidity
function executeMutualLoss(uint256 mutualId) external;
```

### cancelMutualLoss

Mutual arbiter cancel of a pending loss declaration.


```solidity
function cancelMutualLoss(uint256 mutualId) external;
```

### cancelStaleMutualLoss

Permissionless force-cancel of a stale loss declaration after its TTL.


```solidity
function cancelStaleMutualLoss(uint256 mutualId) external;
```

### settleMemberLoss

Permissionless, lazy: settle one member's accrued share of the shared loss. K
deferred losses collapse into one O(1) settle (reads current Lambda).


```solidity
function settleMemberLoss(uint256 commitmentId) external;
```

### settleMembers

Bounded batch convenience over `settleMemberLoss`.


```solidity
function settleMembers(uint256[] calldata commitmentIds) external;
```

### requestMutualExit

Member-only: start the deallocation window. The line stays in `totalShares` and
mutual-slashable until the window elapses (pre-declaration escape defense).


```solidity
function requestMutualExit(uint256 commitmentId) external;
```

### releaseMutualMember

Release a mutual member once fully settled and past the deallocation window. Returns
the residual encumbrance to the committer's free balance.


```solidity
function releaseMutualMember(uint256 commitmentId) external;
```

### fundMutualPremium

Policyholder-funded premium: pull `amount` of the mutual's numeraire (measured-receipt,
fee-on-transfer safe) and (re)start a Synthetix stream over `duration` seconds. The
core is pricing-agnostic — it only sets a future rate under the funding-time solvency
guard (INV-P2). Reverts `NoActiveCover` when there is no live cover to distribute to,
`StreamDurationOutOfBounds` when `duration` is outside [1 minutes, 365 days] (or the
uint64 deadline would overflow), and `PremiumRateDecreased` when a live stream's rate
would drop (permissionless funding may only maintain or raise the rate).


```solidity
function fundMutualPremium(uint256 mutualId, uint256 amount, uint64 duration) external;
```

### claimMemberPremium

Permissionless: bank-and-pay a member's accrued premium to its committer (CEI-strict).


```solidity
function claimMemberPremium(uint256 commitmentId) external;
```

### claimMembersPremium

Bounded batch convenience over `claimMemberPremium`.


```solidity
function claimMembersPremium(uint256[] calldata commitmentIds) external;
```

### reclaimPremium

Policyholder-of-record reclaims the unstreamed premium remainder and halts the stream.


```solidity
function reclaimPremium(uint256 mutualId) external;
```

### settleAndClaim

Convenience: `settleMemberLoss` then `claimMemberPremium` for one member under a
single reentrancy guard — two INDEPENDENT CEI passes with zero shared accounting.


```solidity
function settleAndClaim(uint256 commitmentId) external;
```

### getMutualPremiumState

Premium-side state of a mutual, for periphery/indexer read surfaces.


```solidity
function getMutualPremiumState(uint256 mutualId)
    external
    view
    returns (
        uint256 premiumPerShareStored,
        uint128 activeCover,
        uint256 settledTotal,
        uint128 rewardRate,
        uint64 lastUpdate,
        uint64 periodFinish,
        uint256 premiumRemainder,
        uint256 bankedTotal,
        uint256 premiumPool
    );
```
**Returns**

|Name|Type|Description|
|----|----|-----------|
|`premiumPerShareStored`|`uint256`|Pi (1e27)|
|`activeCover`|`uint128`|live deliverable-cover denominator|
|`settledTotal`|`uint256`|Σ settledUnits (activeCover == totalShares − settledTotal)|
|`rewardRate`|`uint128`|numeraire/second|
|`lastUpdate`|`uint64`|last poke time|
|`periodFinish`|`uint64`|stream end|
|`premiumRemainder`|`uint256`|carried dust|
|`bankedTotal`|`uint256`|Σ unclaimed rewardBank|
|`premiumPool`|`uint256`|reserve (`funded − claimed`)|


### pendingMemberPremium

Premium currently claimable by `commitmentId` if claimed now (banked + simulated accrual).


```solidity
function pendingMemberPremium(uint256 commitmentId) external view returns (uint256 claimable);
```

### getMutualJuniorPool

Junior shortfall absorber reserve (`funded − drawn`) for a mutual, in its numeraire.


```solidity
function getMutualJuniorPool(uint256 mutualId) external view returns (uint256 juniorPool);
```

### getMutual


```solidity
function getMutual(uint256 mutualId) external view returns (Mutual memory);
```

### getMembership


```solidity
function getMembership(uint256 commitmentId) external view returns (Membership memory);
```

### getMutualLossProposal


```solidity
function getMutualLossProposal(uint256 mutualId) external view returns (MutualLossProposal memory);
```

### pendingMemberLoss

Raw units `commitmentId` currently owes to the beneficiary if settled now.


```solidity
function pendingMemberLoss(uint256 commitmentId) external view returns (uint256 owedUnits);
```

### createCommitmentFor


```solidity
function createCommitmentFor(
    address committer,
    CommitmentParams calldata params,
    uint256 deadline,
    uint256 nonce,
    bytes calldata sig
) external returns (uint256 commitmentId);
```

### batchCreateCommitments


```solidity
function batchCreateCommitments(CommitmentParams[] calldata params)
    external
    returns (uint256[] memory commitmentIds);
```

### batchReleaseCommitments


```solidity
function batchReleaseCommitments(uint256[] calldata commitmentIds) external;
```

### nonces


```solidity
function nonces(address committer) external view returns (uint256);
```

### invalidateCreateAuthorization

Revoke outstanding `createCommitmentFor` authorizations by bumping the caller's nonce.


```solidity
function invalidateCreateAuthorization() external returns (uint256 newNonce);
```
**Returns**

|Name|Type|Description|
|----|----|-----------|
|`newNonce`|`uint256`|The caller's relayer nonce after the bump.|


## Events
### Deposited

```solidity
event Deposited(address indexed user, address indexed token, uint256 amount);
```

### Withdrawn

```solidity
event Withdrawn(address indexed user, address indexed token, uint256 amount);
```

### StrategyFunded

```solidity
event StrategyFunded(address indexed funder, address indexed strategy, address indexed token, uint256 amount);
```

### EncumbranceIncreased

```solidity
event EncumbranceIncreased(address indexed user, address indexed token, uint256 units);
```

### EncumbranceReleased
Encumbrance returned to the holder's FREE balance (encumbered -> free). Emitted on
commitment close (release / expire / finalize), forfeit-residual return, and
agreement-proposal cancel. `commitmentId == 0` is the sentinel for the
proposal-cancel path (no commitment exists yet).

Replaces the old overloaded `EncumbranceDecreased`: this path conserves the holder's
total ledger balance (free goes up by `units`), unlike the escrow/external paths.


```solidity
event EncumbranceReleased(uint256 indexed commitmentId, address indexed user, address indexed token, uint256 units);
```

### EncumbranceMovedToEscrow
Strategy moved encumbered backing into its own escrow (FromEncumberedToEscrow,
§D.5). Encumbered goes down, escrow up; the committer's free is unchanged.


```solidity
event EncumbranceMovedToEscrow(
    uint256 indexed commitmentId, address indexed strategy, address indexed token, uint256 units
);
```

### EncumbrancePaidExternal
Strategy paid encumbered backing out of the manager (FromEncumberedToExternal,
§D.5). Encumbered goes down and the value leaves custody; paired with
`DistributionPaid` (which carries the recipient).


```solidity
event EncumbrancePaidExternal(
    uint256 indexed commitmentId, address indexed strategy, address indexed token, uint256 units
);
```

### EncumbranceTransferred

```solidity
event EncumbranceTransferred(address indexed from, address indexed to, address indexed token, uint256 units);
```

### EncumbranceContributed

```solidity
event EncumbranceContributed(
    uint256 indexed commitmentId, address indexed contributor, address indexed receiver, uint256 units
);
```

### ForfeiturePauseToggled

```solidity
event ForfeiturePauseToggled(bool paused);
```

### CommitmentCreated

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
    uint64 expiresAt,
    string metadataURI,
    bytes32 metadataHash
);
```

### CommitmentCounterparty
Companion to CommitmentCreated: exposes `counterparty` as an indexed discovery axis.

CommitmentCreated's three topic slots are full (commitmentId, committer, arbiter), so the
counterparty discovery axis ("commitments where I am the counterparty") is emitted here,
joined to the creation event by `commitmentId`. Emitted from the libraries, so it costs
the manager's bytecode budget nothing. Only emitted when `counterparty != address(0)` —
the zero counterparty carries no queryable identity and is never indexed.


```solidity
event CommitmentCounterparty(uint256 indexed commitmentId, address indexed counterparty);
```

### CommitmentReleased

```solidity
event CommitmentReleased(uint256 indexed commitmentId, address indexed arbiter);
```

### CommitmentExpired

```solidity
event CommitmentExpired(uint256 indexed commitmentId, address indexed committer);
```

### ForfeitInitiated

```solidity
event ForfeitInitiated(uint256 indexed commitmentId, uint16 penaltyBps, uint64 challengeWindow);
```

### ForfeitExecuted

```solidity
event ForfeitExecuted(uint256 indexed commitmentId, uint256 unitsForfeited, address indexed counterparty);
```

### ForfeitCancelled

```solidity
event ForfeitCancelled(uint256 indexed commitmentId);
```

### ForfeitCancelledStale

```solidity
event ForfeitCancelledStale(uint256 indexed commitmentId);
```

### CommitmentUnbondRequested

```solidity
event CommitmentUnbondRequested(uint256 indexed commitmentId, address indexed committer, uint64 maturesAt);
```

### CommitmentFinalized

```solidity
event CommitmentFinalized(uint256 indexed commitmentId);
```

### CommitmentUnbondCancelled

```solidity
event CommitmentUnbondCancelled(uint256 indexed commitmentId);
```

### ContributionsEnabled

```solidity
event ContributionsEnabled(uint256 indexed commitmentId, address indexed committer);
```

### CommitmentBoundToStrategy
Emitted by the manager on createCommitment (and agreement accept), once per
bound strategy. Lets indexers build the strategy → commitments[] map.


```solidity
event CommitmentBoundToStrategy(uint256 indexed commitmentId, address indexed strategy, bytes strategyParams);
```

### DistributionPaid
MUST be emitted on every payout to a recipient, regardless of execution path
(ERC §D.7). The manager emits it for every applied recipient-crediting movement;
self-custody strategies emit it from their own surface. `commitmentId = 0` is the
non-attribution sentinel for cross-commitment payouts; `context` is strategy-defined.


```solidity
event DistributionPaid(
    address indexed strategy,
    address indexed recipient,
    address indexed token,
    uint256 amount,
    uint256 commitmentId,
    bytes32 context
);
```

### StrategyHookFailed
Emitted when a guarded lifecycle hook fails (ERC §D.6). The strategy's in-flight
accrual is parked in its escrow, never forfeited; `sweepFailedHook` can re-drive.


```solidity
event StrategyHookFailed(uint256 indexed commitmentId, address indexed strategy, bytes4 hookSelector);
```

### AgreementProposed

```solidity
event AgreementProposed(
    uint256 indexed proposalId, address indexed proposer, address indexed acceptor, string uri, bytes32 contentHash
);
```

### AgreementProposedTerms
Companion to AgreementProposed: the immutable per-leg economic terms of a pending
proposal, event-sourced so they need no struct getter. Emitted from the library, so it
costs the manager's bytecode budget nothing. This is the CANONICAL read of pending-
proposal terms (the struct getter is intentionally omitted from this implementation for
EIP-170 headroom; terms are immutable, so one getLogs by proposalId is authoritative).

The mutable `accepted`/`cancelled` flags are NOT carried here — resolve a proposal's
terminal state via `agreementOfProposal` (non-zero ⇒ accepted) or the accept/cancel
events. Metadata (`metadataURI`/`metadataHash`) lives in `AgreementProposed` as
`uri`/`contentHash`. Only `proposalId` is indexed (stay ≤ 3 topics).


```solidity
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
```

### AgreementAccepted

```solidity
event AgreementAccepted(
    uint256 indexed agreementId,
    uint256 indexed proposalId,
    uint256 commitmentIdA,
    uint256 commitmentIdB,
    string uri,
    bytes32 contentHash
);
```

### AgreementProposalCancelled

```solidity
event AgreementProposalCancelled(uint256 indexed proposalId);
```

### AgreementProposalExpiredCancelled

```solidity
event AgreementProposalExpiredCancelled(uint256 indexed proposalId, address indexed proposer);
```

### AgreementForfeited

```solidity
event AgreementForfeited(uint256 indexed agreementId);
```

### AgreementReleased

```solidity
event AgreementReleased(uint256 indexed agreementId);
```

### AgreementPartialForfeit

```solidity
event AgreementPartialForfeit(uint256 indexed agreementId, uint256 indexed commitmentId);
```

### AgreementUnbondRequested

```solidity
event AgreementUnbondRequested(uint256 indexed agreementId);
```

### AgreementSettled

```solidity
event AgreementSettled(
    uint256 indexed agreementId,
    bool fromProposer,
    uint256 units,
    uint256 cumulativeProposerToAcceptor,
    uint256 cumulativeAcceptorToProposer,
    bytes32 evidenceHash
);
```

### MutualCreated

```solidity
event MutualCreated(
    uint256 indexed mutualId,
    address indexed arbiter,
    address numeraire,
    address beneficiary,
    address valuationAuthority
);
```

### MutualActivated

```solidity
event MutualActivated(uint256 indexed mutualId);
```

### MutualTerminated

```solidity
event MutualTerminated(uint256 indexed mutualId);
```

### MemberJoined

```solidity
event MemberJoined(
    uint256 indexed mutualId,
    uint256 indexed commitmentId,
    address indexed committer,
    uint128 creditedValue,
    uint256 forfeitableUnits
);
```

### MutualLossInitiated

```solidity
event MutualLossInitiated(
    uint256 indexed mutualId, uint256 lossNumeraire, bytes32 evidenceHash, address indexed proposer
);
```

### MutualLossExecuted
Lambda bumped at execute. `appliedNumeraire` may be < the declared L when the
`cumulativeLoss <= 1e18` clamp bites (see MutualLossShortfall).


```solidity
event MutualLossExecuted(uint256 indexed mutualId, uint256 appliedNumeraire, uint256 cumulativeLoss);
```

### MutualLossCancelled

```solidity
event MutualLossCancelled(uint256 indexed mutualId, bool stale);
```

### MutualLossShortfall
Beneficiary under-recovery: the clamp prevented `shortfallNumeraire` of declared
loss from being attributed. Observable, never silent.


```solidity
event MutualLossShortfall(uint256 indexed mutualId, uint256 shortfallNumeraire);
```

### MemberSettled
A member settled its share of the shared loss (lazy, permissionless, O(1)).


```solidity
event MemberSettled(
    uint256 indexed mutualId, uint256 indexed commitmentId, uint256 owedUnits, uint256 cumulativeLoss
);
```

### MemberExitRequested

```solidity
event MemberExitRequested(uint256 indexed mutualId, uint256 indexed commitmentId, uint64 slashableUntil);
```

### MemberReleased

```solidity
event MemberReleased(uint256 indexed mutualId, uint256 indexed commitmentId);
```

### MutualPremiumFunded
Policyholder funded/extended a mutual's premium stream. `received` is the MEASURED
balance delta (fee-on-transfer safe); `rewardRate`/`periodFinish` are post-funding.


```solidity
event MutualPremiumFunded(
    uint256 indexed mutualId, address indexed funder, uint256 received, uint128 rewardRate, uint64 periodFinish
);
```

### MemberPremiumClaimed
A member's accrued premium was paid to its committer (via `claimMemberPremium`,
`settleAndClaim`, or the auto-pay on `releaseMutualMember`).


```solidity
event MemberPremiumClaimed(uint256 indexed commitmentId, address indexed recipient, uint256 amount);
```

### PremiumReclaimed
The policyholder-of-record reclaimed the unstreamed premium remainder and halted the stream.


```solidity
event PremiumReclaimed(uint256 indexed mutualId, address indexed recipient, uint256 unstreamed);
```

### MutualPremiumSwept
Terminal sweep of a wound-down mutual's residual reserve (so INV-P1 closes at zero).


```solidity
event MutualPremiumSwept(uint256 indexed mutualId, address indexed recipient, uint256 amount);
```

### MutualHeterogeneousConfigured
A mutual was configured for heterogeneous mode (immutable after; pre-activation only).


```solidity
event MutualHeterogeneousConfigured(
    uint256 indexed mutualId,
    address indexed bandAdapter,
    uint64 valuationFloorBps,
    uint64 valuationCeilBps,
    uint64 juniorBps
);
```

### MemberRemarked
A member's premium weight was down-only re-marked (monotone non-increasing, INV-P11).


```solidity
event MemberRemarked(uint256 indexed commitmentId, uint128 oldWeight, uint128 newWeight);
```

### MutualJuniorFunded
The junior shortfall absorber was funded by the premium split (`juniorBps` of a receipt).


```solidity
event MutualJuniorFunded(uint256 indexed mutualId, address indexed funder, uint256 amount);
```

### MutualJuniorDrawn
The junior absorber was drawn at settle to top up the beneficiary's numeraire recovery.


```solidity
event MutualJuniorDrawn(uint256 indexed commitmentId, uint256 amount);
```

### MutualJuniorSwept
Terminal sweep of a wound-down mutual's residual junior reserve (so INV-P13 closes at zero).


```solidity
event MutualJuniorSwept(uint256 indexed mutualId, address indexed recipient, uint256 amount);
```

### OperatorRegistryUpdated

```solidity
event OperatorRegistryUpdated(address indexed oldRegistry, address indexed newRegistry);
```

### RegistryHookFailed

```solidity
event RegistryHookFailed(uint256 indexed commitmentId, bytes4 indexed selector);
```

### MinChallengeWindowUpdated

```solidity
event MinChallengeWindowUpdated(uint64 oldValue, uint64 newValue);
```

### UnbondingPeriodUpdated

```solidity
event UnbondingPeriodUpdated(uint64 oldValue, uint64 newValue);
```

### HookGasCapUpdated

```solidity
event HookGasCapUpdated(uint64 oldValue, uint64 newValue);
```

### CreateAuthorizationInvalidated
Emitted when `committer` bumps their relayer nonce to `newNonce`, revoking any
outstanding `createCommitmentFor` authorization bound to the previous nonce.


```solidity
event CreateAuthorizationInvalidated(address indexed committer, uint256 newNonce);
```

## Errors
### ZeroAddress

```solidity
error ZeroAddress();
```

### ZeroAmount

```solidity
error ZeroAmount();
```

### InsufficientFreeBalance

```solidity
error InsufficientFreeBalance(uint256 requested, uint256 available);
```

### InsufficientEncumberedBalance

```solidity
error InsufficientEncumberedBalance(uint256 requested, uint256 available);
```

### InsufficientEscrow

```solidity
error InsufficientEscrow(uint256 requested, uint256 available);
```

### ForfeitureIsPaused

```solidity
error ForfeitureIsPaused();
```

### Unauthorized

```solidity
error Unauthorized();
```

### ZeroArbiter

```solidity
error ZeroArbiter();
```

### ZeroCounterparty

```solidity
error ZeroCounterparty();
```

### PenaltyExceedsMax

```solidity
error PenaltyExceedsMax();
```

### ExposureAllocationExceeded

```solidity
error ExposureAllocationExceeded();
```

### TooManyStrategies

```solidity
error TooManyStrategies();
```

### NotArbiter

```solidity
error NotArbiter();
```

### NotCommitter

```solidity
error NotCommitter();
```

### CommitmentInactive

```solidity
error CommitmentInactive();
```

### ForfeitPending

```solidity
error ForfeitPending();
```

### NoActiveForfeitProposal

```solidity
error NoActiveForfeitProposal();
```

### ChallengeWindowActive

```solidity
error ChallengeWindowActive();
```

### ChallengeWindowTooShort

```solidity
error ChallengeWindowTooShort();
```

### CommitmentHasNoExpiry

```solidity
error CommitmentHasNoExpiry();
```

### CommitmentNotExpired

```solidity
error CommitmentNotExpired();
```

### InvalidExpiry

```solidity
error InvalidExpiry();
```

### URITooLong

```solidity
error URITooLong();
```

### UnbondAlreadyRequested

```solidity
error UnbondAlreadyRequested();
```

### UnbondNotElapsed

```solidity
error UnbondNotElapsed(uint64 maturesAt);
```

### NoUnbondPending

```solidity
error NoUnbondPending();
```

### UnbondBlockedByForfeit

```solidity
error UnbondBlockedByForfeit();
```

### UnbondPending

```solidity
error UnbondPending();
```

### UseAgreementPath

```solidity
error UseAgreementPath();
```

### ContributionsDisabled

```solidity
error ContributionsDisabled();
```

### SignatureExpired

```solidity
error SignatureExpired();
```

### InvalidNonce

```solidity
error InvalidNonce();
```

### InvalidSignature

```solidity
error InvalidSignature();
```

### EmptyBatch

```solidity
error EmptyBatch();
```

### UnknownStrategy

```solidity
error UnknownStrategy();
```

### DuplicateStrategy

```solidity
error DuplicateStrategy();
```

### InsufficientGasForHook

```solidity
error InsufficientGasForHook();
```

### NoFailedHook

```solidity
error NoFailedHook();
```

### MovementZeroUnits
A movement carried zero units.


```solidity
error MovementZeroUnits();
```

### MovementToEscrowNotAllowedOnClaim
FromEncumberedToEscrow is not permitted at the claim site.


```solidity
error MovementToEscrowNotAllowedOnClaim();
```

### MovementToExternalOnlyOnDistribute
FromEncumberedToExternal is permitted only at the distribute site.


```solidity
error MovementToExternalOnlyOnDistribute();
```

### MovementFromEscrowNotOnDistribute
FromEscrow* payouts are not permitted at the distribute site.


```solidity
error MovementFromEscrowNotOnDistribute();
```

### MovementFromNotCommitter
A FromEncumbered* movement's `from` was not the commitment's committer.


```solidity
error MovementFromNotCommitter(address from, address committer);
```

### MovementWrongToken
A FromEncumbered* movement's `token` did not match the commitment's backing token.


```solidity
error MovementWrongToken(address token, address expected);
```

### MovementEscrowRecipientNotStrategy
A FromEncumberedToEscrow movement's `to` was not the calling strategy.


```solidity
error MovementEscrowRecipientNotStrategy(address to, address strategy);
```

### MovementRecipientNotParty
A movement's recipient was neither the committer nor the counterparty.


```solidity
error MovementRecipientNotParty(address to);
```

### MovementExceedsCommitment
A FromEncumbered* movement exceeded the commitment's live amount cap (INV-4).


```solidity
error MovementExceedsCommitment(uint256 units, uint256 amount);
```

### MovementBlockedByForfeit
A distribute-site movement was attempted while a forfeit proposal is active.


```solidity
error MovementBlockedByForfeit();
```

### MovementFromNotStrategy
A FromEscrow* movement's `from` was not the calling strategy (INV-5).


```solidity
error MovementFromNotStrategy(address from, address strategy);
```

### NotAcceptor

```solidity
error NotAcceptor();
```

### NotProposer

```solidity
error NotProposer();
```

### AlreadyAccepted

```solidity
error AlreadyAccepted();
```

### ProposalExpired

```solidity
error ProposalExpired();
```

### ProposalNotFound

```solidity
error ProposalNotFound();
```

### ProposalDurationTooLong

```solidity
error ProposalDurationTooLong();
```

### AgreementBothResolved

```solidity
error AgreementBothResolved();
```

### AgreementNotFound

```solidity
error AgreementNotFound();
```

### SettlementCapZero

```solidity
error SettlementCapZero();
```

### SettlementCapExceeded

```solidity
error SettlementCapExceeded(uint128 requested, uint128 cap);
```

### InsufficientCommitmentAmount

```solidity
error InsufficientCommitmentAmount(uint256 requested, uint256 available);
```

### MutualNotFound

```solidity
error MutualNotFound();
```

### MutualNotActive

```solidity
error MutualNotActive();
```

### MutualIsTerminal

```solidity
error MutualIsTerminal();
```

### NotMutualArbiter

```solidity
error NotMutualArbiter();
```

### MutualLossPending

```solidity
error MutualLossPending();
```

### NoMutualLossPending

```solidity
error NoMutualLossPending();
```

### MutualChallengeWindowActive

```solidity
error MutualChallengeWindowActive();
```

### MutualChallengeWindowTooShort

```solidity
error MutualChallengeWindowTooShort();
```

### DeallocationWindowTooShort

```solidity
error DeallocationWindowTooShort();
```

### NotMutualMember

```solidity
error NotMutualMember();
```

### MemberUnsettled

```solidity
error MemberUnsettled();
```

### DeallocationWindowActive

```solidity
error DeallocationWindowActive();
```

### ExitNotRequested

```solidity
error ExitNotRequested();
```

### ValuationAuthorityIsArbiter

```solidity
error ValuationAuthorityIsArbiter();
```

### InvalidCreditedValue

```solidity
error InvalidCreditedValue();
```

### NumeraireMismatch

```solidity
error NumeraireMismatch();
```

### MutualArbiterMismatch

```solidity
error MutualArbiterMismatch();
```

### MutualBeneficiaryMismatch

```solidity
error MutualBeneficiaryMismatch();
```

### MemberStrategyForbidden

```solidity
error MemberStrategyForbidden();
```

### TotalSharesOverflow

```solidity
error TotalSharesOverflow();
```

### ReinitTooSoon

```solidity
error ReinitTooSoon();
```

### InvalidValuationAttestation

```solidity
error InvalidValuationAttestation();
```

### CommitmentInMutual

```solidity
error CommitmentInMutual();
```

### NoActiveCover

```solidity
error NoActiveCover();
```

### PremiumStreamUnderfunded

```solidity
error PremiumStreamUnderfunded();
```

### InsufficientMutualPremium

```solidity
error InsufficientMutualPremium(uint256 requested, uint256 available);
```

### RewardRateOverflow

```solidity
error RewardRateOverflow();
```

### StreamDurationOutOfBounds

```solidity
error StreamDurationOutOfBounds();
```

### PremiumRateDecreased

```solidity
error PremiumRateDecreased();
```

### HeterogeneousPremiumUnsupported

```solidity
error HeterogeneousPremiumUnsupported();
```

### InsufficientMutualJunior

```solidity
error InsufficientMutualJunior(uint256 requested, uint256 available);
```

### NotValuationAuthority

```solidity
error NotValuationAuthority();
```

### NotHeterogeneous

```solidity
error NotHeterogeneous();
```

### MutualAlreadyConfigured

```solidity
error MutualAlreadyConfigured();
```

### MutualAlreadyActive

```solidity
error MutualAlreadyActive();
```

### InvalidHeteroConfig

```solidity
error InvalidHeteroConfig();
```

### OperatorRegistrySwapBlocked
setOperatorRegistry would orphan live delegations: the outgoing registry still
reports tracked commitments (or cannot report a count at all). Their later
release/forfeit hooks would be silently dropped, leaving phantom stake/voting
power on the outgoing registry. Use forceSetOperatorRegistry to override.


```solidity
error OperatorRegistrySwapBlocked(address outgoingRegistry);
```

## Structs
### Commitment
A unilateral commitment: a parameterized lien on the committer's encumbered backing.

`amount` is denominated in raw backing-token units (ERC §0.1).


```solidity
struct Commitment {
    address committer;
    address arbiter;
    address counterparty;
    address token; // backing token
    address adapter; // backing adapter (read-only pricing metadata)
    uint256 amount; // raw units currently encumbered under this commitment
    uint16 maxPenaltyBps; // 0..10_000
    uint64 challengeWindow; // seconds
    uint64 createdAt;
    uint64 expiresAt; // 0 = no expiry
    bool released;
    bool forfeited;
    string metadataURI;
    bytes32 metadataHash;
    // ---- Pause erratum (append-only) ----
    uint64 cumulativePausedAtStart; // creditable-pause snapshot at create; anchors the expiry clock-stop
}
```

### CommitmentParams
Parameters for creating a commitment.


```solidity
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
```

### ForfeitProposal
Pending forfeit proposal awaiting its challenge window.

Keyed by `commitmentId` in `forfeitProposals` storage, so the id is not
stored in the struct. The five remaining fields pack into a single slot.


```solidity
struct ForfeitProposal {
    uint16 penaltyBps;
    uint64 initiatedAt;
    bool executed;
    bool cancelled;
    // ---- Pause erratum (append-only) ----
    uint64 cumulativePausedAtStart; // creditable-pause snapshot at initiate; anchors the challenge-window clock-stop
}
```

### UserExposure
Per-(user, token) exposure tracking for the allocation invariant (INV-3).


```solidity
struct UserExposure {
    uint256 totalEncumbered; // Σ commitment.amount over active commitments
    uint256 totalForfeitable; // Σ amount × maxPenaltyBps / 10_000 over active commitments
}
```

### LegTerms
Per-leg economic terms. A "leg" is one committer's side of an
agreement: its own backing token + adapter, encumbered amount, penalty
ceiling, and strategy set. The two legs are fully independent — different
tokens (cross-token treaties: DAO A's gov token vs DAO B's), different
penalty ceilings, and different strategy sets are all expressible.


```solidity
struct LegTerms {
    address token; // backing token for this leg
    address adapter; // backing adapter that prices `token`
    uint256 amount; // raw units this committer encumbers
    uint16 maxPenaltyBps; // this leg's forfeit ceiling (0..10_000)
    StrategyBinding[] strategies; // strategies bound to THIS leg only (≤ MAX_STRATEGIES)
}
```

### AgreementParams
Parameters for proposing an agreement (extension). Each leg carries its
own `LegTerms`, so the two sides may differ in token, adapter, amount,
penalty ceiling, and strategies (including fully cross-token treaties).


```solidity
struct AgreementParams {
    address arbiter;
    address acceptor;
    LegTerms proposerLeg; // the proposer's side
    LegTerms acceptorLeg; // the acceptor's side (independent token/adapter/penalty/strategies)
    uint64 challengeWindow;
    uint64 proposalDuration;
    string metadataURI;
    bytes32 metadataHash;
    // Per-direction lifetime caps on `settleAgreement` flow, each denominated in the
    // PAYER leg's token: `maxFlowProposerToAcceptor` in `proposerLeg.token`,
    // `maxFlowAcceptorToProposer` in `acceptorLeg.token`. Both zero disables
    // settlement. CONSENT SEMANTIC: accepting a proposal carrying these caps is
    // consent to the arbiter shifting up to those amounts of the payer's collateral.
    uint128 maxFlowProposerToAcceptor;
    uint128 maxFlowAcceptorToProposer;
}
```

### AgreementProposal
Bilateral agreement proposal (extension). Per-leg terms mirror
`AgreementParams`; each leg's strategies live in a separate storage array
(proposer in `proposalStrategies`, acceptor in `proposalAcceptorStrategies`).


```solidity
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
```

### AgreementSettlement
Per-agreement bilateral-settlement state (caps + cumulative flow).


```solidity
struct AgreementSettlement {
    uint128 maxFlowProposerToAcceptor;
    uint128 maxFlowAcceptorToProposer;
    uint128 cumulativeProposerToAcceptor;
    uint128 cumulativeAcceptorToProposer;
}
```

### Mutual
A mutual header: a shared loss index `cumulativeLoss` (Lambda) over a set of
individually-custodied, exogenous member commitments. Tokens never centralize —
the index rebases *attribution*, not custody (INV-1 preserved). See the Mutuals standard
(ERC-COMMITMENTS-MUTUALS). Economically: Lloyd's several liability with a shared loss ratio.


```solidity
struct Mutual {
    address arbiter; // sole authority to INITIATE a mutual loss
    address numeraire; // unit of account for creditedValue & L (pricing only; never moved)
    address beneficiary; // who settled units pay to (typically a ClaimRouter) — REQUIRED
    address valuationAuthority; // attests creditedValue in attested mode; MUST != arbiter; 0 = homogeneous mode
    uint64 challengeWindow; // >= MUTUAL_MIN_CHALLENGE_WINDOW (longer than the per-commitment floor)
    uint64 deallocationWindow; // post-exit-request slashable window; >= challengeWindow
    uint64 lastInitiatedAt; // re-initiation rate-limit cursor (griefing guard)
    uint128 totalShares; // Σ creditedValue of non-exited members. join / release ONLY — never on loss.
    uint256 cumulativeLoss; // Lambda, 1e18-scaled fraction. Monotonic non-decreasing, <= 1e18.
    bool active; // assembler holds inactive until capacity filled
    bool terminal; // wound down: no new joins / losses
    // ---- Premium index (reward side, Mutuals premium; append-only) ----
    // A second native MasterChef index `Pi` over a SEPARATE live-deliverable-capacity
    // denominator `activeCover` (never `totalShares`). Distinct from the loss index in
    // denominator, identical in pull-accumulator shape. All fields default-zero, so a mutual
    // that never funds premium is byte-for-byte the pre-premium behaviour (pure-loss short-circuit).
    uint256 premiumPerShareStored; // Pi — premium-per-unit-cover, 1e27-scaled. Monotone non-decreasing.
    uint128 activeCover; // Σ effCover_i over active members = the premium denominator (live deliverable cover)
    uint256 settledTotal; // Σ settledUnits — cross-checks `activeCover == totalShares − settledTotal` (INV-P9)
    uint128 rewardRate; // streamed numeraire per second (Synthetix). 0 == never/no-longer funded (short-circuit)
    uint64 lastUpdate; // last `_pokePremium` time, clamped to periodFinish
    uint64 periodFinish; // end of the current stream; accrual stops here
    uint256 premiumRemainder; // sub-1e27 dust carried forward between pokes (no value ever lost)
    uint256 bankedTotal; // Σ rewardBank_i — `outstandingBank` for the funding-time solvency guard (INV-P2)
    // ---- Heterogeneous mode (append-only; all zero in homogeneous & attested-unconfigured) ----
    // A mutual is HETEROGENEOUS iff `bandAdapter != 0`. These are set ONCE by `configureHeterogeneous`
    // (valuationAuthority-only, while !active && !terminal) and immutable after. They drive ONLY the
    // premium (reward) side — `premiumWeight` band-clamping + haircut + the junior split — and NEVER
    // the loss denominator, so homogeneous mutuals (all fields zero) are byte-for-byte unchanged.
    address bandAdapter; // 0 = homogeneous / attested-unconfigured (homogeneous behaviour); nonzero = heterogeneous
    uint64 valuationFloorBps; // band lower bound on `premiumWeight` as floorBps*adapterValue/1e4 (INV-P11)
    uint64 valuationCeilBps; // band upper bound; <= 1e4 (no inflation above the adapter value, INV-P11)
    uint64 juniorBps; // premium-funding split routed to the junior shortfall absorber (0 = no split)
}
```

### HeteroConfig
Heterogeneous-mode configuration, applied ONCE via `configureHeterogeneous` before the
mutual is activated and immutable thereafter. Only meaningful for mutuals
with a non-zero `valuationAuthority`; homogeneous mutuals can never be configured.


```solidity
struct HeteroConfig {
    address bandAdapter; // manipulation-resistant valuation adapter (TWAP / 4626 rate); REQUIRED, != 0
    uint64 valuationFloorBps; // band lower bound (<= ceil)
    uint64 valuationCeilBps; // band upper bound (<= 1e4)
    uint64 juniorBps; // premium split to the junior absorber (<= 1e4)
    address[] collaterals; // per-collateral haircut keys (parallel to `haircutBps`)
    uint64[] haircutBps; // per-collateral haircut bps (each <= 1e4); parallel to `collaterals`
}
```

### Membership
Per-commitment membership in a Mutual (sparse; mutualId 0 == not a member).


```solidity
struct Membership {
    uint256 mutualId; // 0 == not a member (single, non-rebindable)
    uint256 forfeitableUnits; // E_i = amount*maxPenaltyBps/10_000, FROZEN at join (the loss base, raw units)
    uint256 settledUnits; // cumulative owedUnits already forfeited (remaining = E_i - settledUnits)
    uint128 creditedValue; // valuation(token, E_i) in numeraire, FROZEN at join (totalShares accounting)
    uint256 lossSnapshot; // Lambda at join / last settle — liable only for cumulativeLoss - snapshot
    uint64 unbondRequestedAt; // 0 == active; nonzero starts the deallocation window (still slashable until elapsed)
    // ---- Premium index (reward side; append-only) ----
    // Numeraire PREMIUM weight; == creditedValue in homogeneous v1, re-priceable in heterogeneous mode.
    uint128 premiumWeight;
    // Kept distinct from creditedValue so a reward re-mark can never touch the loss denominator (INV-P6).
    uint256 premiumSnapshot; // Pi at join / last sync — earns only Pi-growth after (reward non-retroactivity, INV-P5)
    uint256 rewardBank; // accrued-but-unclaimed premium in numeraire (paid to the committer on claim/release)
    // (The deallocation-window pause snapshot lives in the sibling
    //  `memberExitCumulativePausedAtStart` mapping, written at requestMutualExit — a struct
    //  field would cost every join a slot touch for a value only exits read.)
}
```

### MutualLossProposal
Pending two-phase mutual-loss declaration (at most one active per mutual).

`proposer`/`evidenceHash` make the dispute model storage-ready; bond custody itself
lives in the pluggable mutual arbiter (periphery), keeping the custody root ETH-free.


```solidity
struct MutualLossProposal {
    uint256 lossNumeraire; // declared loss L in the mutual's numeraire
    uint64 initiatedAt; // 0 == none
    bytes32 evidenceHash;
    address proposer; // the mutual arbiter that initiated
    bool executed;
    bool cancelled;
    // ---- Pause erratum (append-only) ----
    uint64 cumulativePausedAtStart; // creditable-pause snapshot at initiate; anchors challenge-window + re-init clock-stops
}
```

### MutualParams
Parameters for creating a Mutual.


```solidity
struct MutualParams {
    address arbiter;
    address numeraire;
    address beneficiary;
    address valuationAuthority; // 0 = homogeneous-numeraire mode (oracle-free; numeraire == member token)
    uint64 challengeWindow;
    uint64 deallocationWindow;
}
```
