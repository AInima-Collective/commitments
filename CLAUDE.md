# Commitments — project guide for future-me

A Solidity protocol for **on-chain enforceable agreements backed by productive
capital**: a direct-custody CommitmentManager (per-(token,user) free/encumbered
ledger) → backing adapters that price any ERC-20/4626 token → parameterized
liens (commitments) → two-phase forfeiture arbitrated by a designated arbiter →
pluggable distribution strategies for all value flows → bilateral agreements
→ a mesh topology that aggregates stake into governance / service-compatible
voting power. Yield-bearing ERC-4626 vaults are the canonical *backing*: the
manager custodies vault shares while the underlying keeps earning.

This file is the entry point for every new session. Read it, then jump to the
relevant subsystem. The README is for humans; this file is for me. Neither file
is protocol authority: the shipped Solidity contracts define current behavior
and ABI, current standards formalize them, and generated references describe
them mechanically.

---

## Repo layout (it's a pnpm workspace + Foundry project)

```
src/                Solidity contracts (single foundry.toml, solc 0.8.27, cancun)
  core/             CommitmentManager custody root, aggregate interfaces,
                    namespaced storage, and manager lifecycle libraries
  backing/          ERC20StaticAdapter and ERC4626Adapter pricing lenses
  distributions/    Reference yield and fee distribution strategies
  extensions/       Standards-owned Agreements, Mutuals, Mesh, Services, Rewards
                    (AgreementLib and MutualLib delegatecall against core storage)
  periphery/        Agent identity, arbiters, governance, and vault products
  shared/           Project-owned arbitration, factories, interfaces,
                    registries, and utilities reused across subsystems
  vendor/           Byte-preserved third-party sources; never edit or forge-fmt
                    the canonical ERC-8004 registry

test/               Foundry tests, mirrors src/ + manager/conformance/ for the
                    partition/magnitude invariant fuzz (INV-1..INV-10, ERC numbering)
script/             Deploy scripts + Simulate.s.sol (full-stack anvil seeder)
verification/       Certora + Halmos + Medusa formal verification stack
docs/               Contracts-first overview, standards family, current protocol
                    guides/reference, and design drafts
                    (forge doc → out/src → script/forge-doc-flatten.mjs →
                    docs/protocol/reference/contracts/<source-path>/<Declaration>.md)

frontend/           Vite + React 19 + wagmi v3 + viem dapp (@commitments/frontend)
indexer/            Ponder indexer, pglite in dev (@commitments/indexer)
broadcast/          Foundry deploy artifacts (parsed by indexer + frontend env writer)
```

`pnpm-workspace.yaml` ties `frontend/` and `indexer/` together. Install from
the repo root: `pnpm install`. Foundry is independent — `forge build` /
`forge test` from the same root.

---

## Working commands (justfile)

```bash
just build              # forge build
just test               # forge test (unit, fuzz, integration, and invariants)
just docs-gen           # forge doc → flatten → contracts/<source-path>/<Declaration>.md
just dev-up             # anvil + DeployAll + seed + sync frontend/.env.local
just dev-down           # stop background anvil
just indexer-dev        # ponder dev on :65422 (pglite)
just frontend-dev       # vite dev server (binds ::1 — see "gotchas")
just frontend-build     # wagmi generate + tsc + vite build
just anvil-seed         # pin metadata, then forge script Simulate.s.sol --slow
just ipfs-up            # optional local Kubo node (docker compose)
```

**Why the seed pins metadata first**: `metadataURI` is immutable once written
and `Simulate.s.sol` is Solidity, so it cannot POST to IPFS. `just anvil-seed`
therefore runs `node script/pin-metadata.mjs` first, which pins the payloads in
`script/metadata/catalogue.mjs` and writes `script/metadata-manifest.json`
(gitignored); the script reads it back with `vm.readFile` and hashes the exact
bytes the manifest carries. `foundry.toml`'s `fs_permissions` grants read on
that one file.

The catalogue holds **two variants per entry** because of a hard budget: an
inline `data:` URI must carry the whole document inside the contract's 512-byte
cap (~360 bytes of JSON, one sentence once a `termsURI` is present), while an
`ipfs://` CIDv1 URI is 66 bytes at any size. With `IPFS_API_URL` set and a
daemon answering, the prepare step pins the `full` payloads (~740 B, real prose,
plus a separately-pinned terms document linked from `termsURI`). Without one it
emits the `short` variants as `data:` URIs and drops `termsURI` entirely. **The
no-daemon path must keep working** — `just dev-up` cannot depend on Docker.

**Why `--slow` for Simulate.s.sol**: the script triggers OZ Checkpoints in
`TokenWeighting` whose state depends on `block.number` advancing between txs.
Batched broadcast collapses txs into one block → gas underestimate → mid-script
revert. `--slow` sends one tx per block.

**Why `dev-up` mines 64 empty blocks then `evm_setIntervalMining 2000`**:
Ponder's default `finalityBlockCount` for unknown chains (anvil = 31337) is 30.
Without help, the seed's events sit in the unfinalized window and the indexer
never sees them. Mining past finality + interval-mining keeps user-initiated
txs flowing past the cutoff too.

`script/write-frontend-env.mjs` parses `broadcast/**/run-latest.json` for the
freshly-deployed addresses and writes `frontend/.env.local`. The indexer reads
the same broadcast files via `loadDeployments(chainId)` in `ponder.config.ts`.

---

## Solidity architecture (5 layers, bottom up)

```
┌──────────────────────────────────────────────────────┐
│  Services                                            │
│    OperatorServiceRegistry   (signature validation   │
│    via TokenWeighting-style multi-denom voting power)│
├──────────────────────────────────────────────────────┤
│  Mesh Topology                                       │
│    FanInNode · FanOutNode · TokenWeighting           │
│    (deployed as EIP-1167 clones via MeshFactory)     │
├──────────────────────────────────────────────────────┤
│  Operator Registry                                   │
│    Registration · Delegation tracking ·              │
│    onDelegationReleased / onDelegationForfeited ·      │
│    requiredToken/arbiter acceptance policy           │
├──────────────────────────────────────────────────────┤
│  Commitment Manager (custody root)                   │
│    Per-(token,user) free/encumbered ledger ·         │
│    per-strategy escrow · Create · Release ·          │
│    Two-phase Forfeit (≥86400s challenge, pull-payment  │
│    payout) · Agree · Magnitude inv. · guarded     │
│    strategy hooks (gas-capped, park-don't-forfeit)   │
├───────────────────────────┬──────────────────────────┤
│  Backing Adapters         │  Distribution Strategies │
│    indexNow ·             │    TokenMovement[] via   │
│    payoutDenomination     │    validated movement    │
│    (ERC20Static, ERC4626) │    pipeline (§D.5)       │
├───────────────────────────┴──────────────────────────┤
│  Commitments Vault (clean ERC-4626, optional)        │
│    Pluggable yield strategy · instant exits ·        │
│    donate() · shares = manager backing               │
└──────────────────────────────────────────────────────┘
```

**Key invariants** (fuzz-locked in `test/manager/conformance/PartitionInvariant.t.sol`):
- INV-1 partition: `Σ(free+encumbered) + Σescrow == balanceOf(manager)` per token
  (O(1) aggregates).
- INV-3 magnitude allocation: `totalForfeitable ≤ totalEncumbered` per (user, token).
- INV-4 movement cap: strategy debits bounded by the bound commitment's `amount`.
- Forfeit challenge window ≥ 1 day (prevents same-block forfeit griefing).
- ERC-4626 inflation guard via virtual shares/assets (vault).
- Vault is single-asset, permissionless deposit; not a Morpho-style
  curator-managed vault.

**Storage**: every long-lived contract uses **EIP-7201 namespaced storage**
(`CommitmentManagerStorage.sol`, `CommitmentsVaultStorage.sol`,
`OperatorRegistryStorage.sol`, `OperatorServiceRegistryStorage.sol`, and the
Rewards snapshot/coordinator storage modules). Two
EIP-7201 slot calculations were wrong historically — `test/StorageSlots.t.sol`
(periphery + vault) and `test/manager/StorageSlots.t.sol` (manager layout
offsets) exist specifically to lock the slots and prevent regressions. Always
run both after touching storage layout.

**Proxy pattern**: UUPS for the singletons (CommitmentManager,
OperatorRegistry, OperatorServiceRegistry, Rewards coordinator/snapshot).
VaultFactory deploys per-asset ERC-1967 proxies. Mesh nodes are EIP-1167
minimal clones. The manager's five external delegatecall libraries
(`LedgerOpsLib`, `CommitmentLifecycleLib`, `MovementLib`, `AgreementLib`, and
`MutualLib`) are auto-deployed/linked by forge.

**Reentrancy**: `ReentrancyGuardTransient` (EIP-1153 transient storage) guards
economically sensitive ledger and lifecycle flows. Administrative setters,
pause controls, initialization, and nonce invalidation are not universally
marked `nonReentrant`. Cancun is the floor `evm_version`.

**Encumbrance vs. Manager naming**: "Encumbrance" is the *accounting concept*
(the per-(token,user) `encumberedBalance` side of the manager's ledger); the
*contract that owns it* is the commitment manager — the vault knows nothing
about encumbrance anymore. Don't reintroduce "encumbrance manager" as a
contract synonym.

---

## Frontend — design system is the priority

> **STALE — pre-v2 protocol surface.** Vault deposit flows, encumbrance reads,
> and the unbonding-queue UI are still shaped around the v1 contracts. The
> indexer is already re-pointed (see Indexer section) and `src/generated.ts`
> holds the v2 ABIs; the frontend hooks/components re-pointing is the next
> milestone. The design system guidance below remains authoritative.

**The `/design` route is the source of truth for the UI vocabulary.** Treat it
as the spec, not a showcase. Live in `frontend/src/pages/Design.tsx`
(+ `DesignRecipes.tsx` for compositions). Anything we ship in feature folders
should be expressible in terms of what's documented there. If we add a new
primitive, **it must appear on `/design`** — otherwise it's invisible to
contributors and will silently drift.

### Three-layer architecture (do not invert)

```
src/components/
  ui/         ← primitives, NO protocol knowledge
              (TokenAmount, AddressDisplay, Notice, Modal, Drawer, Toast,
               Disclosure, Button, Input, Select, Skeleton, ShareRatio,
               AllocationBar, BalanceLine, EmptyState, ErrorBlock, ErrorPanel,
               OperatorAvatar, SourceBlock, StatBlock, ThemeProvider/Toggle,
               TokenChip, TokenIcon, CopyButton)
  protocol/   ← knows the protocol vocabulary, NOT a specific page
              (CommitmentStatusBadge, OperatorStatusBadge, RiskTierBadge,
               Countdown, EncumbranceBar, LifecycleStepper, MetadataSummary,
               OperatorIdentity, PageHeader, PartyRow, RiskRow,
               CommitmentTitle, CommitmentTags, CommitmentTerms,
               MetadataTrustBadge, MetadataProvenance, DerivedLabelPreview)
  vault/      ← page-shaped feature compositions
  commitment/
  agreement/
  mesh/
  graph/
  metadata/
  docs/       ← MarkdownPage / MermaidBlock / CodeBlock / Sidebar (the /app/docs/* viewer)
  shell/      ← RootLayout, Sidebar, TopBar, WalletWidget, WrongNetworkBanner
```

**Rule**: higher layer can import lower; never the reverse. Enforced by
ESLint (`no-restricted-imports`, **enforced at error level**).

### The contract (`components/ui/CONTRIBUTING.md`)

Six rules — must follow when adding any primitive:

1. **Composition over configuration.** Primitives expose generic slots
   (icon/title/children/actions/tone). Domain props (commitmentId,
   operatorAddress) belong in `components/protocol/`.
2. **`size` + `tone` vocabulary.** `size: xs|sm|md|lg|xl` (or named scale
   `inline|default|display` for TokenAmount). `tone: neutral|info|success|warn|danger`.
   Forwarded to `data-size` / `data-tone` for attribute-driven CSS. No
   `variant`, no `large`/`huge`/`error`/`critical`.
3. **`as` prop for polymorphism.** `<AddressDisplay as="a" href={…}/>`.
   Refs are forwarded through.
4. **Full-precision `title`.** Any truncated/rounded/compacted value MUST
   surface the canonical full value via `title=`. `formatTokenAmount` returns
   `{ int, fraction, full }` — never throw `full` away.
5. **Controlled + uncontrolled pairs.** Both APIs (`value`/`onChange` and
   `defaultValue`; `open`/`onOpenChange` and `defaultOpen`). Radix-shaped.
6. **No imperative hook APIs.** Hooks return state shapes (`{ toasts, push,
   dismiss }`), not emitters. Pages own lifecycle.

The long-form rationale lives in `frontend/docs/design-system.md`.

### Tokens — single source of truth

`src/styles/tokens.css` is imported once from `main.tsx`. It defines
`[data-theme='light']` and `[data-theme='dark']` blocks with semantic names
(`--surface`, `--border-strong`, `--accent`, `--success`, `--warn`, `--error`,
`--graph-edge-active`, …). The design system is **warm-mono refined** —
Geist Mono, sharp geometry (`--radius: 0`), single accent (orange in light,
amber in dark).

**Hex literals are forbidden anywhere outside `tokens.css`** — ESLint rule 3,
caught in both bare strings and template strings. Reference
tokens via `var(--…)` or use a primitive that does.

Component CSS may only reference `var(--…)`. Stylelint enforces this on
`src/**/*.css`.

### Locked lint rules

Don't try to relax these — they were promoted from `warn` after the migration
and have meaningful drift-prevention semantics:

- **`viem.formatUnits` / `formatEther` are banned in feature folders and
  `pages/`.** Use `<TokenAmount/>` or `formatTokenAmount` from `lib/format`.
  (Allowed in `lib/`, in `TokenAmount.tsx` itself, and in tests.)
- **Layering**: `components/ui/**` cannot import protocol or feature folders;
  `components/protocol/**` cannot import feature folders.
- **No hex literals** outside `src/styles/tokens.css` (test fixtures under
  `**/__tests__/**` are exempt because they assert resolved CSS values).
- **No deep imports of `components/ui/<Primitive>`.** Go through the barrel
  (`'../components/ui'`). This keeps the public surface coherent.

### Docs viewer (built-in)

`/app/docs/*` renders `commitments/docs/**/*.md` via Vite's `import.meta.glob` →
`MarkdownPage` → react-markdown + Shiki + rehype-slug + Mermaid.
`forge doc` output is post-processed by `script/forge-doc-flatten.mjs` so
contract reference pages are nested by final source path under
`docs/protocol/reference/contracts/` alongside hand-written docs.

### Wagmi codegen

`pnpm generate` (or part of `dev`/`build`) runs `wagmi generate`, producing
`src/generated.ts` from contract ABIs. Do **not** hand-edit it. If you change
contract ABIs, rerun `forge build` then `pnpm generate`.

### Hooks layer

### Naming a commitment

A commitment is not `#12`. `lib/commitmentLabel.ts` resolves a name in three
tiers — a *verified* off-chain `metadata.title`, then a label derived from the
row's own structure (agreement leg, operator counterparty, known contract, open
pledge, amount-and-counterparty), then the bare id — and returns the trust level
alongside the text. **Never read `metadataContent.title` at a render site.**
Going through `commitmentLabel` is what enforces the rule that a title whose
on-chain hash no longer matches never gets promoted into a heading or a list
row; `lib/commitmentMetadata.ts` owns that classification. `/design` §Commitment
Naming is the spec. Shared list cells live in
`components/commitment/commitmentCells.tsx` so the table and card layouts cannot
drift on a status rule.

### Hooks layer

`src/hooks/*` wraps wagmi reads/writes for protocol concepts: `useCommitments`,
`useAgreements`, `useVaultPosition`, `useVaultApy`, `useUnbondingQueue`,
`useForfeitProposal`, `useDepositFlow`, `useDistributeYield`, `useClaimableYield`,
`useOperatorsIndexed`, `useServiceOperators`, `useViewAddress`,
`useRegistryPolicy`, `useNow`, `useCountdown`, `useDebouncedValue`. Reach for
these before adding a new fetch — most page state is already covered.

### Adding a new UI component

1. Decide the layer (ui / protocol / feature) using the placement rule.
2. If it's `ui/`: it must follow all six contract rules, get exported from
   `components/ui/index.ts`, and **be added to the `/design` page** (and a
   recipe on `/design/recipes` if it composes with others).
3. If it's `protocol/`: export from `components/protocol/index.ts`, also
   show on `/design` if it has a meaningful visual surface.
4. If it's feature-shaped: live in the feature folder, no barrel needed.

---

## Indexer (Ponder)

> **v2-current.** Re-pointed at the manager-custody event vocabulary
> (2026-06-10). Bindings: single token-agnostic manager + single registry
> (array-shaped for forward-compat); vaults discovered via `VaultFactory`'s
> `VaultDeployed` factory pattern. Schema: `commitment` carries `committer` +
> `token` + `adapter` (no `yieldShareBps`/yield columns); `vault` is the
> denormalized backing-token-if-vault-share. `ledgerPosition` (per-(token,user)
> **encumbered** only — `free` is read live via `manager.freeBalance` since
> `EncumbranceDecreased` is path-ambiguous) replaces `vaultPosition`;
> `strategyBinding` / `distribution` / `strategyHookFailure` replace the deleted
> yield tables; the withdrawal-queue `unbondingRequest` is gone (unbonding is
> per-commitment on the `commitment` row). `just indexer-dev` indexes a fresh
> `dev-up` deployment correctly.

`indexer/ponder.config.ts` resolves contract addresses by parsing
`broadcast/**/<chainId>/run-latest.json`. Endpoints (Hono) live alongside
Ponder's auto-generated GraphQL and SQL-over-HTTP:

- `GET /graph/agreements?address=…` — graph for the Agreements page
- `GET /graph/mesh` — mesh DAG
- `GET /account/:address` + `/account/:address/claimable-yield`
- `GET /commitments/urgent?address=…&status=active&limit=100` — canonical
  urgency-sorted list (`forfeitPending` first, then by `forfeitChallengeEnd ASC`,
  then `id DESC`). Reuse this sort in any new commitment list view to keep
  surfaces consistent.
- `GET /vaults/:vault/forfeit-ledger?limit=100` — unified events feed (forfeit
  lifecycle transitions + settlement + contribution + donation). All four
  kinds are vault-filtered through the denormalized `vault` column on the
  underlying event tables. Forfeit events are sourced from the `forfeitEvent`
  log table (one row per `ForfeitInitiated/Executed/Cancelled/CancelledStale`
  emit) so each row has a precise `blockTimestamp` and `txHash` — the
  current commitment row continues to hold the latest forfeit state for
  fast dossier lookups, but the timeline lives in `forfeitEvent`.
- `GET /vaults/:vault/periodic?days=N` — vault time-series snapshots from
  the offchain schema; default 7 days, max 90.
- `GET /graphql`, `GET /sql/*`

**Operator-name resolution**: arbiter / counterparty addresses are stored as
raw addresses in commitment rows. To render names without N+1 fetches, the
frontend bulk-queries `operators(where: { address_in: […] })` once per page
and caches client-side. Don't try to add a join into the commitment schema —
that was deliberately rejected.

**Vault denormalization**: the `commitment`, `agreementSettlement`,
`contribution`, and `forfeitEvent` tables all carry a `vault` column populated
at handler time. The `commitment` handler reads `manager.vault()` once per
manager (cached process-wide — the binding is immutable per chain).
Settlement/contribution handlers look up the parent commitment's `vault`
in-memory; no extra chain reads. The column is nullable for prod migration
compatibility — existing rows on a live indexer remain `NULL` until backfill
and the forfeit-ledger endpoint accepts NULLs as "the canonical vault" by
default. Pass `?allVaults=1` to bypass vault filtering entirely.

**Offchain snapshot pipeline**: `indexer/offchain.schema.ts` defines a single
`offchain.vault_periodic_snapshot` table that lives in a dedicated `offchain`
PG schema (so Ponder's per-build namespace versioning doesn't touch it).
`src/api/snapshot.ts` reads `totalAssets/totalSupply` from chain via the
`ponder:api` publicClient, aggregates indexer state via Drizzle queries on
the readonly DB, computes 7d/30d APY by comparing share price against the
oldest snapshot in the trailing window, and upserts an idempotent row keyed
by `(vault, 5-minute bucket)`. The job fires once on boot and every 5 min
via `setInterval` registered in `src/api/index.ts`. APY columns emit `null`
until at least half the window of history has accumulated — the frontend's
`VaultApyChart` reads `null` as "not yet available" and shows an info
notice instead of a flat 0% line. Manual trigger for dev:

```bash
curl -X POST http://localhost:65422/vaults/<vault>/periodic/snapshot
```

The offchain table is created via raw SQL DDL in
`src/api/offchainDb.ts:ensureOffchainSchema` because `drizzle-orm/pg-core`
isn't a direct dep of `@commitments/indexer` (transitive of ponder, blocked
by pnpm strict resolution). Writes use `PONDER_DATABASE.adminQB.raw` from
`globalThis` since the `db` exported from `ponder:api` is read-only — keep
this path narrow; if a future ponder bump renames that global, the
snapshot pipeline will fail loudly at startup and we revisit.

**Production**: `DEPLOY_ENV=PROD` + `PONDER_RPC_URL_1` + `PONDER_WS_URL_1`
flips to Ethereum mainnet.

---

## Conventions worth knowing

**Solidity**:
- One contract per file, storage in a sibling `*Storage.sol` (EIP-7201).
- Tests mirror `src/` structure under `test/`. Conformance tests live in
  `test/conformance/`.
- NatSpec on every public/external function — `forge doc` builds the
  reference site from it.
- `forge fmt` line length 120.

**TypeScript / React**:
- `_`-prefixed identifiers are intentional placeholders (lint configured).
- Date.now() in render is forbidden by `react-hooks/purity` — use
  `useNowSeconds()` for ticking UI (countdowns, time-since labels).
- No imperative effects that read DOM into state without rationale; if you
  must, link `frontend/docs/eslint-disable-rationale.md` §Pattern-3.

**Testing**:
- Foundry: 256 fuzz runs (default), full mainnet-style invariant tests on the
  vault.
- Vitest in the frontend may fail in this sandbox due to a missing rollup
  arm64 binary — run `pnpm typecheck` + `pnpm lint` as proxy and call out
  that vitest needs to run on the host.
- **`npx tsc --noEmit` in `frontend/` checks NOTHING.** That tsconfig is a
  solution file (`"files": []` plus project references), so the command exits
  0 on a file full of type errors. Use `pnpm typecheck` (`tsc -b`), which
  walks the references. The indexer's `--noEmit` is fine; only the frontend
  has this shape.
- Vite dev binds `::1` only in this container — probe via `localhost`, not
  `127.0.0.1`, or pass `--host 0.0.0.0`.

