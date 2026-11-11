// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import "forge-std/Test.sol";

import {CommitmentManager} from "src/core/manager/CommitmentManager.sol";
import {ManagerTestBase} from "../helpers/ManagerTestBase.sol";
import {ICommitmentManager as ICM} from "src/core/interfaces/ICommitmentManager.sol";
import {
    IDistributionStrategy,
    StrategyBinding,
    TokenMovement,
    MovementKind
} from "src/core/interfaces/IDistributionStrategy.sol";
import {
    RecordingStrategy,
    RevertingStrategy,
    GasGuzzlerStrategy,
    ReentrantStrategy,
    MOCK_CLAIM,
    MOCK_RELEASED,
    MOCK_FORFEITED
} from "./mocks/StrategyMocks.sol";

/// @title HookLivenessTest
/// @notice Forfeit and release MUST NOT be vetoable by a strategy (ERC §D.6): reverting,
///         gas-guzzling, invalid-movement-returning, and reentrant strategies all degrade to
///         parked accrual — never to a blocked lifecycle transition. Plus the gas-starvation
///         case: a caller cannot hand-tune gas so hooks fail while the forfeit lands.
contract HookLivenessTest is ManagerTestBase {
    address internal alice = makeAddr("alice");
    address internal arbiter = makeAddr("arbiter");
    address internal bob = makeAddr("bob");

    function setUp() public override {
        super.setUp();
        _fund(alice, 1_000e18);
    }

    function _createWith(address strategy) internal returns (uint256 id) {
        ICM.CommitmentParams memory p;
        p.arbiter = arbiter;
        p.counterparty = bob;
        p.token = address(token);
        p.adapter = address(adapter);
        p.amount = 100e18;
        p.maxPenaltyBps = 5000;
        p.challengeWindow = WINDOW;
        p.strategies = new StrategyBinding[](1);
        p.strategies[0] = StrategyBinding(strategy, "");
        vm.prank(alice);
        id = manager.createCommitment(p);
    }

    function _partitionHolds() internal view {
        (uint256 free, uint256 enc, uint256 esc, uint256 mp) = manager.ledgerTotals(address(token));
        assertEq(free + enc + esc + mp, token.balanceOf(address(manager)), "INV-1 partition");
    }

    // =========================================================================
    // Reverting strategy
    // =========================================================================

    function test_revertingStrategy_releaseCompletes_hookParked() public {
        RevertingStrategy bad = new RevertingStrategy();
        uint256 id = _createWith(address(bad));

        vm.expectEmit(true, true, false, true);
        emit ICM.StrategyHookFailed(id, address(bad), IDistributionStrategy.onCommitmentReleased.selector);
        vm.prank(arbiter);
        manager.releaseCommitment(id);

        assertTrue(manager.getCommitment(id).released, "release completed");
        assertEq(manager.freeBalance(address(token), alice), 1_000e18, "encumbrance freed");
        assertEq(manager.failedHook(id, address(bad)), IDistributionStrategy.onCommitmentReleased.selector);
        _partitionHolds();
    }

    function test_revertingStrategy_forfeitCompletes_payoutIntact() public {
        RevertingStrategy bad = new RevertingStrategy();
        uint256 id = _createWith(address(bad));

        vm.prank(arbiter);
        manager.initiateForfeit(id, 5000);
        vm.warp(block.timestamp + WINDOW);

        vm.expectEmit(true, true, false, true);
        emit ICM.StrategyHookFailed(id, address(bad), IDistributionStrategy.onCommitmentForfeited.selector);
        manager.executeForfeit(id);

        assertTrue(manager.getCommitment(id).forfeited, "forfeit landed despite hook failure");
        assertEq(manager.freeBalance(address(token), bob), 50e18, "payout unconditional");
        assertEq(manager.freeBalance(address(token), alice), 950e18, "residual returned");
        _partitionHolds();
    }

    function test_revertingStrategy_escrowParkedNotForfeited() public {
        RevertingStrategy bad = new RevertingStrategy();
        uint256 id = _createWith(address(bad));

        // Pre-funded escrow (e.g. sponsor funding) stays parked through the failed hook.
        token.mint(address(this), 30e18);
        token.approve(address(manager), 30e18);
        manager.fundStrategy(address(bad), address(token), 30e18);

        vm.prank(arbiter);
        manager.releaseCommitment(id);

        assertEq(manager.escrowOf(address(token), address(bad)), 30e18, "park, don't forfeit");
        _partitionHolds();
    }

    // =========================================================================
    // Gas guzzler
    // =========================================================================

    function test_gasGuzzler_releaseCompletes_gasBounded() public {
        GasGuzzlerStrategy hog = new GasGuzzlerStrategy();
        uint256 id = _createWith(address(hog));

        uint256 gasBefore = gasleft();
        vm.prank(arbiter);
        manager.releaseCommitment(id);
        uint256 gasUsed = gasBefore - gasleft();

        assertTrue(manager.getCommitment(id).released);
        // The hook burned at most its cap (500k) + manager overhead — not the whole block.
        assertLt(gasUsed, 800_000, "hook gas capped");
        assertEq(manager.failedHook(id, address(hog)), IDistributionStrategy.onCommitmentReleased.selector);
    }

    function test_gasGuzzler_forfeitCompletes() public {
        GasGuzzlerStrategy hog = new GasGuzzlerStrategy();
        uint256 id = _createWith(address(hog));
        vm.prank(arbiter);
        manager.initiateForfeit(id, 5000);
        vm.warp(block.timestamp + WINDOW);
        manager.executeForfeit(id);
        assertEq(manager.freeBalance(address(token), bob), 50e18);
        _partitionHolds();
    }

    // =========================================================================
    // Invalid movements (theft attempts inside guarded frames)
    // =========================================================================

    function test_invalidMovementInReleaseHook_failsFrameNotTransition() public {
        RecordingStrategy thief = new RecordingStrategy();
        uint256 id = _createWith(address(thief));

        // Theft attempt: sweep MORE than the commitment's amount.
        TokenMovement[] memory moves = new TokenMovement[](1);
        moves[0] = TokenMovement(MovementKind.FromEncumberedToEscrow, alice, address(thief), address(token), 100e18 + 1);
        thief.setMoves(MOCK_RELEASED, moves);

        vm.expectEmit(true, true, false, true);
        emit ICM.StrategyHookFailed(id, address(thief), IDistributionStrategy.onCommitmentReleased.selector);
        vm.prank(arbiter);
        manager.releaseCommitment(id);

        // Invalid movements degrade identically to a revert: nothing from the batch applied.
        assertEq(manager.escrowOf(address(token), address(thief)), 0);
        assertEq(manager.freeBalance(address(token), alice), 1_000e18, "full amount back to committer");
        _partitionHolds();
    }

    function test_invalidMovementInForfeitHook_overResidual_failsFrame() public {
        RecordingStrategy thief = new RecordingStrategy();
        uint256 id = _createWith(address(thief));

        vm.prank(arbiter);
        manager.initiateForfeit(id, 4000); // residual 60
        vm.warp(block.timestamp + WINDOW);

        TokenMovement[] memory moves = new TokenMovement[](1);
        moves[0] = TokenMovement(MovementKind.FromEncumberedToEscrow, alice, address(thief), address(token), 60e18 + 1);
        thief.setMoves(MOCK_FORFEITED, moves);

        manager.executeForfeit(id);
        assertEq(manager.freeBalance(address(token), bob), 40e18, "forfeit payout intact");
        assertEq(manager.freeBalance(address(token), alice), 960e18, "full residual returned");
        assertEq(manager.escrowOf(address(token), address(thief)), 0, "theft frame dropped");
        _partitionHolds();
    }

    // =========================================================================
    // Reentrancy
    // =========================================================================

    function test_reentrantStrategy_hitsLock_transitionCompletes() public {
        ReentrantStrategy sneaky = new ReentrantStrategy();
        sneaky.configure(address(manager), address(token));
        uint256 id = _createWith(address(sneaky));

        vm.prank(arbiter);
        manager.releaseCommitment(id);

        assertTrue(manager.getCommitment(id).released, "release completed");
        assertEq(
            manager.failedHook(id, address(sneaky)),
            IDistributionStrategy.onCommitmentReleased.selector,
            "reentrancy attempt failed the frame"
        );
        assertEq(manager.freeBalance(address(token), alice), 1_000e18);
        _partitionHolds();
    }

    // =========================================================================
    // Gas starvation (ERC §D.6 rule 3)
    // =========================================================================

    function test_gasStarvation_revertsWholeTransaction_neverPartial() public {
        RecordingStrategy strategy = new RecordingStrategy();
        uint256 id = _createWith(address(strategy));
        vm.prank(arbiter);
        manager.initiateForfeit(id, 5000);
        vm.warp(block.timestamp + WINDOW);

        // Hand-tuned gas: enough to run the forfeit core, NOT enough for the hook frame to
        // genuinely receive its 500k cap. The min-gas guard must revert the ENTIRE call —
        // the forfeit must not land with the hook starved.
        (bool success, bytes memory data) =
            address(manager).call{gas: 400_000}(abi.encodeCall(CommitmentManager.executeForfeit, (id)));

        assertFalse(success, "starved call reverts");
        assertEq(bytes4(data), ICM.InsufficientGasForHook.selector, "explicit starvation error");
        assertFalse(manager.getCommitment(id).forfeited, "nothing partial: forfeit did not land");
        assertEq(manager.freeBalance(address(token), bob), 0);
        assertEq(strategy.forfeitedCalls(), 0);

        // With adequate gas the same forfeit executes fine, hook included.
        manager.executeForfeit(id);
        assertTrue(manager.getCommitment(id).forfeited);
        assertEq(strategy.forfeitedCalls(), 1);
    }

    // =========================================================================
    // sweepFailedHook (ERC §D.6 re-drive)
    // =========================================================================

    function test_sweepFailedHook_redrivesAfterCauseClears() public {
        RecordingStrategy strategy = new RecordingStrategy();
        uint256 id = _createWith(address(strategy));

        // Escrow some accrual, then make the strategy transiently broken.
        token.mint(address(this), 30e18);
        token.approve(address(manager), 30e18);
        manager.fundStrategy(address(strategy), address(token), 30e18);
        strategy.setRevertOnLifecycle(true);

        vm.prank(arbiter);
        manager.releaseCommitment(id);
        assertEq(manager.failedHook(id, address(strategy)), IDistributionStrategy.onCommitmentReleased.selector);

        // Cause clears; the re-driven hook disposes of escrowed value (escrow→free payout).
        strategy.setRevertOnLifecycle(false);
        TokenMovement[] memory moves = new TokenMovement[](1);
        moves[0] = TokenMovement(MovementKind.FromEscrowToFree, address(strategy), bob, address(token), 30e18);
        strategy.setMoves(MOCK_RELEASED, moves);

        manager.sweepFailedHook(id, address(strategy)); // permissionless
        assertEq(manager.failedHook(id, address(strategy)), bytes4(0), "marker cleared");
        assertEq(manager.freeBalance(address(token), bob), 30e18, "parked value delivered");
        assertEq(strategy.releasedCalls(), 1);
        _partitionHolds();
    }

    function test_sweepFailedHook_postClose_noEncumberedHeadroom() public {
        RecordingStrategy strategy = new RecordingStrategy();
        uint256 id = _createWith(address(strategy));
        strategy.setRevertOnLifecycle(true);
        vm.prank(arbiter);
        manager.releaseCommitment(id);
        strategy.setRevertOnLifecycle(false);

        // Alice creates a SECOND commitment with her freed balance. A re-driven hook on the
        // closed commitment must not be able to debit encumbrance now backing the new one.
        _createWith(address(new RecordingStrategy()));

        TokenMovement[] memory moves = new TokenMovement[](1);
        moves[0] = TokenMovement(MovementKind.FromEncumberedToEscrow, alice, address(strategy), address(token), 1);
        strategy.setMoves(MOCK_RELEASED, moves);

        manager.sweepFailedHook(id, address(strategy));
        // Frame failed again (c.amount == 0 → no headroom) — marker still set, nothing stolen.
        assertEq(manager.failedHook(id, address(strategy)), IDistributionStrategy.onCommitmentReleased.selector);
        assertEq(manager.escrowOf(address(token), address(strategy)), 0);
        _partitionHolds();
    }

    function test_sweepFailedHook_requiresFailure() public {
        RecordingStrategy strategy = new RecordingStrategy();
        uint256 id = _createWith(address(strategy));
        vm.expectRevert(ICM.NoFailedHook.selector);
        manager.sweepFailedHook(id, address(strategy));
    }
}
