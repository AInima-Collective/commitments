// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import {CommitmentManager} from "src/core/manager/CommitmentManager.sol";
import {CommitmentManagerStorage} from "src/core/manager/storage/CommitmentManagerStorage.sol";

/// @title CommitmentManagerHarness — Certora scene root
/// @notice Extends the manager with view accessors the specs need but the
///         production surface doesn't expose: the per-token mutual-pool
///         aggregate (compartment 4 of the INV-P1 partition). The
///         production contract sits at the EIP-170 ceiling, so these live in
///         a harness rather than the manager — the prover doesn't enforce
///         deploy size, and the harness storage layout is byte-identical
///         (EIP-7201, no new state).
contract CommitmentManagerHarness is CommitmentManager {
    /// @notice Compartment 4: Σ mutualPremiumPool over mutuals with numeraire == `token`.
    function totalMutualPremiumOf(address token) external view returns (uint256) {
        return CommitmentManagerStorage.layout().totalMutualPremium[token];
    }

    /// @notice Id-counter accessor for the INV-10 initialized-state discharge
    ///         (ids are 1-indexed; initialize() seeds the counter to 1).
    function nextCommitmentIdOf() external view returns (uint256) {
        return CommitmentManagerStorage.layout().nextCommitmentId;
    }

    /// @notice Base-three aggregates, exposed individually (CVL-friendlier than the tuple).
    function totalFreeOf(address token) external view returns (uint256) {
        return CommitmentManagerStorage.layout().totalFree[token];
    }

    function totalEncumberedOf(address token) external view returns (uint256) {
        return CommitmentManagerStorage.layout().totalEncumbered[token];
    }

    function totalEscrowOf(address token) external view returns (uint256) {
        return CommitmentManagerStorage.layout().totalEscrow[token];
    }

    /// @notice EIP-1153 reentrancy-guard state, exposed for CVL. Plain rules
    ///         start from havoc'd transient storage, but a fresh transaction
    ///         always begins with the guard clear (EIP-1153 clears transient
    ///         storage at transaction end) — liveness rules discharge the
    ///         spurious guard-set start state with `require
    ///         !reentrancyGuardEntered()` (run-260713 triage family B).
    function reentrancyGuardEntered() external view returns (bool) {
        return _reentrancyGuardEntered();
    }

    /// @notice `creditablePaused()` snapshot taken at unbond initiation — the
    ///         clock-stop anchor finalizeUnbondCore prices maturity against
    ///         (ERC §A.6 erratum). Exposed so P1-LIVE states maturity in
    ///         effective time exactly as the code computes it.
    function unbondPauseSnapshotOf(uint256 commitmentId) external view returns (uint64) {
        return CommitmentManagerStorage.layout().commitments[commitmentId].unbondCumulativePausedAtStart;
    }
}
