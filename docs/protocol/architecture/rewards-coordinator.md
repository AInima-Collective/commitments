---
title: Rewards coordinator
status: current
order: 5
---

# Rewards coordinator architecture

Rewards is an independent sibling standard. It shares distribution-event vocabulary with Commitments but has no normative or on-chain dependency on the manager.

## Per-service pair

RewardsCoordinatorFactory deploys two plain ERC1967Proxy instances for each service:

1. MerkleSnapshot is deployed and initialized first with service, activation delay, delay floor, and updater.
2. CommitmentsRewardsCoordinator is deployed and initialized with service and the snapshot address.

There is no RewardsProxy contract, CREATE2 address prediction, or snapshot-to-coordinator circular reference. The factory source is src/extensions/rewards/RewardsCoordinatorFactory.sol.

## Snapshot authority

MerkleSnapshot stores roots and owns updater authorization. The active updater may submit a nonzero root once. Each root records submittedAt and activeAt. The service may disable it only before activation.

Updater replacement is delayed: the service stages or cancels a replacement, and anyone may activate it after the effective time. The service also controls the activation delay, subject to the immutable minimum, and authorizes snapshot upgrades.

## Claims and funding

The coordinator receives tokens through depositRewards. An earner calls processClaim with an active root, token, cumulative amount, and proof. Leaves bind earner, token, and cumulative amount. The coordinator pays only the positive difference from claimed[earner][token], then stores the new cumulative value.

The service may freeze and unfreeze claims and authorizes coordinator upgrades. The coordinator does not reserve funds per root; the updater and service must ensure promised cumulative amounts are funded.

## Security properties

- root content identifies a submission; duplicate roots are rejected;
- roots cannot be disabled after activation;
- cumulative claimed state never decreases;
- proof processing binds the caller as earner;
- state advances before token transfer and external token paths are reentrancy-guarded;
- the updater has no coordinator custody or upgrade authority.

## References

- Standard: ../../standards/ERC-COMMITMENTS-REWARDS.md
- Interfaces: src/extensions/rewards/interfaces/
- Snapshot: src/extensions/rewards/MerkleSnapshot.sol
- Coordinator: src/extensions/rewards/CommitmentsRewardsCoordinator.sol
- Factory: src/extensions/rewards/RewardsCoordinatorFactory.sol
- Tests: test/rewards/ and test/conformance/RewardsCoordinatorInvariants.t.sol
