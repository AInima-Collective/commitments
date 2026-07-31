// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import "forge-std/Test.sol";
import {ERC1967Proxy} from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";

import {CommitmentManager} from "src/core/manager/CommitmentManager.sol";
import {ICommitmentManager as ICM} from "src/core/interfaces/ICommitmentManager.sol";
import {
    IDistributionStrategy,
    StrategyBinding,
    TokenMovement,
    MovementKind
} from "src/core/interfaces/IDistributionStrategy.sol";
import {ERC20StaticAdapter} from "src/backing/ERC20StaticAdapter.sol";
import {MockERC20} from "../helpers/MockERC20.sol";
import {RecordingStrategy, RevertingStrategy, MOCK_DISTRIBUTE} from "./mocks/StrategyMocks.sol";

contract AgreementTestBase is Test {
    CommitmentManager internal manager;
    MockERC20 internal token;
    ERC20StaticAdapter internal adapter;

    address internal admin = makeAddr("admin");
    address internal alice = makeAddr("alice"); // proposer
    address internal bob = makeAddr("bob"); // acceptor
    address internal carol = makeAddr("carol"); // shared arbiter

    uint64 internal constant UNBONDING = 7 days;
    uint64 internal constant WINDOW = 2 days;

    function setUp() public virtual {
        CommitmentManager impl = new CommitmentManager();
        manager = CommitmentManager(
            address(
                new ERC1967Proxy(
                    address(impl), abi.encodeCall(CommitmentManager.initialize, (admin, UNBONDING, 14 days))
                )
            )
        );
        token = new MockERC20("Backing", "BCK", 18);
        adapter = new ERC20StaticAdapter();

        token.mint(alice, 1_000e18);
        token.mint(bob, 1_000e18);
        vm.startPrank(alice);
        token.approve(address(manager), type(uint256).max);
        manager.deposit(address(token), 1_000e18);
        vm.stopPrank();
        vm.startPrank(bob);
        token.approve(address(manager), type(uint256).max);
        manager.deposit(address(token), 1_000e18);
        vm.stopPrank();
    }

    function _eparams() internal view returns (ICM.AgreementParams memory p) {
        p.arbiter = carol;
        p.acceptor = bob;
        p.proposerLeg = ICM.LegTerms(address(token), address(adapter), 200e18, 5000, new StrategyBinding[](0));
        p.acceptorLeg = ICM.LegTerms(address(token), address(adapter), 100e18, 5000, new StrategyBinding[](0));
        p.challengeWindow = WINDOW;
        p.proposalDuration = 7 days;
        p.metadataURI = "";
        p.metadataHash = bytes32(0);
    }

    /// @dev Bind `binds` to BOTH legs (the common "symmetric strategies" case).
    function _bothLegStrategies(ICM.AgreementParams memory p, StrategyBinding[] memory binds) internal pure {
        p.proposerLeg.strategies = binds;
        p.acceptorLeg.strategies = binds;
    }

    function _proposeAndAccept() internal returns (uint256 agreementId, uint256 cidA, uint256 cidB) {
        vm.prank(alice);
        uint256 proposalId = manager.proposeAgreement(_eparams());
        vm.prank(bob);
        (agreementId, cidA, cidB) = manager.acceptAgreement(proposalId);
    }

    function _proposeAndAcceptWithCaps(uint128 capPToA, uint128 capAToP)
        internal
        returns (uint256 agreementId, uint256 cidA, uint256 cidB)
    {
        ICM.AgreementParams memory p = _eparams();
        p.maxFlowProposerToAcceptor = capPToA;
        p.maxFlowAcceptorToProposer = capAToP;
        vm.prank(alice);
        uint256 proposalId = manager.proposeAgreement(p);
        vm.prank(bob);
        (agreementId, cidA, cidB) = manager.acceptAgreement(proposalId);
    }

    function _partitionHolds() internal view {
        (uint256 free, uint256 enc, uint256 esc) = manager.ledgerTotals(address(token));
        assertEq(free + enc + esc, token.balanceOf(address(manager)), "INV-1 partition");
    }
}

contract ProposeAcceptTest is AgreementTestBase {
    function test_propose_locksProposerImmediately() public {
        vm.prank(alice);
        uint256 proposalId = manager.proposeAgreement(_eparams());

        assertEq(proposalId, 1, "proposal ids are 1-indexed");
        assertEq(manager.encumberedBalance(address(token), alice), 200e18, "locked at propose");
        assertEq(manager.getUserExposure(address(token), alice).totalForfeitable, 100e18);
        // Acceptor untouched until accept.
        assertEq(manager.encumberedBalance(address(token), bob), 0);
    }

    function test_propose_emitsTermsCompanionEvent() public {
        // The companion `AgreementProposedTerms` carries the immutable per-leg economic terms
        // (the struct getter is intentionally omitted for EIP-170 headroom). Only proposalId is
        // indexed; the flow caps ride along as data.
        ICM.AgreementParams memory p = _eparams();
        p.maxFlowProposerToAcceptor = 7e18;
        p.maxFlowAcceptorToProposer = 3e18;
        uint64 expectedExpiry = uint64(block.timestamp) + p.proposalDuration;

        vm.expectEmit(true, false, false, true, address(manager));
        emit ICM.AgreementProposedTerms(
            1,
            carol,
            address(token),
            address(adapter),
            200e18,
            5000,
            address(token),
            address(adapter),
            100e18,
            5000,
            WINDOW,
            expectedExpiry,
            7e18,
            3e18
        );
        vm.prank(alice);
        manager.proposeAgreement(p);
    }

    function test_propose_validations() public {
        ICM.AgreementParams memory p;

        p = _eparams();
        p.arbiter = address(0);
        vm.prank(alice);
        vm.expectRevert(ICM.ZeroArbiter.selector);
        manager.proposeAgreement(p);

        p = _eparams();
        p.proposerLeg.amount = 0;
        vm.prank(alice);
        vm.expectRevert(ICM.ZeroAmount.selector);
        manager.proposeAgreement(p);

        p = _eparams();
        p.proposalDuration = 31 days;
        vm.prank(alice);
        vm.expectRevert(ICM.ProposalDurationTooLong.selector);
        manager.proposeAgreement(p);

        p = _eparams();
        p.challengeWindow = 1 hours;
        vm.prank(alice);
        vm.expectRevert(ICM.ChallengeWindowTooShort.selector);
        manager.proposeAgreement(p);
    }

    function test_accept_createsLinkedLegsWithSharedTokenAdapter() public {
        (uint256 agreementId, uint256 cidA, uint256 cidB) = _proposeAndAccept();

        ICM.Commitment memory cA = manager.getCommitment(cidA);
        ICM.Commitment memory cB = manager.getCommitment(cidB);

        // Leg A: proposer encumbers for acceptor's benefit; leg B mirrors.
        assertEq(cA.committer, alice);
        assertEq(cA.counterparty, bob);
        assertEq(cA.amount, 200e18);
        assertEq(cB.committer, bob);
        assertEq(cB.counterparty, alice);
        assertEq(cB.amount, 100e18);
        // This agreement chose the same (token, adapter) for both legs — a choice now, not a
        // structural constraint (see CrossTokenAgreementTest for the cross-token case).
        assertEq(cA.token, cB.token);
        assertEq(cA.adapter, cB.adapter);

        assertEq(manager.encumberedBalance(address(token), bob), 100e18, "acceptor locked at accept");
        assertEq(manager.getUserExposure(address(token), bob).totalForfeitable, 50e18);
        assertGt(agreementId, 0, "agreement ids are 1-indexed");
        _partitionHolds();
    }

    function test_accept_authAndState() public {
        vm.prank(alice);
        uint256 proposalId = manager.proposeAgreement(_eparams());

        vm.prank(carol);
        vm.expectRevert(ICM.NotAcceptor.selector);
        manager.acceptAgreement(proposalId);

        vm.warp(block.timestamp + 7 days + 1);
        vm.prank(bob);
        vm.expectRevert(ICM.ProposalExpired.selector);
        manager.acceptAgreement(proposalId);
    }

    function test_accept_doubleAcceptReverts() public {
        vm.prank(alice);
        uint256 proposalId = manager.proposeAgreement(_eparams());
        vm.prank(bob);
        manager.acceptAgreement(proposalId);
        vm.prank(bob);
        vm.expectRevert(ICM.AlreadyAccepted.selector);
        manager.acceptAgreement(proposalId);
    }

    function test_accept_bindsStrategiesSymmetricallyToBothLegs() public {
        RecordingStrategy strategy = new RecordingStrategy();
        ICM.AgreementParams memory p = _eparams();
        StrategyBinding[] memory binds = new StrategyBinding[](1);
        binds[0] = StrategyBinding(address(strategy), hex"ab");
        _bothLegStrategies(p, binds);

        vm.prank(alice);
        uint256 proposalId = manager.proposeAgreement(p);
        vm.prank(bob);
        (uint256 agreementId,,) = manager.acceptAgreement(proposalId);
        (uint256 cidA, uint256 cidB) = manager.getAgreementPair(agreementId);

        assertEq(manager.strategiesOf(cidA).length, 1);
        assertEq(manager.strategiesOf(cidB).length, 1);
        assertEq(strategy.createdCalls(), 2, "one creation hook per leg");
        assertEq(strategy.lastStrategyParams(), hex"ab");
    }

    function test_accept_strategyRefusalAbortsAtomically() public {
        RecordingStrategy refusing = new RecordingStrategy();
        refusing.setRevertOnCreated(true);
        ICM.AgreementParams memory p = _eparams();
        StrategyBinding[] memory binds = new StrategyBinding[](1);
        binds[0] = StrategyBinding(address(refusing), "");
        _bothLegStrategies(p, binds);

        vm.prank(alice);
        uint256 proposalId = manager.proposeAgreement(p);
        vm.prank(bob);
        vm.expectRevert(bytes("incompatible-adapter"));
        manager.acceptAgreement(proposalId);

        // Nothing accepted: acceptor not encumbered, proposal still acceptable later.
        assertEq(manager.encumberedBalance(address(token), bob), 0);
        // Not accepted: no agreement was produced (agreementOfProposal is 0 until accept links it).
        assertEq(manager.agreementOfProposal(proposalId), 0);
    }

    function test_cancelProposal_restoresProposer() public {
        vm.prank(alice);
        uint256 proposalId = manager.proposeAgreement(_eparams());

        vm.prank(bob);
        vm.expectRevert(ICM.NotProposer.selector);
        manager.cancelAgreementProposal(proposalId);

        vm.prank(alice);
        manager.cancelAgreementProposal(proposalId);
        assertEq(manager.encumberedBalance(address(token), alice), 0);
        assertEq(manager.getUserExposure(address(token), alice).totalForfeitable, 0);

        // Cancelled proposals cannot be accepted.
        vm.prank(bob);
        vm.expectRevert(ICM.ProposalNotFound.selector);
        manager.acceptAgreement(proposalId);
    }

    function test_cancelProposal_expiredIsPermissionless() public {
        vm.prank(alice);
        uint256 proposalId = manager.proposeAgreement(_eparams());
        vm.warp(block.timestamp + 7 days + 1);

        vm.expectEmit(true, true, false, false);
        emit ICM.AgreementProposalExpiredCancelled(proposalId, alice);
        vm.prank(makeAddr("keeper"));
        manager.cancelAgreementProposal(proposalId);
        assertEq(manager.encumberedBalance(address(token), alice), 0);
    }

    function test_unilateralPathsBlockedOnAgreedLegs() public {
        (, uint256 cidA,) = _proposeAndAccept();

        vm.prank(carol);
        vm.expectRevert(ICM.UseAgreementPath.selector);
        manager.releaseCommitment(cidA);

        vm.prank(carol);
        vm.expectRevert(ICM.UseAgreementPath.selector);
        manager.initiateForfeit(cidA, 1000);
    }
}

contract AgreementForfeitReleaseTest is AgreementTestBase {
    function test_forfeitAgreement_atomicBothLegs() public {
        (uint256 agreementId, uint256 cidA, uint256 cidB) = _proposeAndAccept();

        vm.prank(alice);
        vm.expectRevert(ICM.NotArbiter.selector);
        manager.forfeitAgreement(agreementId, 5000);

        vm.prank(carol);
        manager.forfeitAgreement(agreementId, 5000);

        vm.warp(block.timestamp + WINDOW);
        manager.executeForfeit(cidA); // alice forfeited 50% of 200 → bob +100
        manager.executeForfeit(cidB); // bob forfeited 50% of 100 → alice +50

        assertEq(manager.freeBalance(address(token), bob), 900e18 + 100e18 + 50e18, "bob: residual + forfeit credit");
        assertEq(manager.freeBalance(address(token), alice), 800e18 + 100e18 + 50e18);
        assertEq(manager.getUserExposure(address(token), alice).totalEncumbered, 0);
        assertEq(manager.getUserExposure(address(token), bob).totalEncumbered, 0);
        _partitionHolds();

        vm.prank(carol);
        vm.expectRevert(ICM.AgreementBothResolved.selector);
        manager.forfeitAgreement(agreementId, 5000);
    }

    function test_releaseAgreement_freesBothAndRunsHooksPerLeg() public {
        RecordingStrategy strategy = new RecordingStrategy();
        ICM.AgreementParams memory p = _eparams();
        StrategyBinding[] memory binds = new StrategyBinding[](1);
        binds[0] = StrategyBinding(address(strategy), "");
        _bothLegStrategies(p, binds);
        vm.prank(alice);
        uint256 proposalId = manager.proposeAgreement(p);
        vm.prank(bob);
        (uint256 agreementId,,) = manager.acceptAgreement(proposalId);

        vm.prank(carol);
        manager.releaseAgreement(agreementId);

        assertEq(strategy.releasedCalls(), 2, "release hooks ran on both legs");
        assertEq(manager.freeBalance(address(token), alice), 1_000e18);
        assertEq(manager.freeBalance(address(token), bob), 1_000e18);
        _partitionHolds();
    }

    function test_agreementUnbond_symmetric() public {
        (uint256 agreementId, uint256 cidA, uint256 cidB) = _proposeAndAccept();

        vm.prank(carol);
        vm.expectRevert(ICM.NotCommitter.selector);
        manager.requestAgreementUnbond(agreementId);

        vm.prank(bob); // either committer may initiate
        manager.requestAgreementUnbond(agreementId);
        assertGt(manager.unbondInitiatedAt(cidA), 0);
        assertGt(manager.unbondInitiatedAt(cidB), 0);

        vm.warp(block.timestamp + UNBONDING);
        manager.finalizeUnbond(cidA);
        manager.finalizeUnbond(cidB);
        assertEq(manager.freeBalance(address(token), alice), 1_000e18);
        assertEq(manager.freeBalance(address(token), bob), 1_000e18);
    }

    function test_requestUnbondOnLeg_propagatesToPartner() public {
        (, uint256 cidA, uint256 cidB) = _proposeAndAccept();
        vm.prank(alice);
        manager.requestUnbond(cidA);
        assertGt(manager.unbondInitiatedAt(cidB), 0, "partner auto-unbonds (bilateral symmetry)");

        vm.prank(alice);
        manager.cancelUnbond(cidA);
        assertEq(manager.unbondInitiatedAt(cidB), 0, "partner cancel is symmetric");
    }
}

contract SettlementTest is AgreementTestBase {
    function test_settle_disabledWithoutCaps() public {
        (uint256 agreementId,,) = _proposeAndAccept();
        vm.prank(carol);
        vm.expectRevert(ICM.SettlementCapZero.selector);
        manager.settleAgreement(agreementId, true, 1e18, bytes32(0));
    }

    function test_settle_movesEncumberedAndTracksCumulative() public {
        (uint256 agreementId, uint256 cidA, uint256 cidB) = _proposeAndAcceptWithCaps(50e18, 20e18);
        uint256 bobFreeBefore = manager.freeBalance(address(token), bob);

        vm.expectEmit(true, false, false, true);
        emit ICM.AgreementSettled(agreementId, true, 30e18, 30e18, 0, keccak256("evidence"));
        vm.prank(carol);
        manager.settleAgreement(agreementId, true, 30e18, keccak256("evidence"));

        // Only the payer leg (alice) shrinks: 200→170. The receiver leg is untouched — the
        // settled value lands in the receiver's FREE balance, not re-encumbered.
        assertEq(manager.getCommitment(cidA).amount, 170e18, "payer leg debited");
        assertEq(manager.getCommitment(cidB).amount, 100e18, "receiver leg untouched");
        assertEq(manager.encumberedBalance(address(token), alice), 170e18, "payer encumbrance down");
        assertEq(manager.encumberedBalance(address(token), bob), 100e18, "receiver encumbrance unchanged");
        assertEq(manager.freeBalance(address(token), bob), bobFreeBefore + 30e18, "receiver paid to free balance");
        // Exposure-diff on the payer only (50% penalty); receiver exposure unchanged.
        assertEq(manager.getUserExposure(address(token), alice).totalForfeitable, 85e18, "payer forfeitable down");
        assertEq(manager.getUserExposure(address(token), bob).totalForfeitable, 50e18, "receiver forfeitable unchanged");
        // Cumulative tracked.
        (,, uint128 cumulPToA,) = manager.getAgreementSettlement(agreementId);
        assertEq(cumulPToA, 30e18);
        _partitionHolds();
    }

    function test_settle_capEnforcedPerDirection() public {
        (uint256 agreementId,,) = _proposeAndAcceptWithCaps(50e18, 20e18);

        vm.startPrank(carol);
        manager.settleAgreement(agreementId, true, 40e18, bytes32(0));
        vm.expectRevert(abi.encodeWithSelector(ICM.SettlementCapExceeded.selector, 51e18, 50e18));
        manager.settleAgreement(agreementId, true, 11e18, bytes32(0));

        // Opposite direction has its own cap.
        manager.settleAgreement(agreementId, false, 20e18, bytes32(0));
        vm.expectRevert(abi.encodeWithSelector(ICM.SettlementCapExceeded.selector, 21e18, 20e18));
        manager.settleAgreement(agreementId, false, 1e18, bytes32(0));
        vm.stopPrank();
    }

    function test_settle_guards() public {
        (uint256 agreementId, uint256 cidA,) = _proposeAndAcceptWithCaps(500e18, 0);

        vm.prank(alice);
        vm.expectRevert(ICM.NotArbiter.selector);
        manager.settleAgreement(agreementId, true, 1e18, bytes32(0));

        // Over the payer's live amount.
        vm.prank(carol);
        vm.expectRevert(abi.encodeWithSelector(ICM.InsufficientCommitmentAmount.selector, 201e18, 200e18));
        manager.settleAgreement(agreementId, true, 201e18, bytes32(0));

        // Blocked by pending unbond.
        vm.prank(alice);
        manager.requestUnbond(cidA);
        vm.prank(carol);
        vm.expectRevert(ICM.UnbondPending.selector);
        manager.settleAgreement(agreementId, true, 1e18, bytes32(0));
        vm.prank(alice);
        manager.cancelUnbond(cidA);

        // Blocked by pending forfeit.
        vm.prank(carol);
        manager.forfeitAgreement(agreementId, 5000);
        vm.prank(carol);
        vm.expectRevert(ICM.ForfeitPending.selector);
        manager.settleAgreement(agreementId, true, 1e18, bytes32(0));
    }

    function test_settle_runsPresettleDistribute_andFailureCannotVeto() public {
        // One well-behaved accruing strategy + one reverting strategy on both legs.
        RecordingStrategy accruing = new RecordingStrategy();
        RevertingStrategy broken = new RevertingStrategy();
        ICM.AgreementParams memory p = _eparams();
        p.maxFlowProposerToAcceptor = 50e18;
        StrategyBinding[] memory binds = new StrategyBinding[](2);
        binds[0] = StrategyBinding(address(accruing), "");
        binds[1] = StrategyBinding(address(broken), "");
        _bothLegStrategies(p, binds);

        vm.prank(alice);
        uint256 proposalId = manager.proposeAgreement(p);
        vm.prank(bob);
        (uint256 agreementId,,) = manager.acceptAgreement(proposalId);
        (uint256 cidA,) = manager.getAgreementPair(agreementId);

        // The accruing strategy sweeps 5 units of leg A's encumbrance on its next distribute.
        // (The same programmed move is invalid for leg B — wrong committer — so leg B's frame
        // parks; this doubles as a second cannot-veto case.)
        TokenMovement[] memory moves = new TokenMovement[](1);
        moves[0] = TokenMovement(MovementKind.FromEncumberedToEscrow, alice, address(accruing), address(token), 5e18);
        accruing.setMoves(MOCK_DISTRIBUTE, moves);

        // The broken strategy's distribute reverts — parked-and-continued, never a veto.
        vm.expectEmit(true, true, false, true);
        emit ICM.StrategyHookFailed(cidA, address(broken), IDistributionStrategy.distribute.selector);
        vm.prank(carol);
        manager.settleAgreement(agreementId, true, 30e18, bytes32(0));

        // Pre-settle distribute captured leg A's accrual at pre-shift principal, then the
        // shift applied on the post-distribute amount: 200 - 5 - 30 = 165.
        assertEq(manager.escrowOf(address(token), address(accruing)), 5e18, "leg A accrual captured");
        assertEq(manager.getCommitment(cidA).amount, 165e18);
        _partitionHolds();
    }
}

contract ContributionTest is AgreementTestBase {
    uint256 internal cid;
    address internal dora = makeAddr("dora"); // external contributor

    function setUp() public override {
        super.setUp();
        // A plain (non-agreed) commitment by alice: 100 @ 50%.
        ICM.CommitmentParams memory p;
        p.arbiter = carol;
        p.counterparty = bob;
        p.token = address(token);
        p.adapter = address(adapter);
        p.amount = 100e18;
        p.maxPenaltyBps = 5000;
        p.challengeWindow = WINDOW;
        p.strategies = new StrategyBinding[](0);
        vm.prank(alice);
        cid = manager.createCommitment(p);

        token.mint(dora, 100e18);
        vm.startPrank(dora);
        token.approve(address(manager), type(uint256).max);
        manager.deposit(address(token), 100e18);
        vm.stopPrank();
    }

    function test_contribute_gatedUntilCommitterOptsIn() public {
        vm.prank(dora);
        vm.expectRevert(ICM.ContributionsDisabled.selector);
        manager.contributeEncumbered(cid, 10e18);

        // Committer's own first contribution auto-enables.
        vm.prank(alice);
        manager.contributeEncumbered(cid, 5e18);

        vm.prank(dora);
        manager.contributeEncumbered(cid, 10e18);

        // 100 + 5 + 10 = 115 under the commitment, all encumbered to alice.
        assertEq(manager.getCommitment(cid).amount, 115e18);
        assertEq(manager.encumberedBalance(address(token), alice), 115e18);
        assertEq(manager.freeBalance(address(token), dora), 90e18, "contributor's free balance debited");
        // Exposure grows proportionally: 115 @ 50% = 57.5.
        assertEq(manager.getUserExposure(address(token), alice).totalForfeitable, 57.5e18);
        _partitionHolds();
    }

    function test_contribute_growsForfeitPayout() public {
        vm.prank(alice);
        manager.contributeEncumbered(cid, 5e18);
        vm.prank(dora);
        manager.contributeEncumbered(cid, 10e18);

        vm.prank(carol);
        manager.initiateForfeit(cid, 5000);
        vm.warp(block.timestamp + WINDOW);
        manager.executeForfeit(cid);

        // 50% of 115 = 57.5 to bob (on top of his deposited 1000); residual 57.5 back to
        // alice (including dora's contribution — contributions ride the committer's fate).
        assertEq(manager.freeBalance(address(token), bob), 1_000e18 + 57.5e18);
        _partitionHolds();
    }

    function test_contribute_blockedStates() public {
        vm.prank(alice);
        manager.contributeEncumbered(cid, 1e18); // opt in

        vm.prank(alice);
        vm.expectRevert(ICM.ZeroAmount.selector);
        manager.contributeEncumbered(cid, 0);

        vm.prank(carol);
        manager.initiateForfeit(cid, 1000);
        vm.prank(dora);
        vm.expectRevert(ICM.ForfeitPending.selector);
        manager.contributeEncumbered(cid, 1e18);
        vm.prank(carol);
        manager.cancelForfeit(cid);

        vm.prank(alice);
        manager.requestUnbond(cid);
        vm.prank(dora);
        vm.expectRevert(ICM.UnbondPending.selector);
        manager.contributeEncumbered(cid, 1e18);
        vm.prank(alice);
        manager.cancelUnbond(cid);

        vm.prank(carol);
        manager.releaseCommitment(cid);
        vm.prank(dora);
        vm.expectRevert(ICM.CommitmentInactive.selector);
        manager.contributeEncumbered(cid, 1e18);
    }

    function test_contribute_insufficientFreeBalance() public {
        vm.prank(alice);
        manager.contributeEncumbered(cid, 1e18); // opt in
        vm.prank(dora);
        vm.expectRevert(abi.encodeWithSelector(ICM.InsufficientFreeBalance.selector, 101e18, 100e18));
        manager.contributeEncumbered(cid, 101e18);
    }
}

/// @notice API-polish surface (issue #60): proportional agreement forfeit, the proposalId reverse
///         index + AgreementAccepted proposalId topic, and the acceptAgreement (id, cidA, cidB) return.
contract AgreementApiPolishTest is AgreementTestBase {
    function test_acceptAgreement_returnsPairAndIndexesProposal() public {
        vm.prank(alice);
        uint256 proposalId = manager.proposeAgreement(_eparams());

        // Before accept, the reverse index reads 0.
        assertEq(manager.agreementOfProposal(proposalId), 0, "unaccepted proposal maps to 0");

        vm.prank(bob);
        (uint256 agreementId, uint256 cidA, uint256 cidB) = manager.acceptAgreement(proposalId);

        // The returned pair must match the canonical getter — no follow-up round-trip needed.
        (uint256 pairA, uint256 pairB) = manager.getAgreementPair(agreementId);
        assertEq(cidA, pairA, "returned cidA");
        assertEq(cidB, pairB, "returned cidB");
        assertEq(manager.agreementOf(cidA), agreementId, "forward index cidA");

        // The reverse index now resolves proposalId -> agreementId.
        assertEq(manager.agreementOfProposal(proposalId), agreementId, "reverse index");
    }

    function test_acceptAgreement_emitsProposalIdTopic() public {
        vm.prank(alice);
        uint256 proposalId = manager.proposeAgreement(_eparams());

        // First agreement in a fresh fixture: agreementId 1, legs 1 & 2.
        vm.expectEmit(true, true, true, true, address(manager));
        emit ICM.AgreementAccepted(1, proposalId, 1, 2, "", bytes32(0));
        vm.prank(bob);
        manager.acceptAgreement(proposalId);
    }

    function test_forfeitAgreement_proportionalPenalty() public {
        (uint256 agreementId, uint256 cidA, uint256 cidB) = _proposeAndAccept();

        // Forfeit at 30% rather than the 50% max — the arbiter's proportional lever.
        vm.prank(carol);
        manager.forfeitAgreement(agreementId, 3000);

        assertEq(manager.getForfeitProposal(cidA).penaltyBps, 3000, "leg A penalty");
        assertEq(manager.getForfeitProposal(cidB).penaltyBps, 3000, "leg B penalty");

        vm.warp(block.timestamp + WINDOW);
        manager.executeForfeit(cidA); // 30% of 200e18 = 60e18 → bob
        manager.executeForfeit(cidB); // 30% of 100e18 = 30e18 → alice

        assertEq(manager.forfeitedUnitsOf(cidA), 60e18, "leg A forfeited 30%");
        assertEq(manager.forfeitedUnitsOf(cidB), 30e18, "leg B forfeited 30%");
        _partitionHolds();
    }

    function test_forfeitAgreement_revertsWhenPenaltyExceedsMax() public {
        (uint256 agreementId,,) = _proposeAndAccept();

        vm.prank(carol);
        vm.expectRevert(ICM.PenaltyExceedsMax.selector);
        manager.forfeitAgreement(agreementId, 5001); // > shared maxPenaltyBps (5000)
    }

    function test_forfeitAgreement_stillArbiterGated() public {
        (uint256 agreementId,,) = _proposeAndAccept();

        vm.prank(alice); // not the arbiter
        vm.expectRevert(ICM.NotArbiter.selector);
        manager.forfeitAgreement(agreementId, 5000);
    }
}

/// @title CrossTokenAgreementTest
/// @notice The flagship #97 capability: an agreement whose two legs use DIFFERENT
///         backing tokens (a DAO-treaty across two gov tokens), with independent
///         per-leg amount, penalty ceiling, and strategies. Exercises propose/accept,
///         release, per-leg forfeit, cross-token bilateral settlement, and per-leg
///         strategy binding — with the partition invariant held per token.
contract CrossTokenAgreementTest is AgreementTestBase {
    MockERC20 internal token2;

    function setUp() public override {
        super.setUp();
        token2 = new MockERC20("Backing2", "BCK2", 18);
        token2.mint(alice, 1_000e18);
        token2.mint(bob, 1_000e18);
        vm.startPrank(alice);
        token2.approve(address(manager), type(uint256).max);
        manager.deposit(address(token2), 1_000e18);
        vm.stopPrank();
        vm.startPrank(bob);
        token2.approve(address(manager), type(uint256).max);
        manager.deposit(address(token2), 1_000e18);
        vm.stopPrank();
    }

    /// @dev Proposer leg in `token` (200e18 @ 40%), acceptor leg in `token2` (100e18 @ 60%).
    function _crossParams() internal view returns (ICM.AgreementParams memory p) {
        p.arbiter = carol;
        p.acceptor = bob;
        p.proposerLeg = ICM.LegTerms(address(token), address(adapter), 200e18, 4000, new StrategyBinding[](0));
        p.acceptorLeg = ICM.LegTerms(address(token2), address(adapter), 100e18, 6000, new StrategyBinding[](0));
        p.challengeWindow = WINDOW;
        p.proposalDuration = 7 days;
    }

    function _propAccept() internal returns (uint256 aid, uint256 cidA, uint256 cidB) {
        vm.prank(alice);
        uint256 pid = manager.proposeAgreement(_crossParams());
        vm.prank(bob);
        (aid, cidA, cidB) = manager.acceptAgreement(pid);
    }

    function _partitionHoldsFor(MockERC20 t) internal view {
        (uint256 free, uint256 enc, uint256 esc) = manager.ledgerTotals(address(t));
        assertEq(free + enc + esc, t.balanceOf(address(manager)), "INV-1 partition per token");
    }

    function test_crossToken_legsCarryIndependentTerms() public {
        (, uint256 cidA, uint256 cidB) = _propAccept();
        ICM.Commitment memory cA = manager.getCommitment(cidA);
        ICM.Commitment memory cB = manager.getCommitment(cidB);

        assertEq(cA.token, address(token), "proposer leg token");
        assertEq(cA.amount, 200e18);
        assertEq(cA.maxPenaltyBps, 4000, "proposer leg penalty");
        assertEq(cB.token, address(token2), "acceptor leg token");
        assertEq(cB.amount, 100e18);
        assertEq(cB.maxPenaltyBps, 6000, "acceptor leg penalty");

        // Exposure is keyed per (user, token): alice in token, bob in token2.
        assertEq(manager.encumberedBalance(address(token), alice), 200e18);
        assertEq(manager.encumberedBalance(address(token2), bob), 100e18);
        assertEq(manager.getUserExposure(address(token), alice).totalForfeitable, 80e18); // 200 * 40%
        assertEq(manager.getUserExposure(address(token2), bob).totalForfeitable, 60e18); // 100 * 60%
        _partitionHoldsFor(token);
        _partitionHoldsFor(token2);
    }

    function test_crossToken_releaseReturnsEachOwnToken() public {
        (uint256 aid,,) = _propAccept();
        vm.prank(carol);
        manager.releaseAgreement(aid);
        assertEq(manager.freeBalance(address(token), alice), 1_000e18, "alice whole in token");
        assertEq(manager.freeBalance(address(token2), bob), 1_000e18, "bob whole in token2");
    }

    function test_crossToken_forfeitPerLegMaxAndOwnToken() public {
        (uint256 aid, uint256 cidA, uint256 cidB) = _propAccept();

        // A single penaltyBps must satisfy BOTH legs' ceilings; the proposer leg caps at 4000.
        vm.prank(carol);
        vm.expectRevert(ICM.PenaltyExceedsMax.selector);
        manager.forfeitAgreement(aid, 5000);

        uint256 bobTokenBefore = manager.freeBalance(address(token), bob);
        uint256 aliceToken2Before = manager.freeBalance(address(token2), alice);
        vm.prank(carol);
        manager.forfeitAgreement(aid, 4000);
        vm.warp(block.timestamp + WINDOW);
        manager.executeForfeit(cidA);
        manager.executeForfeit(cidB);

        // Each leg forfeits in its OWN token to its counterparty (40% of each leg).
        assertEq(manager.freeBalance(address(token), bob), bobTokenBefore + 80e18, "bob paid 40% of proposer leg");
        assertEq(
            manager.freeBalance(address(token2), alice), aliceToken2Before + 40e18, "alice paid 40% of acceptor leg"
        );
        _partitionHoldsFor(token);
        _partitionHoldsFor(token2);
    }

    function test_crossToken_settleBothDirectionsInPayerToken() public {
        ICM.AgreementParams memory p = _crossParams();
        p.maxFlowProposerToAcceptor = 100e18; // cap in token
        p.maxFlowAcceptorToProposer = 50e18; // cap in token2
        vm.prank(alice);
        uint256 pid = manager.proposeAgreement(p);
        vm.prank(bob);
        (uint256 aid,,) = manager.acceptAgreement(pid);

        uint256 bobTokenFree = manager.freeBalance(address(token), bob);
        uint256 aliceToken2Free = manager.freeBalance(address(token2), alice);

        vm.startPrank(carol);
        manager.settleAgreement(aid, true, 30e18, 0); // proposer→acceptor: 30 `token` to bob's free
        manager.settleAgreement(aid, false, 20e18, 0); // acceptor→proposer: 20 `token2` to alice's free
        vm.stopPrank();

        assertEq(manager.freeBalance(address(token), bob), bobTokenFree + 30e18, "bob received payer-token settlement");
        assertEq(
            manager.freeBalance(address(token2), alice),
            aliceToken2Free + 20e18,
            "alice received payer-token settlement"
        );
        _partitionHoldsFor(token);
        _partitionHoldsFor(token2);
    }

    function test_crossToken_perLegStrategiesBindIndependently() public {
        RecordingStrategy sP = new RecordingStrategy();
        RecordingStrategy sA = new RecordingStrategy();
        ICM.AgreementParams memory p = _crossParams();
        p.proposerLeg.strategies = new StrategyBinding[](1);
        p.proposerLeg.strategies[0] = StrategyBinding(address(sP), "");
        p.acceptorLeg.strategies = new StrategyBinding[](1);
        p.acceptorLeg.strategies[0] = StrategyBinding(address(sA), "");

        vm.prank(alice);
        uint256 pid = manager.proposeAgreement(p);
        vm.prank(bob);
        (, uint256 cidA, uint256 cidB) = manager.acceptAgreement(pid);

        // Each leg bound ONLY its own strategy.
        assertEq(manager.strategiesOf(cidA).length, 1, "proposer leg one strategy");
        assertEq(manager.strategiesOf(cidA)[0], address(sP));
        assertEq(manager.strategiesOf(cidB).length, 1, "acceptor leg one strategy");
        assertEq(manager.strategiesOf(cidB)[0], address(sA));
        assertEq(sP.createdCalls(), 1, "proposer strategy created once");
        assertEq(sA.createdCalls(), 1, "acceptor strategy created once");
    }
}
