---
title: Post-Deploy Configuration
status: current
---

# Post-Deploy Configuration

Configuration is contract-specific. Read current values from the deployed proxies before changing them, and use a timelock or multisig for production administration.

## CommitmentManager

The initializer sets the admin, committer unbonding period, and lifetime forfeiture-pause budget. The admin receives DEFAULT_ADMIN_ROLE, PAUSER_ROLE, and UNPAUSER_ROLE.

After OperatorRegistry is deployed, call setOperatorRegistry once from the manager admin. The manager checks the registry binding. forceSetOperatorRegistry is an emergency admin surface and should require an explicit incident or migration plan.

Other admin parameters include minChallengeWindow and hookGasCap. Pause and unpause use separate roles. A pause stops forfeiture execution under the documented pause budget; it does not move custody or erase proposals.

## OperatorRegistry

Initialization fixes the manager binding and initial acceptance policy: required arbiter, required token, minimum operator stake, maximum delegations, and minimum maxPenaltyBps.

The admin may tighten policy, update capacity parameters, and allow distribution strategies as exposed by the contract. Verify that every accepted commitment names the intended registry counterparty and arbiter. setMeshWiring connects the registry to a TokenWeighting node and MeshFactory when Mesh propagation is used.

## OperatorServiceRegistry

Initialization binds OperatorRegistry and an IVotingPowerSource and sets threshold plus quorum. Configure service metadata, maximum reference-block age, threshold, and quorum according to the signer threat model.

Changing the voting-power source changes the security input for future validations. Treat it like an upgrade and verify historical checkpoint support before switching.

## CommitmentsVault

A vault admin controls deposit pause/unpause, metadata, yield-strategy replacement, and UUPS upgrades. There is no commitment-manager address on the vault.

Before setYieldStrategy, drain the old strategy as required by the contract. The new strategy must report the same asset and must be bound to that vault. totalAssets includes both strategy assets and any transient idle asset balance.

## Rewards

RewardsCoordinatorFactory fixes shared implementation addresses and the minimum activation delay. Each deployed MerkleSnapshot stores its service, active updater, delay, and immutable delay floor. The service stages updater changes and can disable only roots that have not activated.

The paired coordinator binds its service and snapshot. Fund it before publishing claimable cumulative roots. The service controls freeze state and upgrades; the updater only submits roots through the snapshot.

## Role handoff

For every proxy:

1. grant the final governance or multisig roles;
2. verify the role on-chain;
3. revoke temporary deployer roles;
4. record the transaction and expected authority graph.

Do not renounce the only admin until upgrade and emergency ownership are intentionally immutable.
