// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import {ICommitmentManager as ICM} from "src/core/interfaces/ICommitmentManager.sol";
import {CommitmentManagerStorage} from "src/core/manager/storage/CommitmentManagerStorage.sol";

/// @title LedgerLib
/// @notice The manager-internal ledger operations of ERC-COMMITMENTS §A.3, plus escrow
///         arithmetic. Internal library — inlined into every caller (the manager and the
///         external delegatecall libraries) so there is exactly one implementation of the
///         ledger arithmetic and the aggregate-counter bookkeeping.
/// @dev Every operation here conserves the manager's token balance exactly (no external
///      transfers), so the partition invariant (INV-1) holds trivially across each. These
///      operations are NOT expressible as TokenMovements and are never available to strategies.
library LedgerLib {
    /// @dev Encumber: free[user] -> encumbered[user]. Emits EncumbranceIncreased.
    function encumber(CommitmentManagerStorage.Layout storage s, address token, address user, uint256 units) internal {
        CommitmentManagerStorage.TokenLedger storage l = s.ledger[token][user];
        if (units > l.freeBalance) revert ICM.InsufficientFreeBalance(units, l.freeBalance);
        l.freeBalance -= units;
        l.encumberedBalance += units;
        s.totalFree[token] -= units;
        s.totalEncumbered[token] += units;
        emit ICM.EncumbranceIncreased(user, token, units);
    }

    /// @dev Release encumbrance: encumbered[user] -> free[user]. Emits EncumbranceReleased.
    ///      `commitmentId == 0` for the agreement-proposal-cancel path (no commitment exists).
    function releaseEncumbrance(
        CommitmentManagerStorage.Layout storage s,
        uint256 commitmentId,
        address token,
        address user,
        uint256 units
    ) internal {
        CommitmentManagerStorage.TokenLedger storage l = s.ledger[token][user];
        if (units > l.encumberedBalance) revert ICM.InsufficientEncumberedBalance(units, l.encumberedBalance);
        l.encumberedBalance -= units;
        l.freeBalance += units;
        s.totalEncumbered[token] -= units;
        s.totalFree[token] += units;
        emit ICM.EncumbranceReleased(commitmentId, user, token, units);
    }

    /// @dev Attribute encumbrance: free[contributor] -> encumbered[committer] (contributions).
    ///      Caller emits EncumbranceContributed with the commitment id.
    function attributeEncumbrance(
        CommitmentManagerStorage.Layout storage s,
        address token,
        address contributor,
        address committer,
        uint256 units
    ) internal {
        CommitmentManagerStorage.TokenLedger storage lc = s.ledger[token][contributor];
        if (units > lc.freeBalance) revert ICM.InsufficientFreeBalance(units, lc.freeBalance);
        lc.freeBalance -= units;
        s.ledger[token][committer].encumberedBalance += units;
        s.totalFree[token] -= units;
        s.totalEncumbered[token] += units;
    }

    /// @dev Forfeit transfer: encumbered[committer] -> free[recipient] (pull-payment forfeit payout,
    ///      ERC §C.3). Caller emits ForfeitExecuted.
    function forfeitTransfer(
        CommitmentManagerStorage.Layout storage s,
        address token,
        address committer,
        address recipient,
        uint256 units
    ) internal {
        CommitmentManagerStorage.TokenLedger storage lc = s.ledger[token][committer];
        if (units > lc.encumberedBalance) revert ICM.InsufficientEncumberedBalance(units, lc.encumberedBalance);
        lc.encumberedBalance -= units;
        s.ledger[token][recipient].freeBalance += units;
        s.totalEncumbered[token] -= units;
        s.totalFree[token] += units;
    }

    /// @dev Move encumbered[committer] into escrow[strategy] (FromEncumberedToEscrow movement).
    ///      Emits EncumbranceMovedToEscrow attributed to the commitment and strategy.
    function encumberedToEscrow(
        CommitmentManagerStorage.Layout storage s,
        uint256 commitmentId,
        address token,
        address committer,
        address strategy,
        uint256 units
    ) internal {
        CommitmentManagerStorage.TokenLedger storage lc = s.ledger[token][committer];
        if (units > lc.encumberedBalance) revert ICM.InsufficientEncumberedBalance(units, lc.encumberedBalance);
        lc.encumberedBalance -= units;
        s.escrow[strategy][token] += units;
        s.totalEncumbered[token] -= units;
        s.totalEscrow[token] += units;
        emit ICM.EncumbranceMovedToEscrow(commitmentId, strategy, token, units);
    }

    /// @dev Debit encumbered[committer] for an outbound external transfer
    ///      (FromEncumberedToExternal movement). The caller performs the token transfer.
    ///      Emits EncumbrancePaidExternal attributed to the commitment and strategy.
    function debitEncumberedForExternal(
        CommitmentManagerStorage.Layout storage s,
        uint256 commitmentId,
        address token,
        address committer,
        address strategy,
        uint256 units
    ) internal {
        CommitmentManagerStorage.TokenLedger storage lc = s.ledger[token][committer];
        if (units > lc.encumberedBalance) revert ICM.InsufficientEncumberedBalance(units, lc.encumberedBalance);
        lc.encumberedBalance -= units;
        s.totalEncumbered[token] -= units;
        emit ICM.EncumbrancePaidExternal(commitmentId, strategy, token, units);
    }

    /// @dev Debit escrow[strategy] and credit free[to] (FromEscrowToFree movement).
    function escrowToFree(
        CommitmentManagerStorage.Layout storage s,
        address strategy,
        address token,
        address to,
        uint256 units
    ) internal {
        uint256 bal = s.escrow[strategy][token];
        if (units > bal) revert ICM.InsufficientEscrow(units, bal);
        s.escrow[strategy][token] = bal - units;
        s.ledger[token][to].freeBalance += units;
        s.totalEscrow[token] -= units;
        s.totalFree[token] += units;
    }

    /// @dev Debit escrow[strategy] for an outbound external transfer (FromEscrowToExternal
    ///      movement). The caller performs the token transfer.
    function debitEscrowForExternal(
        CommitmentManagerStorage.Layout storage s,
        address strategy,
        address token,
        uint256 units
    ) internal {
        uint256 bal = s.escrow[strategy][token];
        if (units > bal) revert ICM.InsufficientEscrow(units, bal);
        s.escrow[strategy][token] = bal - units;
        s.totalEscrow[token] -= units;
    }

    // =========================================================================
    // Premium reserve — the FOURTH partition compartment (Mutuals premium)
    //
    // `mutualPremiumPool[mutualId]` is `funded − claimed` numeraire and is tracked by the per-token
    // `totalMutualPremium` aggregate. This single helper pair is the ONLY path that mutates the pool,
    // and each helper is balance-conserving (no external transfer), so the extended partition
    // invariant (INV-P1: totalFree + totalEncumbered + totalEscrow + totalMutualPremium == balanceOf)
    // holds trivially across each (INV-P0). The external measured-receipt PULL that brings numeraire
    // into the manager lives in MutualLib (it first credits the funder's free balance, which
    // `freeToMutualPremium` then moves into the pool), keeping LedgerLib transfer-free.
    // =========================================================================

    /// @dev Move free[from] -> mutualPremiumPool[mutualId] (premium funding credit). Balance-conserving:
    ///      totalFree decreases and totalMutualPremium increases by `units` (INV-P1 preserved).
    function freeToMutualPremium(
        CommitmentManagerStorage.Layout storage s,
        address token,
        address from,
        uint256 mutualId,
        uint256 units
    ) internal {
        CommitmentManagerStorage.TokenLedger storage l = s.ledger[token][from];
        if (units > l.freeBalance) revert ICM.InsufficientFreeBalance(units, l.freeBalance);
        l.freeBalance -= units;
        s.totalFree[token] -= units;
        s.mutualPremiumPool[mutualId] += units;
        s.totalMutualPremium[token] += units;
    }

    /// @dev Move mutualPremiumPool[mutualId] -> free[to] (premium claim / reclaim / terminal sweep —
    ///      the ONLY pool debit path). Balance-conserving: totalMutualPremium decreases and totalFree
    ///      increases by `units` (INV-P1 preserved). Reverts if the pool is short (cannot happen given
    ///      INV-P0/P2, but checked defensively against any future desync).
    function mutualPremiumToFree(
        CommitmentManagerStorage.Layout storage s,
        address token,
        address to,
        uint256 mutualId,
        uint256 units
    ) internal {
        uint256 pool = s.mutualPremiumPool[mutualId];
        if (units > pool) revert ICM.InsufficientMutualPremium(units, pool);
        s.mutualPremiumPool[mutualId] = pool - units;
        s.totalMutualPremium[token] -= units;
        s.ledger[token][to].freeBalance += units;
        s.totalFree[token] += units;
    }
}
