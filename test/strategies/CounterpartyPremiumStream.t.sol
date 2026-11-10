// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import "forge-std/Test.sol";
import {ERC1967Proxy} from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";

import {CommitmentManager} from "src/core/manager/CommitmentManager.sol";
import {ICommitmentManager as ICM} from "src/core/interfaces/ICommitmentManager.sol";
import {StrategyBinding, DistributeContext} from "src/core/interfaces/IDistributionStrategy.sol";
import {IBackingAdapter} from "src/core/interfaces/IBackingAdapter.sol";
import {CounterpartyPremiumStream} from "src/distributions/CounterpartyPremiumStream.sol";
import {MockERC20} from "../helpers/MockERC20.sol";
import {StrategyBase} from "src/distributions/StrategyBase.sol";

/// @dev Minimal 1:1 index adapter — the premium stream is independent of backing appreciation.
contract MockStaticAdapter is IBackingAdapter {
    function indexNow(address) external pure returns (uint256) {
        return 1e18;
    }

    function payoutDenomination(address token) external pure returns (address) {
        return token;
    }
}

/// @title CounterpartyPremiumStreamTest
/// @notice Exercises the insured→underwriter premium direction: the counterparty (bob) funds a
///         premium that streams to the committer (alice, the underwriter who locked backing).
contract CounterpartyPremiumStreamTest is Test {
    CommitmentManager internal manager;
    MockERC20 internal token;
    MockStaticAdapter internal adapter;
    CounterpartyPremiumStream internal strategy;

    address internal admin = makeAddr("admin");
    address internal alice = makeAddr("alice"); // committer = underwriter
    address internal arbiter = makeAddr("arbiter");
    address internal bob = makeAddr("bob"); // counterparty = insured

    uint256 internal id;
    uint64 internal constant WINDOW = 1 days;
    uint256 internal constant RATE = 1e15; // 0.001 token / second

    function setUp() public {
        // Start well past t=0 so accrual math has room below `startTime`.
        vm.warp(1_000_000);

        CommitmentManager impl = new CommitmentManager();
        manager = CommitmentManager(
            address(
                new ERC1967Proxy(address(impl), abi.encodeCall(CommitmentManager.initialize, (admin, 7 days, 14 days)))
            )
        );
        token = new MockERC20("mUSDC", "mUSDC", 18);
        adapter = new MockStaticAdapter();
        strategy = new CounterpartyPremiumStream(address(manager));

        // Alice (underwriter) posts 500 of backing as coverage.
        token.mint(alice, 1_000e18);
        vm.startPrank(alice);
        token.approve(address(manager), type(uint256).max);
        manager.deposit(address(token), 1_000e18);
        vm.stopPrank();

        id = _create(RATE);

        // Bob (insured) holds premium and approves the strategy's self-custody surface.
        token.mint(bob, 1_000e18);
        vm.prank(bob);
        token.approve(address(strategy), type(uint256).max);
    }

    function _create(uint256 ratePerSecond) internal returns (uint256) {
        ICM.CommitmentParams memory p;
        p.arbiter = arbiter;
        p.counterparty = bob;
        p.token = address(token);
        p.adapter = address(adapter);
        p.amount = 500e18;
        p.maxPenaltyBps = 5000;
        p.challengeWindow = WINDOW;
        p.strategies = new StrategyBinding[](1);
        p.strategies[0] = StrategyBinding(address(strategy), abi.encode(ratePerSecond));
        vm.prank(alice);
        return manager.createCommitment(p);
    }

    // ---------------------------------------------------------------------
    // Binding
    // ---------------------------------------------------------------------

    function test_onCreated_storesStream() public view {
        (uint256 rate, uint256 funded, uint256 claimed, address tok, address cp, uint64 start, bool bound) =
            strategy.streamOf(id);
        assertEq(rate, RATE);
        assertEq(funded, 0);
        assertEq(claimed, 0);
        assertEq(tok, address(token));
        assertEq(cp, bob);
        assertEq(start, uint64(block.timestamp));
        assertTrue(bound);
    }

    function test_hooks_managerOnly() public {
        DistributeContext memory ctx;
        vm.expectRevert(StrategyBase.OnlyManager.selector);
        strategy.distribute(ctx);
    }

    // ---------------------------------------------------------------------
    // Funding
    // ---------------------------------------------------------------------

    function test_fundPremium_onlyCounterparty() public {
        vm.prank(alice);
        vm.expectRevert(StrategyBase.NotAuthorized.selector);
        strategy.fundPremium(id, 10e18);

        vm.prank(bob);
        strategy.fundPremium(id, 100e18);
        (, uint256 funded,,,,,) = strategy.streamOf(id);
        assertEq(funded, 100e18);
        assertEq(token.balanceOf(address(strategy)), 100e18, "self-custody: premium held by the strategy");
    }

    function test_fundPremium_unboundReverts() public {
        vm.prank(bob);
        vm.expectRevert(StrategyBase.NotBound.selector);
        strategy.fundPremium(999, 1e18);
    }

    function test_fundPremium_zeroReverts() public {
        vm.prank(bob);
        vm.expectRevert(StrategyBase.ZeroAmount.selector);
        strategy.fundPremium(id, 0);
    }

    // ---------------------------------------------------------------------
    // Streaming accrual
    // ---------------------------------------------------------------------

    function test_accrual_isLinearInTime() public {
        vm.prank(bob);
        strategy.fundPremium(id, 100e18);

        assertEq(strategy.earnedOf(id), 0, "nothing accrued at t0");

        vm.warp(block.timestamp + 1000);
        assertEq(strategy.earnedOf(id), RATE * 1000, "linear accrual");
        assertEq(manager.pending(id, address(strategy), ""), RATE * 1000, "pending mirrors earned");
    }

    function test_accrual_cappedByFunded() public {
        vm.prank(bob);
        strategy.fundPremium(id, 1e18); // only 1000s worth at RATE

        vm.warp(block.timestamp + 5000); // would accrue 5e18 uncapped
        assertEq(strategy.earnedOf(id), 1e18, "accrual capped by the counterparty's deposit");
    }

    /// @dev A committer-chosen rate near uint256 max must saturate at `funded`, not overflow and
    ///      lock `claim`, `pending` and `reclaimUnstreamed`.
    function test_hugeRate_saturatesInsteadOfOverflowing() public {
        uint256 hugeId = _create(type(uint256).max - 1);
        vm.prank(bob);
        strategy.fundPremium(hugeId, 100e18);
        vm.warp(block.timestamp + 1000);

        assertEq(strategy.earnedOf(hugeId), 100e18);
        assertEq(strategy.reclaimableOf(hugeId), 0);
        assertEq(manager.pending(hugeId, address(strategy), ""), 100e18);

        vm.prank(alice);
        manager.claim(hugeId, address(strategy), "");
        assertEq(token.balanceOf(alice), 100e18);
        assertEq(manager.pending(hugeId, address(strategy), ""), 0);

        vm.prank(arbiter);
        manager.releaseCommitment(hugeId);
        vm.prank(bob);
        vm.expectRevert(StrategyBase.NothingToClaim.selector);
        strategy.reclaimUnstreamed(hugeId);
    }

    function test_zeroRate_dormant() public {
        uint256 dormant = _create(0);
        vm.prank(bob);
        strategy.fundPremium(dormant, 100e18);
        vm.warp(block.timestamp + 10_000);
        assertEq(strategy.earnedOf(dormant), 0, "zero-rate stream never accrues");
    }

    // ---------------------------------------------------------------------
    // Committer claim (self-custody payout)
    // ---------------------------------------------------------------------

    function test_claim_committerReceivesStreamedPremium() public {
        vm.prank(bob);
        strategy.fundPremium(id, 100e18);
        vm.warp(block.timestamp + 1000);

        uint256 expected = RATE * 1000;
        vm.expectEmit(true, true, true, true);
        emit ICM.DistributionPaid(address(strategy), alice, address(token), expected, id, bytes32(0));
        vm.prank(alice);
        manager.claim(id, address(strategy), "");

        assertEq(token.balanceOf(alice), expected, "underwriter paid in raw token");
        (,, uint256 claimed,,,,) = strategy.streamOf(id);
        assertEq(claimed, expected);

        // Immediate re-claim: nothing new accrued in the same block.
        vm.prank(alice);
        vm.expectRevert(StrategyBase.NothingToClaim.selector);
        manager.claim(id, address(strategy), "");
    }

    function test_claim_incrementalAcrossTime() public {
        vm.prank(bob);
        strategy.fundPremium(id, 100e18);

        vm.warp(block.timestamp + 1000);
        vm.prank(alice);
        manager.claim(id, address(strategy), "");
        assertEq(token.balanceOf(alice), RATE * 1000);

        vm.warp(block.timestamp + 500);
        vm.prank(alice);
        manager.claim(id, address(strategy), "");
        assertEq(token.balanceOf(alice), RATE * 1500, "second claim pays only the new accrual");
    }

    function test_claim_strangerRejected() public {
        vm.prank(bob);
        strategy.fundPremium(id, 100e18);
        vm.warp(block.timestamp + 1000);

        // Even the counterparty (who funded) cannot claim — only the underwriter earns.
        vm.prank(bob);
        vm.expectRevert(StrategyBase.NotAuthorized.selector);
        manager.claim(id, address(strategy), "");
    }

    // ---------------------------------------------------------------------
    // Freeze at close + reclaim
    // ---------------------------------------------------------------------

    function test_streamFreezesAtClose() public {
        vm.prank(bob);
        strategy.fundPremium(id, 100e18);

        vm.warp(block.timestamp + 500);
        vm.prank(arbiter);
        manager.releaseCommitment(id); // policy ends here
        uint256 earnedAtClose = strategy.earnedOf(id);
        assertEq(earnedAtClose, RATE * 500);

        vm.warp(block.timestamp + 10_000); // long after close
        assertEq(strategy.earnedOf(id), earnedAtClose, "accrual frozen at the close time");
    }

    function test_fundPremium_afterCloseReverts() public {
        vm.prank(arbiter);
        manager.releaseCommitment(id);
        vm.prank(bob);
        vm.expectRevert(CounterpartyPremiumStream.StreamEnded.selector);
        strategy.fundPremium(id, 1e18);
    }

    function test_reclaim_revertsWhileActive() public {
        vm.prank(bob);
        strategy.fundPremium(id, 100e18);
        vm.prank(bob);
        vm.expectRevert(CounterpartyPremiumStream.StreamActive.selector);
        strategy.reclaimUnstreamed(id);
    }

    function test_reclaim_onlyCounterparty() public {
        vm.prank(bob);
        strategy.fundPremium(id, 100e18);
        vm.warp(block.timestamp + 500);
        vm.prank(arbiter);
        manager.releaseCommitment(id);

        vm.prank(alice);
        vm.expectRevert(StrategyBase.NotAuthorized.selector);
        strategy.reclaimUnstreamed(id);
    }

    /// @dev Full lifecycle conservation: every funded unit ends up either paid to the underwriter
    ///      or refunded to the insured — the strategy retains nothing.
    function test_lifecycle_conservationOfFunds() public {
        vm.prank(bob);
        strategy.fundPremium(id, 100e18);

        vm.warp(block.timestamp + 500);
        vm.prank(arbiter);
        manager.releaseCommitment(id);

        uint256 earned = RATE * 500;

        // Underwriter claims the streamed portion.
        vm.prank(alice);
        manager.claim(id, address(strategy), "");
        assertEq(token.balanceOf(alice), earned);

        // Insured reclaims the unstreamed remainder.
        uint256 bobBefore = token.balanceOf(bob);
        vm.expectEmit(true, true, false, true);
        emit CounterpartyPremiumStream.PremiumReclaimed(id, bob, 100e18 - earned);
        vm.prank(bob);
        strategy.reclaimUnstreamed(id);
        assertEq(token.balanceOf(bob) - bobBefore, 100e18 - earned, "insured recovers unstreamed premium");

        // Nothing stranded in the strategy.
        assertEq(token.balanceOf(address(strategy)), 0, "conservation: strategy holds no residual");

        // A second reclaim finds nothing.
        vm.prank(bob);
        vm.expectRevert(StrategyBase.NothingToClaim.selector);
        strategy.reclaimUnstreamed(id);
    }

    /// @dev Reclaim after close must not strand the underwriter's still-unclaimed accrual.
    function test_reclaim_preservesUnclaimedCommitterAccrual() public {
        vm.prank(bob);
        strategy.fundPremium(id, 100e18);

        vm.warp(block.timestamp + 500);
        vm.prank(arbiter);
        manager.releaseCommitment(id);
        uint256 earned = RATE * 500;

        // Insured reclaims BEFORE the underwriter has claimed.
        vm.prank(bob);
        strategy.reclaimUnstreamed(id);
        assertEq(token.balanceOf(address(strategy)), earned, "underwriter's claim stays funded");

        // Underwriter can still collect the full streamed amount.
        vm.prank(alice);
        manager.claim(id, address(strategy), "");
        assertEq(token.balanceOf(alice), earned);
        assertEq(token.balanceOf(address(strategy)), 0);
    }

    /// @dev Forfeit is also a close: the stream freezes and the premium settles the same way.
    function test_forfeitAlsoFreezesStream() public {
        vm.prank(bob);
        strategy.fundPremium(id, 100e18);

        vm.warp(block.timestamp + 300);
        vm.prank(arbiter);
        manager.initiateForfeit(id, 5000);
        vm.warp(block.timestamp + WINDOW);
        manager.executeForfeit(id);

        // Frozen at the forfeit-execution timestamp.
        uint256 earnedAtClose = strategy.earnedOf(id);
        assertEq(earnedAtClose, RATE * (300 + WINDOW));

        vm.warp(block.timestamp + 10_000);
        assertEq(strategy.earnedOf(id), earnedAtClose, "no accrual after forfeit close");

        // Underwriter still collects the premium earned up to the forfeit.
        vm.prank(alice);
        manager.claim(id, address(strategy), "");
        assertEq(token.balanceOf(alice), earnedAtClose);
    }
}
