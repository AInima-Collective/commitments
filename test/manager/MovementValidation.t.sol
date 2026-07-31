// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import "forge-std/Test.sol";
import {ERC1967Proxy} from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";

import {CommitmentManager} from "src/core/manager/CommitmentManager.sol";
import {ICommitmentManager as ICM} from "src/core/interfaces/ICommitmentManager.sol";
import {StrategyBinding, TokenMovement, MovementKind} from "src/core/interfaces/IDistributionStrategy.sol";
import {ERC20StaticAdapter} from "src/backing/ERC20StaticAdapter.sol";
import {MockERC20} from "../helpers/MockERC20.sol";
import {RecordingStrategy, MOCK_DISTRIBUTE, MOCK_CLAIM, MOCK_RELEASED, MOCK_FORFEITED} from "./mocks/StrategyMocks.sol";

/// @title MovementValidationTest
/// @notice The per-kind allow-list matrix of ERC §D.4/§D.5: who can move what, where, capped by
///         what — and the manager-applied exposure shrink (INV-4) and escrow isolation (INV-5).
contract MovementValidationTest is Test {
    CommitmentManager internal manager;
    MockERC20 internal token;
    ERC20StaticAdapter internal adapter;
    RecordingStrategy internal strategy;

    address internal admin = makeAddr("admin");
    address internal alice = makeAddr("alice"); // committer
    address internal arbiter = makeAddr("arbiter");
    address internal bob = makeAddr("bob"); // counterparty
    address internal mallory = makeAddr("mallory"); // outside the commitment's parties

    uint256 internal id;
    uint64 internal constant WINDOW = 2 days;

    function setUp() public {
        CommitmentManager impl = new CommitmentManager();
        manager = CommitmentManager(
            address(
                new ERC1967Proxy(address(impl), abi.encodeCall(CommitmentManager.initialize, (admin, 7 days, 14 days)))
            )
        );
        token = new MockERC20("Backing", "BCK", 18);
        adapter = new ERC20StaticAdapter();
        strategy = new RecordingStrategy();

        token.mint(alice, 1_000e18);
        vm.startPrank(alice);
        token.approve(address(manager), type(uint256).max);
        manager.deposit(address(token), 1_000e18);
        vm.stopPrank();

        // Commitment: 100 units @ 50% max penalty, one bound strategy.
        ICM.CommitmentParams memory p;
        p.arbiter = arbiter;
        p.counterparty = bob;
        p.token = address(token);
        p.adapter = address(adapter);
        p.amount = 100e18;
        p.maxPenaltyBps = 5000;
        p.challengeWindow = WINDOW;
        p.strategies = new StrategyBinding[](1);
        p.strategies[0] = StrategyBinding(address(strategy), "");
        vm.prank(alice);
        id = manager.createCommitment(p);
    }

    function _move(MovementKind kind, address from, address to, address tkn, uint256 units)
        internal
        pure
        returns (TokenMovement[] memory moves)
    {
        moves = new TokenMovement[](1);
        moves[0] = TokenMovement(kind, from, to, tkn, units);
    }

    function _partitionHolds() internal view {
        (uint256 free, uint256 enc, uint256 esc) = manager.ledgerTotals(address(token));
        assertEq(free + enc + esc, token.balanceOf(address(manager)), "INV-1 partition");
    }

    // =========================================================================
    // distribute site — FromEncumbered*
    // =========================================================================

    function test_distribute_encumberedToEscrow_appliesWithExposureShrink() public {
        strategy.setMoves(
            MOCK_DISTRIBUTE, _move(MovementKind.FromEncumberedToEscrow, alice, address(strategy), address(token), 10e18)
        );
        manager.distribute(id, address(strategy));

        assertEq(manager.escrowOf(address(token), address(strategy)), 10e18);
        assertEq(manager.getCommitment(id).amount, 90e18, "c.amount shrunk");
        // Exposure-preserving shrink: 90 @ 50% → 45.
        ICM.UserExposure memory mag = manager.getUserExposure(address(token), alice);
        assertEq(mag.totalEncumbered, 90e18);
        assertEq(mag.totalForfeitable, 45e18);
        assertEq(manager.encumberedBalance(address(token), alice), 90e18);
        _partitionHolds();
    }

    function test_distribute_encumberedToExternal_paysOutAndEmits() public {
        strategy.setMoves(
            MOCK_DISTRIBUTE, _move(MovementKind.FromEncumberedToExternal, alice, bob, address(token), 7e18)
        );

        vm.expectEmit(true, true, true, true);
        emit ICM.DistributionPaid(address(strategy), bob, address(token), 7e18, id, bytes32(0));
        manager.distribute(id, address(strategy));

        assertEq(token.balanceOf(bob), 7e18, "external transfer out");
        assertEq(manager.getCommitment(id).amount, 93e18);
        _partitionHolds();
    }

    function test_distribute_recipientOutsideParties_rejected() public {
        strategy.setMoves(
            MOCK_DISTRIBUTE, _move(MovementKind.FromEncumberedToExternal, alice, mallory, address(token), 1e18)
        );
        vm.expectPartialRevert(ICM.MovementRecipientNotParty.selector);
        manager.distribute(id, address(strategy));
    }

    function test_distribute_escrowToEscrowSentinel_rejected() public {
        // FromEncumberedToEscrow with `to` ≠ the calling strategy.
        strategy.setMoves(
            MOCK_DISTRIBUTE, _move(MovementKind.FromEncumberedToEscrow, alice, mallory, address(token), 1e18)
        );
        vm.expectPartialRevert(ICM.MovementEscrowRecipientNotStrategy.selector);
        manager.distribute(id, address(strategy));
    }

    function test_distribute_fromNotCommitter_rejected() public {
        strategy.setMoves(
            MOCK_DISTRIBUTE, _move(MovementKind.FromEncumberedToEscrow, bob, address(strategy), address(token), 1e18)
        );
        vm.expectPartialRevert(ICM.MovementFromNotCommitter.selector);
        manager.distribute(id, address(strategy));
    }

    function test_distribute_wrongToken_rejected() public {
        MockERC20 other = new MockERC20("Other", "OTH", 18);
        strategy.setMoves(
            MOCK_DISTRIBUTE, _move(MovementKind.FromEncumberedToEscrow, alice, address(strategy), address(other), 1e18)
        );
        vm.expectPartialRevert(ICM.MovementWrongToken.selector);
        manager.distribute(id, address(strategy));
    }

    function test_distribute_overCap_rejected() public {
        strategy.setMoves(
            MOCK_DISTRIBUTE,
            _move(MovementKind.FromEncumberedToEscrow, alice, address(strategy), address(token), 100e18 + 1)
        );
        vm.expectPartialRevert(ICM.MovementExceedsCommitment.selector);
        manager.distribute(id, address(strategy));
    }

    function test_distribute_cumulativeCapAcrossBatch_rejected() public {
        // Two moves of 60 each: first passes (cap 100), second exceeds the running cap (INV-4).
        TokenMovement[] memory moves = new TokenMovement[](2);
        moves[0] = TokenMovement(MovementKind.FromEncumberedToEscrow, alice, address(strategy), address(token), 60e18);
        moves[1] = TokenMovement(MovementKind.FromEncumberedToEscrow, alice, address(strategy), address(token), 60e18);
        strategy.setMoves(MOCK_DISTRIBUTE, moves);

        vm.expectPartialRevert(ICM.MovementExceedsCommitment.selector);
        manager.distribute(id, address(strategy));
        // Whole batch reverted — nothing applied.
        assertEq(manager.escrowOf(address(token), address(strategy)), 0);
        assertEq(manager.getCommitment(id).amount, 100e18);
    }

    function test_distribute_zeroUnits_rejected() public {
        strategy.setMoves(
            MOCK_DISTRIBUTE, _move(MovementKind.FromEncumberedToEscrow, alice, address(strategy), address(token), 0)
        );
        vm.expectRevert(ICM.MovementZeroUnits.selector);
        manager.distribute(id, address(strategy));
    }

    function test_distribute_escrowKinds_rejectedAtSite() public {
        vm.prank(alice);
        token.mint(alice, 10e18);
        vm.prank(alice);
        token.approve(address(manager), type(uint256).max);
        vm.prank(alice);
        manager.fundStrategy(address(strategy), address(token), 10e18);

        strategy.setMoves(
            MOCK_DISTRIBUTE, _move(MovementKind.FromEscrowToFree, address(strategy), bob, address(token), 1e18)
        );
        vm.expectRevert(ICM.MovementFromEscrowNotOnDistribute.selector);
        manager.distribute(id, address(strategy));
    }

    function test_distribute_blockedWhileForfeitPending() public {
        vm.prank(arbiter);
        manager.initiateForfeit(id, 1000);
        vm.expectRevert(ICM.ForfeitPending.selector);
        manager.distribute(id, address(strategy));
    }

    function test_distribute_unknownStrategy_andClosed() public {
        vm.expectRevert(ICM.UnknownStrategy.selector);
        manager.distribute(id, mallory);

        vm.prank(arbiter);
        manager.releaseCommitment(id);
        vm.expectRevert(ICM.CommitmentInactive.selector);
        manager.distribute(id, address(strategy));
    }

    // =========================================================================
    // claim site — FromEscrow*
    // =========================================================================

    function _escrow20() internal {
        // Accrue 20 into the strategy's escrow from the encumbered position.
        strategy.setMoves(
            MOCK_DISTRIBUTE, _move(MovementKind.FromEncumberedToEscrow, alice, address(strategy), address(token), 20e18)
        );
        manager.distribute(id, address(strategy));
        strategy.setMoves(MOCK_DISTRIBUTE, new TokenMovement[](0));
    }

    function test_claim_escrowToFree_creditsLedgerAndEmits() public {
        _escrow20();
        strategy.setMoves(
            MOCK_CLAIM, _move(MovementKind.FromEscrowToFree, address(strategy), bob, address(token), 20e18)
        );

        vm.expectEmit(true, true, true, true);
        emit ICM.DistributionPaid(address(strategy), bob, address(token), 20e18, id, bytes32(0));
        vm.prank(bob);
        manager.claim(id, address(strategy), "");

        assertEq(manager.freeBalance(address(token), bob), 20e18);
        assertEq(manager.escrowOf(address(token), address(strategy)), 0);
        _partitionHolds();
    }

    function test_claim_escrowToExternal_transfersOut() public {
        _escrow20();
        strategy.setMoves(
            MOCK_CLAIM, _move(MovementKind.FromEscrowToExternal, address(strategy), bob, address(token), 20e18)
        );
        vm.prank(bob);
        manager.claim(id, address(strategy), "");
        assertEq(token.balanceOf(bob), 20e18);
        _partitionHolds();
    }

    function test_claim_encumberedKinds_rejectedAtSite() public {
        strategy.setMoves(
            MOCK_CLAIM, _move(MovementKind.FromEncumberedToEscrow, alice, address(strategy), address(token), 1e18)
        );
        vm.expectRevert(ICM.MovementToEscrowNotAllowedOnClaim.selector);
        manager.claim(id, address(strategy), "");
    }

    function test_claim_fromForeignEscrow_rejected() public {
        // INV-5: a strategy cannot debit another strategy's escrow. `from` must equal the
        // strategy the manager just called — anything else is rejected outright.
        RecordingStrategy other = new RecordingStrategy();
        token.mint(address(this), 50e18);
        token.approve(address(manager), 50e18);
        manager.fundStrategy(address(other), address(token), 50e18);

        strategy.setMoves(MOCK_CLAIM, _move(MovementKind.FromEscrowToFree, address(other), bob, address(token), 50e18));
        vm.expectPartialRevert(ICM.MovementFromNotStrategy.selector);
        manager.claim(id, address(strategy), "");
        assertEq(manager.escrowOf(address(token), address(other)), 50e18, "foreign escrow untouched");
    }

    function test_claim_escrowOverdraw_rejected() public {
        _escrow20();
        strategy.setMoves(
            MOCK_CLAIM, _move(MovementKind.FromEscrowToFree, address(strategy), bob, address(token), 20e18 + 1)
        );
        vm.expectRevert(abi.encodeWithSelector(ICM.InsufficientEscrow.selector, 20e18 + 1, 20e18));
        manager.claim(id, address(strategy), "");
    }

    function test_claim_recipientOutsideParties_rejected() public {
        _escrow20();
        strategy.setMoves(
            MOCK_CLAIM, _move(MovementKind.FromEscrowToFree, address(strategy), mallory, address(token), 1e18)
        );
        vm.expectPartialRevert(ICM.MovementRecipientNotParty.selector);
        manager.claim(id, address(strategy), "");
    }

    function test_claim_remainsAvailableAfterClose() public {
        _escrow20();
        vm.prank(arbiter);
        manager.releaseCommitment(id);

        strategy.setMoves(
            MOCK_CLAIM, _move(MovementKind.FromEscrowToFree, address(strategy), bob, address(token), 20e18)
        );
        vm.prank(bob);
        manager.claim(id, address(strategy), "");
        assertEq(manager.freeBalance(address(token), bob), 20e18, "parked accrual recoverable post-close");
        assertGt(strategy.lastClosedAt(), 0, "closedAt delivered in context");
    }

    // =========================================================================
    // lifecycle sites
    // =========================================================================

    function test_releaseHook_finalSweepBeforeFreeing() public {
        strategy.setMoves(
            MOCK_RELEASED, _move(MovementKind.FromEncumberedToEscrow, alice, address(strategy), address(token), 5e18)
        );
        vm.prank(arbiter);
        manager.releaseCommitment(id);

        assertEq(strategy.releasedCalls(), 1);
        assertEq(strategy.lastCurrentEncumbered(), 100e18, "hook saw the still-encumbered position");
        assertEq(manager.escrowOf(address(token), address(strategy)), 5e18, "final sweep escrowed");
        assertEq(manager.freeBalance(address(token), alice), 995e18, "remainder freed");
        assertEq(manager.getUserExposure(address(token), alice).totalEncumbered, 0);
        _partitionHolds();
    }

    function test_forfeitHook_capsRunAgainstPostForfeitResidual() public {
        vm.prank(arbiter);
        manager.initiateForfeit(id, 4000); // 40 forfeited, 60 residual
        vm.warp(block.timestamp + WINDOW);

        // Sweep 60 (exactly the residual) — valid. 60+1 would fail the frame.
        strategy.setMoves(
            MOCK_FORFEITED, _move(MovementKind.FromEncumberedToEscrow, alice, address(strategy), address(token), 60e18)
        );
        manager.executeForfeit(id);

        assertEq(strategy.forfeitedCalls(), 1);
        assertEq(strategy.lastForfeitedUnits(), 40e18, "ForfeitContext.forfeitedUnits");
        assertEq(strategy.lastCurrentEncumbered(), 60e18, "hook saw the post-forfeit residual");
        assertEq(manager.freeBalance(address(token), bob), 40e18, "forfeit payout");
        assertEq(manager.escrowOf(address(token), address(strategy)), 60e18, "residual swept to escrow");
        assertEq(manager.freeBalance(address(token), alice), 900e18, "nothing left for committer");
        assertEq(manager.getUserExposure(address(token), alice).totalEncumbered, 0);
        _partitionHolds();
    }

    function test_pending_forwardsToStrategy() public {
        strategy.setPendingValue(123);
        assertEq(manager.pending(id, address(strategy), ""), 123);
        vm.expectRevert(ICM.UnknownStrategy.selector);
        manager.pending(id, mallory, "");
    }

    function test_distributeAll_iteratesInArrayOrder() public {
        strategy.setMoves(
            MOCK_DISTRIBUTE, _move(MovementKind.FromEncumberedToEscrow, alice, address(strategy), address(token), 1e18)
        );
        manager.distributeAll(id);
        assertEq(strategy.distributeCalls(), 1);
        assertEq(manager.escrowOf(address(token), address(strategy)), 1e18);
    }

    // =========================================================================
    // distributeAndClaim (#60) — atomic distribute-then-claim
    // =========================================================================

    /// @dev The footgun this fixes: distribute banks live accrual into escrow, and claim pays only
    ///      banked accrual. Bundled, the claim pays exactly what the distribute just banked.
    function test_distributeAndClaim_banksThenPays_oneCall() public {
        strategy.setMoves(
            MOCK_DISTRIBUTE, _move(MovementKind.FromEncumberedToEscrow, alice, address(strategy), address(token), 20e18)
        );
        strategy.setMoves(
            MOCK_CLAIM, _move(MovementKind.FromEscrowToFree, address(strategy), bob, address(token), 20e18)
        );

        uint256 bobFreeBefore = manager.freeBalance(address(token), bob);
        manager.distributeAndClaim(id, address(strategy), "");

        assertEq(strategy.distributeCalls(), 1, "distribute leg ran");
        assertEq(strategy.claimCalls(), 1, "claim leg ran");
        // The freshly-banked 20 flowed straight through to bob; escrow nets to zero.
        assertEq(manager.escrowOf(address(token), address(strategy)), 0, "escrow drained");
        assertEq(manager.freeBalance(address(token), bob) - bobFreeBefore, 20e18, "bob paid the banked accrual");
        assertEq(manager.getCommitment(id).amount, 80e18, "encumbrance shrank by the distributed amount");
        _partitionHolds();
    }

    function test_distributeAndClaim_unknownStrategyReverts() public {
        vm.expectRevert(ICM.UnknownStrategy.selector);
        manager.distributeAndClaim(id, mallory, "");
    }

    function test_distributeAndClaim_inactiveReverts() public {
        vm.prank(arbiter);
        manager.releaseCommitment(id);
        vm.expectRevert(ICM.CommitmentInactive.selector);
        manager.distributeAndClaim(id, address(strategy), "");
    }

    function test_distributeAndClaim_forfeitPendingReverts() public {
        vm.prank(arbiter);
        manager.initiateForfeit(id, 1000);
        vm.expectRevert(ICM.ForfeitPending.selector);
        manager.distributeAndClaim(id, address(strategy), "");
    }
}
