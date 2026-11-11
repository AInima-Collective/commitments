// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import {Test} from "forge-std/Test.sol";
import {Clones} from "@openzeppelin/contracts/proxy/Clones.sol";
import {
    TimelockControllerUpgradeable
} from "@openzeppelin/contracts-upgradeable/governance/TimelockControllerUpgradeable.sol";
import {IAccessControl} from "@openzeppelin/contracts/access/IAccessControl.sol";

import {TokenWeighting} from "src/extensions/mesh/TokenWeighting.sol";
import {CommitmentsGovernor} from "src/periphery/governance/CommitmentsGovernor.sol";
import {CommitmentsTimelock} from "src/periphery/governance/CommitmentsTimelock.sol";
import {TokenWeightingVotesShim} from "src/periphery/governance/TokenWeightingVotesShim.sol";
import {GovernorFactory} from "src/periphery/governance/GovernorFactory.sol";
import {IVotingPowerSource} from "src/shared/interfaces/IVotingPowerSource.sol";

contract GovernorFactoryTest is Test {
    GovernorFactory internal factory;
    TokenWeighting internal tw;
    address internal admin = address(0xA0);
    address internal provider = address(0x9001);

    bytes32 internal constant DENOM = keccak256("wstETH");

    function setUp() public {
        // A real source. Not strictly required for factory tests, but exercises
        // the full deploy → init flow.
        address twImpl = address(new TokenWeighting());
        tw = TokenWeighting(Clones.clone(twImpl));
        tw.initialize(provider, admin);

        address governorImpl = address(new CommitmentsGovernor());
        address timelockImpl = address(new CommitmentsTimelock());
        factory = new GovernorFactory(governorImpl, timelockImpl);
    }

    function _baseCfg() internal view returns (GovernorFactory.DAOConfig memory) {
        return GovernorFactory.DAOConfig({
            name: "Commitments DAO",
            source: IVotingPowerSource(address(tw)),
            timelockMinDelay: 30,
            votingDelay: 5,
            votingPeriod: 50,
            proposalThreshold: 0,
            quorumNumerator: 4,
            lateQuorumExtension: 10
        });
    }

    function test_deploy_returnsLinkedDAOComponents() public {
        GovernorFactory.DAOConfig memory cfg = _baseCfg();
        GovernorFactory.DAODeployment memory dao = factory.deploy(cfg);

        // Wired correctly:
        assertEq(dao.source, address(tw));
        assertEq(CommitmentsGovernor(payable(dao.governor)).timelock(), dao.timelock);
        // Governor.token() — the IVotes ref — is the shim.
        assertEq(address(CommitmentsGovernor(payable(dao.governor)).token()), dao.shim);
        // Shim wraps the source.
        assertEq(address(TokenWeightingVotesShim(dao.shim).source()), address(tw));
        // Governor name persisted.
        assertEq(CommitmentsGovernor(payable(dao.governor)).name(), "Commitments DAO");
    }

    function test_deploy_timelockRolesWiredCorrectly() public {
        GovernorFactory.DAODeployment memory dao = factory.deploy(_baseCfg());
        TimelockControllerUpgradeable tl = TimelockControllerUpgradeable(payable(dao.timelock));

        // Governor has PROPOSER + CANCELLER.
        assertTrue(tl.hasRole(tl.PROPOSER_ROLE(), dao.governor));
        assertTrue(tl.hasRole(tl.CANCELLER_ROLE(), dao.governor));
        // Open execution.
        assertTrue(tl.hasRole(tl.EXECUTOR_ROLE(), address(0)));
        // Factory has renounced admin.
        assertFalse(tl.hasRole(tl.DEFAULT_ADMIN_ROLE(), address(factory)));
        // Timelock self-administers (DEFAULT_ADMIN_ROLE held by timelock itself).
        assertTrue(tl.hasRole(tl.DEFAULT_ADMIN_ROLE(), dao.timelock));
    }

    function test_deploy_secondTimelockInitReverts() public {
        GovernorFactory.DAODeployment memory dao = factory.deploy(_baseCfg());

        address[] memory empty = new address[](0);
        vm.expectRevert();
        TimelockControllerUpgradeable(payable(dao.timelock)).initialize(0, empty, empty, address(this));
    }

    function test_deploy_zeroSourceReverts() public {
        GovernorFactory.DAOConfig memory cfg = _baseCfg();
        cfg.source = IVotingPowerSource(address(0));
        vm.expectRevert(GovernorFactory.ZeroAddress.selector);
        factory.deploy(cfg);
    }

    function test_constructor_zeroAddressReverts() public {
        address timelockImpl = address(new CommitmentsTimelock());
        vm.expectRevert(GovernorFactory.ZeroAddress.selector);
        new GovernorFactory(address(0), timelockImpl);

        address governorImpl = address(new CommitmentsGovernor());
        vm.expectRevert(GovernorFactory.ZeroAddress.selector);
        new GovernorFactory(governorImpl, address(0));
    }

    function test_canonicalGovernor_setOnce() public {
        GovernorFactory.DAODeployment memory dao = factory.deploy(_baseCfg());
        assertEq(factory.canonicalGovernor(), address(0));

        factory.setCanonicalGovernor(dao.governor);
        assertEq(factory.canonicalGovernor(), dao.governor);

        // Cannot reassign.
        GovernorFactory.DAODeployment memory dao2 = factory.deploy(_baseCfg());
        vm.expectRevert(GovernorFactory.CanonicalAlreadySet.selector);
        factory.setCanonicalGovernor(dao2.governor);
    }

    function test_setCanonicalGovernor_onlyDeployer() public {
        assertEq(factory.deployer(), address(this));
        GovernorFactory.DAODeployment memory dao = factory.deploy(_baseCfg());

        // deploy() is permissionless, so a stranger can make a DAO but not claim the slot.
        vm.prank(makeAddr("stranger"));
        vm.expectRevert(GovernorFactory.NotDeployer.selector);
        factory.setCanonicalGovernor(dao.governor);
        assertEq(factory.canonicalGovernor(), address(0));
    }

    function test_setCanonicalGovernor_unknownReverts() public {
        vm.expectRevert(GovernorFactory.UnknownGovernor.selector);
        factory.setCanonicalGovernor(address(0xDEAD));
    }
}
