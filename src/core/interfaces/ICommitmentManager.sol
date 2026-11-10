// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import {StrategyBinding} from "src/core/interfaces/IDistributionStrategy.sol";

/// @title ICommitmentManager
/// @notice Full interface for the direct-custody commitment manager (ERC-COMMITMENTS Parts A–D
///         plus the agreements extension). The manager is the custody root: it holds backing
///         tokens, maintains the per-(token, user) free/encumbered ledger and per-strategy escrow,
///         owns the commitment state machine, and is the sole executor of token movements.
/// @dev Getter naming convention: use `getX` for record or aggregate snapshots (especially struct
///      returns), bare `x(...)` for scalar ledger/configuration/state reads, and `xOf(...)` for
///      per-key collections or relationships. Existing getter names remain unchanged for ABI
///      stability; new views should follow these categories.
interface ICommitmentManager {
    // =========================================================================
    // Structs
    // =========================================================================

    /// @notice A unilateral commitment: a parameterized lien on the committer's encumbered backing.
    /// @dev `amount` is denominated in raw backing-token units (ERC §0.1).
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

    /// @notice Parameters for creating a commitment.
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

    /// @notice Pending forfeit proposal awaiting its challenge window.
    /// @dev Keyed by `commitmentId` in `forfeitProposals` storage, so the id is not
    ///      stored in the struct. The five remaining fields pack into a single slot.
    struct ForfeitProposal {
        uint16 penaltyBps;
        uint64 initiatedAt;
        bool executed;
        bool cancelled;
        // ---- Pause erratum (append-only) ----
        uint64 cumulativePausedAtStart; // creditable-pause snapshot at initiate; anchors the challenge-window clock-stop
    }

    /// @notice Per-(user, token) exposure tracking for the allocation invariant (INV-3).
    struct UserExposure {
        uint256 totalEncumbered; // Σ commitment.amount over active commitments
        uint256 totalForfeitable; // Σ amount × maxPenaltyBps / 10_000 over active commitments
    }

    /// @notice Per-leg economic terms. A "leg" is one committer's side of an
    ///         agreement: its own backing token + adapter, encumbered amount, penalty
    ///         ceiling, and strategy set. The two legs are fully independent — different
    ///         tokens (cross-token treaties: DAO A's gov token vs DAO B's), different
    ///         penalty ceilings, and different strategy sets are all expressible.
    struct LegTerms {
        address token; // backing token for this leg
        address adapter; // backing adapter that prices `token`
        uint256 amount; // raw units this committer encumbers
        uint16 maxPenaltyBps; // this leg's forfeit ceiling (0..10_000)
        StrategyBinding[] strategies; // strategies bound to THIS leg only (≤ MAX_STRATEGIES)
    }

    /// @notice Parameters for proposing an agreement (extension). Each leg carries its
    ///         own `LegTerms`, so the two sides may differ in token, adapter, amount,
    ///         penalty ceiling, and strategies (including fully cross-token treaties).
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

    /// @notice Bilateral agreement proposal (extension). Per-leg terms mirror
    ///         `AgreementParams`; each leg's strategies live in a separate storage array
    ///         (proposer in `proposalStrategies`, acceptor in `proposalAcceptorStrategies`).
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

    /// @notice Per-agreement bilateral-settlement state (caps + cumulative flow).
    struct AgreementSettlement {
        uint128 maxFlowProposerToAcceptor;
        uint128 maxFlowAcceptorToProposer;
        uint128 cumulativeProposerToAcceptor;
        uint128 cumulativeAcceptorToProposer;
    }

    // =========================================================================
    // Structs — shared-loss mutuals (Mutual extension, ERC-COMMITMENTS-MUTUALS)
    // =========================================================================

    /// @notice A mutual header: a shared loss index `cumulativeLoss` (Lambda) over a set of
    ///         individually-custodied, exogenous member commitments. Tokens never centralize —
    ///         the index rebases *attribution*, not custody (INV-1 preserved). See the Mutuals standard
    ///         (ERC-COMMITMENTS-MUTUALS). Economically: Lloyd's several liability with a shared loss ratio.
    struct Mutual {
        address arbiter; // sole authority to INITIATE a mutual loss
        address numeraire; // the token every member posts; unit of creditedValue, L and premium
        address beneficiary; // who settled units pay to (typically a ClaimRouter) — REQUIRED
        uint64 challengeWindow; // >= MUTUAL_MIN_CHALLENGE_WINDOW (longer than the per-commitment floor)
        uint64 deallocationWindow; // post-exit-request slashable window; >= challengeWindow
        uint64 lastInitiatedAt; // re-initiation rate-limit cursor (griefing guard)
        uint128 totalShares; // Σ creditedValue of non-exited members. join / release ONLY — never on loss.
        uint256 cumulativeLoss; // Lambda, 1e18-scaled fraction. Monotonic non-decreasing, <= 1e18.
        bool active; // set by the arbiter; members can only join an active mutual
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
    }

    /// @notice Per-commitment membership in a Mutual (sparse; mutualId 0 == not a member).
    struct Membership {
        uint256 mutualId; // 0 == not a member (single, non-rebindable)
        uint256 forfeitableUnits; // E_i = amount*maxPenaltyBps/10_000, FROZEN at join (the loss base, raw units)
        uint256 settledUnits; // cumulative owedUnits already forfeited (remaining = E_i - settledUnits)
        uint128 creditedValue; // == E_i, FROZEN at join (totalShares accounting)
        uint256 lossSnapshot; // Lambda at join / last settle — liable only for cumulativeLoss - snapshot
        uint64 unbondRequestedAt; // 0 == active; nonzero starts the deallocation window (still slashable until elapsed)
        // ---- Premium index (reward side; append-only) ----
        uint256 premiumSnapshot; // Pi at join / last sync — earns only Pi-growth after (reward non-retroactivity, INV-P5)
        uint256 rewardBank; // accrued-but-unclaimed premium in numeraire (paid to the committer on claim/release)
        // (The deallocation-window pause snapshot lives in the sibling
        //  `memberExitCumulativePausedAtStart` mapping, written at requestMutualExit — a struct
        //  field would cost every join a slot touch for a value only exits read.)
    }

    /// @notice Pending two-phase mutual-loss declaration (at most one active per mutual).
    /// @dev `proposer`/`evidenceHash` make the dispute model storage-ready; bond custody itself
    ///      lives in the pluggable mutual arbiter (periphery), keeping the custody root ETH-free.
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

    /// @notice Parameters for creating a Mutual.
    struct MutualParams {
        address arbiter;
        address numeraire;
        address beneficiary;
        uint64 challengeWindow;
        uint64 deallocationWindow;
    }

    // =========================================================================
    // Events — Part A (custody and ledger)
    // =========================================================================

    event Deposited(address indexed user, address indexed token, uint256 amount);
    event Withdrawn(address indexed user, address indexed token, uint256 amount);
    event StrategyFunded(address indexed funder, address indexed strategy, address indexed token, uint256 amount);

    event EncumbranceIncreased(address indexed user, address indexed token, uint256 units);

    /// @notice Encumbrance returned to the holder's FREE balance (encumbered -> free). Emitted on
    ///         commitment close (release / expire / finalize), forfeit-residual return, and
    ///         agreement-proposal cancel. `commitmentId == 0` is the sentinel for the
    ///         proposal-cancel path (no commitment exists yet).
    /// @dev Replaces the old overloaded `EncumbranceDecreased`: this path conserves the holder's
    ///      total ledger balance (free goes up by `units`), unlike the escrow/external paths.
    event EncumbranceReleased(uint256 indexed commitmentId, address indexed user, address indexed token, uint256 units);

    /// @notice Strategy moved encumbered backing into its own escrow (FromEncumberedToEscrow,
    ///         §D.5). Encumbered goes down, escrow up; the committer's free is unchanged.
    event EncumbranceMovedToEscrow(
        uint256 indexed commitmentId, address indexed strategy, address indexed token, uint256 units
    );

    /// @notice Strategy paid encumbered backing out of the manager (FromEncumberedToExternal,
    ///         §D.5). Encumbered goes down and the value leaves custody; paired with
    ///         `DistributionPaid` (which carries the recipient).
    event EncumbrancePaidExternal(
        uint256 indexed commitmentId, address indexed strategy, address indexed token, uint256 units
    );

    event EncumbranceTransferred(address indexed from, address indexed to, address indexed token, uint256 units);
    event EncumbranceContributed(
        uint256 indexed commitmentId, address indexed contributor, address indexed receiver, uint256 units
    );

    event ForfeiturePauseToggled(bool paused);

    // =========================================================================
    // Events — Part C (commitments)
    // =========================================================================

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

    /// @notice Companion to CommitmentCreated: exposes `counterparty` as an indexed discovery axis.
    /// @dev CommitmentCreated's three topic slots are full (commitmentId, committer, arbiter), so the
    ///      counterparty discovery axis ("commitments where I am the counterparty") is emitted here,
    ///      joined to the creation event by `commitmentId`. Emitted from the libraries, so it costs
    ///      the manager's bytecode budget nothing. Only emitted when `counterparty != address(0)` —
    ///      the zero counterparty carries no queryable identity and is never indexed.
    event CommitmentCounterparty(uint256 indexed commitmentId, address indexed counterparty);

    event CommitmentReleased(uint256 indexed commitmentId, address indexed arbiter);
    event CommitmentExpired(uint256 indexed commitmentId, address indexed committer);

    event ForfeitInitiated(uint256 indexed commitmentId, uint16 penaltyBps, uint64 challengeWindow);
    event ForfeitExecuted(uint256 indexed commitmentId, uint256 unitsForfeited, address indexed counterparty);
    event ForfeitCancelled(uint256 indexed commitmentId);
    event ForfeitCancelledStale(uint256 indexed commitmentId);

    event CommitmentUnbondRequested(uint256 indexed commitmentId, address indexed committer, uint64 maturesAt);
    event CommitmentFinalized(uint256 indexed commitmentId);
    event CommitmentUnbondCancelled(uint256 indexed commitmentId);

    event ContributionsEnabled(uint256 indexed commitmentId, address indexed committer);

    // =========================================================================
    // Events — Part D (strategies)
    // =========================================================================

    /// @notice Emitted by the manager on createCommitment (and agreement accept), once per
    ///         bound strategy. Lets indexers build the strategy → commitments[] map.
    event CommitmentBoundToStrategy(uint256 indexed commitmentId, address indexed strategy, bytes strategyParams);

    /// @notice MUST be emitted on every payout to a recipient, regardless of execution path
    ///         (ERC §D.7). The manager emits it for every applied recipient-crediting movement;
    ///         self-custody strategies emit it from their own surface. `commitmentId = 0` is the
    ///         non-attribution sentinel for cross-commitment payouts; `context` is strategy-defined.
    event DistributionPaid(
        address indexed strategy,
        address indexed recipient,
        address indexed token,
        uint256 amount,
        uint256 commitmentId,
        bytes32 context
    );

    /// @notice Emitted when a guarded lifecycle hook fails (ERC §D.6). The strategy's in-flight
    ///         accrual is parked in its escrow, never forfeited; `sweepFailedHook` can re-drive.
    event StrategyHookFailed(uint256 indexed commitmentId, address indexed strategy, bytes4 hookSelector);

    // =========================================================================
    // Events — agreements (extension)
    // =========================================================================

    event AgreementProposed(
        uint256 indexed proposalId, address indexed proposer, address indexed acceptor, string uri, bytes32 contentHash
    );
    /// @notice Companion to AgreementProposed: the immutable per-leg economic terms of a pending
    ///         proposal, event-sourced so they need no struct getter. Emitted from the library, so it
    ///         costs the manager's bytecode budget nothing. This is the CANONICAL read of pending-
    ///         proposal terms (the struct getter is intentionally omitted from this implementation for
    ///         EIP-170 headroom; terms are immutable, so one getLogs by proposalId is authoritative).
    /// @dev The mutable `accepted`/`cancelled` flags are NOT carried here — resolve a proposal's
    ///      terminal state via `agreementOfProposal` (non-zero ⇒ accepted) or the accept/cancel
    ///      events. Metadata (`metadataURI`/`metadataHash`) lives in `AgreementProposed` as
    ///      `uri`/`contentHash`. Only `proposalId` is indexed (stay ≤ 3 topics).
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
    event AgreementAccepted(
        uint256 indexed agreementId,
        uint256 indexed proposalId,
        uint256 commitmentIdA,
        uint256 commitmentIdB,
        string uri,
        bytes32 contentHash
    );
    event AgreementProposalCancelled(uint256 indexed proposalId);
    event AgreementProposalExpiredCancelled(uint256 indexed proposalId, address indexed proposer);
    event AgreementForfeited(uint256 indexed agreementId);
    event AgreementReleased(uint256 indexed agreementId);
    event AgreementPartialForfeit(uint256 indexed agreementId, uint256 indexed commitmentId);
    event AgreementUnbondRequested(uint256 indexed agreementId);
    event AgreementSettled(
        uint256 indexed agreementId,
        bool fromProposer,
        uint256 units,
        uint256 cumulativeProposerToAcceptor,
        uint256 cumulativeAcceptorToProposer,
        bytes32 evidenceHash
    );

    // =========================================================================
    // Events — shared-loss mutuals (Mutual extension, ERC-COMMITMENTS-MUTUALS)
    // =========================================================================

    event MutualCreated(uint256 indexed mutualId, address indexed arbiter, address numeraire, address beneficiary);
    event MutualActivated(uint256 indexed mutualId);
    event MutualTerminated(uint256 indexed mutualId);
    event MemberJoined(
        uint256 indexed mutualId,
        uint256 indexed commitmentId,
        address indexed committer,
        uint128 creditedValue,
        uint256 forfeitableUnits
    );
    event MutualLossInitiated(
        uint256 indexed mutualId, uint256 lossNumeraire, bytes32 evidenceHash, address indexed proposer
    );
    /// @notice Lambda bumped at execute. `appliedNumeraire` may be < the declared L when the
    ///         `cumulativeLoss <= 1e18` clamp bites (see MutualLossShortfall).
    event MutualLossExecuted(uint256 indexed mutualId, uint256 appliedNumeraire, uint256 cumulativeLoss);
    event MutualLossCancelled(uint256 indexed mutualId, bool stale);
    /// @notice Beneficiary under-recovery: the clamp prevented `shortfallNumeraire` of declared
    ///         loss from being attributed. Observable, never silent.
    event MutualLossShortfall(uint256 indexed mutualId, uint256 shortfallNumeraire);
    /// @notice A member settled its share of the shared loss (lazy, permissionless, O(1)).
    event MemberSettled(
        uint256 indexed mutualId, uint256 indexed commitmentId, uint256 owedUnits, uint256 cumulativeLoss
    );
    /// @notice A member started its deallocation window. It stays slashable until `slashableUntil`
    ///         (the no-further-pause estimate); the exit window then runs from `slashableUntil` for
    ///         one more `deallocationWindow`, after which the request lapses.
    event MemberExitRequested(uint256 indexed mutualId, uint256 indexed commitmentId, uint64 slashableUntil);
    event MemberReleased(uint256 indexed mutualId, uint256 indexed commitmentId);

    // ---- Premium index (reward side, Mutuals premium) ----
    /// @notice Policyholder funded/extended a mutual's premium stream. `received` is the MEASURED
    ///         balance delta (fee-on-transfer safe); `rewardRate`/`periodFinish` are post-funding.
    event MutualPremiumFunded(
        uint256 indexed mutualId, address indexed funder, uint256 received, uint128 rewardRate, uint64 periodFinish
    );
    /// @notice A member's accrued premium was paid to its committer (via `claimMemberPremium`,
    ///         `settleAndClaim`, or the auto-pay on `releaseMutualMember`).
    event MemberPremiumClaimed(uint256 indexed commitmentId, address indexed recipient, uint256 amount);
    /// @notice The policyholder-of-record reclaimed the unstreamed premium remainder and halted the stream.
    event PremiumReclaimed(uint256 indexed mutualId, address indexed recipient, uint256 unstreamed);
    /// @notice Terminal sweep of a wound-down mutual's residual reserve (so INV-P1 closes at zero).
    event MutualPremiumSwept(uint256 indexed mutualId, address indexed recipient, uint256 amount);

    // =========================================================================
    // Events — admin
    // =========================================================================

    event OperatorRegistryUpdated(address indexed oldRegistry, address indexed newRegistry);
    event RegistryHookFailed(uint256 indexed commitmentId, bytes4 indexed selector);
    event MinChallengeWindowUpdated(uint64 oldValue, uint64 newValue);
    event UnbondingPeriodUpdated(uint64 oldValue, uint64 newValue);
    event HookGasCapUpdated(uint64 oldValue, uint64 newValue);

    // =========================================================================
    // Errors — Part A
    // =========================================================================

    error ZeroAddress();
    error ZeroAmount();
    error InsufficientFreeBalance(uint256 requested, uint256 available);
    error InsufficientEncumberedBalance(uint256 requested, uint256 available);
    error InsufficientEscrow(uint256 requested, uint256 available);
    error ForfeitureIsPaused();
    error Unauthorized();

    // =========================================================================
    // Errors — Part C
    // =========================================================================

    error ZeroArbiter();
    error ZeroCounterparty();
    error PenaltyExceedsMax();
    error ExposureAllocationExceeded();
    error TooManyStrategies();
    error NotArbiter();
    error NotCommitter();
    error CommitmentInactive();
    error ForfeitPending();
    error NoActiveForfeitProposal();
    error ChallengeWindowActive();
    error ChallengeWindowTooShort();
    /// @notice A non-zero manager-wide creation floor cannot be shorter than the protocol floor.
    error MinChallengeWindowBelowFloor();
    error CommitmentHasNoExpiry();
    error CommitmentNotExpired();
    error InvalidExpiry();
    error URITooLong();
    error UnbondAlreadyRequested();
    error UnbondNotElapsed(uint64 maturesAt);
    error NoUnbondPending();
    error UnbondBlockedByForfeit();
    error UnbondPending();
    error UseAgreementPath();
    error ContributionsDisabled();

    // ---- Relayer / batch ----
    error SignatureExpired();
    error InvalidNonce();
    error InvalidSignature();
    error EmptyBatch();

    /// @notice Emitted when `committer` bumps their relayer nonce to `newNonce`, revoking any
    ///         outstanding `createCommitmentFor` authorization bound to the previous nonce.
    event CreateAuthorizationInvalidated(address indexed committer, uint256 newNonce);

    // =========================================================================
    // Errors — Part D
    // =========================================================================

    error UnknownStrategy();
    error DuplicateStrategy();
    error InsufficientGasForHook();
    error NoFailedHook();

    // ---- Movement validation (ERC §D.4/§D.5), one error per failing branch ----

    /// @notice A movement carried zero units.
    error MovementZeroUnits();
    /// @notice FromEncumberedToEscrow is not permitted at the claim site.
    error MovementToEscrowNotAllowedOnClaim();
    /// @notice FromEncumberedToExternal is permitted only at the distribute site.
    error MovementToExternalOnlyOnDistribute();
    /// @notice FromEscrow* payouts are not permitted at the distribute site.
    error MovementFromEscrowNotOnDistribute();
    /// @notice A FromEncumbered* movement's `from` was not the commitment's committer.
    error MovementFromNotCommitter(address from, address committer);
    /// @notice A FromEncumbered* movement's `token` did not match the commitment's backing token.
    error MovementWrongToken(address token, address expected);
    /// @notice A FromEncumberedToEscrow movement's `to` was not the calling strategy.
    error MovementEscrowRecipientNotStrategy(address to, address strategy);
    /// @notice A movement's recipient was neither the committer nor the counterparty.
    error MovementRecipientNotParty(address to);
    /// @notice A FromEncumbered* movement exceeded the commitment's live amount cap (INV-4).
    error MovementExceedsCommitment(uint256 units, uint256 amount);
    /// @notice A distribute-site movement was attempted while a forfeit proposal is active.
    error MovementBlockedByForfeit();
    /// @notice A FromEscrow* movement's `from` was not the calling strategy (INV-5).
    error MovementFromNotStrategy(address from, address strategy);

    // =========================================================================
    // Errors — agreements (extension)
    // =========================================================================

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

    // =========================================================================
    // Errors — shared-loss mutuals (Mutual extension)
    // =========================================================================

    error MutualNotFound();
    error MutualNotActive();
    error MutualIsTerminal();
    error NotMutualArbiter();
    error MutualLossPending();
    error NoMutualLossPending();
    error MutualChallengeWindowActive();
    error MutualChallengeWindowTooShort();
    error DeallocationWindowTooShort();
    error NotMutualMember();
    error MemberUnsettled();
    error DeallocationWindowActive();
    error ExitNotRequested();
    error ExitRequestLapsed(); // release at or past 2 * deallocationWindow; request again
    error MutualExhausted(); // Lambda at its cap: no new joins or premium
    error InvalidCreditedValue();
    error NumeraireMismatch();
    error MutualArbiterMismatch();
    error MutualBeneficiaryMismatch();
    error MemberStrategyForbidden();
    error TotalSharesOverflow();
    error ReinitTooSoon();
    error CommitmentInMutual();

    // ---- Premium index (reward side) ----
    error NoActiveCover(); // fundMutualPremium with activeCover == 0 (no one to distribute to)
    error PremiumStreamUnderfunded(); // funding-time solvency guard: future-streamable + banked > reserve (INV-P2)
    error InsufficientMutualPremium(uint256 requested, uint256 available); // pool debit exceeds the reserve
    error RewardRateOverflow(); // computed rewardRate would not fit uint128 (infeasible funding)
    error StreamDurationOutOfBounds(); // duration outside [MIN_STREAM_DURATION, MAX_STREAM_DURATION], or uint64 deadline overflow
    error PremiumRateDecreased(); // live-stream funding may only maintain/raise rewardRate (anti-dilution/stall)

    // ---- Operator registry wiring ----
    /// @notice setOperatorRegistry would orphan live delegations: the outgoing registry still
    ///         reports tracked commitments (or cannot report a count at all). Their later
    ///         release/forfeit hooks would be silently dropped, leaving phantom stake/voting
    ///         power on the outgoing registry. Use forceSetOperatorRegistry to override.
    error OperatorRegistrySwapBlocked(address outgoingRegistry);

    // =========================================================================
    // Part A — Custody
    // =========================================================================

    /// @notice Pull `amount` of `token` from the caller and credit the caller's free balance
    ///         by the measured balance delta (fee-on-transfer defense, ERC §A.2).
    function deposit(address token, uint256 amount) external;

    /// @notice Deposit `amount` of `token` pulled from the caller into `onBehalfOf`'s free balance.
    ///         Measured-delta rule as in `deposit`. The `Deposited` event credits `onBehalfOf`.
    function depositFor(address token, uint256 amount, address onBehalfOf) external;

    /// @notice Deposit via an ERC-2612 permit — collapses approve + deposit into one tx. Measured-
    ///         delta rule as in `deposit`; a front-run (already-consumed) permit is tolerated.
    function depositWithPermit(address token, uint256 amount, uint256 deadline, uint8 v, bytes32 r, bytes32 s_) external;

    /// @notice Debit the caller's free balance and transfer `amount` of `token` out. Instant:
    ///         free balance backs nothing and is never subject to an unbonding delay.
    function withdraw(address token, uint256 amount) external;

    /// @notice Permissionlessly credit `escrow[strategy][token]` by pulling `amount` from the
    ///         caller (measured-delta rule). Refund policy is strategy-defined (ERC §A.4).
    /// @dev WARNING: escrow is a single per-(strategy,token) pot with NO funder attribution —
    ///      the funder appears only in the `StrategyFunded` event. Unless the target strategy
    ///      attributes funding on its own surface (e.g. a `prefund` that calls this itself),
    ///      anything sent here is pooled, first-come, and non-refundable: escrow debits exist
    ///      only inside the commitment-scoped movement pipeline (§D.5). Do not prefund
    ///      user-attributed obligations through this surface directly.
    function fundStrategy(address strategy, address token, uint256 amount) external;

    /// @notice Free (withdrawable) balance of `user` in `token`.
    function freeBalance(address token, address user) external view returns (uint256);

    /// @notice Encumbered (commitment-backing) balance of `user` in `token`.
    function encumberedBalance(address token, address user) external view returns (uint256);

    /// @notice Escrow balance held for `strategy` in `token`. Arg order is `(token, strategy)` to
    ///         match the rest of the view surface (token first).
    function escrowOf(address token, address strategy) external view returns (uint256);

    /// @notice Manager-level unbonding period (seconds) for committer-initiated unbond. Always > 0.
    function unbondingPeriod() external view returns (uint64);

    /// @notice Operator registry wired for delegation release/forfeit hooks (0 = disabled).
    ///         Registries verify `operatorRegistry() == address(this)` before accepting
    ///         registrations/delegations — an unwired registry never receives the hooks, so
    ///         any stake it credited would be phantom, unbacked voting power.
    function operatorRegistry() external view returns (address);

    /// @notice Pause forfeit execution (PAUSER_ROLE).
    function pauseForfeiture() external;

    /// @notice Unpause forfeit execution (UNPAUSER_ROLE).
    function unpauseForfeiture() external;

    /// @notice Whether forfeit execution is paused.
    function forfeiturePaused() external view returns (bool);

    /// @notice Pause-budget accounting (ERC §A.6 erratum): the raw episode state plus the
    ///         budget-clamped total (`creditable`) that constraining windows subtract as
    ///         stopped-clock time. `creditable` is monotone non-decreasing and never exceeds
    ///         `maxPauseDuration`; once they are equal the budget is spent and further pauses
    ///         stop no clocks.
    function pauseState()
        external
        view
        returns (bool paused, uint64 pausedAt, uint64 cumulativePaused, uint64 maxPauseDuration, uint64 creditable);

    // =========================================================================
    // Part C — Commitment lifecycle
    // =========================================================================

    /// @notice Create a commitment, encumbering `params.amount` of `params.token` from the
    ///         caller's free balance. Runs each strategy's `onCommitmentCreated` in array order;
    ///         a revert in any hook aborts creation (compatibility refusal, ERC §C.1).
    /// @return commitmentId The new commitment's id (always ≥ 1; 0 is reserved, INV-10).
    function createCommitment(CommitmentParams calldata params) external returns (uint256 commitmentId);

    /// @notice Deposit `depositAmount` of `params.token` and create a commitment in a single tx,
    ///         encumbering `params.amount` from the now-funded free balance. Collapses the usual
    ///         deposit → create into one call. The deposit is credited by the MEASURED balance delta
    ///         (fee-on-transfer defense, ERC §A.2), so `params.amount` is encumbered from the sum of
    ///         the caller's prior free balance and the measured receipt.
    /// @dev Params are validated BEFORE the token pull (revert-before-pull), so a rejected commitment
    ///      never moves funds. Surplus (`depositAmount > params.amount`) stays in the caller's free
    ///      balance and is instantly withdrawable; a smaller `depositAmount` succeeds only when the
    ///      caller's prior free balance covers the shortfall (else `InsufficientFreeBalance`);
    ///      `depositAmount == 0` degenerates to a plain create against existing free balance.
    /// @param depositAmount Raw units of `params.token` to pull from the caller before creating.
    /// @param params Commitment parameters (see `createCommitment`).
    /// @return commitmentId The new commitment's id (always ≥ 1; 0 is reserved, INV-10).
    function createAndFund(uint256 depositAmount, CommitmentParams calldata params)
        external
        returns (uint256 commitmentId);

    /// @notice Arbiter-immediate release. Runs release hooks (guarded, ERC §D.6) BEFORE freeing
    ///         the committer's remaining encumbrance.
    function releaseCommitment(uint256 commitmentId) external;

    /// @notice Committer self-release after `expiresAt`. Same hook sequence as release.
    function expireCommitment(uint256 commitmentId) external;

    // ---- Two-phase forfeit ----

    /// @notice Arbiter-only. Starts the challenge-window timer; at most one active proposal (INV-7).
    function initiateForfeit(uint256 commitmentId, uint16 penaltyBps) external;

    /// @notice Anyone, after the challenge window. Manager-internal forfeit transfer credits the
    ///         counterparty's FREE balance (pull-payment); residual returns to the committer.
    ///         Forfeit hooks run guarded, strictly after the transfer (ERC §C.3).
    function executeForfeit(uint256 commitmentId) external;

    /// @notice Arbiter-only cancel of a pending proposal.
    function cancelForfeit(uint256 commitmentId) external;

    /// @notice Anyone, after `initiatedAt + challengeWindow + FORFEIT_PROPOSAL_TTL`. Unblocks
    ///         committer unbond when the arbiter has abandoned (ERC §C.4).
    function cancelStaleForfeitProposal(uint256 commitmentId) external;

    // ---- Committer-initiated unbond ----

    /// @notice Committer-only. Starts the unbond timer; changes no ledger state. The arbiter
    ///         retains forfeit authority during the window (ERC §C.5).
    function requestUnbond(uint256 commitmentId) external;

    /// @notice Anyone, after `unbondInitiatedAt + unbondingPeriod()`. Reverts if a forfeit proposal
    ///         is active. Closes with the same accounting as release (hooks first).
    function finalizeUnbond(uint256 commitmentId) external;

    /// @notice Committer-only. Returns the commitment to its prior active state.
    function cancelUnbond(uint256 commitmentId) external;

    // ---- Contributions (ERC §C.6) ----

    /// @notice Contribute free balance into a commitment's encumbered position. The committer
    ///         opts in by being the first contributor; external contributions are accepted after.
    function contributeEncumbered(uint256 commitmentId, uint256 units) external;

    // ---- Views ----

    function getCommitment(uint256 commitmentId) external view returns (Commitment memory);
    function getForfeitProposal(uint256 commitmentId) external view returns (ForfeitProposal memory);

    /// @notice Commitment pair of an agreement ([0, 0] if unknown).
    function getAgreementPair(uint256 agreementId) external view returns (uint256, uint256);

    /// @notice The agreement a commitment belongs to (0 = not agreed).
    function agreementOf(uint256 commitmentId) external view returns (uint256);

    /// @notice The agreement a proposal produced (0 = never accepted). Reverse of the accept-time
    ///         link, so a proposer or indexer can map `proposalId → agreementId` in one read.
    function agreementOfProposal(uint256 proposalId) external view returns (uint256);
    function getUserExposure(address token, address user) external view returns (UserExposure memory);
    function strategiesOf(uint256 commitmentId) external view returns (address[] memory);
    function unbondInitiatedAt(uint256 commitmentId) external view returns (uint64);
    function getUserCommitmentIds(address user) external view returns (uint256[] memory);

    /// @notice Close timestamp of a commitment (0 = still active). `getCommitment().amount` is
    ///         zeroed at close, so this is the only surviving on-chain signal that a commitment
    ///         ever existed and when it settled.
    function closedAt(uint256 commitmentId) external view returns (uint64);

    /// @notice Units forfeited at `executeForfeit` (0 = never forfeited). Persisted so consumers
    ///         can reconstruct the forfeit magnitude after the commitment `amount` is zeroed.
    function forfeitedUnitsOf(uint256 commitmentId) external view returns (uint256);

    /// @notice Whether the commitment accepts third-party `contributeEncumbered` calls (ERC §C.6).
    function acceptsContributions(uint256 commitmentId) external view returns (bool);

    // =========================================================================
    // Part D — Strategy entry points
    // =========================================================================

    /// @notice Permissionlessly advance one bound strategy's accrual. Reverts bubble (ERC §D.3).
    function distribute(uint256 commitmentId, address strategy) external;

    /// @notice Convenience fold of `distribute` over `strategiesOf(id)` in array order.
    function distributeAll(uint256 commitmentId) external;

    /// @notice Strategy-mediated claim. Remains available after the commitment closes so parked
    ///         accrual is recoverable (ERC §D.3).
    function claim(uint256 commitmentId, address strategy, bytes calldata claimData) external;

    /// @notice Distribute one strategy's accrual then claim it, atomically. Resolves the ordering
    ///         footgun where `pending()` shows live accrual but `claim()` pays only banked accrual.
    function distributeAndClaim(uint256 commitmentId, address strategy, bytes calldata claimData) external;

    /// @notice Pending amount claimable via `claim` for the caller-implied recipient.
    function pending(uint256 commitmentId, address strategy, bytes calldata claimData) external view returns (uint256);

    /// @notice Permissionless re-drive of a failed lifecycle hook under the same guarded
    ///         semantics (ERC §D.6).
    function sweepFailedHook(uint256 commitmentId, address strategy) external;

    /// @notice Per-hook gas cap for guarded lifecycle hooks (≥ HOOK_GAS_CAP floor).
    function hookGasCap() external view returns (uint64);

    // =========================================================================
    // Agreements (extension)
    // =========================================================================

    function proposeAgreement(AgreementParams calldata params) external returns (uint256 proposalId);

    /// @notice Accept a proposal, minting the two linked commitments.
    /// @return agreementId The new agreement id.
    /// @return commitmentIdA The proposer's leg.
    /// @return commitmentIdB The acceptor's leg. Returning the pair here saves callers a follow-up
    ///         `getAgreementPair` round-trip.
    function acceptAgreement(uint256 proposalId)
        external
        returns (uint256 agreementId, uint256 commitmentIdA, uint256 commitmentIdB);

    function cancelAgreementProposal(uint256 proposalId) external;

    /// @notice Initiate forfeit on both legs atomically (shared-arbiter-only), each at `penaltyBps`.
    /// @param penaltyBps Penalty applied to both legs; MUST be ≤ each unresolved leg's `maxPenaltyBps`
    ///        (the two legs MAY carry different maxima, so the tighter ceiling binds). Pass a value
    ///        ≤ the smaller of the two legs' `maxPenaltyBps` for a full forfeit.
    function forfeitAgreement(uint256 agreementId, uint16 penaltyBps) external;

    function releaseAgreement(uint256 agreementId) external;
    function requestAgreementUnbond(uint256 agreementId) external;

    /// @notice Arbiter-instructed value flow between the two parties of an agreement, bounded
    ///         by per-direction lifetime caps. Manager-internal encumbered transfer.
    function settleAgreement(uint256 agreementId, bool fromProposer, uint256 units, bytes32 evidenceHash) external;

    function getAgreementSettlement(uint256 agreementId)
        external
        view
        returns (uint128 maxPToA, uint128 maxAToP, uint128 cumulPToA, uint128 cumulAToP);

    // =========================================================================
    // Shared-loss mutuals (Mutual extension, ERC-COMMITMENTS-MUTUALS)
    // =========================================================================

    /// @notice Create a Mutual. Starts inactive; members can only join once its arbiter
    ///         activates it. Every member posts the mutual's `numeraire` token and
    ///         `creditedValue == E_i` by construction (oracle-free).
    function createMutual(MutualParams calldata params) external returns (uint256 mutualId);

    /// @notice Flip an inactive mutual active (arbiter only; no creator is stored). No joins and no
    ///         losses until active.
    function activateMutual(uint256 mutualId) external;

    /// @notice Create a fresh commitment and join it to `mutualId` atomically, freezing its weight
    ///         `creditedValue == E_i`. `params.token` must be the mutual's numeraire. Reverts
    ///         `MutualExhausted` once Lambda is at its cap (1e18).
    function joinMutual(uint256 mutualId, CommitmentParams calldata params) external returns (uint256 commitmentId);

    /// @notice Phase 1 (mutual arbiter only): declare a loss `lossNumeraire`, starting the mutual
    ///         challenge window. Freezes joins/exits/releases until resolved.
    function initiateMutualLoss(uint256 mutualId, uint256 lossNumeraire, bytes32 evidenceHash) external;

    /// @notice Phase 2 (anyone, after the window): bump Lambda once by the clamped loss fraction.
    function executeMutualLoss(uint256 mutualId) external;

    /// @notice Mutual arbiter cancel of a pending loss declaration.
    function cancelMutualLoss(uint256 mutualId) external;

    /// @notice Permissionless force-cancel of a stale loss declaration after its TTL.
    function cancelStaleMutualLoss(uint256 mutualId) external;

    /// @notice Permissionless, lazy: settle one member's accrued share of the shared loss. K
    ///         deferred losses collapse into one O(1) settle (reads current Lambda).
    function settleMemberLoss(uint256 commitmentId) external;

    /// @notice Bounded batch convenience over `settleMemberLoss`.
    function settleMembers(uint256[] calldata commitmentIds) external;

    /// @notice Member-only: start the deallocation window. The line stays in `totalShares` and
    ///         mutual-slashable until the window elapses (pre-declaration escape defense). On a
    ///         lapsed request this starts a fresh one; on one that has not lapsed it reverts
    ///         `UnbondAlreadyRequested`.
    function requestMutualExit(uint256 commitmentId) external;

    /// @notice Release a mutual member once fully settled and inside its exit window:
    ///         `deallocationWindow <= elapsed < 2 * deallocationWindow` (pause-adjusted). At or past
    ///         the end it reverts `ExitRequestLapsed`. A pending loss still blocks release, so a
    ///         request can lapse while a loss is pending. Returns the residual encumbrance to the
    ///         committer's free balance.
    function releaseMutualMember(uint256 commitmentId) external;

    // ---- Premium index (reward side, Mutuals premium) ----

    /// @notice Policyholder-funded premium: pull `amount` of the mutual's numeraire (measured-receipt,
    ///         fee-on-transfer safe) and (re)start a Synthetix stream over `duration` seconds. The
    ///         core is pricing-agnostic — it only sets a future rate under the funding-time solvency
    ///         guard (INV-P2). Reverts `NoActiveCover` when there is no live cover to distribute to,
    ///         `StreamDurationOutOfBounds` when `duration` is outside [1 minutes, 365 days] (or the
    ///         uint64 deadline would overflow), `PremiumRateDecreased` when a live stream's rate
    ///         would drop (permissionless funding may only maintain or raise the rate), and
    ///         `MutualExhausted` once Lambda is at its cap. While a stream is live its end never moves
    ///         earlier: the new end is `max(periodFinish, now + duration)` and premium plus leftover
    ///         is spread over the time to it.
    function fundMutualPremium(uint256 mutualId, uint256 amount, uint64 duration) external;

    /// @notice Permissionless: bank-and-pay a member's accrued premium to its committer (CEI-strict).
    function claimMemberPremium(uint256 commitmentId) external;

    /// @notice Bounded batch convenience over `claimMemberPremium`.
    function claimMembersPremium(uint256[] calldata commitmentIds) external;

    /// @notice Policyholder-of-record reclaims the unstreamed premium remainder and halts the stream.
    function reclaimPremium(uint256 mutualId) external;

    /// @notice Convenience: `settleMemberLoss` then `claimMemberPremium` for one member under a
    ///         single reentrancy guard — two INDEPENDENT CEI passes with zero shared accounting.
    function settleAndClaim(uint256 commitmentId) external;

    // ---- Mutual views ----

    /// @notice Premium-side state of a mutual, for periphery/indexer read surfaces.
    /// @return premiumPerShareStored Pi (1e27)
    /// @return activeCover live deliverable-cover denominator
    /// @return settledTotal Σ settledUnits (activeCover == totalShares − settledTotal)
    /// @return rewardRate numeraire/second
    /// @return lastUpdate last poke time
    /// @return periodFinish stream end
    /// @return premiumRemainder carried dust
    /// @return bankedTotal Σ unclaimed rewardBank
    /// @return premiumPool reserve (`funded − claimed`)
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

    /// @notice Premium currently claimable by `commitmentId` if claimed now (banked + simulated accrual).
    function pendingMemberPremium(uint256 commitmentId) external view returns (uint256 claimable);

    function getMutual(uint256 mutualId) external view returns (Mutual memory);
    function getMembership(uint256 commitmentId) external view returns (Membership memory);
    function getMutualLossProposal(uint256 mutualId) external view returns (MutualLossProposal memory);
    /// @notice Raw units `commitmentId` currently owes to the beneficiary if settled now.
    function pendingMemberLoss(uint256 commitmentId) external view returns (uint256 owedUnits);

    // =========================================================================
    // Relayer / batch (ERC §C.8, non-normative surface with canonical typehash)
    // =========================================================================

    function createCommitmentFor(
        address committer,
        CommitmentParams calldata params,
        uint256 deadline,
        uint256 nonce,
        bytes calldata sig
    ) external returns (uint256 commitmentId);

    function batchCreateCommitments(CommitmentParams[] calldata params)
        external
        returns (uint256[] memory commitmentIds);

    function batchReleaseCommitments(uint256[] calldata commitmentIds) external;

    function nonces(address committer) external view returns (uint256);

    /// @notice Revoke outstanding `createCommitmentFor` authorizations by bumping the caller's nonce.
    /// @return newNonce The caller's relayer nonce after the bump.
    function invalidateCreateAuthorization() external returns (uint256 newNonce);
}
