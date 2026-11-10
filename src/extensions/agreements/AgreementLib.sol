// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import {ICommitmentManager as ICM} from "src/core/interfaces/ICommitmentManager.sol";
import {IDistributionStrategy, StrategyBinding, CreatedContext} from "src/core/interfaces/IDistributionStrategy.sol";
import {CommitmentManagerStorage} from "src/core/manager/storage/CommitmentManagerStorage.sol";
import {ExposureLib} from "src/core/manager/libraries/ExposureLib.sol";
import {CommitmentLifecycleLib} from "src/core/manager/libraries/CommitmentLifecycleLib.sol";
import {MovementLib, HOOK_DISTRIBUTE} from "src/core/manager/libraries/MovementLib.sol";
import {LedgerLib} from "src/core/manager/libraries/LedgerLib.sol";
import {BPS_DENOMINATOR} from "src/shared/Constants.sol";

/// @title AgreementLib
/// @notice External delegatecall library hosting the agreements extension
///         (ERC-COMMITMENTS-AGREEMENTS): bilateral propose/accept, atomic forfeit, bilateral
///         settlement with per-direction lifetime caps, and third-party contributions (core
///         §C.6). Lives outside the manager for bytecode budget; `msg.sender`, `address(this)`,
///         and event sourcing are preserved under delegatecall.
library AgreementLib {
    uint64 internal constant MAX_PROPOSAL_DURATION = 30 days;
    uint256 internal constant MAX_STRATEGIES = 8;
    uint256 internal constant MAX_METADATA_URI_LENGTH = 512;

    // =========================================================================
    // Propose
    // =========================================================================

    /// @notice Proposal core: validate, encumber the proposer immediately (lock early to
    ///         prevent griefing), store the proposal, each leg's own strategy set, and the
    ///         settlement caps.
    function proposeCore(
        CommitmentManagerStorage.Layout storage s,
        ICM.AgreementParams calldata params,
        uint64 minChallengeWindow
    ) external returns (uint256 proposalId) {
        _validateProposal(params, minChallengeWindow);

        // Encumber the proposer and add its exposure, per (proposer, proposerLeg.token).
        ICM.LegTerms calldata pl = params.proposerLeg;
        LedgerLib.encumber(s, pl.token, msg.sender, pl.amount);
        ExposureLib.increment(s, msg.sender, pl.token, ExposureLib.exposureOf(pl.amount, pl.maxPenaltyBps));

        proposalId = s.nextAgreementProposalId++;
        _storeProposal(s, proposalId, params);

        // Per-leg strategy bindings, consumed at accept. Each leg's set is stored and
        // validated independently. Zero/duplicate checked here so a doomed proposal
        // fails at propose time, not at the acceptor's expense.
        _storeLegStrategies(params.proposerLeg.strategies, s.proposalStrategies[proposalId]);
        _storeLegStrategies(params.acceptorLeg.strategies, s.proposalAcceptorStrategies[proposalId]);

        // Settlement caps (zero caps = settlement disabled). Accepting the proposal is the
        // acceptor's explicit consent to forfeit-exposure ratcheting up to these caps.
        if (params.maxFlowProposerToAcceptor != 0 || params.maxFlowAcceptorToProposer != 0) {
            s.proposalCaps[proposalId] = ICM.AgreementSettlement({
                maxFlowProposerToAcceptor: params.maxFlowProposerToAcceptor,
                maxFlowAcceptorToProposer: params.maxFlowAcceptorToProposer,
                cumulativeProposerToAcceptor: 0,
                cumulativeAcceptorToProposer: 0
            });
        }

        emit ICM.AgreementProposed(proposalId, msg.sender, params.acceptor, params.metadataURI, params.metadataHash);
        // Companion terms event — the canonical read of the immutable per-leg economic terms
        // (the struct getter is intentionally omitted for the manager's EIP-170 headroom). Emitted
        // from the library, so it costs the manager's bytecode budget nothing. Separate frame for
        // stack headroom (14 event args).
        _emitProposedTerms(proposalId, params);
    }

    /// @dev Emit the immutable per-leg terms companion event. `expiresAt` mirrors the stored value
    ///      (`now + proposalDuration`, matching `_storeProposal`).
    function _emitProposedTerms(uint256 proposalId, ICM.AgreementParams calldata params) private {
        emit ICM.AgreementProposedTerms(
            proposalId,
            params.arbiter,
            params.proposerLeg.token,
            params.proposerLeg.adapter,
            params.proposerLeg.amount,
            params.proposerLeg.maxPenaltyBps,
            params.acceptorLeg.token,
            params.acceptorLeg.adapter,
            params.acceptorLeg.amount,
            params.acceptorLeg.maxPenaltyBps,
            params.challengeWindow,
            uint64(block.timestamp) + params.proposalDuration,
            params.maxFlowProposerToAcceptor,
            params.maxFlowAcceptorToProposer
        );
    }

    function _validateProposal(ICM.AgreementParams calldata params, uint64 minChallengeWindow) private pure {
        if (params.arbiter == address(0)) revert ICM.ZeroArbiter();
        if (params.acceptor == address(0)) revert ICM.ZeroCounterparty();
        _validateLeg(params.proposerLeg);
        _validateLeg(params.acceptorLeg);
        if (params.challengeWindow < minChallengeWindow) revert ICM.ChallengeWindowTooShort();
        if (params.proposalDuration > MAX_PROPOSAL_DURATION) revert ICM.ProposalDurationTooLong();
        if (bytes(params.metadataURI).length > MAX_METADATA_URI_LENGTH) revert ICM.URITooLong();
    }

    /// @dev Validate one leg's terms. Legs are independent, so each is checked on its own
    ///      token/adapter/amount/penalty/strategy-count — cross-token legs are legal.
    function _validateLeg(ICM.LegTerms calldata leg) private pure {
        if (leg.token == address(0) || leg.adapter == address(0)) revert ICM.ZeroAddress();
        if (leg.amount == 0) revert ICM.ZeroAmount();
        if (leg.maxPenaltyBps > BPS_DENOMINATOR) revert ICM.PenaltyExceedsMax();
        if (leg.strategies.length > MAX_STRATEGIES) revert ICM.TooManyStrategies();
    }

    /// @dev Copy a leg's strategy bindings into `dst`, rejecting zero and duplicate
    ///      strategies. Validated at propose time so a doomed proposal fails early.
    function _storeLegStrategies(StrategyBinding[] calldata src, StrategyBinding[] storage dst) private {
        uint256 n = src.length;
        for (uint256 i; i < n; i++) {
            address strategy = src[i].strategy;
            if (strategy == address(0)) revert ICM.ZeroAddress();
            for (uint256 j; j < i; j++) {
                if (dst[j].strategy == strategy) revert ICM.DuplicateStrategy();
            }
            dst.push(src[i]);
        }
    }

    function _storeProposal(
        CommitmentManagerStorage.Layout storage s,
        uint256 proposalId,
        ICM.AgreementParams calldata params
    ) private {
        ICM.AgreementProposal storage prop = s.agreementProposals[proposalId];
        prop.proposer = msg.sender;
        prop.acceptor = params.acceptor;
        prop.arbiter = params.arbiter;
        prop.proposerToken = params.proposerLeg.token;
        prop.proposerAdapter = params.proposerLeg.adapter;
        prop.proposerAmount = params.proposerLeg.amount;
        prop.proposerMaxPenaltyBps = params.proposerLeg.maxPenaltyBps;
        prop.acceptorToken = params.acceptorLeg.token;
        prop.acceptorAdapter = params.acceptorLeg.adapter;
        prop.acceptorAmount = params.acceptorLeg.amount;
        prop.acceptorMaxPenaltyBps = params.acceptorLeg.maxPenaltyBps;
        prop.challengeWindow = params.challengeWindow;
        prop.expiresAt = uint64(block.timestamp) + params.proposalDuration;
        prop.metadataURI = params.metadataURI;
        prop.metadataHash = params.metadataHash;
    }

    // =========================================================================
    // Accept
    // =========================================================================

    /// @notice Accept core: encumber the acceptor, write the two paired commitments (each leg
    ///         with its own token, adapter, amount and penalty), bind each leg's own strategy set
    ///         to that leg (running each onCommitmentCreated — a revert aborts acceptance
    ///         atomically), link the pair, copy settlement caps.
    function acceptCore(CommitmentManagerStorage.Layout storage s, uint256 proposalId)
        external
        returns (uint256 agreementId, uint256 commitmentIdA, uint256 commitmentIdB)
    {
        // One read of every proposal field (the URI included); the helpers below work on the copy.
        ICM.AgreementProposal memory prop = s.agreementProposals[proposalId];

        if (msg.sender != prop.acceptor) revert ICM.NotAcceptor();
        if (prop.accepted) revert ICM.AlreadyAccepted();
        if (prop.cancelled) revert ICM.ProposalNotFound();
        if (block.timestamp > prop.expiresAt) revert ICM.ProposalExpired();
        s.agreementProposals[proposalId].accepted = true;

        // Encumber the acceptor and add its exposure, in the ACCEPTOR leg's token.
        LedgerLib.encumber(s, prop.acceptorToken, msg.sender, prop.acceptorAmount);
        ExposureLib.increment(
            s, msg.sender, prop.acceptorToken, ExposureLib.exposureOf(prop.acceptorAmount, prop.acceptorMaxPenaltyBps)
        );

        // Two legs: the proposer leg carries the proposer terms, the acceptor leg the
        // acceptor terms (independent token/adapter/amount/penalty).
        uint256 cidA = _storeLeg(s, prop, true, prop.proposer, prop.acceptor);
        uint256 cidB = _storeLeg(s, prop, false, prop.acceptor, prop.proposer);

        // Link (agreement ids are 1-indexed; 0 = "not agreed").
        agreementId = ++s.nextAgreementId;
        s.agreementPairs[agreementId] = [cidA, cidB];
        s.commitmentToAgreement[cidA] = agreementId;
        s.commitmentToAgreement[cidB] = agreementId;
        s.proposalToAgreement[proposalId] = agreementId; // reverse index (write-once at accept)

        // Copy settlement caps into the live record.
        ICM.AgreementSettlement storage caps = s.proposalCaps[proposalId];
        if (caps.maxFlowProposerToAcceptor != 0 || caps.maxFlowAcceptorToProposer != 0) {
            s.agreementSettlement[agreementId] = ICM.AgreementSettlement({
                maxFlowProposerToAcceptor: caps.maxFlowProposerToAcceptor,
                maxFlowAcceptorToProposer: caps.maxFlowAcceptorToProposer,
                cumulativeProposerToAcceptor: 0,
                cumulativeAcceptorToProposer: 0
            });
        }

        // Bind each leg's OWN strategy set to that leg (extension §4). Creation hooks are
        // unguarded — a revert aborts acceptance atomically.
        _bindLegStrategies(
            s, s.proposalStrategies[proposalId], prop, cidA, prop.proposerAmount, prop.proposerMaxPenaltyBps
        );
        _bindLegStrategies(
            s, s.proposalAcceptorStrategies[proposalId], prop, cidB, prop.acceptorAmount, prop.acceptorMaxPenaltyBps
        );

        emit ICM.AgreementAccepted(agreementId, proposalId, cidA, cidB, prop.metadataURI, prop.metadataHash);
        (commitmentIdA, commitmentIdB) = (cidA, cidB);
    }

    function _storeLeg(
        CommitmentManagerStorage.Layout storage s,
        ICM.AgreementProposal memory prop,
        bool proposerSide,
        address committer,
        address counterparty
    ) private returns (uint256 commitmentId) {
        commitmentId = s.nextCommitmentId++;
        ICM.Commitment storage c = s.commitments[commitmentId];
        c.committer = committer;
        c.arbiter = prop.arbiter;
        c.counterparty = counterparty;
        c.token = proposerSide ? prop.proposerToken : prop.acceptorToken;
        c.adapter = proposerSide ? prop.proposerAdapter : prop.acceptorAdapter;
        c.amount = proposerSide ? prop.proposerAmount : prop.acceptorAmount;
        c.maxPenaltyBps = proposerSide ? prop.proposerMaxPenaltyBps : prop.acceptorMaxPenaltyBps;
        c.challengeWindow = prop.challengeWindow;
        c.createdAt = uint64(block.timestamp);
        c.metadataHash = prop.metadataHash;

        _emitLegCreated(commitmentId, prop, proposerSide, committer, counterparty);
    }

    /// @dev Separate frame for the 11-argument creation event (stack headroom).
    function _emitLegCreated(
        uint256 commitmentId,
        ICM.AgreementProposal memory prop,
        bool proposerSide,
        address committer,
        address counterparty
    ) private {
        emit ICM.CommitmentCreated(
            commitmentId,
            committer,
            prop.arbiter,
            counterparty,
            proposerSide ? prop.proposerToken : prop.acceptorToken,
            proposerSide ? prop.proposerAdapter : prop.acceptorAdapter,
            proposerSide ? prop.proposerAmount : prop.acceptorAmount,
            proposerSide ? prop.proposerMaxPenaltyBps : prop.acceptorMaxPenaltyBps,
            prop.challengeWindow,
            uint64(0), // agreement legs carry no expiry
            prop.metadataURI,
            prop.metadataHash
        );
    }

    function _bindLegStrategies(
        CommitmentManagerStorage.Layout storage s,
        StrategyBinding[] storage binds,
        ICM.AgreementProposal memory prop,
        uint256 commitmentId,
        uint256 legAmount,
        uint16 legMaxPenaltyBps
    ) private {
        uint256 n = binds.length;
        for (uint256 i; i < n; i++) {
            address strategy = binds[i].strategy;
            s.isBoundStrategy[commitmentId][strategy] = true;
            s.commitmentStrategies[commitmentId].push(strategy);
            emit ICM.CommitmentBoundToStrategy(commitmentId, strategy, binds[i].params);

            IDistributionStrategy(strategy)
                .onCommitmentCreated(
                    CreatedContext({
                        base: MovementLib.baseContext(s, commitmentId),
                        originalAmount: legAmount,
                        maxPenaltyBps: legMaxPenaltyBps,
                        challengeWindow: prop.challengeWindow,
                        strategyParams: binds[i].params
                    })
                );
        }
    }

    // =========================================================================
    // Cancel proposal
    // =========================================================================

    /// @notice Cancel core: proposer-only while live; anyone once expired. Restores the
    ///         proposer's exposure and encumbrance.
    function cancelProposalCore(CommitmentManagerStorage.Layout storage s, uint256 proposalId) external {
        ICM.AgreementProposal storage prop = s.agreementProposals[proposalId];

        bool isExpired = block.timestamp > prop.expiresAt;
        if (!isExpired && msg.sender != prop.proposer) revert ICM.NotProposer();
        if (prop.accepted) revert ICM.AlreadyAccepted();
        if (prop.cancelled || prop.proposer == address(0)) revert ICM.ProposalNotFound();

        prop.cancelled = true;

        ExposureLib.decrement(
            s,
            prop.proposer,
            prop.proposerToken,
            ExposureLib.exposureOf(prop.proposerAmount, prop.proposerMaxPenaltyBps)
        );
        // commitmentId 0: no commitment exists for a cancelled proposal.
        LedgerLib.releaseEncumbrance(s, 0, prop.proposerToken, prop.proposer, prop.proposerAmount);

        if (isExpired) {
            emit ICM.AgreementProposalExpiredCancelled(proposalId, prop.proposer);
        } else {
            emit ICM.AgreementProposalCancelled(proposalId);
        }
    }

    // =========================================================================
    // Atomic bilateral forfeit
    // =========================================================================

    /// @notice Initiate forfeit proposals on both legs atomically (shared-arbiter-only), each at
    ///         `penaltyBps`. Already-resolved legs emit `AgreementPartialForfeit` instead. `penaltyBps`
    ///         must be ≤ each unresolved leg's `maxPenaltyBps` (the legs MAY differ, so the tighter one
    ///         binds), letting the arbiter forfeit proportionally rather than always at the maximum.
    ///         Reverts `ForfeitPending` when every unresolved leg already has a live proposal, so
    ///         `AgreementForfeited` is emitted only when at least one proposal was written.
    function forfeitCore(CommitmentManagerStorage.Layout storage s, uint256 agreementId, uint16 penaltyBps) external {
        uint256[2] storage pair = s.agreementPairs[agreementId];
        uint256 cidA = pair[0];
        uint256 cidB = pair[1];
        if (cidA == 0 && cidB == 0) revert ICM.AgreementNotFound();

        ICM.Commitment storage cA = s.commitments[cidA];
        ICM.Commitment storage cB = s.commitments[cidB];
        if (msg.sender != cA.arbiter) revert ICM.NotArbiter();

        bool aResolved = cA.released || cA.forfeited;
        bool bResolved = cB.released || cB.forfeited;
        if (aResolved && bResolved) revert ICM.AgreementBothResolved();

        // Validate against every unresolved leg BEFORE mutating, so an out-of-range penalty always
        // reverts (never a partial one-leg forfeit).
        if (!aResolved && penaltyBps > cA.maxPenaltyBps) revert ICM.PenaltyExceedsMax();
        if (!bResolved && penaltyBps > cB.maxPenaltyBps) revert ICM.PenaltyExceedsMax();

        bool written;
        if (!aResolved) written = _initiateForfeitIdempotent(s, cidA, penaltyBps);
        else emit ICM.AgreementPartialForfeit(agreementId, cidA);

        if (!bResolved) written = _initiateForfeitIdempotent(s, cidB, penaltyBps) || written;
        else emit ICM.AgreementPartialForfeit(agreementId, cidB);

        if (!written) revert ICM.ForfeitPending();
        emit ICM.AgreementForfeited(agreementId);
    }

    /// @dev Idempotent proposal write: no-op if resolved or a proposal is already live.
    ///      Returns whether a proposal was written.
    function _initiateForfeitIdempotent(
        CommitmentManagerStorage.Layout storage s,
        uint256 commitmentId,
        uint16 penaltyBps
    ) private returns (bool) {
        ICM.Commitment storage c = s.commitments[commitmentId];
        ICM.ForfeitProposal storage p = s.forfeitProposals[commitmentId];
        if (c.released || c.forfeited) return false;
        if (p.initiatedAt != 0 && !p.cancelled && !p.executed) return false;

        CommitmentLifecycleLib.writeForfeitProposal(s, commitmentId, penaltyBps, c.challengeWindow);
        return true;
    }

    // =========================================================================
    // Atomic bilateral release
    // =========================================================================

    /// @notice Release both legs atomically (shared-arbiter-only). Each unresolved leg runs its
    ///         guarded release hooks before its encumbrance frees.
    function releaseAgreementCore(CommitmentManagerStorage.Layout storage s, uint256 agreementId) external {
        uint256[2] storage pair = s.agreementPairs[agreementId];
        (uint256 cidA, uint256 cidB) = (pair[0], pair[1]);
        if (cidA == 0 && cidB == 0) revert ICM.AgreementNotFound();
        if (msg.sender != s.commitments[cidA].arbiter) revert ICM.NotArbiter();

        bool aResolved = s.commitments[cidA].released || s.commitments[cidA].forfeited;
        bool bResolved = s.commitments[cidB].released || s.commitments[cidB].forfeited;
        if (aResolved && bResolved) revert ICM.AgreementBothResolved();

        if (!aResolved) {
            CommitmentLifecycleLib.closeWithHooks(s, cidA);
            emit ICM.CommitmentReleased(cidA, msg.sender);
        }
        if (!bResolved) {
            CommitmentLifecycleLib.closeWithHooks(s, cidB);
            emit ICM.CommitmentReleased(cidB, msg.sender);
        }
        emit ICM.AgreementReleased(agreementId);
    }

    // =========================================================================
    // Bilateral settlement
    // =========================================================================

    /// @notice Settlement entry: run the guarded pre-settle distribute on both legs (so
    ///         strategy accrual baselines reflect pre-shift principals; a failing strategy
    ///         parks and cannot veto arbiter settlement), then apply the settlement core.
    function settleWithPredistribute(
        CommitmentManagerStorage.Layout storage s,
        uint256 agreementId,
        bool fromProposer,
        uint256 units,
        bytes32 evidenceHash
    ) external {
        uint256[2] storage pair = s.agreementPairs[agreementId];
        if (pair[0] == 0 && pair[1] == 0) revert ICM.AgreementNotFound();

        _presettleDistribute(s, pair[0]);
        _presettleDistribute(s, pair[1]);
        _settleCore(s, agreementId, fromProposer, units, evidenceHash);
    }

    /// @dev Guarded distribute over a leg's bound strategies. Skips legs where distribute is
    ///      invalid (resolved / pending forfeit) — the settle core re-validates and reverts the
    ///      whole call if settlement itself is not permitted.
    function _presettleDistribute(CommitmentManagerStorage.Layout storage s, uint256 commitmentId) private {
        ICM.Commitment storage c = s.commitments[commitmentId];
        if (c.released || c.forfeited) return;
        ICM.ForfeitProposal storage p = s.forfeitProposals[commitmentId];
        if (p.initiatedAt != 0 && !p.cancelled && !p.executed) return;

        address[] storage strategies = s.commitmentStrategies[commitmentId];
        uint256 n = strategies.length;
        for (uint256 i; i < n; i++) {
            MovementLib.guardedCall(s, commitmentId, strategies[i], HOOK_DISTRIBUTE);
        }
    }

    /// @dev Settlement core: the arbiter shifts up to a per-direction lifetime cap (INV-E1)
    ///      of the PAYER leg's collateral to the receiver. Denominated in the payer leg's
    ///      token, so it is well-defined for cross-token agreements — the token move lives
    ///      in `_settleApplyShift`.
    function _settleCore(
        CommitmentManagerStorage.Layout storage s,
        uint256 agreementId,
        bool fromProposer,
        uint256 units,
        bytes32 evidenceHash
    ) private {
        if (units == 0) revert ICM.ZeroAmount();
        if (units > type(uint128).max) {
            // Caps are uint128, so any larger request exceeds the direction's cap; report it
            // saturated at uint128 max against the real cap.
            ICM.AgreementSettlement storage caps = s.agreementSettlement[agreementId];
            revert ICM.SettlementCapExceeded(
                type(uint128).max, fromProposer ? caps.maxFlowProposerToAcceptor : caps.maxFlowAcceptorToProposer
            );
        }

        uint256 payerCid;
        uint256 receiverCid;
        {
            uint256[2] storage pair = s.agreementPairs[agreementId];
            uint256 cidA = pair[0];
            uint256 cidB = pair[1];
            if (cidA == 0 && cidB == 0) revert ICM.AgreementNotFound();
            (payerCid, receiverCid) = fromProposer ? (cidA, cidB) : (cidB, cidA);
        }

        _settleValidateState(s, payerCid, receiverCid);
        _settleApplyCap(s, agreementId, fromProposer, uint128(units));
        _settleApplyShift(s, payerCid, receiverCid, units);

        ICM.AgreementSettlement storage es = s.agreementSettlement[agreementId];
        emit ICM.AgreementSettled(
            agreementId,
            fromProposer,
            units,
            es.cumulativeProposerToAcceptor,
            es.cumulativeAcceptorToProposer,
            evidenceHash
        );
    }

    /// @dev Both legs active, shared-arbiter auth, no pending forfeit or unbond on either side.
    function _settleValidateState(CommitmentManagerStorage.Layout storage s, uint256 payerCid, uint256 receiverCid)
        private
        view
    {
        ICM.Commitment storage payer = s.commitments[payerCid];
        if (msg.sender != payer.arbiter) revert ICM.NotArbiter();
        if (payer.released || payer.forfeited) revert ICM.CommitmentInactive();
        ICM.Commitment storage receiver = s.commitments[receiverCid];
        if (receiver.released || receiver.forfeited) revert ICM.CommitmentInactive();

        ICM.ForfeitProposal storage pp = s.forfeitProposals[payerCid];
        if (pp.initiatedAt != 0 && !pp.cancelled && !pp.executed) revert ICM.ForfeitPending();
        ICM.ForfeitProposal storage rp = s.forfeitProposals[receiverCid];
        if (rp.initiatedAt != 0 && !rp.cancelled && !rp.executed) revert ICM.ForfeitPending();

        if (s.unbondInitiatedAt[payerCid] != 0 || s.unbondInitiatedAt[receiverCid] != 0) revert ICM.UnbondPending();
    }

    /// @dev Per-direction lifetime cap (INV-E1). Cumulatives only ratchet up.
    function _settleApplyCap(
        CommitmentManagerStorage.Layout storage s,
        uint256 agreementId,
        bool fromProposer,
        uint128 units128
    ) private {
        ICM.AgreementSettlement storage es = s.agreementSettlement[agreementId];
        uint128 cap = fromProposer ? es.maxFlowProposerToAcceptor : es.maxFlowAcceptorToProposer;
        if (cap == 0) revert ICM.SettlementCapZero();
        uint128 cumulBefore = fromProposer ? es.cumulativeProposerToAcceptor : es.cumulativeAcceptorToProposer;
        uint128 cumulAfter = cumulBefore + units128;
        if (cumulAfter > cap) revert ICM.SettlementCapExceeded(cumulAfter, cap);
        if (fromProposer) es.cumulativeProposerToAcceptor = cumulAfter;
        else es.cumulativeAcceptorToProposer = cumulAfter;
    }

    /// @dev Move `units` of the PAYER leg's token out of the payer's encumbered leg to the
    ///      RECEIVER committer's FREE balance. One denomination (the payer's), so it is
    ///      well-defined whether or not the two legs share a token: the settled value is the
    ///      payer's collateral, now liquid to the receiver (not re-encumbered under the
    ///      agreement, so not at forfeit risk). Only the payer leg's amount + exposure change;
    ///      the receiver leg is untouched. Exposure follows the dust-free diff rule. INV-1 holds
    ///      per token — for the payer's token, encumbered↓ and free↑ by the same `units`.
    function _settleApplyShift(
        CommitmentManagerStorage.Layout storage s,
        uint256 payerCid,
        uint256 receiverCid,
        uint256 units
    ) private {
        ICM.Commitment storage payer = s.commitments[payerCid];
        if (units > payer.amount) revert ICM.InsufficientCommitmentAmount(units, payer.amount);

        ExposureLib.resize(s, payer, payer.amount - units);

        // Payer's encumbered leg -> receiver's free balance, in the payer leg's token.
        LedgerLib.forfeitTransfer(s, payer.token, payer.committer, s.commitments[receiverCid].committer, units);
    }

    // =========================================================================
    // Contributions (core §C.6)
    // =========================================================================

    /// @notice Contribution core: grow an opted-in commitment's encumbered position from the
    ///         caller's free balance. Opt-in: the committer's own first contribution enables
    ///         external ones.
    function contributeCore(CommitmentManagerStorage.Layout storage s, uint256 commitmentId, uint256 units) external {
        if (units == 0) revert ICM.ZeroAmount();
        ICM.Commitment storage c = s.commitments[commitmentId];

        if (!s.acceptsContributions[commitmentId]) {
            if (msg.sender != c.committer) revert ICM.ContributionsDisabled();
            s.acceptsContributions[commitmentId] = true;
            emit ICM.ContributionsEnabled(commitmentId, msg.sender);
        }

        if (c.released || c.forfeited) revert ICM.CommitmentInactive();
        ICM.ForfeitProposal storage sp = s.forfeitProposals[commitmentId];
        if (sp.initiatedAt != 0 && !sp.cancelled && !sp.executed) revert ICM.ForfeitPending();
        if (s.unbondInitiatedAt[commitmentId] != 0) revert ICM.UnbondPending();

        // Exposure-diff growth keeps the per-commitment forfeitable contribution exact.
        ExposureLib.resize(s, c, c.amount + units);

        LedgerLib.attributeEncumbrance(s, c.token, msg.sender, c.committer, units);
        emit ICM.EncumbranceContributed(commitmentId, msg.sender, c.committer, units);
    }
}
