// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import {Initializable} from "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import {UUPSUpgradeable} from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import {GovernorUpgradeable} from "@openzeppelin/contracts-upgradeable/governance/GovernorUpgradeable.sol";
import {
    GovernorSettingsUpgradeable
} from "@openzeppelin/contracts-upgradeable/governance/extensions/GovernorSettingsUpgradeable.sol";
import {
    GovernorCountingSimpleUpgradeable
} from "@openzeppelin/contracts-upgradeable/governance/extensions/GovernorCountingSimpleUpgradeable.sol";
import {
    GovernorVotesUpgradeable
} from "@openzeppelin/contracts-upgradeable/governance/extensions/GovernorVotesUpgradeable.sol";
import {
    GovernorVotesQuorumFractionUpgradeable
} from "@openzeppelin/contracts-upgradeable/governance/extensions/GovernorVotesQuorumFractionUpgradeable.sol";
import {
    GovernorPreventLateQuorumUpgradeable
} from "@openzeppelin/contracts-upgradeable/governance/extensions/GovernorPreventLateQuorumUpgradeable.sol";
import {
    GovernorTimelockControlUpgradeable
} from "@openzeppelin/contracts-upgradeable/governance/extensions/GovernorTimelockControlUpgradeable.sol";
import {
    TimelockControllerUpgradeable
} from "@openzeppelin/contracts-upgradeable/governance/TimelockControllerUpgradeable.sol";
import {IVotes} from "@openzeppelin/contracts/governance/utils/IVotes.sol";

/// @title CommitmentsGovernor
/// @notice DAO-side proposal/vote contract for the Commitments protocol. Reads
///         voting power from any IERC5805 source (typically a
///         TokenWeightingVotesShim wrapping a TokenWeighting mesh node) and
///         executes successful proposals through a TimelockController.
///
///         Module composition:
///         - GovernorSettings: configurable votingDelay / votingPeriod / proposalThreshold
///         - GovernorCountingSimple: For/Against/Abstain (Bravo style)
///         - GovernorVotes: reads getPastVotes from an IERC5805 source
///         - GovernorVotesQuorumFraction: quorum = numerator/denominator of past total supply
///         - GovernorPreventLateQuorum: extends voting deadline if quorum reaches at the wire
///         - GovernorTimelockControl: queue + execute via TimelockController
///
///         Hash-based proposal IDs (Tally-compatible). UUPS upgradeable; the
///         _authorizeUpgrade is gated onlyGovernance, so the DAO can only upgrade
///         itself via a successful, queued, timelock-delayed self-proposal.
contract CommitmentsGovernor is
    Initializable,
    GovernorUpgradeable,
    GovernorSettingsUpgradeable,
    GovernorCountingSimpleUpgradeable,
    GovernorVotesUpgradeable,
    GovernorVotesQuorumFractionUpgradeable,
    GovernorPreventLateQuorumUpgradeable,
    GovernorTimelockControlUpgradeable,
    UUPSUpgradeable
{
    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    /// @notice Initialize the Governor proxy.
    /// @param name_ Human-readable name used in EIP-712 domain (e.g. "Commitments DAO").
    /// @param votesSource IERC5805 voting power source (typically a
    ///        TokenWeightingVotesShim wrapping a TokenWeighting node).
    /// @param timelock_ The TimelockController this Governor queues + executes through.
    /// @param votingDelay_ Blocks between proposal creation and voteStart.
    /// @param votingPeriod_ Blocks the vote remains open.
    /// @param proposalThreshold_ Minimum voting power (in source units) to propose.
    /// @param quorumNumerator_ Quorum numerator out of 100 (e.g. 4 = 4%).
    /// @param lateQuorumExtension_ Blocks to extend the deadline if quorum reaches
    ///        within the extension window of voteEnd. Set 0 to disable.
    function initialize(
        string memory name_,
        IVotes votesSource,
        TimelockControllerUpgradeable timelock_,
        uint48 votingDelay_,
        uint32 votingPeriod_,
        uint256 proposalThreshold_,
        uint256 quorumNumerator_,
        uint48 lateQuorumExtension_
    ) external initializer {
        __Governor_init(name_);
        __GovernorSettings_init(votingDelay_, votingPeriod_, proposalThreshold_);
        __GovernorCountingSimple_init();
        __GovernorVotes_init(votesSource);
        __GovernorVotesQuorumFraction_init(quorumNumerator_);
        __GovernorPreventLateQuorum_init(lateQuorumExtension_);
        __GovernorTimelockControl_init(timelock_);
    }

    // ============================================================
    // UUPS UPGRADE AUTHORIZATION
    // ============================================================

    /// @dev Self-upgrade only — a successful, queued, timelock-executed proposal
    ///      must trigger the upgrade. Same gating as Governor's other admin
    ///      operations (updateQuorumNumerator, updateTimelock, etc.).
    function _authorizeUpgrade(address) internal override onlyGovernance {}

    // ============================================================
    // REQUIRED OVERRIDES (multi-inheritance)
    // ============================================================

    function state(uint256 proposalId)
        public
        view
        override(GovernorUpgradeable, GovernorTimelockControlUpgradeable)
        returns (ProposalState)
    {
        return super.state(proposalId);
    }

    function proposalNeedsQueuing(uint256 proposalId)
        public
        view
        override(GovernorUpgradeable, GovernorTimelockControlUpgradeable)
        returns (bool)
    {
        return super.proposalNeedsQueuing(proposalId);
    }

    function proposalThreshold()
        public
        view
        override(GovernorUpgradeable, GovernorSettingsUpgradeable)
        returns (uint256)
    {
        return super.proposalThreshold();
    }

    function proposalDeadline(uint256 proposalId)
        public
        view
        override(GovernorUpgradeable, GovernorPreventLateQuorumUpgradeable)
        returns (uint256)
    {
        return super.proposalDeadline(proposalId);
    }

    function _tallyUpdated(uint256 proposalId)
        internal
        override(GovernorUpgradeable, GovernorPreventLateQuorumUpgradeable)
    {
        super._tallyUpdated(proposalId);
    }

    function _queueOperations(
        uint256 proposalId,
        address[] memory targets,
        uint256[] memory values,
        bytes[] memory calldatas,
        bytes32 descriptionHash
    ) internal override(GovernorUpgradeable, GovernorTimelockControlUpgradeable) returns (uint48) {
        return super._queueOperations(proposalId, targets, values, calldatas, descriptionHash);
    }

    function _executeOperations(
        uint256 proposalId,
        address[] memory targets,
        uint256[] memory values,
        bytes[] memory calldatas,
        bytes32 descriptionHash
    ) internal override(GovernorUpgradeable, GovernorTimelockControlUpgradeable) {
        super._executeOperations(proposalId, targets, values, calldatas, descriptionHash);
    }

    function _cancel(
        address[] memory targets,
        uint256[] memory values,
        bytes[] memory calldatas,
        bytes32 descriptionHash
    ) internal override(GovernorUpgradeable, GovernorTimelockControlUpgradeable) returns (uint256) {
        return super._cancel(targets, values, calldatas, descriptionHash);
    }

    function _executor()
        internal
        view
        override(GovernorUpgradeable, GovernorTimelockControlUpgradeable)
        returns (address)
    {
        return super._executor();
    }
}
