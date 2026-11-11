// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import {ICommitmentManager} from "src/core/interfaces/ICommitmentManager.sol";
import {StrategyBinding} from "src/core/interfaces/IDistributionStrategy.sol";

/// @title CommitmentManagerStorage
/// @notice EIP-7201 namespaced storage layout for CommitmentManager.
/// @dev All state lives in this struct at STORAGE_SLOT to avoid proxy storage collisions.
///      `test/manager/StorageSlots.t.sol` locks the slot constant and probes field offsets — run
///      it after any change to this file.
library CommitmentManagerStorage {
    /// @dev keccak256(abi.encode(uint256(keccak256("commitments.manager.storage")) - 1)) & ~bytes32(uint256(0xff))
    bytes32 internal constant STORAGE_SLOT = 0x088c82aa976aa63e8a80c9839988524f50fb04228a27fd9edf26e1e6206df800;

    /// @notice Per-(token, user) custody ledger entry (ERC §A.1).
    struct TokenLedger {
        uint256 freeBalance;
        uint256 encumberedBalance;
    }

    struct Layout {
        // =====================================================================
        // Part A — custody ledger (field offsets 0..4)
        // =====================================================================
        /// @dev token => user => { free, encumbered }
        mapping(address => mapping(address => TokenLedger)) ledger;
        /// @dev strategy => token => escrow balance (ERC §A.4)
        mapping(address => mapping(address => uint256)) escrow;
        /// @dev Per-token aggregate counters for O(1) partition-invariant checks (ERC §A.5).
        mapping(address => uint256) totalFree;
        mapping(address => uint256) totalEncumbered;
        mapping(address => uint256) totalEscrow;
        // =====================================================================
        // Part C — commitments (offsets 5..12)
        // =====================================================================
        /// @dev commitmentId => Commitment (its close, unbond and pause-snapshot fields included)
        mapping(uint256 => ICommitmentManager.Commitment) commitments;
        /// @dev Next commitment id. Initialized to 1: id 0 is the DistributionPaid
        ///      non-attribution sentinel and MUST never identify a commitment (INV-10).
        uint256 nextCommitmentId;
        /// @dev commitmentId => bound strategies, in binding order (immutable post-create).
        ///      Binding params are NOT persisted (ERC §C.1) — strategies persist their own.
        mapping(uint256 => address[]) commitmentStrategies;
        /// @dev commitmentId => strategy => bound? (O(1) membership for distribute/claim).
        mapping(uint256 => mapping(address => bool)) isBoundStrategy;
        /// @dev commitmentId => strategy => selector of a failed guarded hook (0 = none).
        ///      Set on StrategyHookFailed, cleared by a successful sweepFailedHook re-drive.
        mapping(uint256 => mapping(address => bytes4)) failedHookSelector;
        /// @dev commitmentId => active ForfeitProposal (at most one active per commitment, INV-7)
        mapping(uint256 => ICommitmentManager.ForfeitProposal) forfeitProposals;
        /// @dev user => token => Σ forfeitable exposure over the user's live liens (INV-3 is keyed per
        ///      (user, token)). The encumbered side of INV-3 is `ledger[token][user].encumberedBalance`.
        mapping(address => mapping(address => uint256)) userForfeitable;
        /// @dev committer => sequential nonce for createCommitmentFor replay protection
        mapping(address => uint256) nonces;
        // =====================================================================
        // Agreements extension (offsets 13..20)
        // =====================================================================
        /// @dev proposalId => AgreementProposal
        mapping(uint256 => ICommitmentManager.AgreementProposal) agreementProposals;
        /// @dev proposalId => symmetric strategy bindings, applied to both legs at accept.
        ///      Transient by design: bindings are consumed at accept and the per-leg params
        ///      flow to strategies via CreatedContext, not via commitment storage.
        mapping(uint256 => StrategyBinding[]) proposalStrategies;
        /// @dev Next agreement proposal id (1-indexed, mirroring commitment ids).
        uint256 nextAgreementProposalId;
        /// @dev agreementId => [commitmentIdA, commitmentIdB]
        mapping(uint256 => uint256[2]) agreementPairs;
        /// @dev commitmentId => agreementId (0 = not agreed; ids are 1-indexed)
        mapping(uint256 => uint256) commitmentToAgreement;
        /// @dev Next agreement id (1-indexed)
        uint256 nextAgreementId;
        /// @dev proposalId => settlement caps consented to at proposal time (zero = disabled)
        mapping(uint256 => ICommitmentManager.AgreementSettlement) proposalCaps;
        /// @dev agreementId => live caps + cumulative-flow counters (INV-E1)
        mapping(uint256 => ICommitmentManager.AgreementSettlement) agreementSettlement;
        // =====================================================================
        // Contributions (offset 21)
        // =====================================================================
        /// @dev commitmentId => accepts third-party contributeEncumbered calls (ERC §C.6)
        mapping(uint256 => bool) acceptsContributions;
        // =====================================================================
        // Config (offsets 22..23; the four scalars pack into one slot)
        // =====================================================================
        /// @dev Committer-unbond period in seconds. Set at initialize; setUnbondingPeriod rejects 0
        ///      (ZeroAmount), so this is always > 0 — there is no lazy default.
        uint64 unbondingPeriod;
        /// @dev Minimum challenge window. Set to 1 day at initialize; the setter rejects anything lower.
        uint64 minChallengeWindow;
        /// @dev Per-hook gas cap for guarded lifecycle hooks. Set to the 500k floor at initialize; the
        ///      setter rejects anything lower.
        uint64 hookGasCap;
        /// @dev Circuit breaker: executeForfeit reverts while true (ERC §A.6).
        bool forfeiturePaused;
        /// @dev Optional operator registry for delegation hooks (mesh extension).
        address operatorRegistry;
        // =====================================================================
        // Part D bookkeeping (offset 24)
        // =====================================================================
        /// @dev commitmentId => units forfeited at executeForfeit. Persisted so sweepFailedHook can
        ///      reconstruct the exact ForfeitContext when re-driving a failed onCommitmentForfeited.
        mapping(uint256 => uint256) forfeitedUnits;
        // =====================================================================
        // Shared-loss mutuals (Mutual extension; offsets 25..28)
        // =====================================================================
        /// @dev mutualId => Mutual header. Mutual ids are 1-indexed (`initialize` seeds
        ///      `nextMutualId` to 1): id 0 is the Membership "not-a-member" sentinel.
        mapping(uint256 => ICommitmentManager.Mutual) mutuals;
        /// @dev commitmentId => Membership (sparse; `mutualId == 0` means not a member). A
        ///      commitment is bound to at most one mutual, non-rebindable (INV-G6).
        mapping(uint256 => ICommitmentManager.Membership) membership;
        /// @dev Next mutual id, seeded to 1 in `initialize`.
        uint256 nextMutualId;
        /// @dev mutualId => pending two-phase mutual-loss declaration (at most one active).
        mapping(uint256 => ICommitmentManager.MutualLossProposal) mutualLossProposals;
        // =====================================================================
        // Premium index (Mutual reward side; offsets 29..30)
        //
        // The reward half of the Mutual. `mutualPremiumPool` is a genuine FOURTH
        // partition compartment (alongside free / encumbered / escrow): it holds `funded − claimed`
        // numeraire per mutual and is tracked by the per-token `totalMutualPremium` aggregate so the
        // O(1) extended partition check (INV-P1) stays closed. Both are mutated ONLY through the
        // LedgerLib `freeToMutualPremium` / `mutualPremiumToFree` helper pair (INV-P0).
        // =====================================================================
        /// @dev mutualId => premium reserve (`funded − claimed`, the 4th INV-P1 compartment). Credited
        ///      only in `fundMutualPremium`; debited only in `claimMemberPremium` / `reclaimPremium` /
        ///      terminal-sweep. `_pokePremium` NEVER writes it (INV-P0).
        mapping(uint256 => uint256) mutualPremiumPool;
        /// @dev numeraire token => Σ mutualPremiumPool over mutuals with that numeraire. The O(1)
        ///      aggregate that lets INV-P1 (`totalFree + totalEncumbered + totalEscrow +
        ///      totalMutualPremium == balanceOf`) be checked without iterating mutuals.
        mapping(address => uint256) totalMutualPremium;
        // =====================================================================
        // Agreements — proposal → agreement reverse index (offset 31)
        // =====================================================================
        /// @dev proposalId => agreementId (0 = proposal never accepted; ids are 1-indexed). The
        ///      reverse of the accept-time link, so a proposer/indexer can resolve the agreement a
        ///      proposal produced without scanning `AgreementAccepted` logs. Written once, at accept.
        mapping(uint256 => uint256) proposalToAgreement;
        // =====================================================================
        // Agreements — per-leg (acceptor) strategy bindings (offset 32)
        // =====================================================================
        /// @dev proposalId => the ACCEPTOR leg's strategy bindings. The PROPOSER leg's
        ///      bindings continue to live in `proposalStrategies`; splitting them is what
        ///      lets the two legs carry independent strategy sets. Consumed at accept.
        mapping(uint256 => StrategyBinding[]) proposalAcceptorStrategies;
        // =====================================================================
        // Pause budget + window-classified clock-stop (ERC §A.6 erratum; offset 33)
        //
        // The three scalars pack into one slot. All default-zero: a manager with no budget
        // (`maxPauseDuration == 0`) — including any pre-erratum proxy upgraded in place — clamps
        // every pause credit to zero and behaves byte-for-byte as pure wall clock. See PauseLib.
        // =====================================================================
        /// @dev Wall-clock start of the in-flight pause episode; 0 = not pausing (or a
        ///      pre-erratum pause carried across an upgrade, which has no measurable start
        ///      and credits nothing).
        uint64 pausedAt;
        /// @dev Total RAW paused seconds across completed episodes (accrued at unpause,
        ///      unclamped). PauseLib clamps to `maxPauseDuration` at every read, so the
        ///      budget semantics live in one place.
        uint64 cumulativePaused;
        /// @dev Lifetime pause budget: the maximum paused time creditable against any window.
        ///      Set at initialize, immutable (no setter). Once spent, pausing still hard-blocks
        ///      the two execute functions but no longer stops any clock (self-neutralizing).
        uint64 maxPauseDuration;
    }

    /// @notice Returns a storage reference to the Layout struct at STORAGE_SLOT.
    function layout() internal pure returns (Layout storage s) {
        bytes32 slot = STORAGE_SLOT;
        assembly {
            s.slot := slot
        }
    }
}
