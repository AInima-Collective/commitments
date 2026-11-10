// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import {IERC165} from "@openzeppelin/contracts/utils/introspection/IERC165.sol";
import {Vm} from "forge-std/Vm.sol";

import {ICommitmentManager as ICM} from "src/core/interfaces/ICommitmentManager.sol";
import {TwoTierArbiter} from "src/periphery/arbiters/TwoTierArbiter.sol";
import {ArbiterCapabilities} from "src/shared/arbitration/ArbiterCapabilities.sol";
import {IArbiter} from "src/shared/arbitration/interfaces/IArbiter.sol";
import {ManagerTestBase} from "../helpers/ManagerTestBase.sol";
import {ArbiterBase} from "src/shared/arbitration/ArbiterBase.sol";

/// @title TwoTierArbiterTest
/// @notice Focused state-machine and manager-integration coverage for the
///         primary-controller / appeal-controller court.
contract TwoTierArbiterTest is ManagerTestBase {
    TwoTierArbiter internal arbiter;

    address internal primary = makeAddr("primary-dao-timelock");
    address internal human = makeAddr("human-dao-timelock");
    address internal committer = makeAddr("committer");
    address internal counterparty = makeAddr("counterparty");
    address internal outsider = makeAddr("outsider");
    address internal keeper = makeAddr("keeper");

    uint64 internal constant APPEAL_WINDOW = 1 days;
    uint64 internal constant HUMAN_WINDOW = 36 hours;
    uint64 internal constant EXECUTION_BUFFER = 6 hours;
    uint64 internal constant REQUIRED_WINDOW = HUMAN_WINDOW + EXECUTION_BUFFER;

    uint256 internal constant DEPOSIT = 10_000e18;
    uint256 internal constant AMOUNT = 100e18;
    uint16 internal constant MAX_PENALTY = 8000;
    uint16 internal constant PRIMARY_PENALTY = 3000;
    string internal constant POLICY_URI = "ipfs://bafybeigdyr-two-tier-court-policy";
    bytes32 internal constant POLICY_HASH = keccak256("two-tier-court-policy-v1");
    bytes32 internal constant PRIMARY_HASH = keccak256("primary-decision");
    bytes32 internal constant APPEAL_HASH = keccak256("appeal");
    bytes32 internal constant HUMAN_HASH = keccak256("human-decision");
    bytes32 internal constant WITHDRAW_HASH = keccak256("withdrawal");

    function setUp() public override {
        super.setUp();
        arbiter = _deploy(
            address(manager), primary, human, APPEAL_WINDOW, HUMAN_WINDOW, EXECUTION_BUFFER, POLICY_URI, POLICY_HASH
        );
        _deposit(committer, DEPOSIT);
    }

    function _deploy(
        address manager_,
        address primary_,
        address human_,
        uint64 appealWindow_,
        uint64 humanWindow_,
        uint64 buffer_,
        string memory policyURI_,
        bytes32 policyHash_
    ) internal returns (TwoTierArbiter) {
        return new TwoTierArbiter(
            manager_, primary_, human_, appealWindow_, humanWindow_, buffer_, policyURI_, policyHash_
        );
    }

    function _createCommitment() internal returns (uint256) {
        return _createCommitment(WINDOW, MAX_PENALTY, address(arbiter));
    }

    function _createCommitment(uint64 challengeWindow, uint16 maxPenalty, address arbiter_) internal returns (uint256) {
        ICM.CommitmentParams memory p = _baseParams(arbiter_, counterparty, AMOUNT, maxPenalty);
        p.challengeWindow = challengeWindow;
        return _createAs(committer, p);
    }

    function _open(uint256 commitmentId) internal returns (uint256 caseId) {
        vm.prank(primary);
        caseId = arbiter.proposeRuling(commitmentId, PRIMARY_PENALTY, PRIMARY_HASH);
    }

    function _appeal(uint256 caseId, address appellant) internal {
        vm.prank(appellant);
        arbiter.appeal(caseId, APPEAL_HASH);
    }

    function _openAndAppeal() internal returns (uint256 commitmentId, uint256 caseId) {
        commitmentId = _createCommitment();
        caseId = _open(commitmentId);
        _appeal(caseId, committer);
    }

    function _assertActiveProposal(uint256 commitmentId, uint16 penaltyBps, uint64 initiatedAt) internal view {
        ICM.ForfeitProposal memory proposal = manager.getForfeitProposal(commitmentId);
        assertEq(proposal.penaltyBps, penaltyBps, "operative penalty");
        assertEq(proposal.initiatedAt, initiatedAt, "proposal timestamp");
        assertFalse(proposal.executed, "proposal not executed");
        assertFalse(proposal.cancelled, "proposal not cancelled");
    }

    function _assertCommitmentActive(uint256 commitmentId) internal view {
        ICM.Commitment memory commitment = manager.getCommitment(commitmentId);
        assertFalse(commitment.released, "commitment stays unreleased");
        assertFalse(commitment.forfeited, "commitment stays unforfeited");
    }

    // ---------------------------------------------------------------------
    // Deployment and introspection
    // ---------------------------------------------------------------------

    function testConstructorStoresImmutableConfiguration() public view {
        assertEq(address(arbiter.manager()), address(manager));
        assertEq(arbiter.commitmentManager(), address(manager));
        assertEq(arbiter.primaryController(), primary);
        assertEq(arbiter.appealController(), human);
        assertEq(arbiter.appealWindow(), APPEAL_WINDOW);
        assertEq(arbiter.humanResponseWindow(), HUMAN_WINDOW);
        assertEq(arbiter.executionBuffer(), EXECUTION_BUFFER);
        assertEq(arbiter.requiredChallengeWindow(), REQUIRED_WINDOW);
        assertEq(arbiter.arbiterMetadataURI(), POLICY_URI);
        assertEq(arbiter.courtPolicyHash(), POLICY_HASH);
    }

    function testConstructorRejectsZeroAddressesAndSameController() public {
        vm.expectRevert(ArbiterBase.ZeroAddress.selector);
        _deploy(address(0), primary, human, 1, 1, 1, POLICY_URI, POLICY_HASH);

        vm.expectRevert(ArbiterBase.ZeroAddress.selector);
        _deploy(address(manager), address(0), human, 1, 1, 1, POLICY_URI, POLICY_HASH);

        vm.expectRevert(ArbiterBase.ZeroAddress.selector);
        _deploy(address(manager), primary, address(0), 1, 1, 1, POLICY_URI, POLICY_HASH);

        vm.expectRevert(TwoTierArbiter.ControllersMustDiffer.selector);
        _deploy(address(manager), primary, primary, 1, 1, 1, POLICY_URI, POLICY_HASH);
    }

    function testConstructorRejectsInvalidTimingAndPolicy() public {
        vm.expectRevert(TwoTierArbiter.ZeroWindow.selector);
        _deploy(address(manager), primary, human, 0, 1, 1, POLICY_URI, POLICY_HASH);

        vm.expectRevert(TwoTierArbiter.ZeroWindow.selector);
        _deploy(address(manager), primary, human, 1, 0, 1, POLICY_URI, POLICY_HASH);

        vm.expectRevert(TwoTierArbiter.ZeroWindow.selector);
        _deploy(address(manager), primary, human, 1, 1, 0, POLICY_URI, POLICY_HASH);

        vm.expectRevert(TwoTierArbiter.TimingOverflow.selector);
        _deploy(address(manager), primary, human, type(uint64).max, 1, 1, POLICY_URI, POLICY_HASH);

        vm.expectRevert(TwoTierArbiter.InvalidPolicy.selector);
        _deploy(address(manager), primary, human, 1, 1, 1, "", POLICY_HASH);

        vm.expectRevert(TwoTierArbiter.InvalidPolicy.selector);
        _deploy(address(manager), primary, human, 1, 1, 1, POLICY_URI, bytes32(0));
    }

    function testIArbiterAndERC165IntrospectionIsExact() public view {
        uint256 expected = ArbiterCapabilities.INITIATE_FORFEIT | ArbiterCapabilities.CANCEL_FORFEIT;
        assertEq(arbiter.arbiterCapabilities(), expected);
        assertTrue(arbiter.supportsInterface(type(IArbiter).interfaceId));
        assertTrue(arbiter.supportsInterface(type(IERC165).interfaceId));
        assertFalse(arbiter.supportsInterface(0xffffffff));
    }

    // ---------------------------------------------------------------------
    // Primary ruling validation
    // ---------------------------------------------------------------------

    function testOnlyPrimaryCanOpenAndStoredCaseMatchesProposal() public {
        uint256 commitmentId = _createCommitment();

        vm.prank(outsider);
        vm.expectRevert(abi.encodeWithSelector(TwoTierArbiter.NotPrimaryController.selector, outsider));
        arbiter.proposeRuling(commitmentId, PRIMARY_PENALTY, PRIMARY_HASH);

        uint64 nowTs = uint64(block.timestamp);
        uint256 caseId = _open(commitmentId);
        TwoTierArbiter.Case memory courtCase = arbiter.getCase(caseId);
        assertEq(courtCase.commitmentId, commitmentId);
        assertEq(courtCase.primaryPenaltyBps, PRIMARY_PENALTY);
        assertEq(courtCase.finalPenaltyBps, 0);
        assertEq(courtCase.openedAt, nowTs);
        assertEq(courtCase.appealDeadline, nowTs + APPEAL_WINDOW);
        assertEq(uint8(courtCase.state), uint8(TwoTierArbiter.CaseState.PrimaryRuling));
        assertEq(courtCase.primaryDecisionHash, PRIMARY_HASH);
        assertEq(arbiter.activeCaseOf(commitmentId), caseId);
        assertEq(arbiter.nextCaseId(), caseId);
        _assertActiveProposal(commitmentId, PRIMARY_PENALTY, nowTs);
    }

    function testPrimaryRejectsUnknownWrongArbiterInactiveAndDuplicateCommitments() public {
        vm.prank(primary);
        vm.expectRevert(abi.encodeWithSelector(TwoTierArbiter.CommitmentNotFound.selector, 999));
        arbiter.proposeRuling(999, PRIMARY_PENALTY, PRIMARY_HASH);

        uint256 wrongArbiterId = _createCommitment(WINDOW, MAX_PENALTY, outsider);
        vm.prank(primary);
        vm.expectRevert(abi.encodeWithSelector(ArbiterBase.WrongArbiter.selector, address(arbiter), outsider));
        arbiter.proposeRuling(wrongArbiterId, PRIMARY_PENALTY, PRIMARY_HASH);

        uint256 commitmentId = _createCommitment();
        uint256 caseId = _open(commitmentId);
        vm.prank(primary);
        vm.expectRevert(abi.encodeWithSelector(TwoTierArbiter.CaseAlreadyActive.selector, commitmentId, caseId));
        arbiter.proposeRuling(commitmentId, PRIMARY_PENALTY, PRIMARY_HASH);

        ICM.ForfeitProposal memory proposal = manager.getForfeitProposal(commitmentId);
        vm.warp(uint256(proposal.initiatedAt) + WINDOW);
        arbiter.executeRuling(caseId);

        vm.prank(primary);
        vm.expectRevert(abi.encodeWithSelector(ArbiterBase.CommitmentNotActive.selector, commitmentId));
        arbiter.proposeRuling(commitmentId, PRIMARY_PENALTY, PRIMARY_HASH);
    }

    function testPenaltyBoundsHashesAndChallengeWindowAreEnforced() public {
        uint256 commitmentId = _createCommitment();

        vm.startPrank(primary);
        vm.expectRevert(abi.encodeWithSelector(TwoTierArbiter.InvalidPenalty.selector, 0));
        arbiter.proposeRuling(commitmentId, 0, PRIMARY_HASH);

        vm.expectRevert(
            abi.encodeWithSelector(TwoTierArbiter.PenaltyAboveCommitmentMax.selector, MAX_PENALTY, MAX_PENALTY + 1)
        );
        arbiter.proposeRuling(commitmentId, MAX_PENALTY + 1, PRIMARY_HASH);

        vm.expectRevert(TwoTierArbiter.ZeroHash.selector);
        arbiter.proposeRuling(commitmentId, PRIMARY_PENALTY, bytes32(0));
        vm.stopPrank();

        uint256 shortWindowId = _createCommitment(1 days, MAX_PENALTY, address(arbiter));
        vm.prank(primary);
        vm.expectRevert(abi.encodeWithSelector(ArbiterBase.ChallengeWindowTooShort.selector, REQUIRED_WINDOW, 1 days));
        arbiter.proposeRuling(shortWindowId, PRIMARY_PENALTY, PRIMARY_HASH);
    }

    function testFuzzPrimaryPenaltyNeverExceedsConsentedMaximum(uint16 penaltyBps) public {
        penaltyBps = uint16(bound(penaltyBps, 1, MAX_PENALTY));
        uint256 commitmentId = _createCommitment();
        vm.prank(primary);
        arbiter.proposeRuling(commitmentId, penaltyBps, PRIMARY_HASH);
        assertEq(manager.getForfeitProposal(commitmentId).penaltyBps, penaltyBps);
    }

    // ---------------------------------------------------------------------
    // Appeal authorization and timing
    // ---------------------------------------------------------------------

    function testEveryAuthorizedAppellantCanAppeal() public {
        address[4] memory appellants = [committer, counterparty, primary, human];
        for (uint256 i; i < appellants.length; ++i) {
            uint256 commitmentId = _createCommitment();
            uint256 caseId = _open(commitmentId);
            vm.warp(block.timestamp + 1 hours);
            uint64 appealedAt = uint64(block.timestamp);
            _appeal(caseId, appellants[i]);

            TwoTierArbiter.Case memory courtCase = arbiter.getCase(caseId);
            assertEq(uint8(courtCase.state), uint8(TwoTierArbiter.CaseState.Appealed));
            assertEq(courtCase.appealedAt, appealedAt);
            assertEq(courtCase.humanDeadline, appealedAt + HUMAN_WINDOW);
            assertEq(courtCase.appealHash, APPEAL_HASH);
            _assertActiveProposal(commitmentId, PRIMARY_PENALTY, appealedAt);
        }
    }

    function testOutsiderZeroHashLateAndRepeatedAppealsRevert() public {
        uint256 commitmentId = _createCommitment();
        uint256 caseId = _open(commitmentId);

        vm.prank(outsider);
        vm.expectRevert(abi.encodeWithSelector(TwoTierArbiter.UnauthorizedAppellant.selector, outsider));
        arbiter.appeal(caseId, APPEAL_HASH);

        vm.prank(committer);
        vm.expectRevert(TwoTierArbiter.ZeroHash.selector);
        arbiter.appeal(caseId, bytes32(0));

        TwoTierArbiter.Case memory courtCase = arbiter.getCase(caseId);
        vm.warp(uint256(courtCase.appealDeadline) + 1);
        vm.prank(committer);
        vm.expectRevert(
            abi.encodeWithSelector(
                TwoTierArbiter.AppealWindowElapsed.selector, courtCase.appealDeadline, uint64(block.timestamp)
            )
        );
        arbiter.appeal(caseId, APPEAL_HASH);

        uint256 secondId = _createCommitment();
        uint256 secondCaseId = _open(secondId);
        _appeal(secondCaseId, committer);
        vm.prank(human);
        vm.expectRevert(
            abi.encodeWithSelector(
                TwoTierArbiter.WrongCaseState.selector,
                secondCaseId,
                TwoTierArbiter.CaseState.PrimaryRuling,
                TwoTierArbiter.CaseState.Appealed
            )
        );
        arbiter.appeal(secondCaseId, APPEAL_HASH);
    }

    function testAppealAtDeadlineIsTimelyAndResetsManagerTimestamp() public {
        uint256 commitmentId = _createCommitment();
        uint256 caseId = _open(commitmentId);
        uint64 oldInitiatedAt = manager.getForfeitProposal(commitmentId).initiatedAt;
        uint64 deadline = arbiter.getCase(caseId).appealDeadline;

        vm.warp(deadline);
        _appeal(caseId, committer);
        ICM.ForfeitProposal memory proposal = manager.getForfeitProposal(commitmentId);
        assertEq(proposal.initiatedAt, deadline);
        assertGt(proposal.initiatedAt, oldInitiatedAt);
        assertEq(proposal.penaltyBps, PRIMARY_PENALTY);
    }

    // ---------------------------------------------------------------------
    // Human ruling, dismissal, lapse, and withdrawal
    // ---------------------------------------------------------------------

    function testHumanCanAffirmIncreaseAndDecreaseWithFreshManagerWindows() public {
        uint16[3] memory finalPenalties = [PRIMARY_PENALTY, uint16(7000), uint16(1000)];
        for (uint256 i; i < finalPenalties.length; ++i) {
            (uint256 commitmentId, uint256 caseId) = _openAndAppeal();
            uint64 appealedProposalAt = manager.getForfeitProposal(commitmentId).initiatedAt;
            vm.warp(block.timestamp + 2 hours);
            uint64 ruledAt = uint64(block.timestamp);

            vm.prank(human);
            arbiter.resolveAppeal(caseId, finalPenalties[i], HUMAN_HASH);

            TwoTierArbiter.Case memory courtCase = arbiter.getCase(caseId);
            assertEq(uint8(courtCase.state), uint8(TwoTierArbiter.CaseState.HumanRuling));
            assertEq(courtCase.finalPenaltyBps, finalPenalties[i]);
            assertEq(courtCase.humanDecisionHash, HUMAN_HASH);
            _assertActiveProposal(commitmentId, finalPenalties[i], ruledAt);
            assertGt(ruledAt, appealedProposalAt);
        }
    }

    function testFuzzHumanPositivePenaltyMatchesOperativeProposal(uint16 finalPenaltyBps) public {
        finalPenaltyBps = uint16(bound(finalPenaltyBps, 1, MAX_PENALTY));
        (uint256 commitmentId, uint256 caseId) = _openAndAppeal();
        vm.prank(human);
        arbiter.resolveAppeal(caseId, finalPenaltyBps, HUMAN_HASH);
        assertEq(manager.getForfeitProposal(commitmentId).penaltyBps, finalPenaltyBps);
        assertEq(arbiter.getCase(caseId).finalPenaltyBps, finalPenaltyBps);
    }

    function testHumanDismissalCancelsWithoutCreatingZeroProposal() public {
        (uint256 commitmentId, uint256 caseId) = _openAndAppeal();
        vm.recordLogs();

        vm.prank(human);
        arbiter.resolveAppeal(caseId, 0, HUMAN_HASH);

        Vm.Log[] memory logs = vm.getRecordedLogs();
        bytes32 initiatedTopic = keccak256("ForfeitInitiated(uint256,uint16,uint64)");
        for (uint256 i; i < logs.length; ++i) {
            assertFalse(
                logs[i].emitter == address(manager) && logs[i].topics[0] == initiatedTopic,
                "dismissal must not create a manager proposal"
            );
        }

        ICM.ForfeitProposal memory proposal = manager.getForfeitProposal(commitmentId);
        assertEq(proposal.penaltyBps, PRIMARY_PENALTY, "last proposal was positive");
        assertTrue(proposal.cancelled);
        assertEq(arbiter.activeCaseOf(commitmentId), 0);
        assertEq(uint8(arbiter.getCase(caseId).state), uint8(TwoTierArbiter.CaseState.Dismissed));
        _assertCommitmentActive(commitmentId);
    }

    function testHumanAuthorizationDeadlineHashAndPenaltyBounds() public {
        (, uint256 caseId) = _openAndAppeal();

        vm.prank(outsider);
        vm.expectRevert(abi.encodeWithSelector(TwoTierArbiter.NotAppealController.selector, outsider));
        arbiter.resolveAppeal(caseId, PRIMARY_PENALTY, HUMAN_HASH);

        vm.prank(human);
        vm.expectRevert(TwoTierArbiter.ZeroHash.selector);
        arbiter.resolveAppeal(caseId, PRIMARY_PENALTY, bytes32(0));

        vm.prank(human);
        vm.expectRevert(
            abi.encodeWithSelector(TwoTierArbiter.PenaltyAboveCommitmentMax.selector, MAX_PENALTY, MAX_PENALTY + 1)
        );
        arbiter.resolveAppeal(caseId, MAX_PENALTY + 1, HUMAN_HASH);

        uint64 deadline = arbiter.getCase(caseId).humanDeadline;
        vm.warp(uint256(deadline) + 1);
        vm.prank(human);
        vm.expectRevert(
            abi.encodeWithSelector(
                TwoTierArbiter.HumanResponseWindowElapsed.selector, deadline, uint64(block.timestamp)
            )
        );
        arbiter.resolveAppeal(caseId, PRIMARY_PENALTY, HUMAN_HASH);
    }

    function testPermissionlessLapseAfterDeadlineCancelsAndLeavesCommitmentActive() public {
        (uint256 commitmentId, uint256 caseId) = _openAndAppeal();
        uint64 deadline = arbiter.getCase(caseId).humanDeadline;

        vm.warp(deadline);
        vm.prank(keeper);
        vm.expectRevert(abi.encodeWithSelector(TwoTierArbiter.HumanResponseWindowActive.selector, deadline, deadline));
        arbiter.lapseAppeal(caseId);

        vm.warp(uint256(deadline) + 1);
        vm.prank(keeper);
        arbiter.lapseAppeal(caseId);

        assertTrue(manager.getForfeitProposal(commitmentId).cancelled);
        assertEq(arbiter.activeCaseOf(commitmentId), 0);
        assertEq(uint8(arbiter.getCase(caseId).state), uint8(TwoTierArbiter.CaseState.Lapsed));
        _assertCommitmentActive(commitmentId);
    }

    function testOnlyPrimaryWithdrawsBeforeAppealAndReasonHashIsRequired() public {
        uint256 commitmentId = _createCommitment();
        uint256 caseId = _open(commitmentId);

        vm.prank(outsider);
        vm.expectRevert(abi.encodeWithSelector(TwoTierArbiter.NotPrimaryController.selector, outsider));
        arbiter.withdrawRuling(caseId, WITHDRAW_HASH);

        vm.prank(primary);
        vm.expectRevert(TwoTierArbiter.ZeroHash.selector);
        arbiter.withdrawRuling(caseId, bytes32(0));

        vm.prank(primary);
        arbiter.withdrawRuling(caseId, WITHDRAW_HASH);
        assertTrue(manager.getForfeitProposal(commitmentId).cancelled);
        assertEq(arbiter.activeCaseOf(commitmentId), 0);
        assertEq(uint8(arbiter.getCase(caseId).state), uint8(TwoTierArbiter.CaseState.Withdrawn));
        _assertCommitmentActive(commitmentId);

        uint256 nextId = _createCommitment();
        uint256 appealedCaseId = _open(nextId);
        _appeal(appealedCaseId, committer);
        vm.prank(primary);
        vm.expectRevert(
            abi.encodeWithSelector(
                TwoTierArbiter.WrongCaseState.selector,
                appealedCaseId,
                TwoTierArbiter.CaseState.PrimaryRuling,
                TwoTierArbiter.CaseState.Appealed
            )
        );
        arbiter.withdrawRuling(appealedCaseId, WITHDRAW_HASH);
    }

    // ---------------------------------------------------------------------
    // Execution, lien behavior, and reconciliation
    // ---------------------------------------------------------------------

    function testUnappealedExecutionIsPermissionless() public {
        uint256 commitmentId = _createCommitment();
        uint256 caseId = _open(commitmentId);
        ICM.ForfeitProposal memory proposal = manager.getForfeitProposal(commitmentId);

        vm.warp(uint256(proposal.initiatedAt) + WINDOW);
        vm.prank(keeper);
        arbiter.executeRuling(caseId);

        ICM.Commitment memory commitment = manager.getCommitment(commitmentId);
        assertTrue(commitment.forfeited);
        assertEq(manager.forfeitedUnitsOf(commitmentId), AMOUNT * PRIMARY_PENALTY / 10_000);
        assertEq(arbiter.activeCaseOf(commitmentId), 0);
        assertEq(uint8(arbiter.getCase(caseId).state), uint8(TwoTierArbiter.CaseState.Executed));
    }

    function testAppealedCaseCannotExecuteBeforeFinalHumanRuling() public {
        (, uint256 caseId) = _openAndAppeal();
        vm.expectRevert(
            abi.encodeWithSelector(
                TwoTierArbiter.RulingNotExecutable.selector, caseId, TwoTierArbiter.CaseState.Appealed
            )
        );
        arbiter.executeRuling(caseId);
    }

    function testPositiveHumanRulingExecutesAfterItsFreshChallengeWindow() public {
        (uint256 commitmentId, uint256 caseId) = _openAndAppeal();
        vm.warp(block.timestamp + 3 hours);
        vm.prank(human);
        arbiter.resolveAppeal(caseId, 6000, HUMAN_HASH);
        uint64 initiatedAt = manager.getForfeitProposal(commitmentId).initiatedAt;

        vm.warp(uint256(initiatedAt) + WINDOW - 1);
        vm.expectRevert(ICM.ChallengeWindowActive.selector);
        arbiter.executeRuling(caseId);

        vm.warp(uint256(initiatedAt) + WINDOW);
        arbiter.executeRuling(caseId);
        assertEq(manager.forfeitedUnitsOf(commitmentId), AMOUNT * 6000 / 10_000);
    }

    function testPendingProposalBlocksUnbondUntilWithdrawalCancelsIt() public {
        uint256 commitmentId = _createCommitment();
        vm.prank(committer);
        manager.requestUnbond(commitmentId);
        uint256 caseId = _open(commitmentId);

        vm.warp(block.timestamp + UNBONDING);
        vm.expectRevert(ICM.UnbondBlockedByForfeit.selector);
        manager.finalizeUnbond(commitmentId);

        vm.prank(primary);
        arbiter.withdrawRuling(caseId, WITHDRAW_HASH);
        manager.finalizeUnbond(commitmentId);
        assertTrue(manager.getCommitment(commitmentId).released);
    }

    function testDirectManagerExecutionThenSyncClosesLocalCase() public {
        uint256 commitmentId = _createCommitment();
        uint256 caseId = _open(commitmentId);
        uint64 initiatedAt = manager.getForfeitProposal(commitmentId).initiatedAt;

        vm.warp(uint256(initiatedAt) + WINDOW);
        vm.prank(outsider);
        manager.executeForfeit(commitmentId);
        assertEq(arbiter.activeCaseOf(commitmentId), caseId, "local case awaits reconciliation");

        vm.prank(keeper);
        arbiter.syncCase(caseId);
        assertEq(arbiter.activeCaseOf(commitmentId), 0);
        assertEq(uint8(arbiter.getCase(caseId).state), uint8(TwoTierArbiter.CaseState.Executed));

        vm.expectRevert(
            abi.encodeWithSelector(TwoTierArbiter.CaseNotLive.selector, caseId, TwoTierArbiter.CaseState.Executed)
        );
        arbiter.syncCase(caseId);
    }

    function testManagerStaleCancellationThenSyncFreesCommitmentForNewCase() public {
        uint256 commitmentId = _createCommitment();
        uint256 caseId = _open(commitmentId);
        uint64 initiatedAt = manager.getForfeitProposal(commitmentId).initiatedAt;

        vm.warp(uint256(initiatedAt) + WINDOW + manager.FORFEIT_PROPOSAL_TTL());
        vm.prank(outsider);
        manager.cancelStaleForfeitProposal(commitmentId);
        arbiter.syncCase(caseId);

        assertEq(arbiter.activeCaseOf(commitmentId), 0);
        assertEq(uint8(arbiter.getCase(caseId).state), uint8(TwoTierArbiter.CaseState.StaleCancelled));
        _assertCommitmentActive(commitmentId);

        uint256 nextCaseId = _open(commitmentId);
        assertGt(nextCaseId, caseId);
        assertEq(arbiter.activeCaseOf(commitmentId), nextCaseId);
    }

    function testStaleOldCaseCallsCannotTouchLaterCaseForSameCommitment() public {
        uint256 commitmentId = _createCommitment();
        uint256 oldCaseId = _open(commitmentId);
        _appeal(oldCaseId, committer);
        vm.prank(human);
        arbiter.resolveAppeal(oldCaseId, 0, HUMAN_HASH);

        uint256 newCaseId = _open(commitmentId);
        ICM.ForfeitProposal memory beforeProposal = manager.getForfeitProposal(commitmentId);

        vm.prank(committer);
        vm.expectRevert(
            abi.encodeWithSelector(
                TwoTierArbiter.WrongCaseState.selector,
                oldCaseId,
                TwoTierArbiter.CaseState.PrimaryRuling,
                TwoTierArbiter.CaseState.Dismissed
            )
        );
        arbiter.appeal(oldCaseId, APPEAL_HASH);

        vm.prank(primary);
        vm.expectRevert(
            abi.encodeWithSelector(
                TwoTierArbiter.WrongCaseState.selector,
                oldCaseId,
                TwoTierArbiter.CaseState.PrimaryRuling,
                TwoTierArbiter.CaseState.Dismissed
            )
        );
        arbiter.withdrawRuling(oldCaseId, WITHDRAW_HASH);

        vm.expectRevert(
            abi.encodeWithSelector(
                TwoTierArbiter.RulingNotExecutable.selector, oldCaseId, TwoTierArbiter.CaseState.Dismissed
            )
        );
        arbiter.executeRuling(oldCaseId);

        ICM.ForfeitProposal memory afterProposal = manager.getForfeitProposal(commitmentId);
        assertEq(arbiter.activeCaseOf(commitmentId), newCaseId);
        assertEq(afterProposal.initiatedAt, beforeProposal.initiatedAt);
        assertEq(afterProposal.penaltyBps, beforeProposal.penaltyBps);
        assertFalse(afterProposal.cancelled);
        assertFalse(afterProposal.executed);
    }

    function testUnknownAndOutOfOrderTransitionsRevert() public {
        vm.expectRevert(abi.encodeWithSelector(TwoTierArbiter.UnknownCase.selector, 777));
        arbiter.getCase(777);

        uint256 commitmentId = _createCommitment();
        uint256 caseId = _open(commitmentId);

        vm.prank(human);
        vm.expectRevert(
            abi.encodeWithSelector(
                TwoTierArbiter.WrongCaseState.selector,
                caseId,
                TwoTierArbiter.CaseState.Appealed,
                TwoTierArbiter.CaseState.PrimaryRuling
            )
        );
        arbiter.resolveAppeal(caseId, PRIMARY_PENALTY, HUMAN_HASH);

        vm.expectRevert(
            abi.encodeWithSelector(
                TwoTierArbiter.WrongCaseState.selector,
                caseId,
                TwoTierArbiter.CaseState.Appealed,
                TwoTierArbiter.CaseState.PrimaryRuling
            )
        );
        arbiter.lapseAppeal(caseId);

        vm.expectRevert(abi.encodeWithSelector(TwoTierArbiter.ManagerProposalNotActive.selector, commitmentId));
        arbiter.syncCase(caseId);
    }
}
