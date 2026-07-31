---
title: Architecture Overview
status: current
---

# Architecture Overview

The protocol separates a small custody kernel from standards-family extensions and optional periphery.

## Core and reference implementations

The CommitmentManager at src/core/manager/CommitmentManager.sol is the custody root. It holds backing tokens, accounts for each user free and encumbered balances, owns commitment lifecycle state, and executes every token movement.

Core exposes two economic ports:

- IBackingAdapter reads valuation metadata without taking custody.
- IDistributionStrategy validates and applies commitment-bound token movements.

The shipped adapters live under src/backing/, and the shipped strategies live under src/distributions/. The optional CommitmentsVault is a normal yield-bearing ERC-4626 whose shares may be deposited into the manager like any other ERC-20 backing token. The vault does not know about commitments, encumbrance, forfeiture, or manager wiring.

## Standards-family extensions

The reference manager links AgreementLib and MutualLib, so the deployed reference composition includes bilateral agreements and shared-loss mutuals without introducing a second custody contract.

Other extensions have separate contracts:

| Extension | Ownership |
|---|---|
| Agreements | src/extensions/agreements/ |
| Mutuals | src/extensions/mutuals/ |
| Mesh | src/extensions/mesh/ |
| Services | src/extensions/services/ |
| Rewards | src/extensions/rewards/ |

Mesh accounts for stake topology and voting power. Services register committed operators and validate signed envelopes. Rewards is an independent sibling standard that distributes deposits from cumulative Merkle roots; it does not read the commitment manager.

## Periphery and shared infrastructure

src/periphery/ contains optional compositions: arbiters, agent identity helpers, governance, and ERC-4626 vaults. None is required for Core conformance.

src/shared/ contains abstractions used across subsystem boundaries, including IArbiter, ArbiterCapabilities, IVotingPowerSource, registry bases, factories, and utilities. Vendored ERC-8004 code is isolated under src/vendor/erc8004/.

## Dependency direction

The intended dependency direction is:

1. shared abstractions and Core interfaces;
2. the Core manager and its libraries;
3. backing and distribution implementations;
4. extensions;
5. optional periphery.

AgreementLib and MutualLib are deliberate linked-library dependencies of the reference manager. The manager never delegates into Mesh, Services, Rewards, governance, arbiters, or vaults.

## Deployment patterns

| Component | Pattern |
|---|---|
| CommitmentManager | UUPS implementation behind ERC1967Proxy; EIP-7201 storage |
| OperatorRegistry and OperatorServiceRegistry | UUPS implementations behind ERC1967Proxy; EIP-7201 storage |
| CommitmentsVault | UUPS implementation behind ERC1967Proxy; EIP-7201 storage |
| MerkleSnapshot and CommitmentsRewardsCoordinator | per-service UUPS proxies |
| FanInNode, FanOutNode, TokenWeighting | initialized EIP-1167 clones |
| Factories and most arbiters | direct deployments |

Implementation constructors disable initializers where a proxy or clone is expected. Deployment scripts initialize new instances atomically.

## Source map

- Core interface: src/core/interfaces/ICommitmentManager.sol
- Manager: src/core/manager/CommitmentManager.sol
- Manager storage: src/core/manager/storage/CommitmentManagerStorage.sol
- Repository ownership rules: src/README.md
- Standards family: ../../standards/README.md
