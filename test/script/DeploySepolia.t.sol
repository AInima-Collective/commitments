// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import {Test} from "forge-std/Test.sol";

import {DeploySepolia} from "script/DeploySepolia.s.sol";
import {ICommitmentManager as ICM} from "src/core/interfaces/ICommitmentManager.sol";
import {StrategyBinding} from "src/core/interfaces/IDistributionStrategy.sol";
import {TokenWeighting} from "src/extensions/mesh/TokenWeighting.sol";

/// @dev Runs the script's composition with this harness as admin and broadcaster.
contract DeploySepoliaHarness is DeploySepolia {
    function compose() external {
        _loadConfig();
        admin = address(this);
        arbiterOwner = address(this);
        _deploy();
    }

    function operatorStakeTarget()
        external
        view
        returns (address manager_, address registry_, address token_, address adapter_, address arbiter_, uint256 min_)
    {
        return (
            address(manager),
            address(operatorRegistry),
            address(faucetToken),
            address(erc20Adapter),
            address(manualArbiter),
            minOperatorStake
        );
    }

    function nodes() external view returns (address tw, address serviceRegistry) {
        return (tokenWeightingNode, address(stakeRegistry));
    }
}

interface IMint {
    function mint(address to, uint256 amount) external;
    function approve(address spender, uint256 amount) external returns (bool);
}

interface IRegister {
    function register(uint256 commitmentId) external;
}

interface IServiceWeight {
    function getOperatorWeight(address operator) external view returns (uint256);
}

contract DeploySepoliaTest is Test {
    function test_composition_registeredStakeGivesVotingPower() public {
        DeploySepoliaHarness h = new DeploySepoliaHarness();
        h.compose();
        (address manager, address registry, address token, address adapter, address arbiter, uint256 amount) =
            h.operatorStakeTarget();
        (address tw, address serviceRegistry) = h.nodes();

        address operator = makeAddr("operator");
        IMint(token).mint(operator, amount);
        vm.startPrank(operator);
        IMint(token).approve(manager, amount);
        ICM(manager).deposit(token, amount);
        ICM.CommitmentParams memory p;
        p.arbiter = arbiter;
        p.counterparty = registry;
        p.token = token;
        p.adapter = adapter;
        p.amount = amount;
        p.maxPenaltyBps = 10_000;
        p.challengeWindow = 2 days;
        p.strategies = new StrategyBinding[](0);
        uint256 id = ICM(manager).createCommitment(p);
        IRegister(registry).register(id);
        vm.stopPrank();

        uint256 power = TokenWeighting(tw).getVotingPower(operator);
        assertEq(power, amount, "registered stake gives 1:1 voting power");
        assertEq(IServiceWeight(serviceRegistry).getOperatorWeight(operator), power, "service registry reads it");
    }
}
