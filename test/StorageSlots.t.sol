// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import "forge-std/Test.sol";
import {ERC1967Proxy} from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {CommitmentsVault} from "src/periphery/vaults/CommitmentsVault.sol";
import {MockERC20} from "./helpers/MockERC20.sol";
import {CommitmentsVaultStorage} from "src/periphery/vaults/storage/CommitmentsVaultStorage.sol";
import {OperatorRegistryStorage} from "src/extensions/services/operator-registry/OperatorRegistryStorage.sol";
import {OperatorRegistry} from "src/extensions/services/operator-registry/OperatorRegistry.sol";
import {MerkleSnapshotStorage} from "src/extensions/rewards/storage/MerkleSnapshotStorage.sol";
import {
    CommitmentsRewardsCoordinatorStorage
} from "src/extensions/rewards/storage/CommitmentsRewardsCoordinatorStorage.sol";
import {MerkleSnapshot} from "src/extensions/rewards/MerkleSnapshot.sol";
import {CommitmentsRewardsCoordinator} from "src/extensions/rewards/CommitmentsRewardsCoordinator.sol";

/// @title StorageSlotsTest
/// @notice Verifies all EIP-7201 storage slot constants match the canonical derivation.
///         Phase 14 extension: append-only field-order regression via vm.load probes.
/// @dev SPEC-01: dynamically computes slots and asserts they match hardcoded constants.
contract StorageSlotsTest is Test {
    /// @dev Computes EIP-7201 slot: keccak256(abi.encode(uint256(keccak256(bytes(ns))) - 1)) & ~bytes32(uint256(0xff))
    function _eip7201Slot(string memory namespace) internal pure returns (bytes32) {
        return keccak256(abi.encode(uint256(keccak256(bytes(namespace))) - 1)) & ~bytes32(uint256(0xff));
    }

    // =========================================================================
    // Existing slot derivation tests (DO NOT MODIFY)
    // =========================================================================

    function test_vaultStorageSlot_matchesEIP7201() public pure {
        bytes32 expected = _eip7201Slot("commitments.vault.storage");
        assertEq(CommitmentsVaultStorage.STORAGE_SLOT, expected, "vault slot mismatch");
    }

    function test_registryStorageSlot_matchesEIP7201() public pure {
        bytes32 expected = _eip7201Slot("commitments.operator.registry.storage");
        assertEq(OperatorRegistryStorage.STORAGE_SLOT, expected, "registry slot mismatch");
    }

    function test_merkleSnapshotStorageSlot_matchesEIP7201() public pure {
        bytes32 expected = _eip7201Slot("commitments.rewards.merkle.snapshot.storage");
        assertEq(MerkleSnapshotStorage.STORAGE_SLOT, expected, "merkle snapshot slot mismatch");
    }

    function test_rewardsCoordinatorStorageSlot_matchesEIP7201() public pure {
        bytes32 expected = _eip7201Slot("commitments.rewards.coordinator.storage");
        assertEq(CommitmentsRewardsCoordinatorStorage.STORAGE_SLOT, expected, "rewards coordinator slot mismatch");
    }

    // =========================================================================
    // Wave-3 rewards layout locks (field offsets via vm.load probes)
    // =========================================================================

    /// @notice Locks the MerkleSnapshot layout after the §0.6 staged-updater
    ///         surface was relocated onto the snapshot. Field order (offsets
    ///         from STORAGE_SLOT):
    ///           0: service (address)
    ///           1: updater (address)
    ///           2: pendingUpdater (address) + pendingUpdaterEffectiveAt (uint64), packed
    ///           3: activationDelay (uint64) + minActivationDelay (uint64), packed
    ///           4: roots (mapping)
    function test_merkleSnapshotLayout_updaterStateRelocated() public {
        MerkleSnapshot impl = new MerkleSnapshot();
        address serviceAddr = address(0x5E12);
        address updaterAddr = address(0x09DA7E5);
        uint64 actDelay = 7 days;
        uint64 minDelay = 1 days;
        ERC1967Proxy proxy = new ERC1967Proxy(
            address(impl), abi.encodeCall(MerkleSnapshot.initialize, (serviceAddr, actDelay, minDelay, updaterAddr))
        );
        MerkleSnapshot snap = MerkleSnapshot(address(proxy));

        bytes32 base = MerkleSnapshotStorage.STORAGE_SLOT;

        // Offset 0: service
        assertEq(address(uint160(uint256(vm.load(address(proxy), base)))), serviceAddr, "service at offset 0");

        // Offset 1: updater
        assertEq(
            address(uint160(uint256(vm.load(address(proxy), bytes32(uint256(base) + 1))))),
            updaterAddr,
            "updater at offset 1"
        );

        // Offset 3: activationDelay (low 64 bits) | minActivationDelay (next 64 bits)
        bytes32 delays = vm.load(address(proxy), bytes32(uint256(base) + 3));
        assertEq(uint64(uint256(delays)), actDelay, "activationDelay at offset 3 low bytes");
        assertEq(uint64(uint256(delays) >> 64), minDelay, "minActivationDelay packs above activationDelay at offset 3");

        // Offset 2: stage a pending updater and probe pendingUpdater + effectiveAt.
        address pendingAddr = address(0xBEEF);
        vm.prank(serviceAddr);
        snap.stageUpdater(pendingAddr);
        bytes32 staged = vm.load(address(proxy), bytes32(uint256(base) + 2));
        assertEq(address(uint160(uint256(staged))), pendingAddr, "pendingUpdater at offset 2 low bytes");
        assertEq(
            uint64(uint256(staged) >> 160),
            uint64(block.timestamp) + actDelay,
            "pendingUpdaterEffectiveAt packs above pendingUpdater at offset 2"
        );
    }

    /// @notice Locks the slimmed CommitmentsRewardsCoordinator layout. Field
    ///         order (offsets from STORAGE_SLOT):
    ///           0: service (address)
    ///           1: snapshot (address) + frozen (bool), packed
    ///           2: claimed (mapping)
    function test_rewardsCoordinatorLayout_frozenPacksWithSnapshot() public {
        MerkleSnapshot snapImpl = new MerkleSnapshot();
        address serviceAddr = address(0x5E13);
        ERC1967Proxy snapProxy = new ERC1967Proxy(
            address(snapImpl),
            abi.encodeCall(MerkleSnapshot.initialize, (serviceAddr, uint64(7 days), uint64(1 days), address(0xDEAD)))
        );

        CommitmentsRewardsCoordinator coordImpl = new CommitmentsRewardsCoordinator();
        ERC1967Proxy coordProxy = new ERC1967Proxy(
            address(coordImpl),
            abi.encodeCall(CommitmentsRewardsCoordinator.initialize, (serviceAddr, address(snapProxy)))
        );
        CommitmentsRewardsCoordinator coord = CommitmentsRewardsCoordinator(address(coordProxy));

        bytes32 base = CommitmentsRewardsCoordinatorStorage.STORAGE_SLOT;

        // Offset 0: service
        assertEq(address(uint160(uint256(vm.load(address(coordProxy), base)))), serviceAddr, "service at offset 0");

        // Offset 1: snapshot (low 160 bits); frozen flips bit 160 after freeze().
        assertEq(
            address(uint160(uint256(vm.load(address(coordProxy), bytes32(uint256(base) + 1))))),
            address(snapProxy),
            "snapshot at offset 1 low bytes"
        );
        vm.prank(serviceAddr);
        coord.freeze();
        bytes32 packed = vm.load(address(coordProxy), bytes32(uint256(base) + 1));
        assertEq(uint8(uint256(packed) >> 160), 1, "frozen must pack above snapshot at offset 1");
    }

    // =========================================================================
    // Phase 14: append-only field-order regression tests (vm.load probes)
    // =========================================================================

    /// @notice Verifies that `operatorMetadata` mapping (Phase 14 addition) is at slot offset 8
    ///         inside OperatorRegistryStorage.Layout, and that the pre-Phase-14 `commitmentManager`
    ///         address field is still at offset 7.
    ///
    /// OperatorRegistryStorage.Layout field order (offsets from STORAGE_SLOT):
    ///   0: operators (mapping)
    ///   1: operatorList (array)
    ///   2: operatorListIndex (mapping)
    ///   3: commitmentToOperator (mapping)
    ///   4: commitmentToStaker (mapping)
    ///   5: minOperatorStake (uint256)
    ///   6: maxDelegationsPerOperator (uint256)
    ///   7: commitmentManager (address)  ← last pre-Phase-14 field
    ///   8: operatorMetadata (mapping)   ← Phase 14 append
    ///   9: requiredArbiter (address) + minMaxPenaltyBps (uint16), packed  ← phase 17 append
    ///  10: registeredAmount (mapping)   ← audit H-5 append
    ///  11: requiredToken (address)      ← v2 acceptance-policy append
    ///
    /// On an uninitialized implementation contract all slots are zero.
    /// This test proves the append-only ordering was not disrupted.
    function test_registryLayoutAppendOnly_operatorMetadataIsLast() public {
        // Deploy a bare implementation (not proxied) — storage is at known offsets
        OperatorRegistry registry = new OperatorRegistry();

        bytes32 base = OperatorRegistryStorage.STORAGE_SLOT;

        // Offset 7: commitmentManager (address) — zero on uninitialized impl
        bytes32 commitmentManagerSlot = bytes32(uint256(base) + 7);
        assertEq(
            vm.load(address(registry), commitmentManagerSlot),
            bytes32(0),
            "commitmentManager field must remain at slot offset 7"
        );

        // Offset 8: operatorMetadata (mapping base) — zero on uninitialized impl
        bytes32 operatorMetadataSlot = bytes32(uint256(base) + 8);
        assertEq(
            vm.load(address(registry), operatorMetadataSlot),
            bytes32(0),
            "operatorMetadata mapping must be appended at slot offset 8 (Phase 14)"
        );

        // No slot at offset 9 (field count is exactly 9: offsets 0..8)
        // Sanity: offset 5 is minOperatorStake (uint256) — zero on uninitialized impl
        bytes32 minStakeSlot = bytes32(uint256(base) + 5);
        assertEq(vm.load(address(registry), minStakeSlot), bytes32(0), "minOperatorStake must remain at slot offset 5");

        // Sanity: offset 6 is maxDelegationsPerOperator (uint256) — zero on uninitialized impl
        bytes32 maxDelegationsSlot = bytes32(uint256(base) + 6);
        assertEq(
            vm.load(address(registry), maxDelegationsSlot),
            bytes32(0),
            "maxDelegationsPerOperator must remain at slot offset 6"
        );
    }

    /// @notice Locks the post-phase-17 tail of OperatorRegistryStorage.Layout by initializing a
    ///         proxy with sentinel values and probing the raw slots: offset 9 packs
    ///         `requiredArbiter` (low 20 bytes) with `minMaxPenaltyBps` (next 2 bytes); offset 11
    ///         is the v2 `requiredToken` append.
    function test_registryLayoutAppendOnly_requiredTokenIsLast() public {
        OperatorRegistry impl = new OperatorRegistry();
        address managerAddr = address(0xC0FFEE);
        address arbiterAddr = address(0xA9B17E9);
        address tokenAddr = address(0x70CEA);
        ERC1967Proxy proxy = new ERC1967Proxy(
            address(impl),
            abi.encodeCall(
                OperatorRegistry.initialize, (managerAddr, 123e18, 77, address(this), arbiterAddr, 4321, tokenAddr)
            )
        );

        bytes32 base = OperatorRegistryStorage.STORAGE_SLOT;

        // Offset 5: minOperatorStake
        assertEq(
            vm.load(address(proxy), bytes32(uint256(base) + 5)),
            bytes32(uint256(123e18)),
            "minOperatorStake must be at offset 5"
        );

        // Offset 9: requiredArbiter (bits 0..159) | minMaxPenaltyBps (bits 160..175)
        bytes32 packed = vm.load(address(proxy), bytes32(uint256(base) + 9));
        assertEq(address(uint160(uint256(packed))), arbiterAddr, "requiredArbiter must be at offset 9 low bytes");
        assertEq(uint16(uint256(packed) >> 160), 4321, "minMaxPenaltyBps must pack above requiredArbiter at offset 9");

        // Offset 11: requiredToken (the v2 append; offset 10 is the registeredAmount mapping base)
        assertEq(
            vm.load(address(proxy), bytes32(uint256(base) + 11)),
            bytes32(uint256(uint160(tokenAddr))),
            "requiredToken must be appended at offset 11"
        );
    }

    /// @notice Locks the wave-3b mesh-wiring tail of OperatorRegistryStorage.Layout:
    ///         offset 12 = tokenWeighting (address), offset 13 = meshFactory (address),
    ///         offset 14 = operatorFanIn (mapping base). Appended after requiredToken (11).
    function test_registryLayoutAppendOnly_meshWiringIsLast() public {
        OperatorRegistry impl = new OperatorRegistry();
        ERC1967Proxy proxy = new ERC1967Proxy(
            address(impl),
            abi.encodeCall(
                OperatorRegistry.initialize,
                (address(0xC0FFEE), 1e18, 8, address(this), address(0xA9B17E9), 0, address(0x70CEA))
            )
        );
        OperatorRegistry reg = OperatorRegistry(address(proxy));

        address twSentinel = address(0x7E16);
        address factorySentinel = address(0xFAC709);
        reg.setMeshWiring(twSentinel, factorySentinel);

        bytes32 base = OperatorRegistryStorage.STORAGE_SLOT;

        // Offset 12: tokenWeighting
        assertEq(
            address(uint160(uint256(vm.load(address(proxy), bytes32(uint256(base) + 12))))),
            twSentinel,
            "tokenWeighting must be appended at offset 12"
        );
        // Offset 13: meshFactory
        assertEq(
            address(uint160(uint256(vm.load(address(proxy), bytes32(uint256(base) + 13))))),
            factorySentinel,
            "meshFactory must be appended at offset 13"
        );
        // Offset 14: operatorFanIn mapping base — the slot itself holds nothing.
        assertEq(
            vm.load(address(proxy), bytes32(uint256(base) + 14)),
            bytes32(0),
            "operatorFanIn mapping base must be at offset 14"
        );
    }

    /// @notice Locks the S12 `trackedCommitmentCount` append at offset 15 (after the wave-3b
    ///         mesh-wiring tail: tokenWeighting 12, meshFactory 13, operatorFanIn 14).
    function test_registryLayoutAppendOnly_trackedCommitmentCountIsLast() public {
        OperatorRegistry impl = new OperatorRegistry();
        ERC1967Proxy proxy = new ERC1967Proxy(
            address(impl),
            abi.encodeCall(
                OperatorRegistry.initialize,
                (address(0xC0FFEE), 1e18, 8, address(this), address(0xA9B17E9), 0, address(0x70CEA))
            )
        );
        OperatorRegistry reg = OperatorRegistry(address(proxy));

        bytes32 base = OperatorRegistryStorage.STORAGE_SLOT;
        bytes32 counterSlot = bytes32(uint256(base) + 15);

        // Uninitialized counter reads zero through both the raw slot and the view.
        assertEq(vm.load(address(proxy), counterSlot), bytes32(0), "trackedCommitmentCount must start at 0");
        assertEq(reg.trackedCommitmentCount(), 0, "view must read the offset-15 slot");

        // Poke the raw slot and confirm the view reads it back — locks the field to offset 15.
        vm.store(address(proxy), counterSlot, bytes32(uint256(42)));
        assertEq(reg.trackedCommitmentCount(), 42, "trackedCommitmentCount must live at slot offset 15");
    }

    /// @notice Locks the issue-#44 EIP-712 appends: offset 16 = sigNonces (mapping base),
    ///         offset 17 = lastToggleBlock (mapping base). Both mapping bases hold nothing in
    ///         the slot itself; sigNonces is probed through its view and the derived entry slot.
    function test_registryLayoutAppendOnly_sigNoncesThenToggleBlock() public {
        OperatorRegistry impl = new OperatorRegistry();
        ERC1967Proxy proxy = new ERC1967Proxy(
            address(impl),
            abi.encodeCall(
                OperatorRegistry.initialize,
                (address(0xC0FFEE), 1e18, 8, address(this), address(0xA9B17E9), 0, address(0x70CEA))
            )
        );
        OperatorRegistry reg = OperatorRegistry(address(proxy));

        bytes32 base = OperatorRegistryStorage.STORAGE_SLOT;

        // Offset 16: sigNonces mapping base — the slot itself holds nothing.
        assertEq(
            vm.load(address(proxy), bytes32(uint256(base) + 16)),
            bytes32(0),
            "sigNonces mapping base must be at offset 16"
        );
        // Offset 17: lastToggleBlock mapping base — the slot itself holds nothing.
        assertEq(
            vm.load(address(proxy), bytes32(uint256(base) + 17)),
            bytes32(0),
            "lastToggleBlock mapping base must be at offset 17"
        );

        // Poke sigNonces[account] via its derived slot keccak(account, base+16) and confirm the
        // view reads it back — locks sigNonces to offset 16.
        address account = address(0x51611E5);
        bytes32 entrySlot = keccak256(abi.encode(account, bytes32(uint256(base) + 16)));
        vm.store(address(proxy), entrySlot, bytes32(uint256(7)));
        assertEq(reg.sigNonces(account), 7, "sigNonces must live at slot offset 16");
    }

    /// @notice Locks the issue-#60 safe-strategy allow-list append at offset 18 (after
    ///         lastToggleBlock at 17). The mapping base holds nothing; probe a derived entry slot
    ///         keccak(strategy, base+18) and confirm the `isStrategyAllowed` view reads it back.
    function test_registryLayoutAppendOnly_allowedStrategiesIsLast() public {
        OperatorRegistry impl = new OperatorRegistry();
        ERC1967Proxy proxy = new ERC1967Proxy(
            address(impl),
            abi.encodeCall(
                OperatorRegistry.initialize,
                (address(0xC0FFEE), 1e18, 8, address(this), address(0xA9B17E9), 0, address(0x70CEA))
            )
        );
        OperatorRegistry reg = OperatorRegistry(address(proxy));

        bytes32 base = OperatorRegistryStorage.STORAGE_SLOT;

        // Offset 18: allowedStrategies mapping base — the slot itself holds nothing.
        assertEq(
            vm.load(address(proxy), bytes32(uint256(base) + 18)),
            bytes32(0),
            "allowedStrategies mapping base must be at offset 18"
        );

        // Poke allowedStrategies[strategy] via keccak(strategy, base+18) and read it through the view.
        address strategy = address(0x57A7);
        bytes32 entrySlot = keccak256(abi.encode(strategy, bytes32(uint256(base) + 18)));
        vm.store(address(proxy), entrySlot, bytes32(uint256(1)));
        assertTrue(reg.isStrategyAllowed(strategy), "allowedStrategies must live at slot offset 18");
    }

    /// @notice Locks the clean-vault CommitmentsVaultStorage.Layout by initializing a proxy
    ///         with sentinel values and probing the raw slots.
    ///
    /// CommitmentsVaultStorage.Layout field order (offsets from STORAGE_SLOT):
    ///   0: strategy (address) + depositsPaused (bool), packed
    ///   1: vaultMetadata.uri (string head)
    ///   2: vaultMetadata.contentHash (bytes32)
    ///   3: vaultMetadata.updatedAt (uint64, lone in slot)
    function test_vaultLayout_strategyPackedWithPauseThenMetadata() public {
        CommitmentsVault impl = new CommitmentsVault();
        MockERC20 asset = new MockERC20("Asset", "AST", 18);
        address strategySentinel = address(0x57AA7E97);
        ERC1967Proxy proxy = new ERC1967Proxy(
            address(impl),
            abi.encodeCall(
                CommitmentsVault.initialize, (IERC20(address(asset)), "V", "V", address(this), strategySentinel)
            )
        );
        CommitmentsVault vault = CommitmentsVault(address(proxy));

        bytes32 base = CommitmentsVaultStorage.STORAGE_SLOT;

        // Offset 0: strategy (bits 0..159) | depositsPaused (bit 160)
        assertEq(
            address(uint160(uint256(vm.load(address(proxy), base)))),
            strategySentinel,
            "strategy must be at offset 0 low bytes"
        );
        vault.pauseDeposits();
        bytes32 packed = vm.load(address(proxy), base);
        assertEq(uint8(uint256(packed) >> 160), 1, "depositsPaused must pack above strategy at offset 0");

        // Offsets 2 and 3: vaultMetadata.contentHash and .updatedAt
        bytes32 hash = keccak256("vault metadata");
        vault.setMetadata("ipfs://vault", hash);
        assertEq(
            vm.load(address(proxy), bytes32(uint256(base) + 2)), hash, "vaultMetadata.contentHash must be at offset 2"
        );
        assertEq(
            uint64(uint256(vm.load(address(proxy), bytes32(uint256(base) + 3)))),
            uint64(block.timestamp),
            "vaultMetadata.updatedAt must be at offset 3"
        );
    }
}
