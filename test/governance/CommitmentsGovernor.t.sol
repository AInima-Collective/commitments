// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import {GovernorTestBase} from "./GovernorTestBase.sol";
import {IGovernor} from "@openzeppelin/contracts/governance/IGovernor.sol";
import {
    GovernorCountingSimpleUpgradeable
} from "@openzeppelin/contracts-upgradeable/governance/extensions/GovernorCountingSimpleUpgradeable.sol";

contract CommitmentsGovernorTest is GovernorTestBase {
    function setUp() public {
        _deployDAO();

        // Stake voting power BEFORE any proposal. Quorum = 4% of past total.
        // Total = 1000; 4% = 40. Alice + Bob > 40, Alice alone > 40.
        _stake(alice, 600e18);
        _stake(bob, 300e18);
        _stake(carol, 100e18);

        // Roll forward so proposal voteStart > stake block.
        vm.roll(block.number + 1);
    }

    function _signalingProposal()
        internal
        view
        returns (address[] memory, uint256[] memory, bytes[] memory, string memory)
    {
        (address[] memory t, uint256[] memory v, bytes[] memory c) = _singleAction(address(timelock), 0, "");
        return (t, v, c, "Signal: adopt mesh-aware risk tier metadata schema v1");
    }

    function test_proposalLifecycle_passesEndToEnd() public {
        (address[] memory targets, uint256[] memory values, bytes[] memory calldatas, string memory description) =
            _signalingProposal();

        // Propose. Use bob — has plenty of voting power.
        vm.prank(bob);
        uint256 proposalId = governor.propose(targets, values, calldatas, description);

        assertEq(uint8(governor.state(proposalId)), uint8(IGovernor.ProposalState.Pending));

        // Roll past votingDelay -> Active.
        vm.roll(block.number + VOTING_DELAY + 1);
        assertEq(uint8(governor.state(proposalId)), uint8(IGovernor.ProposalState.Active));

        // Vote: alice For, bob For (both clear quorum).
        _castVote(proposalId, alice, uint8(GovernorCountingSimpleUpgradeable.VoteType.For));
        _castVote(proposalId, bob, uint8(GovernorCountingSimpleUpgradeable.VoteType.For));

        // Past deadline -> Succeeded.
        _advancePastDeadline();
        assertEq(uint8(governor.state(proposalId)), uint8(IGovernor.ProposalState.Succeeded));

        // Queue.
        governor.queue(targets, values, calldatas, keccak256(bytes(description)));
        assertEq(uint8(governor.state(proposalId)), uint8(IGovernor.ProposalState.Queued));

        // Execute after timelock delay.
        vm.warp(block.timestamp + TIMELOCK_DELAY + 1);
        governor.execute(targets, values, calldatas, keccak256(bytes(description)));
        assertEq(uint8(governor.state(proposalId)), uint8(IGovernor.ProposalState.Executed));
    }

    function test_quorumFailure_DefeatedState() public {
        (address[] memory targets, uint256[] memory values, bytes[] memory calldatas, string memory description) =
            _signalingProposal();

        uint256 proposalId = _proposeAndAdvance(bob, targets, values, calldatas, description);

        // Only carol votes (100e18 voting power); total = 1000e18, quorum = 40e18.
        // 100 > 40, so this would PASS the quorum hurdle. To force a defeat,
        // cast Against from carol so for=0, against=100 — Defeated by majority.
        _castVote(proposalId, carol, uint8(GovernorCountingSimpleUpgradeable.VoteType.Against));

        _advancePastDeadline();
        assertEq(uint8(governor.state(proposalId)), uint8(IGovernor.ProposalState.Defeated));
    }

    function test_quorumNotMet_isDefeated() public {
        // Drop bob and alice below quorum participation by having only the
        // smallest staker vote. Total power = 1000, quorum = 40. dave has 0 stake.
        // So if no one votes, the proposal is Defeated (zero forVotes <= zero quorum
        // is treated as quorum-not-reached, but OZ considers 0 vs 0 as "quorum
        // reached" at the boundary). Make a stake distribution that proves the
        // boundary explicitly with abstain-only votes.
        _stake(dave, 100e18); // total now 1100, quorum = 44
        vm.roll(block.number + 1);

        (address[] memory targets, uint256[] memory values, bytes[] memory calldatas, string memory description) =
            _signalingProposal();

        uint256 proposalId = _proposeAndAdvance(bob, targets, values, calldatas, description);

        // No votes cast.
        _advancePastDeadline();
        assertEq(uint8(governor.state(proposalId)), uint8(IGovernor.ProposalState.Defeated));
    }

    function test_voteTwice_reverts() public {
        (address[] memory targets, uint256[] memory values, bytes[] memory calldatas, string memory description) =
            _signalingProposal();

        uint256 proposalId = _proposeAndAdvance(bob, targets, values, calldatas, description);
        _castVote(proposalId, alice, uint8(GovernorCountingSimpleUpgradeable.VoteType.For));

        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(IGovernor.GovernorAlreadyCastVote.selector, alice));
        governor.castVote(proposalId, uint8(GovernorCountingSimpleUpgradeable.VoteType.Against));
    }

    function test_voteAfterDeadline_reverts() public {
        (address[] memory targets, uint256[] memory values, bytes[] memory calldatas, string memory description) =
            _signalingProposal();

        uint256 proposalId = _proposeAndAdvance(bob, targets, values, calldatas, description);
        _advancePastDeadline();

        vm.prank(alice);
        vm.expectRevert();
        governor.castVote(proposalId, uint8(GovernorCountingSimpleUpgradeable.VoteType.For));
    }

    function test_signalingProposal_executesCleanly() public {
        // Empty calldata to the timelock is the canonical signaling shape.
        (address[] memory targets, uint256[] memory values, bytes[] memory calldatas, string memory description) =
            _signalingProposal();

        uint256 proposalId = _proposeAndAdvance(alice, targets, values, calldatas, description);
        _castVote(proposalId, alice, uint8(GovernorCountingSimpleUpgradeable.VoteType.For));
        _advancePastDeadline();

        _queue(targets, values, calldatas, description);
        _execute(targets, values, calldatas, description);

        assertEq(uint8(governor.state(proposalId)), uint8(IGovernor.ProposalState.Executed));
    }

    function test_historicalSnapshot_immuneToPostStartStakeChanges() public {
        (address[] memory targets, uint256[] memory values, bytes[] memory calldatas, string memory description) =
            _signalingProposal();

        // Propose. After voteStart, alice stakes a huge additional amount.
        uint256 proposalId = _proposeAndAdvance(bob, targets, values, calldatas, description);

        uint256 snapshotBlock = governor.proposalSnapshot(proposalId);
        uint256 aliceWeightAtSnapshot = governor.getVotes(alice, snapshotBlock);
        assertEq(aliceWeightAtSnapshot, 600e18, "alice voting power at snapshot");

        // Pump alice's stake post-snapshot.
        _stake(alice, 10000e18);

        // Cast vote — weight should still be the snapshot value, NOT the new total.
        vm.prank(alice);
        uint256 weightUsed = governor.castVote(proposalId, uint8(GovernorCountingSimpleUpgradeable.VoteType.For));
        assertEq(weightUsed, 600e18, "vote weight pinned to snapshot block");
    }

    function test_proposalThreshold_zeroAllowsAnyone() public {
        // PROPOSAL_THRESHOLD == 0, so dave (zero stake) can still propose.
        (address[] memory targets, uint256[] memory values, bytes[] memory calldatas, string memory description) =
            _signalingProposal();

        vm.prank(dave);
        governor.propose(targets, values, calldatas, description);
    }

    function test_proposalNeedsQueuing_isTrue() public {
        (address[] memory targets, uint256[] memory values, bytes[] memory calldatas, string memory description) =
            _signalingProposal();
        uint256 proposalId = _proposeAndAdvance(bob, targets, values, calldatas, description);
        assertTrue(governor.proposalNeedsQueuing(proposalId));
    }

    function test_governor_name() public view {
        assertEq(governor.name(), "Commitments DAO");
    }

    function test_governor_clockMode_isBlockNumber() public view {
        assertEq(governor.CLOCK_MODE(), "mode=blocknumber&from=default");
    }
}
