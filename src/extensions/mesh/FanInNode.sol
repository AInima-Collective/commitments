// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

import {IFanIn} from "src/extensions/mesh/interfaces/IFanIn.sol";
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

/// @title FanInNode
/// @notice Aggregates stake from multiple providers with different denoms into a single consumer.
///         Prevents denom collision when two providers supply the same token string.
///         Implements IFlowQuery for topology discovery and IFlowQueryPath for
///         single-call provenance walks.
contract FanInNode is IFanIn, IFlowQueryPath, IEntity, ReentrancyGuard {
    /// @notice `IEntity` type id: `keccak256("commitments.mesh.fan_in")`. Self-verifies this
    ///         implementation when `MeshFactory` whitelists it.
    bytes32 internal constant FACTORY_TYPE_ID = keccak256("commitments.mesh.fan_in");

    /// @inheritdoc IEntity
    function factoryTypeId() external pure returns (bytes32) {
        return FACTORY_TYPE_ID;
    }

    /// @notice lock the implementation contract so it cannot be
    ///         initialized directly. Production deployments use `MeshFactory`
    ///         which clones via; the clone reads zeroed storage and
    ///         can call `initialize`. This guard prevents an indexer-confusion
    ///         scenario where an attacker initializes the impl with rogue
    ///         consumer/manager and emits events that look authentic.
    constructor() {
        _initialized = true;
    }

    // ============================================================
    // STORAGE
    // ============================================================

    /// @notice Tracks whether contract has been initialized (clone guard)
    bool private _initialized;

    /// @notice Manager/owner — can register providers
    address public manager;

    /// @notice Single consumer — can release stake and distribute rewards
    address public consumer;

    /// @notice provider -> denomIn -> denomOut mapping
    mapping(address => mapping(bytes32 => bytes32)) public inputDenoms;

    struct ProviderEntry {
        address provider;
        bytes32 denomIn;
    }

    /// @dev `maxPenaltyBps` (0..10_000).
    struct SecurityLevel {
        uint16 maxPenaltyBps;
        uint64 unbondingPeriod;
    }

    /// @notice denomOut -> (provider, denomIn) — for reverse lookup and collision detection
    mapping(bytes32 => ProviderEntry) public outputSources;

    /// @notice denomOut -> total staked amount
    mapping(bytes32 => uint256) public totalStake;

    /// @notice denomOut -> SecurityLevel
    mapping(bytes32 => SecurityLevel) public security;

    /// @notice Ordered list of registered provider addresses (for enumeration)
    address[] internal _providers;

    /// @notice Whether an address is already a known provider
    mapping(address => bool) internal _isKnownProvider;

    /// @notice Ordered list of registered denomOut values (for enumeration)
    bytes32[] internal _denomOuts;

    // ============================================================
    // EVENTS
    // ============================================================

    event ProviderRegistered(
        address indexed provider, bytes32 denomIn, bytes32 denomOut, uint16 maxPenaltyBps, uint64 unbondingPeriod
    );

    event Staked(address indexed provider, bytes32 denomIn, bytes32 denomOut, uint256 amount);

    event StakeReleased(address indexed provider, bytes32 denomOut, uint256 amount);

    // ============================================================
    // ERRORS
    // ============================================================

    error AlreadyInitialized();
    error OnlyManager();
    error OnlyConsumer();
    error DenomOutCollision();
    error InputAlreadyRegistered();
    error UnregisteredProvider();
    error InsufficientStake();
    error ZeroAmount();

    // ============================================================
    // MODIFIERS
    // ============================================================

    modifier onlyManager() {
        if (msg.sender != manager) revert OnlyManager();
        _;
    }

    modifier onlyConsumer() {
        if (msg.sender != consumer) revert OnlyConsumer();
        _;
    }

    // ============================================================
    // INITIALIZE
    // ============================================================

    /// @notice Initialize the fan-in node (called once by factory or deployer after clone)
    /// @param consumer_ The single consumer address that receives aggregated stake
    /// @param manager_ The manager/owner address that can register providers
    function initialize(address consumer_, address manager_) external {
        if (_initialized) revert AlreadyInitialized();
        _initialized = true;
        consumer = consumer_;
        manager = manager_;
    }

    // ============================================================
    // PROVIDER REGISTRATION
    // ============================================================

    /// @notice Register a provider with its denom mapping
    /// @param provider The provider address allowed to call stake()
    /// @param denomIn The denom string the provider stakes with
    /// @param denomOut The local denom this fan-in exposes to the consumer
    /// @param maxPenaltyBps Max forfeiture in basis points (0..10_000) for this provider's stake
    /// @param unbondingPeriod Unbonding period in seconds for this provider's stake
    function registerProvider(
        address provider,
        bytes32 denomIn,
        bytes32 denomOut,
        uint16 maxPenaltyBps,
        uint64 unbondingPeriod
    ) external onlyManager {
        // Prevent denom collision: reject if denomOut already used
        if (outputSources[denomOut].provider != address(0)) revert DenomOutCollision();
        // Prevent duplicate input registration for same (provider, denomIn)
        if (inputDenoms[provider][denomIn] != bytes32(0)) revert InputAlreadyRegistered();

        // Store input->output mapping
        inputDenoms[provider][denomIn] = denomOut;

        // Store output->source mapping
        outputSources[denomOut] = ProviderEntry({provider: provider, denomIn: denomIn});

        // Store security level for this denomination
        security[denomOut] = SecurityLevel({maxPenaltyBps: maxPenaltyBps, unbondingPeriod: unbondingPeriod});

        // Track provider for enumeration (deduplicated)
        if (!_isKnownProvider[provider]) {
            _isKnownProvider[provider] = true;
            _providers.push(provider);
        }

        // Track denomOut for enumeration
        _denomOuts.push(denomOut);

        emit ProviderRegistered(provider, denomIn, denomOut, maxPenaltyBps, unbondingPeriod);
    }

    // ============================================================
    // STAKE
    // ============================================================

    /// @notice Manager credits a registered provider's stake — maps denomIn to denomOut.
    /// @dev `onlyManager` is the verified-backing binding (plan STEP 3): the only entity
    ///      that can credit stake is the manager — for the wired pipeline that is the
    ///      OperatorRegistry, which credits exactly the amount of a commitment it has
    ///      verified (`committer == staker`, `counterparty == registry`). Because the
    ///      permissionless provider-driven path is gone, mesh stake can never diverge
    ///      above real, manager-verified encumbrance.
    /// @param provider The registered provider whose stake is credited.
    /// @param denomIn The denom being staked (must be registered for `provider`).
    /// @param amount The amount being staked.
    function stake(address provider, bytes32 denomIn, uint256 amount) external nonReentrant onlyManager {
        if (amount == 0) revert ZeroAmount();
        bytes32 denomOut = inputDenoms[provider][denomIn];
        if (denomOut == bytes32(0)) revert UnregisteredProvider();

        totalStake[denomOut] += amount;

        emit Staked(provider, denomIn, denomOut, amount);
    }

    // ============================================================
    // RELEASE STAKE
    // ============================================================

    /// @notice Release stake back to its registered provider — decrements totalStake.
    /// @dev Callable by the consumer OR the manager. The manager path lets the
    ///      OperatorRegistry unwind mesh stake when a delegation is released/forfeited
    ///      (the registry is the manager that credited the stake, not the consumer).
    ///      provider is derived from `outputSources[denomOut]` rather than supplied by
    ///      the caller, preventing off-chain indexers from being poisoned by an
    ///      arbitrary provider address.
    /// @param denomOut The local denom to release
    /// @param amount The amount to release
    function releaseStake(bytes32 denomOut, uint256 amount) external nonReentrant {
        if (msg.sender != consumer && msg.sender != manager) revert OnlyConsumer();
        if (amount == 0) revert ZeroAmount();
        if (totalStake[denomOut] < amount) revert InsufficientStake();

        address provider = outputSources[denomOut].provider;
        if (provider == address(0)) revert UnregisteredProvider();

        totalStake[denomOut] -= amount;

        emit StakeReleased(provider, denomOut, amount);
    }

    // `distributeRewards` removed. FanInNode is a thin
    // aggregator with no per-provider stake accounting and no claim path.
    // Reward distribution belongs on FanOutNode TokenWeighting where the
    // accounting exists. Removing the function avoids permanently locking
    // reward tokens.

    // ============================================================
    // IFLOWQUERY VIEWS
    // ============================================================

    /// @inheritdoc IFlowQuery
    function nodeType() external pure returns (bytes32) {
        return FlowNodeTypes.FAN_IN;
    }

    /// @inheritdoc IFlowQuery
    function nodeTypeName() external pure returns (string memory) {
        return "fan_in";
    }

    /// @notice Returns all registered providers with their current stake info
    function providers() external view returns (ProviderInfo[] memory) {
        uint256 len = _providers.length;
        ProviderInfo[] memory result = new ProviderInfo[](len);

        for (uint256 i = 0; i < len; i++) {
            address prov = _providers[i];
            // Collect all denomOuts that belong to this provider
            uint256 denomCount = 0;
            for (uint256 j = 0; j < _denomOuts.length; j++) {
                if (outputSources[_denomOuts[j]].provider == prov) {
                    denomCount++;
                }
            }

            StakeInfo[] memory stakes = new StakeInfo[](denomCount);
            uint256 k = 0;
            for (uint256 j = 0; j < _denomOuts.length; j++) {
                bytes32 dOut = _denomOuts[j];
                ProviderEntry memory entry = outputSources[dOut];
                if (entry.provider == prov) {
                    SecurityLevel memory sec = security[dOut];
                    stakes[k] = StakeInfo({
                        denom: entry.denomIn,
                        maxPenaltyBps: sec.maxPenaltyBps,
                        unbondingPeriod: sec.unbondingPeriod,
                        amount: totalStake[dOut]
                    });
                    k++;
                }
            }

            result[i] = ProviderInfo({provider: prov, stakes: stakes});
        }

        return result;
    }

    /// @notice Returns the single consumer with all aggregated stake info
    function consumers() external view returns (ConsumerInfo[] memory) {
        uint256 len = _denomOuts.length;

        // Only include denoms with non-zero stake
        uint256 nonZeroCount = 0;
        for (uint256 i = 0; i < len; i++) {
            if (totalStake[_denomOuts[i]] > 0) nonZeroCount++;
        }

        StakeInfo[] memory stakes = new StakeInfo[](nonZeroCount);
        uint256 k = 0;
        for (uint256 i = 0; i < len; i++) {
            bytes32 dOut = _denomOuts[i];
            uint256 ts = totalStake[dOut];
            if (ts > 0) {
                SecurityLevel memory sec = security[dOut];
                stakes[k] = StakeInfo({
                    denom: dOut, maxPenaltyBps: sec.maxPenaltyBps, unbondingPeriod: sec.unbondingPeriod, amount: ts
                });
                k++;
            }
        }

        ConsumerInfo[] memory result = new ConsumerInfo[](1);
        result[0] = ConsumerInfo({consumer: consumer, stakes: stakes});
        return result;
    }

    /// @notice Returns all available denominations with source provider info
    function availableDenoms() external view returns (AvailableDenom[] memory) {
        uint256 len = _denomOuts.length;
        AvailableDenom[] memory result = new AvailableDenom[](len);

        for (uint256 i = 0; i < len; i++) {
            bytes32 dOut = _denomOuts[i];
            ProviderEntry memory entry = outputSources[dOut];
            result[i] = AvailableDenom({local: dOut, sourceProvider: entry.provider, sourceDenom: entry.denomIn});
        }

        return result;
    }

    // ============================================================
    // PAGINATED VIEWS
    // ============================================================

    /// @inheritdoc IFlowQuery
    function providersPaged(uint256 offset, uint256 limit) external view returns (ProviderInfo[] memory) {
        uint256 total = _providers.length;
        if (offset >= total) return new ProviderInfo[](0);
        uint256 end = offset + limit;
        if (end > total) end = total;
        uint256 sliceLen = end - offset;
        ProviderInfo[] memory result = new ProviderInfo[](sliceLen);

        for (uint256 i = 0; i < sliceLen; i++) {
            address prov = _providers[offset + i];
            uint256 denomCount = 0;
            for (uint256 j = 0; j < _denomOuts.length; j++) {
                if (outputSources[_denomOuts[j]].provider == prov) denomCount++;
            }
            StakeInfo[] memory stakes = new StakeInfo[](denomCount);
            uint256 k = 0;
            for (uint256 j = 0; j < _denomOuts.length; j++) {
                bytes32 dOut = _denomOuts[j];
                ProviderEntry memory entry = outputSources[dOut];
                if (entry.provider == prov) {
                    SecurityLevel memory sec = security[dOut];
                    stakes[k] = StakeInfo({
                        denom: entry.denomIn,
                        maxPenaltyBps: sec.maxPenaltyBps,
                        unbondingPeriod: sec.unbondingPeriod,
                        amount: totalStake[dOut]
                    });
                    k++;
                }
            }
            result[i] = ProviderInfo({provider: prov, stakes: stakes});
        }
        return result;
    }

    /// @inheritdoc IFlowQuery
    /// @dev FanIn has a single consumer; pagination just collapses to "the one consumer"
    ///      when offset == 0, else empty. Kept for interface uniformity.
    function consumersPaged(uint256 offset, uint256 limit) external view returns (ConsumerInfo[] memory) {
        if (offset >= 1 || limit == 0) return new ConsumerInfo[](0);
        ConsumerInfo[] memory full = this.consumers();
        return full;
    }

    /// @inheritdoc IFlowQuery
    function availableDenomsPaged(uint256 offset, uint256 limit) external view returns (AvailableDenom[] memory) {
        uint256 total = _denomOuts.length;
        if (offset >= total) return new AvailableDenom[](0);
        uint256 end = offset + limit;
        if (end > total) end = total;
        uint256 sliceLen = end - offset;
        AvailableDenom[] memory result = new AvailableDenom[](sliceLen);
        for (uint256 i = 0; i < sliceLen; i++) {
            bytes32 dOut = _denomOuts[offset + i];
            ProviderEntry memory entry = outputSources[dOut];
            result[i] = AvailableDenom({local: dOut, sourceProvider: entry.provider, sourceDenom: entry.denomIn});
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
}
