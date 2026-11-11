// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import {IFanIn} from "src/extensions/mesh/interfaces/IFanIn.sol";
import {FAN_IN_TYPE_ID} from "src/extensions/mesh/interfaces/IMeshFactory.sol";
import {IEntity} from "src/shared/interfaces/IEntity.sol";

/// @title FanInNode
/// @notice Aggregates stake from multiple providers with different denoms into a single consumer.
///         Prevents denom collision when two providers supply the same token string.
contract FanInNode is IFanIn, IEntity {
    /// @inheritdoc IEntity
    /// @dev `FAN_IN_TYPE_ID`; self-verifies this implementation when `MeshFactory` whitelists it.
    function factoryTypeId() external pure returns (bytes32) {
        return FAN_IN_TYPE_ID;
    }

    /// @notice lock the implementation contract so it cannot be
    ///         initialized directly. Production deployments use `MeshFactory`,
    ///         which clones via EIP-1167; the clone reads zeroed storage and
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

    /// @notice Single consumer — can release stake
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
    function stake(address provider, bytes32 denomIn, uint256 amount) external onlyManager {
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
    function releaseStake(bytes32 denomOut, uint256 amount) external {
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
    // Reward distribution belongs on FanOutNode / TokenWeighting, where the
    // accounting exists. Removing the function avoids permanently locking
    // reward tokens.
}
