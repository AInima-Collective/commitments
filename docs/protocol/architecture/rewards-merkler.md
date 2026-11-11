---
title: Rewards updater
status: current
order: 6
---

# Rewards updater

MerkleSnapshot is policy-neutral: its updater may be an EOA, multisig, governor, or contract. The repository ships no updater contract; a service that validates signed operator envelopes can write its own handler that forwards `submitRoot` to the snapshot.

## Trust model

The snapshot enforces updater authorization and activation timing only. Whatever validates a root before it reaches `submitRoot` (operator membership, signing keys, voting power, quorum, replay protection) lives outside Rewards.

A bad updater can submit a bad root, so the service must monitor new roots during the snapshot activation delay and disable a fraudulent root before activeAt. Forfeiture or other consequences for malicious operators are configured through the service commitment policy; Rewards does not automate them.

## Off-chain root construction

The repository does not contain or normatively require a particular merkler service, Rust crate, IPFS schema, cron cadence, or weighting algorithm. Those are deployment-specific operational choices. Any root builder must reproduce the leaf encoding in ICommitmentsRewardsCoordinator and retain enough data for earners to obtain proofs.

## References

- Snapshot: src/extensions/rewards/MerkleSnapshot.sol
- Tests: test/rewards/MerkleSnapshot.t.sol
