// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import {GovernorTestBase} from "./GovernorTestBase.sol";
import {
    GovernorCountingSimpleUpgradeable
} from "@openzeppelin/contracts-upgradeable/governance/extensions/GovernorCountingSimpleUpgradeable.sol";

/// @notice Minimal mock that mimics CommitmentManager's arbiter check pattern
///         (msg.sender == c.arbiter). Used to prove the DAO Timelock can drive
///         initiateForfeit / cancelForfeit through a successful proposal — without
///         spinning up the full vault + manager + operator-registry stack.
contract MockArbiterTarget {
    error NotArbiter(address caller, address expected);

    address public arbiter;
    uint256 public lastForfeitCommitmentId;
    uint16 public lastForfeitPenaltyBps;
    bool public lastForfeitCancelled;
    address public lastCaller;

    constructor(address arbiter_) {
        arbiter = arbiter_;
    }

    function initiateForfeit(uint256 commitmentId, uint16 penaltyBps) external {
        if (msg.sender != arbiter) revert NotArbiter(msg.sender, arbiter);
        lastForfeitCommitmentId = commitmentId;
        lastForfeitPenaltyBps = penaltyBps;
        lastForfeitCancelled = false;
        lastCaller = msg.sender;
    }

    function cancelForfeit(uint256 commitmentId) external {
        if (msg.sender != arbiter) revert NotArbiter(msg.sender, arbiter);
        lastForfeitCommitmentId = commitmentId;
        lastForfeitCancelled = true;
        lastCaller = msg.sender;
    }
}

contract CommitmentsGovernorForfeitTest is GovernorTestBase {
    MockArbiterTarget internal mockManager;

    function setUp() public {
        _deployDAO();

        // Bind a mock CommitmentManager-shaped target whose arbiter is the Timelock.
        mockManager = new MockArbiterTarget(address(timelock));

        _stake(alice, 600e18);
        _stake(bob, 400e18);
        vm.roll(block.number + 1);
    }

    function test_DAO_initiatesForfeit_viaProposalAndTimelock() public {
        uint256 commitmentId = 42;
        uint16 penaltyBps = 2500;

        (address[] memory targets, uint256[] memory values, bytes[] memory calldatas) = _singleAction(
            address(mockManager), 0, abi.encodeCall(MockArbiterTarget.initiateForfeit, (commitmentId, penaltyBps))
        );
        string memory description = "[Forfeit] initiateForfeit on commitment #42 at 25%";

        uint256 proposalId = _proposeAndAdvance(alice, targets, values, calldatas, description);
        _castVote(proposalId, alice, uint8(GovernorCountingSimpleUpgradeable.VoteType.For));
        _castVote(proposalId, bob, uint8(GovernorCountingSimpleUpgradeable.VoteType.For));
        _advancePastDeadline();

        _queue(targets, values, calldatas, description);
        _execute(targets, values, calldatas, description);

        assertEq(mockManager.lastForfeitCommitmentId(), commitmentId);
        assertEq(mockManager.lastForfeitPenaltyBps(), penaltyBps);
        assertEq(mockManager.lastCaller(), address(timelock));
        assertFalse(mockManager.lastForfeitCancelled());
    }

    function test_DAO_cancelsForfeit_viaSecondProposal() public {
        // First initiate.
        test_DAO_initiatesForfeit_viaProposalAndTimelock();

        uint256 commitmentId = 42;
        (address[] memory targets, uint256[] memory values, bytes[] memory calldatas) =
            _singleAction(address(mockManager), 0, abi.encodeCall(MockArbiterTarget.cancelForfeit, (commitmentId)));
        string memory description = "[Forfeit] cancelForfeit on commitment #42";

        uint256 proposalId = _proposeAndAdvance(alice, targets, values, calldatas, description);
        _castVote(proposalId, alice, uint8(GovernorCountingSimpleUpgradeable.VoteType.For));
        _castVote(proposalId, bob, uint8(GovernorCountingSimpleUpgradeable.VoteType.For));
        _advancePastDeadline();

        _queue(targets, values, calldatas, description);
        _execute(targets, values, calldatas, description);

        assertTrue(mockManager.lastForfeitCancelled());
        assertEq(mockManager.lastCaller(), address(timelock));
    }

    function test_DAO_cannotInitiateForfeit_outsideProposalPath() public {
        // Direct call from a non-timelock address reverts.
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(MockArbiterTarget.NotArbiter.selector, alice, address(timelock)));
        mockManager.initiateForfeit(42, 2500);

        // Even the Governor itself cannot — only the Timelock is the arbiter.
        vm.prank(address(governor));
        vm.expectRevert(
            abi.encodeWithSelector(MockArbiterTarget.NotArbiter.selector, address(governor), address(timelock))
        );
        mockManager.initiateForfeit(42, 2500);
    }
}
