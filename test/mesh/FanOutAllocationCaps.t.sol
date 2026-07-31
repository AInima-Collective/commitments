// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import {Test} from "forge-std/Test.sol";
import {Clones} from "@openzeppelin/contracts/proxy/Clones.sol";
import {FanOutNode} from "src/extensions/mesh/FanOutNode.sol";
import {IFanOut, UserInfo, Outflow, FanOutLien} from "src/extensions/mesh/interfaces/IFanOut.sol";

/// @title FanOutAllocationCapsTest
/// @notice Covers the curated dynamic allocation layer (issue #43): per-consumer
///         two-limit caps, priority-ordered greedy fill + reorder, the consumer-side
///         capacity gate (publishCapacity / decreaseLimit), the `deallocatable` dry-run,
///         and the hard constraint that the layer is pure allocation ALGEBRA — no funds
///         move and the exposure invariant (totalForfeitable <= locked *
///         inputMaxPenaltyBps / 10_000) always holds.
contract FanOutAllocationCapsTest is Test {
    FanOutNode public fanOut;

    address public manager = address(0x1);
    address public provider = address(0x2);
    address public c1 = address(0xC1);
    address public c2 = address(0xC2);
    address public c3 = address(0xC3);

    bytes32 public constant DENOM = keccak256("ETH");

    uint256 internal constant WAD = 1e18;

    function setUp() public {
        address impl = address(new FanOutNode());
        fanOut = FanOutNode(Clones.clone(impl));
        // inputMaxPenaltyBps = 10_000 so the exposure invariant is not the binding
        // constraint except where a test deliberately exercises it.
        fanOut.initializeWithPenalty(provider, manager, 10_000);
    }

    // ============================================================
    // HELPERS
    // ============================================================

    function _stake(uint256 amount) internal {
        vm.prank(provider);
        fanOut.stake(DENOM, amount);
    }

    function _cap(address consumer, uint256 abs, uint256 share, uint16 pen) internal {
        vm.prank(provider);
        fanOut.setAllocationCap(DENOM, consumer, abs, share, pen);
    }

    function _allocate() internal {
        vm.prank(provider);
        fanOut.allocate(DENOM);
    }

    /// @dev Assert the node exposure invariant holds for the provider/denom.
    function _assertExposureInvariant() internal view {
        UserInfo memory u = fanOut.getUserInfo(provider, DENOM);
        uint256 limit = u.locked * fanOut.inputMaxPenaltyBps() / 10_000;
        assertLe(u.totalForfeitable, limit, "exposure invariant broken");
    }

    /// @dev Sum of all configured consumers' lien amounts.
    function _sumLiens(address[] memory cs) internal view returns (uint256 s) {
        for (uint256 i = 0; i < cs.length; i++) {
            s += fanOut.getLien(provider, DENOM, cs[i]).amount;
        }
    }

    // ============================================================
    // CAP CONFIG + REGISTRATION
    // ============================================================

    function test_setAllocationCap_registersConsumerAndPriority() public {
        _stake(1000e18);
        _cap(c1, 600e18, WAD, 5000);
        _cap(c2, 400e18, WAD, 5000);

        address[] memory order = fanOut.getPriority(provider, DENOM);
        assertEq(order.length, 2);
        assertEq(order[0], c1);
        assertEq(order[1], c2);

        FanOutNode.AllocationCap memory cap = fanOut.getAllocationCap(provider, DENOM, c1);
        assertEq(cap.absoluteLimit, 600e18);
        assertEq(cap.shareLimit, WAD);
        assertEq(cap.maxPenaltyBps, 5000);
        assertTrue(cap.set);
    }

    function test_setAllocationCap_onlyProvider() public {
        vm.prank(c1);
        vm.expectRevert(FanOutNode.OnlyProvider.selector);
        fanOut.setAllocationCap(DENOM, c1, 1e18, WAD, 5000);
    }

    function test_setAllocationCap_rejectsShareLimitAboveOne() public {
        vm.prank(provider);
        vm.expectRevert(FanOutNode.InvalidShareLimit.selector);
        fanOut.setAllocationCap(DENOM, c1, 1e18, WAD + 1, 5000);
    }

    function test_setAllocationCap_rejectsPenaltyAboveInput() public {
        // Node with input penalty 4000; a 5000 cap must revert.
        FanOutNode fo = FanOutNode(Clones.clone(address(new FanOutNode())));
        fo.initializeWithPenalty(provider, manager, 4000);
        vm.prank(provider);
        vm.expectRevert(FanOutNode.PenaltyExceedsInput.selector);
        fo.setAllocationCap(DENOM, c1, 1e18, WAD, 5000);
    }

    function test_setAllocationCap_updateDoesNotDuplicatePriority() public {
        _stake(1000e18);
        _cap(c1, 600e18, WAD, 5000);
        _cap(c1, 700e18, WAD, 5000); // update same consumer
        address[] memory order = fanOut.getPriority(provider, DENOM);
        assertEq(order.length, 1);
    }

    // ============================================================
    // TWO-LIMIT CAP ENFORCEMENT
    // ============================================================

    function test_allocate_absoluteLimitBinds() public {
        _stake(1000e18);
        // share allows the whole pool, but absolute caps at 300.
        _cap(c1, 300e18, WAD, 5000);
        _allocate();
        assertEq(fanOut.getLien(provider, DENOM, c1).amount, 300e18);
        _assertExposureInvariant();
    }

    function test_allocate_shareLimitBinds() public {
        _stake(1000e18);
        // absolute allows the whole pool, but share caps at 25%.
        _cap(c1, 1_000_000e18, WAD / 4, 5000);
        _allocate();
        assertEq(fanOut.getLien(provider, DENOM, c1).amount, 250e18);
        _assertExposureInvariant();
    }

    function test_allocate_effectiveCapIsMinOfBoth() public {
        _stake(1000e18);
        // abs = 200, share = 40% (=400) -> min = 200.
        _cap(c1, 200e18, (WAD * 40) / 100, 5000);
        assertEq(fanOut.effectiveCap(provider, DENOM, c1), 200e18);
        _allocate();
        assertEq(fanOut.getLien(provider, DENOM, c1).amount, 200e18);
    }

    // ============================================================
    // PRIORITY-ORDERED GREEDY FILL + REORDER
    // ============================================================

    function test_allocate_greedyFillExhaustsPoolInOrder() public {
        _stake(1000e18);
        // c1 wants 600, c2 wants 600, c3 wants 600. Pool = 1000.
        // Greedy: c1 -> 600, c2 -> 400 (remaining), c3 -> 0.
        _cap(c1, 600e18, WAD, 5000);
        _cap(c2, 600e18, WAD, 5000);
        _cap(c3, 600e18, WAD, 5000);
        _allocate();

        assertEq(fanOut.getLien(provider, DENOM, c1).amount, 600e18);
        assertEq(fanOut.getLien(provider, DENOM, c2).amount, 400e18);
        assertEq(fanOut.getLien(provider, DENOM, c3).amount, 0);

        address[] memory cs = new address[](3);
        cs[0] = c1;
        cs[1] = c2;
        cs[2] = c3;
        assertLe(_sumLiens(cs), 1000e18);
        _assertExposureInvariant();
    }

    function test_reorderPriority_changesFillOrder() public {
        _stake(1000e18);
        _cap(c1, 600e18, WAD, 5000);
        _cap(c2, 600e18, WAD, 5000);

        // Reorder so c2 fills first.
        address[] memory order = new address[](2);
        order[0] = c2;
        order[1] = c1;
        vm.prank(provider);
        fanOut.reorderPriority(DENOM, order);

        _allocate();
        assertEq(fanOut.getLien(provider, DENOM, c2).amount, 600e18);
        assertEq(fanOut.getLien(provider, DENOM, c1).amount, 400e18);
    }

    function test_reorderPriority_rejectsWrongLength() public {
        _stake(1000e18);
        _cap(c1, 1e18, WAD, 5000);
        _cap(c2, 1e18, WAD, 5000);
        address[] memory order = new address[](1);
        order[0] = c1;
        vm.prank(provider);
        vm.expectRevert(FanOutNode.NotAPermutation.selector);
        fanOut.reorderPriority(DENOM, order);
    }

    function test_reorderPriority_rejectsDuplicate() public {
        _stake(1000e18);
        _cap(c1, 1e18, WAD, 5000);
        _cap(c2, 1e18, WAD, 5000);
        address[] memory order = new address[](2);
        order[0] = c1;
        order[1] = c1; // duplicate, c2 missing
        vm.prank(provider);
        vm.expectRevert(FanOutNode.NotAPermutation.selector);
        fanOut.reorderPriority(DENOM, order);
    }

    function test_reorderPriority_rejectsUnknownMember() public {
        _stake(1000e18);
        _cap(c1, 1e18, WAD, 5000);
        _cap(c2, 1e18, WAD, 5000);
        address[] memory order = new address[](2);
        order[0] = c1;
        order[1] = c3; // c3 not in list
        vm.prank(provider);
        vm.expectRevert(FanOutNode.NotAPermutation.selector);
        fanOut.reorderPriority(DENOM, order);
    }

    // ============================================================
    // CONSUMER-SIDE CAPACITY GATE
    // ============================================================

    function test_publishCapacity_gatesAllocation() public {
        _stake(1000e18);
        _cap(c1, 1000e18, WAD, 5000);

        // Consumer throttles itself to 150.
        vm.prank(c1);
        fanOut.publishCapacity(DENOM, 150e18);

        assertEq(fanOut.effectiveCap(provider, DENOM, c1), 150e18);
        _allocate();
        assertEq(fanOut.getLien(provider, DENOM, c1).amount, 150e18);
    }

    function test_publishCapacity_raiseOnly() public {
        vm.prank(c1);
        fanOut.publishCapacity(DENOM, 100e18);
        // Raising is allowed.
        vm.prank(c1);
        fanOut.publishCapacity(DENOM, 200e18);
        (uint256 ceiling, bool set) = fanOut.capacity(c1, DENOM);
        assertEq(ceiling, 200e18);
        assertTrue(set);
        // Lowering via publishCapacity reverts.
        vm.prank(c1);
        vm.expectRevert(FanOutNode.CapacityNotIncreasing.selector);
        fanOut.publishCapacity(DENOM, 150e18);
    }

    function test_decreaseLimit_monotonicDown() public {
        vm.prank(c1);
        fanOut.publishCapacity(DENOM, 500e18);

        vm.prank(c1);
        fanOut.decreaseLimit(DENOM, 300e18);
        (uint256 ceiling,) = fanOut.capacity(c1, DENOM);
        assertEq(ceiling, 300e18);

        // Non-decreasing reverts.
        vm.prank(c1);
        vm.expectRevert(FanOutNode.LimitNotDecreasing.selector);
        fanOut.decreaseLimit(DENOM, 300e18);
        vm.prank(c1);
        vm.expectRevert(FanOutNode.LimitNotDecreasing.selector);
        fanOut.decreaseLimit(DENOM, 400e18);
    }

    function test_decreaseLimit_permissionlessFromUnbounded() public {
        // No prior publish; decreaseLimit sets the first ceiling (down from "unbounded").
        // Callable by any address for itself — no provider cooperation.
        vm.prank(c1);
        fanOut.decreaseLimit(DENOM, 50e18);
        (uint256 ceiling, bool set) = fanOut.capacity(c1, DENOM);
        assertEq(ceiling, 50e18);
        assertTrue(set);

        _stake(1000e18);
        _cap(c1, 1000e18, WAD, 5000);
        _allocate();
        assertEq(fanOut.getLien(provider, DENOM, c1).amount, 50e18);
    }

    function test_allocatable_view() public {
        // Unbounded when unset.
        assertEq(fanOut.allocatable(c1, DENOM), type(uint256).max);

        _stake(1000e18);
        _cap(c1, 1000e18, WAD, 5000);
        vm.prank(c1);
        fanOut.publishCapacity(DENOM, 400e18);
        _allocate();

        // 400 ceiling, 400 held -> 0 room.
        assertEq(fanOut.getLien(provider, DENOM, c1).amount, 400e18);
        assertEq(fanOut.allocatable(c1, DENOM), 0);

        // Raise ceiling to 600 -> 200 room.
        vm.prank(c1);
        fanOut.publishCapacity(DENOM, 600e18);
        assertEq(fanOut.allocatable(c1, DENOM), 200e18);
    }

    // ============================================================
    // DEALLOCATABLE DRY-RUN
    // ============================================================

    function test_deallocatable_returnsLienAndDoesNotMutate() public {
        _stake(1000e18);
        _cap(c1, 700e18, WAD, 5000);
        _allocate();

        UserInfo memory before = fanOut.getUserInfo(provider, DENOM);
        uint256 releasable = fanOut.deallocatable(provider, DENOM, c1);
        UserInfo memory afterState = fanOut.getUserInfo(provider, DENOM);

        assertEq(releasable, 700e18);
        // Pure dry-run: nothing changed.
        assertEq(before.locked, afterState.locked);
        assertEq(before.totalForfeitable, afterState.totalForfeitable);
        assertEq(fanOut.getLien(provider, DENOM, c1).amount, 700e18);
    }

    // ============================================================
    // INTEGRATION: curated liens interoperate with releaseStake
    // ============================================================

    function test_curatedLien_isReleasableByConsumer() public {
        _stake(1000e18);
        _cap(c1, 400e18, WAD, 5000);
        _allocate();

        // The curated lien is a normal FanOutLien the consumer can unwind.
        vm.prank(c1);
        fanOut.releaseStake(provider, DENOM, 100e18);
        assertEq(fanOut.getLien(provider, DENOM, c1).amount, 300e18);
    }

    // ============================================================
    // HARD CONSTRAINT: no funds move; exposure invariant holds
    // ============================================================

    function test_allocate_movesNoFunds() public {
        _stake(1000e18);
        _cap(c1, 600e18, WAD, 5000);
        _cap(c2, 600e18, WAD, 5000);

        // The node custodies no stake tokens (virtual liens); its balance is zero
        // before and after allocation, and locked/totalStake are untouched by allocate.
        assertEq(address(fanOut).balance, 0);
        UserInfo memory before = fanOut.getUserInfo(provider, DENOM);
        uint256 tsBefore = fanOut.totalStake(DENOM);

        _allocate();

        UserInfo memory afterState = fanOut.getUserInfo(provider, DENOM);
        assertEq(afterState.locked, before.locked, "allocate must not touch locked");
        assertEq(fanOut.totalStake(DENOM), tsBefore, "allocate must not touch totalStake");
        assertEq(address(fanOut).balance, 0);
    }

    function test_allocate_exposureInvariantWithSubMaxPenaltyNode() public {
        // Node with input penalty 3000: exposure must stay <= locked * 3000 / 10_000.
        FanOutNode fo = FanOutNode(Clones.clone(address(new FanOutNode())));
        fo.initializeWithPenalty(provider, manager, 3000);
        vm.prank(provider);
        fo.stake(DENOM, 1000e18);
        vm.prank(provider);
        fo.setAllocationCap(DENOM, c1, 1000e18, WAD, 3000);
        vm.prank(provider);
        fo.allocate(DENOM);

        UserInfo memory u = fo.getUserInfo(provider, DENOM);
        assertLe(u.totalForfeitable, u.locked * 3000 / 10_000);
    }

    // ============================================================
    // FUZZ: Σ liens <= pool AND exposure invariant, no matter the caps
    // ============================================================

    function testFuzz_allocate_boundedByPoolAndExposure(
        uint256 pool,
        uint256 abs1,
        uint256 share1,
        uint256 abs2,
        uint256 share2,
        uint256 abs3,
        uint256 share3
    ) public {
        pool = bound(pool, 1, 1e30);
        share1 = bound(share1, 0, WAD);
        share2 = bound(share2, 0, WAD);
        share3 = bound(share3, 0, WAD);
        abs1 = bound(abs1, 0, 1e30);
        abs2 = bound(abs2, 0, 1e30);
        abs3 = bound(abs3, 0, 1e30);

        _stake(pool);
        _cap(c1, abs1, share1, 7000);
        _cap(c2, abs2, share2, 7000);
        _cap(c3, abs3, share3, 7000);
        _allocate();

        address[] memory cs = new address[](3);
        cs[0] = c1;
        cs[1] = c2;
        cs[2] = c3;

        // Σ liens can never exceed the pool (greedy fill respects `remaining`).
        assertLe(_sumLiens(cs), pool);

        // Exposure invariant: totalForfeitable <= locked * inputMaxPenaltyBps / 10_000.
        UserInfo memory u = fanOut.getUserInfo(provider, DENOM);
        assertLe(u.totalForfeitable, u.locked * fanOut.inputMaxPenaltyBps() / 10_000);

        // totalForfeitable == Σ exposure of the written liens.
        uint256 sumExp;
        for (uint256 i = 0; i < cs.length; i++) {
            sumExp += fanOut.getLien(provider, DENOM, cs[i]).exposure;
        }
        assertEq(u.totalForfeitable, sumExp);
    }
}
