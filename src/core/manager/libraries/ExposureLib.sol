// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import {ICommitmentManager as ICM} from "src/core/interfaces/ICommitmentManager.sol";
import {CommitmentManagerStorage} from "src/core/manager/storage/CommitmentManagerStorage.sol";

/// @title ExposureLib
/// @notice Single source of truth for the per-(user, token) exposure arithmetic that backs the
///         allocation invariant INV-3 (`totalForfeitable <= totalEncumbered`). The arithmetic was
///         historically inlined at several call sites; the shared-loss mutual settle path needs the
///         *same* invariant honored under an **incremental, survive-and-rebase** decrement
///         (ERC-COMMITMENTS-MUTUALS), so the logic is lifted here and reused so the invariant lives in one
///         implementation.
/// @dev All functions are `internal` → inlined into the calling delegatecall library; no extra
///      delegatecall and no behavior change versus the previous inline arithmetic.
library ExposureLib {
    /// @notice The forfeitable exposure a lien of `amount` units at `penaltyBps` contributes:
    ///         `amount * penaltyBps / 10_000`. This is the *value* half of INV-3; keeping it beside
    ///         the storage-delta helpers keeps the whole exposure formula in one implementation
    ///         instead of inlined at every create / settle / forfeit site.
    function exposureOf(uint256 amount, uint16 penaltyBps) internal pure returns (uint256) {
        return (amount * penaltyBps) / 10_000;
    }

    /// @notice Add `encDelta` to encumbered and `forfDelta` to forfeitable (create / contribute).
    function increment(
        CommitmentManagerStorage.Layout storage s,
        address user,
        address token,
        uint256 encDelta,
        uint256 forfDelta
    ) internal {
        ICM.UserExposure storage ex = s.userExposures[user][token];
        ex.totalEncumbered += encDelta;
        ex.totalForfeitable += forfDelta;
    }

    /// @notice Subtract `encDelta` from encumbered and `forfDelta` from forfeitable. Used by the
    ///         terminal close / single-forfeit decrement (encDelta = amount, forfDelta = exposure)
    ///         and by the mutual-aware terminal close (encDelta = residual, forfDelta = remaining).
    function decrement(
        CommitmentManagerStorage.Layout storage s,
        address user,
        address token,
        uint256 encDelta,
        uint256 forfDelta
    ) internal {
        ICM.UserExposure storage ex = s.userExposures[user][token];
        ex.totalEncumbered -= encDelta;
        ex.totalForfeitable -= forfDelta;
    }

    /// @notice Incremental mutual-settle decrement: move **both** legs by the same `owedUnits`
    ///         (ERC-COMMITMENTS-MUTUALS INV-G9). Because the forfeited units are drawn entirely from the member's
    ///         frozen forfeitable allotment `E_i`, the per-commitment gap
    ///         `(encumbered − forfeitable) = amount_join − E_i` is preserved across every settle,
    ///         so the aggregate INV-3 holds by construction even for a user simultaneously backing
    ///         other high-penalty commitments on the same token.
    function decrementForfeited(
        CommitmentManagerStorage.Layout storage s,
        address user,
        address token,
        uint256 owedUnits
    ) internal {
        decrement(s, user, token, owedUnits, owedUnits);
    }
}
