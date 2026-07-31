---
title: Two-party tranche
status: current
---

# Two-party tranche

A junior and senior participant can use a bilateral Agreement for bounded coupon-like transfers while both positions remain active.

## Terms

The junior is commonly the proposer. proposerLeg and acceptorLeg define the two backing positions independently. maxFlowProposerToAcceptor caps all routine junior-to-senior settlement over the agreement lifetime. Set the reverse cap to zero when the senior must never pay routine flow to the junior.

The shared arbiter policy determines when a coupon is due and calls settleAgreement with the amount and evidence hash. The manager enforces the cap and available encumbered balance but does not calculate an interest rate or observe off-chain performance.

## Loss posture

Routine settlement is not terminal. A true loss may use the normal forfeit path on a selected leg or forfeitAgreement when the agreed policy requires both leg proposals to be initiated. A beneficiary receives any executed forfeit in its manager free balance.

This composition does not create PT or YT tokens, pool depositors, or promise multi-tranche waterfall accounting. More than two tranches require a separate composition and risk analysis.

## References

- Interface: src/core/interfaces/ICommitmentManager.sol
- Implementation: src/extensions/agreements/AgreementLib.sol
- Tests: test/manager/Agreement.t.sol
