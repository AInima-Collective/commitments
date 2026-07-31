---
title: Rewards updater adapter
status: current
order: 6
---

# Rewards updater adapter

MerkleSnapshot is policy-neutral: its updater may be an EOA, multisig, governor, or adapter contract. MerkleSnapshotAdapter is the shipped optional adapter for services that already validate signed operator envelopes.

## Shipped boundary

src/extensions/rewards/MerkleSnapshotAdapter.sol implements IServiceHandler. Its handleSignedEnvelope entry point is callable only by the configured service manager. It decodes the root from the service payload and forwards submitRoot to the configured snapshot.

The adapter is set as the snapshot updater. The snapshot continues to enforce updater authorization and activation timing; the adapter does not modify snapshot storage or coordinator claims.

## Trust model

A service-manager deployment decides how operator membership, signing keys, historical voting power, quorum, and replay protection are validated before it calls the handler. That policy lives in the Services extension, not in Rewards.

A bad quorum can submit a bad root, so the service operator must monitor new roots during the snapshot activation delay and disable a fraudulent root before activeAt. Forfeiture or other consequences for malicious service operators are configured through the service commitment policy; Rewards does not automate them.

## Off-chain root construction

The repository does not contain or normatively require a particular merkler service, Rust crate, IPFS schema, cron cadence, or weighting algorithm. Those are deployment-specific operational choices. Any root builder must reproduce the leaf encoding in ICommitmentsRewardsCoordinator and retain enough data for earners to obtain proofs.

## References

- Adapter: src/extensions/rewards/MerkleSnapshotAdapter.sol
- Snapshot: src/extensions/rewards/MerkleSnapshot.sol
- Service handler: src/extensions/services/interfaces/IServiceHandler.sol
- Service verifier: src/extensions/services/service-registry/ServiceEnvelopeVerifier.sol
- Tests: test/rewards/MerkleSnapshotAdapter.t.sol
