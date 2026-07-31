/*
 * ManagerLedger.spec — P0 ledger soundness (PROPERTIES.md)
 *
 * Scene: CommitmentManagerHarness (manager + aggregate view accessors) linked
 * with the five external DELEGATECALL libraries, plus DummyERC20 as the
 * standard-token model (all IERC20 calls DISPATCH to it — the arbitrary-token
 * assumption of PROPERTIES.md).
 *
 * Strategy hooks (IDistributionStrategy) are deliberately UNRESOLVED: the
 * prover havocs their return values, so distribute/claim rules quantify over
 * arbitrary strategy-emitted TokenMovement arrays — a strictly stronger
 * adversary than any mock. The EIP-1153 reentrancy guard is real code in the
 * scene; reentrant callbacks from havoc'd hooks revert as on-chain.
 *
 * Two-tier partition architecture (mirrors the fuzz suite's split):
 *   Tier 1 (here): the O(1) per-token aggregates sum to the manager's token
 *     balance (INV-1/P13 over aggregates == the on-chain O(1) check).
 *   Tier 2 (ghost sums over per-user/per-strategy maps == aggregates, i.e.
 *     the fuzz suite's "ledger walk") — follow-up in this spec once tier 1 is
 *     green on the cloud prover.
 *
 * Known modeling caveats (documented, deliberate):
 *   - A naked ERC20 transfer INTO the manager (donation) breaks the equality
 *     in reality; the invariant is inductive over manager methods only, which
 *     is exactly the claim INV-1 makes (and what the fuzz suite checks).
 *   - `depositWithPermit` needs `permit` on the token model; DummyERC20 has
 *     none, so that path is summarized NONDET (permit outcome irrelevant —
 *     the deposit accounting is identical to `deposit`).
 */

using DummyERC20 as backing;

methods {
    // Harness aggregate accessors (envfree — no msg context needed)
    function totalFreeOf(address) external returns (uint256) envfree;
    function totalEncumberedOf(address) external returns (uint256) envfree;
    function totalEscrowOf(address) external returns (uint256) envfree;
    function totalMutualPremiumOf(address) external returns (uint256) envfree;
    function totalMutualJuniorOf(address) external returns (uint256) envfree;

    // Manager views
    function freeBalance(address, address) external returns (uint256) envfree;
    function encumberedBalance(address, address) external returns (uint256) envfree;
    function escrowOf(address, address) external returns (uint256) envfree;
    function getCommitment(uint256) external returns (ICommitmentManager.Commitment memory) envfree;
    function getUserExposure(address, address) external returns (ICommitmentManager.UserExposure memory) envfree;
    function nextCommitmentIdOf() external returns (uint256) envfree;
    function reentrancyGuardEntered() external returns (bool) envfree;

    // Token model
    function backing.balanceOf(address) external returns (uint256) envfree;
    function _.transfer(address, uint256) external => DISPATCHER(true);
    function _.transferFrom(address, address, uint256) external => DISPATCHER(true);
    function _.balanceOf(address) external => DISPATCHER(true);
    function _.permit(address, address, uint256, uint256, uint8, bytes32, bytes32) external => NONDET;

    // Unresolved-call routing (run-260713 triage, family A). OZ v5 SafeERC20
    // builds the token call in assembly, which defeats static sighash matching
    // — those calls fell to AUTO (havoc-everything), spuriously breaking every
    // token-touching method. Route token-sighash calls to the model; leave
    // everything else (strategy hooks, registry notifications) NONDET: return
    // data stays adversarially arbitrary — the movement pipeline consumes only
    // returned TokenMovement[] — and external contracts cannot mutate manager
    // storage (reentrancy is blocked by the real transient guard in scene).
    unresolved external in _._ => DISPATCH [
        backing.transfer(address, uint256),
        backing.transferFrom(address, address, uint256),
        backing.balanceOf(address)
    ] default NONDET;
}

definition sumOfCompartments(address token) returns mathint =
    totalFreeOf(token) + totalEncumberedOf(token) + totalEscrowOf(token)
        + totalMutualPremiumOf(token) + totalMutualJuniorOf(token);

/// INV-1 / INV-P13 (tier 1): the five per-token compartments partition the
/// manager's real token balance, preserved by every manager method.
///
/// Stated as a preservation rule rather than a CVL invariant (run-260713
/// triage, families D+E): the induction base is the DEPLOYED state (fresh
/// manager: zeroed ledger, zero token balance — trivially partitioned), not
/// the post-constructor symbolic state, where the prover leaves OTHER scene
/// contracts' storage arbitrary (DummyERC20 held a phantom manager balance).
/// Restricting to manager methods is the documented INV-1 claim: a naked
/// donation into the manager breaks the equality by design (spec header
/// caveat; same world the conformance fuzz checks and the ERC's
/// accounted-flow framing).
rule partitionPreserved(env e, method f, calldataarg args)
    filtered {
        // upgradeToAndCall delegatecalls into a symbolic implementation and
        // havocs all storage — meaningless counterexamples (ManagerSmoke
        // precedent, 2026-07-12; run-260713 family F).
        f -> f.selector != sig:upgradeToAndCall(address, bytes).selector
    }
{
    // The manager never moves its own ledger positions as a user; a
    // call from the manager address would let transfers alias the
    // custody balance (not reachable on-chain: the manager makes no
    // self-calls into these entry points).
    require e.msg.sender != currentContract;
    require sumOfCompartments(backing) == to_mathint(backing.balanceOf(currentContract));

    f(e, args);

    assert sumOfCompartments(backing) == to_mathint(backing.balanceOf(currentContract)),
        "INV-1/P13: compartments must partition the manager's token balance";
}

/// INV-3: per-(user, token) magnitude allocation — the forfeitable exposure
/// never exceeds the encumbered backing.
invariant exposureBounded(address user)
    getUserExposure(backing, user).totalForfeitable <= getUserExposure(backing, user).totalEncumbered
    filtered {
        // Family F: symbolic-implementation delegatecall havoc (see
        // partitionPreserved). The remaining C3 start-state inconsistency
        // (proposal storage unrelated to exposure entries) is tracked for a
        // companion-invariant strengthening pass — NOT filtered here.
        f -> f.selector != sig:upgradeToAndCall(address, bytes).selector
    }
    {
        preserved with (env e) {
            require e.msg.sender != currentContract;
        }
    }

/// INV-4 (movement cap, distribute path): whatever movements an arbitrary
/// (havoc'd) strategy emits, one distribute() debits the committer's
/// encumbered position by at most the commitment's pre-call residual amount,
/// and the residual never grows.
rule movementCapOnDistribute(env e, uint256 commitmentId, address strategy) {
    require e.msg.sender != currentContract;
    address committer = getCommitment(commitmentId).committer;
    mathint amountBefore = getCommitment(commitmentId).amount;
    mathint encBefore = encumberedBalance(backing, committer);

    distribute(e, commitmentId, strategy);

    mathint amountAfter = getCommitment(commitmentId).amount;
    mathint encAfter = encumberedBalance(backing, committer);

    assert amountAfter <= amountBefore, "INV-4: residual amount must not grow on distribute";
    assert encBefore - encAfter <= amountBefore,
        "INV-4: encumbered debit bounded by the commitment's pre-call amount";
}

/// INV-5 (escrow isolation, claim path): a claim executing strategy S cannot
/// change any other strategy's escrow, whatever movements S emits.
rule escrowIsolationOnClaim(env e, uint256 commitmentId, address strategy, address other, bytes data) {
    require e.msg.sender != currentContract;
    require other != strategy;
    mathint before = escrowOf(backing, other);

    claim(e, commitmentId, strategy, data);

    assert to_mathint(escrowOf(backing, other)) == before,
        "INV-5: claim through one strategy must not touch another strategy's escrow";
}

/// INV-10 (both single-create paths — promoted from ManagerSmoke.spec).
rule createCommitmentReturnsNonZeroId(env e, calldataarg args) {
    // Initialized state: the prover otherwise starts from the unreachable
    // pre-initialize storage (nextCommitmentId == 0). Discharged by
    // ManagerSmoke.spec's initializeSeedsIdCounter + idCounterNeverReturnsToZero
    // (locally proven 2026-07-09/12; run-260713 triage family C1).
    require nextCommitmentIdOf() >= 1;
    uint256 id = createCommitment(e, args);
    assert id >= 1, "INV-10: commitmentId 0 is the non-attribution sentinel";
}

/// P0-FREE (free-balance withdrawability): with the partition invariant in
/// force and the aggregate dominating the individual balance (tier-2 claim,
/// assumed here and discharged when tier 2 lands), a withdraw of any amount
/// up to the caller's free balance cannot revert — no code path locks free
/// funds.
rule freeBalanceWithdrawable(env e, uint256 amount) {
    require e.msg.sender != currentContract;
    require e.msg.value == 0;
    // Fresh-transaction start: EIP-1153 clears transient storage at tx end,
    // so the reentrancy guard is clear on entry (run-260713 triage family B —
    // plain rules otherwise start from a havoc'd guard-set state).
    require !reentrancyGuardEntered();
    // Partition assumption, discharged by partitionPreserved + the zeroed
    // deploy state (see that rule's header).
    require sumOfCompartments(backing) == to_mathint(backing.balanceOf(currentContract));

    mathint free = freeBalance(backing, e.msg.sender);
    // Tier-2 assumption: per-user free ≤ per-token aggregate (ledger-walk consistency).
    require free <= to_mathint(totalFreeOf(backing));
    require amount > 0 && to_mathint(amount) <= free;

    withdraw@withrevert(e, backing, amount);

    assert !lastReverted, "P0-FREE: free balance must be withdrawable in full at any time";
}
