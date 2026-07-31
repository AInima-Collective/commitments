---
title: Full Protocol Docs
status: current
order: 0
---

# Full Protocol Docs

These pages explain the shipped contracts and how to operate them. Solidity is the source of truth for behavior and ABI; the [standards family](../standards/README.md) formalizes that implementation, and the [generated contract reference](reference/contracts/) is derived from NatSpec.

## Start here

| Need | Page |
|---|---|
| System boundaries and dependencies | [Architecture overview](architecture/overview.md) |
| Calls between the main components | [Contract interactions](architecture/contract-interactions.md) |
| Deploy and wire a stack | [Deployment](operations/deployment.md) and [configuration](operations/configuration.md) |
| Integrate a role or extension point | [Guides](#guides) |
| Review the implementation | [Security model](security/security-model.md), [review checklist](security/review-checklist.md), and [storage layout](architecture/storage-layout.md) |
| Find an interface or contract | [Reference index](reference/README.md) |

## Architecture

- [Architecture overview](architecture/overview.md)
- [Contract interactions](architecture/contract-interactions.md)
- [Storage layout](architecture/storage-layout.md)
- [Bilateral settlement](architecture/bilateral-settlement.md)
- [Why Mesh](architecture/why-mesh.md)
- [Rewards coordinator](architecture/rewards-coordinator.md)
- [Rewards updater adapter](architecture/rewards-merkler.md)

## Guides

- [Depositor](guides/depositor.md)
- [Arbiter](guides/arbiter.md)
- [Operator](guides/operator.md)
- [Integrator](guides/integrator.md)
- [Mutual](guides/mutual.md)
- [Service wiring](guides/service-wiring.md)

## Operations and security

- [Deployment](operations/deployment.md)
- [Post-deploy configuration](operations/configuration.md)
- [Security model](security/security-model.md)
- [Review checklist](security/review-checklist.md)
- [Privacy posture and add-on layers](../design/privacy.md) (design note, not current behavior)

## Use cases

Use-case pages show compositions of shipped primitives. Pages that discuss an unshipped component label it explicitly as future work.

- [Agent accountability bonds](use-cases/agent-bonds.md)
- [Cross-vault underwriting](use-cases/cross-vault-underwriting.md)
- [Mutual aid](use-cases/mutual-aid.md)
- [Two-party tranche](use-cases/two-party-tranche.md)
- [Insurance attestation design](use-cases/insurance-attestation-design.md)
- [APY/NAV-floor cover](use-cases/insure-apy-nav-floor.md)

## Build and test

Run forge build and forge test from the repository root. Solidity 0.8.27, Cancun EVM semantics, Foundry, and the pinned OpenZeppelin dependencies are defined by the repository configuration.
