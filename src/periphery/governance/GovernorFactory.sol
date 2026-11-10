// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import {Clones} from "@openzeppelin/contracts/proxy/Clones.sol";
import {ERC1967Proxy} from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";
import {IVotes} from "@openzeppelin/contracts/governance/utils/IVotes.sol";
import {
    TimelockControllerUpgradeable
} from "@openzeppelin/contracts-upgradeable/governance/TimelockControllerUpgradeable.sol";

import {IVotingPowerSource} from "src/shared/interfaces/IVotingPowerSource.sol";
import {CommitmentsGovernor} from "src/periphery/governance/CommitmentsGovernor.sol";
import {CommitmentsTimelock} from "src/periphery/governance/CommitmentsTimelock.sol";
import {TokenWeightingVotesShim} from "src/periphery/governance/TokenWeightingVotesShim.sol";

/// @title GovernorFactory
/// @notice Deploys complete DAO suites (Governor proxy + Timelock clone + Votes shim)
///         bound to a specific IVotingPowerSource. Mirrors MeshFactory and VaultFactory
///         in shape.
///
///         Per-deployment topology:
///         - The shim is freshly deployed (raw `new`, stateless, immutable source).
///         - The Timelock is an EIP-1167 clone of `timelockImpl` (non-upgradeable
///           by design — replacing the timelock means redeploying the DAO).
///         - The Governor is an ERC-1967 proxy pointing at `governorImpl` (UUPS
///           upgradeable through onlyGovernance — the DAO can replace its own
///           implementation via a successful, queued, timelock-delayed proposal).
///
///         At deploy time the factory grants the Governor PROPOSER_ROLE +
///         CANCELLER_ROLE on the Timelock and grants EXECUTOR_ROLE to address(0)
///         (open execution); the factory then renounces its own admin so the
///         Timelock self-administers from that point forward.
contract GovernorFactory {
    using Clones for address;

    // ============================================================
    // CONSTANTS
    // ============================================================

    /// @notice The Governor implementation pointed at by every ERC-1967 proxy this factory deploys.
    address public immutable governorImpl;

    /// @notice The Timelock implementation cloned for every DAO this factory deploys.
    address public immutable timelockImpl;

    /// @notice The account that deployed this factory; the only caller of `setCanonicalGovernor`.
    address public immutable deployer;

    // ============================================================
    // EVENTS
    // ============================================================

    event GovernorDeployed(
        address indexed governor, address indexed timelock, address indexed shim, address source, string name
    );

    event CanonicalGovernorSet(address indexed governor);

    // ============================================================
    // ERRORS
    // ============================================================

    error ZeroAddress();
    error CanonicalAlreadySet();
    error UnknownGovernor();
    error NotDeployer();

    // ============================================================
    // STRUCTS
    // ============================================================

    struct DAOConfig {
        string name;
        IVotingPowerSource source;
        uint256 timelockMinDelay; // seconds
        uint48 votingDelay; // blocks (matches TokenWeighting clock mode)
        uint32 votingPeriod; // blocks
        uint256 proposalThreshold; // voting power units
        uint256 quorumNumerator; // out of 100
        uint48 lateQuorumExtension; // blocks; 0 disables
    }

    struct DAODeployment {
        address governor;
        address timelock;
        address shim;
        address source;
        string name;
        uint256 deployedAtBlock;
    }

    // ============================================================
    // STORAGE
    // ============================================================
    // Plain storage: GovernorFactory is non-upgradeable (constructor-immutables
    // only), so it does not need EIP-7201 namespaced storage.

    /// @notice ordered list of every governor deployed by this factory.
    address[] private _allGovernors;

    /// @notice per-governor lookup of the linked DAO components.
    mapping(address governor => DAODeployment) private _byGovernor;

    /// @notice per-source list of every governor instance reading from it.
    ///         A TokenWeighting only has ONE governance writer (the
    ///         tw.governance() slot); this map tracks every governor
    ///         configured to *read* from the source via its shim.
    mapping(address source => address[]) private _governorsBySource;

    /// @notice the canonical / reference DAO address (the protocol's own).
    ///         Set at most once via setCanonicalGovernor() and indexed
    ///         downstream. Zero until set.
    address private _canonicalGovernor;

    // ============================================================
    // CONSTRUCTOR
    // ============================================================

    constructor(address governorImpl_, address timelockImpl_) {
        if (governorImpl_ == address(0) || timelockImpl_ == address(0)) revert ZeroAddress();
        governorImpl = governorImpl_;
        timelockImpl = timelockImpl_;
        deployer = msg.sender;
    }

    // ============================================================
    // DEPLOY
    // ============================================================

    /// @notice Deploy a new DAO suite (non-deterministic addresses).
    function deploy(DAOConfig calldata cfg) external returns (DAODeployment memory dao) {
        if (address(cfg.source) == address(0)) revert ZeroAddress();

        // 1. Stateless shim that wraps the source.
        TokenWeightingVotesShim shim = new TokenWeightingVotesShim(cfg.source);

        // 2. Timelock clone — initialize with empty role sets and the factory as
        //    transient admin so we can wire roles below; then renounce.
        address timelock = timelockImpl.clone();
        address[] memory empty = new address[](0);
        TimelockControllerUpgradeable(payable(timelock)).initialize(cfg.timelockMinDelay, empty, empty, address(this));

        // 3. Governor ERC-1967 proxy.
        ERC1967Proxy governorProxy = new ERC1967Proxy(
            governorImpl,
            abi.encodeCall(
                CommitmentsGovernor.initialize,
                (
                    cfg.name,
                    IVotes(address(shim)),
                    TimelockControllerUpgradeable(payable(timelock)),
                    cfg.votingDelay,
                    cfg.votingPeriod,
                    cfg.proposalThreshold,
                    cfg.quorumNumerator,
                    cfg.lateQuorumExtension
                )
            )
        );
        address governor = address(governorProxy);

        // 4. Wire timelock roles. Factory must drop its own admin afterwards.
        TimelockControllerUpgradeable tl = TimelockControllerUpgradeable(payable(timelock));
        tl.grantRole(tl.PROPOSER_ROLE(), governor);
        tl.grantRole(tl.CANCELLER_ROLE(), governor);
        tl.grantRole(tl.EXECUTOR_ROLE(), address(0));
        tl.renounceRole(tl.DEFAULT_ADMIN_ROLE(), address(this));

        // 5. Index.
        dao = DAODeployment({
            governor: governor,
            timelock: timelock,
            shim: address(shim),
            source: address(cfg.source),
            name: cfg.name,
            deployedAtBlock: block.number
        });
        _allGovernors.push(governor);
        _byGovernor[governor] = dao;
        _governorsBySource[address(cfg.source)].push(governor);

        emit GovernorDeployed(governor, timelock, address(shim), address(cfg.source), cfg.name);
    }

    /// @notice Mark a previously-deployed governor as the canonical / reference DAO.
    ///         Set-once, and only by the factory's `deployer`: `deploy` is permissionless,
    ///         so an open setter would let anyone claim the slot with a junk DAO.
    function setCanonicalGovernor(address governor) external {
        if (msg.sender != deployer) revert NotDeployer();
        if (_canonicalGovernor != address(0)) revert CanonicalAlreadySet();
        if (_byGovernor[governor].governor == address(0)) revert UnknownGovernor();
        _canonicalGovernor = governor;
        emit CanonicalGovernorSet(governor);
    }

    // ============================================================
    // VIEWS
    // ============================================================

    function deploymentCount() external view returns (uint256) {
        return _allGovernors.length;
    }

    function governorAt(uint256 i) external view returns (address) {
        return _allGovernors[i];
    }

    function getDeployment(address governor) external view returns (DAODeployment memory dao) {
        dao = _byGovernor[governor];
    }

    function governorsBySource(address source) external view returns (address[] memory) {
        return _governorsBySource[source];
    }

    function canonicalGovernor() external view returns (address) {
        return _canonicalGovernor;
    }
}
