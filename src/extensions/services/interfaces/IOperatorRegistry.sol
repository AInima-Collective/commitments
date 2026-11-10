// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

/// @title IOperatorRegistry
/// @notice Interface for the OperatorRegistry — a operator directory
///         backed by committed stake. Implements IServiceManager-compatible views.
interface IOperatorRegistry {
    // =========================================================================
    // Structs
    // =========================================================================

    /// @notice Operator record tracking registration, stake, and performance metrics.
    /// @dev Field order is packing-sensitive: `operator` (160) + `registeredAt` (64) +
    ///      `active` (8) + `belowMinStake` (8) = 240 bits share slot 0. The struct fits in
    ///      4 storage slots (0: address+flags, 1: selfStakeCommitmentId, 2: totalDelegatedStake,
    ///      3: activeDelegationCount + selfStakeActive). `selfStakeActive` is an append-only
    ///      addition that packs into slot 3 with `activeDelegationCount` — records
    ///      written pre-upgrade read it as false ("self-stake not known live"), which
    ///      conservatively requires all tracked commitments to close before deregistering.
    struct Operator {
        address operator;
        uint64 registeredAt;
        bool active;
        bool belowMinStake; // flagged when totalDelegatedStake drops below minOperatorStake
        uint256 selfStakeCommitmentId;
        uint256 totalDelegatedStake; // self + delegated stake in required-token units
        uint32 activeDelegationCount; // number of active delegations including self-stake
        bool selfStakeActive; // true while the self-stake commitment is still tracked
    }

    /// @notice Mutable metadata sidecar for an operator.
    /// @dev Stored in a mapping(address => OperatorMetadata) separate from the hot-path Operator record,
    ///      so setOperatorMetadata does not touch storage slots read by isOperator/getOperatorStake/getOperatorSet.
    struct OperatorMetadata {
        string uri;
        bytes32 contentHash;
        uint64 updatedAt; // block.timestamp of last setOperatorMetadata call; 0 = never set
    }

    // =========================================================================
    // Events
    // =========================================================================

    event OperatorRegistered(address indexed operator, uint256 commitmentId, uint256 stake);
    event OperatorDeregistered(address indexed operator);
    /// @dev `commitmentId` is indexed (free topic slot) so a client can filter the full
    ///      create/release/forfeit lifecycle of a single delegation commitment by its id.
    event DelegationCreated(
        address indexed staker, address indexed operator, uint256 indexed commitmentId, uint256 amount
    );
    event DelegationReleased(
        address indexed staker, address indexed operator, uint256 indexed commitmentId, uint256 amount
    );
    event DelegationForfeited(
        address indexed staker, address indexed operator, uint256 indexed commitmentId, uint256 forfeitedAmount
    );
    event OperatorBelowMinStake(address indexed operator, uint256 currentStake, uint256 minStake);
    /// @notice Emitted whenever an operator writes or updates their metadata.
    event OperatorMetadataUpdated(address indexed operator, string uri, bytes32 contentHash, uint64 timestamp);
    /// @notice Emitted when admin raises the minMaxPenaltyBps floor. Arbiter is
    ///         immutable, so there is no ArbiterChanged event.
    event AcceptancePolicyTightened(uint16 oldFloor, uint16 newFloor);
    /// @notice Emitted on `onDelegationForfeited` so monitors can detect forfeited
    ///         delegations whose proceeds land as a free-balance credit to the
    ///         registry inside the manager and would otherwise be stranded.
    ///         The backing token is readable via
    ///         `manager.getCommitment(commitmentId).token`.
    event ForfeitRecipientPending(address indexed operator, uint256 indexed commitmentId, uint256 forfeitedAmount);
    /// @notice Emitted when admin sweeps forfeit proceeds from the registry's
    ///         manager free balance to a treasury payout address.
    event ForfeitRecipientSwept(address indexed token, address indexed payTo, uint256 amount);
    /// @notice Emitted when the mesh pipeline is wired (TokenWeighting sink + MeshFactory).
    ///         One-time; thereafter register/delegate auto-credit mesh voting power and
    ///         release/forfeit/deregister auto-decrement it.
    event MeshWired(address indexed tokenWeighting, address indexed meshFactory);
    /// @notice Emitted when a per-operator FanIn node is deployed for an operator.
    event OperatorFanInDeployed(address indexed operator, address indexed fanIn, bytes32 stakeDenom);
    /// @notice Emitted when a signer bumps their EIP-712 nonce via `increaseNonce`,
    ///         invalidating any outstanding `registerWithSig`/`delegateWithSig`
    ///         signature that carried the previous nonce.
    /// @param account The signer whose nonce advanced.
    /// @param newNonce The signer's nonce after the bump (all prior nonces are now spent).
    event NonceIncreased(address indexed account, uint256 newNonce);
    /// @notice Emitted when the admin adds or removes a distribution strategy from the
    ///         register/delegate safe-strategy allow-list. Only allow-listed
    ///         strategies may be bound to a registration/delegation commitment.
    /// @param strategy The distribution strategy toggled.
    /// @param allowed True if the strategy is now bindable on register/delegate commitments.
    event StrategyAllowlistUpdated(address indexed strategy, bool allowed);
    /// @notice Emitted whenever an operator's aggregate `totalDelegatedStake` is checkpointed
    ///         into the timestamped `stakeAt` trace — on register, delegate, release, and
    ///         forfeit. Indexers can reconstruct the full stake history from this
    ///         event alone. Multiple mutations in the same block collapse to a single checkpoint
    ///         (the last emit for that timestamp carries the final value).
    /// @param operator The operator whose stake was checkpointed.
    /// @param timestamp The `block.timestamp` key of the checkpoint (matches the `stakeAt` axis).
    /// @param newStake The operator's aggregate stake AFTER the mutation, in required-token units.
    event StakeCheckpointed(address indexed operator, uint64 indexed timestamp, uint256 newStake);

    // =========================================================================
    // Errors
    // =========================================================================

    error AlreadyRegistered();
    error NotRegistered();
    error InsufficientStake(uint256 provided, uint256 minimum);
    error MaxDelegationsExceeded(uint256 current, uint256 max);
    error UnauthorizedCaller();
    error NotCommitmentOwner();
    error WrongCounterparty();
    error ActiveDelegationsExist();
    error CommitmentAlreadyDelegated();
    /// @notice Thrown when metadata URI exceeds the length cap.
    error URITooLong();
    /// @notice Thrown when a non-operator or inactive operator calls setOperatorMetadata.
    error OperatorNotActive();
    /// @notice Thrown when register/delegate is called with a commitment whose arbiter
    ///         does not match the registry's required arbiter.
    error WrongArbiter(address expected, address actual);
    /// @notice Thrown when a commitment's maxPenaltyBps is below the registry's floor.
    error PenaltyTooLow(uint16 minRequired, uint16 actual);
    /// @notice Thrown when tightenPolicy is called with a value <= the current floor.
    error PolicyNotTightening(uint16 currentFloor, uint16 attempted);
    /// @notice Thrown when a zero address is supplied where a non-zero arbiter is required.
    error ZeroArbiter();
    /// @notice Thrown when a penalty bps value exceeds 10_000 (100%).
    error PenaltyExceedsMax();
    /// @notice payout address must be non-zero.
    error ZeroPayoutAddress();
    /// @notice Thrown when a zero address is supplied where a non-zero token is required.
    error ZeroToken();
    /// @notice Thrown when a commitment's backing token does not match the
    ///         registry's required token.
    error WrongToken(address expected, address actual);
    /// @notice A register/delegate commitment binds a distribution strategy that is not on
    ///         the admin's safe-strategy allow-list. Unvetted strategy movements can shrink
    ///         `c.amount` under the registry's accounting, leaving phantom totalDelegatedStake;
    ///         only allow-listed (non-draining) strategies are accepted. Also thrown, with an
    ///         empty allow-list, for any bound strategy — the default reject-all behavior.
    error StrategiesNotAllowed();
    /// @notice `setStrategyAllowed` called with the zero address.
    error ZeroStrategy();
    /// @notice setMeshWiring called more than once. The mesh pipeline is immutable
    ///         once wired — rerouting it is a trust transition that warrants a redeploy.
    error MeshAlreadyWired();
    /// @notice setMeshWiring called with a zero TokenWeighting or MeshFactory.
    error ZeroMeshAddress();
    /// @notice register/delegate called while this registry is not the manager's wired
    ///         operator registry (`manager.operatorRegistry() != address(this)`). An
    ///         unwired registry never receives the release/forfeit hooks, so accepting
    ///         stake here would mint phantom, unbacked voting power.
    /// @param wiredRegistry The registry the manager currently notifies (may be address(0)).
    error RegistryNotWired(address wiredRegistry);
    /// @notice A `registerWithSig`/`delegateWithSig` call arrived after its `deadline`.
    error SignatureExpired();
    /// @notice The `nonce` in a signed register/delegate intent does not match the signer's
    ///         current on-chain nonce — replay protection.
    error InvalidNonce();
    /// @notice The supplied signature did not recover to (or validate for, EIP-1271) the
    ///         claimed signer over the EIP-712 register/delegate digest.
    error InvalidSignature();
    /// @notice An account attempted to register and deregister within the same block. A
    ///         same-block cooldown blocks register⇄deregister flip griefing.
    error SameBlockToggle();
    /// @notice A stake checkpoint value exceeded `uint192`. Practically unreachable
    ///         for any real ERC-20's raw units (uint192 max ≈ 6.3e57); the guard exists so a
    ///         checkpoint reverts rather than silently truncating and corrupting `stakeAt`.
    error StakeCheckpointOverflow();
    /// @notice `reconcile` was called for a commitment that is not routed to this registry.
    error CommitmentNotTracked();
    /// @notice `reconcile` was called for a commitment that is still open in the manager.
    error CommitmentStillOpen();

    // =========================================================================
    // Registration
    // =========================================================================

    /// @notice Register as an operator using a pre-created commitment.
    /// @dev Operator must first call CommitmentManager.createCommitment with counterparty = this registry.
    ///      Then call register() with the resulting commitmentId to complete registration.
    ///      Verifies: committer == msg.sender, counterparty == address(this), amount >= minOperatorStake.
    /// @param commitmentId ID of the pre-created commitment (counterparty must be this registry).
    function register(uint256 commitmentId) external;

    /// @notice Deregister as an operator.
    /// @dev Operator must have no active delegations beyond their own self-stake commitment.
    function deregister() external;

    // =========================================================================
    // Delegation
    // =========================================================================

    /// @notice Delegate stake to an operator using a pre-created commitment.
    /// @dev Staker must first call CommitmentManager.createCommitment with counterparty = this registry.
    ///      Then call delegate(operator, commitmentId) to register the delegation.
    /// @param operator The operator to delegate to.
    /// @param commitmentId ID of the pre-created commitment (counterparty must be this registry).
    function delegate(address operator, uint256 commitmentId) external;

    // =========================================================================
    // EIP-712 signature-delegated register / delegate
    // =========================================================================

    /// @notice Register `operator` as an operator using an EIP-712 signature, letting a relayer
    ///         submit the operator's signed intent. Signature auth replaces *who submits* — the
    ///         commitment still IS the stake and every acceptance-policy check is identical to the
    ///         direct `register` path (`operator` must be the commitment's committer).
    /// @dev The digest is over `Register(address operator,uint256 commitmentId,uint256 nonce,
    ///      uint256 deadline)`. Verified with `SignatureChecker.isValidSignatureNow`, so both EOAs
    ///      and EIP-1271 contract signers are accepted. Replay-protected by the per-signer nonce;
    ///      reverts once `block.timestamp > deadline`. A same-block register/deregister cooldown
    ///      applies (see `SameBlockToggle`).
    /// @param operator The operator to register; MUST be the commitment's committer and the signer.
    /// @param commitmentId ID of the pre-created commitment (counterparty must be this registry).
    /// @param deadline Unix timestamp after which the signature is no longer valid.
    /// @param nonce The signer's current nonce (see `sigNonces`); consumed on success.
    /// @param signature EIP-712 signature by `operator` (ECDSA or EIP-1271).
    function registerWithSig(
        address operator,
        uint256 commitmentId,
        uint256 deadline,
        uint256 nonce,
        bytes calldata signature
    ) external;

    /// @notice Delegate `staker`'s stake to `operator` using an EIP-712 signature, letting a
    ///         relayer submit the staker's signed intent. Acceptance-policy behavior is identical
    ///         to the direct `delegate` path (`staker` must be the commitment's committer).
    /// @dev The digest is over `Delegate(address staker,address operator,uint256 commitmentId,
    ///      uint256 nonce,uint256 deadline)`. Verified with `SignatureChecker.isValidSignatureNow`
    ///      (EOA or EIP-1271). Replay-protected by the per-signer nonce; reverts past `deadline`.
    /// @param staker The delegator; MUST be the commitment's committer and the signer.
    /// @param operator The operator to delegate to.
    /// @param commitmentId ID of the pre-created commitment (counterparty must be this registry).
    /// @param deadline Unix timestamp after which the signature is no longer valid.
    /// @param nonce The signer's current nonce (see `sigNonces`); consumed on success.
    /// @param signature EIP-712 signature by `staker` (ECDSA or EIP-1271).
    function delegateWithSig(
        address staker,
        address operator,
        uint256 commitmentId,
        uint256 deadline,
        uint256 nonce,
        bytes calldata signature
    ) external;

    /// @notice Bump the caller's EIP-712 nonce, invalidating any outstanding
    ///         `registerWithSig`/`delegateWithSig` signature that carried the previous nonce.
    /// @dev The escape hatch for a signer who wants to revoke an intent before a relayer submits
    ///      it. Emits `NonceIncreased`.
    function increaseNonce() external;

    /// @notice The current EIP-712 nonce for `account`, consumed by the signed register/delegate
    ///         paths. A valid signature must carry exactly this value.
    /// @param account The signer to query.
    /// @return The signer's current nonce.
    function sigNonces(address account) external view returns (uint256);

    // =========================================================================
    // IServiceManager-compatible views
    // =========================================================================

    /// @notice Returns the total stake (self + delegated) for an operator in required-token units.
    function getOperatorStake(address operator) external view returns (uint256);

    /// @notice Returns an operator's aggregate `totalDelegatedStake` as of a past `timestamp`,
    ///         read from the timestamped checkpoint trace. Lets an arbiter adjudicating
    ///         an offense at time T, epoch/snapshot rewards, or a dispute read stake-at-offense
    ///         on-chain rather than only the live value.
    /// @dev A checkpoint is pushed on every stake mutation (register/delegate/release/forfeit).
    ///      This is a SEPARATE, `block.timestamp`-keyed path from TokenWeighting's block-number
    ///      OZ Checkpoints (governance votes) and from the per-commitment `registeredAmount` freeze
    ///      (which snapshots one commitment's credited amount for exact hook decrements). Semantics:
    ///      returns 0 for a `timestamp` before the first checkpoint (or an operator that never
    ///      staked); the checkpoint value exactly on a boundary; and the latest value for a
    ///      `timestamp` at/after the last checkpoint.
    /// @param operator The operator to query.
    /// @param timestamp The historical Unix timestamp to read stake as-of.
    /// @param hint A checkpoint index guess for an O(1) answer. If it covers `timestamp` the read
    ///        is O(1); otherwise the call falls back to a bounded binary search. TRUSTLESS — a
    ///        wrong/empty/out-of-range hint only costs gas, never correctness: both paths return
    ///        the identical historically-correct value.
    /// @return The operator's `totalDelegatedStake` in required-token units as of `timestamp`.
    function stakeAt(address operator, uint64 timestamp, uint256 hint) external view returns (uint256);

    /// @notice Returns whether an address is a registered, active operator.
    function isOperator(address operator) external view returns (bool);

    /// @notice Returns all active operator addresses.
    /// @dev Gas-bounded by min stake requirement; practically bounded.
    function getOperatorSet() external view returns (address[] memory);

    // =========================================================================
    // Query
    // =========================================================================

    /// @notice Returns full operator struct with all performance metrics.
    function getOperator(address operator) external view returns (Operator memory);

    /// @notice Returns total count of registered active operators.
    function getOperatorCount() external view returns (uint256);

    /// @notice Number of registration/delegation commitments this registry currently tracks
    ///         (ids with live hook routing). The manager consults this before re-pointing its
    ///         single operator-registry hook slot so live delegations are never silently
    ///         orphaned.
    function trackedCommitmentCount() external view returns (uint256);

    // =========================================================================
    // Hooks from CommitmentManager
    // =========================================================================

    /// @notice Called by CommitmentManager when a delegation commitment is released.
    /// @dev Only callable by the authorized commitmentManager.
    /// @param commitmentId The released commitment.
    /// @param amount Backing-token units released.
    function onDelegationReleased(uint256 commitmentId, uint256 amount) external;

    /// @notice Called by CommitmentManager when a delegation commitment is forfeited.
    /// @dev Only callable by the authorized commitmentManager.
    /// @param commitmentId The forfeited commitment.
    /// @param forfeitedAmount Backing-token units forfeited (penalty portion).
    /// @param fullAmount Full commitment amount (for proper totalDelegatedStake accounting).
    function onDelegationForfeited(uint256 commitmentId, uint256 forfeitedAmount, uint256 fullAmount) external;

    /// @notice Close a routed commitment whose release or forfeit hook failed in the manager.
    /// @dev Permissionless. Runs the same close path as the hooks when the commitment is still
    ///      routed here but the manager shows it released or forfeited, and emits the matching
    ///      `DelegationReleased` or `DelegationForfeited`. Reverts `CommitmentNotTracked` when it
    ///      is not routed here and `CommitmentStillOpen` when it is still open in the manager.
    /// @param commitmentId The commitment to reconcile.
    function reconcile(uint256 commitmentId) external;

    // =========================================================================
    // Config views
    // =========================================================================

    /// @notice Returns the minimum required-token units required to register as an operator.
    function minOperatorStake() external view returns (uint256);

    /// @notice Returns the maximum number of delegations an operator can accept.
    function maxDelegationsPerOperator() external view returns (uint256);

    /// @notice Returns the address of the wired CommitmentManager.
    function commitmentManager() external view returns (address);

    // =========================================================================
    // Mesh wiring
    // =========================================================================

    /// @notice Wire this registry into the mesh so register/delegate automatically
    ///         credit per-operator voting power through a per-operator FanIn into the
    ///         TokenWeighting sink, and release/forfeit/deregister automatically
    ///         decrement it. DEFAULT_ADMIN_ROLE only; callable once.
    /// @dev The registry must be the TokenWeighting `provider` and the per-operator
    ///      FanIn `manager`. The single stake denom is derived from `requiredToken`
    ///      (`bytes32(uint160(requiredToken))`), enforcing one-token↔one-denom: a unit
    ///      of this registry's encumbered capital can only ever contribute to this one
    ///      denom's voting power.
    /// @param tokenWeighting The TokenWeighting sink (its provider must be this registry).
    /// @param meshFactory The MeshFactory used to clone per-operator FanIn nodes.
    function setMeshWiring(address tokenWeighting, address meshFactory) external;

    /// @notice The TokenWeighting sink this registry feeds (address(0) if unwired).
    function tokenWeighting() external view returns (address);

    /// @notice The single mesh stake denom this registry credits, derived from
    ///         `requiredToken`. Injective per token → one-token↔one-denom.
    function stakeDenom() external view returns (bytes32);

    /// @notice The per-operator FanIn node for an operator (address(0) if none yet).
    function operatorFanIn(address operator) external view returns (address);

    // =========================================================================
    // Acceptance Policy
    // =========================================================================

    /// @notice Returns the registry's commitment-acceptance policy.
    /// @return arbiter The required arbiter — `commitment.arbiter` must equal this for register/delegate to succeed. Immutable post-init.
    /// @return minMaxPenaltyBps The required floor on `commitment.maxPenaltyBps`. Tightenable by admin (raise-only).
    /// @return requiredToken The required backing token — `commitment.token` must equal this. Immutable post-init.
    function getAcceptancePolicy()
        external
        view
        returns (address arbiter, uint16 minMaxPenaltyBps, address requiredToken);

    /// @notice Raise the `minMaxPenaltyBps` floor. Forward-looking only — does not
    ///         retroactively reject previously-registered operators.
    /// @dev Only DEFAULT_ADMIN_ROLE may call. Reverts if `newFloor <= current` or `newFloor > 10_000`.
    /// @param newFloor New minimum penalty bps. Must be strictly greater than current.
    function tightenPolicy(uint16 newFloor) external;

    /// @notice Add or remove a distribution strategy from the register/delegate safe-strategy
    ///         allow-list. Only allow-listed strategies may be bound to a registration or
    ///         delegation commitment; an empty allow-list rejects all strategies.
    /// @dev DEFAULT_ADMIN_ROLE only. Admins MUST only allow-list non-draining (self-custody)
    ///      strategies — one that emits `FromEncumbered*` movements would shrink the committed
    ///      stake and leave phantom voting power. The shipped
    ///      `OperatorCommissionCoupon` is such a safe strategy. Emits `StrategyAllowlistUpdated`.
    /// @param strategy The distribution strategy to toggle. Must be non-zero.
    /// @param allowed True to permit binding it on register/delegate commitments; false to remove.
    function setStrategyAllowed(address strategy, bool allowed) external;

    /// @notice Whether `strategy` is on the register/delegate safe-strategy allow-list.
    /// @param strategy The distribution strategy to query.
    /// @return True if allow-listed and therefore bindable on register/delegate commitments.
    function isStrategyAllowed(address strategy) external view returns (bool);

    /// @notice The operator a tracked register/delegate commitment routes to, or `address(0)`
    ///         if the commitment is not (or is no longer) a tracked delegation.
    /// @dev Cleared when the commitment is released/forfeited. A commission strategy should
    ///      latch this value while the delegation is active (see `OperatorCommissionCoupon`).
    /// @param commitmentId The commitment to resolve.
    /// @return The operator address, or `address(0)`.
    function operatorForCommitment(uint256 commitmentId) external view returns (address);

    // =========================================================================
    // Operator Metadata
    // =========================================================================

    /// @notice Set or update the caller's operator metadata.
    /// @dev Only active registered operators may call. Emits OperatorMetadataUpdated.
    ///      Reverts with URITooLong if uri length exceeds the protocol cap (512 bytes).
    /// @param uri Metadata URI (may be empty string for "no URI").
    /// @param contentHash keccak256 of canonical content; 0x0 = "no hash".
    function setOperatorMetadata(string calldata uri, bytes32 contentHash) external;

    /// @notice Read an operator's current metadata sidecar.
    /// @dev Returns zero struct if never set.
    /// @param operator The operator to query.
    /// @return Current OperatorMetadata (uri, contentHash, updatedAt).
    function getOperatorMetadata(address operator) external view returns (OperatorMetadata memory);

    // =========================================================================
    // Forfeit recipient sweep
    // =========================================================================

    /// @notice Sweep forfeit proceeds credited to the registry's free balance in
    ///         the manager into a treasury payout address.
    /// @dev DEFAULT_ADMIN_ROLE only. Forfeit payouts are pull-payment credits to
    ///      the counterparty's FREE balance inside the manager; without this
    ///      entry point proceeds where the registry is the counterparty would
    ///      be stranded. Calls `manager.withdraw(token, amount)` and forwards.
    /// @param token Backing token to sweep.
    /// @param amount Units to withdraw from the registry's manager free balance.
    /// @param payTo Destination for the swept tokens.
    function sweepForfeitProceeds(address token, uint256 amount, address payTo) external;
}
