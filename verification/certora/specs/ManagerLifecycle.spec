/*
 * ManagerLifecycle.spec — P1 forfeit/unbond lifecycle (PROPERTIES.md)
 *
 * Same scene as ManagerLedger.spec (harness + 5 delegatecall libs + DummyERC20).
 * These are the temporal-safety and state-machine rules — the kind that are
 * easy to state vacuously, so every rule asserts a positive ledger
 * effect where possible, not just non-revert/revert.
 */

using DummyERC20 as backing;

methods {
    function freeBalance(address, address) external returns (uint256) envfree;
    function encumberedBalance(address, address) external returns (uint256) envfree;
    function getCommitment(uint256) external returns (ICommitmentManager.Commitment memory) envfree;
    function getForfeitProposal(uint256) external returns (ICommitmentManager.ForfeitProposal memory) envfree;
    function getUserExposure(address, address) external returns (ICommitmentManager.UserExposure memory) envfree;
    function strategiesOf(uint256) external returns (address[] memory) envfree;
    function unbondInitiatedAt(uint256) external returns (uint64) envfree;
    function unbondingPeriod() external returns (uint64) envfree;
    function totalFreeOf(address) external returns (uint256) envfree;
    function totalEncumberedOf(address) external returns (uint256) envfree;
    function nextCommitmentIdOf() external returns (uint256) envfree;
    function reentrancyGuardEntered() external returns (bool) envfree;
    function unbondPauseSnapshotOf(uint256) external returns (uint64) envfree;
    // NOT envfree: `creditable` accrues an in-flight pause episode with
    // block.timestamp (PauseLib.creditablePaused).
    function pauseState() external returns (bool, uint64, uint64, uint64, uint64);

    function backing.balanceOf(address) external returns (uint256) envfree;
    function _.transfer(address, uint256) external => DISPATCHER(true);
    function _.transferFrom(address, address, uint256) external => DISPATCHER(true);
    function _.balanceOf(address) external => DISPATCHER(true);
    function _.permit(address, address, uint256, uint256, uint8, bytes32, bytes32) external => NONDET;

    // Unresolved-call routing (run-260713 triage, family A): OZ v5 SafeERC20's
    // assembly-built token call and the gas-capped registry notifications
    // (IOperatorRegistryHooks.onDelegation*) fell to AUTO havoc — the latter
    // broke P1-PULL's balance-conservation assert. Token sighashes route to
    // the model; everything else (strategy hooks, registry notifications) is
    // NONDET: the manager ignores their return values on these paths and
    // external contracts cannot mutate manager storage (reentry is blocked by
    // the real transient guard in scene). Same justification as
    // ManagerLedger.spec.
    unresolved external in _._ => DISPATCH [
        backing.transfer(address, uint256),
        backing.transferFrom(address, address, uint256),
        backing.balanceOf(address)
    ] default NONDET;
}

definition proposalActive(ICommitmentManager.ForfeitProposal p) returns bool =
    p.initiatedAt != 0 && !p.executed && !p.cancelled;

/// P1-WINDOW (safety): executeForfeit can only succeed once the challenge
/// window has fully elapsed since the proposal was initiated.
rule forfeitRespectsChallengeWindow(env e, uint256 commitmentId) {
    ICommitmentManager.ForfeitProposal p = getForfeitProposal(commitmentId);
    uint64 window = getCommitment(commitmentId).challengeWindow;

    executeForfeit(e, commitmentId); // non-reverting path

    assert to_mathint(e.block.timestamp) >= p.initiatedAt + window,
        "P1-WINDOW: forfeit executed inside the challenge window";
}

/// P1-WINDOW (immutability): no method changes an existing commitment's
/// challengeWindow after creation.
rule challengeWindowImmutable(env e, method f, calldataarg args, uint256 commitmentId)
    filtered {
        // Family F: upgradeToAndCall delegatecalls into a symbolic
        // implementation and havocs all storage (ManagerSmoke precedent).
        f -> f.selector != sig:upgradeToAndCall(address, bytes).selector
    }
{
    // Existence = allocated: ids live strictly below the counter (discharged
    // by ManagerSmoke's id-counter seed/monotonicity rules). `committer != 0`
    // alone lets arbitrary storage plant a phantom commitment at
    // id == nextCommitmentId, which the create paths legitimately overwrite
    // (run-260713 triage family C2).
    require getCommitment(commitmentId).committer != 0;
    require commitmentId < nextCommitmentIdOf();
    uint64 before = getCommitment(commitmentId).challengeWindow;

    f(e, args);

    assert getCommitment(commitmentId).challengeWindow == before,
        "P1-WINDOW: challengeWindow must be immutable per commitment";
}

/// INV-7: while a proposal is active, a second initiateForfeit on the same
/// commitment always reverts.
rule noConcurrentForfeitProposals(env e, uint256 commitmentId, uint16 penaltyBps) {
    require proposalActive(getForfeitProposal(commitmentId));

    initiateForfeit@withrevert(e, commitmentId, penaltyBps);

    assert lastReverted, "INV-7: second concurrent forfeit proposal must revert";
}

/// P1-PULL: for a commitment with no bound strategies (isolating §C.3 step 2
/// from guarded-hook escrow payouts), executeForfeit is pure ledger
/// arithmetic: no token leaves the manager, the counterparty is credited in
/// free balance (pull payment), and the committer's full encumbrance clears.
rule forfeitPayoutIsPullPayment(env e, uint256 commitmentId) {
    require strategiesOf(commitmentId).length == 0;

    address committer = getCommitment(commitmentId).committer;
    address counterparty = getCommitment(commitmentId).counterparty;
    require counterparty != committer; // ruled out at create (self-commitments aside)
    require getCommitment(commitmentId).token == backing;

    mathint managerBalBefore = backing.balanceOf(currentContract);
    mathint cpFreeBefore = freeBalance(backing, counterparty);
    mathint committerEncBefore = encumberedBalance(backing, committer);
    mathint amount = getCommitment(commitmentId).amount;

    executeForfeit(e, commitmentId);

    assert to_mathint(backing.balanceOf(currentContract)) == managerBalBefore,
        "P1-PULL: executeForfeit must not move tokens out of the manager";
    assert to_mathint(freeBalance(backing, counterparty)) >= cpFreeBefore,
        "P1-PULL: counterparty payout is a ledger credit";
    assert to_mathint(encumberedBalance(backing, committer)) == committerEncBefore - amount,
        "P1-PULL: the committer's encumbrance for this commitment fully clears";
}

/// P1-FSM (terminal exclusivity + monotonicity, INV-6): released and
/// forfeited are sticky and mutually exclusive under every method.
rule terminalFlagsMonotoneAndExclusive(env e, method f, calldataarg args, uint256 commitmentId)
    filtered {
        // Family F (see challengeWindowImmutable).
        f -> f.selector != sig:upgradeToAndCall(address, bytes).selector
    }
{
    bool releasedBefore = getCommitment(commitmentId).released;
    bool forfeitedBefore = getCommitment(commitmentId).forfeited;
    require !(releasedBefore && forfeitedBefore); // inductive hypothesis

    f(e, args);

    bool releasedAfter = getCommitment(commitmentId).released;
    bool forfeitedAfter = getCommitment(commitmentId).forfeited;

    assert releasedBefore => releasedAfter, "P1-FSM: released is terminal";
    assert forfeitedBefore => forfeitedAfter, "P1-FSM: forfeited is terminal";
    assert !(releasedAfter && forfeitedAfter), "INV-6: released and forfeited are mutually exclusive";
}

/// P1-FSM (proposal lifecycle): an executed or cancelled proposal never
/// reactivates — the only path back to "active" is a fresh initiateForfeit
/// overwriting a RESOLVED slot, never a live one (paired with INV-7).
rule proposalNeverReactivates(env e, method f, calldataarg args, uint256 commitmentId)
    filtered {
        f -> f.selector != sig:initiateForfeit(uint256, uint16).selector
            // Family F (see challengeWindowImmutable).
            && f.selector != sig:upgradeToAndCall(address, bytes).selector
    }
{
    ICommitmentManager.ForfeitProposal pBefore = getForfeitProposal(commitmentId);
    require pBefore.initiatedAt != 0 && (pBefore.executed || pBefore.cancelled);

    f(e, args);

    ICommitmentManager.ForfeitProposal pAfter = getForfeitProposal(commitmentId);
    assert pAfter.executed || pAfter.cancelled,
        "P1-FSM: a resolved forfeit proposal must not silently reactivate";
}

/// @dev Shared ledger-consistency preconditions for the liveness rules. These
///      are tier-2 facts (aggregate/exposure bookkeeping matches the per-user
///      maps) assumed here and discharged by the ledger spec — without them
///      the raw subtractions in the close path would spuriously underflow.
function unbondLivenessPreconditions(env e, uint256 commitmentId) {
    ICommitmentManager.Commitment c = getCommitment(commitmentId);
    require e.msg.value == 0;
    require e.msg.sender != currentContract;
    // Fresh-transaction start (run-260713 triage family B): EIP-1153 clears
    // transient storage at transaction end, so the reentrancy guard is always
    // clear on entry; plain rules otherwise start from a havoc'd guard-set
    // state and "revert" spuriously.
    require !reentrancyGuardEntered();
    require c.token == backing;
    require !c.released && !c.forfeited;
    require unbondInitiatedAt(commitmentId) != 0;

    // Pause-accounting reachability facts (ERC §A.6 erratum): an episode's
    // pausedAt is stamped from block.timestamp when it opens and zeroed at
    // unpause, and the unbond snapshot is creditablePaused() captured at
    // initiation — creditablePaused is monotone, so snapshot <= creditable
    // now. Arbitrary storage violating either underflows
    // PauseLib.creditablePaused / pauseCreditSince.
    bool fPaused; uint64 pausedAt; uint64 cumPaused; uint64 maxPause; uint64 creditable;
    (fPaused, pausedAt, cumPaused, maxPause, creditable) = pauseState(e);
    require pausedAt != 0 => (fPaused && to_mathint(pausedAt) <= to_mathint(e.block.timestamp));
    require to_mathint(unbondPauseSnapshotOf(commitmentId)) <= to_mathint(creditable);

    // Matured in EFFECTIVE time (clock-stop): maturesAt = initiatedAt +
    // unbondingPeriod + pauseCreditSince(snapshot), exactly as
    // finalizeUnbondCore computes it — without uint64 wraparound. This keeps
    // P1-LIVE faithful to the amended ERC: pause defers maturity, it never
    // blocks the exit outright.
    mathint pauseCredit = to_mathint(creditable) - to_mathint(unbondPauseSnapshotOf(commitmentId));
    require to_mathint(unbondInitiatedAt(commitmentId)) + to_mathint(unbondingPeriod()) + pauseCredit < max_uint64;
    require to_mathint(e.block.timestamp) >= to_mathint(unbondInitiatedAt(commitmentId)) + to_mathint(unbondingPeriod()) + pauseCredit;
    require e.block.timestamp < max_uint64; // closedAt cast
    // Tier-2 ledger consistency (proved by ManagerLedger tier 2, assumed here):
    require to_mathint(encumberedBalance(backing, c.committer)) >= to_mathint(c.amount);
    require to_mathint(totalEncumberedOf(backing)) >= to_mathint(c.amount);
    require to_mathint(getUserExposure(backing, c.committer).totalEncumbered) >= to_mathint(c.amount);
    require to_mathint(getUserExposure(backing, c.committer).totalForfeitable)
        >= to_mathint(c.amount) * to_mathint(c.maxPenaltyBps) / 10000;
    require totalFreeOf(backing) + c.amount <= max_uint256;
    require freeBalance(backing, c.committer) + c.amount <= max_uint256;
}

/// P1-LIVE (a): a matured unbond with no live forfeit proposal always
/// finalizes — guarded hooks and the try/catch registry notification cannot
/// block the exit (gas-abstracted; the OOG-parking half is owned by Medusa).
rule unbondFinalizesAfterMaturity(env e, uint256 commitmentId) {
    unbondLivenessPreconditions(e, commitmentId);
    require !proposalActive(getForfeitProposal(commitmentId));

    finalizeUnbond@withrevert(e, commitmentId);

    assert !lastReverted, "P1-LIVE: matured unbond must finalize";
}

/// P1-LIVE (b), ERC §C.5 composite: even against a stale forfeit proposal the
/// committer exit is reachable — anyone force-cancels the stale proposal, then
/// finalize succeeds in the same environment.
rule unbondReachableThroughStaleForfeit(env e, uint256 commitmentId) {
    unbondLivenessPreconditions(e, commitmentId);
    ICommitmentManager.ForfeitProposal p = getForfeitProposal(commitmentId);
    require proposalActive(p);
    // The proposal's own clock-stop anchor (PauseLib.staleAt): its snapshot
    // was creditablePaused() at initiate, so snapshot <= creditable now
    // (monotonicity — same reachability argument as the unbond snapshot).
    bool fPaused2; uint64 pausedAt2; uint64 cumPaused2; uint64 maxPause2; uint64 creditable2;
    (fPaused2, pausedAt2, cumPaused2, maxPause2, creditable2) = pauseState(e);
    require to_mathint(p.cumulativePausedAtStart) <= to_mathint(creditable2);
    mathint proposalCredit = to_mathint(creditable2) - to_mathint(p.cumulativePausedAtStart);
    // Past the stale horizon in EFFECTIVE time, without wraparound
    // (FORFEIT_PROPOSAL_TTL = 14 days; staleAt = initiatedAt + window +
    // pauseCreditSince(snapshot) + ttl).
    uint64 window = getCommitment(commitmentId).challengeWindow;
    require to_mathint(p.initiatedAt) + to_mathint(window) + proposalCredit + 1209600 < max_uint64;
    require to_mathint(e.block.timestamp) >= to_mathint(p.initiatedAt) + to_mathint(window) + proposalCredit + 1209600;

    cancelStaleForfeitProposal@withrevert(e, commitmentId);
    assert !lastReverted, "P1-LIVE: stale forfeit proposal must be force-cancellable";

    finalizeUnbond@withrevert(e, commitmentId);
    assert !lastReverted, "P1-LIVE: unbond must finalize once the stale proposal is cleared";
}
