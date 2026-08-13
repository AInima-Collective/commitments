---
title: Contract Interactions
status: current
---

# Contract Interactions

This page summarizes the shipped call boundaries. Exact parameters, authorization, and events are defined by src/core/interfaces/ICommitmentManager.sol and the generated reference.

## Deposit and create

A user first approves the manager for a backing token, then calls deposit(token, amount) or createAndFund(depositAmount, params). The manager measures the received amount and credits the user free balance. createCommitment(params) moves params.amount from free to encumbered ledger state and stores the commitment.

Backing may be an ordinary ERC-20 or an ERC-4626 share token. The manager interacts with it only as an ERC-20; a configured IBackingAdapter supplies read-only index and denomination information to distribution strategies.

## Release, unbond, and expiry

The commitment arbiter may call releaseCommitment. The committer may use requestUnbond followed by finalizeUnbond after the manager unbonding period, subject to the commitment state and arbiter controls. expireCommitment closes a commitment whose effective expiry has passed.

A normal close moves the remaining encumbered amount back to the committer free balance. The token stays in manager custody until the user calls withdraw(token, amount).

## Two-phase forfeit

The arbiter calls initiateForfeit(commitmentId, penaltyBps). After the manager's pause-adjusted forfeit execution delay, anyone may call executeForfeit while forfeiture is not paused. The contract field is named `challengeWindow`, but the timer does not itself grant the committer a generic on-chain challenge method. The manager moves the penalized amount from the committer encumbered balance to the counterparty free balance and returns the residual to the committer free balance.

Forfeiture can be paused at the manager. cancelForfeit is arbiter-authorized, while stale proposals have a separate permissionless cleanup path. No vault burn or withdrawal queue participates in this flow.

## Distribution strategies

Each commitment binds zero or more StrategyBinding entries. distribute(commitmentId, strategy) asks the strategy to calculate token movements and lets the manager validate and execute those movements. claim and distributeAndClaim support strategy-specific pull claims. Strategy escrow is accounted per token and strategy inside the manager.

The manager is the only token mover. A strategy describes allowed movements through IDistributionStrategy; it does not receive arbitrary custody authority.

## Agreements

proposeAgreement stores two independent LegTerms records and encumbers the proposer leg. acceptAgreement encumbers the acceptor leg and creates the linked commitments. Each leg may use a different token, adapter, amount, maximum penalty, and strategy set.

settleAgreement moves bounded units of the payer leg token from the payer encumbered balance to the receiver free balance; only the payer leg amount and exposure change. releaseAgreement and forfeitAgreement operate across both legs. The linked AgreementLib is invoked by the manager through delegatecall, so it shares the manager storage namespace and authorization context.

## Mutuals

Mutual members join with existing commitments. A validated mutual loss advances a shared loss index; settleMemberLoss realizes an individual member obligation into the mutual beneficiary free balance. Premium funding and claims use a distinct live-capacity index. MutualLib is another linked manager library and does not hold tokens itself.

## Services and callbacks

OperatorRegistry reads manager commitments when operators register or receive delegations. Once configured through setOperatorRegistry, the manager calls the registry lifecycle hooks for tracked delegation commitments. OperatorServiceRegistry reads the operator registry and an IVotingPowerSource to validate service membership and historical voting power.

Mesh nodes are accounting components. They do not move manager-held backing.

## Optional vault composition

CommitmentsVault accepts and redeems its own ERC-4626 shares with instant standard ERC-4626 exits. When its shares back a commitment, the user deposits those shares into the manager. ForfeitDonationBeneficiary is an optional counterparty that can withdraw forfeited vault shares from its manager free balance, redeem them, and donate the underlying to a target vault.
