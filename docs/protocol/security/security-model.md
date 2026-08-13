---
title: Security Model
status: current
---

# Security Model

The central security boundary is CommitmentManager custody. Tokens enter the manager, remain partitioned by ledger state, and leave only through validated manager operations.

## Trust boundaries

| Actor or component | Authority |
|---|---|
| Committer | Deposits, creates commitments, requests permitted unbonding, and withdraws free balance |
| Commitment arbiter | Releases, initiates or cancels forfeits, and performs agreement or mutual actions granted by the selected surface |
| Manager admin | Upgrades the manager and changes bounded configuration and registry wiring |
| Manager pause roles | Pause or unpause forfeiture execution; lifetime pause accounting limits clock-stop effects |
| Distribution strategy | Proposes movements allowed by its binding; the manager validates and executes them |
| OperatorRegistry | Accepts commitments under configured stake policy and tracks operators and delegations |
| Service admin and signers | Set service policy and authorize signed envelopes |
| Rewards service | Controls reward upgrades, root disable timing, freeze state, and updater rotation |
| Rewards updater | Submits roots; cannot upgrade or withdraw coordinator funds |

Users choose their arbiter, strategies, adapter, counterparty, and optional extension composition. Those choices are part of each position threat model.

## Custody invariants

For each token, manager custody is partitioned into free, encumbered, strategy escrow, mutual premium reserve, and mutual junior reserve. Aggregate counters must equal the manager token balance. A transition updates both the individual ledger entry and aggregate in the same operation.

A commitment cannot allocate more forfeitable exposure than its encumbered amount. Closing a commitment removes its exposure exactly once. Forfeiture credits the beneficiary free balance rather than pushing an arbitrary external call.

## Lifecycle safety

- commitment identifiers and sentinel values do not overlap;
- release, expiry, unbond finalization, and forfeit execution are mutually consistent terminal paths;
- manager forfeits use a pause-adjusted execution delay and arbiter cancellation;
- mutual-loss proposals use their own challenge window and explicit veto path;
- pause-aware clocks cannot gain unlimited extensions beyond the configured lifetime budget;
- failed strategy hooks are recorded and can be retried without reverting the completed custody transition.

Agreement settlement is bounded by per-direction lifetime caps. Mutual loss attribution is capped and members settle lazily against their own backing.

## External-call posture

The manager uses SafeERC20 and balance-delta accounting where receipt amount matters. Public custody-changing paths are reentrancy-guarded or structured around checks-effects-interactions. Distribution strategies do not transfer manager tokens directly.

AgreementLib, MutualLib, and the linked manager libraries execute by delegatecall. Their code addresses are part of deployment compatibility and their storage access must remain within CommitmentManagerStorage.

## Optional vault boundary

CommitmentsVault is a separate ERC-4626 periphery contract. It has instant standard withdrawals, a deposit circuit breaker, a pluggable yield strategy, and its own admin. It has no manager callback authority. Depositing vault shares into the manager creates the same custody relationship as depositing another ERC-20.

## Upgradeability

UUPS proxies place upgrade authority in their configured admins or services. Implementation constructors disable initializers. Reviews must cover implementation storage, linked libraries, initializer arguments, immutable factory values, and proxy implementation slots.

## Monitoring

Monitor manager partition totals, pauses, proposals approaching execution, failed hooks, upgrades, registry policy changes, service quorum changes, reward root submissions, and updater rotations. Operational monitoring is not a substitute for on-chain authorization, but it is required to use challenge and disable windows.
