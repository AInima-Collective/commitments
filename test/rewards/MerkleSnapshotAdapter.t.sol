// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import "forge-std/Test.sol";
import {ERC1967Proxy} from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";

import {MerkleSnapshotAdapter} from "src/extensions/rewards/MerkleSnapshotAdapter.sol";
import {ServiceEnvelopeVerifier} from "src/extensions/services/service-registry/ServiceEnvelopeVerifier.sol";
import {MerkleSnapshot} from "src/extensions/rewards/MerkleSnapshot.sol";
import {IMerkleSnapshot} from "src/extensions/rewards/interfaces/IMerkleSnapshot.sol";
import {RewardsCoordinatorFactory} from "src/extensions/rewards/RewardsCoordinatorFactory.sol";
import {CommitmentsRewardsCoordinator} from "src/extensions/rewards/CommitmentsRewardsCoordinator.sol";
import {ICommitmentsRewardsCoordinator} from "src/extensions/rewards/interfaces/ICommitmentsRewardsCoordinator.sol";
import {IServiceHandler} from "src/extensions/services/interfaces/IServiceHandler.sol";
import {IServiceManager} from "src/extensions/services/interfaces/IServiceManager.sol";
import {MockServiceManager} from "./MockServiceManager.sol";
import {MockERC20} from "../helpers/MockERC20.sol";
import {MerkleHelper} from "./MerkleHelper.sol";

contract MerkleSnapshotAdapterTest is Test {
    MerkleSnapshotAdapter internal adapter;
    MerkleSnapshot internal snap;
    MockServiceManager internal sm;

    address internal service = address(0xCAFE);
    address internal stranger = address(0xF00D);

    uint64 internal constant MIN_DELAY = 1 days;
    uint64 internal constant DELAY = 7 days;

    bytes32 internal constant ROOT_A = bytes32(uint256(0xAAA));
    bytes32 internal constant ROOT_B = bytes32(uint256(0xBBB));
    bytes32 internal constant IPFS_HASH = bytes32(uint256(0xC0DE));

    event RootRelayed(bytes20 indexed eventId, bytes32 indexed merkleRoot, bytes32 ipfsHash, string ipfsCid);

    function setUp() public {
        sm = new MockServiceManager();

        MerkleSnapshot impl = new MerkleSnapshot();
        // Bootstrap with `service` as the initial updater; swapped to the adapter below.
        bytes memory init = abi.encodeCall(MerkleSnapshot.initialize, (service, DELAY, MIN_DELAY, service));
        ERC1967Proxy proxy = new ERC1967Proxy(address(impl), init);
        snap = MerkleSnapshot(address(proxy));

        adapter = new MerkleSnapshotAdapter(IServiceManager(address(sm)), IMerkleSnapshot(address(snap)));

        // §0.6 swap on the snapshot: stage the adapter as updater, then activate.
        vm.prank(service);
        snap.stageUpdater(address(adapter));
        vm.warp(block.timestamp + DELAY);
        snap.activateUpdater();
    }

    function _envelope(bytes20 eventId, bytes32 root, bytes32 ipfsHash, string memory cid)
        internal
        pure
        returns (IServiceHandler.Envelope memory)
    {
        return IServiceHandler.Envelope({
            eventId: eventId, ordering: bytes12(0), payload: abi.encode(root, ipfsHash, cid, uint256(0))
        });
    }

    function _emptySig() internal pure returns (IServiceHandler.SignatureData memory) {
        address[] memory signers = new address[](0);
        bytes[] memory sigs = new bytes[](0);
        return IServiceHandler.SignatureData({signers: signers, signatures: sigs, referenceBlock: 0});
    }

    // -------------------------------------------------------------------------
    // Constructor
    // -------------------------------------------------------------------------

    function test_constructor_zeroServiceManager_reverts() public {
        vm.expectRevert(MerkleSnapshotAdapter.ZeroAddress.selector);
        new MerkleSnapshotAdapter(IServiceManager(address(0)), IMerkleSnapshot(address(snap)));
    }

    function test_constructor_zeroSnapshot_reverts() public {
        vm.expectRevert(MerkleSnapshotAdapter.ZeroAddress.selector);
        new MerkleSnapshotAdapter(IServiceManager(address(sm)), IMerkleSnapshot(address(0)));
    }

    function test_constructor_storesBindings() public view {
        assertEq(address(adapter.serviceManager()), address(sm));
        assertEq(address(adapter.snapshot()), address(snap));
        assertEq(adapter.getServiceManager(), address(sm));
    }

    // -------------------------------------------------------------------------
    // handleSignedEnvelope
    // -------------------------------------------------------------------------

    function test_handleSignedEnvelope_validatesViaServiceManager() public {
        // Make validate fail; expect adapter to revert with the same error.
        sm.setFailNext(true);
        IServiceHandler.Envelope memory env = _envelope(bytes20(uint160(1)), ROOT_A, IPFS_HASH, "cid");
        vm.expectRevert(IServiceManager.InvalidSignature.selector);
        adapter.handleSignedEnvelope(env, _emptySig());
    }

    function test_handleSignedEnvelope_relaysToSnapshot() public {
        IServiceHandler.Envelope memory env = _envelope(bytes20(uint160(1)), ROOT_A, IPFS_HASH, "cid");
        adapter.handleSignedEnvelope(env, _emptySig());
        IMerkleSnapshot.RewardsRoot memory r = snap.rootById(ROOT_A);
        assertEq(r.merkleRoot, ROOT_A);
        assertEq(r.submittedAt, uint64(block.timestamp));
    }

    function test_handleSignedEnvelope_emitsRootRelayed() public {
        IServiceHandler.Envelope memory env = _envelope(bytes20(uint160(7)), ROOT_A, IPFS_HASH, "cid7");
        vm.expectEmit(true, true, true, true);
        emit RootRelayed(bytes20(uint160(7)), ROOT_A, IPFS_HASH, "cid7");
        adapter.handleSignedEnvelope(env, _emptySig());
    }

    function test_handleSignedEnvelope_replayBlocked() public {
        IServiceHandler.Envelope memory env = _envelope(bytes20(uint160(1)), ROOT_A, IPFS_HASH, "cid");
        adapter.handleSignedEnvelope(env, _emptySig());

        // Same eventId, different root — must revert via UniqueEnvelope semantics.
        IServiceHandler.Envelope memory env2 = _envelope(bytes20(uint160(1)), ROOT_B, IPFS_HASH, "cid");
        vm.expectRevert(
            abi.encodeWithSelector(ServiceEnvelopeVerifier.EnvelopeAlreadyConsumed.selector, bytes20(uint160(1)))
        );
        adapter.handleSignedEnvelope(env2, _emptySig());
    }

    function test_handleSignedEnvelope_zeroRoot_reverts() public {
        IServiceHandler.Envelope memory env = _envelope(bytes20(uint160(2)), bytes32(0), IPFS_HASH, "cid");
        vm.expectRevert(MerkleSnapshotAdapter.ZeroRoot.selector);
        adapter.handleSignedEnvelope(env, _emptySig());
    }

    function test_handleSignedEnvelope_payloadDecodingMatchesMerklerSchema() public {
        // Encode exactly as the upstream merkler's MerkleSnapshot.handleSignedEnvelope expects:
        // (bytes32 root, bytes32 ipfsHash, string cid, uint256 totalValue)
        bytes memory payload = abi.encode(ROOT_A, IPFS_HASH, string("ipfs://abc"), uint256(123456));
        IServiceHandler.Envelope memory env =
            IServiceHandler.Envelope({eventId: bytes20(uint160(8)), ordering: bytes12(0), payload: payload});
        adapter.handleSignedEnvelope(env, _emptySig());
        assertEq(snap.rootById(ROOT_A).merkleRoot, ROOT_A);
    }

    function test_handleSignedEnvelope_distinctEventIdsBothLand() public {
        adapter.handleSignedEnvelope(_envelope(bytes20(uint160(1)), ROOT_A, IPFS_HASH, "cid"), _emptySig());
        adapter.handleSignedEnvelope(_envelope(bytes20(uint160(2)), ROOT_B, IPFS_HASH, "cid"), _emptySig());
        assertTrue(adapter.isEnvelopeConsumed(bytes20(uint160(1))));
        assertTrue(adapter.isEnvelopeConsumed(bytes20(uint160(2))));
        assertEq(snap.rootCount(), 2);
    }

    // -------------------------------------------------------------------------
    // Integration with the real coordinator + factory + §0.6 swap
    // -------------------------------------------------------------------------

    function test_adapter_isCoordinatorsActiveUpdater_endToEnd() public {
        // Spin up a real coordinator pair via the factory, set the adapter as
        // its updater via §0.6, and exercise the full path: handleSignedEnvelope
        // → submitRoot → claim.
        MerkleSnapshot snapImpl = new MerkleSnapshot();
        CommitmentsRewardsCoordinator coordImpl = new CommitmentsRewardsCoordinator();
        RewardsCoordinatorFactory factory =
            new RewardsCoordinatorFactory(address(coordImpl), address(snapImpl), MIN_DELAY);
        // Initial updater is the test contract; we'll swap to the adapter.
        (address coordAddr, address snapAddr) = factory.deployCoordinator(service, address(this), DELAY);
        CommitmentsRewardsCoordinator realCoord = CommitmentsRewardsCoordinator(coordAddr);
        MerkleSnapshot realSnap = MerkleSnapshot(snapAddr);

        MerkleSnapshotAdapter realAdapter =
            new MerkleSnapshotAdapter(IServiceManager(address(sm)), IMerkleSnapshot(realSnap));

        // Service stages the adapter as updater + activates after delay (on the snapshot).
        vm.prank(service);
        realSnap.stageUpdater(address(realAdapter));
        vm.warp(block.timestamp + DELAY);
        realSnap.activateUpdater();
        assertEq(realSnap.activeUpdater(), address(realAdapter));

        // Build a tiny tree (alice 100 USDC).
        MockERC20 usdc = new MockERC20("USDC", "USDC", 6);
        usdc.mint(address(this), 1_000e6);
        usdc.approve(address(realCoord), 1_000e6);
        realCoord.depositRewards(address(usdc), 1_000e6);

        address alice = address(0xA11CE);
        MerkleHelper.Leaf[] memory leaves = new MerkleHelper.Leaf[](2);
        leaves[0] = MerkleHelper.Leaf({earner: alice, token: address(usdc), cumulativeAmount: 100e6});
        leaves[1] = MerkleHelper.Leaf({earner: address(0xB0B), token: address(usdc), cumulativeAmount: 0});
        bytes32 root = MerkleHelper.buildRoot(leaves);

        // Adapter relays the envelope.
        IServiceHandler.Envelope memory env = _envelope(bytes20(uint160(42)), root, IPFS_HASH, "ipfs://demo");
        realAdapter.handleSignedEnvelope(env, _emptySig());

        // Snapshot received the root via the adapter.
        assertEq(realSnap.rootById(root).merkleRoot, root);

        // Warp past activation; alice claims.
        vm.warp(block.timestamp + DELAY);
        bytes32[] memory proof = MerkleHelper.buildProof(leaves, 0);
        vm.prank(alice);
        uint256 paid = realCoord.processClaim(root, address(usdc), 100e6, proof);
        assertEq(paid, 100e6);
    }

    function test_adapter_replacement_via_06_swap() public {
        // Service swaps from adapter v1 to adapter v2; the in-between window
        // blocks v2 submits via the snapshot's strict-flip auth.
        MerkleSnapshot snapImpl = new MerkleSnapshot();
        CommitmentsRewardsCoordinator coordImpl = new CommitmentsRewardsCoordinator();
        RewardsCoordinatorFactory factory =
            new RewardsCoordinatorFactory(address(coordImpl), address(snapImpl), MIN_DELAY);
        (, address snapAddr) = factory.deployCoordinator(service, address(adapter), DELAY);
        MerkleSnapshot realSnap = MerkleSnapshot(snapAddr);

        MerkleSnapshotAdapter v2 = new MerkleSnapshotAdapter(IServiceManager(address(sm)), IMerkleSnapshot(realSnap));

        vm.prank(service);
        realSnap.stageUpdater(address(v2));

        // Strict-flip: v2 cannot submit while staged but not yet activated.
        IServiceHandler.Envelope memory env = _envelope(bytes20(uint160(1)), ROOT_A, IPFS_HASH, "cid");
        vm.expectRevert(IMerkleSnapshot.NotUpdater.selector);
        v2.handleSignedEnvelope(env, _emptySig());

        // Even after the effective timestamp, no auto-flip.
        vm.warp(block.timestamp + DELAY);
        vm.expectRevert(IMerkleSnapshot.NotUpdater.selector);
        v2.handleSignedEnvelope(env, _emptySig());

        // Activate; v2 now succeeds.
        realSnap.activateUpdater();
        v2.handleSignedEnvelope(env, _emptySig());
    }
}
