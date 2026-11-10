# commitments-indexer

[Ponder](https://ponder.sh) indexer that streams `CommitmentManager`, `CommitmentsVault`, `OperatorRegistry`, `OperatorServiceRegistry`, and mesh node events into a queryable database. Serves a Hono REST API and Ponder's built-in GraphQL for the `commitments/frontend/` graph visualization.

## Local dev

Prereqs: a local Anvil node with the protocol deployed and seeded. `just dev-up` does both.

```bash
# From the repo root:
pnpm install
cp indexer/.env.example indexer/.env
just indexer-dev   # listens on :65422, uses pglite by default

# Or directly:
pnpm --filter @commitments/indexer dev
```

Endpoints. Each group is a Hono router mounted in `src/api/index.ts`; the route
docs live in the matching `src/api/<group>.ts`.

- `/graph` — `agreements` (nodes and edges for the commitments graph), `mesh`, `mesh-topology`, `mesh-security`
- `/account/:address` — dossier, plus `claimable-yield`, `premium`, `balance-history`, `activity`
- `/commitments` — `urgent` (canonical urgency-ordered list; see "Canonical sort orders" below), `/:id`, `/:id/contributions`, `/:id/arbitration`, `arbitration/activity`
- `/agreements/:id/settlements`
- `/mutuals` — list, `/:id/members`, `/:id/ledger`, `/:id/premium`, `/:id/history?days=7|30|90` (daily premium APR, capital, cover sold)
- `/vaults/:vault` — `forfeit-ledger`, `donations`, `coverage`, `periodic?days=N` (hourly up to 7 days, daily beyond) and `periodic?latest=1` (newest snapshot; see "Vault snapshots" below)
- `/services/:address/stake-summary`
- `/protocol` — `stats`, `arbiters`, `cases`, `leaderboard`, `mechanism-activity`
- `/governors` — list, `/:address`, `/:address/proposals`, `/:address/proposals/:id`, `/:address/proposals/:id/votes`
- `/prices`
- `POST /metadata/pin` — pin a metadata JSON object and return `{ cid, metadataURI, metadataHash }` (see "Metadata pinning" below)
- `GET /graphql` — Ponder's auto-generated GraphQL over the full schema
- `GET /sql/*` — Ponder's SQL-over-HTTP (used by `@ponder/client`)

`/account/:address/claimable-yield` does not return an amount. It returns the
strategy bindings on active commitments where the address is the counterparty,
so the caller can read `manager.pending(commitmentId, strategy, claimData)`
live, and the address's realized `DistributionPaid` rows.

## Vault snapshots

The `VaultSnapshot` block source in `ponder.config.ts` fires every 25 blocks
on Sepolia and mainnet (~5 minutes) and every 15 blocks on the local chain
(~30 seconds). Its handler, `src/vaultSnapshot.ts`, writes one `vaultSnapshot`
row per indexed vault: `totalAssets`, `totalSupply` and the share price read
at that block, that vault's commitment and encumbrance aggregates in its own
share units, and the 7d and 30d APY against the oldest row in each window.
APY is null until half the window of history exists. History is indexed like
any other table: it backfills from the start block, follows reorgs, and is
rebuilt on a re-index. On mainnet the chain reads at past blocks need an
archive RPC.

## Metadata fetch network policy

On-chain metadata URIs are untrusted input. Direct `https://` fetches resolve
all A/AAAA answers and reject the request if any address is not globally
routable unicast. The selected validated address is pinned into the HTTP
connection, redirects are disabled, and credentials in URLs are rejected.
This prevents DNS rebinding and redirects from turning metadata ingestion into
access to loopback, private, link-local, multicast, or reserved services.

`ipfs://` is resolved only through the parsed origin and base path of the
operator's `IPFS_GATEWAY` (default `https://ipfs.io/ipfs/`). HTTPS is preferred,
but an explicitly configured HTTP gateway is supported for loopback/private
deployments. The on-chain CID/path cannot replace that configured origin or
traverse above its base path. A trusted operator gateway may itself resolve
privately; that is a configuration trust decision, not one controlled on chain.

## Metadata pinning (`POST /metadata/pin`)

Server-side companion to the read-side metadata fetcher (`src/metadataFetcher.ts`).
A producer (the frontend's inline metadata editor) authors a metadata JSON
object — e.g. a `commitment.v1` payload, see
[`docs/protocol/reference/concepts/metadata.md`](../docs/protocol/reference/concepts/metadata.md) —
POSTs it here, and gets back the canonical URI plus the content hash to write
on-chain. Keeping the pinning credential server-side means it never ships in
the browser bundle.

```bash
curl -sX POST http://localhost:65422/metadata/pin \
  -H 'Content-Type: application/json' \
  --data '{"schemaVersion":"commitment.v1","title":"Delivery SLA"}'
```

Response:

```json
{
  "cid": "bafkrei…",                 // null when using the dev data: fallback
  "metadataURI": "ipfs://bafkrei…",   // or "data:application/json;base64,…"
  "metadataHash": "0x…",              // keccak256 of the EXACT pinned bytes
  "service": "pinata"                 // or "data-uri" (informational)
}
```

### The hash contract (do not break it)

`metadataHash = keccak256(exact_utf8_bytes_the_producer_posted)`. **No
canonicalization, no re-serialization — whitespace and key order are part of
the bytes and therefore part of the hash.** The endpoint hashes the *raw
request body bytes verbatim* and pins **those same bytes** (never a re-encoded
JSON string), so a later indexer fetch+verify of `metadataURI` recomputes the
identical hash and yields `metadataStatus: ok`. The body is parsed only to
validate that it is a JSON object; the parsed value is never used for hashing
or pinning.

Practical consequence for the frontend: build the JSON string **once**, send
that exact string as the request body, and write the returned `metadataHash`
on-chain. Do not `JSON.stringify` a parsed copy or pretty-print between hashing
and posting.

### Pinning backends

| Env | Backend | Behaviour |
|-----|---------|-----------|
| `PINATA_JWT` set | Pinata `pinFileToIPFS` | Raw bytes uploaded as a single file; returned `IpfsHash` is the CID of those bytes, so `ipfs://<cid>` resolves back to them. `cid` is the CIDv1. |
| _(none)_ | dev `data:` fallback | Returns a self-contained `data:application/json;base64,<base64>` URI. The fetcher already resolves `data:` URIs, so the full pin→hash→verify round-trip works **offline** against `just dev-up` / `just indexer-dev` with no external credentials. `cid` is `null`. |

The `PINATA_JWT` is a Pinata "scoped" JWT with `pinFileToIPFS` permission, read
**server-side only** from the environment. To use a different pinning service
(web3.storage / Storacha), add a branch in `src/api/metadata.ts` alongside
`pinToPinata`.

> **Dev `data:` URI caveat:** the on-chain `metadataURI` field is capped at 512
> bytes by the contract. A base64 `data:` URI only fits ~360 bytes of JSON, so
> the fallback is for small payloads / offline testing. For production-sized
> metadata, configure `PINATA_JWT` (or another pinning service) so the URI is a
> short `ipfs://<cid>`.

### Validation & limits

- 256 KiB request-body cap (matches the fetcher's read cap) → `400 too_large`.
- Body must parse as a **JSON object**; arrays, scalars, and non-JSON →
  `400 not_object` / `400 invalid_json`. Empty body → `400 empty`.
- Basic per-IP fixed-window rate limit (30 req/min) → `429 rate_limited`.
- Pinning-service failure → `502 pin_failed`.

## Canonical sort orders

Frontends should reuse these sorts so different UI surfaces stay consistent.

### Commitments — by urgency (Indexer Improvements #3)

`/commitments/urgent` already applies this. If you query `/graphql` directly, replicate it:

```sql
ORDER BY
  CASE status
    WHEN 'forfeitPending' THEN 0
    WHEN 'unbonding'      THEN 1
    WHEN 'active'         THEN 2
    ELSE 3
  END,
  COALESCE(forfeitChallengeEnd, 9000000000000000000) ASC,
  id DESC
```

`forfeitPending` floats to the top, then `unbonding`, then `active`; among
equally-prioritised rows the imminent deadline wins; ties break by newest first.

## Resolving arbiter / counterparty addresses to operator names (Indexer Improvements #5)

Commitment rows surface `arbiter` / `counterparty` as raw addresses. To render
them as `operator.metadataContent.name` (e.g. "Operator Service") without an N+1
fetch, populate a client-side cache once per page load with a bulk GraphQL query:

```graphql
query OperatorNames($addresses: [String!]!) {
  operators(where: { address_in: $addresses }) {
    items {
      address
      metadataStatus
      metadataContent
    }
  }
}
```

Pass every address that appears in the visible commitment set. The frontend
should treat addresses missing from the response as "not an operator" and fall
back to the abbreviated hex form. We deliberately did **not** wire arbiter-name
joins into the commitment schema — the cache approach is cheaper and lets the
UI control caching/invalidation.

## Config

`ponder.config.ts` reads deployment addresses from a schema-v1 manifest. When
`DEPLOYMENTS_JSON` is unset it reads `deployments.<chainId>.json` in this
folder, which `script/write-frontend-env.mjs` writes from the seed's broadcast
(`just dev-up` runs it); if that file is missing, startup stops and says to run
`just dev-up`. To use an explicit deployment manifest instead:

```bash
DEPLOYMENTS_JSON=/path/to/deployments.json pnpm --filter @commitments/indexer dev
```

When set, `DEPLOYMENTS_JSON` is authoritative. An empty value, missing or
unreadable path, malformed JSON, schema error, or chain mismatch stops startup
immediately; the loader never falls back to the generated manifest.

Schema v1 is a strict contract. A minimal manifest is checked in at
[`fixtures/deployments.v1.example.json`](fixtures/deployments.v1.example.json):

```json
{
  "schemaVersion": 1,
  "chainId": 31337,
  "commitmentManagers": ["0x0000000000000000000000000000000000000001"],
  "vaultFactory": "0x0000000000000000000000000000000000000002",
  "operatorRegistries": ["0x0000000000000000000000000000000000000003"],
  "stakeRegistry": "0x0000000000000000000000000000000000000004",
  "meshFactory": "0x0000000000000000000000000000000000000005",
  "flatFeeStrategies": [],
  "agentIdentityRegistries": [],
  "startBlock": 0
}
```

`chainId` must match `DEPLOY_ENV`: `31337` for `LOCAL`, `11155111` for
`SEPOLIA`, or `1` for `PROD`. `startBlock` is a required non-negative integer.
The manager and operator-registry arrays must each contain at least one non-zero
EVM address. `vaultFactory`, `stakeRegistry` (the operator service registry),
and `meshFactory` are also required non-zero addresses. Vault instances are
discovered from `VaultFactory.VaultDeployed`, so a vault address does not belong
in this manifest.

Optional subsystems are represented by `tokenWeighting`, `governorFactory`,
`mutualRegistry`, `optimisticMutualArbiter`, `linkedMutualPolicy`,
`skimmingStrategy`, and `vaultCoverConduit`. Each must be a non-zero address when
present. `flatFeeStrategies` and `agentIdentityRegistries` are optional address
arrays and default to `[]` when omitted.

Legacy `commitmentManager`, `operatorRegistry`, and `commitmentsVault` keys are
not accepted in schema v1. Migrate the first two to their plural array forms and
replace `commitmentsVault` with the actual `vaultFactory` address. Unknown fields
are rejected so address-key typos cannot silently disable indexing.

`ponder codegen` does not read the manifest, so a clean tree needs neither. For
other config-only tooling, the example fixture stands in:

```bash
DEPLOYMENTS_JSON=fixtures/deployments.v1.example.json \
  pnpm --filter @commitments/indexer codegen
```

## Production (Ethereum mainnet)

Set `DEPLOY_ENV=PROD`, `PONDER_RPC_URL_1`, and `PONDER_WS_URL_1`. The config
switches to Ethereum mainnet automatically. Point `DEPLOYMENTS_JSON` at a schema
v1 mainnet manifest whose `chainId` is `1`.
