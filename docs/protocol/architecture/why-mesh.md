---
title: Why Mesh
status: current
---

# Why Mesh?

Core owns backing custody and commitment lifecycle. Mesh answers a separate question: how should committed stake be represented, combined, allocated, and weighted for consumers?

Keeping these concerns separate prevents consumer-specific topology policy from expanding the manager custody and authorization surface.

## Nodes

| Node | Responsibility |
|---|---|
| TokenWeighting | Applies governance-set basis-point weights to denominated stake and exposes historical voting power through IVotingPowerSource |
| FanOutNode | Allocates one provider and denomination across bounded consumer outflows |
| FanInNode | Aggregates registered provider denominations into a consumer denomination |
| FlowPathLib | Walks a composed topology for read-only discovery with depth and cycle protection |

Mesh nodes account for stake; they do not custody manager tokens or execute commitment forfeits.

## Deployment and policy

MeshFactory creates initialized EIP-1167 clones. It supports ordinary deployments and deterministic clone addresses for FanInNode, FanOutNode, and TokenWeighting. Factory allow-list and deny-list policy applies to the implementation types; it does not grant custody permissions.

A service typically uses TokenWeighting as its IVotingPowerSource. OperatorServiceRegistry samples that source at historical blocks when checking signed envelopes. OperatorRegistry can also be wired to a token-weighting node and mesh factory for operator stake propagation.

## Dependency boundary

Mesh owns src/extensions/mesh/. The cross-subsystem IVotingPowerSource interface lives in src/shared/interfaces/ because Mesh implements it, Services consumes it, and governance adapts it.

Core does not import Mesh contracts. A failure in a Mesh node can affect voting-power or allocation policy for its consumers, but cannot directly withdraw manager-held backing.

## References

- Standard: ../../standards/ERC-COMMITMENTS-MESH.md
- Interfaces: src/extensions/mesh/interfaces/
- Factory: src/extensions/mesh/MeshFactory.sol
- Shared voting-power interface: src/shared/interfaces/IVotingPowerSource.sol
- Tests: test/mesh/
