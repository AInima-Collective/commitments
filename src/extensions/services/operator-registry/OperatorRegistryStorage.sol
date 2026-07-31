// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import {IOperatorRegistry} from "src/extensions/services/interfaces/IOperatorRegistry.sol";

/// @title OperatorRegistryStorage
/// @notice namespaced storage layout for OperatorRegistry.
/// @dev All state for OperatorRegistry is stored in this struct at STORAGE_SLOT to avoid
///      proxy storage collisions. Pattern mirrors CommitmentManagerStorage.
library OperatorRegistryStorage {
    /// @dev keccak256(abi.encode(uint256(keccak256("commitments.operator.registry.storage")) - 1)) & ~bytes32(uint256(0xff))
    bytes32 internal constant STORAGE_SLOT = 0x83d5bdd6649c092a3cc3f74173bd8a8b92b77fc20c5209255a250e7126463700;

    /// @notice A single timestamped stake checkpoint for an operator.
    /// @dev Packs into ONE storage slot: `timestamp` (64) + `stake` (192) = 256 bits.
    ///      `stake` mirrors `Operator.totalDelegatedStake` at `timestamp`. `uint192` is a
    ///      practical, non-truncating bound for stake denominated in a real ERC-20's raw
    ///      units (max ≈ 6.3e57); `_pushStakeCheckpoint` reverts (`StakeCheckpointOverflow`)
    ///      rather than silently truncate if that bound is ever exceeded.
    struct StakeCheckpoint {
        uint64 timestamp;
        uint192 stake;
    }

    /// @notice Append-only, timestamp-keyed checkpoint trace for one operator.
    /// @dev Mapping-backed (not a dynamic array) so each checkpoint has a stable index pointer
    ///      and a same-block rewrite is a clean in-place overwrite of the tail slot. Checkpoints
    ///      are strictly increasing in `timestamp` (same-block mutations collapse onto the tail),
    ///      which makes `stakeAt`'s hint validation and binary-search fallback well-defined.
    struct StakeTrace {
        uint256 length;
        mapping(uint256 => StakeCheckpoint) points;
    }

    struct Layout {
        // =====================================================================
        // Operator registry
        // =====================================================================

        /// @dev operator address -> Operator struct
        mapping(address => IOperatorRegistry.Operator) operators;

        /// @dev Enumerable list of active operator addresses (for getOperatorSet)
        address[] operatorList;

        /// @dev operator address -> index in operatorList (for O(1) removal)
        mapping(address => uint256) operatorListIndex;

        // =====================================================================
        // Delegation routing
        // =====================================================================

        /// @dev commitmentId -> operator address (for hook routing from CommitmentManager)
        mapping(uint256 => address) commitmentToOperator;

        /// @dev commitmentId -> staker address (for delegation release tracking)
        mapping(uint256 => address) commitmentToStaker;

        // =====================================================================
        // Configuration
        // =====================================================================

        /// @dev Minimum vault shares required to register as an operator
        uint256 minOperatorStake;

        /// @dev Maximum number of active delegations per operator
        uint256 maxDelegationsPerOperator;

        /// @dev Authorized caller for onDelegation* hooks (CommitmentManager address)
        address commitmentManager;

        // =====================================================================
        // Operator metadata sidecar
        // =====================================================================

        /// @dev operator address -> OperatorMetadata sidecar record.
        ///      Kept separate from Operator so setOperatorMetadata does not touch
        ///      the slots used by isOperator getOperatorStake getOperatorSet.
        ///      Metadata persists across deregister (locked decision: historical record).
        mapping(address => IOperatorRegistry.OperatorMetadata) operatorMetadata;

        // =====================================================================
        // Acceptance policy
        // =====================================================================

        /// @dev Required arbiter address. Commitments presented to register or
        ///      delegate must have exactly this arbiter. Set at init (or via
        ///      initializeV2 for upgrades). Immutable post-init by design — rotating
        ///      the arbiter is a trust transition that warrants a redeploy.
        address requiredArbiter;

        /// @dev Minimum `maxPenaltyBps` a commitment must carry to be accepted.
        ///      Tightenable by admin via tightenPolicy (raise-only). Forward-looking:
        ///      raising the floor does NOT eject already-registered operators whose
        ///      old commitments fall below the new floor.
        uint16 minMaxPenaltyBps;

        // =====================================================================
        // Snapshot of registered commitment.amount
        // =====================================================================

        /// @dev commitmentId -> the `commitment.amount` snapshotted at the time
        ///      `register` `delegate` accepted it. The runtime `c.amount` may
        ///      shrink (strategy movements) between registration and close, so
        ///      the registry must decrement `totalDelegatedStake` by the amount
        ///      it originally added — not the runtime amount, which would leave
        ///      phantom stake. Append-only — safe.
        mapping(uint256 => uint256) registeredAmount;

        // =====================================================================
        // Acceptance policy — required backing token
        // =====================================================================

        /// @dev Required backing token. Commitments presented to register or
        ///      delegate must carry exactly this `token` — stake quantities
        ///      (`minOperatorStake`, `totalDelegatedStake`) are denominated in
        ///      its raw units and would be incoherent across tokens. Set at
        ///      init; immutable post-init by design (a token change is a trust
        ///      transition that warrants a redeploy).
        address requiredToken;
        // =====================================================================
        // Mesh wiring — append-only
        // =====================================================================

        /// @dev TokenWeighting sink this registry feeds (registry is its provider).
        ///      address(0) ⇒ mesh wiring disabled; all mesh sync is a no-op so the
        ///      registry works standalone. Set once via setMeshWiring.
        address tokenWeighting;
        /// @dev MeshFactory used to lazily clone a per-operator FanIn node.
        address meshFactory;
        /// @dev operator address -> its per-operator FanInNode clone (consumer =
        ///      tokenWeighting, manager = this registry). Deployed lazily on first
        ///      register; aggregates the operator's self-stake + all delegations into
        ///      the single stakeDenom this registry credits.
        mapping(address => address) operatorFanIn;
        // =====================================================================
        // Tracked-commitment counter — append-only
        // =====================================================================

        /// @dev Number of commitments with live hook routing (register/delegate
        ///      increments; release/forfeit hooks and deregister's self-stake
        ///      cleanup decrement). Consulted by the manager's
        ///      `setOperatorRegistry` guard so re-pointing the single hook slot
        ///      cannot silently orphan live delegations. NOTE: counts only
        ///      commitments accepted after this field shipped — pre-upgrade
        ///      routing entries are not retro-counted (decrements clamp at 0).
        uint256 trackedCommitmentCount;
        // =====================================================================
        // EIP-712 signature-delegated register/delegate — append-only
        // =====================================================================

        /// @dev Per-signer nonce consumed by `registerWithSig`/`delegateWithSig`. A signed
        ///      intent must carry the signer's current nonce, which is then incremented
        ///      (strict-equality replay protection). `increaseNonce` lets a signer bump their
        ///      nonce to invalidate an outstanding signature. Append-only — safe.
        mapping(address => uint256) sigNonces;

        /// @dev account -> block number of its most recent register/deregister toggle. A
        ///      same-block cooldown reads this to block a register⇄deregister flip inside a
        ///      single block (cheap anti-grief, same spirit as the forfeit challenge window).
        ///      Append-only — safe.
        mapping(address => uint64) lastToggleBlock;
        // =====================================================================
        // Safe-strategy allow-list (operator commission) — append-only
        // =====================================================================

        /// @dev Distribution strategies the admin has vetted as safe to bind on
        ///      register/delegate commitments. The blanket `StrategiesNotAllowed`
        ///      ban exists because encumbrance-draining movements (`FromEncumbered*`)
        ///      shrink `c.amount` and leave phantom `totalDelegatedStake`.
        ///      Self-custody strategies (e.g. OperatorCommissionCoupon) return
        ///      no movements and never drain, so the admin may allow-list them to let
        ///      a delegator route commission to the operator. Admins MUST only
        ///      allow-list non-draining strategies. Empty (the default) ⇒ the
        ///      original reject-all behavior. Append-only — safe.
        mapping(address => bool) allowedStrategies;
        // =====================================================================
        // Historical stake checkpoints (stakeAt) — append-only
        // =====================================================================

        /// @dev operator address -> timestamped checkpoint trace of its
        ///      `totalDelegatedStake`. A checkpoint is pushed on EVERY stake
        ///      mutation (register, delegate, onDelegationReleased,
        ///      onDelegationForfeited) keyed by `block.timestamp`, so `stakeAt`
        ///      can answer historically-correct past-stake queries on-chain
        ///      (arbiters adjudicating an offense at time T, epoch/snapshot
        ///      rewards, disputes where stake-at-offense ≠ stake-now).
        ///
        ///      This is a SEPARATE, timestamp-keyed path from TokenWeighting's
        ///      OZ Checkpoints (block-number-keyed for governance votes) and
        ///      from the per-commitment `registeredAmount` freeze — the latter
        ///      snapshots ONE commitment's credited amount so release/forfeit
        ///      hooks decrement the exact value they added, whereas this trace
        ///      records the operator's AGGREGATE stake over time. The two are
        ///      complementary and both remain live. Append-only — safe.
        mapping(address => StakeTrace) operatorStakeTrace;
    }

    /// @notice Returns a storage reference to the Layout struct at STORAGE_SLOT.
    function layout() internal pure returns (Layout storage s) {
        bytes32 slot = STORAGE_SLOT;
        assembly {
            s.slot := slot
        }
    }
}
