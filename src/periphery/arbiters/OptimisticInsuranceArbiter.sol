// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuardTransient} from "@openzeppelin/contracts/utils/ReentrancyGuardTransient.sol";

import {IERC165} from "@openzeppelin/contracts/utils/introspection/IERC165.sol";

import {IArbiter} from "src/shared/arbitration/interfaces/IArbiter.sol";
import {ArbiterCapabilities} from "src/shared/arbitration/ArbiterCapabilities.sol";
import {ICommitmentManager} from "src/core/interfaces/ICommitmentManager.sol";
import {IBackingAdapter} from "src/core/interfaces/IBackingAdapter.sol";
import {BPS_DENOMINATOR, WAD} from "src/shared/Constants.sol";

/// @title OptimisticInsuranceArbiter
/// @notice Reality.eth-style optimistic claim resolution for insurance
///         policies expressed as Commitments Protocol commitments. Sits
///         between the parametric `AttestationArbiter` and discretionary
///         `ManualArbiter` on the trust dial: claims resolve via bond
///         timeout without any third party. The most-committed (top-of-stack)
///         answer wins once the optimistic timer elapses with no new dispute.
///         Claim lifecycle:
///         ```
///         Idle ─proposeClaim───────────────▶ Proposed ──disputeClaim──▶ Proposed (loop)
///                │ manager.initiateForfeit       │        │ manager cancel + re-initiate
///                │ (the exit-blocking hold)      │        │ at the (capped) counter answer
///                                                │ timeout (finalizeClaim)
///                                                ▼
///                          winner == 0: cancel the hold, settle bonds (Settled)
///                          winner  > 0: Forfeiture (hold already sits at the winning bps)
///                                                │ ── manager challenge window ──
///                                                ▼
///                          executeClaim ─▶ manager.executeForfeit (skipped when already
///                          executed externally — execution is permissionless); bonds settle
///         ```
///         The manager-side forfeit proposal is opened AT PROPOSE TIME so the
///         committer cannot exit through `finalizeUnbond` / `expire` while a
///         claim is pending (`_forfeitActive` blocks both). Each dispute
///         re-initiates the hold at the capped counter-answer, so the manager
///         proposal always mirrors the current top-of-stack assertion and its
///         challenge window restarts with the answer timer. `proposeClaim`
///         requires `commitment.challengeWindow >= answerTimeout`, which
///         guarantees the (permissionless) `manager.executeForfeit` can never
///         fire before the claim itself is finalizable — external execution
///         therefore always enforces exactly the winning answer.
///         Every state has a liveness path to resolution or refund: an
///         undisputed `Proposed` claim can be cancelled by its proposer; any
///         `Proposed` claim resolves by timeout via `finalizeClaim` (settling
///         bonds directly when the commitment was resolved externally); a
///         `Proposed` claim that nobody finalizes for `CLAIM_STALE_TTL` past
///         its deadline can be unwound by anyone via `cancelStaleClaim`
///         (settling — not refunding — when the hold was already executed
///         externally, so the bond game never contradicts an enforced
///         forfeit); and a
///         `Forfeiture` claim whose manager proposal was stale-cancelled
///         externally unwinds through `executeClaim`, refunding every bond.
///         No state can strand funds.
/// @dev Storage is plain mappings + immutables, NOT upgradeable. Reference
///         arbiter convention: trust is rooted in opt-in to a specific
///         deployed address; upgradeability collapses that property. Bond
///         token is configurable at deploy; geometric escalation `≥ 2 × top`
///         with `MAX_BOND_DOUBLINGS = 8` (=256× minBond) caps the dispute
///         game depth. The proposer bond floor additionally scales with the
///         adapter-quoted claim value (`bondBps`) so min-bond false claims
///         against large commitments are not positive-EV. Templates are
///         off-chain only — the arbiter stores `bytes32 templateId` per claim
///         but does not validate against an on-chain registry.
///
///         KNOWN TRADE-OFF (propose-time hold): `manager.executeForfeit` on a
///         timed-out hold is permissionless, and executing a forfeit — even at
///         0 bps — terminally closes the commitment. So once a top-of-stack
///         answer has stood for the full challenge window, anyone (notably the
///         committer, via a cheap low-bps self-claim that nobody disputes) can
///         close the commitment at that answer's penalty, exiting coverage
///         without the unbonding period. This is contestable — any watcher can
///         `disputeClaim` within `answerTimeout` (the counterparty holds the
///         last slot of an alternating bond war started by the committer), and
///         `finalizeClaim` (callable no later than the external execute, since
///         `challengeWindow >= answerTimeout`) resolves a 0-answer by
///         cancelling the hold and KEEPING the commitment alive. Counterparties
///         relying on continuous coverage must watch `ClaimProposed` and
///         finalize denials promptly; prefer commitments whose
///         `challengeWindow` comfortably exceeds `answerTimeout`.
contract OptimisticInsuranceArbiter is IArbiter, ReentrancyGuardTransient {
    using SafeERC20 for IERC20;

    enum ClaimState {
        None,
        Proposed,
        Resolved,
        Forfeiture,
        Settled,
        Cancelled
    }

    struct BondEntry {
        address asserter;
        uint16 amountBps;
        uint128 bond;
    }

    struct Claim {
        uint256 commitmentId;
        uint16 winningAmtBps;
        uint64 lastBondAt;
        ClaimState state;
        bytes32 templateId;
        BondEntry[] stack;
    }

    /// @notice Maximum bond stack depth. 8 doublings ≡ 256× minBond. Above
    ///         this, dispute griefing risks pricing legitimate disputers out;
    ///         the dispute game is capped and the optimistic timeout resolves
    ///         the top-of-stack answer.
    uint8 public constant MAX_BOND_DOUBLINGS = 8;

    /// @notice After `lastBondAt + answerTimeout + CLAIM_STALE_TTL`, anyone
    ///         can call `cancelStaleClaim` to release the depositor.
    ///         Mirrors `CommitmentManager.FORFEIT_PROPOSAL_TTL` semantics.
    uint64 public constant CLAIM_STALE_TTL = 14 days;

    /// @notice CommitmentManager this arbiter dispatches to.
    ICommitmentManager public immutable manager;

    /// @notice bond asset for proposeClaim disputeClaim.
    IERC20 public immutable bondToken;

    /// @notice Minimum bond floor for `proposeClaim` and the first
    ///         `disputeClaim` step. Subsequent disputes are gated by the
    ///         geometric `≥ 2 × top` rule.
    uint256 public immutable minBond;

    /// @notice Value-scaled component of the proposer bond floor, in bps of
    ///         the adapter-quoted claim value: `proposeClaim` requires
    ///         `bond >= max(minBond, claimValue * bondBps / 10_000)` where
    ///         `claimValue = amount * amountBps / 10_000 * indexNow / 1e18`,
    ///         priced via the commitment's own adapter. 0 disables scaling
    ///         (flat `minBond` floor only). NOTE: the quote is denominated in
    ///         the adapter's payout denomination while the bond is posted in
    ///         `bondToken` — deployers MUST size `bondBps` with the
    ///         bondToken/denomination relationship in mind (the canonical
    ///         deployment bonds in the same asset the backing is priced in).
    uint16 public immutable bondBps;

    /// @notice Optimistic answer timeout per claim. The timer resets on
    ///         every new bond. Commitments claimed against through this
    ///         arbiter must carry `challengeWindow >= answerTimeout`
    ///         (enforced in `proposeClaim`) so the manager-side hold can
    ///         never be executed before the claim is finalizable.
    uint64 public immutable answerTimeout;

    /// @notice Share of forfeited losing bonds routed to the asserter
    ///         holding the winning answer. Remainder goes to `treasury`.
    ///         10_000 ≡ winner-take-all (reality.eth default); 0 ≡ all to
    ///         treasury (insurance-fund pattern).
    uint16 public immutable winnerShareBps;

    /// @notice Recipient of the non-winner share of forfeited bonds.
    ///         May be address(0) only if `winnerShareBps == 10_000`.
    address public immutable treasury;

    mapping(uint256 claimId => Claim) private _claims;
    mapping(uint256 commitmentId => uint256 activeClaimId) public activeClaimOf;
    uint256 public nextClaimId;

    error BondBelowFloor(uint256 minimum, uint256 provided);
    error BondNotDoubled(uint256 required, uint256 provided);
    error InvalidAmountBps(uint16 amountBps);
    error CommitmentNotActive(uint256 commitmentId);
    error WrongArbiter(address expected, address actual);
    error ClaimAlreadyActive(uint256 commitmentId, uint256 existingClaimId);
    error UnknownClaim(uint256 claimId);
    error WrongClaimState(ClaimState expected, ClaimState actual);
    error LastAsserterCannotDispute();
    error MaxDoublingsReached();
    error NotProposer(address proposer, address caller);
    error AlreadyDisputed();
    error TimeoutNotElapsed(uint64 readyAt, uint64 nowTs);
    error AmountAboveCommitmentMax(uint16 commitmentMax, uint16 claimAmount);
    error TreasuryRequired();
    error ZeroAnswerTimeout();
    error InvalidWinnerShareBps();
    error StaleTtlNotElapsed(uint64 readyAt, uint64 nowTs);
    error ChallengeWindowTooShort(uint64 required, uint64 actual);
    error ClaimAlreadyEnforced(uint256 claimId);

    event ClaimProposed(
        uint256 indexed claimId,
        uint256 indexed commitmentId,
        address indexed proposer,
        uint16 amountBps,
        uint128 bond,
        bytes32 evidenceHash,
        bytes32 templateId
    );
    event ClaimDisputed(
        uint256 indexed claimId, address indexed disputer, uint16 amountBps, uint128 bond, bytes32 evidenceHash
    );
    event ClaimCancelled(uint256 indexed claimId);
    event ClaimRuled(uint256 indexed claimId, uint16 winningAmtBps, address indexed source);
    event ClaimFinalized(uint256 indexed claimId, uint16 winningAmtBps);
    event ClaimSettled(uint256 indexed claimId, uint256 winnerPayout, uint256 treasuryPayout, uint256 winningRefunds);
    event ClaimStaleCancelled(uint256 indexed claimId);
    /// @notice The manager-side forfeit proposal was cancelled externally
    ///         (`cancelStaleForfeitProposal`) after the claim entered
    ///         Forfeiture — the lien resolution failed, so the claim unwinds
    ///         and every bond is refunded to its asserter.
    event ClaimUnwound(uint256 indexed claimId);

    constructor(
        address manager_,
        address bondToken_,
        uint256 minBond_,
        uint16 bondBps_,
        uint64 answerTimeout_,
        uint16 winnerShareBps_,
        address treasury_
    ) {
        if (answerTimeout_ == 0) revert ZeroAnswerTimeout();
        if (winnerShareBps_ > BPS_DENOMINATOR) revert InvalidWinnerShareBps();
        if (winnerShareBps_ < BPS_DENOMINATOR && treasury_ == address(0)) revert TreasuryRequired();
        manager = ICommitmentManager(manager_);
        bondToken = IERC20(bondToken_);
        minBond = minBond_;
        bondBps = bondBps_;
        answerTimeout = answerTimeout_;
        winnerShareBps = winnerShareBps_;
        treasury = treasury_;
    }

    /// @inheritdoc IArbiter
    function commitmentManager() external view returns (address) {
        return address(manager);
    }

    /// @inheritdoc IArbiter
    /// @dev The optimistic claim game only ever opens, re-prices, and cancels a
    ///      forfeit hold on the insured commitment — it never releases early,
    ///      touches agreements, or arbitrates mutuals.
    function arbiterCapabilities() external pure returns (uint256) {
        return ArbiterCapabilities.INITIATE_FORFEIT | ArbiterCapabilities.CANCEL_FORFEIT;
    }

    /// @inheritdoc IArbiter
    /// @dev Terms are encoded in the on-chain bond game, not an off-chain
    ///      pointer; returns empty.
    function arbiterMetadataURI() external pure returns (string memory) {
        return "";
    }

    /// @inheritdoc IERC165
    function supportsInterface(bytes4 interfaceId) external pure returns (bool) {
        return interfaceId == type(IArbiter).interfaceId || interfaceId == type(IERC165).interfaceId;
    }

    /// @notice Full claim struct (including the bond stack) for `claimId`.
    function getClaim(uint256 claimId) external view returns (Claim memory) {
        Claim storage c = _claims[claimId];
        if (c.state == ClaimState.None) revert UnknownClaim(claimId);
        return c;
    }

    /// @notice Top-of-stack assertion and its optimistic deadline for `claimId`.
    function getBondStackTop(uint256 claimId)
        external
        view
        returns (address asserter, uint16 amountBps, uint128 bond, uint64 deadline)
    {
        Claim storage c = _claims[claimId];
        if (c.state == ClaimState.None) revert UnknownClaim(claimId);
        if (c.stack.length == 0) return (address(0), 0, 0, 0);
        BondEntry storage top = c.stack[c.stack.length - 1];
        return (top.asserter, top.amountBps, top.bond, c.lastBondAt + answerTimeout);
    }

    /// @notice The minimum bond `proposeClaim` accepts for a claim of
    ///         `amountBps` against `commitmentId`:
    ///         `max(minBond, claimValue * bondBps / 10_000)`, where the claim
    ///         value is quoted via the commitment's backing adapter.
    function bondFloor(uint256 commitmentId, uint16 amountBps) external view returns (uint256) {
        return _bondFloor(manager.getCommitment(commitmentId), amountBps);
    }

    /// @notice Open a new claim against `commitmentId`. Pulls `bond` from
    ///         msg.sender; `bond ≥ bondFloor(commitmentId, amountBps)`. The
    ///         proposer asserts the policy should pay out at `amountBps` of
    ///         the encumbered amount. Immediately opens the manager-side
    ///         forfeit proposal at `amountBps` so the committer cannot exit
    ///         (unbond/expire) while the claim is pending. Requires the
    ///         commitment's `challengeWindow >= answerTimeout` so the hold
    ///         cannot be executed before the claim resolves.
    function proposeClaim(
        uint256 commitmentId,
        uint16 amountBps,
        bytes32 evidenceHash,
        bytes32 templateId,
        uint128 bond
    ) external nonReentrant returns (uint256 claimId) {
        if (activeClaimOf[commitmentId] != 0) {
            revert ClaimAlreadyActive(commitmentId, activeClaimOf[commitmentId]);
        }

        ICommitmentManager.Commitment memory cm = manager.getCommitment(commitmentId);
        if (cm.arbiter != address(this)) revert WrongArbiter(address(this), cm.arbiter);
        if (cm.released || cm.forfeited) revert CommitmentNotActive(commitmentId);
        if (amountBps == 0 || amountBps > BPS_DENOMINATOR) revert InvalidAmountBps(amountBps);
        if (amountBps > cm.maxPenaltyBps) revert AmountAboveCommitmentMax(cm.maxPenaltyBps, amountBps);
        if (cm.challengeWindow < answerTimeout) revert ChallengeWindowTooShort(answerTimeout, cm.challengeWindow);

        uint256 floor = _bondFloor(cm, amountBps);
        if (bond < floor) revert BondBelowFloor(floor, bond);

        bondToken.safeTransferFrom(msg.sender, address(this), bond);

        claimId = ++nextClaimId;
        Claim storage c = _claims[claimId];
        c.commitmentId = commitmentId;
        c.state = ClaimState.Proposed;
        c.lastBondAt = uint64(block.timestamp);
        c.templateId = templateId;
        c.stack.push(BondEntry({asserter: msg.sender, amountBps: amountBps, bond: bond}));

        activeClaimOf[commitmentId] = claimId;

        // The hold: an active manager-side forfeit proposal blocks
        // finalizeUnbond/expire for the life of the claim, so the committer
        // cannot race the optimistic resolution out of custody.
        manager.initiateForfeit(commitmentId, amountBps);

        emit ClaimProposed(claimId, commitmentId, msg.sender, amountBps, bond, evidenceHash, templateId);
    }

    /// @notice Dispute the top-of-stack assertion. New bond must be at least
    ///         `2 × top.bond`. Disputer cannot be the most recent asserter
    ///         (no self-dispute griefing). Stack depth is capped at
    ///         `MAX_BOND_DOUBLINGS`; beyond that, the optimistic timeout
    ///         resolves the top-of-stack answer. Re-initiates the manager-side
    ///         hold at the (capped) counter answer so the pending forfeit
    ///         proposal always mirrors the current top of stack and its
    ///         challenge window restarts with the answer timer.
    function disputeClaim(uint256 claimId, uint16 counterAmountBps, bytes32 evidenceHash, uint128 bond)
        external
        nonReentrant
    {
        Claim storage c = _claims[claimId];
        if (c.state != ClaimState.Proposed) revert WrongClaimState(ClaimState.Proposed, c.state);
        if (c.stack.length >= MAX_BOND_DOUBLINGS) revert MaxDoublingsReached();

        BondEntry storage top = c.stack[c.stack.length - 1];
        if (msg.sender == top.asserter) revert LastAsserterCannotDispute();
        uint256 required = uint256(top.bond) * 2;
        if (required < minBond) required = minBond;
        if (bond < required) revert BondNotDoubled(required, bond);
        if (counterAmountBps > BPS_DENOMINATOR) revert InvalidAmountBps(counterAmountBps);

        // counterAmountBps == 0 is a valid "no payout" assertion (the hold is
        // re-initiated at 0 bps — still an active proposal, still blocking
        // exits); counterAmountBps > commitmentMax is also valid in principle
        // but capped on every manager interaction.
        ICommitmentManager.ForfeitProposal memory p = manager.getForfeitProposal(c.commitmentId);
        if (p.executed) revert ClaimAlreadyEnforced(claimId);
        ICommitmentManager.Commitment memory cm = manager.getCommitment(c.commitmentId);
        // Only reachable when the hold was stale-cancelled externally and the
        // committer exited before anyone finalized — disputing is pointless.
        if (cm.released || cm.forfeited) revert CommitmentNotActive(c.commitmentId);

        bondToken.safeTransferFrom(msg.sender, address(this), bond);

        c.lastBondAt = uint64(block.timestamp);
        c.stack.push(BondEntry({asserter: msg.sender, amountBps: counterAmountBps, bond: bond}));

        // Re-sync the hold to the new top-of-stack answer.
        if (_proposalActive(p)) manager.cancelForfeit(c.commitmentId);
        manager.initiateForfeit(c.commitmentId, _capped(counterAmountBps, cm.maxPenaltyBps));

        emit ClaimDisputed(claimId, msg.sender, counterAmountBps, bond, evidenceHash);
    }

    /// @notice Proposer cancels their own claim while no dispute has landed.
    ///         Refunds the proposer's bond, cancels the manager-side hold, and
    ///         frees the commitment so future claims can open. State => Cancelled.
    function cancelClaim(uint256 claimId) external nonReentrant {
        Claim storage c = _claims[claimId];
        if (c.state != ClaimState.Proposed) revert WrongClaimState(ClaimState.Proposed, c.state);
        if (c.stack.length != 1) revert AlreadyDisputed();
        if (msg.sender != c.stack[0].asserter) revert NotProposer(c.stack[0].asserter, msg.sender);

        uint128 refund = c.stack[0].bond;
        c.state = ClaimState.Cancelled;
        delete activeClaimOf[c.commitmentId];

        // Release the hold (tolerate external execution / stale-cancel).
        ICommitmentManager.ForfeitProposal memory p = manager.getForfeitProposal(c.commitmentId);
        if (_proposalActive(p)) manager.cancelForfeit(c.commitmentId);

        bondToken.safeTransfer(c.stack[0].asserter, refund);
        emit ClaimCancelled(claimId);
    }

    /// @notice Finalize a claim once the optimistic timer has elapsed without
    ///         a new dispute. The top-of-stack answer wins by exhaustion.
    ///         Normally the manager-side hold already sits at the (capped)
    ///         winning answer, so this just transitions to Forfeiture (or
    ///         cancels the hold and settles bonds directly when the winning
    ///         answer is "no payout"). Degrades gracefully when the manager
    ///         side was resolved externally: an already-executed forfeit
    ///         settles bonds at the winning answer; a stale-cancelled hold is
    ///         re-initiated (commitment still active) or — when the committer
    ///         exited in the gap — the bond game settles with no lien left to
    ///         enforce. No path can strand bonds.
    function finalizeClaim(uint256 claimId) external nonReentrant {
        Claim storage c = _claims[claimId];
        if (c.state != ClaimState.Proposed) revert WrongClaimState(ClaimState.Proposed, c.state);

        uint64 readyAt = c.lastBondAt + answerTimeout;
        if (block.timestamp < readyAt) revert TimeoutNotElapsed(readyAt, uint64(block.timestamp));
        // Top of stack wins by exhaustion.
        c.winningAmtBps = c.stack[c.stack.length - 1].amountBps;
        c.state = ClaimState.Resolved;
        emit ClaimRuled(claimId, c.winningAmtBps, address(0));

        // Cap the winning amount to the commitment's maxPenaltyBps to
        // protect against oversized rulings (depositor-side defense).
        ICommitmentManager.Commitment memory cm = manager.getCommitment(c.commitmentId);
        uint16 capped = _capped(c.winningAmtBps, cm.maxPenaltyBps);
        ICommitmentManager.ForfeitProposal memory p = manager.getForfeitProposal(c.commitmentId);

        if (p.executed) {
            // The hold was executed permissionlessly. Because the hold always
            // mirrors the capped top-of-stack answer and only becomes
            // executable once the answer timer has elapsed
            // (challengeWindow >= answerTimeout), the executed penalty IS the
            // winning answer — just settle the bond game.
            _settle(claimId, capped);
            return;
        }

        if (capped == 0) {
            // No payout — cancel the hold and settle bonds with
            // winningAmtBps == 0 directly. Mirrors "claim denied".
            if (_proposalActive(p)) manager.cancelForfeit(c.commitmentId);
            _settle(claimId, 0);
            return;
        }

        if (cm.released || cm.forfeited) {
            // The hold was stale-cancelled externally and the committer
            // exited before finalization — there is no lien left to enforce.
            // Settle the bond game so no bond is ever stranded.
            if (_proposalActive(p)) manager.cancelForfeit(c.commitmentId);
            _settle(claimId, capped);
            return;
        }

        c.state = ClaimState.Forfeiture;
        // The hold already sits at `capped` (synced at propose/every dispute)
        // unless it was stale-cancelled externally — restore it then.
        if (p.cancelled) manager.initiateForfeit(c.commitmentId, capped);
        // `ClaimFinalized` fires once, from `executeClaim`, with the penalty enforced.
    }

    /// @notice Execute the manager-side forfeit after its challenge window.
    ///         Tolerates external resolution (`manager.executeForfeit` is
    ///         permissionless and `cancelStaleForfeitProposal` can fire past
    ///         the TTL): an already-executed forfeit skips the manager call
    ///         and settles bonds; a stale-cancelled proposal unwinds the claim
    ///         and refunds every bond. Moves to Settled (or Cancelled on the
    ///         unwind path) and distributes bonds.
    function executeClaim(uint256 claimId) external nonReentrant {
        Claim storage c = _claims[claimId];
        if (c.state != ClaimState.Forfeiture) revert WrongClaimState(ClaimState.Forfeiture, c.state);

        ICommitmentManager.ForfeitProposal memory p = manager.getForfeitProposal(c.commitmentId);
        if (p.cancelled) {
            // Stale-cancelled externally (e.g. forfeiture paused past the
            // TTL) — the lien resolution failed. Unwind: nobody wins the bond
            // game against an unenforceable ruling; refund every bond.
            c.state = ClaimState.Cancelled;
            delete activeClaimOf[c.commitmentId];
            _refundAllBonds(c);
            emit ClaimUnwound(claimId);
            return;
        }

        if (!p.executed) manager.executeForfeit(c.commitmentId);

        // The hold sits at the capped winning answer, so `p.penaltyBps` is what was paid.
        _settle(claimId, p.penaltyBps);
    }

    /// @notice Anyone can cancel a stale claim — one where the optimistic
    ///         timer has long since elapsed and nobody finalized. Refunds
    ///         all bonds to their asserters, releases the manager-side hold,
    ///         and frees the commitment. Exception: if the hold was already
    ///         executed externally (permissionless past its window), the
    ///         top-of-stack answer IS enforced on-chain, so the bond game
    ///         settles at it exactly as `finalizeClaim` would — a losing
    ///         disputer cannot wait out the TTL to reclaim a bond that the
    ///         enforced result forfeits.
    function cancelStaleClaim(uint256 claimId) external nonReentrant {
        Claim storage c = _claims[claimId];
        if (c.state != ClaimState.Proposed) revert WrongClaimState(ClaimState.Proposed, c.state);
        uint64 readyAt = c.lastBondAt + answerTimeout + CLAIM_STALE_TTL;
        if (block.timestamp < readyAt) revert StaleTtlNotElapsed(readyAt, uint64(block.timestamp));

        ICommitmentManager.ForfeitProposal memory p = manager.getForfeitProposal(c.commitmentId);
        if (p.executed) {
            // The hold was executed externally while the claim sat
            // unfinalized — settle at the enforced (top-of-stack) answer
            // instead of refunding against it. `p.penaltyBps` is that answer
            // capped to the commitment max (synced at propose/every dispute).
            c.winningAmtBps = c.stack[c.stack.length - 1].amountBps;
            c.state = ClaimState.Resolved;
            emit ClaimRuled(claimId, c.winningAmtBps, address(0));
            _settle(claimId, p.penaltyBps);
            return;
        }

        c.state = ClaimState.Cancelled;
        delete activeClaimOf[c.commitmentId];

        // Release the hold on the abandoned claim (tolerate an external
        // stale-cancel of the manager proposal).
        if (_proposalActive(p)) manager.cancelForfeit(c.commitmentId);

        // Refund every bond in full — there's no winner, so nobody
        // forfeits.
        _refundAllBonds(c);
        emit ClaimStaleCancelled(claimId);
    }

    /// @dev Settle terminal bookkeeping shared by every finalize path that
    ///      skips (or already passed) the manager-side execution.
    function _settle(uint256 claimId, uint16 finalizedBps) internal {
        Claim storage c = _claims[claimId];
        c.state = ClaimState.Settled;
        _distributeBonds(claimId);
        delete activeClaimOf[c.commitmentId];
        emit ClaimFinalized(claimId, finalizedBps);
    }

    /// @dev max(minBond, adapter-quoted claim value scaled by bondBps).
    function _bondFloor(ICommitmentManager.Commitment memory cm, uint16 amountBps)
        internal
        view
        returns (uint256 floor)
    {
        floor = minBond;
        if (bondBps == 0) return floor;
        uint256 claimUnits = (cm.amount * amountBps) / BPS_DENOMINATOR;
        uint256 claimValue = (claimUnits * IBackingAdapter(cm.adapter).indexNow(cm.token)) / WAD;
        uint256 scaled = (claimValue * bondBps) / BPS_DENOMINATOR;
        if (scaled > floor) floor = scaled;
    }

    /// @dev An initiated proposal that is neither executed nor cancelled.
    function _proposalActive(ICommitmentManager.ForfeitProposal memory p) internal pure returns (bool) {
        return p.initiatedAt != 0 && !p.executed && !p.cancelled;
    }

    /// @dev Cap an asserted amount to the commitment's consented maximum.
    function _capped(uint16 amountBps, uint16 maxPenaltyBps) internal pure returns (uint16) {
        return amountBps > maxPenaltyBps ? maxPenaltyBps : amountBps;
    }

    /// @dev Refund every bond in the stack to its asserter (no winner).
    function _refundAllBonds(Claim storage c) internal {
        uint256 n = c.stack.length;
        for (uint256 i = 0; i < n; i++) {
            BondEntry storage e = c.stack[i];
            bondToken.safeTransfer(e.asserter, e.bond);
        }
    }

    /// @dev Walk the bond stack: refund every entry whose `amountBps`
    ///      matches the winning amount; the rest forfeit. Forfeit pool
    ///      splits `winnerShareBps` to the LAST winning asserter (the most
    ///      committed correct answer) and the remainder to `treasury`.
    function _distributeBonds(uint256 claimId) internal {
        Claim storage c = _claims[claimId];
        uint16 winning = c.winningAmtBps;

        uint256 n = c.stack.length;
        uint256 forfeitPool;
        uint256 winningRefunds;
        address lastWinner;
        for (uint256 i = 0; i < n; i++) {
            BondEntry storage e = c.stack[i];
            if (e.amountBps == winning) {
                bondToken.safeTransfer(e.asserter, e.bond);
                winningRefunds += e.bond;
                lastWinner = e.asserter;
            } else {
                forfeitPool += e.bond;
            }
        }

        uint256 winnerPayout;
        uint256 treasuryPayout;
        if (forfeitPool > 0) {
            // `winning` is always the top-of-stack answer, so `lastWinner` is set.
            winnerPayout = (forfeitPool * winnerShareBps) / BPS_DENOMINATOR;
            treasuryPayout = forfeitPool - winnerPayout;
            if (winnerPayout > 0) bondToken.safeTransfer(lastWinner, winnerPayout);
            if (treasuryPayout > 0 && treasury != address(0)) {
                bondToken.safeTransfer(treasury, treasuryPayout);
            }
        }

        emit ClaimSettled(claimId, winnerPayout, treasuryPayout, winningRefunds);
    }
}
