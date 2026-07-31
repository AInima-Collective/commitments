// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import {GovernorTestBase} from "./GovernorTestBase.sol";
import {
    GovernorCountingSimpleUpgradeable
} from "@openzeppelin/contracts-upgradeable/governance/extensions/GovernorCountingSimpleUpgradeable.sol";

import {TokenWeighting} from "src/extensions/mesh/TokenWeighting.sol";
import {ITokenWeighting} from "src/extensions/mesh/interfaces/ITokenWeighting.sol";

/// @notice Whitepaper §6 use case: DAO weighting votes by stake at risk —
///         changes the per-denom weights via a governance proposal.
contract CommitmentsGovernorWeightUpdateTest is GovernorTestBase {
    bytes32 internal constant DENOM_USDC = keccak256("USDC");

    function setUp() public {
        _deployDAO();

        // Stake voting power. Total = 1000; quorum = 4% = 40.
        _stake(alice, 600e18);
        _stake(bob, 400e18);

        vm.roll(block.number + 1);
    }

    function test_DAO_updatesTokenWeightingWeight_viaProposal() public {
        // Sanity: USDC weight is 0 to start (not registered).
        assertEq(tw.weights(DENOM_USDC), 0);

        // Build a proposal: target = TokenWeighting, calldata = updateWeight(USDC, 8000).
        (address[] memory targets, uint256[] memory values, bytes[] memory calldatas) =
            _singleAction(address(tw), 0, abi.encodeCall(TokenWeighting.updateWeight, (DENOM_USDC, 8000)));
        string memory description = "[Weight] Register USDC at 0.8x";

        uint256 proposalId = _proposeAndAdvance(alice, targets, values, calldatas, description);
        _castVote(proposalId, alice, uint8(GovernorCountingSimpleUpgradeable.VoteType.For));
        _castVote(proposalId, bob, uint8(GovernorCountingSimpleUpgradeable.VoteType.For));
        _advancePastDeadline();

        _queue(targets, values, calldatas, description);
        _execute(targets, values, calldatas, description);

        // Effect: weight is now 8000.
        assertEq(tw.weights(DENOM_USDC), 8000);
    }

    function test_DAO_cannotUpdateWeight_outsideProposalPath() public {
        // Direct call from any non-timelock address must revert OnlyGovernance.
        // (After _deployDAO, governance == timelock.)
        vm.prank(alice);
        vm.expectRevert(ITokenWeighting.OnlyGovernance.selector);
        tw.updateWeight(DENOM_USDC, 8000);

        // Even the original admin no longer has updateWeight access.
        vm.prank(admin);
        vm.expectRevert(ITokenWeighting.OnlyGovernance.selector);
        tw.updateWeight(DENOM_USDC, 8000);
    }

    function test_DAO_updatesItsOwnQuorumNumerator_viaSelfProposal() public {
        // Self-administered: Governor's setter is gated by onlyGovernance,
        // so it must be called by the Timelock via a successful proposal.
        (address[] memory targets, uint256[] memory values, bytes[] memory calldatas) =
            _singleAction(address(governor), 0, abi.encodeWithSignature("updateQuorumNumerator(uint256)", 8));
        string memory description = "[Governor] Bump quorum to 8%";

        uint256 proposalId = _proposeAndAdvance(alice, targets, values, calldatas, description);
        _castVote(proposalId, alice, uint8(GovernorCountingSimpleUpgradeable.VoteType.For));
        _castVote(proposalId, bob, uint8(GovernorCountingSimpleUpgradeable.VoteType.For));
        _advancePastDeadline();

        _queue(targets, values, calldatas, description);
        _execute(targets, values, calldatas, description);

        assertEq(governor.quorumNumerator(), 8);
    }
}
