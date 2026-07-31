// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import {ERC1967Proxy} from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";

import {OperatorRegistry} from "src/extensions/services/operator-registry/OperatorRegistry.sol";
import {IOperatorRegistry} from "src/extensions/services/interfaces/IOperatorRegistry.sol";
import {OperatorRegistryStorage} from "src/extensions/services/operator-registry/OperatorRegistryStorage.sol";
import {ManagerTestBase} from "../helpers/ManagerTestBase.sol";

/// @title OperatorRegistryMetadataTest
/// @notice Tests for Phase 14 operator metadata: MDO-01..04, against the real
///         direct-custody `CommitmentManager`.
///         Covers setOperatorMetadata (auth, storage, event, URI cap, multi-update),
///         getOperatorMetadata (zero struct default), deregister-preserves-metadata,
///         re-register-can-overwrite, hot-path isolation, and EIP-7201 slot regression.
contract OperatorRegistryMetadataTest is ManagerTestBase {
    OperatorRegistry public operatorRegistry;

    address public alice = makeAddr("alice"); // operator
    address public bob = makeAddr("bob"); // non-operator
    address public arbiter = makeAddr("arbiter");

    uint256 public constant MIN_STAKE = 100e18;
    uint256 public constant STAKE_AMOUNT = 200e18;
    uint16 public constant MAX_PENALTY_BPS = 5000;

    string public constant SAMPLE_URI = "ipfs://bafybeihqz3aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
    bytes32 public constant SAMPLE_HASH = keccak256("canonical-operator-json-v1");

    // =========================================================================
    // Setup
    // =========================================================================

    function setUp() public override {
        // 1. Real CommitmentManager proxy + MockERC20 + static adapter from the shared fixture.
        super.setUp();

        // 2. Deploy OperatorRegistry behind ERC1967Proxy.
        //    Policy: floor 0 — any penalty is fine for metadata tests that don't exercise the gate.
        OperatorRegistry regImpl = new OperatorRegistry();
        operatorRegistry = OperatorRegistry(
            address(
                new ERC1967Proxy(
                    address(regImpl),
                    abi.encodeCall(
                        OperatorRegistry.initialize,
                        (address(manager), MIN_STAKE, uint256(1024), admin, arbiter, uint16(0), address(token))
                    )
                )
            )
        );

        // 3. Wire registry into the manager (hooks on forfeit/release).
        vm.prank(admin);
        manager.setOperatorRegistry(address(operatorRegistry));

        // 4. Fund participants' free balances inside the manager.
        _deposit(alice, STAKE_AMOUNT * 3);
        _deposit(bob, STAKE_AMOUNT);
    }

    // =========================================================================
    // Helpers
    // =========================================================================

    /// @dev Register an operator with the registry using a fresh commitment.
    function _registerOperator(address op, uint256 amount) internal returns (uint256 commitmentId) {
        commitmentId = _createAs(op, _baseParams(arbiter, address(operatorRegistry), amount, MAX_PENALTY_BPS));
        vm.prank(op);
        operatorRegistry.register(commitmentId);
    }

    // =========================================================================
    // Test 1 (MDO-01): Active operator writes metadata; getOperatorMetadata returns stored record
    // =========================================================================

    function testSetOperatorMetadata_ActiveOperator_Succeeds() public {
        _registerOperator(alice, STAKE_AMOUNT);

        vm.prank(alice);
        operatorRegistry.setOperatorMetadata(SAMPLE_URI, SAMPLE_HASH);

        IOperatorRegistry.OperatorMetadata memory meta = operatorRegistry.getOperatorMetadata(alice);
        assertEq(meta.uri, SAMPLE_URI, "uri mismatch after set");
        assertEq(meta.contentHash, SAMPLE_HASH, "contentHash mismatch after set");
        assertEq(meta.updatedAt, uint64(block.timestamp), "updatedAt must equal block.timestamp");
    }

    // =========================================================================
    // Test 2 (MDO-03): setOperatorMetadata emits OperatorMetadataUpdated with all four fields
    // =========================================================================

    function testSetOperatorMetadata_EmitsUpdatedEvent() public {
        _registerOperator(alice, STAKE_AMOUNT);

        vm.expectEmit(true, false, false, true, address(operatorRegistry));
        emit IOperatorRegistry.OperatorMetadataUpdated(alice, SAMPLE_URI, SAMPLE_HASH, uint64(block.timestamp));

        vm.prank(alice);
        operatorRegistry.setOperatorMetadata(SAMPLE_URI, SAMPLE_HASH);
    }

    // =========================================================================
    // Test 3 (MDO-04): Non-operator address reverts with OperatorNotActive
    // =========================================================================

    function testSetOperatorMetadata_RevertsNonOperator() public {
        // bob never registered
        vm.prank(bob);
        vm.expectRevert(IOperatorRegistry.OperatorNotActive.selector);
        operatorRegistry.setOperatorMetadata(SAMPLE_URI, SAMPLE_HASH);
    }

    // =========================================================================
    // Test 4 (MDO-04): Deregistered operator reverts with OperatorNotActive
    // =========================================================================

    function testSetOperatorMetadata_RevertsDeregisteredOperator() public {
        _registerOperator(alice, STAKE_AMOUNT);

        // Advance a block: a same-block register⇄deregister flip is blocked (issue #44).
        vm.roll(block.number + 1);
        // Deregister
        vm.prank(alice);
        operatorRegistry.deregister();

        assertFalse(operatorRegistry.isOperator(alice), "alice should be inactive after deregister");

        vm.prank(alice);
        vm.expectRevert(IOperatorRegistry.OperatorNotActive.selector);
        operatorRegistry.setOperatorMetadata(SAMPLE_URI, SAMPLE_HASH);
    }

    // =========================================================================
    // Test 5 (MDO-02): Multiple updates — last call wins; each emits OperatorMetadataUpdated
    // =========================================================================

    function testSetOperatorMetadata_MultipleUpdates_LastWins() public {
        _registerOperator(alice, STAKE_AMOUNT);

        string memory uriA = "ipfs://uri-first-a";
        bytes32 hashA = keccak256("hash-a");

        vm.prank(alice);
        operatorRegistry.setOperatorMetadata(uriA, hashA);

        IOperatorRegistry.OperatorMetadata memory metaA = operatorRegistry.getOperatorMetadata(alice);
        assertEq(metaA.uri, uriA, "first uri should be stored");
        uint64 firstTs = metaA.updatedAt;

        // Advance time so updatedAt changes
        vm.warp(block.timestamp + 3600);

        string memory uriB = "ipfs://uri-second-b";
        bytes32 hashB = keccak256("hash-b");

        vm.expectEmit(true, false, false, true, address(operatorRegistry));
        emit IOperatorRegistry.OperatorMetadataUpdated(alice, uriB, hashB, uint64(block.timestamp));

        vm.prank(alice);
        operatorRegistry.setOperatorMetadata(uriB, hashB);

        IOperatorRegistry.OperatorMetadata memory metaB = operatorRegistry.getOperatorMetadata(alice);
        assertEq(metaB.uri, uriB, "second uri should overwrite first");
        assertEq(metaB.contentHash, hashB, "second hash should overwrite first");
        assertGt(metaB.updatedAt, firstTs, "updatedAt should increase on second set");
    }

    // =========================================================================
    // Test 6: URI cap boundary — 513 bytes reverts URITooLong; 512 bytes succeeds
    // =========================================================================

    function testSetOperatorMetadata_URITooLong_Reverts() public {
        _registerOperator(alice, STAKE_AMOUNT);

        // Build 513-byte URI
        bytes memory longUriBytes = new bytes(513);
        for (uint256 i = 0; i < 513; i++) {
            longUriBytes[i] = 0x61; // 'a'
        }
        string memory longUri = string(longUriBytes);

        vm.prank(alice);
        vm.expectRevert(IOperatorRegistry.URITooLong.selector);
        operatorRegistry.setOperatorMetadata(longUri, bytes32(0));

        // Exactly 512 bytes must succeed
        bytes memory okUriBytes = new bytes(512);
        for (uint256 i = 0; i < 512; i++) {
            okUriBytes[i] = 0x61;
        }
        string memory okUri = string(okUriBytes);

        vm.prank(alice);
        operatorRegistry.setOperatorMetadata(okUri, SAMPLE_HASH);

        IOperatorRegistry.OperatorMetadata memory meta = operatorRegistry.getOperatorMetadata(alice);
        assertEq(bytes(meta.uri).length, 512, "512-byte URI must be stored");
    }

    // =========================================================================
    // Test 7: Operator who never called set returns zero struct from getOperatorMetadata
    // =========================================================================

    function testGetOperatorMetadata_UnsetOperator_ReturnsZero() public {
        _registerOperator(alice, STAKE_AMOUNT);

        // alice is registered but never called setOperatorMetadata
        IOperatorRegistry.OperatorMetadata memory meta = operatorRegistry.getOperatorMetadata(alice);
        assertEq(bytes(meta.uri).length, 0, "unset uri should be empty string");
        assertEq(meta.contentHash, bytes32(0), "unset contentHash should be zero");
        assertEq(meta.updatedAt, 0, "unset updatedAt should be zero");
    }

    // =========================================================================
    // Test 8: Deregister preserves metadata (locked decision: historical record)
    // =========================================================================

    function testDeregister_PreservesMetadata() public {
        _registerOperator(alice, STAKE_AMOUNT);

        vm.prank(alice);
        operatorRegistry.setOperatorMetadata(SAMPLE_URI, SAMPLE_HASH);

        IOperatorRegistry.OperatorMetadata memory beforeMeta = operatorRegistry.getOperatorMetadata(alice);
        assertEq(beforeMeta.uri, SAMPLE_URI, "uri should be set before deregister");

        // Advance a block: a same-block register⇄deregister flip is blocked (issue #44).
        vm.roll(block.number + 1);
        // Deregister
        vm.prank(alice);
        operatorRegistry.deregister();

        assertFalse(operatorRegistry.isOperator(alice), "alice should be inactive after deregister");

        // Metadata must persist
        IOperatorRegistry.OperatorMetadata memory afterMeta = operatorRegistry.getOperatorMetadata(alice);
        assertEq(afterMeta.uri, beforeMeta.uri, "uri must persist across deregister");
        assertEq(afterMeta.contentHash, beforeMeta.contentHash, "contentHash must persist across deregister");
        assertEq(afterMeta.updatedAt, beforeMeta.updatedAt, "updatedAt must persist across deregister");
    }

    // =========================================================================
    // Test 9: Re-register after deregister can overwrite metadata
    // =========================================================================

    function testReregisterAfterDeregister_CanOverwrite() public {
        _registerOperator(alice, STAKE_AMOUNT);

        vm.prank(alice);
        operatorRegistry.setOperatorMetadata(SAMPLE_URI, SAMPLE_HASH);

        // Advance a block: a same-block register⇄deregister flip is blocked (issue #44).
        vm.roll(block.number + 1);
        // Deregister
        vm.prank(alice);
        operatorRegistry.deregister();

        // Advance another block before re-registering (register is also a toggle).
        vm.roll(block.number + 1);
        // Re-register with a fresh commitment (alice still has free balance in the manager)
        _registerOperator(alice, STAKE_AMOUNT);
        assertTrue(operatorRegistry.isOperator(alice), "alice should be active after re-register");

        // Overwrite with new metadata
        string memory newUri = "ipfs://new-metadata-after-reregister";
        bytes32 newHash = keccak256("new-payload");

        vm.prank(alice);
        operatorRegistry.setOperatorMetadata(newUri, newHash);

        IOperatorRegistry.OperatorMetadata memory meta = operatorRegistry.getOperatorMetadata(alice);
        assertEq(meta.uri, newUri, "new uri must overwrite old after re-register");
        assertEq(meta.contentHash, newHash, "new hash must overwrite old after re-register");
    }

    // =========================================================================
    // Test 10: setOperatorMetadata does not affect hot-path views (sidecar isolation)
    // =========================================================================

    function testSetOperatorMetadata_DoesNotAffectHotPath() public {
        _registerOperator(alice, STAKE_AMOUNT);

        // Snapshot hot-path views before set
        bool isOpBefore = operatorRegistry.isOperator(alice);
        uint256 stakeBefore = operatorRegistry.getOperatorStake(alice);
        uint256 setLenBefore = operatorRegistry.getOperatorSet().length;

        // Set metadata (sidecar write)
        vm.prank(alice);
        operatorRegistry.setOperatorMetadata(SAMPLE_URI, SAMPLE_HASH);

        // Assert hot-path views unchanged
        assertEq(operatorRegistry.isOperator(alice), isOpBefore, "isOperator must be unchanged after setMetadata");
        assertEq(
            operatorRegistry.getOperatorStake(alice),
            stakeBefore,
            "getOperatorStake must be unchanged after setMetadata"
        );
        assertEq(
            operatorRegistry.getOperatorSet().length,
            setLenBefore,
            "getOperatorSet length must be unchanged after setMetadata"
        );
    }

    // =========================================================================
    // Test 11: EIP-7201 storage slot unchanged after Phase 14 append (regression)
    // =========================================================================

    function testSetOperatorMetadata_StorageSlotUnchanged() public pure {
        bytes32 expected = keccak256(abi.encode(uint256(keccak256(bytes("commitments.operator.registry.storage"))) - 1))
            & ~bytes32(uint256(0xff));

        assertEq(
            OperatorRegistryStorage.STORAGE_SLOT,
            expected,
            "EIP-7201 registry storage slot must match canonical derivation after Phase 14 field append"
        );
    }
}
