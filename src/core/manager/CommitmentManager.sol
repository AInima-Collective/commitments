// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import {UUPSUpgradeable} from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import {AccessControlUpgradeable} from "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";
import {ReentrancyGuardTransient} from "@openzeppelin/contracts/utils/ReentrancyGuardTransient.sol";
import {EIP712Upgradeable} from "@openzeppelin/contracts-upgradeable/utils/cryptography/EIP712Upgradeable.sol";

import {ICommitmentManager as ICM} from "src/core/interfaces/ICommitmentManager.sol";
import {IDistributionStrategy} from "src/core/interfaces/IDistributionStrategy.sol";
import {CommitmentManagerStorage} from "src/core/manager/storage/CommitmentManagerStorage.sol";
import {CommitmentLifecycleLib, IOperatorRegistryHooks} from "src/core/manager/libraries/CommitmentLifecycleLib.sol";
import {AgreementLib} from "src/extensions/agreements/AgreementLib.sol";
import {MutualLib} from "src/extensions/mutuals/MutualLib.sol";
import {LedgerOpsLib} from "src/core/manager/libraries/LedgerOpsLib.sol";
import {PauseLib} from "src/core/manager/libraries/PauseLib.sol";
import {MovementLib, HOOK_RELEASED, HOOK_FORFEITED} from "src/core/manager/libraries/MovementLib.sol";

/// @title CommitmentManager
/// @notice Direct-custody commitment manager (ERC-COMMITMENTS Parts A–D). The manager is the
///         custody root: it holds backing tokens, maintains the per-(token, user)
///         free/encumbered ledger and per-strategy escrow, owns the commitment state machine,
///         and is the sole executor of token movements.
/// @dev Deployed behind a UUPS proxy. State lives in EIP-7201 namespaced storage
///      (`CommitmentManagerStorage`).
///
///      Layout: the manager is a dispatch shell — auth, validation, effects, guarded hook
///      orchestration, events, and registry hooks live in external delegatecall libraries
///      (CommitmentLifecycleLib, MovementLib, AgreementLib over the shared LedgerLib), which
///      preserve `msg.sender`, `address(this)`, and event sourcing.
contract CommitmentManager is
    UUPSUpgradeable,
    AccessControlUpgradeable,
    ReentrancyGuardTransient,
    EIP712Upgradeable,
    ICM
{
    using CommitmentManagerStorage for CommitmentManagerStorage.Layout;

    // =========================================================================
    // Roles and constants
    // =========================================================================

    bytes32 public constant PAUSER_ROLE = keccak256("PAUSER_ROLE");
    bytes32 public constant UNPAUSER_ROLE = keccak256("UNPAUSER_ROLE");

    /// @dev ERC §0.3 — MUST-level floor on challenge windows. Lazy default when storage is 0;
    ///      testnet deployments may admin-lower via `setMinChallengeWindow`.
    uint64 internal constant DEFAULT_MIN_CHALLENGE_WINDOW = 86_400; // 1 day
    /// @dev ERC §0.3 — MUST-level cap on bound strategies per commitment.
    uint256 public constant MAX_STRATEGIES = 8;
    uint64 public constant MAX_PROPOSAL_DURATION = 30 days;
    /// @notice Stale forfeit proposals can be force-cancelled by anyone after
    ///         `initiatedAt + challengeWindow + FORFEIT_PROPOSAL_TTL` (ERC §C.4).
    uint64 public constant FORFEIT_PROPOSAL_TTL = 14 days;
    uint256 public constant MAX_METADATA_URI_LENGTH = 512;
    /// @dev ERC §0.3 — SHOULD-level floor on the per-hook gas cap (§D.6). Admin may raise,
    ///      never lower below this.
    uint64 public constant HOOK_GAS_CAP_FLOOR = 500_000;
    /// @dev Gas the manager reserves for its own post-hook bookkeeping when sizing the
    ///      min-gas guard (§D.6 rule 3).
    uint64 internal constant HOOK_GAS_RESERVE = 50_000;

    /// @notice Canonical relayer typehash (ERC §C.8). `strategiesHash` is
    ///         keccak256(abi.encode(params.strategies)).
    bytes32 public constant CREATE_COMMITMENT_TYPEHASH = keccak256(
        "CreateCommitment(address committer,address arbiter,address counterparty,address token,"
        "address adapter,uint256 amount,uint16 maxPenaltyBps,uint64 challengeWindow,uint64 expiresAt,"
        "bytes32 strategiesHash,string metadataURI,bytes32 metadataHash,uint256 nonce,uint256 deadline)"
    );

    // =========================================================================
    // Initializer
    // =========================================================================

    constructor() {
        _disableInitializers();
    }

    /// @notice Initialize the manager.
    /// @param admin_ Address granted DEFAULT_ADMIN_ROLE (can upgrade and configure).
    /// @param unbondingPeriod_ Committer-unbond period in seconds; MUST be > 0 (ERC §C.5).
    /// @param maxPauseDuration_ Lifetime pause budget in seconds (ERC §A.6 erratum): the maximum
    ///        cumulative paused time creditable against the protocol's constraining windows.
    ///        Immutable after initialize (no setter). 0 = pauses never stop any clock (pure
    ///        wall-clock, the pre-erratum behaviour).
    function initialize(address admin_, uint64 unbondingPeriod_, uint64 maxPauseDuration_) external initializer {
        if (admin_ == address(0)) revert ICM.ZeroAddress();
        if (unbondingPeriod_ == 0) revert ICM.ZeroAmount();

        __AccessControl_init();
        __EIP712_init("Commitments", "1");

        CommitmentManagerStorage.Layout storage s = CommitmentManagerStorage.layout();
        s.unbondingPeriod = unbondingPeriod_;
        s.maxPauseDuration = maxPauseDuration_;
        // Ids are 1-indexed: 0 is the DistributionPaid non-attribution sentinel (INV-10).
        s.nextCommitmentId = 1;
        s.nextAgreementProposalId = 1;
        // Mutual ids are 1-indexed: 0 is the Membership not-a-member sentinel (INV-G6).
        s.nextMutualId = 1;

        _grantRole(DEFAULT_ADMIN_ROLE, admin_);
    }

    // =========================================================================
    // Part A — deposit / withdraw / fundStrategy
    // =========================================================================

    /// @notice Deposit backing tokens into the caller's free balance.
    /// @dev Credits the MEASURED balance delta, not `amount` (fee-on-transfer defense, ERC §A.2).
    ///      Rebasing tokens are structurally unsupported (they break INV-1); deployments SHOULD
    ///      screen them out off-chain — the ledger gives them no special handling.
    ///      Body lives in LedgerOpsLib (DELEGATECALL) to keep the manager under EIP-170.
    function deposit(address token, uint256 amount) external nonReentrant {
        LedgerOpsLib.depositCore(CommitmentManagerStorage.layout(), token, amount);
    }

    /// @notice Deposit backing tokens pulled from the caller into `onBehalfOf`'s free balance.
    /// @dev Same measured-delta rule as `deposit`. Enables relayer onboarding: a third party funds a
    ///      committer's free balance so `createCommitmentFor` needs no prior deposit by the committer.
    ///      Body lives in LedgerOpsLib (DELEGATECALL) to keep the manager under EIP-170.
    function depositFor(address token, uint256 amount, address onBehalfOf) external nonReentrant {
        LedgerOpsLib.depositForCore(CommitmentManagerStorage.layout(), token, amount, onBehalfOf);
    }

    /// @notice Deposit via an ERC-2612 permit — collapses approve + deposit into one tx.
    /// @dev Measured-delta rule as in `deposit`. The permit is tolerated as already-consumed
    ///      (front-run defense); see LedgerOpsLib. Body in LedgerOpsLib (DELEGATECALL).
    function depositWithPermit(address token, uint256 amount, uint256 deadline, uint8 v, bytes32 r, bytes32 s_)
        external
        nonReentrant
    {
        LedgerOpsLib.depositWithPermitCore(CommitmentManagerStorage.layout(), token, amount, deadline, v, r, s_);
    }

    /// @notice Withdraw from the caller's free balance. Instant — free balance backs nothing
    ///         and is never subject to an unbonding delay (ERC §A.2).
    function withdraw(address token, uint256 amount) external nonReentrant {
        LedgerOpsLib.withdrawCore(CommitmentManagerStorage.layout(), token, amount);
    }

    /// @notice Permissionlessly fund a strategy's escrow (ERC §A.4). Measured-delta rule as in
    ///         `deposit`. Refund policy is strategy-defined; the manager imposes none.
    /// @dev WARNING: the escrow pot carries no funder attribution and has no withdrawal surface
    ///      outside the §D.5 movement pipeline — see the interface NatSpec before funding.
    function fundStrategy(address strategy, address token, uint256 amount) external nonReentrant {
        LedgerOpsLib.fundStrategyCore(CommitmentManagerStorage.layout(), strategy, token, amount);
    }

    // =========================================================================
    // Part C — createCommitment
    // =========================================================================

    /// @notice Create a commitment, encumbering `params.amount` of `params.token` from the
    ///         caller's free balance (deposit first, then create).
    /// @return commitmentId The new commitment's id (always ≥ 1, INV-10).
    function createCommitment(ICM.CommitmentParams calldata params)
        external
        nonReentrant
        returns (uint256 commitmentId)
    {
        commitmentId = _createCommitmentInternal(msg.sender, params);
    }

    /// @notice Deposit `depositAmount` of `params.token` and create a commitment in one tx,
    ///         encumbering `params.amount` from the now-funded free balance (deposit + create).
    /// @dev Params are validated BEFORE the token pull (revert-before-pull). Surplus stays
    ///      withdrawable; a smaller `depositAmount` succeeds only if prior free balance covers the
    ///      shortfall (else `InsufficientFreeBalance`); `depositAmount == 0` degenerates to a plain
    ///      create. Body lives in CommitmentLifecycleLib (DELEGATECALL) to keep the manager under
    ///      EIP-170; the caller holds the reentrancy guard.
    /// @return commitmentId The new commitment's id (always ≥ 1, INV-10).
    function createAndFund(uint256 depositAmount, ICM.CommitmentParams calldata params)
        external
        nonReentrant
        returns (uint256 commitmentId)
    {
        commitmentId = CommitmentLifecycleLib.createAndFundCore(
            CommitmentManagerStorage.layout(),
            msg.sender,
            params,
            depositAmount,
            MIN_CHALLENGE_WINDOW(),
            MAX_STRATEGIES,
            MAX_METADATA_URI_LENGTH
        );
    }

    /// @dev All creation logic — validation, exposure, encumber, store, strategy binding and
    ///      creation hooks — lives in CommitmentLifecycleLib.createFull (DELEGATECALL). Callers
    ///      (createCommitment, batch, relayer) hold the reentrancy guard.
    function _createCommitmentInternal(address committer, ICM.CommitmentParams calldata params)
        internal
        returns (uint256 commitmentId)
    {
        commitmentId = CommitmentLifecycleLib.createFull(
            CommitmentManagerStorage.layout(),
            committer,
            params,
            MIN_CHALLENGE_WINDOW(),
            MAX_STRATEGIES,
            MAX_METADATA_URI_LENGTH
        );
    }

    // =========================================================================
    // Part C — release / expire
    // =========================================================================

    /// @notice Arbiter-immediate release. Release hooks run guarded BEFORE the committer's
    ///         remaining encumbrance frees. Agreed commitments MUST use `releaseAgreement`.
    function releaseCommitment(uint256 commitmentId) external nonReentrant {
        CommitmentLifecycleLib.releaseCore(CommitmentManagerStorage.layout(), commitmentId);
    }

    /// @notice Committer self-release after `expiresAt` (ERC §C.1).
    function expireCommitment(uint256 commitmentId) external nonReentrant {
        CommitmentLifecycleLib.expireCore(CommitmentManagerStorage.layout(), commitmentId);
    }

    // =========================================================================
    // Part C — two-phase forfeit
    // =========================================================================

    /// @notice Arbiter-only. Starts the challenge-window timer (ERC §C.3 phase 1).
    ///         Agreed commitments MUST be forfeited via `forfeitAgreement`.
    function initiateForfeit(uint256 commitmentId, uint16 penaltyBps) external nonReentrant {
        CommitmentLifecycleLib.initiateForfeitCore(CommitmentManagerStorage.layout(), commitmentId, penaltyBps);
    }

    /// @notice Anyone, after the challenge window (ERC §C.3 phase 2). The forfeit payout is a
    ///         ledger credit to the counterparty's FREE balance (pull-payment); forfeit hooks run
    ///         guarded, strictly after the transfer, and cannot affect it.
    function executeForfeit(uint256 commitmentId) external nonReentrant {
        CommitmentLifecycleLib.executeForfeitFull(CommitmentManagerStorage.layout(), commitmentId);
    }

    /// @notice Arbiter-only cancel of a pending proposal.
    function cancelForfeit(uint256 commitmentId) external nonReentrant {
        CommitmentLifecycleLib.cancelForfeitCore(CommitmentManagerStorage.layout(), commitmentId);
    }

    /// @notice Anyone, after `initiatedAt + challengeWindow + FORFEIT_PROPOSAL_TTL` (ERC §C.4).
    function cancelStaleForfeitProposal(uint256 commitmentId) external nonReentrant {
        CommitmentLifecycleLib.cancelStaleCore(CommitmentManagerStorage.layout(), commitmentId, FORFEIT_PROPOSAL_TTL);
    }

    // =========================================================================
    // Part C — committer-initiated unbond (ERC §C.5)
    // =========================================================================

    /// @notice Committer-only. Starts the unbond timer; changes no ledger state. The arbiter
    ///         retains forfeit authority during the window. Agreed partners unbond together.
    function requestUnbond(uint256 commitmentId) external nonReentrant {
        CommitmentLifecycleLib.requestUnbondCore(CommitmentManagerStorage.layout(), commitmentId);
    }

    /// @notice Anyone, after `unbondInitiatedAt + unbondingPeriod()`. Reverts while a forfeit
    ///         proposal is active; closes with the same accounting as release.
    function finalizeUnbond(uint256 commitmentId) external nonReentrant {
        CommitmentLifecycleLib.finalizeUnbondCore(CommitmentManagerStorage.layout(), commitmentId);
    }

    /// @notice Committer-only. Returns the commitment (and any agreed partner) to the prior
    ///         active state.
    function cancelUnbond(uint256 commitmentId) external nonReentrant {
        CommitmentLifecycleLib.cancelUnbondCore(CommitmentManagerStorage.layout(), commitmentId);
    }

    // =========================================================================
    // Part D — strategy entry points (ERC §D.3)
    // =========================================================================

    /// @notice Permissionlessly advance one bound strategy's accrual. Reverts bubble — the
    ///         caller chose the strategy; failure is actionable feedback, not a liveness
    ///         concern (ERC §D.3).
    /// @dev Body in MovementLib (DELEGATECALL) to keep the manager under EIP-170.
    function distribute(uint256 commitmentId, address strategy) external nonReentrant {
        MovementLib.distributeGuardedCore(CommitmentManagerStorage.layout(), commitmentId, strategy);
    }

    /// @notice Convenience fold of `distribute` over `strategiesOf(id)` in array order.
    /// @dev Body in MovementLib (DELEGATECALL) to keep the manager under EIP-170.
    function distributeAll(uint256 commitmentId) external nonReentrant {
        MovementLib.distributeAllCore(CommitmentManagerStorage.layout(), commitmentId);
    }

    /// @notice Strategy-mediated claim. Available in every commitment state — including after
    ///         close — so parked accrual is always recoverable (ERC §D.3). Caller authorization
    ///         is the strategy's job (the context carries `caller`).
    function claim(uint256 commitmentId, address strategy, bytes calldata claimData) external nonReentrant {
        CommitmentManagerStorage.Layout storage s = CommitmentManagerStorage.layout();
        if (!s.isBoundStrategy[commitmentId][strategy]) revert ICM.UnknownStrategy();
        MovementLib.claimCore(s, commitmentId, strategy, claimData);
    }

    /// @notice Advance one strategy's accrual, then claim, atomically under one reentrancy guard.
    /// @dev Fixes the distribute-then-claim ordering footgun: `pending()` reflects LIVE accrual but
    ///      `claim()` only pays BANKED accrual, so a caller who claims without distributing first can
    ///      see `pending() > 0` yet receive 0. Bundling the two makes the claim pay the just-distributed
    ///      amount (mirrors `settleAndClaim`). Requires the commitment active and un-forfeited — the
    ///      `distribute` leg does. After close, no new accrual is possible; use `claim` directly to
    ///      recover parked accrual. Body in MovementLib (DELEGATECALL) to keep the manager under EIP-170.
    function distributeAndClaim(uint256 commitmentId, address strategy, bytes calldata claimData)
        external
        nonReentrant
    {
        MovementLib.distributeAndClaimCore(CommitmentManagerStorage.layout(), commitmentId, strategy, claimData);
    }

    /// @notice Pending amount claimable via `claim` for the caller-implied recipient.
    function pending(uint256 commitmentId, address strategy, bytes calldata claimData) external view returns (uint256) {
        CommitmentManagerStorage.Layout storage s = CommitmentManagerStorage.layout();
        if (!s.isBoundStrategy[commitmentId][strategy]) revert ICM.UnknownStrategy();
        return MovementLib.pendingCore(s, commitmentId, strategy, claimData);
    }

    /// @notice Permissionless re-drive of a failed lifecycle hook under the same guarded
    ///         semantics (ERC §D.6), once the underlying cause has cleared. The commitment's
    ///         encumbrance is already settled by then, so a re-driven hook can only dispose of
    ///         escrowed value (`c.amount` is zeroed at close — no FromEncumbered* headroom).
    function sweepFailedHook(uint256 commitmentId, address strategy) external nonReentrant {
        CommitmentManagerStorage.Layout storage s = CommitmentManagerStorage.layout();
        bytes4 sel = s.failedHookSelector[commitmentId][strategy];
        if (sel == bytes4(0)) revert ICM.NoFailedHook();

        uint8 hook = sel == IDistributionStrategy.onCommitmentForfeited.selector ? HOOK_FORFEITED : HOOK_RELEASED;
        MovementLib.guardedCall(s, commitmentId, strategy, hook);
    }

    /// @notice Self-call-only frame putting the strategy call, the validation of its returned
    ///         movements, and their application in ONE revertable unit — a strategy that
    ///         returns invalid movements degrades identically to one that reverts (§D.6 rule 1).
    /// @dev NOT nonReentrant by design: the outer entry point holds the transient lock, which
    ///      is exactly what blocks a strategy from re-entering mutating manager surfaces.
    function __runStrategyHook(uint256 commitmentId, address strategy, uint8 hook) external {
        if (msg.sender != address(this)) revert ICM.Unauthorized();
        MovementLib.runHook(CommitmentManagerStorage.layout(), commitmentId, strategy, hook);
    }

    // =========================================================================
    // Agreements (ERC-COMMITMENTS-AGREEMENTS extension)
    // =========================================================================

    /// @notice Propose a bilateral agreement. The proposer's backing is encumbered
    ///         immediately (lock early to prevent griefing).
    function proposeAgreement(ICM.AgreementParams calldata params) external nonReentrant returns (uint256 proposalId) {
        proposalId = AgreementLib.proposeCore(CommitmentManagerStorage.layout(), params, MIN_CHALLENGE_WINDOW());
    }

    /// @notice Accept an agreement proposal, creating two linked commitments sharing the
    ///         same (token, adapter) with symmetric strategy bindings.
    /// @return agreementId The new agreement id.
    /// @return commitmentIdA The proposer's leg.
    /// @return commitmentIdB The acceptor's leg.
    function acceptAgreement(uint256 proposalId)
        external
        nonReentrant
        returns (uint256 agreementId, uint256 commitmentIdA, uint256 commitmentIdB)
    {
        (agreementId, commitmentIdA, commitmentIdB) =
            AgreementLib.acceptCore(CommitmentManagerStorage.layout(), proposalId);
    }

    /// @notice Cancel a proposal: proposer-only while live, anyone once expired. Frees the
    ///         proposer's encumbered backing.
    function cancelAgreementProposal(uint256 proposalId) external nonReentrant {
        AgreementLib.cancelProposalCore(CommitmentManagerStorage.layout(), proposalId);
    }

    /// @notice Initiate forfeit on both legs atomically (shared-arbiter-only), each at `penaltyBps`.
    function forfeitAgreement(uint256 agreementId, uint16 penaltyBps) external nonReentrant {
        AgreementLib.forfeitCore(CommitmentManagerStorage.layout(), agreementId, penaltyBps);
    }

    /// @notice Release both legs atomically (shared-arbiter-only). Each unresolved leg runs
    ///         its guarded release hooks before its encumbrance frees.
    function releaseAgreement(uint256 agreementId) external nonReentrant {
        AgreementLib.releaseAgreementCore(CommitmentManagerStorage.layout(), agreementId);
    }

    /// @notice Symmetric unbond start for both legs; either committer may call.
    function requestAgreementUnbond(uint256 agreementId) external nonReentrant {
        AgreementLib.requestAgreementUnbondCore(CommitmentManagerStorage.layout(), agreementId);
    }

    /// @notice Arbiter-instructed bilateral value flow, bounded by per-direction lifetime caps.
    ///         Bound strategies' accrual baselines are settled first via the guarded pre-settle
    ///         distribute (park-and-continue on strategy failure — a strategy cannot veto
    ///         arbiter settlement).
    function settleAgreement(uint256 agreementId, bool fromProposer, uint256 units, bytes32 evidenceHash)
        external
        nonReentrant
    {
        AgreementLib.settleWithPredistribute(
            CommitmentManagerStorage.layout(), agreementId, fromProposer, units, evidenceHash
        );
    }

    /// @notice Contribute free balance into a commitment's encumbered position (ERC §C.6).
    ///         The committer opts in by being the first contributor.
    function contributeEncumbered(uint256 commitmentId, uint256 units) external nonReentrant {
        CommitmentManagerStorage.Layout storage s = CommitmentManagerStorage.layout();
        // A member commitment's `E_i` / `creditedValue` are frozen at join; contributions would
        // drift them and desync the shared-loss accounting (ERC-COMMITMENTS-MUTUALS).
        if (s.membership[commitmentId].mutualId != 0) revert ICM.CommitmentInMutual();
        AgreementLib.contributeCore(s, commitmentId, units);
    }

    /// @notice Live bilateral-settlement state (caps + cumulative flow).
    function getAgreementSettlement(uint256 agreementId)
        external
        view
        returns (uint128 maxPToA, uint128 maxAToP, uint128 cumulPToA, uint128 cumulAToP)
    {
        ICM.AgreementSettlement storage es = CommitmentManagerStorage.layout().agreementSettlement[agreementId];
        return (
            es.maxFlowProposerToAcceptor,
            es.maxFlowAcceptorToProposer,
            es.cumulativeProposerToAcceptor,
            es.cumulativeAcceptorToProposer
        );
    }

    /// @notice Commitment pair of an agreement ([0, 0] if unknown).
    function getAgreementPair(uint256 agreementId) external view returns (uint256, uint256) {
        uint256[2] storage pair = CommitmentManagerStorage.layout().agreementPairs[agreementId];
        return (pair[0], pair[1]);
    }

    /// @notice The agreement a commitment belongs to (0 = not agreed).
    function agreementOf(uint256 commitmentId) external view returns (uint256) {
        return CommitmentManagerStorage.layout().commitmentToAgreement[commitmentId];
    }

    /// @notice The agreement a proposal produced (0 = never accepted).
    function agreementOfProposal(uint256 proposalId) external view returns (uint256) {
        return CommitmentManagerStorage.layout().proposalToAgreement[proposalId];
    }

    // =========================================================================
    // Shared-loss mutuals (Mutual extension, ERC-COMMITMENTS-MUTUALS) — thin dispatch wrappers
    // =========================================================================

    /// @notice Create a Mutual (starts inactive). See MutualLib.
    function createMutual(ICM.MutualParams calldata params) external nonReentrant returns (uint256 mutualId) {
        mutualId = MutualLib.createMutual(CommitmentManagerStorage.layout(), params);
    }

    /// @notice Arbiter activates a mutual once capacity is filled.
    function activateMutual(uint256 mutualId) external nonReentrant {
        MutualLib.activateMutual(CommitmentManagerStorage.layout(), mutualId);
    }

    /// @notice Configure heterogeneous mode (valuationAuthority-only, pre-activation, immutable). See lib.
    function configureHeterogeneous(uint256 mutualId, ICM.HeteroConfig calldata config) external nonReentrant {
        MutualLib.configureHeterogeneous(CommitmentManagerStorage.layout(), mutualId, config);
    }

    /// @notice Permissionless down-only re-mark of a member's premium weight (heterogeneous only). See lib.
    function remark(uint256 mutualId, uint256 commitmentId) external nonReentrant {
        MutualLib.remark(CommitmentManagerStorage.layout(), mutualId, commitmentId);
    }

    /// @notice Create a fresh commitment and join it to `mutualId`, freezing the capacity weight.
    function joinMutual(
        uint256 mutualId,
        ICM.CommitmentParams calldata params,
        uint128 creditedValue,
        bytes calldata attestation
    ) external nonReentrant returns (uint256 commitmentId) {
        commitmentId = MutualLib.joinMutual(
            CommitmentManagerStorage.layout(),
            mutualId,
            params,
            creditedValue,
            attestation,
            MIN_CHALLENGE_WINDOW(),
            MAX_STRATEGIES,
            MAX_METADATA_URI_LENGTH
        );
    }

    /// @notice Phase 1 (mutual arbiter): declare a mutual loss.
    function initiateMutualLoss(uint256 mutualId, uint256 lossNumeraire, bytes32 evidenceHash) external nonReentrant {
        MutualLib.initiateMutualLoss(CommitmentManagerStorage.layout(), mutualId, lossNumeraire, evidenceHash);
    }

    /// @notice Phase 2 (anyone, after the window): bump the shared loss index once.
    function executeMutualLoss(uint256 mutualId) external nonReentrant {
        MutualLib.executeMutualLoss(CommitmentManagerStorage.layout(), mutualId);
    }

    /// @notice Mutual arbiter cancel of a pending loss declaration.
    function cancelMutualLoss(uint256 mutualId) external nonReentrant {
        MutualLib.cancelMutualLoss(CommitmentManagerStorage.layout(), mutualId);
    }

    /// @notice Permissionless force-cancel of a stale mutual-loss declaration.
    function cancelStaleMutualLoss(uint256 mutualId) external nonReentrant {
        MutualLib.cancelStaleMutualLoss(CommitmentManagerStorage.layout(), mutualId);
    }

    /// @notice Permissionless lazy settle of one member's share of the shared loss.
    function settleMemberLoss(uint256 commitmentId) external nonReentrant {
        MutualLib.settleMemberLoss(CommitmentManagerStorage.layout(), commitmentId);
    }

    /// @notice Bounded batch settle convenience.
    function settleMembers(uint256[] calldata commitmentIds) external nonReentrant {
        MutualLib.settleMembers(CommitmentManagerStorage.layout(), commitmentIds);
    }

    /// @notice Member-only: start the deallocation window (still mutual-slashable until it elapses).
    function requestMutualExit(uint256 commitmentId) external nonReentrant {
        MutualLib.requestMutualExit(CommitmentManagerStorage.layout(), commitmentId);
    }

    /// @notice Release a fully-settled member past its deallocation window.
    function releaseMutualMember(uint256 commitmentId) external nonReentrant {
        MutualLib.releaseMutualMember(CommitmentManagerStorage.layout(), commitmentId);
    }

    // ---- Premium index (reward side, Mutuals premium) ----

    /// @notice Policyholder-funded premium: measured-receipt pull + (re)start a Synthetix stream.
    ///         Permissionless, guarded: `duration` bounded, live-stream rate may only rise (anti-dilution).
    function fundMutualPremium(uint256 mutualId, uint256 amount, uint64 duration) external nonReentrant {
        MutualLib.fundMutualPremium(CommitmentManagerStorage.layout(), mutualId, amount, duration);
    }

    /// @notice Permissionless bank-and-pay of a member's accrued premium to its committer.
    function claimMemberPremium(uint256 commitmentId) external nonReentrant {
        MutualLib.claimMemberPremium(CommitmentManagerStorage.layout(), commitmentId);
    }

    /// @notice Bounded batch claim convenience.
    function claimMembersPremium(uint256[] calldata commitmentIds) external nonReentrant {
        MutualLib.claimMembersPremium(CommitmentManagerStorage.layout(), commitmentIds);
    }

    /// @notice Policyholder-of-record reclaim of the unstreamed premium remainder.
    function reclaimPremium(uint256 mutualId) external nonReentrant {
        MutualLib.reclaimPremium(CommitmentManagerStorage.layout(), mutualId);
    }

    /// @notice Settle a member's loss then claim its premium under one reentrancy guard (pure dispatch).
    function settleAndClaim(uint256 commitmentId) external nonReentrant {
        MutualLib.settleAndClaim(CommitmentManagerStorage.layout(), commitmentId);
    }

    // ---- Mutual views ----

    function getMutual(uint256 mutualId) external view returns (ICM.Mutual memory) {
        return CommitmentManagerStorage.layout().mutuals[mutualId];
    }

    function getMembership(uint256 commitmentId) external view returns (ICM.Membership memory) {
        return CommitmentManagerStorage.layout().membership[commitmentId];
    }

    function getMutualLossProposal(uint256 mutualId) external view returns (ICM.MutualLossProposal memory) {
        return CommitmentManagerStorage.layout().mutualLossProposals[mutualId];
    }

    /// @notice Raw units `commitmentId` currently owes the beneficiary if settled now.
    function pendingMemberLoss(uint256 commitmentId) external view returns (uint256 owedUnits) {
        return MutualLib.pendingMemberLoss(CommitmentManagerStorage.layout(), commitmentId);
    }

    /// @notice Premium-side state of a mutual (Pi / denominator / stream / reserve) for read surfaces.
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
        )
    {
        CommitmentManagerStorage.Layout storage s = CommitmentManagerStorage.layout();
        ICM.Mutual storage g = s.mutuals[mutualId];
        premiumPerShareStored = g.premiumPerShareStored;
        activeCover = g.activeCover;
        settledTotal = g.settledTotal;
        rewardRate = g.rewardRate;
        lastUpdate = g.lastUpdate;
        periodFinish = g.periodFinish;
        premiumRemainder = g.premiumRemainder;
        bankedTotal = g.bankedTotal;
        premiumPool = s.mutualPremiumPool[mutualId];
    }

    /// @notice Premium currently claimable by `commitmentId` if claimed now (banked + simulated accrual).
    function pendingMemberPremium(uint256 commitmentId) external view returns (uint256 claimable) {
        return MutualLib.pendingMemberPremium(CommitmentManagerStorage.layout(), commitmentId);
    }

    /// @notice Junior shortfall absorber reserve (`funded − drawn`) for a mutual, in its numeraire.
    function getMutualJuniorPool(uint256 mutualId) external view returns (uint256 juniorPool) {
        return CommitmentManagerStorage.layout().mutualJuniorPool[mutualId];
    }

    // =========================================================================
    // Relayer / batch (ERC §C.8)
    // =========================================================================

    /// @notice Create a commitment on behalf of `committer` using an EIP-712 signature over the
    ///         canonical typehash. The signature is validated via OZ `SignatureChecker`, so
    ///         `committer` may be an EOA (ECDSA) or an ERC-1271 smart-contract wallet.
    function createCommitmentFor(
        address committer,
        ICM.CommitmentParams calldata params,
        uint256 deadline,
        uint256 nonce,
        bytes calldata sig
    ) external nonReentrant returns (uint256 commitmentId) {
        if (block.timestamp > deadline) revert ICM.SignatureExpired();

        CommitmentManagerStorage.Layout storage s = CommitmentManagerStorage.layout();
        if (s.nonces[committer] != nonce) revert ICM.InvalidNonce();
        s.nonces[committer]++;

        // Digest assembly + signature validation live in CommitmentLifecycleLib (DELEGATECALL) to
        // keep the manager under EIP-170; nonce consumption (above) stays here. Validation uses OZ
        // SignatureChecker, so `committer` may be an EOA (ECDSA) or an ERC-1271 contract wallet.
        if (!CommitmentLifecycleLib.isValidCreateSignature(
                CREATE_COMMITMENT_TYPEHASH, _domainSeparatorV4(), committer, params, nonce, deadline, sig
            )) revert ICM.InvalidSignature();

        commitmentId = _createCommitmentInternal(committer, params);
    }

    /// @notice Create multiple commitments atomically for the caller.
    function batchCreateCommitments(ICM.CommitmentParams[] calldata params)
        external
        nonReentrant
        returns (uint256[] memory commitmentIds)
    {
        uint256 len = params.length;
        if (len == 0) revert ICM.EmptyBatch();
        commitmentIds = new uint256[](len);
        for (uint256 i = 0; i < len; i++) {
            commitmentIds[i] = _createCommitmentInternal(msg.sender, params[i]);
        }
    }

    /// @notice Release multiple commitments atomically; caller must be arbiter for all.
    function batchReleaseCommitments(uint256[] calldata commitmentIds) external nonReentrant {
        uint256 len = commitmentIds.length;
        if (len == 0) revert ICM.EmptyBatch();
        CommitmentManagerStorage.Layout storage s = CommitmentManagerStorage.layout();
        for (uint256 i = 0; i < len; i++) {
            CommitmentLifecycleLib.releaseCore(s, commitmentIds[i]);
        }
    }

    /// @notice Current relayer nonce for `committer`.
    function nonces(address committer) external view returns (uint256) {
        return CommitmentManagerStorage.layout().nonces[committer];
    }

    /// @notice Revoke any outstanding `createCommitmentFor` authorization the caller has signed.
    /// @dev Bumps the caller's own relayer nonce, so a signature bound to the previous nonce no
    ///      longer matches and reverts `InvalidNonce`. Callable only for one's own nonce — this is
    ///      the signature escape hatch (ERC §C.8). No external calls, so no reentrancy surface.
    /// @return newNonce The caller's relayer nonce after the bump.
    function invalidateCreateAuthorization() external returns (uint256 newNonce) {
        CommitmentManagerStorage.Layout storage s = CommitmentManagerStorage.layout();
        newNonce = ++s.nonces[msg.sender];
        emit ICM.CreateAuthorizationInvalidated(msg.sender, newNonce);
    }

    // =========================================================================
    // Part A — circuit breaker (ERC §A.6)
    // =========================================================================

    /// @notice Pause forfeit execution. Separate pause/unpause roles so a single compromised key
    ///         cannot both pause and refuse to unpause. Idempotent: re-pausing while paused is a
    ///         no-op (it must never reset the in-flight episode's start and shrink its credit).
    /// @dev Starts a pause episode for the budget accounting (ERC §A.6 erratum): constraining
    ///      windows stop while paused, but only up to the lifetime `maxPauseDuration` budget —
    ///      see PauseLib. The stale-TTLs keep running on wall clock regardless (anti-pin).
    function pauseForfeiture() external onlyRole(PAUSER_ROLE) {
        CommitmentManagerStorage.Layout storage s = CommitmentManagerStorage.layout();
        if (s.forfeiturePaused) return;
        s.forfeiturePaused = true;
        s.pausedAt = uint64(block.timestamp);
        emit ICM.ForfeiturePauseToggled(true);
    }

    /// @notice Unpause forfeit execution. Idempotent: unpausing while unpaused is a no-op.
    /// @dev Closes the pause episode, accruing its RAW duration into `cumulativePaused` (the
    ///      budget clamp is applied at read time in PauseLib). A pre-erratum pause carried across
    ///      an upgrade has `pausedAt == 0` and accrues nothing.
    function unpauseForfeiture() external onlyRole(UNPAUSER_ROLE) {
        CommitmentManagerStorage.Layout storage s = CommitmentManagerStorage.layout();
        if (!s.forfeiturePaused) return;
        s.forfeiturePaused = false;
        if (s.pausedAt != 0) {
            s.cumulativePaused += uint64(block.timestamp) - s.pausedAt;
            s.pausedAt = 0;
        }
        emit ICM.ForfeiturePauseToggled(false);
    }

    /// @notice Whether forfeit execution is paused.
    function forfeiturePaused() external view returns (bool) {
        return CommitmentManagerStorage.layout().forfeiturePaused;
    }

    /// @inheritdoc ICM
    function pauseState()
        external
        view
        returns (bool paused, uint64 pausedAt, uint64 cumulativePaused, uint64 maxPauseDuration, uint64 creditable)
    {
        CommitmentManagerStorage.Layout storage s = CommitmentManagerStorage.layout();
        return (s.forfeiturePaused, s.pausedAt, s.cumulativePaused, s.maxPauseDuration, PauseLib.creditablePaused(s));
    }

    // =========================================================================
    // Views
    // =========================================================================

    /// @notice Free (withdrawable) balance of `user` in `token`.
    function freeBalance(address token, address user) external view returns (uint256) {
        return CommitmentManagerStorage.layout().ledger[token][user].freeBalance;
    }

    /// @notice Encumbered (commitment-backing) balance of `user` in `token`.
    function encumberedBalance(address token, address user) external view returns (uint256) {
        return CommitmentManagerStorage.layout().ledger[token][user].encumberedBalance;
    }

    /// @notice Escrow balance held for `strategy` in `token`. Arg order is `(token, strategy)` to
    ///         match the rest of the view surface (token first).
    function escrowOf(address token, address strategy) external view returns (uint256) {
        return CommitmentManagerStorage.layout().escrow[strategy][token];
    }

    /// @notice Per-token aggregate counters for the base O(1) partition check (ERC §A.5). The full
    ///         partition closes over five compartments — `free + encumbered + escrow +
    ///         mutualPremium + mutualJunior == IERC20(token).balanceOf(manager)` (INV-P13); this
    ///         getter exposes the base three. The two mutual compartments are read via
    ///         `totalMutualPremium` / `totalMutualJunior`.
    function ledgerTotals(address token)
        external
        view
        returns (uint256 totalFree, uint256 totalEncumbered, uint256 totalEscrow)
    {
        CommitmentManagerStorage.Layout storage s = CommitmentManagerStorage.layout();
        return (s.totalFree[token], s.totalEncumbered[token], s.totalEscrow[token]);
    }

    /// @notice Full Commitment struct. After a forfeit, `amount` reflects the post-forfeit residual
    ///         retained through the close (historical pre-forfeit amount is in the event stream).
    function getCommitment(uint256 commitmentId) external view returns (ICM.Commitment memory) {
        return CommitmentManagerStorage.layout().commitments[commitmentId];
    }

    /// @notice Current forfeit proposal for a commitment (zeroed if none).
    function getForfeitProposal(uint256 commitmentId) external view returns (ICM.ForfeitProposal memory) {
        return CommitmentManagerStorage.layout().forfeitProposals[commitmentId];
    }

    /// @notice Exposure tracking for `(token, user)` (INV-3). Arg order is token-first to match
    ///         the rest of the view surface.
    function getUserExposure(address token, address user) external view returns (ICM.UserExposure memory) {
        return CommitmentManagerStorage.layout().userExposures[user][token];
    }

    /// @notice Bound strategies of a commitment, in binding order.
    function strategiesOf(uint256 commitmentId) external view returns (address[] memory) {
        return CommitmentManagerStorage.layout().commitmentStrategies[commitmentId];
    }

    /// @notice Unbond initiation timestamp (0 = none pending).
    function unbondInitiatedAt(uint256 commitmentId) external view returns (uint64) {
        return CommitmentManagerStorage.layout().unbondInitiatedAt[commitmentId];
    }

    /// @notice Close timestamp of a commitment (0 = still active). `getCommitment().amount` is
    ///         zeroed at close, so this is the only surviving on-chain signal of when it settled.
    function closedAt(uint256 commitmentId) external view returns (uint64) {
        return CommitmentManagerStorage.layout().closedAt[commitmentId];
    }

    /// @notice Units forfeited at `executeForfeit` (0 = never forfeited).
    function forfeitedUnitsOf(uint256 commitmentId) external view returns (uint256) {
        return CommitmentManagerStorage.layout().forfeitedUnits[commitmentId];
    }

    /// @notice Whether the commitment accepts third-party `contributeEncumbered` calls (ERC §C.6).
    function acceptsContributions(uint256 commitmentId) external view returns (bool) {
        return CommitmentManagerStorage.layout().acceptsContributions[commitmentId];
    }

    /// @notice Selector of a failed guarded hook awaiting `sweepFailedHook` (0 = none).
    function failedHook(uint256 commitmentId, address strategy) external view returns (bytes4) {
        return CommitmentManagerStorage.layout().failedHookSelector[commitmentId][strategy];
    }

    /// @notice All commitment ids ever created for `user` (append-only).
    function getUserCommitmentIds(address user) external view returns (uint256[] memory) {
        return CommitmentManagerStorage.layout().userCommitmentIds[user];
    }

    // =========================================================================
    // Config views and admin
    // =========================================================================

    /// @notice Committer-unbond period in seconds (ERC §C.5). Always > 0.
    function unbondingPeriod() public view returns (uint64) {
        return CommitmentManagerStorage.layout().unbondingPeriod;
    }

    /// @notice Active minimum challenge window (seconds). Lazy default: 1 day.
    // solhint-disable-next-line func-name-mixedcase
    function MIN_CHALLENGE_WINDOW() public view returns (uint64) {
        uint64 stored = CommitmentManagerStorage.layout().minChallengeWindow;
        return stored == 0 ? DEFAULT_MIN_CHALLENGE_WINDOW : stored;
    }

    /// @notice Per-hook gas cap for guarded lifecycle hooks (ERC §D.6). Lazy default: 500k.
    function hookGasCap() public view returns (uint64) {
        uint64 stored = CommitmentManagerStorage.layout().hookGasCap;
        return stored == 0 ? HOOK_GAS_CAP_FLOOR : stored;
    }

    /// @notice Update the unbonding period. MUST stay > 0.
    function setUnbondingPeriod(uint64 newValue) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (newValue == 0) revert ICM.ZeroAmount();
        CommitmentManagerStorage.Layout storage s = CommitmentManagerStorage.layout();
        emit ICM.UnbondingPeriodUpdated(s.unbondingPeriod, newValue);
        s.unbondingPeriod = newValue;
    }

    /// @notice Update the minimum challenge window. Passing 0 restores the 1-day default.
    ///         Lowering below 1 day is intended for testnets only.
    function setMinChallengeWindow(uint64 newValue) external onlyRole(DEFAULT_ADMIN_ROLE) {
        CommitmentManagerStorage.Layout storage s = CommitmentManagerStorage.layout();
        emit ICM.MinChallengeWindowUpdated(s.minChallengeWindow, newValue);
        s.minChallengeWindow = newValue;
    }

    /// @notice Raise (never lower) the per-hook gas cap. Passing 0 restores the 500k default;
    ///         non-zero values below the floor are rejected (ERC §0.3).
    function setHookGasCap(uint64 newValue) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (newValue != 0 && newValue < HOOK_GAS_CAP_FLOOR) revert ICM.ZeroAmount();
        CommitmentManagerStorage.Layout storage s = CommitmentManagerStorage.layout();
        emit ICM.HookGasCapUpdated(s.hookGasCap, newValue);
        s.hookGasCap = newValue;
    }

    /// @notice Set or clear the operator registry for delegation hooks (mesh extension).
    /// @dev The manager notifies exactly ONE registry on release/forfeit; re-pointing (or
    ///      clearing) the slot while the outgoing registry still tracks live registration/
    ///      delegation commitments would silently orphan them — their later release/forfeit
    ///      hooks would be dropped, leaving phantom stake/voting power on the outgoing
    ///      registry. Reverts with `OperatorRegistrySwapBlocked` when the outgoing
    ///      registry reports a non-zero `trackedCommitmentCount()` or cannot report one
    ///      (fail-closed for non-conforming registries). Use `forceSetOperatorRegistry`
    ///      to override deliberately.
    function setOperatorRegistry(address operatorRegistry_) external onlyRole(DEFAULT_ADMIN_ROLE) {
        CommitmentManagerStorage.Layout storage s = CommitmentManagerStorage.layout();
        address outgoing = s.operatorRegistry;
        if (outgoing != address(0) && outgoing != operatorRegistry_) {
            bool clean = false;
            try IOperatorRegistryHooks(outgoing).trackedCommitmentCount() returns (uint256 tracked) {
                clean = tracked == 0;
            } catch {}
            if (!clean) revert ICM.OperatorRegistrySwapBlocked(outgoing);
        }
        emit ICM.OperatorRegistryUpdated(outgoing, operatorRegistry_);
        s.operatorRegistry = operatorRegistry_;
    }

    /// @notice Force-set or clear the operator registry, bypassing the tracked-commitments
    ///         guard. Any commitments still tracked by the outgoing registry are orphaned:
    ///         their release/forfeit hooks will be silently dropped. Escape hatch for
    ///         registry migrations and for outgoing registries that cannot report a count.
    function forceSetOperatorRegistry(address operatorRegistry_) external onlyRole(DEFAULT_ADMIN_ROLE) {
        CommitmentManagerStorage.Layout storage s = CommitmentManagerStorage.layout();
        emit ICM.OperatorRegistryUpdated(s.operatorRegistry, operatorRegistry_);
        s.operatorRegistry = operatorRegistry_;
    }

    /// @notice Operator registry wired for delegation hooks (0 = disabled).
    function operatorRegistry() external view returns (address) {
        return CommitmentManagerStorage.layout().operatorRegistry;
    }

    // =========================================================================
    // UUPS
    // =========================================================================

    function _authorizeUpgrade(address) internal override onlyRole(DEFAULT_ADMIN_ROLE) {}
}
