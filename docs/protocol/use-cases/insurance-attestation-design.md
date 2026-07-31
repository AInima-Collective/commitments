---
title: Attested insurance policy
status: current
---

# Attested insurance policy

The shipped AttestationArbiter can turn a service-operator quorum decision into a commitment, agreement, or mutual action. A separate InsuranceAttestationArbiter contract is not part of this repository.

## Policy boundary

AttestationArbiter verifies a signed service envelope and dispatches a fixed action set. It does not decide whether a loss occurred. Operators must evaluate the policy terms and evidence off-chain before signing.

A policy should bind:

- the arbiter deployment and chain;
- the target commitment, agreement, or mutual;
- the covered event and evidence rules;
- the permitted penalty or loss calculation;
- signer threshold and quorum;
- envelope deadline and ordering sequence;
- challenge, cancellation, and escalation procedures.

Store the content-addressed policy in metadataURI and metadataHash where the manager surface provides them.

## On-chain flow

For a unilateral claim, the signed action may initiate forfeit with penaltyBps. The manager opens its normal challenge window and anyone executes after maturity. A signed cancellation can cancel the proposal before execution.

For bilateral or pooled coverage, the same arbiter also supports agreement forfeit, agreement settlement, mutual activation, mutual-loss initiation, and mutual-loss cancellation. The envelope binds the action-specific fields and an evidence hash.

ServiceEnvelopeVerifier validates signer membership, historical voting power, threshold, quorum, reference-block freshness, and replay state through the configured service manager. AttestationArbiter adds a per-target ordering sequence so an old envelope cannot act on a later proposal instance.

## Shipped alternatives

ManualArbiter uses an explicitly controlled owner for discretionary decisions. OptimisticInsuranceArbiter uses a bonded, timeout-driven claim game rather than an operator quorum. Select the trust model before creating the commitment because the arbiter address is part of its immutable terms.

## References

- Attested arbiter: src/periphery/arbiters/AttestationArbiter.sol
- Service verifier: src/extensions/services/service-registry/ServiceEnvelopeVerifier.sol
- Optimistic arbiter: src/periphery/arbiters/OptimisticInsuranceArbiter.sol
- Tests: test/arbiters/AttestationArbiter.t.sol and test/arbiters/OptimisticInsuranceArbiter.t.sol
