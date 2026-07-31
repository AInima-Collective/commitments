// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import {Test} from "forge-std/Test.sol";
import {Clones} from "@openzeppelin/contracts/proxy/Clones.sol";
import {ERC1967Proxy} from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";
import {
    TimelockControllerUpgradeable
} from "@openzeppelin/contracts-upgradeable/governance/TimelockControllerUpgradeable.sol";
import {IVotes} from "@openzeppelin/contracts/governance/utils/IVotes.sol";

import {TokenWeighting} from "src/extensions/mesh/TokenWeighting.sol";
import {TokenWeightingVotesShim} from "src/periphery/governance/TokenWeightingVotesShim.sol";
import {CommitmentsGovernor} from "src/periphery/governance/CommitmentsGovernor.sol";
import {CommitmentsTimelock} from "src/periphery/governance/CommitmentsTimelock.sol";

/// @notice Shared fixture for Governor tests. Deploys the full DAO suite
///         (TokenWeighting + Shim + Timelock + Governor) with sensible defaults
///         and exposes helpers for staking, proposing, voting, queueing, executing.
contract GovernorTestBase is Test {
    // --- actors ---
    address internal admin = address(0xA0);
    address internal provider = address(0x9001);
    address internal alice = address(0xA11CE);
    address internal bob = address(0xB0B);
    address internal carol = address(0xCA801);
    address internal dave = address(0xDA7E);

    // --- denoms ---
    bytes32 internal constant DENOM_WSTETH = keccak256("wstETH");

    // --- deployed suite ---
    TokenWeighting internal tw;
    TokenWeightingVotesShim internal shim;
    CommitmentsTimelock internal timelock;
    CommitmentsGovernor internal governor;

    // --- params ---
    uint48 internal constant VOTING_DELAY = 5;
    uint32 internal constant VOTING_PERIOD = 50;
    uint256 internal constant PROPOSAL_THRESHOLD = 0;
    uint256 internal constant QUORUM_NUMERATOR = 4; // 4% of past total
    uint48 internal constant LATE_QUORUM_EXTENSION = 10;
    uint256 internal constant TIMELOCK_DELAY = 30; // seconds

    function _deployDAO() internal {
        // 1. TokenWeighting clone, governance starts with admin
        address twImpl = address(new TokenWeighting());
        tw = TokenWeighting(Clones.clone(twImpl));
        tw.initialize(provider, admin);

        vm.prank(admin);
        tw.updateWeight(DENOM_WSTETH, 10000); // 1.0x

        // 2. Shim wraps the source
        shim = new TokenWeightingVotesShim(tw);

        // 3. Timelock — admin grants self briefly so it can wire roles below; then renounces.
        address[] memory empty = new address[](0);
        CommitmentsTimelock timelockImpl = new CommitmentsTimelock();
        ERC1967Proxy timelockProxy = new ERC1967Proxy(
            address(timelockImpl),
            abi.encodeCall(TimelockControllerUpgradeable.initialize, (TIMELOCK_DELAY, empty, empty, address(this)))
        );
        timelock = CommitmentsTimelock(payable(address(timelockProxy)));

        // 4. Governor proxy
        CommitmentsGovernor governorImpl = new CommitmentsGovernor();
        ERC1967Proxy governorProxy = new ERC1967Proxy(
            address(governorImpl),
            abi.encodeCall(
                CommitmentsGovernor.initialize,
                (
                    "Commitments DAO",
                    IVotes(address(shim)),
                    TimelockControllerUpgradeable(payable(address(timelock))),
                    VOTING_DELAY,
                    VOTING_PERIOD,
                    PROPOSAL_THRESHOLD,
                    QUORUM_NUMERATOR,
                    LATE_QUORUM_EXTENSION
                )
            )
        );
        governor = CommitmentsGovernor(payable(address(governorProxy)));

        // 5. Wire roles: governor is sole proposer (also gets canceller automatically),
        //    open execution (executor = address(0)). Then renounce admin so the
        //    timelock self-administers.
        timelock.grantRole(timelock.PROPOSER_ROLE(), address(governor));
        timelock.grantRole(timelock.EXECUTOR_ROLE(), address(0));
        timelock.renounceRole(timelock.DEFAULT_ADMIN_ROLE(), address(this));

        // 6. Hand TokenWeighting governance over to the Timelock so the DAO can
        //    drive updateWeight via successful proposals.
        vm.prank(admin);
        tw.transferGovernance(address(timelock));
    }

    function _stake(address staker, uint256 amount) internal {
        vm.prank(provider);
        tw.stake(staker, DENOM_WSTETH, amount);
    }

    function _proposeAndAdvance(
        address proposer,
        address[] memory targets,
        uint256[] memory values,
        bytes[] memory calldatas,
        string memory description
    ) internal returns (uint256 proposalId) {
        vm.prank(proposer);
        proposalId = governor.propose(targets, values, calldatas, description);
        vm.roll(block.number + VOTING_DELAY + 1);
    }

    function _castVote(uint256 proposalId, address voter, uint8 support) internal {
        vm.prank(voter);
        governor.castVote(proposalId, support);
    }

    function _advancePastDeadline() internal {
        vm.roll(block.number + VOTING_PERIOD + LATE_QUORUM_EXTENSION + 1);
    }

    function _queue(
        address[] memory targets,
        uint256[] memory values,
        bytes[] memory calldatas,
        string memory description
    ) internal {
        governor.queue(targets, values, calldatas, keccak256(bytes(description)));
        vm.warp(block.timestamp + TIMELOCK_DELAY + 1);
    }

    function _execute(
        address[] memory targets,
        uint256[] memory values,
        bytes[] memory calldatas,
        string memory description
    ) internal {
        governor.execute(targets, values, calldatas, keccak256(bytes(description)));
    }

    function _singleAction(address target, uint256 value, bytes memory data)
        internal
        pure
        returns (address[] memory targets, uint256[] memory values, bytes[] memory calldatas)
    {
        targets = new address[](1);
        values = new uint256[](1);
        calldatas = new bytes[](1);
        targets[0] = target;
        values[0] = value;
        calldatas[0] = data;
    }
}
