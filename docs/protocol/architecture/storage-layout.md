---
title: Storage Layout
status: current
---

# Storage Layout

Upgradeable project contracts use EIP-7201-style namespaced storage. Each storage library fixes a namespace slot and exposes a Layout struct through an assembly accessor. Field order is append-only.

## Project namespaces

| Component | Storage source |
|---|---|
| CommitmentManager | src/core/manager/storage/CommitmentManagerStorage.sol |
| OperatorRegistry | src/extensions/services/operator-registry/OperatorRegistryStorage.sol |
| OperatorServiceRegistry | src/extensions/services/service-registry/OperatorServiceRegistryStorage.sol |
| CommitmentsVault | src/periphery/vaults/storage/CommitmentsVaultStorage.sol |
| CommitmentsRewardsCoordinator | src/extensions/rewards/storage/CommitmentsRewardsCoordinatorStorage.sol |
| MerkleSnapshot | src/extensions/rewards/storage/MerkleSnapshotStorage.sol |
| Shared Factory base | src/shared/factories/FactoryStorage.sol |

The vendored ERC-8004 registry retains its upstream namespace under src/vendor/erc8004/IdentityRegistryUpgradeable.sol.

## Manager storage ownership

CommitmentManagerStorage owns every state value used by Core, Agreements, and Mutuals because AgreementLib and MutualLib execute by delegatecall in the manager context. The layout includes:

- the free, encumbered, strategy-escrow, mutual-premium, and mutual-junior custody partitions and their per-token aggregates;
- commitment lifecycle, strategy bindings, exposure, forfeit, unbond, pause, and hook-recovery state;
- agreement proposals, per-leg bindings, linked commitment pairs, settlement caps, and contribution flags;
- mutual headers, memberships, loss proposals, premium reserves, and heterogeneous-mode configuration.

Extension libraries must use the canonical manager storage accessor. They must not introduce a competing namespace for state that belongs to the deployed manager composition.

## Upgrade rules

1. Never reorder, remove, or change the type of an existing Layout field.
2. Append new fields only after the current tail.
3. Preserve struct member order for structs stored inside mappings.
4. Preserve namespace strings and computed slot constants.
5. Review inherited OpenZeppelin storage and immutable values separately from project namespaces.
6. Compare the recursive storage type graph, not only top-level slot numbers.

Storage slot and offset probes live in test/manager/StorageSlots.t.sol and test/StorageSlots.t.sol.

## Clone and direct-deployment state

Mesh clones use ordinary instance storage rather than a UUPS namespace; each clone has isolated state and a one-time initializer. Directly deployed immutable factories and arbiters generally keep constructor-set immutable configuration. Those surfaces still require compatibility review even though they are outside an EIP-7201 Layout.
