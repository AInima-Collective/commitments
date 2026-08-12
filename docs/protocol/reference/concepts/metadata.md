---
title: "Metadata Conventions"
status: current
---

# Metadata Conventions

The protocol exposes opaque metadata URIs and optional byte hashes. Core commitments and agreement proposals call the hash `metadataHash`; operator and vault records call it `contentHash`. This document defines the off-chain JSON shapes and the byte-hash convention so producers and consumers can agree byte-for-byte.

## On-Chain Surface

Metadata fields are attached to five record types. The [generated reference](../contracts/) is the current ABI-level source.

| Record | Fields | Mutability |
|--------|--------|------------|
| `Commitment` | `metadataURI`, `metadataHash` | Immutable — set once at `createCommitment` |
| `AgreementProposal` | `metadataURI`, `metadataHash` | Immutable — set once at `proposeAgreement`; the accepted leg commitments receive the proposal metadata |
| Operator (via `IOperatorRegistry.OperatorMetadata`) | `uri`, `contentHash` | Mutable — updated via `setOperatorMetadata` |
| Vault (via `ICommitmentsVault.VaultMetadata`) | `uri`, `contentHash` | Mutable — updated via `setMetadata` (admin) |
| Service (via `OperatorServiceRegistry.serviceURI`) | `serviceURI` only | Mutable — updated via `setServiceURI` (admin); **no on-chain `contentHash`**, so verification is best-effort |

**URI length cap:** 512 bytes. Longer URIs are rejected by the contract.

**Empty sentinel:** `uri == ""` AND `contentHash == bytes32(0)` means no metadata is attached to the record. Either field alone is not sufficient — both must be their zero value to indicate absence. (The service registry has no `contentHash`, so its empty sentinel is `serviceURI == ""` alone.)

## contentHash Computation

```
contentHash = keccak256(utf8_bytes_the_producer_posted)
```

Rules the producer must follow:

- The producer controls the exact byte sequence. Whitespace, key order, and indentation are **part of the bytes** and therefore part of the hash.
- No canonicalization library. No JCS (JSON Canonicalization Scheme). No re-serialization before hashing.
- Encoding MUST be UTF-8.
- The producer MUST post the **same exact byte sequence** it hashed. Any mismatch — different whitespace, an extra trailing newline, re-serialization by middleware — will cause the verifier to compute a different hash and mark the record as `mismatch`.

**Verification:** The indexer fetches the raw bytes at `metadataURI`, computes `keccak256` over those bytes, and compares the result to the on-chain `contentHash`.

**Zero hash sentinel:** `bytes32(0)` means "no hash attestation". If a URI is set but `contentHash` is zero, the indexer fetches and stores content but does not perform hash verification. The status will be `ok` as long as the fetch succeeds.

**Worked example:** Given the exact string (no trailing newline):

```
{"schemaVersion":"commitment.v1","title":"Delivery SLA"}
```

Compute the hash with:

```bash
# Using cast (Foundry)
cast keccak "$(printf '%s' '{"schemaVersion":"commitment.v1","title":"Delivery SLA"}')"

# Using viem / ethers in TypeScript
import { keccak256, toUtf8Bytes } from "ethers";
const hash = keccak256(toUtf8Bytes('{"schemaVersion":"commitment.v1","title":"Delivery SLA"}'));

# Using viem
import { keccak256, toBytes } from "viem";
const hash = keccak256(toBytes('{"schemaVersion":"commitment.v1","title":"Delivery SLA"}'));
```

The producer hashes those exact bytes, posts the result on-chain as `contentHash`, and uploads the same exact bytes to the URI. Any tool that re-formats the JSON before posting will break verification.

## Scheme Allowlist

Metadata URIs MUST use one of these schemes:

- `ipfs://CID[/path]` — content-addressed. Rewritten beneath the parsed origin and base path of a trusted `IPFS_GATEWAY` selected by the operator (default `https://ipfs.io/ipfs/`). HTTPS is preferred; explicitly configured HTTP supports loopback/private gateways such as local Kubo. The CID/path cannot replace that origin or traverse above its base path. Preferred for production.
- `https://...` — hosted. Accepted only without URL credentials, after every DNS answer is classified as public, and with redirects disabled. Acceptable when the producer controls the host or trusts it.
- `data:application/json,<urlencoded>` — RFC 2397 inline JSON. Self-contained, no fetch. Intended for tests, demo seeds, and scripted simulations where the URI carries its own content.
- `data:application/json;base64,<base64>` — RFC 2397 base64-encoded JSON. Same intent as above; use when the payload contains characters awkward to percent-encode.

`data:` URIs with a non-JSON media type, or with no media type declared, are rejected. So are `http://`, `file://`, `ftp://`, and anything else — the indexer tags them `unreachable` without a fetch.

The `contentHash` rule is identical across all schemes: hash the raw bytes that the consumer will receive. For `data:` URIs that means the decoded bytes (after percent-decoding or base64-decoding), not the URI string itself.

HTTPS and IPFS URIs are fetched with a 5-second timeout and a 256 KiB response size cap; responses exceeding either limit produce status `unreachable`. `data:` URIs have no timeout (they are resolved synchronously) but are still subject to the same 256 KiB decoded-size cap.

Note: `data:` URIs are subject to the contract's 512-byte URI length cap. After the `data:application/json;base64,` prefix (29 chars), roughly 360 bytes of JSON fit under the cap — enough for the v1 schemas above, not enough for embedded logos or long prose. Producers who need more room should use `ipfs://` or `https://`.

## Commitment Metadata v1

`schemaVersion: "commitment.v1"`

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `schemaVersion` | string | required | Must equal `"commitment.v1"` |
| `title` | string | required | Short human-readable label for the commitment |
| `description` | string | optional | Longer prose describing the commitment; markdown allowed |
| `termsURI` | string | optional | Link to a fuller off-chain terms document (`ipfs://` or `https://`) |
| `tags` | string[] | optional | Free-form labels for filtering and display |
| `trustgraphsAttestationId` | string | optional | Reference into a trustgraphs attestation; consumers dereference this separately. |

Example payload (producers hash whatever bytes they actually post — this is documentation only):

```json
{
  "schemaVersion": "commitment.v1",
  "title": "Weekly data delivery",
  "description": "Provider supplies 7 days of market data by every Monday 00:00 UTC.",
  "termsURI": "ipfs://bafy.../terms.pdf",
  "tags": ["data", "sla"]
}
```

## Agreement Metadata v1

`schemaVersion: "agreement.v1"`

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `schemaVersion` | string | required | Must equal `"agreement.v1"` |
| `title` | string | required | Short human-readable label for the agreement |
| `description` | string | optional | Longer prose describing the agreement; markdown allowed |
| `agreementURI` | string | optional | Link to the full bilateral agreement document (`ipfs://` or `https://`) |
| `proposerContact` | string | optional | Proposer contact info: ENS name, email address, or Signal handle |
| `tags` | string[] | optional | Free-form labels for filtering and display |

Note: Agreement metadata is set by the **proposer** at `proposeAgreement`. The metadata URI and hash are mirrored from `AgreementProposal` to `Agreement` when the proposal is accepted; no acceptor metadata field exists in v1.

Example payload:

```json
{
  "schemaVersion": "agreement.v1",
  "title": "Cross-operator SLA bridge",
  "description": "Mutual commitment between two operators to maintain 99.9% uptime on shared infrastructure.",
  "agreementURI": "ipfs://bafybei.../agreement.pdf",
  "proposerContact": "alice.eth",
  "tags": ["infrastructure", "sla", "cross-operator"]
}
```

## Operator Metadata v1

`schemaVersion: "operator.v1"`

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `schemaVersion` | string | required | Must equal `"operator.v1"` |
| `name` | string | required | Operator display name |
| `description` | string | optional | What the operator does; markdown allowed |
| `logoURI` | string | optional | Operator logo (`ipfs://` or `https://`) |
| `website` | string | optional | Operator website URL |
| `p2pEndpoint` | string | optional | peer discovery endpoint for this operator |
| `services` | string[] | optional | List of AVS service identifiers this operator serves |
| `social` | object | optional | Social links: `twitter`, `github`, `email` (all optional strings within) |

Operator metadata is **mutable**: operators can call `setOperatorMetadata` to update it. The on-chain record stores the current values only. Previous values are accessible via the Ponder event log (no dedicated history table in v1).

Example payload:

```json
{
  "schemaVersion": "operator.v1",
  "name": "Acme Node Co.",
  "description": "Professional node operator since 2024. 99.99% uptime SLA.",
  "logoURI": "ipfs://bafkreig.../logo.png",
  "website": "https://acmenode.example",
  "p2pEndpoint": "https://p2p.acmenode.example:8545",
  "services": ["commitments-mainnet", "service-mainnet"],
  "social": {
    "twitter": "https://twitter.com/acmenodeco",
    "github": "https://github.com/acmenodeco",
    "email": "ops@acmenode.example"
  }
}
```

## Vault Metadata v1

`schemaVersion: "vault.v1"`

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `schemaVersion` | string | required | Must equal `"vault.v1"` |
| `name` | string | required | Vault display name. Frontends should prefer this over the ERC-4626 `name()` for headers and listings |
| `description` | string | optional | One- or two-line subtitle; markdown allowed |
| `logoURI` | string | optional | Vault logo (`ipfs://` or `https://`) |
| `website` | string | optional | Marketing or landing page for the vault |
| `tags` | string[] | optional | Free-form labels (e.g. `demo`, `usdc`, `cross-vault`) |
| `riskTier` | string | optional | One of `conservative`, `moderate`, `aggressive`, `agent` (lowercase). Drives the `RiskTierBadge` rendering |
| `curator` | object | optional | `{ name, description?, logoURI?, website?, twitter? }` — **who maintains the vault config and risk parameters**. Informational only; the vault is single-asset and permissionless and the curator does not gate deposits |
| `strategy` | object | optional | `{ name, summary, riskTier?, venues?: string[], documentationURI? }` — **what the vault does with productive capital**. `summary` should be 1–2 sentences |
| `social` | object | optional | `{ twitter, github, discord }` (all optional strings within) |

Vault metadata is **mutable**: the vault admin (`DEFAULT_ADMIN_ROLE`) can call `setMetadata` to update the URI/hash pair atomically. The on-chain record stores only the latest URI, content hash, and `updatedAt` timestamp; history is recoverable from the `VaultMetadataUpdated` event log.

The 512-byte URI cap means inline `data:application/json;base64,` payloads fit roughly 360 bytes of JSON — enough for a trimmed `vault.v1` (logo URL, curator name + website, strategy name + 1-line summary, riskTier). Production deployments should use `ipfs://` or `https://` URIs to carry richer content (logos embedded, longer prose, social links, etc.).

Example payload:

```json
{
  "schemaVersion": "vault.v1",
  "name": "Commitments USDC Vault",
  "description": "Productive USDC capital backing protocol commitments.",
  "logoURI": "https://example.com/assets/usdc-vault.png",
  "website": "https://example.com/vaults/usdc",
  "tags": ["demo", "usdc", "primary"],
  "riskTier": "conservative",
  "curator": {
    "name": "Demo Labs",
    "description": "Maintainer of the Commitments protocol.",
    "logoURI": "https://example.com/assets/operator-mark.png",
    "website": "https://example.com/",
    "twitter": "https://twitter.com/example_service"
  },
  "strategy": {
    "name": "Idle USDC Reserve",
    "summary": "Holds USDC and forwards yield to depositors. No external lending or external exposure.",
    "riskTier": "conservative",
    "venues": [],
    "documentationURI": "https://example.com/vaults/usdc/strategy"
  },
  "social": {
    "twitter": "https://twitter.com/example_service",
    "github": "https://github.com/example"
  }
}
```

## Service Metadata v1

`schemaVersion: "service.v1"`

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `schemaVersion` | string | required | Must equal `"service.v1"` |
| `name` | string | required | Service display name (e.g. `"Operator Service"`) |
| `description` | string | optional | One-line subtitle; markdown allowed |
| `logoURI` | string | optional | Service logo (`ipfs://` or `https://`) |
| `website` | string | optional | Service website |
| `twitter` | string | optional | Twitter / X URL |
| `social` | object | optional | `{ github, discord, telegram, email }` (all optional strings within) |
| `tags` | string[] | optional | Free-form labels |

Service metadata is **mutable**: the registry admin (`DEFAULT_ADMIN_ROLE` on `OperatorServiceRegistry`) can call `setServiceURI` to replace the URI. Unlike the other entity types the registry stores **only the URI** — there is no on-chain `contentHash`. A consumer can report fetch success or failure, but cannot verify a hash that is not stored on-chain.

The schema mirrors the EigenLayer AVS metadata convention used across the AVS middleware ecosystem, so the same hosted JSON file can serve both audiences.

Example payload:

```json
{
  "schemaVersion": "service.v1",
  "name": "Operator Service",
  "description": "Off-chain service validated by an operator quorum.",
  "logoURI": "https://example.com/logo.png",
  "website": "https://example.com/",
  "twitter": "https://twitter.com/example_service",
  "social": {
    "github": "https://github.com/example"
  },
  "tags": ["service", "avs"]
}
```

## Cause Metadata v1

`schemaVersion: "cause.v1"`

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `schemaVersion` | string | required | Must equal `"cause.v1"` |
| `name` | string | required | Cause display name |
| `description` | string | required | What the cause does; one or two sentences for picker UIs |
| `category` | string | required | One of: `open-source`, `disaster-relief`, `public-goods`, `education`, `other` (lowercase, hyphenated) |
| `logoURI` | string | optional | Cause logo (`ipfs://` or `https://`) |
| `website` | string | optional | Cause website URL |
| `taxStatus` | string | optional | Tax-deductibility hint (e.g. `501c3-eligible`, `for-profit-mission-driven`); informational only |

`cause.v1` payloads are typically not stored on-chain (causes are not first-class protocol entities in v1); the schema exists primarily so any curated list or future on-chain registry uses the same field names. The same `contentHash` rule applies if a producer chooses to attach `cause.v1` metadata to a commitment via the existing `metadataURI` field.

Example payload:

```json
{
  "schemaVersion": "cause.v1",
  "name": "Open Source Maintainers Fund",
  "description": "Direct grants to maintainers of widely-used open source projects.",
  "category": "open-source",
  "logoURI": "ipfs://bafkreig.../logo.png",
  "website": "https://example.org",
  "taxStatus": "501c3-eligible"
}
```

## Reserved Fields and Evolution

### Reserved field names

`schemaVersion` is **reserved** and MUST match the documented value for the record type. Producers MUST NOT use `schemaVersion` for any other purpose.

### Minor versions (backward-compatible additions)

Minor updates add **optional** fields only. A producer MAY emit a `commitment.v1` payload with additional optional fields that are not documented here; verifiers and indexers MUST NOT reject payloads containing unknown optional fields. Unknown fields are preserved by the indexer and exposed via the query layer (forward-compatible).

### Major versions (breaking changes)

Any breaking change — removed or renamed required field, semantic change to an existing field, or type change — requires bumping the identifier to a new major version (`commitment.v2`, `agreement.v2`, etc.).

The indexer stores `schemaVersion` as-is on every indexed record. Records with an unknown major version are ingested raw (stored in `metadataContentRaw`) without parse failure, and the hash is still verified. Consumers SHOULD branch on `schemaVersion` when reading and fall back gracefully when the version is unknown.

## Indexer Status Tags

The indexer assigns one of four status values to every metadata record. Downstream consumers (frontend, external integrations) read these tags via the GraphQL query layer.

| Status | Meaning |
|--------|---------|
| `empty` | URI and hash are both zero; no metadata is attached to this record |
| `ok` | Content successfully fetched and, if hash is non-zero, `keccak256(fetched_bytes)` matches the on-chain `contentHash` |
| `mismatch` | Content was fetched but `keccak256(fetched_bytes)` does not match the on-chain `contentHash` |
| `unreachable` | URI is set but the fetch failed: non-200 HTTP response, response exceeds 256 KiB, fetch timed out after 5 seconds, or URI uses a disallowed scheme |

A record with `uri == ""` and `contentHash == bytes32(0)` receives status `empty` immediately without any fetch attempt. Commitments and agreements are immutable, so if their status is `mismatch` or `unreachable` it will not change unless the contract is redeployed. Operators can update their metadata via `setOperatorMetadata`, which triggers a new fetch and reassigns the status.

## Out of scope

These conventions deliberately do not specify:

- **A JSON Schema validator dependency** — the prose spec here is the definition; payloads are validated by convention, not by a schema toolchain
- **Multi-gateway IPFS failover** — the indexer uses a single configurable gateway
- **A metadata history table for operators** — the Ponder event log is the history source
- **Content-addressable storage of fetched bytes** — the on-chain event plus the IPFS gateway is the canonical source
- **Signed metadata (separate from contentHash)** — producers may include a signature field inside their JSON payload if desired
- **A re-fetch worker for `unreachable` records** — status is set once on the triggering event; there is no background retry
