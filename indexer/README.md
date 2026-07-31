# commitments-indexer

[Ponder](https://ponder.sh) indexer that streams `CommitmentManager`, `CommitmentsVault`, `OperatorRegistry`, `OperatorServiceRegistry`, and mesh node events into a queryable database. Serves a Hono REST API and Ponder's built-in GraphQL for the `commitments/frontend/` graph visualization.

## Local dev

Prereqs: the project's Foundry stack has been built (`forge build`) and a local Anvil node is running with the protocol deployed via `forge script script/Simulate.s.sol --broadcast`.

```bash
# From the repo root:
pnpm install
cp indexer/.env.example indexer/.env
just indexer-dev   # listens on :65422, uses pglite by default

# Or directly:
pnpm --filter @commitments/indexer dev
```

Endpoints:

- `GET /graph/entanglements?address=0x…` — nodes+edges for the commitments graph
- `GET /graph/mesh` — mesh DAG nodes+edges
- `GET /account/:address` — per-address dossier
- `GET /account/:address/claimable-yield` — active commitments where the user is counterparty and `yieldClaimable > 0`
- `GET /commitments/urgent?address=0x…&status=active&limit=100` — canonical urgency-ordered commitment list (see "Canonical sort orders" below)
- `POST /metadata/pin` — pin a metadata JSON object and return `{ cid, metadataURI, metadataHash }` (see "Metadata pinning" below)
- `GET /graphql` — Ponder's auto-generated GraphQL over the full schema
- `GET /sql/*` — Ponder's SQL-over-HTTP (used by `@ponder/client`)

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
    WHEN 'slashPending' THEN 0
    WHEN 'active'       THEN 1
    ELSE 2
  END,
  COALESCE(slashChallengeEnd, 9000000000000000000) ASC,
  id DESC
```

`slashPending` floats to the top; among equally-prioritised rows the imminent
deadline wins; ties break by newest first.

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

`ponder.config.ts` resolves deployment addresses by parsing the latest
`../broadcast/**/<chainId>/run-latest.json` Foundry run. Override via:

```bash
DEPLOYMENTS_JSON=/path/to/deployments.json pnpm --filter @commitments/indexer dev
```

where the JSON is of shape:

```json
{
  "commitmentManager": "0x…",
  "commitmentsVault": "0x…",
  "operatorRegistry": "0x…",
  "stakeRegistry": "0x…",
  "meshFactory": "0x…",
  "startBlock": 0
}
```

## Production (Ethereum mainnet)

Set `DEPLOY_ENV=PROD`, `PONDER_RPC_URL_1`, and `PONDER_WS_URL_1`. The config switches to Ethereum mainnet automatically. Deploy addresses still come from `loadDeployments(1)` — point `DEPLOYMENTS_JSON` at your mainnet deployment summary.
