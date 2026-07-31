---
title: Mutual aid agreement
status: current
---

# Mutual aid agreement

Two parties can use an Agreement when each commits a bounded position and a shared arbiter may route routine support in either direction.

## Shape

The proposal contains independent LegTerms for proposer and acceptor. Each leg selects its backing token, adapter, amount, maximum penalty, and strategy set. For a same-token mutual-aid agreement, both legs may use the same token and adapter while retaining independent amounts and penalties.

maxFlowProposerToAcceptor and maxFlowAcceptorToProposer are lifetime settlement caps. Accepting the proposal is explicit consent to those caps.

## Flow

The proposer deposits backing into the manager and calls proposeAgreement. The manager encumbers the proposer leg immediately. The acceptor deposits its backing and calls acceptAgreement; the manager encumbers the second leg and creates the linked commitment pair.

On a covered event, the shared arbiter calls settleAgreement. The manager moves the requested units from the payer's encumbered ledger position to the receiver's free balance, updates the payer's commitment amount and exposure totals (the receiver leg is untouched), and records cumulative directional flow. Tokens remain in manager custody.

Either direction may be disabled with a zero cap. Settlement above a remaining cap reverts.

## Terminal outcomes

releaseAgreement returns each remaining leg amount to its committer free balance. forfeitAgreement initiates the two-phase forfeit path on both legs; the requested penalty must remain within each leg maximum.

## References

- Interface: src/core/interfaces/ICommitmentManager.sol
- Implementation: src/extensions/agreements/AgreementLib.sol
- Tests: test/manager/Agreement.t.sol
- Standard: ../../standards/ERC-COMMITMENTS-AGREEMENTS.md
