---
title: Pending-Issue Subagent Workflow
status: current
---

# Pending-issue subagent workflow

This workflow turns `PENDING_GH_ISSUES.md` into small, reviewable changes before
the remaining drafts are opened on GitHub. The integration branch is
`follow-up-work`; subagents never implement directly in its working tree.

## 1. Triage gate

Start with a read-only audit. For every draft, record concrete code and test
locations, dependencies on other drafts, acceptance criteria that require an
external system or a protocol-policy decision, and the smallest validation
command that could prove a fix.

Assign implementation only when all of the following are true:

- the repository contains enough information to choose the behavior;
- the change has a bounded file and subsystem scope;
- its acceptance criteria can be tested locally, apart from a clearly named CI
  or deployment confirmation;
- it does not depend on another unmerged draft; and
- one reviewer can explain its safety invariant before reading the patch.

Security-sensitive work may still be bounded, but it must receive adversarial
tests and an explicit review of failure behavior. A partial mitigation does not
close a security draft.

## 2. Isolated implementation

Use one branch and one worktree per issue:

```bash
git worktree add -b agent/issue-<n>-<slug> \
  /tmp/commitments-issue-<n> follow-up-work
```

Each assignment must state:

- the exact issue and acceptance criteria in scope;
- files or subsystems the agent owns;
- required tests and baseline failures already known;
- whether generated artifacts and documentation are part of the change; and
- that `PENDING_GH_ISSUES.md` and the integration worktree are integrator-owned.

An implementation is ready for integration only when its worktree is clean and
the agent reports a commit SHA, changed files, validation results, and remaining
caveats. Agents do not merge, rebase, publish issues, or modify another agent's
worktree.

## 3. Integration review

The integrator reviews the commit before cherry-picking it onto
`follow-up-work`:

1. Compare the patch with every acceptance criterion.
2. Look for weakened tests, hidden fallbacks, stale generated artifacts, and
   scope added without authorization.
3. Cherry-pick the reviewed commit; resolve conflicts in the integration
   worktree, not in an agent worktree.
4. Run the smallest targeted check first, then the relevant workspace check.
5. Run cross-cutting checks after all accepted commits are present.
6. Update the pending inventory: `resolved` means the draft should not be
   opened; `prerequisite landed` means keep the larger draft and mention the
   completed prerequisite.

Use focused commits so a failed lane can be reverted without discarding other
accepted work. Remove worktrees only after their commits are integrated and
verified.

## 4. Validation matrix

| Change area | Required checks |
| --- | --- |
| Solidity dependencies | clean clone, recursive submodule initialization, `forge build --sizes`, start `forge test` |
| Solidity behavior | focused Forge suite, affected conformance/storage tests, `forge build --sizes` |
| Indexer | focused Node tests, `pnpm --filter @commitments/indexer test`, `pnpm typecheck` |
| Frontend writes | focused Vitest coverage, `pnpm --filter @commitments/frontend test`, typecheck, production build |
| Workspace/CI | `pnpm test`, `pnpm typecheck`, frontend lint and Stylelint, production build, workflow lint when available |
| Documentation/generated ABI | repository docs checks and the documented generation command, followed by a clean diff review |

For a known baseline failure, record it before implementation and require the
agent to show that its lane either fixes it or leaves exactly the same failure.

## 5. Current queue (2026-08-03)

| Draft | Disposition before opening an issue |
| --- | --- |
| 1. Foundry gitlinks | Resolved on `follow-up-work`; do not open. |
| 2. Metadata SSRF | Resolved on `follow-up-work`; do not open. |
| 3. Wallet network guard | Open after designing a shared guard across all write and multi-step flows. |
| 4. ABI-binding test | Resolved on `follow-up-work`; do not open. |
| 5. Full workspace CI | Resolved on `follow-up-work`; do not open. |
| 6. Pinning quotas | Choose hosted authorization, trusted-proxy, shared-limiter, and CORS policy first. |
| 7. Deployment manifest | Resolved on `follow-up-work`; the Sepolia prerequisite has landed. |
| 8. Async enrichment | Open as an architecture issue covering durable jobs, reorgs, backpressure, and observability. |
| 9. Sepolia deployment | Keep open; local wiring can land, but broadcast, verification, and public smoke testing require external access. |
| 10. Forfeit cancellation cycles | Open only after selecting the bounded re-initiation and exit-precedence policy. |
| 11. One-day challenge floor | Resolved on `follow-up-work`; do not open. |
| 12. Authoritative unbond maturity | Open as a coordinated storage, ABI, indexer, frontend, and documentation change. |
| 13. Service-local quorum | Open as a checkpointed aggregation design; an unbounded operator loop is not acceptable. |
| 14. BPS/WAD constants | In progress as the final mechanical implementation lane. |

The queue is an execution snapshot, not a substitute for the issue drafts.
Update it when dependencies or repository behavior change.
