# Commitments Protocol

A **commitment** is a stake-backed promise: capital locked behind an obligation, which a chosen arbiter can seize if the promise is broken.

Mechanically, each commitment is a **parameterized lien**: it names an arbiter empowered to forfeit, an optional counterparty, penalty bounds, a challenge window, and an optional expiry, and enforcement runs through a two-phase forfeit with a minimum one-day challenge window, so no one loses their stake in a single block. Because the lien is a standard primitive, it composes: two liens facing each other form a bilateral **agreement**, pooled liens form **mutual coverage** (several-liability insurance with streamed premiums), and a **mesh topology** aggregates committed stake into governance- and service-compatible voting power. Rewards, on-chain governance, and [ERC-8004](https://eips.ethereum.org/EIPS/eip-8004) agent identity for AI-agent bonds build on the same substrate: one primitive, scaling from a handshake between two parties to an insurance market.

Commitments makes an economic promise legible as a bounded lien on productive capital. A participant keeps a clearly attributable position while accepting explicit rules for release, forfeiture, distribution, or shared loss.

The design favors composition over a universal market contract:

- Core provides direct custody, commitment lifecycle, and validated token movements.
- Agreements and Mutuals add bilateral and pooled coordination without creating a second custody root.
- Mesh and Services translate committed positions into application-specific stake and signing policy.
- Rewards distributes service-funded value independently through cumulative Merkle roots.
- Optional vaults, arbiters, governance, and agent identity components remain outside conformance-critical Core.

## How it works

1. **Fund** — a user deposits tokens into the CommitmentManager, which tracks a per-(token, user) *free / encumbered* ledger.
2. **Commit** — the user creates a commitment: an amount of backing, an arbiter, an optional counterparty, penalty bounds, a challenge window, and an optional expiry. The backing is encumbered but never leaves productive use — a **backing adapter** prices it (`indexNow`, payout denomination) whether it's a plain ERC-20 or an appreciating 4626 share.
3. **Enforce** — if the promise is broken, the arbiter initiates a forfeit. A challenge window (minimum 1 day) allows dispute; after it elapses the forfeit executes and the payout is claimable pull-payment style.
4. **Release** — the arbiter can release a commitment at any time. The committer can release it after its expiry, or request an unbond and exit once the manager's unbonding period has passed. The unbonding period is one manager-wide value set by the admin. Released backing returns to the free balance.
5. **Distribute** — strategies bound to commitments move value (yield share, flat fees, premium streams, operator commissions) through a validated, invariant-checked movement pipeline.

## Key concepts

- **Commitment** — a stake-backed promise, implemented as a parameterized lien on manager-custodied backing: amount, arbiter, optional counterparty, penalty bounds, challenge window, optional expiry
- **Agreement** — a bilateral commitment with symmetric enforcement; both sides lock stake under one shared arbiter, and only that arbiter can trigger a forfeit
- **Backing adapter** — stateless pricer that lets any ERC-20 or appreciating ERC-4626 share serve as commitment backing
- **Distribution strategy** — pluggable contract that moves value (yield, fees, premiums) via a validated movement pipeline, bounded by the commitment it's bound to
- **Two-phase forfeit** — initiate, then a challenge window (minimum one day) before execution; payouts are pull-payment
- **Partition invariant** — `Σ(free + encumbered) + Σescrow + Σmutual premium == balanceOf(manager)` per token, fuzz-locked in the conformance suite
- **Magnitude allocation** — `totalForfeitable ≤ totalEncumbered` per (user, token); prevents over-commitment
- **Mesh topology** — composable FanIn/FanOut/Weighting graph for stake aggregation and governance integration
- **Mutual coverage** — groups share losses several-liability via a loss index Λ while premiums stream to underwriters

## Documentation

- [Documentation overview](docs/README.md) — authority policy and current entry points
- [Standards family](docs/standards/README.md) — core Commitments plus Agreements, Mesh, Mutuals, Rewards, and Services
- [Architecture overview](docs/protocol/architecture/overview.md) — five-layer stack, dependency graph, proxy patterns
- [Contract interactions](docs/protocol/architecture/contract-interactions.md) — sequence diagrams for key flows
- [Storage layout](docs/protocol/architecture/storage-layout.md) — EIP-7201 namespaced storage slots
- [Security model](docs/protocol/security/security-model.md) — threat model and trust assumptions
- [Deployment guide](docs/protocol/operations/deployment.md) — configuration and deployment
- [Use cases](docs/protocol/use-cases/) — agent bonds, NAV-floor insurance, attestation-based insurance, mutual aid, cross-vault underwriting, two-party tranches

The shipped Solidity contracts define current behavior and ABI. Standards formalize that implementation; generated references describe it mechanically; guides explain how to use it. Contract reference pages are generated from NatSpec via `just docs-gen`, and the frontend serves current material under its built-in `/app/docs/*` viewer.

### Role guides

| Role | Guide |
|------|-------|
| Depositor | [guides/depositor.md](docs/protocol/guides/depositor.md) |
| Operator | [guides/operator.md](docs/protocol/guides/operator.md) |
| Arbiter | [guides/arbiter.md](docs/protocol/guides/arbiter.md) |
| Two-tier court deployer | [guides/two-tier-arbiter.md](docs/protocol/guides/two-tier-arbiter.md) |
| Integrator | [guides/integrator.md](docs/protocol/guides/integrator.md) |
| Mutual member | [guides/mutual.md](docs/protocol/guides/mutual.md) |
| Service wiring | [guides/service-wiring.md](docs/protocol/guides/service-wiring.md) |

## Getting started

### Prerequisites

- [Foundry](https://book.getfoundry.sh/) (forge, cast, anvil)
- [just](https://github.com/casey/just), [pnpm](https://pnpm.io/) and Node 22.6+ for the frontend/indexer workspace
- Docker (**optional**) — only for the local IPFS node that gives seeded commitments their full metadata. Everything works without it; see below for exactly what changes.

### Build & test

```bash
git clone --recurse-submodules https://github.com/AInima-Collective/commitments.git
cd commitments
just build     # forge build
just test      # forge test
```

Foundry dependencies are committed as pinned git submodules, with revisions
recorded in `foundry.lock`. For an existing clone, restore the exact dependency
set with `git submodule update --init --recursive`; no floating `forge install`
step is required.

The suite is 1,000+ Foundry tests covering the manager ledger and commitment lifecycle, forfeit mechanics (including stale-proposal force-cancel), agreements, adapters and strategies, vault operations, mesh topology, services, mutual coverage, rewards, governance, gas benchmarks, and EIP-7201 storage-layout locks. A dedicated conformance suite (`test/manager/conformance/`) fuzzes the core ERC-Commitments invariants.

### Local development (anvil + indexer + frontend)

One command boots the whole stack — starts anvil in the background, deploys every contract, seeds depositors / operators / commitments / agreements / mutuals, and writes the fresh addresses into `frontend/.env.local`:

```bash
pnpm install       # installs the frontend + indexer workspace (run from repo root)
just ipfs-up       # optional, see below — start it BEFORE dev-up
just dev-up        # anvil + deploy + seed + env sync
just indexer-dev   # Terminal 2: Ponder indexer on :65422 (powers graph views)
just frontend-dev  # Terminal 3: Vite dev server on :5173
just dev-down      # stop the background anvil when done
```

Connect a wallet to `http://127.0.0.1:8545` (chain ID 31337) and import anvil's default private key (`0xac0974...ff80`) to interact with the seeded protocol. `just dev-up` also writes the indexer's deployment manifest (`indexer/deployments.31337.json`) from the seed's broadcast, so the indexer needs no manual configuration.

#### Commitment metadata, and why `just ipfs-up` is worth one command

Seeded commitments carry off-chain `commitment.v1` metadata — a title, a
description, tags, and a link to a full terms document — so the app shows what
each commitment is *about* rather than a bare `#12`. How much of that survives
depends on where the payload can be stored, because `metadataURI` is capped at
**512 bytes on chain**:

| | URI | what you get |
|---|---|---|
| **with `just ipfs-up`** | `ipfs://…` — 66 bytes at any size | full descriptions, plus a terms document per commitment that actually resolves |
| **without** | `data:application/json;base64,…` — carries the whole payload | one-sentence descriptions, no terms links |

An inline `data:` URI has to fit the entire document inside 512 bytes, which is
about 360 bytes of JSON — roughly one sentence once a terms link is present. An
`ipfs://` URI is 66 bytes no matter how long the document is.

Nothing else differs, and **no step requires Docker**: `just dev-up`, the
indexer, and the frontend all work with the daemon stopped. The pieces
auto-detect a node on the conventional ports, so there is nothing to export:

```bash
just ipfs-up   # Kubo via docker compose: API on :5001, gateway on :8080
just dev-up    # detects it, pins the full payloads, writes VITE_IPFS_GATEWAY
```

Set `IPFS_API_URL=none` to force the inline path even with a daemon running
(that is how the no-Docker path gets tested). If a node is up but pinning fails
or times out, the seed logs it and falls back to the inline payloads rather than
aborting — an IPFS problem should never block a deploy.

Payload text lives in `script/metadata/catalogue.mjs`, one entry per seeded
commitment with a `full` and a `short` variant. `script/pin-metadata.mjs` runs
before the seed (it is the first line of `just anvil-seed`) and writes
`script/metadata-manifest.json`, which `Simulate.s.sol` reads back — the seed is
Solidity and cannot POST to IPFS, and `metadataURI` is immutable once written,
so the pinning has to happen first.

### Deploy

`script/DeploySepolia.s.sol` deploys a full testnet stack and `script/Simulate.s.sol` deploys and seeds the local stack. See the [deployment guide](docs/protocol/operations/deployment.md) for ordering, configuration, and environment variables.

## Formal verification

`verification/` holds a three-tool stack — Certora CVL specs, Halmos bounded symbolic execution, and Medusa coverage-guided fuzzing — with the property inventory in [`verification/PROPERTIES.md`](verification/PROPERTIES.md):

```bash
just fv-halmos            # symbolic execution of verification/halmos/ harnesses
just fv-certora-check     # compile + typecheck the CVL specs locally
just fv-medusa 3600       # hour-long coverage-guided fuzz campaign
```

## Standards

| Standard | Usage |
|----------|-------|
| [ERC-4626](https://eips.ethereum.org/EIPS/eip-4626) | Yield-bearing vaults; canonical commitment backing via the ERC4626Adapter |
| [EIP-7201](https://eips.ethereum.org/EIPS/eip-7201) | Namespaced storage on every long-lived contract (slot tests cover the manager, vault, operator registry and rewards contracts) |
| [EIP-1153](https://eips.ethereum.org/EIPS/eip-1153) | Transient-storage reentrancy guard on the manager's ledger and lifecycle flows |
| [ERC-1967](https://eips.ethereum.org/EIPS/eip-1967) / UUPS | Upgradeable singletons (manager, registries) and per-asset vault proxies |
| [EIP-1167](https://eips.ethereum.org/EIPS/eip-1167) | Minimal proxy clones for mesh node deployment |
| [ERC-8004](https://eips.ethereum.org/EIPS/eip-8004) | Agent identity registry for AI-agent bonds |

## Repository structure

```
src/
  core/            Manager custody root, aggregate interfaces, lifecycle libraries
  backing/         Backing adapters (ERC20Static, ERC4626)
  distributions/   Distribution strategies (yield, fees, and premiums)
  extensions/      Agreements, mutuals, mesh, services, and rewards families
  periphery/       Agents, arbiters, governance, and vault products
  shared/          Arbitration, factories, interfaces, registries, utilities
  vendor/          Byte-preserved third-party Solidity (ERC-8004 registry)
test/              Foundry tests by subsystem; conformance suites in test/<subsystem>/conformance/
verification/      Certora + Halmos + Medusa formal verification stack
script/            DeploySepolia.s.sol, Simulate.s.sol (full-stack anvil seeder), and Node tooling
docs/              Standards, current protocol docs, and design drafts
frontend/          React + Vite + wagmi dapp (pnpm workspace)
indexer/           Ponder indexer with GraphQL + REST endpoints
```

## Prior work and gratitude

This protocol builds on ideas from earlier restaking and shared-security work in the Cosmos ecosystem:

- [Mesh Security](https://github.com/osmosis-labs/mesh-security) — cross-chain shared security where chains mutually stake to secure each other, proposed by Sunny Aggarwal at Cosmoverse 2022 and implemented in CosmWasm by [Ethan Frey](https://github.com/ethanfrey) and the Confio team. The mesh topology layer here (fan-in/fan-out nodes aggregating stake into voting power) descends from that model.
- [cw-commitments](https://github.com/Lay3rLabs/cw-commitments) — a CosmWasm smart contract implementation of restaking by Layer, whose commitment vocabulary and custody model partially inspired this protocol.

Special thanks to [Spencer Graham](https://github.com/spengrah) for crucial feedback on the design of the protocol.

## License

[MIT](LICENSE)
