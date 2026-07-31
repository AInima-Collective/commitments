// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import "forge-std/Test.sol";
import {CommitmentManagerStorage} from "src/core/manager/storage/CommitmentManagerStorage.sol";
import {
    CommitmentsRewardsCoordinatorStorage
} from "src/extensions/rewards/storage/CommitmentsRewardsCoordinatorStorage.sol";

/// @dev Probe harness for the coordinator's (slimmed) storage layout.
contract CoordinatorStorageHarness {
    function poke() external {
        CommitmentsRewardsCoordinatorStorage.Layout storage s = CommitmentsRewardsCoordinatorStorage.layout();
        s.service = address(0x5E11);
        s.snapshot = address(0xCAFE);
        s.frozen = true;
    }
}

/// @dev Writes sentinel values through the storage library so the test can probe raw slots
///      with vm.load. Lives at its own address; the layout sits at STORAGE_SLOT regardless.
contract ManagerStorageHarness {
    function poke() external {
        CommitmentManagerStorage.Layout storage s = CommitmentManagerStorage.layout();
        s.nextCommitmentId = 42;
        s.nextAgreementProposalId = 43;
        s.nextAgreementId = 44;
        s.unbondingPeriod = 7 days;
        s.minChallengeWindow = 1 days;
        s.hookGasCap = 500_000;
        s.forfeiturePaused = true;
        s.operatorRegistry = address(0xBEEF);
        // Shared-loss mutuals appended at offsets 28..31; nextMutualId (scalar) anchors them.
        s.nextMutualId = 45;
        // Premium index appended at offsets 32..33 (two top-level maps). Sentinels under fixed keys
        // so the test can re-derive the mapping base slots and prove nothing shifted the mutual maps.
        s.mutualPremiumPool[7] = 123; // offset 32
        s.totalMutualPremium[address(0xABCD)] = 456; // offset 33
        // Junior shortfall absorber (heterogeneous mode) appended at offsets 34..36.
        s.mutualJuniorPool[8] = 111; // offset 34
        s.totalMutualJunior[address(0x1234)] = 222; // offset 35
        s.mutualHaircutBps[9][address(0x5678)] = 77; // offset 36 (nested mapping)
        // Appended Mutual struct fields (premium side) live inside mutuals[*] (offset 28).
        // Probe two of them at their in-struct offsets to lock the append.
        s.mutuals[1].premiumPerShareStored = 789; // struct slot +7
        s.mutuals[1].activeCover = 321; // struct slot +8 (low 128 bits)
        // Agreements proposal→agreement reverse index appended at offset 37.
        s.proposalToAgreement[11] = 555; // offset 37
        // Acceptor-leg strategy bindings appended at offset 38.
        s.proposalAcceptorStrategies[15].push(); // offset 38 (dynamic-array length)
        // Pause-budget erratum appended at offsets 39..41 (three packed uint64 scalars + the
        // unbond and member-exit snapshot maps). NOTE: forfeiturePaused (offset 25 slot) is poked above already.
        s.pausedAt = 1_000_001; // offset 39, bits 0..63
        s.cumulativePaused = 1_000_002; // offset 39, bits 64..127
        s.maxPauseDuration = 1_000_003; // offset 39, bits 128..191
        s.unbondCumulativePausedAtStart[12] = 888; // offset 40
        s.memberExitCumulativePausedAtStart[17] = 999; // offset 41
        // Appended per-record snapshot fields (append-only inside their structs).
        s.forfeitProposals[13].cumulativePausedAtStart = 91; // ForfeitProposal, packed slot bits 96..159
        s.mutualLossProposals[14].cumulativePausedAtStart = 92; // MutualLossProposal, slot +3 bits 176..239
        s.commitments[16].cumulativePausedAtStart = 94; // Commitment, appended tail slot
    }
}

/// @title ManagerStorageSlotsTest
/// @notice Locks the CommitmentManager EIP-7201 slot constant and the Layout field offsets.
///         Two wrong-slot incidents in this codebase's history motivated the original
///         StorageSlots.t.sol; this file extends the same discipline to the manager layout.
///         Field order in CommitmentManagerStorage.Layout is APPEND-ONLY — if an offset
///         assertion here fails, the layout was reordered and any deployed proxy would corrupt.
contract ManagerStorageSlotsTest is Test {
    bytes32 internal constant SLOT = CommitmentManagerStorage.STORAGE_SLOT;

    /// @dev Canonical EIP-7201 derivation.
    function _eip7201Slot(string memory namespace) internal pure returns (bytes32) {
        return keccak256(abi.encode(uint256(keccak256(bytes(namespace))) - 1)) & ~bytes32(uint256(0xff));
    }

    function test_managerStorageSlot_matchesEIP7201() public pure {
        assertEq(SLOT, _eip7201Slot("commitments.manager.storage"), "manager slot mismatch");
    }

    // =========================================================================
    // Field-offset probes (append-only regression)
    //
    // Layout field order (offsets from STORAGE_SLOT):
    //    0: ledger (mapping)
    //    1: escrow (mapping)
    //    2: totalFree (mapping)
    //    3: totalEncumbered (mapping)
    //    4: totalEscrow (mapping)
    //    5: commitments (mapping)
    //    6: nextCommitmentId (uint256)
    //    7: commitmentStrategies (mapping)
    //    8: isBoundStrategy (mapping)
    //    9: failedHookSelector (mapping)
    //   10: forfeitProposals (mapping)
    //   11: userExposures (mapping)
    //   12: userCommitmentIds (mapping)
    //   13: unbondInitiatedAt (mapping)
    //   14: closedAt (mapping)
    //   15: nonces (mapping)
    //   16: agreementProposals (mapping)
    //   17: proposalStrategies (mapping)
    //   18: nextAgreementProposalId (uint256)
    //   19: agreementPairs (mapping)
    //   20: commitmentToAgreement (mapping)
    //   21: nextAgreementId (uint256)
    //   22: proposalCaps (mapping)
    //   23: agreementSettlement (mapping)
    //   24: acceptsContributions (mapping)
    //   25: unbondingPeriod (uint64) | minChallengeWindow (uint64) | hookGasCap (uint64)
    //       | forfeiturePaused (bool)            ← packed into one slot
    //   26: operatorRegistry (address)
    //   27: forfeitedUnits (mapping)
    //   28: mutuals (mapping)          ← Mutual extension append
    //   29: membership (mapping)        ← Mutual extension append
    //   30: nextMutualId (uint256)            ← Mutual extension append
    //   31: mutualLossProposals (mapping)     ← Mutual extension append
    //   32: mutualPremiumPool (mapping)        ← premium-index extension append
    //   33: totalMutualPremium (mapping)       ← premium-index extension append
    //   34: mutualJuniorPool (mapping)         ← junior-absorber extension append (heterogeneous mode)
    //   35: totalMutualJunior (mapping)        ← junior-absorber extension append (heterogeneous mode)
    //   36: mutualHaircutBps (nested mapping)  ← junior-absorber extension append (heterogeneous mode)
    //   37: proposalToAgreement (mapping)      ← agreement reverse-index append
    //   38: proposalAcceptorStrategies (mapping) ← acceptor-leg strategy append
    //   39: pausedAt (uint64) | cumulativePaused (uint64) | maxPauseDuration (uint64)
    //                                                   ← packed into one slot
    //   40: unbondCumulativePausedAtStart (mapping)
    //   41: memberExitCumulativePausedAtStart (mapping)
    // =========================================================================

    function test_managerLayoutOffsets() public {
        ManagerStorageHarness h = new ManagerStorageHarness();
        h.poke();

        // Scalar id counters at offsets 6 / 18 / 21.
        assertEq(uint256(vm.load(address(h), bytes32(uint256(SLOT) + 6))), 42, "nextCommitmentId offset");
        assertEq(uint256(vm.load(address(h), bytes32(uint256(SLOT) + 18))), 43, "nextAgreementProposalId offset");
        assertEq(uint256(vm.load(address(h), bytes32(uint256(SLOT) + 21))), 44, "nextAgreementId offset");

        // Packed config slot at offset 25:
        //   bits   0..63  unbondingPeriod      = 7 days
        //   bits  64..127 minChallengeWindow   = 1 days
        //   bits 128..191 hookGasCap           = 500_000
        //   bits 192..199 forfeiturePaused       = true
        uint256 packed = uint256(vm.load(address(h), bytes32(uint256(SLOT) + 25)));
        assertEq(uint64(packed), 7 days, "unbondingPeriod bits");
        assertEq(uint64(packed >> 64), 1 days, "minChallengeWindow bits");
        assertEq(uint64(packed >> 128), 500_000, "hookGasCap bits");
        assertEq(uint8(packed >> 192), 1, "forfeiturePaused bit");

        // operatorRegistry alone at offset 26.
        assertEq(
            address(uint160(uint256(vm.load(address(h), bytes32(uint256(SLOT) + 26))))),
            address(0xBEEF),
            "operatorRegistry offset"
        );

        // Mutual extension: nextMutualId scalar at offset 30 anchors the appended mutual
        // mappings (mutuals @28, membership @29, mutualLossProposals @31). If this
        // fails, a field was inserted before the append point and a deployed proxy would corrupt.
        assertEq(uint256(vm.load(address(h), bytes32(uint256(SLOT) + 30))), 45, "nextMutualId offset");

        // Premium-index extension: the two new top-level maps must anchor at offsets 32 and 33. If a
        // field were inserted before them (shifting the mutual maps), these derived slots miss.
        bytes32 poolSlot = keccak256(abi.encode(uint256(7), bytes32(uint256(SLOT) + 32)));
        assertEq(uint256(vm.load(address(h), poolSlot)), 123, "mutualPremiumPool @ offset 32");
        bytes32 aggSlot = keccak256(abi.encode(address(0xABCD), bytes32(uint256(SLOT) + 33)));
        assertEq(uint256(vm.load(address(h), aggSlot)), 456, "totalMutualPremium @ offset 33");

        // Junior-absorber extension: the three new maps must anchor at offsets 34, 35, 36. The haircut
        // map is nested (mutualId => token => bps), so its value slot derives in two keccak steps.
        bytes32 juniorPoolSlot = keccak256(abi.encode(uint256(8), bytes32(uint256(SLOT) + 34)));
        assertEq(uint256(vm.load(address(h), juniorPoolSlot)), 111, "mutualJuniorPool @ offset 34");
        bytes32 juniorAggSlot = keccak256(abi.encode(address(0x1234), bytes32(uint256(SLOT) + 35)));
        assertEq(uint256(vm.load(address(h), juniorAggSlot)), 222, "totalMutualJunior @ offset 35");
        bytes32 haircutOuter = keccak256(abi.encode(uint256(9), bytes32(uint256(SLOT) + 36)));
        bytes32 haircutSlot = keccak256(abi.encode(address(0x5678), haircutOuter));
        assertEq(uint256(vm.load(address(h), haircutSlot)), 77, "mutualHaircutBps @ offset 36");

        // Agreements reverse-index extension: proposalToAgreement must anchor at offset 37 (the next
        // append point after the junior-absorber block). A field inserted before it misses this slot.
        bytes32 propToAgrSlot = keccak256(abi.encode(uint256(11), bytes32(uint256(SLOT) + 37)));
        assertEq(uint256(vm.load(address(h), propToAgrSlot)), 555, "proposalToAgreement @ offset 37");

        // Acceptor-leg strategy extension: proposalAcceptorStrategies anchors at offset 38.
        // The mapping entry is a dynamic array, so the derived entry slot stores its length.
        bytes32 acceptorStrategiesSlot = keccak256(abi.encode(uint256(15), bytes32(uint256(SLOT) + 38)));
        assertEq(uint256(vm.load(address(h), acceptorStrategiesSlot)), 1, "proposalAcceptorStrategies @ offset 38");

        // Appended Mutual premium fields: mutuals (offset 28) value base, then the
        // in-struct slots +7 (premiumPerShareStored) and +8 (activeCover, low 128 bits). The +7/+8
        // offsets follow from the greedy packing of the header (valuationAuthority+challengeWindow
        // share slot 3; deallocationWindow+lastInitiatedAt+totalShares share slot 4; active+terminal
        // share slot 6), so the premium block begins immediately after — proving the append point.
        bytes32 mutualBase = keccak256(abi.encode(uint256(1), bytes32(uint256(SLOT) + 28)));
        assertEq(
            uint256(vm.load(address(h), bytes32(uint256(mutualBase) + 7))), 789, "Mutual.premiumPerShareStored @+7"
        );
        assertEq(uint128(uint256(vm.load(address(h), bytes32(uint256(mutualBase) + 8)))), 321, "Mutual.activeCover @+8");
    }

    /// @notice Locks the pause-budget erratum's appended fields: the packed scalar slot at
    ///         offset 39, the unbond snapshot map at offset 40, and the per-record
    ///         `cumulativePausedAtStart` appends inside their three structs. Separate function
    ///         from `test_managerLayoutOffsets` purely for legacy-codegen stack headroom.
    function test_managerLayoutOffsets_pauseErratum() public {
        ManagerStorageHarness h = new ManagerStorageHarness();
        h.poke();

        // Pause-budget erratum: the three scalars pack into ONE slot at offset 39
        //   bits   0..63  pausedAt, bits 64..127 cumulativePaused, bits 128..191 maxPauseDuration
        uint256 pausePacked = uint256(vm.load(address(h), bytes32(uint256(SLOT) + 39)));
        assertEq(uint64(pausePacked), 1_000_001, "pausedAt bits @39");
        assertEq(uint64(pausePacked >> 64), 1_000_002, "cumulativePaused bits @39");
        assertEq(uint64(pausePacked >> 128), 1_000_003, "maxPauseDuration bits @39");

        // unbondCumulativePausedAtStart mapping anchors at offset 40.
        bytes32 unbondSnapSlot = keccak256(abi.encode(uint256(12), bytes32(uint256(SLOT) + 40)));
        assertEq(uint256(vm.load(address(h), unbondSnapSlot)), 888, "unbondCumulativePausedAtStart @ offset 40");

        // memberExitCumulativePausedAtStart mapping anchors at offset 41.
        bytes32 exitSnapSlot = keccak256(abi.encode(uint256(17), bytes32(uint256(SLOT) + 41)));
        assertEq(uint256(vm.load(address(h), exitSnapSlot)), 999, "memberExitCumulativePausedAtStart @ offset 41");

        // Appended per-record snapshots (append-only within each struct):
        // ForfeitProposal (offset 10): single packed slot — penaltyBps 0..15, initiatedAt 16..79,
        // executed 80..87, cancelled 88..95, cumulativePausedAtStart 96..159.
        bytes32 fpSlot = keccak256(abi.encode(uint256(13), bytes32(uint256(SLOT) + 10)));
        assertEq(uint64(uint256(vm.load(address(h), fpSlot)) >> 96), 91, "ForfeitProposal.cumulativePausedAtStart");

        // MutualLossProposal (offset 31): slot +3 — proposer 0..159, executed 160..167,
        // cancelled 168..175, cumulativePausedAtStart 176..239.
        bytes32 mlpBase = keccak256(abi.encode(uint256(14), bytes32(uint256(SLOT) + 31)));
        assertEq(
            uint64(uint256(vm.load(address(h), bytes32(uint256(mlpBase) + 3))) >> 176),
            92,
            "MutualLossProposal.cumulativePausedAtStart"
        );

        // Commitment (offset 5): appended tail slot +9 (after metadataHash at +8).
        bytes32 comBase = keccak256(abi.encode(uint256(16), bytes32(uint256(SLOT) + 5)));
        assertEq(
            uint64(uint256(vm.load(address(h), bytes32(uint256(comBase) + 9)))),
            94,
            "Commitment.cumulativePausedAtStart"
        );
    }

    /// @notice The coordinator layout after the wave-3 slim-down:
    ///   0: service, 1: snapshot (+ frozen bool packed at byte 20), 2: claimed (mapping).
    ///   The staged-updater state (moved to MerkleSnapshot) and the no-op Part D
    ///   bridge (manager / boundCommitments) were removed.
    function test_coordinatorStorageLayout() public {
        CoordinatorStorageHarness h = new CoordinatorStorageHarness();
        h.poke();
        bytes32 base = CommitmentsRewardsCoordinatorStorage.STORAGE_SLOT;

        // Offset 0: service
        assertEq(address(uint160(uint256(vm.load(address(h), base)))), address(0x5E11), "coordinator.service offset 0");

        // Offset 1: snapshot (low 160 bits) + frozen (bit 160)
        bytes32 packed = vm.load(address(h), bytes32(uint256(base) + 1));
        assertEq(address(uint160(uint256(packed))), address(0xCAFE), "coordinator.snapshot offset 1 low bytes");
        assertEq(uint8(uint256(packed) >> 160), 1, "coordinator.frozen must pack above snapshot at offset 1");
    }
}
