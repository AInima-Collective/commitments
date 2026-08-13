---
title: "Two-tier arbiter deployment"
status: current
---

# Two-tier arbiter deployment

`TwoTierArbiter` is an example escalated court for unilateral commitments. A
primary controller makes a fast ruling; if an authorized party appeals in time,
an appeal controller gets final authority to affirm, change, or dismiss it. The
intended controllers are an AI-governed DAO and a human-governed DAO, but the
contract authenticates only their addresses.

The court is non-upgradeable. Its manager, controllers, windows, execution
buffer, and content-addressed policy are fixed in the constructor. A commitment
opts into exactly those terms by setting its immutable `arbiter` to the deployed
court address.

## Deploy

Use the account that actually executes successful governance proposals as each
controller. With `CommitmentsGovernor`, that is the governor's timelock, not the
governor contract or governance token.

```solidity
TwoTierArbiter court = new TwoTierArbiter(
    address(manager),
    address(aiDaoTimelock),       // primary controller
    address(humanDaoTimelock),    // appeal controller
    2 days,                       // appeal window
    9 days,                       // human-response window
    1 days,                       // keeper/execution buffer
    "ipfs://bafy...court-policy",
    keccak256(courtPolicyBytes)
);
```

The two controller addresses must be non-zero and different. All three timing
values, the policy URI, and the policy hash must be non-zero. The URI should be
content-addressed (for example IPFS or Arweave); the constructor stores it but
does not parse the URI or fetch the document.

The court advertises only
`INITIATE_FORFEIT | CANCEL_FORFEIT`. It cannot release commitments, arbitrate
agreements or mutuals, or bypass the manager's challenge window.

## Configure compatible commitments

For every commitment using the court, enforce:

```text
challengeWindow >= max(appealWindow, humanResponseWindow) + executionBuffer
```

The court checks this when the primary controller calls `proposeRuling` and
rejects an incompatible commitment. The windows are not summed: an appeal and a
positive human ruling each cancel and reopen the manager proposal, resetting its
challenge window.

Choose `humanResponseWindow` to cover the human DAO's complete path:

```text
proposal creation latency
+ voting delay
+ voting period
+ possible late-quorum extension
+ timelock delay
+ execution and keeper margin
```

Also require `manager.unbondingPeriod()` to leave enough time to detect a breach
and execute the primary DAO proposal before the committer can finish exiting.
The manager proposal opened by the court blocks `finalizeUnbond` while the case
is live, but it cannot recover a commitment that already exited before a case was
opened.

## Operate the lifecycle

1. The primary controller calls
   `proposeRuling(commitmentId, penaltyBps, decisionHash)`. The penalty must be
   positive and no greater than the commitment's `maxPenaltyBps`. This opens the
   manager proposal and starts `appealWindow`.
2. If nobody appeals, anyone may call `executeRuling(caseId)` after the manager
   challenge window. Calling `manager.executeForfeit(commitmentId)` directly has
   the same economic result.
3. Before the appeal deadline, the committer, counterparty, primary controller,
   or appeal controller may call `appeal(caseId, appealHash)`. The court cancels
   and reopens the proposal at the primary penalty, preserving the exit-blocking
   lien while starting a fresh manager window and `humanResponseWindow`.
4. By the human deadline, only the appeal controller may call
   `resolveAppeal`. A zero penalty dismisses the case and cancels the proposal. A
   positive penalty at or below `maxPenaltyBps` replaces the proposal and starts
   another fresh manager challenge window.
5. If the human deadline passes unanswered, anyone should call
   `lapseAppeal(caseId)`. This cancels the proposal and leaves the commitment
   active.

Appeal and human resolution are accepted at their exact deadline timestamps;
lapse becomes available immediately after the human deadline. Each transition
uses the globally unique `caseId`, so a delayed DAO proposal from an older case
cannot affect a newer case against the same commitment.

The primary controller may call `withdrawRuling` only while the case remains an
unappealed primary ruling. Dismissal, withdrawal, and lapse all cancel the
manager proposal, clear `activeCaseOf`, and leave the commitment active.

## Keepers and reconciliation

Watch the court lifecycle events and the manager's `ForfeitInitiated`,
`ForfeitExecuted`, and `ForfeitCancelledStale` events. Keepers should:

- submit authorized last-moment appeals before the appeal deadline;
- submit `lapseAppeal` promptly after an unanswered human deadline;
- execute mature primary or human rulings; and
- call `syncCase(caseId)` after someone executes or stale-cancels the manager
  proposal directly.

`syncCase` treats the manager as the source of truth and releases the local
`activeCaseOf` slot as `Executed` or `StaleCancelled`. Indexers should key court
records by `caseId`, not only by commitment ID.

The execution buffer reduces, but does not eliminate, keeper dependence. If an
appealed proposal reaches manager maturity after the human court times out and
nobody has lapsed it, direct `manager.executeForfeit` remains permissionless.
Strictly preventing an appealed ruling from executing without affirmative human
approval would require new blocking state in the core manager; this peripheral
court cannot impose that rule.

## Policy and decision records

The policy document should name both governance systems, evidence formats and
availability, the penalty rubric, AI model/service and confidence-escalation
rules, human procedure, timing assumptions, keeper duties, and versioning. New
terms require a new court deployment.

Each primary or human `decisionHash` should bind a canonical bundle containing
the chain ID, manager, court, commitment ID, case ID, commitment metadata hash,
evidence manifest, requested and awarded penalty, policy/model version,
rationale, and relevant DAO proposal IDs. `appealHash` should bind the appeal
record and evidence additions. These hashes provide integrity and an audit
trail; the contract does not evaluate natural-language evidence or prove that an
AI or human decision was correct.

See the generated [`TwoTierArbiter` contract reference](../reference/contracts/periphery/arbiters/TwoTierArbiter.md)
for the complete ABI and events.
