// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import {ReentrancyGuardTransient} from "@openzeppelin/contracts/utils/ReentrancyGuardTransient.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {EnumerableSet} from "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";

import {IFanOut, UserInfo, Outflow, FanOutLien} from "src/extensions/mesh/interfaces/IFanOut.sol";
import {FAN_OUT_TYPE_ID} from "src/extensions/mesh/interfaces/IMeshFactory.sol";
import {IEntity} from "src/shared/interfaces/IEntity.sol";
import {BPS_DENOMINATOR, WAD} from "src/shared/Constants.sol";

/// @title FanOutNode
/// @notice Distributes one provider's committed stake to multiple consumers via configurable outflows.
///         Enforces the exposure allocation invariant: totalForfeitable <= locked * inputMaxPenaltyBps / 10_000.
///         Implements pull-based reward accumulator (Synthetix/Compound per-share pattern).
contract FanOutNode is IFanOut, IEntity, ReentrancyGuardTransient {
    /// @inheritdoc IEntity
    /// @dev `FAN_OUT_TYPE_ID`; self-verifies this implementation when `MeshFactory` whitelists it.
    function factoryTypeId() external pure returns (bytes32) {
        return FAN_OUT_TYPE_ID;
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

    /// @notice defensive cap on distinct reward tokens per stakeDenom.
    ///         Mirrors TokenWeighting; bounds iteration cost in stake/releaseStake.
    uint256 public constant MAX_REWARD_TOKENS = 32;

    /// @notice Max input-side penalty in basis points (0..10_000), set per node at init.
    /// @dev The `maxPenaltyBps` the provider committed upstream.
    uint16 public inputMaxPenaltyBps;

    // ============================================================
    // STORAGE
    // ============================================================

    /// @notice Tracks whether contract has been initialized (clone guard)
    bool private _initialized;

    /// @notice The single provider whose stake is being distributed
    address public provider;

    /// @notice staker -> denom -> UserInfo
    mapping(address => mapping(bytes32 => UserInfo)) internal _userInfo;

    /// @notice staker -> denom -> Outflow[]
    mapping(address => mapping(bytes32 => Outflow[])) internal _outflows;

    /// @notice staker -> denom -> consumer -> FanOutLien
    mapping(address => mapping(bytes32 => mapping(address => FanOutLien))) internal _liens;

    /// @notice Whether an address is a known consumer (has been added via setOutflows)
    mapping(address => bool) internal _isKnownConsumer;

    /// @notice Reward accumulator: stakeDenom -> rewardToken -> accumulated per-share (scaled by WAD)
    mapping(bytes32 => mapping(address => uint256)) public rewardsPerShare;

    /// @notice Reward debt: staker -> stakeDenom -> rewardToken -> debt at last claim
    mapping(address => mapping(bytes32 => mapping(address => uint256))) public rewardDebt;

    /// @notice Total stake per denom (sum of all stakers' locked for this denom)
    mapping(bytes32 => uint256) public totalStake;

    /// @notice Reward tokens distributed for each stakeDenom (for debt updates on stake/release)
    mapping(bytes32 => EnumerableSet.AddressSet) internal _rewardTokens;

    /// @notice Pending rewards accumulated during releaseStake (claimed via claimRewards)
    mapping(address => mapping(bytes32 => mapping(address => uint256))) public pendingRewards;

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
    /// @dev `inputMaxPenaltyBps` defaults to 10_000 (no limit beyond outflow validation).
    function initialize(address provider_, address manager_) external {
        // BPS_DENOMINATOR is the compile-time constant 10_000, which fits uint16.
        // forge-lint: disable-next-line(unsafe-typecast)
        _initialize(provider_, manager_, uint16(BPS_DENOMINATOR));
    }

    /// @notice Initialize with a specific input max penalty in bps.
    /// @param provider_ The single provider address
    /// @param manager_ Recorded in the `Initialized` event only; it has no powers on the node.
    /// @param inputMaxPenaltyBps_ The max penalty bps the provider committed to upstream (0..10_000)
    function initializeWithPenalty(address provider_, address manager_, uint16 inputMaxPenaltyBps_) external {
        _initialize(provider_, manager_, inputMaxPenaltyBps_);
    }

    function _initialize(address provider_, address manager_, uint16 inputMaxPenaltyBps_) private {
        if (_initialized) revert AlreadyInitialized();
        _initialized = true;
        provider = provider_;
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
    function setOutflows(bytes32 denom, Outflow[] calldata outflows) external onlyProvider {
        UserInfo storage uInfo = _userInfo[msg.sender][denom];
        uint256 locked = uInfo.locked;

        // One pass: any check below reverts the whole call, clear included.
        _clearOutflowsAndLiens(msg.sender, denom);

        uint256 totalBps = 0;
        uint256 newTotalForfeitable = 0;
        for (uint256 i = 0; i < outflows.length; i++) {
            Outflow calldata out = outflows[i];
            totalBps += out.portionBps;
            // Reject duplicate consumers: the duplicates would share one lien slot in
            // `_liens` (last write wins) while both contribute to totalForfeitable,
            // desyncing the aggregate from the sum of stored liens.
            for (uint256 j = 0; j < i; j++) {
                if (outflows[j].consumer == out.consumer) revert DuplicateConsumer();
            }

            uint256 lienAmount = locked * out.portionBps / BPS_DENOMINATOR;
            uint256 exposure = lienAmount * out.maxPenaltyBps / BPS_DENOMINATOR;
            newTotalForfeitable += exposure;
            _outflows[msg.sender][denom].push(out);
            _liens[msg.sender][denom][out.consumer] = FanOutLien({amount: lienAmount, exposure: exposure});
            _isKnownConsumer[out.consumer] = true;
        }
        if (totalBps > BPS_DENOMINATOR) revert InvalidPortionSum();
        _validateExposureAllocation(locked, newTotalForfeitable);

        uInfo.totalForfeitable = newTotalForfeitable;

        emit OutflowsSet(msg.sender, denom, outflows.length);
    }

    // ============================================================
    // STAKE
    // ============================================================

    /// @inheritdoc IFanOut
    function stake(bytes32 denom, uint256 amount) external onlyProvider {
        if (amount == 0) revert ZeroAmount();

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
                pendingRewards[msg.sender][denom][rt] += oldLocked * (rps - debt) / WAD;
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

            for (uint256 i = 0; i < existingOutflows.length; i++) {
                Outflow storage out = existingOutflows[i];
                FanOutLien storage lien = _liens[msg.sender][denom][out.consumer];
                uint256 lienAmount = lien.amount + amount * out.portionBps / BPS_DENOMINATOR;
                uint256 exposure = lienAmount * out.maxPenaltyBps / BPS_DENOMINATOR;
                newTotalForfeitable += exposure;

                lien.amount = lienAmount;
                lien.exposure = exposure;
            }

            _validateExposureAllocation(uInfo.locked, newTotalForfeitable);

            uInfo.totalForfeitable = newTotalForfeitable;
        }

        emit Staked(msg.sender, denom, amount);
    }

    // ============================================================
    // RELEASE STAKE
    // ============================================================

    /// @inheritdoc IFanOut
    function releaseStake(address staker, bytes32 denom, uint256 amount) external onlyRegisteredConsumer {
        if (amount == 0) revert ZeroAmount();

        uint256 exposureReduction;
        {
            FanOutLien storage lien = _liens[staker][denom][msg.sender];
            uint256 oldLien = lien.amount;
            if (oldLien < amount) revert InsufficientLien();
            uint256 newLien = oldLien - amount;
            lien.amount = newLien;

            // One scan of the outflows: read the consumer's penalty and shrink its
            // portionBps so a subsequent `stake()` does not allocate new stake to a
            // released lien at the pre-release share (full release -> portion 0 -> the
            // lien can never resurrect from the stale record). The new portion is the
            // LIEN reduction ratio (portion * newLien / oldLien): it never divides by
            // `locked`, rounds down (keeps sum <= 10_000), and oldLien >= amount >= 1.
            uint256 penaltyBps;
            Outflow[] storage outflowsArr = _outflows[staker][denom];
            for (uint256 i = 0; i < outflowsArr.length; i++) {
                Outflow storage out = outflowsArr[i];
                if (out.consumer == msg.sender) {
                    penaltyBps = out.maxPenaltyBps;
                    out.portionBps = out.portionBps * newLien / oldLien;
                    break;
                }
            }

            // exposure-diff pattern (mirrors CommitmentMathLib._settleApplyShift):
            // recompute exposure from the post-decrement lien so 1-wei releases cannot
            // drain it; clamp to the old exposure as defense-in-depth.
            uint256 oldExposure = lien.exposure;
            uint256 newExposure = newLien * penaltyBps / BPS_DENOMINATOR;
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

        // Snapshot pending rewards before updating locked (prevents reward loss on release)
        uint256 tokenCount = _rewardTokens[denom].length();
        for (uint256 i = 0; i < tokenCount; i++) {
            address rt = _rewardTokens[denom].at(i);
            uint256 currentRps = rewardsPerShare[denom][rt];
            uint256 debt = rewardDebt[staker][denom][rt];
            if (currentRps > debt) {
                pendingRewards[staker][denom][rt] += uInfo.locked * (currentRps - debt) / WAD;
            }
            rewardDebt[staker][denom][rt] = currentRps;
        }

        // Decrement locked and totalStake (without this, funds would be permanently trapped)
        uInfo.locked -= amount;
        totalStake[denom] -= amount;

        emit StakeReleased(staker, denom, msg.sender, amount);
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
        uint256 increment = rewardAmount * WAD / ts;
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
            pending = stakerLocked * (currentRps - debt) / WAD;
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
    // INTERNAL HELPERS
    // ============================================================

    /// @dev Validate the exposure allocation invariant:
    ///      totalForfeitable <= locked * inputMaxPenaltyBps 10_000 (bps)
    /// @param locked The staker's total locked amount for the denom
    /// @param newTotalForfeitable The proposed new totalForfeitable value
    function _validateExposureAllocation(uint256 locked, uint256 newTotalForfeitable) internal view {
        uint256 limit = locked * inputMaxPenaltyBps / BPS_DENOMINATOR;
        if (newTotalForfeitable > limit) revert ExposureAllocationExceeded();
    }

    /// @dev Clear existing outflows array and associated liens for a staker/denom
    function _clearOutflowsAndLiens(address staker, bytes32 denom) internal {
        Outflow[] storage existing = _outflows[staker][denom];
        for (uint256 i = 0; i < existing.length; i++) {
            delete _liens[staker][denom][existing[i].consumer];
        }
        delete _outflows[staker][denom];
    }
}
