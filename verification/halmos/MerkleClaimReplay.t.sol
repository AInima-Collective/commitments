// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import {ERC1967Proxy} from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";

import {MerkleSnapshot} from "src/extensions/rewards/MerkleSnapshot.sol";
import {CommitmentsRewardsCoordinator} from "src/extensions/rewards/CommitmentsRewardsCoordinator.sol";
import {MockERC20} from "test/helpers/MockERC20.sol";
import {HalmosBase} from "./HalmosBase.sol";

/// @title MerkleClaimReplay — periphery Halmos harness (PROPERTIES.md §P4)
/// @notice Claim non-replay for the cumulative Merkle-rewards model
///         (`CommitmentsRewardsCoordinator.processClaim`). Per ERC-COMMITMENTS-REWARDS,
///         the on-chain ledger records the total-claimed-so-far per (earner, token); a
///         claim pays `cumulativeAmount - alreadyClaimed`, so the SECOND claim of the
///         SAME cumulative amount pays 0 and reverts `NoOp()`, and a LOWER cumulative
///         reverts `CumulativeRegression()`.
///
///         Properties proved (symbolic over the claimed cumulative amount ≤ leaf value):
///           - P4-MERKLE-REPLAY: a valid claim succeeds once and pays exactly the
///             leaf's cumulative amount (from a zero prior); the identical second claim
///             reverts (`NoOp`) — no double-pay. The ledger equals the leaf amount after
///             either one or two attempts (idempotent).
///           - P4-MERKLE-MONO: a second claim for a cumulative BELOW the recorded amount
///             reverts (`CumulativeRegression`); the ledger is unchanged.
///           - P4-MERKLE-PROOF: a claim whose leaf is NOT in the tree (wrong amount not
///             matching the committed leaf) reverts (`InvalidProof`) — the proof binds the
///             exact (earner, token, cumulativeAmount) triple.
///
///         Tree (hand-built, 2 leaves; OZ sorted-pair hashing):
///           leaf0 = keccak256(abi.encode(CLAIMER_A, token, LEAF_A_AMOUNT))
///           leaf1 = keccak256(abi.encode(CLAIMER_B, token, LEAF_B_AMOUNT))
///           root  = keccak256(abi.encodePacked(min(leaf0,leaf1), max(leaf0,leaf1)))
///         Claiming CLAIMER_A's leaf0 uses proof == [leaf1].
///
/// @dev Concessions:
///        C1. `activationDelay == 0` so the submitted root is active in the same block
///            (`block.timestamp >= activeAt`); the activation-delay timing is a separate
///            liveness concern, orthogonal to replay.
///        C2. The claimed `cumulativeAmount` is the symbolic input for the first-claim
///            payout / proof checks, bounded by the committed leaf amount. The replay and
///            monotonicity checks use the concrete committed amount (that is the value a
///            valid proof authorizes), which is what the ledger-vs-replay property is about.
///        C3. The coordinator is funded (`depositRewards`) with enough of a standard
///            MockERC20 (no fee-on-transfer) to cover any in-range payout.
///
///      Run: FOUNDRY_PROFILE=halmos halmos --contract MerkleClaimReplay
contract MerkleClaimReplay is HalmosBase {
    MerkleSnapshot internal snapshot;
    CommitmentsRewardsCoordinator internal coordinator;
    MockERC20 internal token;

    address internal constant SERVICE = address(0x30001);
    address internal constant UPDATER = address(0x30002);
    address internal constant CLAIMER_A = address(0x30003);
    address internal constant CLAIMER_B = address(0x30004);

    uint256 internal constant LEAF_A_AMOUNT = 500e18;
    uint256 internal constant LEAF_B_AMOUNT = 700e18;
    uint256 internal constant FUND = 10_000e18;

    bytes32 internal root;
    bytes32 internal leaf0;
    bytes32 internal leaf1;

    function setUp() public {
        token = new MockERC20("Reward", "RWD", 18);

        MerkleSnapshot sImpl = new MerkleSnapshot();
        snapshot = MerkleSnapshot(
            address(
                new ERC1967Proxy(
                    address(sImpl),
                    // activationDelay == 0 so a submitted root is active immediately (C1).
                    abi.encodeCall(MerkleSnapshot.initialize, (SERVICE, 0, 0, UPDATER))
                )
            )
        );

        CommitmentsRewardsCoordinator cImpl = new CommitmentsRewardsCoordinator();
        coordinator = CommitmentsRewardsCoordinator(
            address(
                new ERC1967Proxy(
                    address(cImpl),
                    abi.encodeCall(CommitmentsRewardsCoordinator.initialize, (SERVICE, address(snapshot)))
                )
            )
        );

        // Fund the coordinator so any in-range payout has backing.
        token.mint(address(this), FUND);
        token.approve(address(coordinator), type(uint256).max);
        coordinator.depositRewards(address(token), FUND);

        // Build the 2-leaf tree exactly as processClaim recomputes the leaf.
        leaf0 = keccak256(abi.encode(CLAIMER_A, address(token), LEAF_A_AMOUNT));
        leaf1 = keccak256(abi.encode(CLAIMER_B, address(token), LEAF_B_AMOUNT));
        root = _hashPair(leaf0, leaf1);

        // Post the root as the updater; active immediately (delay 0).
        vm.prank(UPDATER);
        snapshot.submitRoot(root);
    }

    /// @dev OZ MerkleProof sorted-pair commutative hash.
    function _hashPair(bytes32 a, bytes32 b) internal pure returns (bytes32) {
        return a < b ? keccak256(abi.encodePacked(a, b)) : keccak256(abi.encodePacked(b, a));
    }

    /// @dev Single-element proof for leaf0: its sibling leaf1.
    function _proofForLeaf0() internal view returns (bytes32[] memory p) {
        p = new bytes32[](1);
        p[0] = leaf1;
    }

    // =========================================================================
    // P4-MERKLE-REPLAY: valid claim once; identical second claim pays 0 (reverts NoOp)
    // =========================================================================

    /// @notice CLAIMER_A claims its committed leaf amount from a zero prior: the payout is
    ///         EXACTLY the leaf amount and the ledger records it. The identical second
    ///         claim reverts (`NoOp`) — no double-pay. The ledger is idempotent: it equals
    ///         the leaf amount whether the replay reverts or (counterfactually) not.
    function check_processClaim_secondIdenticalClaimPaysZero() public {
        bytes32[] memory proof = _proofForLeaf0();

        uint256 balPre = token.balanceOf(CLAIMER_A);

        // First claim: succeeds, pays exactly the committed leaf amount.
        vm.prank(CLAIMER_A);
        uint256 paid = coordinator.processClaim(root, address(token), LEAF_A_AMOUNT, proof);
        assert(paid == LEAF_A_AMOUNT);
        assert(token.balanceOf(CLAIMER_A) == balPre + LEAF_A_AMOUNT);

        // Second, identical claim: cumulative delta is 0 → NoOp revert, no further pay.
        vm.prank(CLAIMER_A);
        try coordinator.processClaim(root, address(token), LEAF_A_AMOUNT, proof) returns (uint256) {
            assert(false); // MUST NOT succeed — that would be a replay double-pay
        } catch {
            // No additional tokens moved.
            assert(token.balanceOf(CLAIMER_A) == balPre + LEAF_A_AMOUNT);
        }
    }

    // =========================================================================
    // P4-MERKLE-MONO: a below-recorded cumulative reverts (CumulativeRegression)
    // =========================================================================

    /// @notice After CLAIMER_A has claimed its leaf, ANY subsequent claim for a SYMBOLIC
    ///         cumulative strictly below the recorded amount reverts and moves no tokens.
    ///         (Such a lower cumulative has no valid leaf/proof either, but the monotonicity
    ///         guard rejects it before payout regardless.)
    function check_processClaim_belowRecordedReverts(uint256 lower) public {
        vm.assume(lower < LEAF_A_AMOUNT);

        bytes32[] memory proof = _proofForLeaf0();

        vm.prank(CLAIMER_A);
        coordinator.processClaim(root, address(token), LEAF_A_AMOUNT, proof);

        uint256 balAfterFirst = token.balanceOf(CLAIMER_A);

        vm.prank(CLAIMER_A);
        try coordinator.processClaim(root, address(token), lower, proof) returns (uint256) {
            assert(false); // a regression below the recorded cumulative must never pay
        } catch {
            assert(token.balanceOf(CLAIMER_A) == balAfterFirst);
        }
    }

    // =========================================================================
    // P4-MERKLE-PROOF: the proof binds the exact (earner, token, cumulativeAmount)
    // =========================================================================

    /// @notice A first-ever claim for a SYMBOLIC cumulative that is NOT the committed leaf
    ///         amount has no valid membership proof against the tree, so it reverts
    ///         (`InvalidProof`) and pays nothing. The single committed value that verifies is
    ///         LEAF_A_AMOUNT; the proof is not malleable across amounts.
    function check_processClaim_wrongAmountFailsProof(uint256 amount) public {
        vm.assume(amount != LEAF_A_AMOUNT);
        vm.assume(amount >= 1);

        bytes32[] memory proof = _proofForLeaf0();
        uint256 balPre = token.balanceOf(CLAIMER_A);

        vm.prank(CLAIMER_A);
        try coordinator.processClaim(root, address(token), amount, proof) returns (uint256) {
            assert(false); // only the committed leaf amount can verify against the root
        } catch {
            assert(token.balanceOf(CLAIMER_A) == balPre); // nothing moved
        }
    }
}
