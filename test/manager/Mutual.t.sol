// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import "forge-std/Test.sol";
import {ERC1967Proxy} from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";

import {CommitmentManager} from "src/core/manager/CommitmentManager.sol";
import {ICommitmentManager as ICM} from "src/core/interfaces/ICommitmentManager.sol";
import {StrategyBinding} from "src/core/interfaces/IDistributionStrategy.sol";
import {MockERC20} from "../helpers/MockERC20.sol";

/// @title ManagerMutualTest
/// @notice Unit coverage for the shared-loss-index ("Mutual")
///         primitive (ERC-COMMITMENTS-MUTUALS). Targets the load-bearing properties: fixed-denominator
///         summation + Lambda<=1e18 clamp, settle-order independence, join non-retroactivity, the
///         size-1 reduction, dust bound, the deallocation-delay escape defense, the cross-cutting
///         close-path gating (INV-G8), and INV-3 under a member/non-member overlap (OBJ-1).
contract ManagerMutualTest is Test {
    CommitmentManager internal manager;
    MockERC20 internal token; // homogeneous numeraire
    MockERC20 internal other; // a second token for overlap tests

    address internal admin = makeAddr("admin");
    address internal arbiter = makeAddr("mutualArbiter");
    address internal beneficiary = makeAddr("beneficiary"); // a ClaimRouter stand-in
    address internal adapter = makeAddr("adapter");

    address internal u1 = makeAddr("u1");
    address internal u2 = makeAddr("u2");
    address internal u3 = makeAddr("u3");

    uint64 internal constant MUTUAL_WINDOW = 2 days;
    uint64 internal constant MEMBER_WINDOW = 1 days;

    function setUp() public {
        CommitmentManager impl = new CommitmentManager();
        manager = CommitmentManager(
            address(
                new ERC1967Proxy(address(impl), abi.encodeCall(CommitmentManager.initialize, (admin, 7 days, 14 days)))
            )
        );
        token = new MockERC20("Numeraire", "NUM", 18);
        other = new MockERC20("Other", "OTH", 18);

        address[3] memory us = [u1, u2, u3];
        for (uint256 i; i < us.length; i++) {
            token.mint(us[i], 1_000_000e18);
            other.mint(us[i], 1_000_000e18);
            vm.startPrank(us[i]);
            token.approve(address(manager), type(uint256).max);
            other.approve(address(manager), type(uint256).max);
            manager.deposit(address(token), 1_000_000e18);
            manager.deposit(address(other), 1_000_000e18);
            vm.stopPrank();
        }
    }

    // =========================================================================
    // Helpers
    // =========================================================================

    function _createHomogeneousMutual() internal returns (uint256 gid) {
        ICM.MutualParams memory p = ICM.MutualParams({
            arbiter: arbiter,
            numeraire: address(token),
            beneficiary: beneficiary,
            challengeWindow: MUTUAL_WINDOW,
            deallocationWindow: MUTUAL_WINDOW
        });
        gid = manager.createMutual(p);
        vm.prank(arbiter);
        manager.activateMutual(gid);
    }

    function _join(uint256 gid, address who, uint256 amount, uint16 bps) internal returns (uint256 cid) {
        ICM.CommitmentParams memory p;
        p.arbiter = arbiter;
        p.counterparty = beneficiary;
        p.token = address(token);
        p.adapter = adapter;
        p.amount = amount;
        p.maxPenaltyBps = bps;
        p.challengeWindow = MEMBER_WINDOW;
        p.strategies = new StrategyBinding[](0);
        vm.prank(who);
        cid = manager.joinMutual(gid, p);
    }

    function _declareAndExecute(uint256 gid, uint256 loss) internal {
        vm.prank(arbiter);
        manager.initiateMutualLoss(gid, loss, bytes32("evidence"));
        vm.warp(block.timestamp + MUTUAL_WINDOW + 1);
        manager.executeMutualLoss(gid);
    }

    // =========================================================================
    // Happy path + the fixed-denominator math
    // =========================================================================

    function test_join_freezesCapacity_homogeneous() public {
        uint256 gid = _createHomogeneousMutual();
        uint256 cid = _join(gid, u1, 100e18, 10_000);

        ICM.Membership memory m = manager.getMembership(cid);
        assertEq(m.mutualId, gid, "mutualId");
        assertEq(m.forfeitableUnits, 100e18, "E_i frozen");
        assertEq(m.creditedValue, 100e18, "creditedValue == E_i (homogeneous)");
        assertEq(m.settledUnits, 0, "no settle yet");

        ICM.Mutual memory g = manager.getMutual(gid);
        assertEq(g.totalShares, 100e18, "totalShares = sum creditedValue");
        // The member's encumbrance is live.
        assertEq(manager.encumberedBalance(address(token), u1), 100e18, "encumbered");
    }

    function test_join_sameCommitterCreatesIndependentMemberships() public {
        uint256 gid = _createHomogeneousMutual();
        uint256 c1 = _join(gid, u1, 100e18, 10_000);
        uint256 c2 = _join(gid, u1, 50e18, 10_000);

        assertNotEq(c1, c2, "each join creates a fresh commitment");
        assertEq(manager.getMembership(c1).mutualId, gid, "first membership");
        assertEq(manager.getMembership(c2).mutualId, gid, "second membership");
        assertEq(manager.getMutual(gid).totalShares, 150e18, "both memberships credited");
        assertEq(manager.encumberedBalance(address(token), u1), 150e18, "both commitments encumbered");
    }

    function test_singleLoss_socializedByFraction() public {
        uint256 gid = _createHomogeneousMutual();
        uint256 c1 = _join(gid, u1, 100e18, 10_000);
        uint256 c2 = _join(gid, u2, 100e18, 10_000);
        // totalShares = 200e18. A 50e18 loss => Lambda = 0.25e18 => each owes 25e18.
        _declareAndExecute(gid, 50e18);

        uint256 benBefore = manager.freeBalance(address(token), beneficiary);
        vm.expectEmit(true, true, false, true, address(manager));
        emit ICM.MemberSettled(gid, c1, 25e18, 0.25e18);
        manager.settleMemberLoss(c1);
        manager.settleMemberLoss(c2);
        uint256 paid = manager.freeBalance(address(token), beneficiary) - benBefore;
        assertEq(paid, 50e18, "beneficiary receives exactly the declared loss");

        assertEq(manager.getMembership(c1).settledUnits, 25e18, "u1 owes its fraction");
        assertEq(manager.getMembership(c2).settledUnits, 25e18, "u2 owes its fraction");
        // Residual stays encumbered (commitment survives).
        assertEq(manager.getCommitment(c1).amount, 75e18, "residual encumbered");
    }

    /// @dev Property 1 (the test that fails under the note's shrinking denominator). Two full-cover
    ///      losses drive Lambda to exactly 1e18 — never past — and each member owes exactly E_i.
    function test_multiLoss_fixedDenominator_capsAtOne() public {
        uint256 gid = _createHomogeneousMutual();
        uint256 c1 = _join(gid, u1, 100e18, 10_000);
        uint256 c2 = _join(gid, u2, 100e18, 10_000);
        // totalShares=200e18. L1=100e18 -> Lambda=0.5e18. L2=100e18 -> Lambda=1e18 (NOT 1.5).
        _declareAndExecute(gid, 100e18);
        assertEq(manager.getMutual(gid).cumulativeLoss, 0.5e18, "Lambda after L1");
        _declareAndExecute(gid, 100e18);
        assertEq(manager.getMutual(gid).cumulativeLoss, 1e18, "Lambda capped at 1e18");

        // K deferred losses collapse into ONE settle (reads current Lambda).
        manager.settleMemberLoss(c1);
        manager.settleMemberLoss(c2);
        assertEq(manager.getMembership(c1).settledUnits, 100e18, "u1 owes exactly E_i");
        assertEq(manager.getMembership(c2).settledUnits, 100e18, "u2 owes exactly E_i");
        assertEq(manager.freeBalance(address(token), beneficiary), 200e18, "beneficiary gets L1+L2");
    }

    /// @dev A third loss past full coverage is clamped and the shortfall is observable, never silent.
    function test_lossPastFullCoverage_emitsShortfall() public {
        uint256 gid = _createHomogeneousMutual();
        _join(gid, u1, 100e18, 10_000);
        _declareAndExecute(gid, 100e18); // Lambda = 1e18 already (totalShares=100e18)
        assertEq(manager.getMutual(gid).cumulativeLoss, 1e18, "fully attributed");

        vm.prank(arbiter);
        manager.initiateMutualLoss(gid, 40e18, bytes32(0));
        vm.warp(block.timestamp + MUTUAL_WINDOW + 1);
        vm.expectEmit(true, false, false, true);
        emit ICM.MutualLossShortfall(gid, 40e18); // entire further loss is unappliable
        manager.executeMutualLoss(gid);
        assertEq(manager.getMutual(gid).cumulativeLoss, 1e18, "Lambda stays at the cap");
    }

    /// @dev Property 2: settling members in any order yields the same total ledger delta.
    function test_settleOrderIndependence() public {
        uint256 gidA = _createHomogeneousMutual();
        uint256 a1 = _join(gidA, u1, 100e18, 10_000);
        uint256 a2 = _join(gidA, u2, 50e18, 10_000);
        uint256 a3 = _join(gidA, u3, 30e18, 10_000);
        _declareAndExecute(gidA, 90e18);

        uint256 snap = vm.snapshotState();
        manager.settleMemberLoss(a1);
        manager.settleMemberLoss(a2);
        manager.settleMemberLoss(a3);
        uint256 paidForward = manager.freeBalance(address(token), beneficiary);
        vm.revertToState(snap);

        manager.settleMemberLoss(a3);
        manager.settleMemberLoss(a1);
        manager.settleMemberLoss(a2);
        uint256 paidReverse = manager.freeBalance(address(token), beneficiary);
        assertEq(paidForward, paidReverse, "settle order does not change the total paid");
    }

    /// @dev Property 3: a member joining at Lambda=l0 is never charged for prior losses.
    function test_joinAfterLoss_nonRetroactive() public {
        uint256 gid = _createHomogeneousMutual();
        uint256 c1 = _join(gid, u1, 100e18, 10_000);
        _declareAndExecute(gid, 50e18); // Lambda = 0.5e18

        uint256 c2 = _join(gid, u2, 100e18, 10_000); // joins at Lambda=0.5e18
        assertEq(manager.getMembership(c2).lossSnapshot, 0.5e18, "snapshot at join");

        manager.settleMemberLoss(c2);
        assertEq(manager.getMembership(c2).settledUnits, 0, "late joiner owes nothing for the prior loss");
        // c1 still owes its full pre-join share.
        manager.settleMemberLoss(c1);
        assertEq(manager.getMembership(c1).settledUnits, 50e18, "early member bears the loss");
    }

    /// @dev Property 4 (size-1 reduction at the full-penalty corner): a 1-member mutual taking a
    ///      Lambda=1 loss forfeits the same units a single forfeit(10_000) would.
    function test_sizeOne_reducesToSingleForfeit_fullPenalty() public {
        uint256 gid = _createHomogeneousMutual();
        uint256 cid = _join(gid, u1, 100e18, 10_000);
        _declareAndExecute(gid, 100e18); // Lambda = 1e18 (full)
        manager.settleMemberLoss(cid);
        // forfeited-units leg == amount * 10_000/10_000 == 100e18, exactly the single-forfeit delta.
        assertEq(manager.freeBalance(address(token), beneficiary), 100e18, "full forfeit at the corner");
        assertEq(manager.getCommitment(cid).amount, 0, "no residual at full penalty");
    }

    /// @dev Property 5: rounding is member-down, so sum settled never exceeds the declared loss.
    function test_dustBound_sumNeverExceedsLoss() public {
        uint256 gid = _createHomogeneousMutual();
        uint256 c1 = _join(gid, u1, 333e18, 10_000);
        uint256 c2 = _join(gid, u2, 777e18, 10_000);
        uint256 c3 = _join(gid, u3, 101e18, 10_000);
        _declareAndExecute(gid, 137e18); // an awkward loss to force rounding
        manager.settleMemberLoss(c1);
        manager.settleMemberLoss(c2);
        manager.settleMemberLoss(c3);
        assertLe(manager.freeBalance(address(token), beneficiary), 137e18, "sum settled <= declared L");
    }

    // =========================================================================
    // Deallocation-delay exit (the pre-declaration escape defense)
    // =========================================================================

    function test_exit_requiresDeallocationWindow() public {
        uint256 gid = _createHomogeneousMutual();
        uint256 cid = _join(gid, u1, 100e18, 10_000);

        vm.expectEmit(true, true, false, true, address(manager));
        emit ICM.MemberExitRequested(gid, cid, uint64(block.timestamp) + MUTUAL_WINDOW);
        vm.prank(u1);
        manager.requestMutualExit(cid);
        // Cannot release before the window elapses.
        vm.expectRevert(ICM.DeallocationWindowActive.selector);
        manager.releaseMutualMember(cid);

        // ...and the line is STILL slashable inside the window.
        _declareAndExecute(gid, 40e18);
        manager.settleMemberLoss(cid);
        assertEq(manager.getMembership(cid).settledUnits, 40e18, "exiting member still slashed");

        // The declaration ran the clock past the window; once settled, release returns the residual.
        manager.releaseMutualMember(cid);
        assertEq(manager.getMembership(cid).mutualId, 0, "membership cleared");
        assertEq(manager.getCommitment(cid).released, true, "commitment released");
        assertEq(manager.getMutual(gid).totalShares, 0, "totalShares decremented at exit");
        assertEq(manager.freeBalance(address(token), u1), 1_000_000e18 - 40e18, "residual returned to committer");
    }

    function test_release_revertsWithUnsettledLoss() public {
        uint256 gid = _createHomogeneousMutual();
        uint256 cid = _join(gid, u1, 100e18, 10_000);
        vm.prank(u1);
        manager.requestMutualExit(cid);
        _declareAndExecute(gid, 40e18); // loss within the window, NOT settled; the exit window is now open
        vm.expectRevert(ICM.MemberUnsettled.selector);
        manager.releaseMutualMember(cid);
    }

    // =========================================================================
    // Cross-cutting close-path gating (INV-G8 / OBJ-5)
    // =========================================================================

    function test_mutualMemberCommitment_barredFromNormalPaths() public {
        uint256 gid = _createHomogeneousMutual();
        uint256 cid = _join(gid, u1, 100e18, 10_000);

        vm.prank(arbiter);
        vm.expectRevert(ICM.CommitmentInMutual.selector);
        manager.releaseCommitment(cid);

        vm.prank(arbiter);
        vm.expectRevert(ICM.CommitmentInMutual.selector);
        manager.initiateForfeit(cid, 10_000);

        vm.prank(u1);
        vm.expectRevert(ICM.CommitmentInMutual.selector);
        manager.requestUnbond(cid);

        vm.prank(u1);
        vm.expectRevert(ICM.CommitmentInMutual.selector);
        manager.contributeEncumbered(cid, 1);
    }

    // =========================================================================
    // INV-3 under a mutual-member / non-member overlap on the same token (OBJ-1)
    // =========================================================================

    function test_inv3_mutualMemberAndNonMemberOverlap() public {
        uint256 gid = _createHomogeneousMutual();
        // u1 holds BOTH a mutual-member commitment (bps 6000) and a separate high-penalty (bps 10000)
        // commitment on the SAME token — the exact case the red-team flagged for INV-3.
        uint256 member = _join(gid, u1, 100e18, 6_000); // E_i = 60e18

        ICM.CommitmentParams memory p;
        p.arbiter = arbiter;
        p.counterparty = beneficiary;
        p.token = address(token);
        p.adapter = adapter;
        p.amount = 50e18;
        p.maxPenaltyBps = 10_000;
        p.challengeWindow = MEMBER_WINDOW;
        p.strategies = new StrategyBinding[](0);
        vm.prank(u1);
        manager.createCommitment(p); // separate, non-member

        // Before: encumbered = 150e18, forfeitable = 60e18 + 50e18 = 110e18.
        _assertInv3(u1);

        // A mutual loss that partially settles the member commitment must keep INV-3.
        _declareAndExecute(gid, 30e18); // Lambda = 30/60 ... totalShares = 60e18 -> Lambda=0.5e18
        manager.settleMemberLoss(member); // owed = 60e18*0.5 = 30e18
        _assertInv3(u1);

        ICM.UserExposure memory mag = manager.getUserExposure(address(token), u1);
        // member: enc 100-30=70, forf 60-30=30. other: enc 50, forf 50. totals: enc 120, forf 80.
        assertEq(mag.totalEncumbered, 120e18, "encumbered after settle");
        assertEq(mag.totalForfeitable, 80e18, "forfeitable after settle");
    }

    function _assertInv3(address user) internal view {
        ICM.UserExposure memory mag = manager.getUserExposure(address(token), user);
        assertLe(mag.totalForfeitable, mag.totalEncumbered, "INV-3");
    }

    // =========================================================================
    // Empty mutual / overflow / join guards
    // =========================================================================

    function test_emptyMutual_execute_shortfallAndTerminal() public {
        uint256 gid = _createHomogeneousMutual();
        uint256 cid = _join(gid, u1, 100e18, 10_000);
        // Exit the only member so totalShares == 0 at execute.
        vm.prank(u1);
        manager.requestMutualExit(cid);
        vm.warp(block.timestamp + MUTUAL_WINDOW + 1);
        manager.releaseMutualMember(cid);
        assertEq(manager.getMutual(gid).totalShares, 0, "empty");

        vm.prank(arbiter);
        manager.initiateMutualLoss(gid, 10e18, bytes32(0));
        vm.warp(block.timestamp + MUTUAL_WINDOW + 1);
        vm.expectEmit(true, false, false, true);
        emit ICM.MutualLossShortfall(gid, 10e18);
        manager.executeMutualLoss(gid);
        assertTrue(manager.getMutual(gid).terminal, "empty mutual wound down terminally");
    }

    function test_join_numeraireMismatch_reverts() public {
        uint256 gid = _createHomogeneousMutual();
        ICM.CommitmentParams memory p;
        p.arbiter = arbiter;
        p.counterparty = beneficiary;
        p.token = address(other); // != numeraire
        p.adapter = adapter;
        p.amount = 100e18;
        p.maxPenaltyBps = 10_000;
        p.challengeWindow = MEMBER_WINDOW;
        p.strategies = new StrategyBinding[](0);
        vm.prank(u1);
        vm.expectRevert(ICM.NumeraireMismatch.selector);
        manager.joinMutual(gid, p);
    }

    function test_join_beneficiaryMismatch_reverts() public {
        uint256 gid = _createHomogeneousMutual();
        ICM.CommitmentParams memory p;
        p.arbiter = arbiter;
        p.counterparty = u2; // != beneficiary
        p.token = address(token);
        p.adapter = adapter;
        p.amount = 100e18;
        p.maxPenaltyBps = 10_000;
        p.challengeWindow = MEMBER_WINDOW;
        p.strategies = new StrategyBinding[](0);
        vm.prank(u1);
        vm.expectRevert(ICM.MutualBeneficiaryMismatch.selector);
        manager.joinMutual(gid, p);
    }

    function test_join_strategiesForbidden() public {
        uint256 gid = _createHomogeneousMutual();
        ICM.CommitmentParams memory p;
        p.arbiter = arbiter;
        p.counterparty = beneficiary;
        p.token = address(token);
        p.adapter = adapter;
        p.amount = 100e18;
        p.maxPenaltyBps = 10_000;
        p.challengeWindow = MEMBER_WINDOW;
        p.strategies = new StrategyBinding[](1);
        p.strategies[0] = StrategyBinding(makeAddr("strat"), "");
        vm.prank(u1);
        vm.expectRevert(ICM.MemberStrategyForbidden.selector);
        manager.joinMutual(gid, p);
    }

    function test_initiateMutualLoss_onlyArbiter() public {
        uint256 gid = _createHomogeneousMutual();
        _join(gid, u1, 100e18, 10_000);
        vm.prank(u1);
        vm.expectRevert(ICM.NotMutualArbiter.selector);
        manager.initiateMutualLoss(gid, 10e18, bytes32(0));
    }

    function test_execute_beforeWindow_reverts() public {
        uint256 gid = _createHomogeneousMutual();
        _join(gid, u1, 100e18, 10_000);
        vm.prank(arbiter);
        manager.initiateMutualLoss(gid, 10e18, bytes32(0));
        vm.expectRevert(ICM.MutualChallengeWindowActive.selector);
        manager.executeMutualLoss(gid);
    }

    function test_join_frozenDuringPendingLoss() public {
        uint256 gid = _createHomogeneousMutual();
        _join(gid, u1, 100e18, 10_000);
        vm.prank(arbiter);
        manager.initiateMutualLoss(gid, 10e18, bytes32(0));
        // Capacity frozen while a declaration is pending (bank-run defense).
        ICM.CommitmentParams memory p;
        p.arbiter = arbiter;
        p.counterparty = beneficiary;
        p.token = address(token);
        p.adapter = adapter;
        p.amount = 100e18;
        p.maxPenaltyBps = 10_000;
        p.challengeWindow = MEMBER_WINDOW;
        p.strategies = new StrategyBinding[](0);
        vm.prank(u2);
        vm.expectRevert(ICM.MutualLossPending.selector);
        manager.joinMutual(gid, p);
    }
}
