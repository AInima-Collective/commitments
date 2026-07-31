---
title: Bilateral settlement
status: current
order: 4
---

# Bilateral settlement and contributions

Agreements add bounded, reversible value flow between two named encumbered positions. They complement unilateral forfeiture, which is terminal and moves value only from a committer to a counterparty.

## Agreement ownership

proposeAgreement accepts independent proposerLeg and acceptorLeg terms. Each leg names its own token, adapter, amount, maximum penalty, and strategy bindings. The proposer amount is encumbered immediately. The named acceptor consents by calling acceptAgreement, which encumbers the second leg and creates the linked commitments.

AgreementLib lives at src/extensions/agreements/AgreementLib.sol but executes through the manager by delegatecall. It therefore uses CommitmentManagerStorage and preserves the manager caller, address, events, custody ledger, and authorization context.

## Settlement caps

settleAgreement(agreementId, fromProposer, units, evidenceHash) is arbiter-authorized. The proposal fixes a lifetime cap in each direction. A zero cap disables that direction.

Settlement moves the settled units from the payer's encumbered balance to the recipient's free balance inside the manager. Only the payer leg's commitment amount and exposure change; the recipient leg is untouched. It does not transfer ERC-20 tokens out of manager custody. Exposure accounting uses the before-and-after commitment amounts so basis-point rounding cannot accumulate drift.

Cross-token agreements are valid. A settlement amount is denominated in the payer leg token, and the recipient receives that token in its manager free balance, not re-encumbered under the agreement.

## Contributions

contributeEncumbered lets an active commitment accept additional backing. The committer first opts in through self-contribution; third parties may then contribute. Contributions are manager ledger movements and preserve the commitment penalty ratio.

## Closure

releaseAgreement closes both linked commitments. forfeitAgreement initiates the two forfeit proposals with a caller-supplied penalty bounded independently by each leg maximum. Each proposal still follows the normal challenge and execution path.

## References

- Interface: src/core/interfaces/ICommitmentManager.sol
- Implementation: src/extensions/agreements/AgreementLib.sol
- Storage: src/core/manager/storage/CommitmentManagerStorage.sol
- Tests: test/manager/Agreement.t.sol
- Standard: ../../standards/ERC-COMMITMENTS-AGREEMENTS.md
