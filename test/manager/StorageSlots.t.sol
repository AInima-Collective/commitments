// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import "forge-std/Test.sol";
import {CommitmentManagerStorage} from "src/core/manager/storage/CommitmentManagerStorage.sol";
import {ICommitmentManager} from "src/core/interfaces/ICommitmentManager.sol";
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
        s.nextMutualId = 45;
        // Sentinels under fixed keys so the test can re-derive the mapping base slots.
        s.mutualPremiumPool[7] = 123; // offset 29
        s.totalMutualPremium[address(0xABCD)] = 456; // offset 30
        s.proposalToAgreement[11] = 555; // offset 31
        s.proposalAcceptorStrategies[15].push(); // offset 32 (dynamic-array length)
        s.pausedAt = 1_000_001; // offset 33, bits 0..63
        s.cumulativePaused = 1_000_002; // offset 33, bits 64..127
        s.maxPauseDuration = 1_000_003; // offset 33, bits 128..191
        s.forfeitProposals[13].cumulativePausedAtStart = 91; // ForfeitProposal, packed slot bits 96..159
        s.mutualLossProposals[14].cumulativePausedAtStart = 92; // MutualLossProposal, slot +3 bits 16..79
    }

    /// @dev Every field of one Commitment (id 16), Membership (id 17) and Mutual (id 1).
    function pokeStructs() external {
        CommitmentManagerStorage.Layout storage s = CommitmentManagerStorage.layout();
        ICommitmentManager.Commitment storage c = s.commitments[16];
        c.committer = address(0xC1);
        c.maxPenaltyBps = 7_500;
        c.released = true;
        c.forfeited = true;
        c.closedAt = 101;
        c.arbiter = address(0xC2);
        c.challengeWindow = 102;
        c.counterparty = address(0xC3);
        c.createdAt = 103;
        c.token = address(0xC4);
        c.expiresAt = 104;
        c.adapter = address(0xC5);
        c.unbondInitiatedAt = 105;
        c.amount = 106;
        c.metadataHash = bytes32(uint256(107));
        c.cumulativePausedAtStart = 108;
        c.unbondCumulativePausedAtStart = 109;

        ICommitmentManager.Membership storage m = s.membership[17];
        m.mutualId = 201;
        m.lossSnapshot = 202;
        m.unbondRequestedAt = 203;
        m.memberExitCumulativePausedAtStart = 204;
        m.forfeitableUnits = 205;
        m.settledUnits = 206;
        m.premiumSnapshot = 207;
        m.rewardBank = 208;

        ICommitmentManager.Mutual storage g = s.mutuals[1];
        g.arbiter = address(0xD1);
        g.challengeWindow = 301;
        g.active = true;
        g.terminal = true;
        g.numeraire = address(0xD2);
        g.deallocationWindow = 302;
        g.beneficiary = address(0xD3);
        g.totalShares = 303;
        g.activeCover = 304;
        g.cumulativeLoss = 305;
        g.rewardRate = 306;
        g.lastUpdate = 307;
        g.periodFinish = 308;
        g.premiumPerShareStored = 309;
        g.settledTotal = 310;
        g.premiumRemainder = 311;
        g.bankedTotal = 312;
    }
}

/// @title ManagerStorageSlotsTest
/// @notice Locks the CommitmentManager EIP-7201 slot constant, the Layout field offsets and the
///         packing of the Commitment, Membership and Mutual structs. Two wrong-slot incidents in
///         this codebase's history motivated the original StorageSlots.t.sol; if an assertion
///         here fails, the layout moved and must be re-locked deliberately.
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
    // Field-offset probes
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
    //   11: userForfeitable (mapping)
    //   12: nonces (mapping)
    //   13: agreementProposals (mapping)
    //   14: proposalStrategies (mapping)
    //   15: nextAgreementProposalId (uint256)
    //   16: agreementPairs (mapping)
    //   17: commitmentToAgreement (mapping)
    //   18: nextAgreementId (uint256)
    //   19: proposalCaps (mapping)
    //   20: agreementSettlement (mapping)
    //   21: acceptsContributions (mapping)
    //   22: unbondingPeriod (uint64) | minChallengeWindow (uint64) | hookGasCap (uint64)
    //       | forfeiturePaused (bool)            ← packed into one slot
    //   23: operatorRegistry (address)
    //   24: forfeitedUnits (mapping)
    //   25: mutuals (mapping)
    //   26: membership (mapping)
    //   27: nextMutualId (uint256)
    //   28: mutualLossProposals (mapping)
    //   29: mutualPremiumPool (mapping)
    //   30: totalMutualPremium (mapping)
    //   31: proposalToAgreement (mapping)
    //   32: proposalAcceptorStrategies (mapping)
    //   33: pausedAt (uint64) | cumulativePaused (uint64) | maxPauseDuration (uint64)
    //                                                   ← packed into one slot
    // =========================================================================

    function test_managerLayoutOffsets() public {
        ManagerStorageHarness h = new ManagerStorageHarness();
        h.poke();

        // Scalar id counters at offsets 6 / 15 / 18 / 27.
        assertEq(uint256(vm.load(address(h), bytes32(uint256(SLOT) + 6))), 42, "nextCommitmentId offset");
        assertEq(uint256(vm.load(address(h), bytes32(uint256(SLOT) + 15))), 43, "nextAgreementProposalId offset");
        assertEq(uint256(vm.load(address(h), bytes32(uint256(SLOT) + 18))), 44, "nextAgreementId offset");
        assertEq(uint256(vm.load(address(h), bytes32(uint256(SLOT) + 27))), 45, "nextMutualId offset");

        // Packed config slot at offset 22:
        //   bits   0..63  unbondingPeriod      = 7 days
        //   bits  64..127 minChallengeWindow   = 1 days
        //   bits 128..191 hookGasCap           = 500_000
        //   bits 192..199 forfeiturePaused       = true
        uint256 packed = uint256(vm.load(address(h), bytes32(uint256(SLOT) + 22)));
        assertEq(uint64(packed), 7 days, "unbondingPeriod bits");
        assertEq(uint64(packed >> 64), 1 days, "minChallengeWindow bits");
        assertEq(uint64(packed >> 128), 500_000, "hookGasCap bits");
        assertEq(uint8(packed >> 192), 1, "forfeiturePaused bit");

        // operatorRegistry alone at offset 23.
        assertEq(
            address(uint160(uint256(vm.load(address(h), bytes32(uint256(SLOT) + 23))))),
            address(0xBEEF),
            "operatorRegistry offset"
        );

        bytes32 poolSlot = keccak256(abi.encode(uint256(7), bytes32(uint256(SLOT) + 29)));
        assertEq(uint256(vm.load(address(h), poolSlot)), 123, "mutualPremiumPool @ offset 29");
        bytes32 aggSlot = keccak256(abi.encode(address(0xABCD), bytes32(uint256(SLOT) + 30)));
        assertEq(uint256(vm.load(address(h), aggSlot)), 456, "totalMutualPremium @ offset 30");
        bytes32 propToAgrSlot = keccak256(abi.encode(uint256(11), bytes32(uint256(SLOT) + 31)));
        assertEq(uint256(vm.load(address(h), propToAgrSlot)), 555, "proposalToAgreement @ offset 31");
        // The mapping entry is a dynamic array, so the derived entry slot stores its length.
        bytes32 acceptorStrategiesSlot = keccak256(abi.encode(uint256(15), bytes32(uint256(SLOT) + 32)));
        assertEq(uint256(vm.load(address(h), acceptorStrategiesSlot)), 1, "proposalAcceptorStrategies @ offset 32");

        // Pause budget: the three scalars pack into ONE slot at offset 33
        //   bits   0..63  pausedAt, bits 64..127 cumulativePaused, bits 128..191 maxPauseDuration
        uint256 pausePacked = uint256(vm.load(address(h), bytes32(uint256(SLOT) + 33)));
        assertEq(uint64(pausePacked), 1_000_001, "pausedAt bits @33");
        assertEq(uint64(pausePacked >> 64), 1_000_002, "cumulativePaused bits @33");
        assertEq(uint64(pausePacked >> 128), 1_000_003, "maxPauseDuration bits @33");

        // ForfeitProposal (offset 10): single packed slot — penaltyBps 0..15, initiatedAt 16..79,
        // executed 80..87, cancelled 88..95, cumulativePausedAtStart 96..159.
        bytes32 fpSlot = keccak256(abi.encode(uint256(13), bytes32(uint256(SLOT) + 10)));
        assertEq(uint64(uint256(vm.load(address(h), fpSlot)) >> 96), 91, "ForfeitProposal.cumulativePausedAtStart");

        // MutualLossProposal (offset 28): slot +3 — executed 0..7, cancelled 8..15,
        // cumulativePausedAtStart 16..79.
        bytes32 mlpBase = keccak256(abi.encode(uint256(14), bytes32(uint256(SLOT) + 28)));
        assertEq(
            uint64(uint256(vm.load(address(h), bytes32(uint256(mlpBase) + 3))) >> 16),
            92,
            "MutualLossProposal.cumulativePausedAtStart"
        );
    }

    /// @dev Word `i` of the struct stored under `key` in the mapping at layout offset `offset`.
    function _word(address h, uint256 key, uint256 offset, uint256 i) internal view returns (uint256) {
        bytes32 base = keccak256(abi.encode(key, bytes32(uint256(SLOT) + offset)));
        return uint256(vm.load(h, bytes32(uint256(base) + i)));
    }

    /// @notice Commitment (offset 5) packs into eight slots: each address carries small fields in
    ///         its upper 96 bits; the two pause snapshots share the last slot.
    function test_commitmentPacking() public {
        ManagerStorageHarness h = new ManagerStorageHarness();
        h.pokeStructs();
        address a = address(h);

        uint256 w = _word(a, 16, 5, 0);
        assertEq(address(uint160(w)), address(0xC1), "committer @0");
        assertEq(uint16(w >> 160), 7_500, "maxPenaltyBps @0 bits 160..175");
        assertEq(uint8(w >> 176), 1, "released @0 bits 176..183");
        assertEq(uint8(w >> 184), 1, "forfeited @0 bits 184..191");
        assertEq(uint64(w >> 192), 101, "closedAt @0 bits 192..255");
        w = _word(a, 16, 5, 1);
        assertEq(address(uint160(w)), address(0xC2), "arbiter @1");
        assertEq(uint64(w >> 160), 102, "challengeWindow @1 bits 160..223");
        w = _word(a, 16, 5, 2);
        assertEq(address(uint160(w)), address(0xC3), "counterparty @2");
        assertEq(uint64(w >> 160), 103, "createdAt @2 bits 160..223");
        w = _word(a, 16, 5, 3);
        assertEq(address(uint160(w)), address(0xC4), "token @3");
        assertEq(uint64(w >> 160), 104, "expiresAt @3 bits 160..223");
        w = _word(a, 16, 5, 4);
        assertEq(address(uint160(w)), address(0xC5), "adapter @4");
        assertEq(uint64(w >> 160), 105, "unbondInitiatedAt @4 bits 160..223");
        assertEq(_word(a, 16, 5, 5), 106, "amount @5");
        assertEq(_word(a, 16, 5, 6), 107, "metadataHash @6");
        w = _word(a, 16, 5, 7);
        assertEq(uint64(w), 108, "cumulativePausedAtStart @7 bits 0..63");
        assertEq(uint64(w >> 64), 109, "unbondCumulativePausedAtStart @7 bits 64..127");
        assertEq(_word(a, 16, 5, 8), 0, "nothing past slot 7");
    }

    /// @notice Membership (offset 26) packs into five slots: the id, loss snapshot and both exit
    ///         fields share the first.
    function test_membershipPacking() public {
        ManagerStorageHarness h = new ManagerStorageHarness();
        h.pokeStructs();
        address a = address(h);

        uint256 w = _word(a, 17, 26, 0);
        assertEq(uint64(w), 201, "mutualId @0 bits 0..63");
        assertEq(uint64(w >> 64), 202, "lossSnapshot @0 bits 64..127");
        assertEq(uint64(w >> 128), 203, "unbondRequestedAt @0 bits 128..191");
        assertEq(uint64(w >> 192), 204, "memberExitCumulativePausedAtStart @0 bits 192..255");
        assertEq(_word(a, 17, 26, 1), 205, "forfeitableUnits @1");
        assertEq(_word(a, 17, 26, 2), 206, "settledUnits @2");
        assertEq(_word(a, 17, 26, 3), 207, "premiumSnapshot @3");
        assertEq(_word(a, 17, 26, 4), 208, "rewardBank @4");
        assertEq(_word(a, 17, 26, 5), 0, "nothing past slot 4");
    }

    /// @notice Mutual (offset 25) packs into ten slots.
    function test_mutualPacking() public {
        ManagerStorageHarness h = new ManagerStorageHarness();
        h.pokeStructs();
        address a = address(h);

        uint256 w = _word(a, 1, 25, 0);
        assertEq(address(uint160(w)), address(0xD1), "arbiter @0");
        assertEq(uint64(w >> 160), 301, "challengeWindow @0 bits 160..223");
        assertEq(uint8(w >> 224), 1, "active @0 bits 224..231");
        assertEq(uint8(w >> 232), 1, "terminal @0 bits 232..239");
        w = _word(a, 1, 25, 1);
        assertEq(address(uint160(w)), address(0xD2), "numeraire @1");
        assertEq(uint64(w >> 160), 302, "deallocationWindow @1 bits 160..223");
        assertEq(address(uint160(_word(a, 1, 25, 2))), address(0xD3), "beneficiary @2");
        w = _word(a, 1, 25, 3);
        assertEq(uint128(w), 303, "totalShares @3 bits 0..127");
        assertEq(uint128(w >> 128), 304, "activeCover @3 bits 128..255");
        assertEq(_word(a, 1, 25, 4), 305, "cumulativeLoss @4");
        w = _word(a, 1, 25, 5);
        assertEq(uint128(w), 306, "rewardRate @5 bits 0..127");
        assertEq(uint64(w >> 128), 307, "lastUpdate @5 bits 128..191");
        assertEq(uint64(w >> 192), 308, "periodFinish @5 bits 192..255");
        assertEq(_word(a, 1, 25, 6), 309, "premiumPerShareStored @6");
        assertEq(_word(a, 1, 25, 7), 310, "settledTotal @7");
        assertEq(_word(a, 1, 25, 8), 311, "premiumRemainder @8");
        assertEq(_word(a, 1, 25, 9), 312, "bankedTotal @9");
        assertEq(_word(a, 1, 25, 10), 0, "nothing past slot 9");
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
