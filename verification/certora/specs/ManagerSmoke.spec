/*
 * ManagerSmoke.spec — Certora smoke test (INV-10 create paths)
 *
 * Purpose: de-risk the [I]-rated compatibility claims before writing the P0
 * ledger specs. This scene links the manager with its external DELEGATECALL
 * libraries (CommitmentLifecycleLib, MovementLib, AgreementLib, MutualLib,
 * LedgerOpsLib — see confs/ManagerSmoke.conf), so a passing run proves the
 * prover sees through:
 *   1. the delegatecall-library dispatch shell,
 *   2. the EIP-1153 transient-storage reentrancy guard on every entry point,
 *   3. EIP-7201 namespaced storage.
 *
 * Property under test: INV-10 — commitment ids are 1-indexed; 0 is the
 * DistributionPaid non-attribution sentinel and must never be returned.
 */

using DummyERC20 as backing;

methods {
    function freeBalance(address, address) external returns (uint256) envfree;
    function encumberedBalance(address, address) external returns (uint256) envfree;
    function getCommitment(uint256) external returns (ICommitmentManager.Commitment memory) envfree;
    function nextCommitmentIdOf() external returns (uint256) envfree;

    // Token model (same scene as ManagerLedger.conf): without it, IERC20
    // calls on symbolic token addresses are unresolved and the AUTO summary
    // havocs the manager itself (the symbolic token may alias the manager),
    // which produced a spurious joinMutual counterexample on the first local
    // run — on-chain a reentering token hits the transient guard, and no
    // manager code path decreases the id counter (proven per-method below).
    function _.transfer(address, uint256) external => DISPATCHER(true);
    function _.transferFrom(address, address, uint256) external => DISPATCHER(true);
    function _.balanceOf(address) external => DISPATCHER(true);
    function _.permit(address, address, uint256, uint256, uint8, bytes32, bytes32) external => NONDET;

    // Unresolved-call routing (run-260713 triage, family A): OZ v5 SafeERC20's
    // assembly-built token call defeats static sighash matching and fell to
    // AUTO havoc — the havoc-bloated SMT is the prime suspect in the
    // batchReleaseCommitments parametric timeout. Same justification as
    // ManagerLedger.spec.
    unresolved external in _._ => DISPATCH [
        backing.transfer(address, uint256),
        backing.transferFrom(address, address, uint256),
        backing.balanceOf(address)
    ] default NONDET;
}

/*
 * Initialized-state discharge for INV-10. The prover starts rules from
 * arbitrary storage, including the unreachable pre-initialize state where
 * nextCommitmentId == 0 (first local-prover run produced exactly that
 * counterexample). On-chain the UUPS initializer seeds the counter to 1
 * before any create is reachable, so the create rules `require` the seeded
 * state and these two rules discharge the assumption: the counter is seeded
 * by initialize and can never return to 0 afterwards.
 */

/// initialize() seeds the id counter to 1.
rule initializeSeedsIdCounter(env e, calldataarg args) {
    initialize(e, args);
    assert nextCommitmentIdOf() == 1, "INV-10: initialize must seed nextCommitmentId to 1";
}

/// Once seeded, no method returns the counter to 0 (it only grows).
/// Filtered (first local run, triaged — neither is a weakening):
///  - initialize: from the prover's arbitrary pre-state the initializer flag
///    can be unset while the counter is already >= 1 (unreachable on-chain —
///    the flag and counter are set together, discharged by
///    initializeSeedsIdCounter); re-running initialize then "resets" 5 -> 1.
///  - upgradeToAndCall: delegatecalls an arbitrary new implementation, which
///    the prover rightly havocs — monotonicity across upgrades is a property
///    of the (trusted, admin-gated) next implementation, not of this code.
rule idCounterNeverReturnsToZero(env e, method f, calldataarg args)
filtered {
    // (initialize gained maxPauseDuration_ in the M0 pause-budget erratum —
    // keep this signature in sync with CommitmentManager.initialize.)
    f -> f.selector != sig:initialize(address,uint64,uint64).selector
      && f.selector != sig:upgradeToAndCall(address,bytes).selector
} {
    mathint before = nextCommitmentIdOf();
    require before >= 1;

    f(e, args);

    assert to_mathint(nextCommitmentIdOf()) >= before,
        "INV-10: nextCommitmentId is monotone non-decreasing once seeded";
}

/// INV-10: every successfully created commitment has id >= 1.
rule createCommitmentReturnsNonZeroId(env e, calldataarg args) {
    require nextCommitmentIdOf() >= 1; // initialized state, discharged above

    uint256 id = createCommitment(e, args);
    assert id >= 1, "INV-10: commitmentId 0 is the non-attribution sentinel";
}

/// INV-10 (deposit-and-create path — exercises LedgerOpsLib lib->lib delegatecall too).
rule createAndFundReturnsNonZeroId(env e, calldataarg args) {
    require nextCommitmentIdOf() >= 1; // initialized state, discharged above

    uint256 id = createAndFund(e, args);
    assert id >= 1, "INV-10: commitmentId 0 is the non-attribution sentinel";
}
