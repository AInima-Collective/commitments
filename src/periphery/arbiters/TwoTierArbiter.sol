// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import {ReentrancyGuardTransient} from "@openzeppelin/contracts/utils/ReentrancyGuardTransient.sol";

import {ICommitmentManager} from "src/core/interfaces/ICommitmentManager.sol";
import {ArbiterCapabilities} from "src/shared/arbitration/ArbiterCapabilities.sol";
import {IArbiter} from "src/shared/arbitration/interfaces/IArbiter.sol";
import {ArbiterBase} from "src/shared/arbitration/ArbiterBase.sol";

/// @title TwoTierArbiter
/// @notice A two-controller court in which a primary controller issues a fast
///         ruling and an appeal controller has final authority over a timely
///         appeal. Each ruling is enforced through the CommitmentManager's
///         ordinary two-phase forfeit flow.
/// @dev The controller addresses may be DAO timelocks. This contract does not
///      inspect how either address is governed. Terms are fixed at deployment:
///      there are no controller, timing, manager, or policy setters and the
///      contract is deliberately non-upgradeable.
contract TwoTierArbiter is ArbiterBase, ReentrancyGuardTransient {
    /// @notice Local lifecycle of a court case.
    enum CaseState {
        None,
        PrimaryRuling,
        Appealed,
        HumanRuling,
        Dismissed,
        Withdrawn,
        Lapsed,
        Executed,
        StaleCancelled
    }

    /// @notice Complete on-chain record for one court case.
    struct Case {
        uint256 commitmentId;
        uint16 primaryPenaltyBps;
        uint16 finalPenaltyBps;
        uint64 openedAt;
        uint64 appealDeadline;
        uint64 appealedAt;
        uint64 humanDeadline;
        CaseState state;
        bytes32 primaryDecisionHash;
        bytes32 appealHash;
        bytes32 humanDecisionHash;
    }

    /// @notice Address authorized to open and withdraw first-pass rulings.
    address public immutable primaryController;

    /// @notice Address authorized to resolve appealed rulings.
    address public immutable appealController;

    /// @notice Wall-clock period in which an authorized party may appeal.
    uint64 public immutable appealWindow;

    /// @notice Wall-clock period given to the appeal controller after appeal.
    uint64 public immutable humanResponseWindow;

    /// @notice Required margin between a court deadline and manager execution.
    uint64 public immutable executionBuffer;

    /// @notice Minimum challenge window accepted by this deployment.
    uint64 public immutable requiredChallengeWindow;

    /// @notice Content hash of the immutable off-chain court policy.
    bytes32 public immutable courtPolicyHash;

    string private _courtPolicyURI;

    mapping(uint256 caseId => Case) private _cases;

    /// @notice The live case for a commitment, or zero when none is live.
    mapping(uint256 commitmentId => uint256 caseId) public activeCaseOf;

    /// @notice Last allocated globally unique case ID. Zero is reserved.
    uint256 public nextCaseId;

    error ControllersMustDiffer();
    error ZeroWindow();
    error InvalidPolicy();
    error TimingOverflow();
    error NotPrimaryController(address caller);
    error NotAppealController(address caller);
    error UnauthorizedAppellant(address caller);
    error CommitmentNotFound(uint256 commitmentId);
    error CaseAlreadyActive(uint256 commitmentId, uint256 caseId);
    error UnknownCase(uint256 caseId);
    error WrongCaseState(uint256 caseId, CaseState expected, CaseState actual);
    error RulingNotExecutable(uint256 caseId, CaseState actual);
    error CaseNotLive(uint256 caseId, CaseState actual);
    error StaleCase(uint256 caseId, uint256 activeCaseId);
    error InvalidPenalty(uint16 penaltyBps);
    error PenaltyAboveCommitmentMax(uint16 commitmentMax, uint16 penaltyBps);
    error ZeroHash();
    error AppealWindowElapsed(uint64 deadline, uint64 nowTs);
    error HumanResponseWindowElapsed(uint64 deadline, uint64 nowTs);
    error HumanResponseWindowActive(uint64 deadline, uint64 nowTs);
    error ManagerProposalNotActive(uint256 commitmentId);
    error ManagerPenaltyMismatch(uint16 expected, uint16 actual);

    /// @notice Emitted when the primary controller opens a case.
    event RulingProposed(
        uint256 indexed caseId,
        uint256 indexed commitmentId,
        address indexed actor,
        uint16 penaltyBps,
        uint64 openedAt,
        uint64 appealDeadline,
        uint64 managerInitiatedAt,
        bytes32 decisionHash
    );

    /// @notice Emitted when the primary controller withdraws a ruling.
    event RulingWithdrawn(
        uint256 indexed caseId,
        uint256 indexed commitmentId,
        address indexed actor,
        uint16 penaltyBps,
        uint64 withdrawnAt,
        uint64 appealDeadline,
        bytes32 reasonHash
    );

    /// @notice Emitted when an authorized party escalates a case.
    event RulingAppealed(
        uint256 indexed caseId,
        uint256 indexed commitmentId,
        address indexed actor,
        uint16 primaryPenaltyBps,
        uint64 appealedAt,
        uint64 humanDeadline,
        uint64 managerInitiatedAt,
        bytes32 appealHash
    );

    /// @notice Emitted when the appeal controller issues its final ruling.
    /// @dev `finalPenaltyBps == 0` identifies dismissal; in that case no new
    ///      manager proposal is created and `managerInitiatedAt` is zero.
    event AppealResolved(
        uint256 indexed caseId,
        uint256 indexed commitmentId,
        address indexed actor,
        uint16 finalPenaltyBps,
        uint64 ruledAt,
        uint64 humanDeadline,
        uint64 managerInitiatedAt,
        bytes32 decisionHash
    );

    /// @notice Emitted when anyone lapses an unanswered appeal after deadline.
    event AppealLapsed(
        uint256 indexed caseId,
        uint256 indexed commitmentId,
        address indexed actor,
        uint16 primaryPenaltyBps,
        uint64 humanDeadline
    );

    /// @notice Emitted when the operative manager proposal is executed through this court.
    event RulingExecuted(
        uint256 indexed caseId,
        uint256 indexed commitmentId,
        address indexed actor,
        uint16 penaltyBps,
        uint64 managerInitiatedAt,
        uint64 executedAt,
        bytes32 decisionHash
    );

    /// @notice Emitted when direct manager resolution is reconciled locally.
    event CaseSynchronized(
        uint256 indexed caseId,
        uint256 indexed commitmentId,
        address indexed actor,
        CaseState terminalState,
        uint16 penaltyBps,
        uint64 managerInitiatedAt,
        uint64 synchronizedAt,
        bytes32 decisionHash,
        bytes32 appealHash
    );

    /// @notice Deploy a court with fixed controllers, timing, manager, and policy.
    /// @param manager_ CommitmentManager this court may call.
    /// @param primaryController_ Fast first-pass controller (normally an AI-governed DAO timelock).
    /// @param appealController_ Final appeal controller (normally a human-governed DAO timelock).
    /// @param appealWindow_ Period after a primary ruling in which appeal is allowed.
    /// @param humanResponseWindow_ Period after appeal in which the final controller may rule.
    /// @param executionBuffer_ Extra manager-execution margin beyond either court window.
    /// @param courtPolicyURI_ Content-addressed URI for the immutable court policy.
    /// @param courtPolicyHash_ Content hash of the court policy document.
    constructor(
        address manager_,
        address primaryController_,
        address appealController_,
        uint64 appealWindow_,
        uint64 humanResponseWindow_,
        uint64 executionBuffer_,
        string memory courtPolicyURI_,
        bytes32 courtPolicyHash_
    ) ArbiterBase(manager_) {
        if (primaryController_ == address(0) || appealController_ == address(0)) {
            revert ZeroAddress();
        }
        if (primaryController_ == appealController_) revert ControllersMustDiffer();
        if (appealWindow_ == 0 || humanResponseWindow_ == 0 || executionBuffer_ == 0) revert ZeroWindow();
        if (bytes(courtPolicyURI_).length == 0 || courtPolicyHash_ == bytes32(0)) revert InvalidPolicy();

        uint256 required = uint256(_max(appealWindow_, humanResponseWindow_)) + executionBuffer_;
        if (required > type(uint64).max) revert TimingOverflow();

        primaryController = primaryController_;
        appealController = appealController_;
        appealWindow = appealWindow_;
        humanResponseWindow = humanResponseWindow_;
        executionBuffer = executionBuffer_;
        requiredChallengeWindow = uint64(required);
        _courtPolicyURI = courtPolicyURI_;
        courtPolicyHash = courtPolicyHash_;
    }

    /// @inheritdoc IArbiter
    function arbiterCapabilities() external pure returns (uint256) {
        return ArbiterCapabilities.INITIATE_FORFEIT | ArbiterCapabilities.CANCEL_FORFEIT;
    }

    /// @inheritdoc IArbiter
    function arbiterMetadataURI() external view returns (string memory) {
        return _courtPolicyURI;
    }

    /// @notice Return the complete record for `caseId`.
    /// @param caseId Globally unique court case ID.
    /// @return courtCase The stored case record.
    function getCase(uint256 caseId) external view returns (Case memory courtCase) {
        courtCase = _cases[caseId];
        if (courtCase.state == CaseState.None) revert UnknownCase(caseId);
    }

    /// @notice Open a positive first-pass ruling against an eligible commitment.
    /// @param commitmentId Commitment governed by this court.
    /// @param penaltyBps Proposed forfeit in basis points of encumbered backing.
    /// @param decisionHash Hash of the canonical primary-decision bundle.
    /// @return caseId Newly allocated globally unique court case ID.
    function proposeRuling(uint256 commitmentId, uint16 penaltyBps, bytes32 decisionHash)
        external
        nonReentrant
        returns (uint256 caseId)
    {
        if (msg.sender != primaryController) revert NotPrimaryController(msg.sender);
        if (decisionHash == bytes32(0)) revert ZeroHash();
        if (penaltyBps == 0) revert InvalidPenalty(penaltyBps);

        uint256 existingCaseId = activeCaseOf[commitmentId];
        if (existingCaseId != 0) revert CaseAlreadyActive(commitmentId, existingCaseId);

        ICommitmentManager.Commitment memory commitment = manager.getCommitment(commitmentId);
        if (commitment.committer == address(0)) revert CommitmentNotFound(commitmentId);
        if (commitment.released || commitment.forfeited) revert CommitmentNotActive(commitmentId);
        if (commitment.arbiter != address(this)) revert WrongArbiter(address(this), commitment.arbiter);
        if (penaltyBps > commitment.maxPenaltyBps) {
            revert PenaltyAboveCommitmentMax(commitment.maxPenaltyBps, penaltyBps);
        }
        if (commitment.challengeWindow < requiredChallengeWindow) {
            revert ChallengeWindowTooShort(requiredChallengeWindow, commitment.challengeWindow);
        }

        uint64 openedAt = uint64(block.timestamp);
        uint64 deadline = _deadline(openedAt, appealWindow);
        caseId = ++nextCaseId;

        Case storage courtCase = _cases[caseId];
        courtCase.commitmentId = commitmentId;
        courtCase.primaryPenaltyBps = penaltyBps;
        courtCase.openedAt = openedAt;
        courtCase.appealDeadline = deadline;
        courtCase.state = CaseState.PrimaryRuling;
        courtCase.primaryDecisionHash = decisionHash;
        activeCaseOf[commitmentId] = caseId;

        manager.initiateForfeit(commitmentId, penaltyBps);

        emit RulingProposed(caseId, commitmentId, msg.sender, penaltyBps, openedAt, deadline, openedAt, decisionHash);
    }

    /// @notice Withdraw an unappealed primary ruling and cancel its manager proposal.
    /// @param caseId Live primary case to withdraw.
    /// @param reasonHash Non-zero hash of the withdrawal record.
    function withdrawRuling(uint256 caseId, bytes32 reasonHash) external nonReentrant {
        if (msg.sender != primaryController) revert NotPrimaryController(msg.sender);
        if (reasonHash == bytes32(0)) revert ZeroHash();

        Case storage courtCase = _requireState(caseId, CaseState.PrimaryRuling);
        _requireCurrent(caseId, courtCase);
        _requireActiveManagerProposal(courtCase.commitmentId, courtCase.primaryPenaltyBps);

        manager.cancelForfeit(courtCase.commitmentId);
        _closeCase(courtCase, CaseState.Withdrawn);

        emit RulingWithdrawn(
            caseId,
            courtCase.commitmentId,
            msg.sender,
            courtCase.primaryPenaltyBps,
            uint64(block.timestamp),
            courtCase.appealDeadline,
            reasonHash
        );
    }

    /// @notice Escalate a primary ruling once and reset the manager challenge window.
    /// @param caseId Live primary case to appeal.
    /// @param appealHash Non-zero hash of the canonical appeal bundle.
    function appeal(uint256 caseId, bytes32 appealHash) external nonReentrant {
        if (appealHash == bytes32(0)) revert ZeroHash();

        Case storage courtCase = _requireState(caseId, CaseState.PrimaryRuling);
        _requireCurrent(caseId, courtCase);

        uint64 nowTs = uint64(block.timestamp);
        if (nowTs > courtCase.appealDeadline) revert AppealWindowElapsed(courtCase.appealDeadline, nowTs);

        ICommitmentManager.Commitment memory commitment = manager.getCommitment(courtCase.commitmentId);
        if (
            msg.sender != commitment.committer && msg.sender != commitment.counterparty
                && msg.sender != primaryController && msg.sender != appealController
        ) revert UnauthorizedAppellant(msg.sender);

        _requireActiveManagerProposal(courtCase.commitmentId, courtCase.primaryPenaltyBps);
        manager.cancelForfeit(courtCase.commitmentId);
        manager.initiateForfeit(courtCase.commitmentId, courtCase.primaryPenaltyBps);

        courtCase.appealedAt = nowTs;
        courtCase.humanDeadline = _deadline(nowTs, humanResponseWindow);
        courtCase.state = CaseState.Appealed;
        courtCase.appealHash = appealHash;

        emit RulingAppealed(
            caseId,
            courtCase.commitmentId,
            msg.sender,
            courtCase.primaryPenaltyBps,
            nowTs,
            courtCase.humanDeadline,
            nowTs,
            appealHash
        );
    }

    /// @notice Issue the final ruling on an appealed case.
    /// @dev Zero dismisses and creates no zero-penalty manager proposal. A
    ///      positive penalty cancels and reopens the manager proposal, giving
    ///      the final ruling a fresh challenge window.
    /// @param caseId Appealed case to resolve.
    /// @param finalPenaltyBps Final penalty, or zero to dismiss.
    /// @param decisionHash Non-zero hash of the canonical human-decision bundle.
    function resolveAppeal(uint256 caseId, uint16 finalPenaltyBps, bytes32 decisionHash) external nonReentrant {
        if (msg.sender != appealController) revert NotAppealController(msg.sender);
        if (decisionHash == bytes32(0)) revert ZeroHash();

        Case storage courtCase = _requireState(caseId, CaseState.Appealed);
        _requireCurrent(caseId, courtCase);

        uint64 nowTs = uint64(block.timestamp);
        if (nowTs > courtCase.humanDeadline) {
            revert HumanResponseWindowElapsed(courtCase.humanDeadline, nowTs);
        }

        ICommitmentManager.Commitment memory commitment = manager.getCommitment(courtCase.commitmentId);
        if (finalPenaltyBps > commitment.maxPenaltyBps) {
            revert PenaltyAboveCommitmentMax(commitment.maxPenaltyBps, finalPenaltyBps);
        }

        _requireActiveManagerProposal(courtCase.commitmentId, courtCase.primaryPenaltyBps);
        manager.cancelForfeit(courtCase.commitmentId);

        courtCase.finalPenaltyBps = finalPenaltyBps;
        courtCase.humanDecisionHash = decisionHash;

        if (finalPenaltyBps == 0) {
            _closeCase(courtCase, CaseState.Dismissed);
            emit AppealResolved(
                caseId, courtCase.commitmentId, msg.sender, 0, nowTs, courtCase.humanDeadline, 0, decisionHash
            );
            return;
        }

        manager.initiateForfeit(courtCase.commitmentId, finalPenaltyBps);
        courtCase.state = CaseState.HumanRuling;

        emit AppealResolved(
            caseId,
            courtCase.commitmentId,
            msg.sender,
            finalPenaltyBps,
            nowTs,
            courtCase.humanDeadline,
            nowTs,
            decisionHash
        );
    }

    /// @notice Cancel an unanswered appeal after its human-response deadline.
    /// @param caseId Appealed case whose response period has elapsed.
    function lapseAppeal(uint256 caseId) external nonReentrant {
        Case storage courtCase = _requireState(caseId, CaseState.Appealed);
        _requireCurrent(caseId, courtCase);

        uint64 nowTs = uint64(block.timestamp);
        if (nowTs <= courtCase.humanDeadline) {
            revert HumanResponseWindowActive(courtCase.humanDeadline, nowTs);
        }

        _requireActiveManagerProposal(courtCase.commitmentId, courtCase.primaryPenaltyBps);
        manager.cancelForfeit(courtCase.commitmentId);
        _closeCase(courtCase, CaseState.Lapsed);

        emit AppealLapsed(
            caseId, courtCase.commitmentId, msg.sender, courtCase.primaryPenaltyBps, courtCase.humanDeadline
        );
    }

    /// @notice Permissionlessly execute an unappealed or final human ruling after
    ///         the manager challenge window matures.
    /// @param caseId Live primary or human-ruling case to execute.
    function executeRuling(uint256 caseId) external nonReentrant {
        Case storage courtCase = _getKnownCase(caseId);
        if (courtCase.state != CaseState.PrimaryRuling && courtCase.state != CaseState.HumanRuling) {
            revert RulingNotExecutable(caseId, courtCase.state);
        }
        _requireCurrent(caseId, courtCase);

        uint16 penaltyBps = _operativePenalty(courtCase);
        bytes32 decisionHash = _operativeDecisionHash(courtCase);
        ICommitmentManager.ForfeitProposal memory proposal =
            _requireActiveManagerProposal(courtCase.commitmentId, penaltyBps);
        manager.executeForfeit(courtCase.commitmentId);
        _closeCase(courtCase, CaseState.Executed);

        emit RulingExecuted(
            caseId,
            courtCase.commitmentId,
            msg.sender,
            penaltyBps,
            proposal.initiatedAt,
            uint64(block.timestamp),
            decisionHash
        );
    }

    /// @notice Reconcile a live local case after direct manager execution or
    ///         permissionless stale cancellation.
    /// @param caseId Live case whose manager proposal has resolved externally.
    function syncCase(uint256 caseId) external nonReentrant {
        Case storage courtCase = _getKnownCase(caseId);
        if (!_isLive(courtCase.state)) revert CaseNotLive(caseId, courtCase.state);
        _requireCurrent(caseId, courtCase);

        ICommitmentManager.ForfeitProposal memory proposal = manager.getForfeitProposal(courtCase.commitmentId);
        CaseState terminalState;
        if (proposal.executed) terminalState = CaseState.Executed;
        else if (proposal.cancelled) terminalState = CaseState.StaleCancelled;
        else revert ManagerProposalNotActive(courtCase.commitmentId);

        bytes32 decisionHash = _operativeDecisionHash(courtCase);
        bytes32 appealHash = courtCase.appealHash;
        _closeCase(courtCase, terminalState);
        emit CaseSynchronized(
            caseId,
            courtCase.commitmentId,
            msg.sender,
            terminalState,
            proposal.penaltyBps,
            proposal.initiatedAt,
            uint64(block.timestamp),
            decisionHash,
            appealHash
        );
    }

    function _getKnownCase(uint256 caseId) internal view returns (Case storage courtCase) {
        courtCase = _cases[caseId];
        if (courtCase.state == CaseState.None) revert UnknownCase(caseId);
    }

    function _requireState(uint256 caseId, CaseState expected) internal view returns (Case storage courtCase) {
        courtCase = _getKnownCase(caseId);
        if (courtCase.state != expected) revert WrongCaseState(caseId, expected, courtCase.state);
    }

    function _requireCurrent(uint256 caseId, Case storage courtCase) internal view {
        uint256 activeCaseId = activeCaseOf[courtCase.commitmentId];
        if (activeCaseId != caseId) revert StaleCase(caseId, activeCaseId);
    }

    function _requireActiveManagerProposal(uint256 commitmentId, uint16 expectedPenaltyBps)
        internal
        view
        returns (ICommitmentManager.ForfeitProposal memory proposal)
    {
        proposal = manager.getForfeitProposal(commitmentId);
        if (!_forfeitProposalActive(proposal)) revert ManagerProposalNotActive(commitmentId);
        if (proposal.penaltyBps != expectedPenaltyBps) {
            revert ManagerPenaltyMismatch(expectedPenaltyBps, proposal.penaltyBps);
        }
    }

    /// @dev Every caller has already run `_requireCurrent`.
    function _closeCase(Case storage courtCase, CaseState terminalState) internal {
        courtCase.state = terminalState;
        delete activeCaseOf[courtCase.commitmentId];
    }

    function _operativePenalty(Case storage courtCase) internal view returns (uint16) {
        if (courtCase.state == CaseState.HumanRuling) return courtCase.finalPenaltyBps;
        return courtCase.primaryPenaltyBps;
    }

    function _operativeDecisionHash(Case storage courtCase) internal view returns (bytes32) {
        if (courtCase.state == CaseState.HumanRuling) return courtCase.humanDecisionHash;
        return courtCase.primaryDecisionHash;
    }

    function _isLive(CaseState state) internal pure returns (bool) {
        return state == CaseState.PrimaryRuling || state == CaseState.Appealed || state == CaseState.HumanRuling;
    }

    function _deadline(uint64 start, uint64 window) internal pure returns (uint64) {
        uint256 deadline = uint256(start) + window;
        if (deadline > type(uint64).max) revert TimingOverflow();
        return uint64(deadline);
    }

    function _max(uint64 a, uint64 b) internal pure returns (uint64) {
        return a > b ? a : b;
    }
}
