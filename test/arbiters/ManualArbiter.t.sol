// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

import {ManualArbiter} from "src/periphery/arbiters/ManualArbiter.sol";
import {ICommitmentManager as ICM} from "src/core/interfaces/ICommitmentManager.sol";
import {StrategyBinding} from "src/core/interfaces/IDistributionStrategy.sol";
import {ManagerTestBase} from "../helpers/ManagerTestBase.sol";

/// @title ManualArbiterTest
/// @notice Owner-gated arbiter dispatch against the real `CommitmentManager`:
///         forfeit/release lifecycle, agreement actions, bilateral settle,
///         ownerless execute, and two-step ownership handoff.
contract ManualArbiterTest is ManagerTestBase {
    ManualArbiter public arbiter;

    address public owner = makeAddr("owner");
    address public newOwner = makeAddr("newOwner");
    address public nonOwner = makeAddr("nonOwner");
    address public committer = makeAddr("committer");
    address public counterparty = makeAddr("counterparty");
    address public proposer = makeAddr("proposer");
    address public acceptor = makeAddr("acceptor");

    uint256 public constant DEPOSIT = 1000e18;
    uint256 public constant AMOUNT = 100e18;
    uint16 public constant MAX_PENALTY_BPS = 10_000;

    function setUp() public override {
        super.setUp();

        arbiter = new ManualArbiter(owner, address(manager));

        _deposit(committer, DEPOSIT);
        _deposit(proposer, DEPOSIT);
        _deposit(acceptor, DEPOSIT);
    }

    // ---- helpers -----------------------------------------------------------

    function _createCommitment(address who, uint256 amount) internal returns (uint256 cid) {
        cid = _createAs(who, _baseParams(address(arbiter), counterparty, amount, MAX_PENALTY_BPS));
    }

    function _entParams() internal view returns (ICM.AgreementParams memory p) {
        p.arbiter = address(arbiter);
        p.acceptor = acceptor;
        p.proposerLeg = ICM.LegTerms(address(token), address(staticAdapter), AMOUNT, 5000, new StrategyBinding[](0));
        p.acceptorLeg = ICM.LegTerms(address(token), address(staticAdapter), AMOUNT, 5000, new StrategyBinding[](0));
        p.challengeWindow = WINDOW;
        p.proposalDuration = 1 days;
        p.metadataURI = "";
        p.metadataHash = bytes32(0);
        // Flow caps default to 0 — settlement disabled unless a test opts in.
    }

    function _createAgreement() internal returns (uint256 entId, uint256 cidA, uint256 cidB) {
        vm.prank(proposer);
        uint256 proposalId = manager.proposeAgreement(_entParams());
        vm.prank(acceptor);
        (entId,,) = manager.acceptAgreement(proposalId);
        (cidA, cidB) = manager.getAgreementPair(entId);
    }

    function _createAgreementWithCaps(uint128 capPToA, uint128 capAToP)
        internal
        returns (uint256 entId, uint256 cidA, uint256 cidB)
    {
        ICM.AgreementParams memory p = _entParams();
        p.maxFlowProposerToAcceptor = capPToA;
        p.maxFlowAcceptorToProposer = capAToP;
        vm.prank(proposer);
        uint256 proposalId = manager.proposeAgreement(p);
        vm.prank(acceptor);
        (entId,,) = manager.acceptAgreement(proposalId);
        (cidA, cidB) = manager.getAgreementPair(entId);
    }

    // =========================================================================
    // Owner actions
    // =========================================================================

    function testOwner_canInitiateAndExecuteForfeit() public {
        uint256 cid = _createCommitment(committer, AMOUNT);

        vm.prank(owner);
        arbiter.initiateForfeit(cid, 5000);

        // Ownerless execute after challenge window
        vm.warp(block.timestamp + WINDOW + 1);
        vm.prank(nonOwner);
        arbiter.executeForfeit(cid);

        ICM.Commitment memory c = manager.getCommitment(cid);
        assertTrue(c.forfeited, "commitment should be forfeited");
        // Forfeit payout credits the counterparty's FREE balance inside the manager;
        // residual returns to the committer's free balance.
        assertEq(manager.freeBalance(address(token), counterparty), AMOUNT / 2, "counterparty credited");
        assertEq(manager.freeBalance(address(token), committer), DEPOSIT - AMOUNT / 2, "residual returned");
    }

    function testOwner_canCancelForfeit() public {
        uint256 cid = _createCommitment(committer, AMOUNT);

        vm.prank(owner);
        arbiter.initiateForfeit(cid, 5000);

        vm.prank(owner);
        arbiter.cancelForfeit(cid);

        ICM.Commitment memory c = manager.getCommitment(cid);
        assertFalse(c.forfeited, "cancel should prevent forfeit");
        assertFalse(c.released);
    }

    function testOwner_canRelease() public {
        uint256 cid = _createCommitment(committer, AMOUNT);
        uint256 encBefore = manager.encumberedBalance(address(token), committer);
        assertEq(encBefore, AMOUNT, "precondition: backing encumbered");

        vm.prank(owner);
        arbiter.release(cid);

        ICM.Commitment memory c = manager.getCommitment(cid);
        assertTrue(c.released);
        assertEq(manager.encumberedBalance(address(token), committer), 0, "release should decumber");
        assertEq(manager.freeBalance(address(token), committer), DEPOSIT, "backing returned to free balance");
    }

    function testOwner_canForfeitAgreement() public {
        (uint256 entId, uint256 cidA, uint256 cidB) = _createAgreement();

        vm.prank(owner);
        arbiter.forfeitAgreement(entId, 5000);

        // After agreement forfeit, both legs have a ForfeitProposal pending.
        ICM.ForfeitProposal memory pa = manager.getForfeitProposal(cidA);
        ICM.ForfeitProposal memory pb = manager.getForfeitProposal(cidB);
        assertGt(pa.initiatedAt, 0, "leg A should have a forfeit proposal");
        assertGt(pb.initiatedAt, 0, "leg B should have a forfeit proposal");
        assertFalse(manager.getCommitment(cidA).released);
        assertFalse(manager.getCommitment(cidB).released);
    }

    function testOwner_canReleaseAgreement() public {
        (uint256 entId, uint256 cidA, uint256 cidB) = _createAgreement();

        vm.prank(owner);
        arbiter.releaseAgreement(entId);

        assertTrue(manager.getCommitment(cidA).released, "leg A released");
        assertTrue(manager.getCommitment(cidB).released, "leg B released");
    }

    function testOwner_canSettleAgreement() public {
        (uint256 entId, uint256 cidA, uint256 cidB) = _createAgreementWithCaps(50e18, 0);

        uint256 acceptorFreeBefore = manager.freeBalance(address(token), acceptor);
        vm.prank(owner);
        arbiter.settleAgreement(entId, true, 30e18, keccak256("evidence"));

        // Value flows proposer → acceptor: the payer leg shrinks, the receiver leg is
        // untouched, and the settled collateral lands in the acceptor's free balance.
        assertEq(manager.getCommitment(cidA).amount, AMOUNT - 30e18, "payer leg debited");
        assertEq(manager.getCommitment(cidB).amount, AMOUNT, "receiver leg untouched");
        assertEq(manager.freeBalance(address(token), acceptor), acceptorFreeBefore + 30e18, "receiver paid to free");
        (,, uint128 cumulPToA,) = manager.getAgreementSettlement(entId);
        assertEq(cumulPToA, 30e18, "cumulative flow tracked");
    }

    // =========================================================================
    // Non-owner rejections
    // =========================================================================

    function testNonOwner_revertsOnForfeit() public {
        uint256 cid = _createCommitment(committer, AMOUNT);

        vm.prank(nonOwner);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, nonOwner));
        arbiter.initiateForfeit(cid, 5000);
    }

    function testNonOwner_revertsOnCancelForfeit() public {
        uint256 cid = _createCommitment(committer, AMOUNT);
        vm.prank(owner);
        arbiter.initiateForfeit(cid, 5000);

        vm.prank(nonOwner);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, nonOwner));
        arbiter.cancelForfeit(cid);
    }

    function testNonOwner_revertsOnRelease() public {
        uint256 cid = _createCommitment(committer, AMOUNT);

        vm.prank(nonOwner);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, nonOwner));
        arbiter.release(cid);
    }

    function testNonOwner_revertsOnAgreementActions() public {
        (uint256 entId,,) = _createAgreement();

        vm.prank(nonOwner);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, nonOwner));
        arbiter.forfeitAgreement(entId, 5000);

        vm.prank(nonOwner);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, nonOwner));
        arbiter.releaseAgreement(entId);

        vm.prank(nonOwner);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, nonOwner));
        arbiter.settleAgreement(entId, true, 1e18, bytes32(0));
    }

    function testAnyone_canExecuteForfeit() public {
        uint256 cid = _createCommitment(committer, AMOUNT);
        vm.prank(owner);
        arbiter.initiateForfeit(cid, 5000);

        vm.warp(block.timestamp + WINDOW + 1);

        // Non-owner finalizes — allowed by design.
        vm.prank(nonOwner);
        arbiter.executeForfeit(cid);

        ICM.Commitment memory c = manager.getCommitment(cid);
        assertTrue(c.forfeited);
    }

    // =========================================================================
    // Ownership transfer
    // =========================================================================

    function testOwnership_twoStepHandoff() public {
        // Step 1: owner proposes transfer
        vm.prank(owner);
        arbiter.transferOwnership(newOwner);

        // pendingOwner is set, actual owner unchanged
        assertEq(arbiter.owner(), owner, "owner unchanged until accept");
        assertEq(arbiter.pendingOwner(), newOwner, "pendingOwner set");

        // Old owner can still act pre-accept
        uint256 cid = _createCommitment(committer, AMOUNT);
        vm.prank(owner);
        arbiter.initiateForfeit(cid, 5000);

        // newOwner cannot act yet
        vm.prank(newOwner);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, newOwner));
        arbiter.cancelForfeit(cid);

        // Step 2: newOwner accepts
        vm.prank(newOwner);
        arbiter.acceptOwnership();

        assertEq(arbiter.owner(), newOwner);

        // Now old owner can't, new owner can
        vm.prank(owner);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, owner));
        arbiter.cancelForfeit(cid);

        vm.prank(newOwner);
        arbiter.cancelForfeit(cid);

        ICM.Commitment memory c = manager.getCommitment(cid);
        assertFalse(c.forfeited);
    }

    // =========================================================================
    // Mutual passthroughs
    // =========================================================================

    address public member = makeAddr("member");
    address public mutualBeneficiary = makeAddr("mutualBeneficiary");
    uint64 internal constant MUTUAL_WINDOW = 2 days;

    /// @dev Create a homogeneous mutual arbitrated by the ManualArbiter and
    ///      activate it through the owner passthrough.
    function _createAndActivateMutual() internal returns (uint256 gid) {
        ICM.MutualParams memory p = ICM.MutualParams({
            arbiter: address(arbiter),
            numeraire: address(token),
            beneficiary: mutualBeneficiary,
            valuationAuthority: address(0), // homogeneous
            challengeWindow: MUTUAL_WINDOW,
            deallocationWindow: MUTUAL_WINDOW
        });
        gid = manager.createMutual(p);
        vm.prank(owner);
        arbiter.activateMutual(gid);
    }

    /// @dev A member deposits and joins the mutual (counterparty == beneficiary).
    function _joinMutual(uint256 gid, address who, uint256 amount) internal returns (uint256 cid) {
        _deposit(who, amount);
        ICM.CommitmentParams memory p;
        p.arbiter = address(arbiter);
        p.counterparty = mutualBeneficiary;
        p.token = address(token);
        p.adapter = address(staticAdapter);
        p.amount = amount;
        p.maxPenaltyBps = MAX_PENALTY_BPS;
        p.challengeWindow = WINDOW;
        p.strategies = new StrategyBinding[](0);
        vm.prank(who);
        cid = manager.joinMutual(gid, p, 0, "");
    }

    function testOwner_canActivateInitiateAndExecuteMutualLoss() public {
        uint256 gid = _createAndActivateMutual();
        _joinMutual(gid, member, 100e18);

        // Owner declares the loss; ownerless finalization after the window.
        vm.prank(owner);
        arbiter.initiateMutualLoss(gid, 40e18, keccak256("evidence"));

        ICM.MutualLossProposal memory prop = manager.getMutualLossProposal(gid);
        assertEq(prop.lossNumeraire, 40e18, "loss declared");
        assertEq(prop.proposer, address(arbiter), "arbiter is the proposer");
        assertGt(prop.initiatedAt, 0, "proposal open");

        vm.warp(block.timestamp + MUTUAL_WINDOW + 1);
        vm.prank(nonOwner); // ownerless
        arbiter.executeMutualLoss(gid);

        assertTrue(manager.getMutualLossProposal(gid).executed, "loss executed");
    }

    function testOwner_canCancelMutualLoss() public {
        uint256 gid = _createAndActivateMutual();
        _joinMutual(gid, member, 100e18);

        vm.prank(owner);
        arbiter.initiateMutualLoss(gid, 40e18, keccak256("evidence"));

        vm.prank(owner);
        arbiter.cancelMutualLoss(gid);

        ICM.MutualLossProposal memory prop = manager.getMutualLossProposal(gid);
        assertTrue(prop.cancelled, "loss cancelled");
        assertFalse(prop.executed, "not executed");
    }

    function testNonOwner_revertsOnMutualActions() public {
        uint256 gid = _createAndActivateMutual();

        vm.prank(nonOwner);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, nonOwner));
        arbiter.initiateMutualLoss(gid, 1e18, bytes32(0));

        vm.prank(nonOwner);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, nonOwner));
        arbiter.cancelMutualLoss(gid);
    }

    function testNonOwner_revertsOnActivateMutual() public {
        ICM.MutualParams memory p = ICM.MutualParams({
            arbiter: address(arbiter),
            numeraire: address(token),
            beneficiary: mutualBeneficiary,
            valuationAuthority: address(0),
            challengeWindow: MUTUAL_WINDOW,
            deallocationWindow: MUTUAL_WINDOW
        });
        uint256 gid = manager.createMutual(p);

        vm.prank(nonOwner);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, nonOwner));
        arbiter.activateMutual(gid);
    }

    // =========================================================================
    // Getter
    // =========================================================================

    function testCommitmentManagerGetter() public view {
        assertEq(arbiter.commitmentManager(), address(manager));
    }
}
