---
title: Deployment Guide
status: current
---

# Deployment Guide

Deploy implementations and initialize proxies in the same transaction; do not deploy an uninitialized proxy and configure it later. Use the proxy address, not the implementation address, in downstream configuration.

No address in this page is a canonical production deployment. Verify the selected network, deployer, admin, and broadcast output independently.

## Integrated deployment

script/DeploySepolia.s.sol is the current composed reference deployment for a development network. It deploys the selected stack in dependency order, wires the manager to OperatorRegistry, and optionally includes governance and Rewards.

A typical broadcast uses:

~~~text
forge script script/DeploySepolia.s.sol:DeploySepolia --rpc-url <RPC_URL> --broadcast
~~~

Read the environment-variable block in that script before use. PRIVATE_KEY, ADMIN_ADDRESS, token mode, service thresholds, optional feature flags, and network-specific settings are deployment inputs, not protocol defaults.

## Dependency order

1. Deploy any backing token or use an existing token.
2. Optionally deploy CommitmentsVault and a compatible yield strategy. Vault shares are ordinary manager backing; no vault-to-manager wiring exists.
3. Deploy CommitmentManager. Forge publishes and links its external libraries automatically.
4. Deploy adapters, distribution strategies, and chosen arbiters.
5. Deploy OperatorRegistry with the manager, required arbiter, required token, and stake policy.
6. Call manager.setOperatorRegistry(registryProxy).
7. Deploy the Mesh implementations and MeshFactory, then a TokenWeighting node whose provider is the OperatorRegistry proxy. Its provider is fixed at deployment.
8. As the node's governance, set a non-zero weight for operatorRegistry.stakeDenom().
9. Call operatorRegistry.setMeshWiring(tokenWeighting, meshFactory). Registered and delegated stake reaches the node from then on.
10. Deploy OperatorServiceRegistry with OperatorRegistry and that TokenWeighting node as its voting-power source.
11. Optionally deploy governance and Rewards. Only the GovernorFactory's deployer may call setCanonicalGovernor, once. Rewards services create their snapshot/coordinator pairs through RewardsCoordinatorFactory.

## Verification checklist

- record implementation, proxy, library, factory, and immutable dependency addresses;
- confirm every proxy implementation slot and initializer result;
- confirm each DEFAULT_ADMIN_ROLE, PAUSER_ROLE, and UNPAUSER_ROLE recipient;
- compare linked manager bytecode with the expected build and library addresses;
- verify the configured challenge floor is at least one day, then verify unbonding, pause-budget, threshold, quorum, and activation-delay values;
- transfer or renounce deployer privileges only under an approved governance plan;
- preserve the Foundry broadcast record and a machine-readable deployment manifest.

## Local rehearsal

Run the deployment without broadcast against Anvil first, then execute the relevant integration tests. script/Simulate.s.sol provides a larger local composition used by the frontend and integration workflow; it is not a production deployment manifest. Its `CHALLENGE_WINDOW` override must still satisfy the shipping manager's one-day minimum.
