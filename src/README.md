# Solidity source layout

The shipped Solidity contracts are the source of truth for protocol behavior,
ABI, authorization, accounting, custody, and storage. Standards and guides
describe this tree; they do not override it.

## Ownership boundaries

| Directory | Owns |
|---|---|
| `core/` | Core interfaces and the complete reference commitment manager |
| `backing/` | Concrete implementations of Core backing valuation |
| `distributions/` | General commitment value-flow implementations |
| `extensions/` | Agreements, Mutuals, Mesh, Services, and Rewards standards families |
| `periphery/` | Optional arbiters, vaults, governance, and development integrations |
| `shared/` | Cross-subsystem arbitration, factory, registry, voting, and utility infrastructure |
| `vendor/` | Externally sourced code with explicit provenance and modification policy |

Interfaces remain with the subsystem that owns their vocabulary. The exceptions
are deliberately cross-subsystem abstractions: `IVotingPowerSource` lives under
`shared/interfaces/`, while `IArbiter` and `ArbiterCapabilities` live under
`shared/arbitration/`. This prevents Mesh from depending on Services and prevents
the Mutual extension from depending on optional periphery.

Concrete Core ports are kept separate from their interfaces:

- `core/interfaces/IBackingAdapter.sol` is implemented by `backing/`.
- `core/interfaces/IDistributionStrategy.sol` is implemented by
  `distributions/` or an owning extension's qualified `distributions/` folder.
- Vault asset deployment uses the distinct
  `periphery/vaults/interfaces/IYieldStrategy.sol` and
  `periphery/vaults/strategies/` vocabulary.

## Dependency direction

`backing/` and `distributions/` depend on Core interfaces. Standards extensions
may depend on Core interfaces. Periphery should prefer public Core or extension
interfaces. Every project-owned area may depend on `shared/` and, when required,
`vendor/`.

The full reference manager intentionally composes two standards-owned libraries:

```text
core/manager/CommitmentManager
  -> extensions/agreements/AgreementLib
  -> extensions/mutuals/MutualLib

AgreementLib and MutualLib
  -> core/manager/storage + core/manager/libraries
```

This relationship is not a Solidity import cycle. `CommitmentManager` links the
external libraries, and those libraries execute by delegatecall against
`CommitmentManagerStorage`. Their extension paths express standards-family
ownership; they are not independently deployable plugins and must never be used
against unrelated storage.

The manager additionally links `CommitmentLifecycleLib`, `LedgerOpsLib`, and
`MovementLib`. The complete link and deployment topology is locked in
`script/compat-topology.json` and checked by `script/compat-snapshot.mjs`.

There are no compatibility copies at retired import paths. External Solidity
consumers must follow the repository import-path migration map.
