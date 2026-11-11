// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import "forge-std/Test.sol";
import {ERC1967Proxy} from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";

import {MerkleSnapshot} from "src/extensions/rewards/MerkleSnapshot.sol";
import {IMerkleSnapshot} from "src/extensions/rewards/interfaces/IMerkleSnapshot.sol";

contract MerkleSnapshotTest is Test {
    MerkleSnapshot internal impl;
    MerkleSnapshot internal snap;

    address internal service = address(0xCAFE);
    address internal updater = address(0xBEEF);
    address internal stranger = address(0xF00D);

    uint64 internal constant MIN_DELAY = 1 days;
    uint64 internal constant INIT_DELAY = 7 days;

    bytes32 internal constant ROOT_A = bytes32(uint256(0x1111));
    bytes32 internal constant ROOT_B = bytes32(uint256(0x2222));

    event RootSubmitted(bytes32 indexed rootId, uint64 submittedAt, uint64 activeAt);
    event RootDisabled(bytes32 indexed rootId);
    event ActivationDelayUpdated(uint64 oldDelay, uint64 newDelay);
    event UpdaterPending(address indexed newUpdater, uint64 effectiveAt);
    event UpdaterActivated(address indexed oldUpdater, address indexed newUpdater);
    event UpdaterStageCancelled(address indexed stagedUpdater);

    function setUp() public {
        impl = new MerkleSnapshot();
        bytes memory data = abi.encodeCall(MerkleSnapshot.initialize, (service, INIT_DELAY, MIN_DELAY, updater));
        ERC1967Proxy proxy = new ERC1967Proxy(address(impl), data);
        snap = MerkleSnapshot(address(proxy));
    }

    // -------------------------------------------------------------------------
    // Initialization
    // -------------------------------------------------------------------------

    function test_initialize_correctService() public view {
        assertEq(snap.service(), service);
    }

    function test_initialize_correctUpdater() public view {
        assertEq(snap.activeUpdater(), updater);
    }

    function test_initialize_correctDelays() public view {
        assertEq(snap.activationDelay(), INIT_DELAY);
        assertEq(snap.minActivationDelay(), MIN_DELAY);
    }

    function test_initialize_zeroService_reverts() public {
        MerkleSnapshot fresh = new MerkleSnapshot();
        bytes memory data = abi.encodeCall(MerkleSnapshot.initialize, (address(0), INIT_DELAY, MIN_DELAY, updater));
        vm.expectRevert(IMerkleSnapshot.ZeroAddress.selector);
        new ERC1967Proxy(address(fresh), data);
    }

    function test_initialize_zeroUpdater_reverts() public {
        MerkleSnapshot fresh = new MerkleSnapshot();
        bytes memory data = abi.encodeCall(MerkleSnapshot.initialize, (service, INIT_DELAY, MIN_DELAY, address(0)));
        vm.expectRevert(IMerkleSnapshot.ZeroAddress.selector);
        new ERC1967Proxy(address(fresh), data);
    }

    function test_initialize_belowFloor_reverts() public {
        MerkleSnapshot fresh = new MerkleSnapshot();
        bytes memory data = abi.encodeCall(MerkleSnapshot.initialize, (service, 1, MIN_DELAY, updater));
        vm.expectRevert(IMerkleSnapshot.ActivationDelayBelowFloor.selector);
        new ERC1967Proxy(address(fresh), data);
    }

    function test_initialize_doubleInit_reverts() public {
        vm.expectRevert();
        snap.initialize(service, INIT_DELAY, MIN_DELAY, updater);
    }

    function test_initialize_implementationDisabled() public {
        vm.expectRevert();
        impl.initialize(service, INIT_DELAY, MIN_DELAY, updater);
    }

    // -------------------------------------------------------------------------
    // submitRoot
    // -------------------------------------------------------------------------

    function test_submitRoot_byUpdater_succeeds() public {
        vm.prank(updater);
        bytes32 id = snap.submitRoot(ROOT_A);
        assertEq(id, ROOT_A);

        IMerkleSnapshot.RewardsRoot memory r = snap.rootById(ROOT_A);
        assertEq(r.submittedAt, uint64(block.timestamp));
        assertEq(r.activeAt, uint64(block.timestamp + INIT_DELAY));
        assertEq(r.disabled, false);
    }

    function test_submitRoot_byNonUpdater_reverts() public {
        vm.prank(stranger);
        vm.expectRevert(IMerkleSnapshot.NotUpdater.selector);
        snap.submitRoot(ROOT_A);
    }

    function test_submitRoot_byOldUpdaterAfterSwap_reverts() public {
        // Stage + activate a new updater; the old one is no longer authorized.
        vm.prank(service);
        snap.stageUpdater(stranger);
        vm.warp(block.timestamp + INIT_DELAY);
        snap.activateUpdater();

        vm.prank(updater);
        vm.expectRevert(IMerkleSnapshot.NotUpdater.selector);
        snap.submitRoot(ROOT_A);

        // The new updater works.
        vm.prank(stranger);
        snap.submitRoot(ROOT_A);
    }

    function test_submitRoot_duplicate_reverts() public {
        vm.prank(updater);
        snap.submitRoot(ROOT_A);

        vm.prank(updater);
        vm.expectRevert(IMerkleSnapshot.RootAlreadySubmitted.selector);
        snap.submitRoot(ROOT_A);
    }

    function test_submitRoot_zeroRoot_reverts() public {
        vm.prank(updater);
        vm.expectRevert(IMerkleSnapshot.ZeroRoot.selector);
        snap.submitRoot(bytes32(0));
    }

    function test_submitRoot_setsActiveAtCorrectly() public {
        vm.warp(1000);
        vm.prank(updater);
        snap.submitRoot(ROOT_A);

        IMerkleSnapshot.RewardsRoot memory r = snap.rootById(ROOT_A);
        assertEq(r.submittedAt, 1000);
        assertEq(r.activeAt, 1000 + INIT_DELAY);
    }

    function test_submitRoot_emitsRootSubmitted() public {
        vm.warp(2000);
        vm.expectEmit(true, true, true, true);
        emit RootSubmitted(ROOT_A, 2000, 2000 + INIT_DELAY);

        vm.prank(updater);
        snap.submitRoot(ROOT_A);
    }

    // -------------------------------------------------------------------------
    // disableRoot
    // -------------------------------------------------------------------------

    function test_disableRoot_byService_duringWindow() public {
        vm.prank(updater);
        snap.submitRoot(ROOT_A);

        vm.prank(service);
        snap.disableRoot(ROOT_A);

        assertEq(snap.rootById(ROOT_A).disabled, true);
        assertEq(snap.isActive(ROOT_A), false);
    }

    function test_disableRoot_byNonService_reverts() public {
        vm.prank(updater);
        snap.submitRoot(ROOT_A);

        vm.prank(stranger);
        vm.expectRevert(IMerkleSnapshot.NotService.selector);
        snap.disableRoot(ROOT_A);
    }

    function test_disableRoot_afterActiveAt_reverts() public {
        vm.prank(updater);
        snap.submitRoot(ROOT_A);

        vm.warp(block.timestamp + INIT_DELAY + 1);

        vm.prank(service);
        vm.expectRevert(IMerkleSnapshot.RootAlreadyActive.selector);
        snap.disableRoot(ROOT_A);
    }

    function test_disableRoot_alreadyDisabled_reverts() public {
        vm.prank(updater);
        snap.submitRoot(ROOT_A);

        vm.prank(service);
        snap.disableRoot(ROOT_A);

        vm.prank(service);
        vm.expectRevert(IMerkleSnapshot.RootAlreadyDisabled.selector);
        snap.disableRoot(ROOT_A);
    }

    function test_disableRoot_unknownRoot_reverts() public {
        vm.prank(service);
        vm.expectRevert(IMerkleSnapshot.RootNotFound.selector);
        snap.disableRoot(ROOT_A);
    }

    function test_disableRoot_emitsRootDisabled() public {
        vm.prank(updater);
        snap.submitRoot(ROOT_A);

        vm.expectEmit(true, true, true, true);
        emit RootDisabled(ROOT_A);

        vm.prank(service);
        snap.disableRoot(ROOT_A);
    }

    // -------------------------------------------------------------------------
    // isActive
    // -------------------------------------------------------------------------

    function test_isActive_falseBeforeActiveAt() public {
        vm.prank(updater);
        snap.submitRoot(ROOT_A);
        assertEq(snap.isActive(ROOT_A), false);
    }

    function test_isActive_trueAfterActiveAt() public {
        vm.prank(updater);
        snap.submitRoot(ROOT_A);

        vm.warp(block.timestamp + INIT_DELAY);
        assertEq(snap.isActive(ROOT_A), true);
    }

    function test_isActive_falseIfDisabled() public {
        vm.prank(updater);
        snap.submitRoot(ROOT_A);
        vm.prank(service);
        snap.disableRoot(ROOT_A);

        vm.warp(block.timestamp + INIT_DELAY);
        assertEq(snap.isActive(ROOT_A), false);
    }

    function test_isActive_falseForUnknownRoot() public view {
        assertEq(snap.isActive(ROOT_A), false);
    }

    // -------------------------------------------------------------------------
    // setActivationDelay
    // -------------------------------------------------------------------------

    function test_setActivationDelay_byService() public {
        vm.prank(service);
        vm.expectEmit(true, true, true, true);
        emit ActivationDelayUpdated(INIT_DELAY, 14 days);
        snap.setActivationDelay(14 days);
        assertEq(snap.activationDelay(), 14 days);
    }

    function test_setActivationDelay_byNonService_reverts() public {
        vm.prank(stranger);
        vm.expectRevert(IMerkleSnapshot.NotService.selector);
        snap.setActivationDelay(14 days);
    }

    function test_setActivationDelay_belowFloor_reverts() public {
        vm.prank(service);
        vm.expectRevert(IMerkleSnapshot.ActivationDelayBelowFloor.selector);
        snap.setActivationDelay(MIN_DELAY - 1);
    }

    function test_setActivationDelay_doesNotAffectInflightRoots() public {
        vm.warp(1000);
        vm.prank(updater);
        snap.submitRoot(ROOT_A);
        IMerkleSnapshot.RewardsRoot memory before_ = snap.rootById(ROOT_A);

        vm.prank(service);
        snap.setActivationDelay(14 days);

        IMerkleSnapshot.RewardsRoot memory after_ = snap.rootById(ROOT_A);
        assertEq(after_.activeAt, before_.activeAt);
    }

    function test_setActivationDelay_appliesToFutureRoots() public {
        vm.prank(service);
        snap.setActivationDelay(14 days);

        vm.warp(5000);
        vm.prank(updater);
        snap.submitRoot(ROOT_B);
        assertEq(snap.rootById(ROOT_B).activeAt, 5000 + 14 days);
    }

    // -------------------------------------------------------------------------
    // §0.6 staged updater swap (now native to the snapshot)
    // -------------------------------------------------------------------------

    function test_stageUpdater_byService_succeeds() public {
        vm.prank(service);
        vm.expectEmit(true, true, true, true);
        emit UpdaterPending(stranger, uint64(block.timestamp + INIT_DELAY));
        snap.stageUpdater(stranger);

        (address pending, uint64 effectiveAt) = snap.pendingUpdater();
        assertEq(pending, stranger);
        assertEq(effectiveAt, block.timestamp + INIT_DELAY);
    }

    function test_stageUpdater_byNonService_reverts() public {
        vm.prank(stranger);
        vm.expectRevert(IMerkleSnapshot.NotService.selector);
        snap.stageUpdater(stranger);
    }

    function test_stageUpdater_zeroAddress_reverts() public {
        vm.prank(service);
        vm.expectRevert(IMerkleSnapshot.ZeroAddress.selector);
        snap.stageUpdater(address(0));
    }

    function test_stageUpdater_alreadyStaged_reverts() public {
        vm.prank(service);
        snap.stageUpdater(stranger);
        vm.prank(service);
        vm.expectRevert(IMerkleSnapshot.StagedUpdaterAlreadyExists.selector);
        snap.stageUpdater(address(0xABCD));
    }

    function test_activateUpdater_permissionless() public {
        vm.prank(service);
        snap.stageUpdater(stranger);

        vm.warp(block.timestamp + INIT_DELAY);
        vm.prank(address(0x1234)); // any address
        vm.expectEmit(true, true, true, true);
        emit UpdaterActivated(updater, stranger);
        snap.activateUpdater();

        assertEq(snap.activeUpdater(), stranger);
        (address pending, uint64 effectiveAt) = snap.pendingUpdater();
        assertEq(pending, address(0));
        assertEq(effectiveAt, 0);
    }

    function test_activateUpdater_beforeWindow_reverts() public {
        vm.prank(service);
        snap.stageUpdater(stranger);

        vm.expectRevert(IMerkleSnapshot.StagedUpdaterNotReady.selector);
        snap.activateUpdater();
    }

    function test_activateUpdater_noStagedUpdater_reverts() public {
        vm.expectRevert(IMerkleSnapshot.NoStagedUpdater.selector);
        snap.activateUpdater();
    }

    function test_cancelStagedUpdater_byService() public {
        vm.prank(service);
        snap.stageUpdater(stranger);
        vm.prank(service);
        vm.expectEmit(true, true, true, true);
        emit UpdaterStageCancelled(stranger);
        snap.cancelStagedUpdater();

        (address pending, uint64 effectiveAt) = snap.pendingUpdater();
        assertEq(pending, address(0));
        assertEq(effectiveAt, 0);
    }

    function test_cancelStagedUpdater_byNonService_reverts() public {
        vm.prank(service);
        snap.stageUpdater(stranger);
        vm.prank(stranger);
        vm.expectRevert(IMerkleSnapshot.NotService.selector);
        snap.cancelStagedUpdater();
    }

    function test_cancelStagedUpdater_noStaged_reverts() public {
        vm.prank(service);
        vm.expectRevert(IMerkleSnapshot.NoStagedUpdater.selector);
        snap.cancelStagedUpdater();
    }

    /// @notice Strict-flip: a staged-but-not-activated updater cannot submit,
    ///         even after the effective timestamp, until `activateUpdater()`.
    function test_swapTimingAttack_blocked() public {
        vm.prank(service);
        snap.stageUpdater(stranger);

        vm.prank(stranger);
        vm.expectRevert(IMerkleSnapshot.NotUpdater.selector);
        snap.submitRoot(ROOT_A);

        vm.warp(block.timestamp + INIT_DELAY);
        vm.prank(stranger);
        vm.expectRevert(IMerkleSnapshot.NotUpdater.selector);
        snap.submitRoot(ROOT_A);

        snap.activateUpdater();
        vm.prank(stranger);
        snap.submitRoot(ROOT_A);
    }
}
