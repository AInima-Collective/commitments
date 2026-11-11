// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import {ICommitmentManager as ICM} from "src/core/interfaces/ICommitmentManager.sol";
import {CommitmentManagerStorage} from "src/core/manager/storage/CommitmentManagerStorage.sol";
import {BPS_DENOMINATOR} from "src/shared/Constants.sol";

/// @title ExposureLib
/// @notice Single source of truth for the per-(user, token) forfeitable exposure that backs the
///         allocation invariant INV-3 (`totalForfeitable <= encumberedBalance`). The encumbered side
///         is the custody ledger itself; this library keeps only the forfeitable side.
/// @dev INV-3 holds by construction, so nothing checks it with a revert: every lien adds at most its
///      own amount (`maxPenaltyBps <= 10_000`), and every later writer keeps a lien's forfeitable
///      share at most its live amount (the diff rule in `resize`, the mutual settle moving both
///      sides by the same units). All functions are `internal`, inlined into the calling library.
library ExposureLib {
    /// @notice The forfeitable exposure a lien of `amount` units at `penaltyBps` contributes:
    ///         `amount * penaltyBps / 10_000`.
    function exposureOf(uint256 amount, uint16 penaltyBps) internal pure returns (uint256) {
        return (amount * penaltyBps) / BPS_DENOMINATOR;
    }

    /// @notice Add `forfDelta` to the user's forfeitable exposure (create / propose / accept).
    function increment(CommitmentManagerStorage.Layout storage s, address user, address token, uint256 forfDelta)
        internal
    {
        s.userForfeitable[user][token] += forfDelta;
    }

    /// @notice Subtract `forfDelta` from the user's forfeitable exposure. Used by the terminal close /
    ///         single forfeit (the lien's whole exposure), the mutual settle (`owedUnits`) and the
    ///         mutual-aware terminal close (the remaining liability).
    function decrement(CommitmentManagerStorage.Layout storage s, address user, address token, uint256 forfDelta)
        internal
    {
        s.userForfeitable[user][token] -= forfDelta;
    }

    /// @notice Set a live lien's `amount` and move the committer's forfeitable exposure by the
    ///         exposure diff (the dust-free diff rule: never recomputed from the moved units). A
    ///         shrink is clamped at zero as a defence against drift.
    function resize(CommitmentManagerStorage.Layout storage s, ICM.Commitment storage c, uint256 newAmount) internal {
        uint256 pre = exposureOf(c.amount, c.maxPenaltyBps);
        uint256 post = exposureOf(newAmount, c.maxPenaltyBps);
        c.amount = newAmount;
        mapping(address => uint256) storage forfeitable = s.userForfeitable[c.committer];
        if (post >= pre) {
            forfeitable[c.token] += post - pre;
        } else {
            uint256 cur = forfeitable[c.token];
            uint256 dec = pre - post;
            forfeitable[c.token] = dec > cur ? 0 : cur - dec;
        }
    }
}
