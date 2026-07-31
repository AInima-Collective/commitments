// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {EnumerableSet} from "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";

import {IFanOut, UserInfo, Outflow, FanOutLien} from "src/extensions/mesh/interfaces/IFanOut.sol";
import {
    IFlowQuery,
    ProviderInfo,
    ConsumerInfo,
    StakeInfo,
    AvailableDenom,
    FlowNodeTypes
} from "src/extensions/mesh/interfaces/IFlowQuery.sol";
import {IFlowQueryPath, DenomLink} from "src/extensions/mesh/interfaces/IFlowQueryPath.sol";
import {FlowPathLib} from "src/extensions/mesh/libraries/FlowPathLib.sol";
import {IEntity} from "src/shared/interfaces/IEntity.sol";

/// @title FanOutNode
/// @notice Distributes one provider's committed stake to multiple consumers via configurable outflows.
///         Enforces the exposure allocation invariant: totalForfeitable <= locked * inputMaxPenaltyBps / 10_000.
///         Implements pull-based reward accumulator (Synthetix/Compound per-share pattern).
///         Implements IFlowQuery for topology discovery and IFlowQueryPath for
///         single-call provenance walks.
contract FanOutNode is IFanOut, IFlowQueryPath, IEntity, ReentrancyGuard {
    /// @notice `IEntity` type id: `keccak256("commitments.mesh.fan_out")`. Self-verifies this
    ///         implementation when `MeshFactory` whitelists it.
    bytes32 internal constant FACTORY_TYPE_ID = keccak256("commitments.mesh.fan_out");

    /// @inheritdoc IEntity
    function factoryTypeId() external pure returns (bytes32) {
        return FACTORY_TYPE_ID;
    }

    /// @notice lock the implementation contract so direct
    ///         `initialize` on the impl reverts. Clones (via MeshFactory)
    ///         reset storage and so are unaffected.
    constructor() {
        _initialized = true;
    }

    using SafeERC20 for IERC20;
    using EnumerableSet for EnumerableSet.AddressSet;

    // ============================================================
    // CONSTANTS
    // ============================================================

    /// @dev Precision multiplier for reward per share accumulator
    uint256 private constant PRECISION = 1e18;

    /// @notice defensive cap on distinct reward tokens per stakeDenom.
    ///         Mirrors TokenWeighting; bounds iteration cost in stake/releaseStake.
    uint256 public constant MAX_REWARD_TOKENS = 32;

    /// @notice Max input-side penalty in basis points (0..10_000) — set per-node at init.
    /// @dev Represents the maxPenaltyBps the provider committed upstream. renamed
    ///      the input-side `maxPenaltyBps` (0..10_000) the provider committed upstream.
    uint16 public inputMaxPenaltyBps;

    // ============================================================
    // STORAGE
    // ============================================================

    /// @notice Tracks whether contract has been initialized (clone guard)
    bool private _initialized;

    /// @notice The single provider whose stake is being distributed
    address public provider;

    /// @notice Manager/owner — can do admin operations (currently none needed beyond init)
    address public manager;

    /// @notice staker -> denom -> UserInfo
    mapping(address => mapping(bytes32 => UserInfo)) internal _userInfo;

    /// @notice staker -> denom -> Outflow[]
    mapping(address => mapping(bytes32 => Outflow[])) internal _outflows;

    /// @notice staker -> denom -> consumer -> FanOutLien
    mapping(address => mapping(bytes32 => mapping(address => FanOutLien))) internal _liens;

    /// @notice Consumer enumeration for IFlowQuery
    address[] internal _consumers;

    /// @notice Whether an address is a known consumer (has been added via setOutflows)
    mapping(address => bool) internal _isKnownConsumer;

    /// @notice Reward accumulator: stakeDenom -> rewardToken -> accumulated per-share (scaled by PRECISION)
    mapping(bytes32 => mapping(address => uint256)) public rewardsPerShare;

    /// @notice Reward debt: staker -> stakeDenom -> rewardToken -> debt at last claim
    mapping(address => mapping(bytes32 => mapping(address => uint256))) public rewardDebt;

    /// @notice Total stake per denom (sum of all stakers' locked for this denom)
    mapping(bytes32 => uint256) public totalStake;

    /// @notice Denoms that have been staked (for IFlowQuery enumeration)
    bytes32[] internal _denomsStaked;

    /// @notice Whether a denom has been recorded in _denomsStaked
    mapping(bytes32 => bool) internal _isKnownDenom;

    /// @notice Reward tokens distributed for each stakeDenom (for debt updates on stake/release)
    mapping(bytes32 => EnumerableSet.AddressSet) internal _rewardTokens;

    /// @notice Pending rewards accumulated during releaseStake (claimed via claimRewards)
    mapping(address => mapping(bytes32 => mapping(address => uint256))) public pendingRewards;

    // ============================================================
    // CURATED ALLOCATION LAYER — TYPES
    // ============================================================

    /// @notice A provider-curated two-limit cap for a single consumer.
    /// @dev Effective cap at allocation time is
    ///      `min(absoluteLimit, pool * shareLimit / 1e18[, consumerCapacity])`.
    ///      This is exposure/allocation ALGEBRA only — no funds move. Liens remain
    ///      virtual claims over the manager-custodied capital.
    struct AllocationCap {
        uint256 absoluteLimit; // hard ceiling in stake units
        uint256 shareLimit; // fraction of the provider pool, 1e18-scaled (1e18 == 100%)
        uint16 maxPenaltyBps; // exposure penalty for this consumer's lien (0..10_000)
        bool set; // whether a cap has been configured for this consumer
    }

    /// @notice A consumer-published inflow ceiling for a denom.
    /// @dev `set == false` means "unbounded / no published ceiling". Once set, the
    ///      ceiling is MONOTONIC-DOWN through `decreaseLimit` (permissionless) and may
    ///      only be raised through `publishCapacity`.
    struct ConsumerCapacity {
        uint256 ceiling; // max inflow the consumer will accept for this denom
        bool set; // whether the consumer has published a capacity
    }

    // ============================================================
    // CURATED ALLOCATION LAYER — STORAGE (appended; sequential-layout safe for clones)
    // ============================================================

    /// @notice staker -> denom -> consumer -> AllocationCap (provider-curated caps)
    mapping(address => mapping(bytes32 => mapping(address => AllocationCap))) internal _caps;

    /// @notice staker -> denom -> priority-ordered consumer list (greedy-fill order)
    mapping(address => mapping(bytes32 => address[])) internal _priority;

    /// @notice staker -> denom -> consumer -> whether present in the priority list
    mapping(address => mapping(bytes32 => mapping(address => bool))) internal _inPriority;

    /// @notice consumer -> denom -> ConsumerCapacity (consumer-published inflow ceiling)
    mapping(address => mapping(bytes32 => ConsumerCapacity)) internal _capacity;

    // ============================================================
    // EVENTS
    // ============================================================

    event Initialized(address indexed provider, address indexed manager);
    event OutflowsSet(address indexed staker, bytes32 indexed denom, uint256 numConsumers);
    event Staked(address indexed staker, bytes32 indexed denom, uint256 amount);
    event StakeReleased(address indexed staker, bytes32 indexed denom, address indexed consumer, uint256 amount);
    event RewardsDistributed(bytes32 indexed stakeDenom, address indexed rewardToken, uint256 rewardAmount);
    event RewardsClaimed(
        address indexed staker, bytes32 indexed stakeDenom, address indexed rewardToken, uint256 amount
    );

    // --- Curated allocation layer ---

    /// @notice Emitted when the provider sets/updates a consumer's two-limit cap.
    event AllocationCapSet(
        address indexed staker,
        bytes32 indexed denom,
        address indexed consumer,
        uint256 absoluteLimit,
        uint256 shareLimit,
        uint16 maxPenaltyBps
    );

    /// @notice Emitted when the provider reorders the greedy-fill priority list.
    event PriorityReordered(address indexed staker, bytes32 indexed denom);

    /// @notice Emitted after a curated `allocate()` pass rebuilds the liens.
    /// @param allocated Total stake filled across all consumers this pass.
    /// @param unallocated Pool remainder left unbound (subject to no lien).
    event Allocated(address indexed staker, bytes32 indexed denom, uint256 allocated, uint256 unallocated);

    /// @notice Emitted when a consumer publishes/raises its inflow capacity for a denom.
    event CapacityPublished(address indexed consumer, bytes32 indexed denom, uint256 ceiling);

    /// @notice Emitted when a consumer ratchets its inflow capacity down (monotonic).
    event CapacityDecreased(address indexed consumer, bytes32 indexed denom, uint256 newCeiling);

    // ============================================================
    // ERRORS
    // ============================================================

    error AlreadyInitialized();
    error OnlyProvider();
    error OnlyRegisteredConsumer();
    error InvalidPortionSum();
    /// @notice setOutflows received the same consumer twice; duplicates would
    ///         collapse into one lien slot and desync totalForfeitable.
    error DuplicateConsumer();
    error ExposureAllocationExceeded();
    error InsufficientLien();
    error ZeroTotalStake();
    error ZeroAmount();
    error RewardTooSmall();
    /// @notice distributeRewards would push the per-denom token set above
    ///         MAX_REWARD_TOKENS. Bounds stake/release iteration cost.
    error RewardTokenLimit();

    // --- Curated allocation layer ---

    /// @notice `shareLimit` exceeds 1e18 (100% of the pool).
    error InvalidShareLimit();
    /// @notice A cap's `maxPenaltyBps` exceeds the node's `inputMaxPenaltyBps`.
    error PenaltyExceedsInput();
    /// @notice `reorderPriority` was not given an exact permutation of the current list.
    error NotAPermutation();
    /// @notice `publishCapacity` would lower the ceiling — use `decreaseLimit` instead.
    error CapacityNotIncreasing();
    /// @notice `decreaseLimit` did not strictly lower the existing ceiling.
    error LimitNotDecreasing();
    /// @notice Sentinel carrying the dry-run result of `deallocatable` (never persisted).
    error UnwindProbe(uint256 amount);

    // ============================================================
    // MODIFIERS
    // ============================================================

    modifier onlyProvider() {
        if (msg.sender != provider) revert OnlyProvider();
        _;
    }

    modifier onlyRegisteredConsumer() {
        if (!_isKnownConsumer[msg.sender]) revert OnlyRegisteredConsumer();
        _;
    }

    // ============================================================
    // INITIALIZE
    // ============================================================

    /// @inheritdoc IFanOut
    function initialize(address provider_, address manager_) external {
        if (_initialized) revert AlreadyInitialized();
        _initialized = true;
        provider = provider_;
        manager = manager_;
        // Default: no input penalty restriction (10_000 bps = 100% = no limit beyond outflow validation).
        inputMaxPenaltyBps = 10_000;
        emit Initialized(provider_, manager_);
    }

    /// @notice Initialize with a specific input max penalty in bps.
    /// @param provider_ The single provider address
    /// @param manager_ The manager/owner address
    /// @param inputMaxPenaltyBps_ The max penalty bps the provider committed to upstream (0..10_000)
    function initializeWithPenalty(address provider_, address manager_, uint16 inputMaxPenaltyBps_) external {
        if (_initialized) revert AlreadyInitialized();
        _initialized = true;
        provider = provider_;
        manager = manager_;
        inputMaxPenaltyBps = inputMaxPenaltyBps_;
        emit Initialized(provider_, manager_);
    }

    // ============================================================
    // OUTFLOW CONFIGURATION
    // ============================================================

    /// @inheritdoc IFanOut
    /// @dev the invariant on portionBps sum is `<= 10_000`,
    ///      not `== 10_000`. This relaxation is required because `releaseStake`
    ///      shrinks the matching outflow's portion proportionally so a subsequent
    ///      `stake()` cannot resurrect a previously-released lien. The provider
    ///      is free to leave a portion unallocated; any unallocated locked stake
    ///      is simply not subject to any consumer's lien.
    function setOutflows(bytes32 denom, Outflow[] calldata outflows) external nonReentrant onlyProvider {
        uint256 totalBps = 0;
        for (uint256 i = 0; i < outflows.length; i++) {
            totalBps += outflows[i].portionBps;
            // Reject duplicate consumers: the duplicates would share one lien slot in
            // `_liens` (last write wins) while both contribute to totalForfeitable,
            // desyncing the aggregate from the sum of stored liens.
            for (uint256 j = 0; j < i; j++) {
                if (outflows[j].consumer == outflows[i].consumer) revert DuplicateConsumer();
            }
        }
        if (totalBps > 10_000) revert InvalidPortionSum();

        // Get current locked amount
        UserInfo storage uInfo = _userInfo[msg.sender][denom];
        uint256 locked = uInfo.locked;

        // Compute new totalForfeitable and update liens
        uint256 newTotalForfeitable = 0;
        uint256 newMaxLien = 0;

        for (uint256 i = 0; i < outflows.length; i++) {
            Outflow calldata out = outflows[i];
            uint256 lienAmount = locked * out.portionBps / 10_000;
            uint256 exposure = lienAmount * out.maxPenaltyBps / 10_000; // bps
            newTotalForfeitable += exposure;
            if (lienAmount > newMaxLien) newMaxLien = lienAmount;

            // Track new consumers for enumeration
            if (!_isKnownConsumer[out.consumer]) {
                _isKnownConsumer[out.consumer] = true;
                _consumers.push(out.consumer);
            }
        }

        // Validate exposure allocation invariant
        _validateExposureAllocation(locked, newTotalForfeitable);

        // Update storage: clear old outflows and liens, store new ones
        _clearOutflowsAndLiens(msg.sender, denom);

        for (uint256 i = 0; i < outflows.length; i++) {
            Outflow calldata out = outflows[i];
            _outflows[msg.sender][denom].push(out);

            uint256 lienAmount = locked * out.portionBps / 10_000;
            uint256 exposure = lienAmount * out.maxPenaltyBps / 10_000; // bps
            _liens[msg.sender][denom][out.consumer] = FanOutLien({amount: lienAmount, exposure: exposure});
        }

        uInfo.totalForfeitable = newTotalForfeitable;
        uInfo.maxLien = newMaxLien;

        emit OutflowsSet(msg.sender, denom, outflows.length);
    }

    // ============================================================
    // STAKE
    // ============================================================

    /// @inheritdoc IFanOut
    function stake(bytes32 denom, uint256 amount) external nonReentrant onlyProvider {
        if (amount == 0) revert ZeroAmount();

        // Track denom for enumeration
        if (!_isKnownDenom[denom]) {
            _isKnownDenom[denom] = true;
            _denomsStaked.push(denom);
        }

        UserInfo storage uInfo = _userInfo[msg.sender][denom];
        uint256 oldLocked = uInfo.locked;
        uInfo.locked += amount;
        totalStake[denom] += amount;

        // bank-first pattern. Snapshot pending rewards
        // accrued on the OLD locked amount before resetting rewardDebt — otherwise
        // a top-up wipes existing unclaimed rewards. For first-time stakers oldLocked
        // is 0, so the bank step yields 0 (still preventing retroactive reward theft).
        uint256 tokenCount = _rewardTokens[denom].length();
        for (uint256 i = 0; i < tokenCount; i++) {
            address rt = _rewardTokens[denom].at(i);
            uint256 rps = rewardsPerShare[denom][rt];
            uint256 debt = rewardDebt[msg.sender][denom][rt];
            if (rps > debt) {
                pendingRewards[msg.sender][denom][rt] += oldLocked * (rps - debt) / PRECISION;
            }
            rewardDebt[msg.sender][denom][rt] = rps;
        }

        // Re-validate exposure allocation after locked changes
        // Only re-validate if outflows exist for this denom
        Outflow[] storage existingOutflows = _outflows[msg.sender][denom];
        if (existingOutflows.length > 0) {
            // Lien amounts are the source of truth — grow each lien additively
            // by the top-up's portion instead of recomputing `locked * portionBps` from
            // scratch. The old recompute silently rescaled EVERY consumer's absolute lien
            // to the current locked amount, so a release by consumer A (which shrinks
            // locked) followed by a 1-wei top-up eroded consumer B's lien, and the
            // stale-denominator portionBps written by releaseStake haircut the releasing
            // consumer's own lien. Additive growth allocates only the NEW stake, leaving
            // previously-established absolute liens intact.
            uint256 newTotalForfeitable = 0;
            uint256 newMaxLien = 0;

            for (uint256 i = 0; i < existingOutflows.length; i++) {
                Outflow storage out = existingOutflows[i];
                FanOutLien storage lien = _liens[msg.sender][denom][out.consumer];
                uint256 lienAmount = lien.amount + amount * out.portionBps / 10_000;
                uint256 exposure = lienAmount * out.maxPenaltyBps / 10_000; // bps
                newTotalForfeitable += exposure;
                if (lienAmount > newMaxLien) newMaxLien = lienAmount;

                lien.amount = lienAmount;
                lien.exposure = exposure;
            }

            _validateExposureAllocation(uInfo.locked, newTotalForfeitable);

            uInfo.totalForfeitable = newTotalForfeitable;
            uInfo.maxLien = newMaxLien;
        }

        emit Staked(msg.sender, denom, amount);
    }

    // ============================================================
    // RELEASE STAKE
    // ============================================================

    /// @inheritdoc IFanOut
    function releaseStake(address staker, bytes32 denom, uint256 amount) external nonReentrant onlyRegisteredConsumer {
        if (amount == 0) revert ZeroAmount();

        FanOutLien storage lien = _liens[staker][denom][msg.sender];
        if (lien.amount < amount) revert InsufficientLien();

        // exposure-diff pattern (mirrors CommitmentMathLib._settleApplyShift).
        // The previous `Math.ceilDiv(amount * exposure, lien.amount)` over-decrements
        // by 1 wei on every sub-proportional release; 1-wei spam drained `lien.exposure`
        // to zero while leaving most of `lien.amount` intact. Recompute exposure from
        // the matching outflow's maxPenaltyBps so the result is dust-free by construction.
        uint256 exposureReduction;
        {
            uint256 oldExposure = lien.exposure;
            lien.amount -= amount;
            // exposure is `lien.amount * maxPenaltyBps 10_000`. Recompute against the
            // post-decrement amount; clamp to oldExposure as defense-in-depth.
            uint256 newExposure = lien.amount * _getOutflowPenalty(staker, denom, msg.sender) / 10_000;
            if (newExposure > oldExposure) newExposure = oldExposure;
            lien.exposure = newExposure;
            exposureReduction = oldExposure - newExposure;
        }

        // Update UserInfo
        UserInfo storage uInfo = _userInfo[staker][denom];
        if (uInfo.totalForfeitable >= exposureReduction) {
            uInfo.totalForfeitable -= exposureReduction;
        } else {
            uInfo.totalForfeitable = 0;
        }

        // also shrink the matching outflow's portionBps so a subsequent `stake()`
        // does not allocate new stake to a released lien at the pre-release share
        // (full release -> portion 0 -> lien can never resurrect from the stale record).
        // Derive the new portion from the LIEN reduction ratio
        // (portion * newLien / oldLien) instead of `lien.amount * 10_000 / locked`.
        // The old formula used pre-decrement `locked` as denominator, so the stored
        // portion was inconsistent with post-release locked and the next stake()'s
        // recompute haircut the lien (e.g. locked=100, lien 50, release 25 -> portion
        // 2500 vs live locked 75; a 1-wei top-up shrank the lien 25 -> 19).
        // The ratio form never divides by locked, rounds down (keeps sum <= 10_000),
        // and oldLien >= amount >= 1 so the denominator is non-zero.
        {
            uint256 oldLien = lien.amount + amount; // pre-decrement lien amount
            Outflow[] storage outflowsArr = _outflows[staker][denom];
            for (uint256 i = 0; i < outflowsArr.length; i++) {
                if (outflowsArr[i].consumer == msg.sender) {
                    outflowsArr[i].portionBps = outflowsArr[i].portionBps * lien.amount / oldLien;
                    break;
                }
            }
        }

        // Snapshot pending rewards before updating locked (prevents reward loss on release)
        uint256 tokenCount = _rewardTokens[denom].length();
        for (uint256 i = 0; i < tokenCount; i++) {
            address rt = _rewardTokens[denom].at(i);
            uint256 currentRps = rewardsPerShare[denom][rt];
            uint256 debt = rewardDebt[staker][denom][rt];
            if (currentRps > debt) {
                pendingRewards[staker][denom][rt] += uInfo.locked * (currentRps - debt) / PRECISION;
            }
            rewardDebt[staker][denom][rt] = currentRps;
        }

        // Decrement locked and totalStake (without this, funds would be permanently trapped)
        uInfo.locked -= amount;
        totalStake[denom] -= amount;

        emit StakeReleased(staker, denom, msg.sender, amount);
    }

    // ============================================================
    // CURATED ALLOCATION LAYER
    // ============================================================
    //
    // A curated dynamic allocation surface layered ON TOP of the static outflow
    // model. It is pure exposure/allocation ALGEBRA: `allocate()` computes each
    // consumer's fill from provider-curated caps + a priority order + the
    // consumer's own published capacity, then writes the SAME virtual liens /
    // outflow records / totalForfeitable the static path uses. No physical asset
    // ever enters or leaves the node, so INV-1 (Σ(free+encumbered)+Σescrow ==
    // balanceOf(manager)) is untouched, and the existing exposure invariant
    // (totalForfeitable <= locked * inputMaxPenaltyBps / 10_000) is re-validated
    // on every pass, keeping INV-3/INV-4 backing intact.

    /// @notice Provider sets or updates a consumer's two-limit allocation cap.
    /// @dev Effective cap consumed by `allocate` is
    ///      `min(absoluteLimit, pool * shareLimit / 1e18[, consumerCapacity])`.
    ///      Registers the consumer for enumeration and appends it to the priority
    ///      list on first configuration. Does NOT move funds or mutate liens — call
    ///      `allocate` to (re)compute liens from the current caps.
    /// @param denom The stake denomination being curated.
    /// @param consumer The consumer this cap applies to.
    /// @param absoluteLimit Hard ceiling on this consumer's fill, in stake units.
    /// @param shareLimit Fraction of the provider pool, 1e18-scaled (<= 1e18).
    /// @param maxPenaltyBps Exposure penalty for this consumer's lien (<= inputMaxPenaltyBps).
    function setAllocationCap(
        bytes32 denom,
        address consumer,
        uint256 absoluteLimit,
        uint256 shareLimit,
        uint16 maxPenaltyBps
    ) external nonReentrant onlyProvider {
        if (shareLimit > PRECISION) revert InvalidShareLimit();
        if (maxPenaltyBps > inputMaxPenaltyBps) revert PenaltyExceedsInput();

        address staker = msg.sender;
        _caps[staker][denom][consumer] = AllocationCap({
            absoluteLimit: absoluteLimit, shareLimit: shareLimit, maxPenaltyBps: maxPenaltyBps, set: true
        });

        // Register for enumeration / releaseStake authorization.
        if (!_isKnownConsumer[consumer]) {
            _isKnownConsumer[consumer] = true;
            _consumers.push(consumer);
        }
        // Append to the greedy-fill priority list on first configuration.
        if (!_inPriority[staker][denom][consumer]) {
            _inPriority[staker][denom][consumer] = true;
            _priority[staker][denom].push(consumer);
        }

        emit AllocationCapSet(staker, denom, consumer, absoluteLimit, shareLimit, maxPenaltyBps);
    }

    /// @notice Provider reorders the greedy-fill priority list for a denom.
    /// @dev `order` must be an exact permutation of the current priority list
    ///      (same length, same members, no duplicates). Reordering does not move
    ///      funds or recompute liens — call `allocate` afterwards to apply the new
    ///      fill order.
    /// @param denom The stake denomination whose priority order is being changed.
    /// @param order The new full ordering of the existing consumers.
    function reorderPriority(bytes32 denom, address[] calldata order) external nonReentrant onlyProvider {
        address staker = msg.sender;
        address[] storage current = _priority[staker][denom];
        uint256 n = current.length;
        if (order.length != n) revert NotAPermutation();

        // Validate `order` is a permutation of the current list: every element must
        // be a current member, and each may appear at most once. `_inPriority`
        // guarantees membership; a transient seen-set guards against duplicates.
        for (uint256 i = 0; i < n; i++) {
            address c = order[i];
            if (!_inPriority[staker][denom][c]) revert NotAPermutation();
            for (uint256 j = i + 1; j < n; j++) {
                if (order[j] == c) revert NotAPermutation();
            }
        }

        for (uint256 i = 0; i < n; i++) {
            current[i] = order[i];
        }

        emit PriorityReordered(staker, denom);
    }

    /// @notice Recompute all consumer liens for a denom from the curated caps + priority.
    /// @dev Greedy-fill: walk the priority list in order, filling each consumer to its
    ///      effective cap `min(absoluteLimit, pool * shareLimit / 1e18[, capacity])`
    ///      until the pool is exhausted. Rebuilds the outflow records + liens +
    ///      `totalForfeitable` used by the rest of the node, then re-validates the
    ///      exposure invariant. PURE ALGEBRA — no ERC20 transfer occurs.
    /// @param denom The stake denomination to (re)allocate.
    function allocate(bytes32 denom) external nonReentrant onlyProvider {
        address staker = msg.sender;
        uint256 pool = _userInfo[staker][denom].locked;

        // Rebuild from scratch: clear the prior outflow records + liens.
        _clearOutflowsAndLiens(staker, denom);

        address[] storage order = _priority[staker][denom];
        uint256 n = order.length;

        uint256 remaining = pool;
        uint256 newTotalForfeitable = 0;
        uint256 newMaxLien = 0;

        for (uint256 i = 0; i < n; i++) {
            address consumer = order[i];
            if (!_caps[staker][denom][consumer].set) continue;

            uint256 fill = _effectiveCap(staker, denom, consumer, pool);
            if (fill > remaining) fill = remaining;
            if (fill == 0) continue;
            remaining -= fill;

            // Writes the outflow record + lien (EXACT fill) and returns exposure.
            newTotalForfeitable += _writeAllocation(staker, denom, consumer, fill, pool);
            if (fill > newMaxLien) newMaxLien = fill;

            if (remaining == 0) break;
        }

        // Defense-in-depth: Σ(fill_i * penalty_i) <= locked * inputMaxPenaltyBps.
        _validateExposureAllocation(pool, newTotalForfeitable);

        UserInfo storage uInfo = _userInfo[staker][denom];
        uInfo.totalForfeitable = newTotalForfeitable;
        uInfo.maxLien = newMaxLien;

        emit Allocated(staker, denom, pool - remaining, remaining);
    }

    /// @notice Consumer publishes or raises its own inflow capacity for a denom.
    /// @dev Permissionless self-service: `msg.sender` is the consumer. The ceiling
    ///      may only be set (first call) or RAISED here; use `decreaseLimit` to
    ///      throttle down. Checked by `allocate` via the effective-cap min().
    /// @param denom The stake denomination this ceiling applies to.
    /// @param ceiling The maximum inflow the consumer will accept.
    function publishCapacity(bytes32 denom, uint256 ceiling) external nonReentrant {
        ConsumerCapacity storage cc = _capacity[msg.sender][denom];
        if (cc.set && ceiling < cc.ceiling) revert CapacityNotIncreasing();
        cc.ceiling = ceiling;
        cc.set = true;
        emit CapacityPublished(msg.sender, denom, ceiling);
    }

    /// @notice Consumer ratchets its own inflow capacity strictly DOWN (permissionless).
    /// @dev The consumer's unilateral throttle — no provider cooperation required.
    ///      If no capacity was published yet, this sets the first ceiling (a decrease
    ///      from the implicit "unbounded"). Otherwise `newCeiling` must be strictly
    ///      below the current ceiling (MONOTONIC-DOWN). Enforced by `allocate`.
    /// @param denom The stake denomination to throttle.
    /// @param newCeiling The new, lower inflow ceiling.
    function decreaseLimit(bytes32 denom, uint256 newCeiling) external nonReentrant {
        ConsumerCapacity storage cc = _capacity[msg.sender][denom];
        if (cc.set && newCeiling >= cc.ceiling) revert LimitNotDecreasing();
        cc.ceiling = newCeiling;
        cc.set = true;
        emit CapacityDecreased(msg.sender, denom, newCeiling);
    }

    // ============================================================
    // CURATED ALLOCATION — VIEWS
    // ============================================================

    /// @notice Read a consumer's curated allocation cap.
    /// @param staker The staker (provider) whose curation is read.
    /// @param denom The stake denomination.
    /// @param consumer The consumer whose cap is read.
    /// @return cap The AllocationCap struct (zeroed with `set == false` if unconfigured).
    function getAllocationCap(address staker, bytes32 denom, address consumer)
        external
        view
        returns (AllocationCap memory cap)
    {
        return _caps[staker][denom][consumer];
    }

    /// @notice Read the greedy-fill priority order for a staker/denom.
    /// @param staker The staker (provider).
    /// @param denom The stake denomination.
    /// @return order The ordered consumer list walked by `allocate`.
    function getPriority(address staker, bytes32 denom) external view returns (address[] memory order) {
        return _priority[staker][denom];
    }

    /// @notice Consumer-published inflow ceiling for a denom.
    /// @param consumer The consumer address.
    /// @param denom The stake denomination.
    /// @return ceiling The published ceiling (meaningless unless `set`).
    /// @return set Whether the consumer has published any capacity.
    function capacity(address consumer, bytes32 denom) external view returns (uint256 ceiling, bool set) {
        ConsumerCapacity storage cc = _capacity[consumer][denom];
        return (cc.ceiling, cc.set);
    }

    /// @notice Remaining inflow room for a consumer right now = ceiling - current lien.
    /// @dev Returns `type(uint256).max` when the consumer has published no ceiling
    ///      (treated as unbounded). Otherwise saturating-subtracts the consumer's
    ///      current lien against the provider from the published ceiling.
    /// @param consumer The consumer address.
    /// @param denom The stake denomination.
    /// @return room The additional inflow the consumer would still accept.
    function allocatable(address consumer, bytes32 denom) external view returns (uint256 room) {
        ConsumerCapacity storage cc = _capacity[consumer][denom];
        if (!cc.set) return type(uint256).max;
        uint256 held = _liens[provider][denom][consumer].amount;
        return cc.ceiling > held ? cc.ceiling - held : 0;
    }

    /// @notice The effective allocation cap a consumer would receive on the next `allocate`.
    /// @dev `min(absoluteLimit, pool * shareLimit / 1e18[, publishedCapacity])`.
    /// @param staker The staker (provider) whose pool is measured.
    /// @param denom The stake denomination.
    /// @param consumer The consumer whose effective cap is computed.
    /// @return The effective cap in stake units.
    function effectiveCap(address staker, bytes32 denom, address consumer) external view returns (uint256) {
        return _effectiveCap(staker, denom, consumer, _userInfo[staker][denom].locked);
    }

    /// @notice Dry-run of how much a consumer could unwind (`releaseStake`) right now.
    /// @dev Simulate-and-revert pseudo-view over the mutating unwind path: it probes
    ///      the release ceiling through a self-call that always reverts with the
    ///      computed amount, so no state is ever persisted. The bound mirrors
    ///      `releaseStake` (which permits up to the full lien `amount`).
    /// @param staker The staker whose lien would be unwound.
    /// @param denom The stake denomination.
    /// @param consumer The consumer that would call `releaseStake`.
    /// @return amount The maximum releasable stake right now.
    function deallocatable(address staker, bytes32 denom, address consumer) external view returns (uint256 amount) {
        try this.probeUnwind(staker, denom, consumer) {
            return 0; // unreachable: probeUnwind always reverts
        } catch (bytes memory reason) {
            // Decode the UnwindProbe(uint256) sentinel: 4-byte selector + 32-byte word.
            if (reason.length == 0x24) {
                assembly {
                    amount := mload(add(reason, 0x24))
                }
            }
        }
    }

    /// @notice Internal probe for `deallocatable`; ALWAYS reverts with `UnwindProbe`.
    /// @dev Only self-callable. Measures the max releasable amount along the mutating
    ///      unwind path and returns it via a revert so the caller's state is rolled
    ///      back. Not meant to be called directly.
    /// @param staker The staker whose lien would be unwound.
    /// @param denom The stake denomination.
    /// @param consumer The consumer that would call `releaseStake`.
    function probeUnwind(address staker, bytes32 denom, address consumer) external view {
        // `releaseStake` reverts when amount > lien.amount, so the full lien amount
        // is the max unwind. Surfaced via revert to keep this a pure dry-run.
        revert UnwindProbe(_liens[staker][denom][consumer].amount);
    }

    // ============================================================
    // REWARD DISTRIBUTION
    // ============================================================

    /// @inheritdoc IFanOut
    function distributeRewards(bytes32 stakeDenom, address rewardToken, uint256 rewardAmount)
        external
        nonReentrant
        onlyRegisteredConsumer
    {
        if (rewardAmount == 0) revert ZeroAmount();
        uint256 ts = totalStake[stakeDenom];
        if (ts == 0) revert ZeroTotalStake();

        // Update per-share accumulator
        uint256 increment = rewardAmount * PRECISION / ts;
        if (increment == 0) revert RewardTooSmall();
        rewardsPerShare[stakeDenom][rewardToken] += increment;

        // Track reward token for debt updates on stake/release. cap the set
        // so an attacker cannot grow it past the gas limit and DoS stake().
        if (!_rewardTokens[stakeDenom].contains(rewardToken)) {
            if (_rewardTokens[stakeDenom].length() >= MAX_REWARD_TOKENS) revert RewardTokenLimit();
            _rewardTokens[stakeDenom].add(rewardToken);
        }

        // Pull reward tokens from consumer (SafeERC20)
        IERC20(rewardToken).safeTransferFrom(msg.sender, address(this), rewardAmount);

        emit RewardsDistributed(stakeDenom, rewardToken, rewardAmount);
    }

    /// @inheritdoc IFanOut
    function claimRewards(bytes32 stakeDenom, address rewardToken) external nonReentrant {
        uint256 stakerLocked = _userInfo[msg.sender][stakeDenom].locked;

        uint256 currentRps = rewardsPerShare[stakeDenom][rewardToken];
        uint256 debt = rewardDebt[msg.sender][stakeDenom][rewardToken];

        uint256 pending = 0;
        if (currentRps > debt) {
            pending = stakerLocked * (currentRps - debt) / PRECISION;
        }

        // Include rewards accumulated during releaseStake
        pending += pendingRewards[msg.sender][stakeDenom][rewardToken];
        pendingRewards[msg.sender][stakeDenom][rewardToken] = 0;

        // Update debt atomically before transfer (prevents double-claim)
        rewardDebt[msg.sender][stakeDenom][rewardToken] = currentRps;

        if (pending > 0) {
            IERC20(rewardToken).safeTransfer(msg.sender, pending);
            emit RewardsClaimed(msg.sender, stakeDenom, rewardToken, pending);
        }
    }

    // ============================================================
    // VIEWS
    // ============================================================

    /// @inheritdoc IFanOut
    function getUserInfo(address staker, bytes32 denom) external view returns (UserInfo memory) {
        return _userInfo[staker][denom];
    }

    /// @inheritdoc IFanOut
    function getOutflows(address staker, bytes32 denom) external view returns (Outflow[] memory) {
        return _outflows[staker][denom];
    }

    /// @inheritdoc IFanOut
    function getLien(address staker, bytes32 denom, address consumer) external view returns (FanOutLien memory) {
        return _liens[staker][denom][consumer];
    }

    // ============================================================
    // IFLOWQUERY VIEWS
    // ============================================================

    /// @inheritdoc IFlowQuery
    function nodeType() external pure returns (bytes32) {
        return FlowNodeTypes.FAN_OUT;
    }

    /// @inheritdoc IFlowQuery
    function nodeTypeName() external pure returns (string memory) {
        return "fan_out";
    }

    /// @inheritdoc IFlowQuery
    function providers() external view returns (ProviderInfo[] memory) {
        ProviderInfo[] memory result = new ProviderInfo[](1);
        uint256 denomLen = _denomsStaked.length;

        StakeInfo[] memory stakes = new StakeInfo[](denomLen);
        for (uint256 i = 0; i < denomLen; i++) {
            bytes32 denom = _denomsStaked[i];
            stakes[i] = StakeInfo({
                denom: denom,
                maxPenaltyBps: inputMaxPenaltyBps,
                unbondingPeriod: 0,
                amount: _userInfo[provider][denom].locked
            });
        }

        result[0] = ProviderInfo({provider: provider, stakes: stakes});
        return result;
    }

    /// @inheritdoc IFlowQuery
    function consumers() external view returns (ConsumerInfo[] memory) {
        uint256 len = _consumers.length;
        ConsumerInfo[] memory result = new ConsumerInfo[](len);

        for (uint256 i = 0; i < len; i++) {
            address consumer = _consumers[i];
            // Build stake info from all denoms' outflows for this consumer
            uint256 denomLen = _denomsStaked.length;
            // Count how many denoms have a lien for this consumer
            uint256 count = 0;
            for (uint256 j = 0; j < denomLen; j++) {
                if (_liens[provider][_denomsStaked[j]][consumer].amount > 0) {
                    count++;
                }
            }

            StakeInfo[] memory stakes = new StakeInfo[](count);
            uint256 k = 0;
            for (uint256 j = 0; j < denomLen; j++) {
                bytes32 denom = _denomsStaked[j];
                FanOutLien storage lien = _liens[provider][denom][consumer];
                if (lien.amount > 0) {
                    // Find the outflow for this consumer to get maxPenaltyBps
                    uint16 maxPenalty = _getOutflowPenalty(provider, denom, consumer);
                    stakes[k] =
                        StakeInfo({denom: denom, maxPenaltyBps: maxPenalty, unbondingPeriod: 0, amount: lien.amount});
                    k++;
                }
            }

            result[i] = ConsumerInfo({consumer: consumer, stakes: stakes});
        }

        return result;
    }

    /// @inheritdoc IFlowQuery
    function availableDenoms() external view returns (AvailableDenom[] memory) {
        uint256 len = _denomsStaked.length;
        AvailableDenom[] memory result = new AvailableDenom[](len);
        for (uint256 i = 0; i < len; i++) {
            bytes32 denom = _denomsStaked[i];
            result[i] = AvailableDenom({local: denom, sourceProvider: provider, sourceDenom: denom});
        }
        return result;
    }

    // ============================================================
    // PAGINATED VIEWS
    // ============================================================

    /// @inheritdoc IFlowQuery
    /// @dev FanOut has a single provider; pagination collapses to one entry when offset == 0.
    function providersPaged(uint256 offset, uint256 limit) external view returns (ProviderInfo[] memory) {
        if (offset >= 1 || limit == 0) return new ProviderInfo[](0);
        return this.providers();
    }

    /// @inheritdoc IFlowQuery
    function consumersPaged(uint256 offset, uint256 limit) external view returns (ConsumerInfo[] memory) {
        uint256 total = _consumers.length;
        if (offset >= total) return new ConsumerInfo[](0);
        uint256 end = offset + limit;
        if (end > total) end = total;
        uint256 sliceLen = end - offset;
        ConsumerInfo[] memory result = new ConsumerInfo[](sliceLen);

        for (uint256 i = 0; i < sliceLen; i++) {
            address consumer = _consumers[offset + i];
            uint256 denomLen = _denomsStaked.length;
            uint256 count = 0;
            for (uint256 j = 0; j < denomLen; j++) {
                if (_liens[provider][_denomsStaked[j]][consumer].amount > 0) count++;
            }
            StakeInfo[] memory stakes = new StakeInfo[](count);
            uint256 k = 0;
            for (uint256 j = 0; j < denomLen; j++) {
                bytes32 denom = _denomsStaked[j];
                FanOutLien storage lien = _liens[provider][denom][consumer];
                if (lien.amount > 0) {
                    stakes[k] = StakeInfo({
                        denom: denom,
                        maxPenaltyBps: _getOutflowPenalty(provider, denom, consumer),
                        unbondingPeriod: 0,
                        amount: lien.amount
                    });
                    k++;
                }
            }
            result[i] = ConsumerInfo({consumer: consumer, stakes: stakes});
        }
        return result;
    }

    /// @inheritdoc IFlowQuery
    function availableDenomsPaged(uint256 offset, uint256 limit) external view returns (AvailableDenom[] memory) {
        uint256 total = _denomsStaked.length;
        if (offset >= total) return new AvailableDenom[](0);
        uint256 end = offset + limit;
        if (end > total) end = total;
        uint256 sliceLen = end - offset;
        AvailableDenom[] memory result = new AvailableDenom[](sliceLen);
        for (uint256 i = 0; i < sliceLen; i++) {
            bytes32 denom = _denomsStaked[offset + i];
            result[i] = AvailableDenom({local: denom, sourceProvider: provider, sourceDenom: denom});
        }
        return result;
    }

    // ============================================================
    // IFlowQueryPath
    // ============================================================

    /// @inheritdoc IFlowQueryPath
    function MAX_PATH_DEPTH() external pure returns (uint16) {
        return FlowPathLib.MAX_PATH_DEPTH;
    }

    /// @inheritdoc IFlowQueryPath
    function denomPath(bytes32 local, uint16 maxDepth) external view returns (DenomLink[] memory) {
        return FlowPathLib.walk(this, local, maxDepth);
    }

    // ============================================================
    // INTERNAL HELPERS
    // ============================================================

    /// @dev Validate the exposure allocation invariant:
    ///      totalForfeitable <= locked * inputMaxPenaltyBps 10_000 (bps)
    /// @param locked The staker's total locked amount for the denom
    /// @param newTotalForfeitable The proposed new totalForfeitable value
    function _validateExposureAllocation(uint256 locked, uint256 newTotalForfeitable) internal view {
        uint256 limit = locked * inputMaxPenaltyBps / 10_000;
        if (newTotalForfeitable > limit) revert ExposureAllocationExceeded();
    }

    /// @dev Write one consumer's outflow record + virtual lien from a computed fill.
    ///      `portionBps` is derived (floored) for legacy compatibility with the static
    ///      path (releaseStake shrink + stake re-validation); the lien stores the EXACT
    ///      fill so cap precision is never lost. Returns the exposure booked.
    function _writeAllocation(address staker, bytes32 denom, address consumer, uint256 fill, uint256 pool)
        internal
        returns (uint256 exposure)
    {
        uint16 pen = _caps[staker][denom][consumer].maxPenaltyBps;
        exposure = fill * pen / 10_000;
        uint256 portionBps = pool > 0 ? fill * 10_000 / pool : 0;
        _outflows[staker][denom].push(Outflow({consumer: consumer, maxPenaltyBps: pen, portionBps: portionBps}));
        _liens[staker][denom][consumer] = FanOutLien({amount: fill, exposure: exposure});
    }

    /// @dev Effective curated cap for a consumer: min of the absolute limit, the
    ///      pool-share limit, and (if published) the consumer's own capacity.
    /// @param staker The staker (provider) whose pool is measured.
    /// @param denom The stake denomination.
    /// @param consumer The consumer whose cap is computed.
    /// @param pool The provider's locked amount for the denom.
    function _effectiveCap(address staker, bytes32 denom, address consumer, uint256 pool)
        internal
        view
        returns (uint256)
    {
        AllocationCap storage cap = _caps[staker][denom][consumer];
        if (!cap.set) return 0;

        uint256 eff = cap.absoluteLimit;
        uint256 byShare = pool * cap.shareLimit / PRECISION;
        if (byShare < eff) eff = byShare;

        ConsumerCapacity storage cc = _capacity[consumer][denom];
        if (cc.set && cc.ceiling < eff) eff = cc.ceiling;

        return eff;
    }

    /// @dev Clear existing outflows array and associated liens for a staker/denom
    function _clearOutflowsAndLiens(address staker, bytes32 denom) internal {
        Outflow[] storage existing = _outflows[staker][denom];
        for (uint256 i = 0; i < existing.length; i++) {
            delete _liens[staker][denom][existing[i].consumer];
        }
        delete _outflows[staker][denom];
    }

    /// @dev Look up the maxPenaltyBps for a specific consumer in the outflows
    function _getOutflowPenalty(address staker, bytes32 denom, address consumer) internal view returns (uint16) {
        Outflow[] storage outflowArr = _outflows[staker][denom];
        for (uint256 i = 0; i < outflowArr.length; i++) {
            if (outflowArr[i].consumer == consumer) {
                return outflowArr[i].maxPenaltyBps;
            }
        }
        return 0;
    }
}
