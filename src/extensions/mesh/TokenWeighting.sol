// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Checkpoints} from "@openzeppelin/contracts/utils/structs/Checkpoints.sol";
import {EnumerableSet} from "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";

import {ITokenWeighting} from "src/extensions/mesh/interfaces/ITokenWeighting.sol";
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
import {IVotingPowerSource} from "src/shared/interfaces/IVotingPowerSource.sol";
import {IEntity} from "src/shared/interfaces/IEntity.sol";

/// @title TokenWeighting
/// @notice Sink node that normalizes multi-asset stake into unified governance-compatible voting power.
///         Weights are configurable per denom in basis points (e.g., 10000 = 1.0x, 8000 = 0.8x).
///         Historical voting power is queryable at past block numbers via OZ Checkpoints.Trace256.
///         Implements pull-based reward accumulator (Synthetix/Compound per-share pattern).
///         Implements IFlowQuery for topology discovery, IFlowQueryPath for single-call
///         provenance walks, and IVotingPowerSource so service managers (ECDSA BLS)
///         can read per-address power directly from the mesh.
contract TokenWeighting is ITokenWeighting, IFlowQueryPath, IEntity, ReentrancyGuard, AccessControl {
    /// @notice `IEntity` type id: `keccak256("commitments.mesh.token_weighting")`. Self-verifies
    ///         this implementation when `MeshFactory` whitelists it.
    bytes32 internal constant FACTORY_TYPE_ID = keccak256("commitments.mesh.token_weighting");

    /// @inheritdoc IEntity
    function factoryTypeId() external pure returns (bytes32) {
        return FACTORY_TYPE_ID;
    }

    /// @notice lock the implementation contract. Clones (via MeshFactory)
    ///         reset storage and are unaffected.
    constructor() {
        _initialized = true;
    }

    using SafeERC20 for IERC20;
    using EnumerableSet for EnumerableSet.AddressSet;
    using Checkpoints for Checkpoints.Trace256;

    // ============================================================
    // CONSTANTS
    // ============================================================

    /// @dev Precision multiplier for reward per share accumulator
    uint256 private constant PRECISION = 1e18;

    /// @dev Basis points denominator for weight calculations
    uint256 private constant BPS = 10000;

    /// @notice role gate for distributeRewards.
    bytes32 public constant REWARDER_ROLE = keccak256("REWARDER_ROLE");

    /// @notice maximum distinct reward tokens per stakeDenom. Bounds the cost of
    ///         stake releaseStake's reward-debt iteration, preventing a permissionless
    ///         attacker from growing the set past the block gas limit.
    uint256 public constant MAX_REWARD_TOKENS = 32;

    /// @notice Cap on the number of registered (iterated) denoms. The voting-power
    ///         queries `getVotingPowerAt` / `getTotalPowerAt` — called during quorum
    ///         validation — are O(denoms), so an unbounded `_denoms` set is a latent
    ///         gas/DoS vector. Registering a NEW denom past this cap reverts; retire
    ///         an unused denom (`retireDenom`) to reclaim a slot.
    uint256 public constant MAX_DENOMS = 64;

    // ============================================================
    // STORAGE
    // ============================================================

    /// @notice Tracks whether contract has been initialized (clone guard)
    bool private _initialized;

    /// @notice The sole caller authorized to credit/debit stake. Typically a routing
    ///         contract (OperatorRegistry, FanOut, etc.) that knows the real staker.
    address public provider;

    /// @notice The governance address allowed to update weights
    address public governance;

    /// @notice denom -> CURRENT weight in bps (e.g., wstETH=10000, USDC=8000).
    ///         Mirrors the latest entry of `_weightHistory[denom]` for cheap live reads.
    mapping(bytes32 => uint256) public weights;

    /// @notice Ordered list of registered denoms (for enumeration)
    bytes32[] internal _denoms;

    /// @notice Whether a denom has been registered
    mapping(bytes32 => bool) internal _isDenom;

    // ---- Checkpoint-based RAW stake + weight history (weight applied at read time) ----

    /// @notice Per-(staker, denom) RAW stake history, keyed by block.number. Weighted
    ///         power is computed on read by multiplying against the weight epoch in
    ///         force at the queried block (see `_weightHistory`). Storing RAW stake
    ///         here — rather than pre-weighted power — is what makes a weight retune
    ///         O(1): a weight change never has to rewrite any per-staker checkpoint.
    mapping(address => mapping(bytes32 => Checkpoints.Trace256)) private _stakeHistory;

    /// @notice Per-denom RAW total-stake history, keyed by block.number. Mirrors
    ///         `_stakeHistory` aggregated across stakers, so getTotalPowerAt is
    ///         O(denoms) on read instead of O(stakers).
    mapping(bytes32 => Checkpoints.Trace256) private _totalStakeHistory;

    /// @notice Per-denom WEIGHT history — the "weight epoch" ledger — keyed by
    ///         block.number. `updateWeight` pushes exactly one checkpoint here;
    ///         historical power queries resolve the weight in force at the queried
    ///         block via `upperLookup`, so a retune is O(1) regardless of staker count.
    mapping(bytes32 => Checkpoints.Trace256) private _weightHistory;

    // ---- Current state mirrors (for efficient getVotingPower) ----

    /// @notice Current stake per (staker, denom)
    mapping(address => mapping(bytes32 => uint256)) public currentStake;

    /// @notice Total stake per denom (used for reward distribution)
    mapping(bytes32 => uint256) public totalStake;

    // ---- Reward accumulator ----

    /// @dev Reward per share accumulator: stakeDenom -> rewardToken -> accumulated per-share (scaled by PRECISION)
    mapping(bytes32 => mapping(address => uint256)) public rewardsPerShare;

    /// @dev Reward debt: staker -> stakeDenom -> rewardToken -> debt at last claim/stake
    mapping(address => mapping(bytes32 => mapping(address => uint256))) public rewardDebt;

    /// @notice Reward tokens distributed for each stakeDenom (for debt updates on stake)
    mapping(bytes32 => EnumerableSet.AddressSet) internal _rewardTokens;

    /// @notice pending rewards banked when stake or releaseStake
    ///         changes the staker's amount. Drained by claimRewards. Without this map,
    ///         every top-up or partial-unstake silently dropped previously-accrued rewards.
    mapping(address => mapping(bytes32 => mapping(address => uint256))) public pendingRewards;

    /// @notice denom -> retired? A retired denom carries a weight-0 epoch (contributes
    ///         zero from its retirement block onward) and rejects new stake. Only denoms
    ///         with stake history are marked retired; never-staked denoms are purged from
    ///         `_denoms` outright. Cleared when `updateWeight` re-activates the denom.
    mapping(bytes32 => bool) internal _retired;

    // ============================================================
    // MODIFIERS
    // ============================================================

    modifier onlyProvider() {
        if (msg.sender != provider) revert OnlyProvider();
        _;
    }

    modifier onlyGovernance() {
        if (msg.sender != governance) revert OnlyGovernance();
        _;
    }

    // ============================================================
    // INITIALIZE
    // ============================================================

    /// @inheritdoc ITokenWeighting
    /// @dev governance is also granted REWARDER_ROLE by default, mirroring
    ///      typical deployments. Governance can re-route the role via grant/revoke.
    function initialize(address provider_, address governance_) external {
        if (_initialized) revert AlreadyInitialized();
        _initialized = true;
        provider = provider_;
        governance = governance_;
        _grantRole(DEFAULT_ADMIN_ROLE, governance_);
        _grantRole(REWARDER_ROLE, governance_);
        emit Initialized(provider_, governance_);
    }

    // ============================================================
    // WEIGHT MANAGEMENT (governance only)
    // ============================================================

    /// @inheritdoc ITokenWeighting
    function updateWeight(bytes32 denom, uint256 weightBps) external onlyGovernance {
        if (weightBps == 0) revert ZeroWeightBps();

        uint256 oldWeight = weights[denom];
        weights[denom] = weightBps;

        // Register denom on first use (bounded by MAX_DENOMS).
        _registerDenom(denom);

        // A non-zero weight re-activates a previously-retired denom.
        if (_retired[denom]) _retired[denom] = false;

        // O(1) retune: bump the denom's weight epoch by pushing a SINGLE weight
        // checkpoint keyed by block.number. Live reads use `weights[denom]` above;
        // historical reads resolve the weight in force via `_weightHistory[denom]`.
        // Because weight is applied to RAW stake at read time, we never iterate the
        // staker set here — this is the fix for the prior O(stakers × denoms) loop
        // that could exceed the block gas limit and permanently brick governance.
        _weightHistory[denom].push(block.number, weightBps);

        emit WeightUpdated(denom, oldWeight, weightBps);
    }

    /// @inheritdoc ITokenWeighting
    function retireDenom(bytes32 denom) external onlyGovernance {
        if (!_isDenom[denom]) revert UnregisteredDenom();
        if (_retired[denom]) revert AlreadyRetired();

        if (_totalStakeHistory[denom].length() == 0) {
            // Never staked ⇒ it contributed zero at every block. Purging it from the
            // iterated set changes no historical query and reclaims a slot.
            _purgeDenom(denom);
            emit DenomPurged(denom);
        } else {
            // Has stake history ⇒ it cannot leave the iterated set without altering
            // historical `getVotingPowerAt` / `getTotalPowerAt`. Make it inert instead:
            // a weight-0 epoch zeroes its contribution from this block onward, while
            // `upperLookup` still resolves the pre-retirement weight for earlier blocks.
            uint256 previous = weights[denom];
            _retired[denom] = true;
            weights[denom] = 0;
            _weightHistory[denom].push(block.number, 0);
            emit DenomRetired(denom, previous);
        }
    }

    /// @inheritdoc ITokenWeighting
    function denomCount() external view returns (uint256) {
        return _denoms.length;
    }

    /// @inheritdoc ITokenWeighting
    function isDenomRetired(bytes32 denom) external view returns (bool) {
        return _retired[denom];
    }

    /// @dev Register a denom into the iterated set on first use, bounded by MAX_DENOMS.
    ///      A registration past the cap reverts so the O(denoms) voting-power queries
    ///      can never exceed a bounded cost. Existing denoms are a no-op.
    function _registerDenom(bytes32 denom) internal {
        if (_isDenom[denom]) return;
        if (_denoms.length >= MAX_DENOMS) revert DenomCapReached();
        _isDenom[denom] = true;
        _denoms.push(denom);
    }

    /// @dev Swap-and-pop a never-staked denom out of the iterated set and clear its
    ///      live mirrors. Safe precisely because the denom's contribution was zero at
    ///      every block (no `_totalStakeHistory`), so no historical query changes; the
    ///      weight *history* is left intact (harmless — a re-add starts fresh at 0 stake).
    function _purgeDenom(bytes32 denom) internal {
        uint256 len = _denoms.length;
        for (uint256 i = 0; i < len; i++) {
            if (_denoms[i] == denom) {
                _denoms[i] = _denoms[len - 1];
                _denoms.pop();
                break;
            }
        }
        delete _isDenom[denom];
        delete weights[denom];
    }

    /// @inheritdoc ITokenWeighting
    /// @dev Hands DEFAULT_ADMIN_ROLE and REWARDER_ROLE to the new governance address
    ///      atomically with the slot update, so the new governance has the same
    ///      capabilities the old one had at init time. The old address loses both roles.
    function transferGovernance(address newGovernance) external onlyGovernance {
        if (newGovernance == address(0)) revert ZeroGovernance();
        address old = governance;
        governance = newGovernance;
        _grantRole(DEFAULT_ADMIN_ROLE, newGovernance);
        _grantRole(REWARDER_ROLE, newGovernance);
        _revokeRole(REWARDER_ROLE, old);
        _revokeRole(DEFAULT_ADMIN_ROLE, old);
        emit GovernanceTransferred(old, newGovernance);
    }

    // ============================================================
    // STAKE MANAGEMENT (provider only)
    // ============================================================

    /// @inheritdoc ITokenWeighting
    function stake(address staker, bytes32 denom, uint256 amount) external nonReentrant onlyProvider {
        if (amount == 0) revert ZeroAmount();
        if (_retired[denom]) revert DenomIsRetired();

        // Register denom on first stake if not yet registered (bounded by MAX_DENOMS).
        _registerDenom(denom);

        uint256 oldStake = currentStake[staker][denom];
        uint256 newStake = oldStake + amount;
        currentStake[staker][denom] = newStake;
        totalStake[denom] += amount;

        // bank-first reward pattern. Snapshot the rewards
        // accrued on `oldStake` into pendingRewards before resetting rewardDebt to
        // the current rewardsPerShare. For first-time stakers oldStake = 0 so the
        // bank step is a no-op (still preventing retroactive reward theft).
        uint256 tokenCount = _rewardTokens[denom].length();
        for (uint256 i = 0; i < tokenCount; i++) {
            address rt = _rewardTokens[denom].at(i);
            uint256 rps = rewardsPerShare[denom][rt];
            uint256 debt = rewardDebt[staker][denom][rt];
            if (rps > debt) {
                pendingRewards[staker][denom][rt] += oldStake * (rps - debt) / PRECISION;
            }
            rewardDebt[staker][denom][rt] = rps;
        }

        // Checkpoint RAW stake (weight is applied at read time, keyed by epoch).
        _checkpointStake(staker, denom);

        emit Staked(staker, denom, amount);
    }

    /// @inheritdoc ITokenWeighting
    function releaseStake(address staker, bytes32 denom, uint256 amount) external nonReentrant onlyProvider {
        if (amount == 0) revert ZeroAmount();

        uint256 current = currentStake[staker][denom];
        if (current < amount) revert InsufficientStake();

        // bank pending rewards on the FULL pre-release stake
        // before changing the position. Mirrors FanOutNode.releaseStake.
        uint256 tokenCount = _rewardTokens[denom].length();
        for (uint256 i = 0; i < tokenCount; i++) {
            address rt = _rewardTokens[denom].at(i);
            uint256 rps = rewardsPerShare[denom][rt];
            uint256 debt = rewardDebt[staker][denom][rt];
            if (rps > debt) {
                pendingRewards[staker][denom][rt] += current * (rps - debt) / PRECISION;
            }
            rewardDebt[staker][denom][rt] = rps;
        }

        uint256 newStake = current - amount;
        currentStake[staker][denom] = newStake;
        totalStake[denom] -= amount;

        // Checkpoint RAW stake (weight is applied at read time, keyed by epoch).
        _checkpointStake(staker, denom);

        emit StakeReleased(staker, denom, amount);
    }

    // ============================================================
    // VOTING POWER QUERIES
    // ============================================================

    /// @inheritdoc IVotingPowerSource
    function getVotingPower(address staker) external view returns (uint256) {
        return _computePower(staker);
    }

    /// @inheritdoc IVotingPowerSource
    /// @dev Resolves the weight epoch in force at `blockNumber` per denom and applies
    ///      it to the RAW stake checkpointed at that block. Cost is O(denoms), never
    ///      O(stakers), and the per-denom rounding matches the live `getVotingPower`
    ///      path exactly, so historical and live values agree for a given weight set.
    function getVotingPowerAt(address staker, uint256 blockNumber) external view returns (uint256 power) {
        uint256 len = _denoms.length;
        for (uint256 i = 0; i < len; i++) {
            bytes32 denom = _denoms[i];
            uint256 stakeAt = _stakeHistory[staker][denom].upperLookup(blockNumber);
            if (stakeAt == 0) continue;
            uint256 wAt = _weightHistory[denom].upperLookup(blockNumber);
            if (wAt == 0) continue;
            power += stakeAt * wAt / BPS;
        }
    }

    /// @inheritdoc IVotingPowerSource
    function getTotalPower() external view returns (uint256) {
        return _computeTotalPower();
    }

    /// @inheritdoc IVotingPowerSource
    /// @dev Same epoch-resolution strategy as getVotingPowerAt but over per-denom
    ///      RAW total stake, so the total is recovered in O(denoms) without iterating
    ///      the staker set.
    function getTotalPowerAt(uint256 blockNumber) external view returns (uint256 power) {
        uint256 len = _denoms.length;
        for (uint256 i = 0; i < len; i++) {
            bytes32 denom = _denoms[i];
            uint256 totalAt = _totalStakeHistory[denom].upperLookup(blockNumber);
            if (totalAt == 0) continue;
            uint256 wAt = _weightHistory[denom].upperLookup(blockNumber);
            if (wAt == 0) continue;
            power += totalAt * wAt / BPS;
        }
    }

    // ============================================================
    // REWARD DISTRIBUTION
    // ============================================================

    /// @inheritdoc ITokenWeighting
    /// @dev role-gated and capped at MAX_REWARD_TOKENS distinct
    ///      reward tokens per stakeDenom to prevent unbounded set growth that would
    ///      DoS stake() releaseStake().
    function distributeRewards(bytes32 stakeDenom, address rewardToken, uint256 rewardAmount)
        external
        nonReentrant
        onlyRole(REWARDER_ROLE)
    {
        if (rewardAmount == 0) revert ZeroAmount();
        uint256 ts = totalStake[stakeDenom];
        if (ts == 0) revert ZeroTotalStake();

        // Update per-share accumulator
        uint256 increment = rewardAmount * PRECISION / ts;
        if (increment == 0) revert RewardTooSmall();
        rewardsPerShare[stakeDenom][rewardToken] += increment;

        // Track reward token for debt updates on stake — capped to bound iteration cost.
        if (!_rewardTokens[stakeDenom].contains(rewardToken)) {
            if (_rewardTokens[stakeDenom].length() >= MAX_REWARD_TOKENS) revert RewardTokenLimit();
            _rewardTokens[stakeDenom].add(rewardToken);
        }

        // Pull reward tokens via SafeERC20
        IERC20(rewardToken).safeTransferFrom(msg.sender, address(this), rewardAmount);

        emit RewardsDistributed(stakeDenom, rewardToken, rewardAmount);
    }

    /// @inheritdoc ITokenWeighting
    function claimRewards(bytes32 stakeDenom, address rewardToken) external nonReentrant {
        address staker = msg.sender;
        uint256 stakerStake = currentStake[staker][stakeDenom];

        uint256 currentRps = rewardsPerShare[stakeDenom][rewardToken];
        uint256 debt = rewardDebt[staker][stakeDenom][rewardToken];

        uint256 pending = 0;
        if (currentRps > debt) {
            pending = stakerStake * (currentRps - debt) / PRECISION;
        }

        // drain banked pending from prior stake/release events.
        pending += pendingRewards[staker][stakeDenom][rewardToken];
        pendingRewards[staker][stakeDenom][rewardToken] = 0;

        // Update debt atomically before transfer (prevents double-claim)
        rewardDebt[staker][stakeDenom][rewardToken] = currentRps;

        if (pending > 0) {
            IERC20(rewardToken).safeTransfer(staker, pending);
            emit RewardsClaimed(staker, stakeDenom, rewardToken, pending);
        }
    }

    // ============================================================
    // IFLOWQUERY VIEWS
    // ============================================================

    /// @inheritdoc IFlowQuery
    function nodeType() external pure returns (bytes32) {
        return FlowNodeTypes.TOKEN_WEIGHTING;
    }

    /// @inheritdoc IFlowQuery
    function nodeTypeName() external pure returns (string memory) {
        return "token_weighting";
    }

    /// @inheritdoc IFlowQuery
    function providers() external view returns (ProviderInfo[] memory) {
        uint256 len = _denoms.length;
        StakeInfo[] memory stakes = new StakeInfo[](len);

        for (uint256 i = 0; i < len; i++) {
            bytes32 denom = _denoms[i];
            stakes[i] = StakeInfo({
                denom: denom,
                maxPenaltyBps: 0, // sink node: no forfeiture upstream
                unbondingPeriod: 0,
                amount: currentStake[provider][denom]
            });
        }

        ProviderInfo[] memory result = new ProviderInfo[](1);
        result[0] = ProviderInfo({provider: provider, stakes: stakes});
        return result;
    }

    /// @inheritdoc IFlowQuery
    /// @notice Sink node — no downstream consumers
    function consumers() external pure returns (ConsumerInfo[] memory) {
        return new ConsumerInfo[](0);
    }

    /// @inheritdoc IFlowQuery
    function availableDenoms() external view returns (AvailableDenom[] memory) {
        uint256 len = _denoms.length;
        AvailableDenom[] memory result = new AvailableDenom[](len);
        for (uint256 i = 0; i < len; i++) {
            bytes32 denom = _denoms[i];
            result[i] = AvailableDenom({local: denom, sourceProvider: provider, sourceDenom: denom});
        }
        return result;
    }

    // ============================================================
    // PAGINATED VIEWS
    // ============================================================

    /// @inheritdoc IFlowQuery
    /// @dev TokenWeighting has a single provider; pagination collapses similarly.
    function providersPaged(uint256 offset, uint256 limit) external view returns (ProviderInfo[] memory) {
        if (offset >= 1 || limit == 0) return new ProviderInfo[](0);
        return this.providers();
    }

    /// @inheritdoc IFlowQuery
    /// @dev TokenWeighting is a sink — no downstream consumers — so pagination is empty.
    function consumersPaged(uint256, uint256) external pure returns (ConsumerInfo[] memory) {
        return new ConsumerInfo[](0);
    }

    /// @inheritdoc IFlowQuery
    function availableDenomsPaged(uint256 offset, uint256 limit) external view returns (AvailableDenom[] memory) {
        uint256 total = _denoms.length;
        if (offset >= total) return new AvailableDenom[](0);
        uint256 end = offset + limit;
        if (end > total) end = total;
        uint256 sliceLen = end - offset;
        AvailableDenom[] memory result = new AvailableDenom[](sliceLen);
        for (uint256 i = 0; i < sliceLen; i++) {
            bytes32 denom = _denoms[offset + i];
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

    /// @dev Compute current total weighted voting power for a staker from live state.
    function _computePower(address staker) internal view returns (uint256 power) {
        uint256 len = _denoms.length;
        for (uint256 i = 0; i < len; i++) {
            bytes32 denom = _denoms[i];
            uint256 w = weights[denom];
            if (w > 0) {
                power += currentStake[staker][denom] * w / BPS;
            }
        }
    }

    /// @dev Compute the current weighted total power across all stakers from live
    ///      per-denom totals. O(denoms), independent of staker count.
    function _computeTotalPower() internal view returns (uint256 power) {
        uint256 len = _denoms.length;
        for (uint256 i = 0; i < len; i++) {
            bytes32 denom = _denoms[i];
            uint256 w = weights[denom];
            if (w > 0) {
                power += totalStake[denom] * w / BPS;
            }
        }
    }

    /// @dev Checkpoint the RAW current stake for (staker, denom) and the denom's RAW
    ///      total stake at the current block. Weight is intentionally NOT applied
    ///      here; it is applied at read time keyed by the weight epoch, so a weight
    ///      retune never has to touch these per-staker checkpoints. Cost is O(1).
    function _checkpointStake(address staker, bytes32 denom) internal {
        _stakeHistory[staker][denom].push(block.number, currentStake[staker][denom]);
        _totalStakeHistory[denom].push(block.number, totalStake[denom]);
    }
}
