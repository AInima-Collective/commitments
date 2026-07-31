// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

/// @title ArbiterCapabilities
/// @notice Named bits for the {IArbiter} `arbiterCapabilities()` bitmap. Each
///         bit corresponds to a `CommitmentManager` action an arbiter can
///         dispatch. A caller introspecting an arbiter tests capabilities with
///         {has} before opting into (or requiring) a given power.
/// @dev Bits are stable and append-only — new capabilities take the next free
///      bit; existing assignments never move, so a stored/declared bitmap keeps
///      its meaning across releases. `pure`, no storage, zero deployment cost
///      (fully inlined).
library ArbiterCapabilities {
    /// @notice No capabilities (a pure marker / discovery-only arbiter).
    uint256 internal constant NONE = 0;

    // --- Commitment lifecycle ------------------------------------------------

    /// @notice Can open a forfeit proposal — `initiateForfeit(id, penaltyBps)`.
    uint256 internal constant INITIATE_FORFEIT = 1 << 0;
    /// @notice Can cancel a pending forfeit — `cancelForfeit(id)`.
    uint256 internal constant CANCEL_FORFEIT = 1 << 1;
    /// @notice Can release a commitment early — `releaseCommitment(id)`.
    uint256 internal constant RELEASE_COMMITMENT = 1 << 2;

    // --- Agreement lifecycle -------------------------------------------------

    /// @notice Can forfeit both legs of an agreement — `forfeitAgreement(id, bps)`.
    uint256 internal constant FORFEIT_AGREEMENT = 1 << 3;
    /// @notice Can release both legs of an agreement — `releaseAgreement(id)`.
    uint256 internal constant RELEASE_AGREEMENT = 1 << 4;
    /// @notice Can perform a bilateral settle within an agreement's flow caps —
    ///         `settleAgreement(id, fromProposer, units, evidenceHash)`.
    uint256 internal constant SETTLE_AGREEMENT = 1 << 5;

    // --- Mutual / shared-loss coverage ---------------------------------------

    /// @notice Can declare / activate a mutual loss — the arbiter drives the
    ///         mutual's optimistic loss lifecycle and the manager credits the
    ///         several-liability loss index Λ.
    uint256 internal constant MUTUAL_LOSS = 1 << 6;

    /// @notice Returns true iff `caps` has every bit in `mask` set. Passing a
    ///         single capability bit tests that one power; passing a combined
    ///         mask tests that all of them are present.
    function has(uint256 caps, uint256 mask) internal pure returns (bool) {
        return caps & mask == mask;
    }
}
