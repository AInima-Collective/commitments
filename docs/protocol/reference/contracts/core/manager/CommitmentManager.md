---
title: CommitmentManager
status: generated
source: src/core/manager/CommitmentManager.sol
generated: true
---
# CommitmentManager
**Inherits:**
UUPSUpgradeable, AccessControlUpgradeable, ReentrancyGuardTransient, EIP712Upgradeable, ICM

**Title:**
CommitmentManager

Direct-custody commitment manager (ERC-COMMITMENTS Parts A–D). The manager is the
custody root: it holds backing tokens, maintains the per-(token, user)
free/encumbered ledger and per-strategy escrow, owns the commitment state machine,
and is the sole executor of token movements.

Deployed behind a UUPS proxy. State lives in EIP-7201 namespaced storage
(`CommitmentManagerStorage`).
Layout: the manager is a dispatch shell — auth, validation, effects, guarded hook
orchestration, events, and registry hooks live in external delegatecall libraries
(CommitmentLifecycleLib, MovementLib, AgreementLib over the shared LedgerLib), which
preserve `msg.sender`, `address(this)`, and event sourcing.


## State Variables
### PAUSER_ROLE

```solidity
bytes32 public constant PAUSER_ROLE = keccak256("PAUSER_ROLE")
```


### UNPAUSER_ROLE

```solidity
bytes32 public constant UNPAUSER_ROLE = keccak256("UNPAUSER_ROLE")
```


### DEFAULT_MIN_CHALLENGE_WINDOW
ERC §0.3 — MUST-level floor on challenge windows. Lazy default when storage is 0;
`setMinChallengeWindow` may raise this floor but can never lower it.


```solidity
uint64 internal constant DEFAULT_MIN_CHALLENGE_WINDOW = 86_400
```


### MAX_STRATEGIES
ERC §0.3 — MUST-level cap on bound strategies per commitment.


```solidity
uint256 public constant MAX_STRATEGIES = 8
```


### MAX_PROPOSAL_DURATION

```solidity
uint64 public constant MAX_PROPOSAL_DURATION = 30 days
```


### FORFEIT_PROPOSAL_TTL
Stale forfeit proposals can be force-cancelled by anyone after
`initiatedAt + challengeWindow + FORFEIT_PROPOSAL_TTL` (ERC §C.4).


```solidity
uint64 public constant FORFEIT_PROPOSAL_TTL = 14 days
```


### MAX_METADATA_URI_LENGTH

```solidity
uint256 public constant MAX_METADATA_URI_LENGTH = 512
```


### HOOK_GAS_CAP_FLOOR
ERC §0.3 — SHOULD-level floor on the per-hook gas cap (§D.6). Admin may raise,
never lower below this.


```solidity
uint64 public constant HOOK_GAS_CAP_FLOOR = 500_000
```


### HOOK_GAS_RESERVE
Gas the manager reserves for its own post-hook bookkeeping when sizing the
min-gas guard (§D.6 rule 3).


```solidity
uint64 internal constant HOOK_GAS_RESERVE = 50_000
```


### CREATE_COMMITMENT_TYPEHASH
Canonical relayer typehash (ERC §C.8). `strategiesHash` is
keccak256(abi.encode(params.strategies)).


```solidity
bytes32 public constant CREATE_COMMITMENT_TYPEHASH = keccak256(
    "CreateCommitment(address committer,address arbiter,address counterparty,address token,"
    "address adapter,uint256 amount,uint16 maxPenaltyBps,uint64 challengeWindow,uint64 expiresAt,"
    "bytes32 strategiesHash,string metadataURI,bytes32 metadataHash,uint256 nonce,uint256 deadline)"
)
```


## Functions
### constructor


```solidity
constructor() ;
```

### initialize

Initialize the manager.


```solidity
function initialize(address admin_, uint64 unbondingPeriod_, uint64 maxPauseDuration_) external initializer;
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`admin_`|`address`|Address granted DEFAULT_ADMIN_ROLE (can upgrade and configure).|
|`unbondingPeriod_`|`uint64`|Committer-unbond period in seconds; MUST be > 0 (ERC §C.5).|
|`maxPauseDuration_`|`uint64`|Lifetime pause budget in seconds (ERC §A.6 erratum): the maximum cumulative paused time creditable against the protocol's constraining windows. Immutable after initialize (no setter). 0 = pauses never stop any clock (pure wall-clock, the pre-erratum behaviour).|


### deposit

Deposit backing tokens into the caller's free balance.

Credits the MEASURED balance delta, not `amount` (fee-on-transfer defense, ERC §A.2).
Rebasing tokens are structurally unsupported (they break INV-1); deployments SHOULD
screen them out off-chain — the ledger gives them no special handling.
Body lives in LedgerOpsLib (DELEGATECALL) to keep the manager under EIP-170.


```solidity
function deposit(address token, uint256 amount) external nonReentrant;
```

### depositFor

Deposit backing tokens pulled from the caller into `onBehalfOf`'s free balance.

Same measured-delta rule as `deposit`. Enables relayer onboarding: a third party funds a
committer's free balance so `createCommitmentFor` needs no prior deposit by the committer.
Body lives in LedgerOpsLib (DELEGATECALL) to keep the manager under EIP-170.


```solidity
function depositFor(address token, uint256 amount, address onBehalfOf) external nonReentrant;
```

### depositWithPermit

Deposit via an ERC-2612 permit — collapses approve + deposit into one tx.

Measured-delta rule as in `deposit`. The permit is tolerated as already-consumed
(front-run defense); see LedgerOpsLib. Body in LedgerOpsLib (DELEGATECALL).


```solidity
function depositWithPermit(address token, uint256 amount, uint256 deadline, uint8 v, bytes32 r, bytes32 s_)
    external
    nonReentrant;
```

### withdraw

Withdraw from the caller's free balance. Instant — free balance backs nothing
and is never subject to an unbonding delay (ERC §A.2).


```solidity
function withdraw(address token, uint256 amount) external nonReentrant;
```

### fundStrategy

Permissionlessly fund a strategy's escrow (ERC §A.4). Measured-delta rule as in
`deposit`. Refund policy is strategy-defined; the manager imposes none.

WARNING: the escrow pot carries no funder attribution and has no withdrawal surface
outside the §D.5 movement pipeline — see the interface NatSpec before funding.


```solidity
function fundStrategy(address strategy, address token, uint256 amount) external nonReentrant;
```

### createCommitment

Create a commitment, encumbering `params.amount` of `params.token` from the
caller's free balance (deposit first, then create).


```solidity
function createCommitment(ICM.CommitmentParams calldata params)
    external
    nonReentrant
    returns (uint256 commitmentId);
```
**Returns**

|Name|Type|Description|
|----|----|-----------|
|`commitmentId`|`uint256`|The new commitment's id (always ≥ 1, INV-10).|


### createAndFund

Deposit `depositAmount` of `params.token` and create a commitment in one tx,
encumbering `params.amount` from the now-funded free balance (deposit + create).

Params are validated BEFORE the token pull (revert-before-pull). Surplus stays
withdrawable; a smaller `depositAmount` succeeds only if prior free balance covers the
shortfall (else `InsufficientFreeBalance`); `depositAmount == 0` degenerates to a plain
create. Body lives in CommitmentLifecycleLib (DELEGATECALL) to keep the manager under
EIP-170; the caller holds the reentrancy guard.


```solidity
function createAndFund(uint256 depositAmount, ICM.CommitmentParams calldata params)
    external
    nonReentrant
    returns (uint256 commitmentId);
```
**Returns**

|Name|Type|Description|
|----|----|-----------|
|`commitmentId`|`uint256`|The new commitment's id (always ≥ 1, INV-10).|


### _createCommitmentInternal

All creation logic — validation, exposure, encumber, store, strategy binding and
creation hooks — lives in CommitmentLifecycleLib.createFull (DELEGATECALL). Callers
(createCommitment, batch, relayer) hold the reentrancy guard.


```solidity
function _createCommitmentInternal(address committer, ICM.CommitmentParams calldata params)
    internal
    returns (uint256 commitmentId);
```

### releaseCommitment

Arbiter-immediate release. Release hooks run guarded BEFORE the committer's
remaining encumbrance frees. Agreed commitments MUST use `releaseAgreement`.


```solidity
function releaseCommitment(uint256 commitmentId) external nonReentrant;
```

### expireCommitment

Committer self-release after `expiresAt` (ERC §C.1).


```solidity
function expireCommitment(uint256 commitmentId) external nonReentrant;
```

### initiateForfeit

Arbiter-only. Starts the challenge-window timer (ERC §C.3 phase 1).
Agreed commitments MUST be forfeited via `forfeitAgreement`.


```solidity
function initiateForfeit(uint256 commitmentId, uint16 penaltyBps) external nonReentrant;
```

### executeForfeit

Anyone, after the challenge window (ERC §C.3 phase 2). The forfeit payout is a
ledger credit to the counterparty's FREE balance (pull-payment); forfeit hooks run
guarded, strictly after the transfer, and cannot affect it.


```solidity
function executeForfeit(uint256 commitmentId) external nonReentrant;
```

### cancelForfeit

Arbiter-only cancel of a pending proposal.


```solidity
function cancelForfeit(uint256 commitmentId) external nonReentrant;
```

### cancelStaleForfeitProposal

Anyone, after `initiatedAt + challengeWindow + FORFEIT_PROPOSAL_TTL` (ERC §C.4).


```solidity
function cancelStaleForfeitProposal(uint256 commitmentId) external nonReentrant;
```

### requestUnbond

Committer-only. Starts the unbond timer; changes no ledger state. The arbiter
retains forfeit authority during the window. Agreed partners unbond together.


```solidity
function requestUnbond(uint256 commitmentId) external nonReentrant;
```

### finalizeUnbond

Anyone, after `unbondInitiatedAt + unbondingPeriod()`. Reverts while a forfeit
proposal is active; closes with the same accounting as release.


```solidity
function finalizeUnbond(uint256 commitmentId) external nonReentrant;
```

### cancelUnbond

Committer-only. Returns the commitment (and any agreed partner) to the prior
active state.


```solidity
function cancelUnbond(uint256 commitmentId) external nonReentrant;
```

### distribute

Permissionlessly advance one bound strategy's accrual. Reverts bubble — the
caller chose the strategy; failure is actionable feedback, not a liveness
concern (ERC §D.3).

Body in MovementLib (DELEGATECALL) to keep the manager under EIP-170.


```solidity
function distribute(uint256 commitmentId, address strategy) external nonReentrant;
```

### distributeAll

Convenience fold of `distribute` over `strategiesOf(id)` in array order.

Body in MovementLib (DELEGATECALL) to keep the manager under EIP-170.


```solidity
function distributeAll(uint256 commitmentId) external nonReentrant;
```

### claim

Strategy-mediated claim. Available in every commitment state — including after
close — so parked accrual is always recoverable (ERC §D.3). Caller authorization
is the strategy's job (the context carries `caller`).


```solidity
function claim(uint256 commitmentId, address strategy, bytes calldata claimData) external nonReentrant;
```

### distributeAndClaim

Advance one strategy's accrual, then claim, atomically under one reentrancy guard.

Fixes the distribute-then-claim ordering footgun: `pending()` reflects LIVE accrual but
`claim()` only pays BANKED accrual, so a caller who claims without distributing first can
see `pending() > 0` yet receive 0. Bundling the two makes the claim pay the just-distributed
amount (mirrors `settleAndClaim`). Requires the commitment active and un-forfeited — the
`distribute` leg does. After close, no new accrual is possible; use `claim` directly to
recover parked accrual. Body in MovementLib (DELEGATECALL) to keep the manager under EIP-170.


```solidity
function distributeAndClaim(uint256 commitmentId, address strategy, bytes calldata claimData)
    external
    nonReentrant;
```

### pending

Pending amount claimable via `claim` for the caller-implied recipient.


```solidity
function pending(uint256 commitmentId, address strategy, bytes calldata claimData) external view returns (uint256);
```

### sweepFailedHook

Permissionless re-drive of a failed lifecycle hook under the same guarded
semantics (ERC §D.6), once the underlying cause has cleared. The commitment's
encumbrance is already settled by then, so a re-driven hook can only dispose of
escrowed value (`c.amount` is zeroed at close — no FromEncumbered* headroom).


```solidity
function sweepFailedHook(uint256 commitmentId, address strategy) external nonReentrant;
```

### __runStrategyHook

Self-call-only frame putting the strategy call, the validation of its returned
movements, and their application in ONE revertable unit — a strategy that
returns invalid movements degrades identically to one that reverts (§D.6 rule 1).

NOT nonReentrant by design: the outer entry point holds the transient lock, which
is exactly what blocks a strategy from re-entering mutating manager surfaces.


```solidity
function __runStrategyHook(uint256 commitmentId, address strategy, uint8 hook) external;
```

### proposeAgreement

Propose a bilateral agreement. The proposer's backing is encumbered
immediately (lock early to prevent griefing).


```solidity
function proposeAgreement(ICM.AgreementParams calldata params) external nonReentrant returns (uint256 proposalId);
```

### acceptAgreement

Accept an agreement proposal, creating two linked commitments sharing the
same (token, adapter) with symmetric strategy bindings.


```solidity
function acceptAgreement(uint256 proposalId)
    external
    nonReentrant
    returns (uint256 agreementId, uint256 commitmentIdA, uint256 commitmentIdB);
```
**Returns**

|Name|Type|Description|
|----|----|-----------|
|`agreementId`|`uint256`|The new agreement id.|
|`commitmentIdA`|`uint256`|The proposer's leg.|
|`commitmentIdB`|`uint256`|The acceptor's leg.|


### cancelAgreementProposal

Cancel a proposal: proposer-only while live, anyone once expired. Frees the
proposer's encumbered backing.


```solidity
function cancelAgreementProposal(uint256 proposalId) external nonReentrant;
```

### forfeitAgreement

Initiate forfeit on both legs atomically (shared-arbiter-only), each at `penaltyBps`.


```solidity
function forfeitAgreement(uint256 agreementId, uint16 penaltyBps) external nonReentrant;
```

### releaseAgreement

Release both legs atomically (shared-arbiter-only). Each unresolved leg runs
its guarded release hooks before its encumbrance frees.


```solidity
function releaseAgreement(uint256 agreementId) external nonReentrant;
```

### requestAgreementUnbond

Symmetric unbond start for both legs; either committer may call.


```solidity
function requestAgreementUnbond(uint256 agreementId) external nonReentrant;
```

### settleAgreement

Arbiter-instructed bilateral value flow, bounded by per-direction lifetime caps.
Bound strategies' accrual baselines are settled first via the guarded pre-settle
distribute (park-and-continue on strategy failure — a strategy cannot veto
arbiter settlement).


```solidity
function settleAgreement(uint256 agreementId, bool fromProposer, uint256 units, bytes32 evidenceHash)
    external
    nonReentrant;
```

### contributeEncumbered

Contribute free balance into a commitment's encumbered position (ERC §C.6).
The committer opts in by being the first contributor.


```solidity
function contributeEncumbered(uint256 commitmentId, uint256 units) external nonReentrant;
```

### getAgreementSettlement

Live bilateral-settlement state (caps + cumulative flow).


```solidity
function getAgreementSettlement(uint256 agreementId)
    external
    view
    returns (uint128 maxPToA, uint128 maxAToP, uint128 cumulPToA, uint128 cumulAToP);
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

The agreement a proposal produced (0 = never accepted).


```solidity
function agreementOfProposal(uint256 proposalId) external view returns (uint256);
```

### createMutual

Create a Mutual (starts inactive). See MutualLib.


```solidity
function createMutual(ICM.MutualParams calldata params) external nonReentrant returns (uint256 mutualId);
```

### activateMutual

Arbiter activates a mutual; members can only join an active one.


```solidity
function activateMutual(uint256 mutualId) external nonReentrant;
```

### joinMutual

Create a fresh commitment and join it to `mutualId`, freezing its weight (`E_i`).


```solidity
function joinMutual(uint256 mutualId, ICM.CommitmentParams calldata params)
    external
    nonReentrant
    returns (uint256 commitmentId);
```

### initiateMutualLoss

Phase 1 (mutual arbiter): declare a mutual loss.


```solidity
function initiateMutualLoss(uint256 mutualId, uint256 lossNumeraire, bytes32 evidenceHash) external nonReentrant;
```

### executeMutualLoss

Phase 2 (anyone, after the window): bump the shared loss index once.


```solidity
function executeMutualLoss(uint256 mutualId) external nonReentrant;
```

### cancelMutualLoss

Mutual arbiter cancel of a pending loss declaration.


```solidity
function cancelMutualLoss(uint256 mutualId) external nonReentrant;
```

### cancelStaleMutualLoss

Permissionless force-cancel of a stale mutual-loss declaration.


```solidity
function cancelStaleMutualLoss(uint256 mutualId) external nonReentrant;
```

### settleMemberLoss

Permissionless lazy settle of one member's share of the shared loss.


```solidity
function settleMemberLoss(uint256 commitmentId) external nonReentrant;
```

### settleMembers

Bounded batch settle convenience.


```solidity
function settleMembers(uint256[] calldata commitmentIds) external nonReentrant;
```

### requestMutualExit

Member-only: start the deallocation window (still mutual-slashable until it elapses).


```solidity
function requestMutualExit(uint256 commitmentId) external nonReentrant;
```

### releaseMutualMember

Release a fully-settled member past its deallocation window.


```solidity
function releaseMutualMember(uint256 commitmentId) external nonReentrant;
```

### fundMutualPremium

Policyholder-funded premium: measured-receipt pull + (re)start a Synthetix stream.
Permissionless, guarded: `duration` bounded, live-stream rate may only rise (anti-dilution).


```solidity
function fundMutualPremium(uint256 mutualId, uint256 amount, uint64 duration) external nonReentrant;
```

### claimMemberPremium

Permissionless bank-and-pay of a member's accrued premium to its committer.


```solidity
function claimMemberPremium(uint256 commitmentId) external nonReentrant;
```

### claimMembersPremium

Bounded batch claim convenience.


```solidity
function claimMembersPremium(uint256[] calldata commitmentIds) external nonReentrant;
```

### reclaimPremium

Policyholder-of-record reclaim of the unstreamed premium remainder.


```solidity
function reclaimPremium(uint256 mutualId) external nonReentrant;
```

### settleAndClaim

Settle a member's loss then claim its premium under one reentrancy guard (pure dispatch).


```solidity
function settleAndClaim(uint256 commitmentId) external nonReentrant;
```

### getMutual


```solidity
function getMutual(uint256 mutualId) external view returns (ICM.Mutual memory);
```

### getMembership


```solidity
function getMembership(uint256 commitmentId) external view returns (ICM.Membership memory);
```

### getMutualLossProposal


```solidity
function getMutualLossProposal(uint256 mutualId) external view returns (ICM.MutualLossProposal memory);
```

### pendingMemberLoss

Raw units `commitmentId` currently owes the beneficiary if settled now.


```solidity
function pendingMemberLoss(uint256 commitmentId) external view returns (uint256 owedUnits);
```

### getMutualPremiumState

Premium-side state of a mutual (Pi / denominator / stream / reserve) for read surfaces.


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

### pendingMemberPremium

Premium currently claimable by `commitmentId` if claimed now (banked + simulated accrual).


```solidity
function pendingMemberPremium(uint256 commitmentId) external view returns (uint256 claimable);
```

### createCommitmentFor

Create a commitment on behalf of `committer` using an EIP-712 signature over the
canonical typehash. The signature is validated via OZ `SignatureChecker`, so
`committer` may be an EOA (ECDSA) or an ERC-1271 smart-contract wallet.


```solidity
function createCommitmentFor(
    address committer,
    ICM.CommitmentParams calldata params,
    uint256 deadline,
    uint256 nonce,
    bytes calldata sig
) external nonReentrant returns (uint256 commitmentId);
```

### batchCreateCommitments

Create multiple commitments atomically for the caller.


```solidity
function batchCreateCommitments(ICM.CommitmentParams[] calldata params)
    external
    nonReentrant
    returns (uint256[] memory commitmentIds);
```

### batchReleaseCommitments

Release multiple commitments atomically; caller must be arbiter for all.


```solidity
function batchReleaseCommitments(uint256[] calldata commitmentIds) external nonReentrant;
```

### nonces

Current relayer nonce for `committer`.


```solidity
function nonces(address committer) external view returns (uint256);
```

### invalidateCreateAuthorization

Revoke any outstanding `createCommitmentFor` authorization the caller has signed.

Bumps the caller's own relayer nonce, so a signature bound to the previous nonce no
longer matches and reverts `InvalidNonce`. Callable only for one's own nonce — this is
the signature escape hatch (ERC §C.8). No external calls, so no reentrancy surface.


```solidity
function invalidateCreateAuthorization() external returns (uint256 newNonce);
```
**Returns**

|Name|Type|Description|
|----|----|-----------|
|`newNonce`|`uint256`|The caller's relayer nonce after the bump.|


### pauseForfeiture

Pause forfeit execution. Separate pause/unpause roles so a single compromised key
cannot both pause and refuse to unpause. Idempotent: re-pausing while paused is a
no-op (it must never reset the in-flight episode's start and shrink its credit).

Starts a pause episode for the budget accounting (ERC §A.6 erratum): constraining
windows stop while paused, but only up to the lifetime `maxPauseDuration` budget —
see PauseLib. The stale-TTLs keep running on wall clock regardless (anti-pin).


```solidity
function pauseForfeiture() external onlyRole(PAUSER_ROLE);
```

### unpauseForfeiture

Unpause forfeit execution. Idempotent: unpausing while unpaused is a no-op.

Closes the pause episode, accruing its RAW duration into `cumulativePaused` (the
budget clamp is applied at read time in PauseLib). A pre-erratum pause carried across
an upgrade has `pausedAt == 0` and accrues nothing.


```solidity
function unpauseForfeiture() external onlyRole(UNPAUSER_ROLE);
```

### forfeiturePaused

Whether forfeit execution is paused.


```solidity
function forfeiturePaused() external view returns (bool);
```

### pauseState


```solidity
function pauseState()
    external
    view
    returns (bool paused, uint64 pausedAt, uint64 cumulativePaused, uint64 maxPauseDuration, uint64 creditable);
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

### ledgerTotals

Per-token aggregate counters for the base O(1) partition check (ERC §A.5). The full
partition closes over four compartments — `free + encumbered + escrow +
mutualPremium == IERC20(token).balanceOf(manager)` (INV-P1); this getter exposes
the base three. The mutual compartment is read via `totalMutualPremium`.


```solidity
function ledgerTotals(address token)
    external
    view
    returns (uint256 totalFree, uint256 totalEncumbered, uint256 totalEscrow);
```

### getCommitment

Full Commitment struct. After a forfeit, `amount` reflects the post-forfeit residual
retained through the close (historical pre-forfeit amount is in the event stream).


```solidity
function getCommitment(uint256 commitmentId) external view returns (ICM.Commitment memory);
```

### getForfeitProposal

Current forfeit proposal for a commitment (zeroed if none).


```solidity
function getForfeitProposal(uint256 commitmentId) external view returns (ICM.ForfeitProposal memory);
```

### getUserExposure

Exposure tracking for `(token, user)` (INV-3). Arg order is token-first to match
the rest of the view surface.


```solidity
function getUserExposure(address token, address user) external view returns (ICM.UserExposure memory);
```

### strategiesOf

Bound strategies of a commitment, in binding order.


```solidity
function strategiesOf(uint256 commitmentId) external view returns (address[] memory);
```

### unbondInitiatedAt

Unbond initiation timestamp (0 = none pending).


```solidity
function unbondInitiatedAt(uint256 commitmentId) external view returns (uint64);
```

### closedAt

Close timestamp of a commitment (0 = still active). `getCommitment().amount` is
zeroed at close, so this is the only surviving on-chain signal of when it settled.


```solidity
function closedAt(uint256 commitmentId) external view returns (uint64);
```

### forfeitedUnitsOf

Units forfeited at `executeForfeit` (0 = never forfeited).


```solidity
function forfeitedUnitsOf(uint256 commitmentId) external view returns (uint256);
```

### acceptsContributions

Whether the commitment accepts third-party `contributeEncumbered` calls (ERC §C.6).


```solidity
function acceptsContributions(uint256 commitmentId) external view returns (bool);
```

### failedHook

Selector of a failed guarded hook awaiting `sweepFailedHook` (0 = none).


```solidity
function failedHook(uint256 commitmentId, address strategy) external view returns (bytes4);
```

### getUserCommitmentIds

All commitment ids ever created for `user` (append-only).


```solidity
function getUserCommitmentIds(address user) external view returns (uint256[] memory);
```

### unbondingPeriod

Committer-unbond period in seconds (ERC §C.5). Always > 0.


```solidity
function unbondingPeriod() public view returns (uint64);
```

### MIN_CHALLENGE_WINDOW

Active minimum challenge window (seconds). Lazy default: 1 day.


```solidity
function MIN_CHALLENGE_WINDOW() public view returns (uint64);
```

### hookGasCap

Per-hook gas cap for guarded lifecycle hooks (ERC §D.6). Lazy default: 500k.


```solidity
function hookGasCap() public view returns (uint64);
```

### setUnbondingPeriod

Update the unbonding period. MUST stay > 0.


```solidity
function setUnbondingPeriod(uint64 newValue) external onlyRole(DEFAULT_ADMIN_ROLE);
```

### setMinChallengeWindow

Update the minimum challenge window. Passing 0 restores the 1-day default;
non-zero values must be at least one day.


```solidity
function setMinChallengeWindow(uint64 newValue) external onlyRole(DEFAULT_ADMIN_ROLE);
```

### setHookGasCap

Raise (never lower) the per-hook gas cap. Passing 0 restores the 500k default;
non-zero values below the floor are rejected (ERC §0.3).


```solidity
function setHookGasCap(uint64 newValue) external onlyRole(DEFAULT_ADMIN_ROLE);
```

### setOperatorRegistry

Set or clear the operator registry for delegation hooks (mesh extension).

The manager notifies exactly ONE registry on release/forfeit; re-pointing (or
clearing) the slot while the outgoing registry still tracks live registration/
delegation commitments would silently orphan them — their later release/forfeit
hooks would be dropped, leaving phantom stake/voting power on the outgoing
registry. Reverts with `OperatorRegistrySwapBlocked` when the outgoing
registry reports a non-zero `trackedCommitmentCount()` or cannot report one
(fail-closed for non-conforming registries). Use `forceSetOperatorRegistry`
to override deliberately.


```solidity
function setOperatorRegistry(address operatorRegistry_) external onlyRole(DEFAULT_ADMIN_ROLE);
```

### forceSetOperatorRegistry

Force-set or clear the operator registry, bypassing the tracked-commitments
guard. Any commitments still tracked by the outgoing registry are orphaned:
their release/forfeit hooks will be silently dropped. Escape hatch for
registry migrations and for outgoing registries that cannot report a count.


```solidity
function forceSetOperatorRegistry(address operatorRegistry_) external onlyRole(DEFAULT_ADMIN_ROLE);
```

### operatorRegistry

Operator registry wired for delegation hooks (0 = disabled).


```solidity
function operatorRegistry() external view returns (address);
```

### _authorizeUpgrade


```solidity
function _authorizeUpgrade(address) internal override onlyRole(DEFAULT_ADMIN_ROLE);
```
