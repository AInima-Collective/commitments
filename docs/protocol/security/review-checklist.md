---
title: Security review checklist
status: current
---

# Security review checklist

Use this checklist with the full test suite. Test names are navigation aids, not proofs by themselves.

## CommitmentManager

- Per-token free, encumbered, escrow, mutual-premium, and mutual-junior aggregates reconcile to token balance.
- Fee-on-transfer deposits credit measured receipts.
- Only free balance can be withdrawn.
- Creation cannot exceed free balance or forfeitable-exposure allocation.
- Release, expiry, unbond, and forfeit paths close once and update exposure exactly.
- Forfeit execution respects challenge windows, pause state, pause budget, and penalty maximum.
- Beneficiary proceeds are pull payments in manager free balance.
- Strategy bindings are immutable and movement validation prevents unauthorized token, recipient, or amount changes.
- Failed lifecycle hooks do not roll back custody transitions and are recoverable.
- Agreement legs retain independent terms and settlement stays within both directional caps.
- Mutual loss and premium partitions remain independent.

Primary suites: test/manager/, test/manager/conformance/, test/manager/integration/, and test/StorageSlots.t.sol.

## Vault and adapters

- CommitmentsVault obeys ERC-4626 deposit, mint, withdraw, and redeem semantics.
- Deposit pause does not corrupt existing withdrawals.
- totalAssets counts strategy assets and idle vault assets.
- Strategy replacement rejects a live old strategy or a mismatched new binding.
- ERC4626Adapter and ERC20StaticAdapter are read-only and use the documented denomination.

Primary suites: test/vault/ and test/adapters/Adapters.t.sol.

## Agreements, Mutuals, Mesh, and Services

- Linked libraries use only CommitmentManagerStorage.
- Mutual valuation authority cannot also be the loss arbiter.
- Loss attribution and premium indices cannot exceed their bounded reserves.
- Mesh allocation, retirement, path walking, and historical weighting are bounded.
- Registry acceptance policy checks token, arbiter, penalty floor, active state, and strategy allow-list.
- Signed-envelope validation binds service, payload, reference block, signing keys, threshold, quorum, and replay state.

Primary suites: test/manager/Agreement.t.sol, test/manager/Mutual.t.sol, test/mutual/, test/mesh/, test/registry/, and test/services/.

## Rewards

- Factory deployment initializes the snapshot before the coordinator without circular wiring.
- Only the active snapshot updater submits a root.
- Root disable is impossible after activation.
- Updater changes honor staging and explicit activation.
- Claims verify the caller-bound cumulative leaf and pay only the positive delta.
- Claimed totals never decrease and insufficient funding fails safely.
- Freeze and upgrade authority belong to the service, not the updater.

Primary suites: test/rewards/ and test/conformance/RewardsCoordinatorInvariants.t.sol.

## Commands

Run forge fmt --check, forge build --sizes, and forge test -vvv. Run the repository documentation, selector, frontend, indexer, and formal-verification gates defined by the root task runner and CI.
