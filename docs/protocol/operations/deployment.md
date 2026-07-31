---
title: Deployment Guide
status: current
---

# Deployment Guide

Use the repository Foundry scripts. They deploy implementations and initialize proxies in the same transaction; do not deploy an uninitialized proxy and configure it later.

No address in this page is a canonical production deployment. Verify the selected network, deployer, admin, and broadcast output independently.

## Integrated deployment

script/DeploySepolia.s.sol is the current composed reference deployment for a development network. It deploys the selected stack in dependency order, wires the manager to OperatorRegistry, and optionally includes governance and Rewards.

A typical broadcast uses:

~~~text
forge script script/DeploySepolia.s.sol:DeploySepolia --rpc-url <RPC_URL> --broadcast
~~~

Read the environment-variable block in that script before use. PRIVATE_KEY, ADMIN_ADDRESS, token mode, service thresholds, optional feature flags, and network-specific settings are deployment inputs, not protocol defaults.

## Component scripts

Use the smaller scripts when deployments are managed separately:

| Component | Script |
|---|---|
| CommitmentManager implementation and proxy | script/DeployCommitmentManager.s.sol |
| Backing adapters and distribution strategies | script/DeployAdaptersAndStrategies.s.sol |
| CommitmentsVault implementation and factory | script/DeployVaultFactory.s.sol |
| OperatorRegistry implementation and proxy | script/DeployOperatorRegistry.s.sol |
| Mesh implementations, factory, and example nodes | script/DeployMesh.s.sol |
| OperatorServiceRegistry implementation and proxy | script/DeployOperatorServiceRegistry.s.sol |
| Mutual periphery | script/DeployMutual.s.sol |
| Rewards implementations and factory | script/DeployRewardsCoordinator.s.sol |
| Governance implementations and factory | script/DeployGovernance.s.sol |

Each script documents its required and optional environment variables. Use the proxy address, not the implementation address, in downstream configuration.

## Dependency order

1. Deploy any backing token or use an existing token.
2. Optionally deploy CommitmentsVault and a compatible yield strategy. Vault shares are ordinary manager backing; no vault-to-manager wiring exists.
3. Deploy CommitmentManager. Forge publishes and links its external libraries automatically.
4. Deploy adapters, distribution strategies, and chosen arbiters.
5. Deploy OperatorRegistry with the manager, required arbiter, required token, and stake policy.
6. Call manager.setOperatorRegistry(registryProxy).
7. Deploy Mesh and choose an IVotingPowerSource.
8. Deploy OperatorServiceRegistry with OperatorRegistry and that voting-power source.
9. Optionally deploy governance and Rewards. Rewards services create their snapshot/coordinator pairs through RewardsCoordinatorFactory.

## Verification checklist

- record implementation, proxy, library, factory, and immutable dependency addresses;
- confirm every proxy implementation slot and initializer result;
- confirm each DEFAULT_ADMIN_ROLE, PAUSER_ROLE, and UNPAUSER_ROLE recipient;
- compare linked manager bytecode with the expected build and library addresses;
- verify configured challenge, unbonding, pause-budget, threshold, quorum, and activation-delay values;
- transfer or renounce deployer privileges only under an approved governance plan;
- preserve the Foundry broadcast record and a machine-readable deployment manifest.

## Local rehearsal

Run the deployment without broadcast against Anvil first, then execute the relevant integration tests. script/Simulate.s.sol provides a larger local composition used by the frontend and integration workflow; it is not a production deployment manifest.
