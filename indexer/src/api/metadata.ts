import { Hono } from 'hono'
import { keccak256, type Hex } from 'viem'
import { clientKey, createRateLimiter } from './rateLimit.ts'

/**
 * Metadata pinning endpoint — `POST /metadata/pin`.
 *
 * Server-side companion to `metadataFetcher.ts`. The frontend authors a
 * metadata JSON object inline and POSTs it here; this endpoint pins the
 * *exact bytes it received* to a content-addressed store and returns the
 * canonical `ipfs://` URI plus the keccak256 hash of those bytes. The
 * producer then writes `metadataURI` + `metadataHash` on-chain, and a later
 * indexer fetch+verify yields `metadataStatus: ok`.
 *
 * Hash contract (see docs/protocol/reference/metadata-conventions.md):
 *
 *     metadataHash = keccak256(exact_utf8_bytes_the_producer_posted)
 *
 * NO canonicalization, NO re-serialization, whitespace matters. We hash the
 * raw request body bytes verbatim and pin those same bytes — never a
 * re-encoded JSON string — so the bytes fetched back are byte-for-byte
 * identical to the bytes hashed. The only validation is "does it parse as a
 * JSON object"; we never mutate the bytes after that check.
 *
 * Pinning backends, in precedence order (server-side credentials only, never
 * sent to the client):
 *  - `PINATA_JWT`     → Pinata `pinFileToIPFS` (preferred). The raw bytes are
 *                       uploaded as a single file so the returned CID directly
 *                       addresses those bytes; `ipfs://<cid>` resolves to them.
 *  - `IPFS_API_URL`   → a local or self-hosted Kubo node's `/api/v0/add`.
 *                       Same CIDv1 shape as the Pinata path, no account
 *                       required. See `docker-compose.yml` at the repo root.
 *  - none configured  → dev fallback: a self-contained
 *                       `data:application/json;base64,<base64>` URI. The
 *                       fetcher already resolves `data:` URIs, so the whole
 *                       pin→hash→verify round-trip works offline against
 *                       `just dev-up` / `just indexer-dev` with no external
 *                       credentials. `cid` is `null` in this mode.
 *
 * Only the last of those escapes nothing: an inline `data:` URI carries the
 * whole document, so it runs into the contract's 512-byte URI cap at roughly
 * 360 bytes of JSON. Either IPFS backend produces a ~66-byte URI regardless of
 * document size, which is what makes long descriptions writable at all.
 *
 * Limits / safety:
 *  - 256 KiB body cap (matches the fetcher's read cap).
 *  - Body must parse as a JSON object (arrays / scalars rejected).
 *  - Basic per-IP fixed-window rate limit to blunt abuse.
 */

const MAX_BODY_BYTES = 256 * 1024 // 256 KiB — matches metadataFetcher.ts
const PIN_TIMEOUT_MS = 15_000

// --- Basic rate limiting -----------------------------------------------------
// Shared fixed-window limiter (see ./rateLimit). 30 pins / minute / IP.
const pinLimiter = createRateLimiter({ windowMs: 60_000, maxPerWindow: 30 })

// --- Pinning backends --------------------------------------------------------

interface PinResult {
  cid: string | null
  metadataURI: string
  service: 'pinata' | 'kubo' | 'data-uri'
}

/**
 * Pin raw bytes to Pinata via `pinFileToIPFS`. A single file is uploaded so
 * the returned `IpfsHash` is the CID of the file content itself (Pinata only
 * wraps in a directory for multi-file/folder uploads), meaning `ipfs://<cid>`
 * resolves back to exactly these bytes.
 */
async function pinToPinata(bytes: Uint8Array, jwt: string): Promise<PinResult> {
  const form = new FormData()
  // Copy into a fresh ArrayBuffer-backed view so Blob gets a clean buffer.
  const blob = new Blob([bytes.slice()], { type: 'application/json' })
  form.append('file', blob, 'metadata.json')
  // cidVersion 1 → base32 CIDv1, the modern default expected by gateways.
  form.append('pinataOptions', JSON.stringify({ cidVersion: 1 }))

  const res = await fetch('https://api.pinata.cloud/pinning/pinFileToIPFS', {
    method: 'POST',
    headers: { Authorization: `Bearer ${jwt}` },
    body: form,
    signal: AbortSignal.timeout(PIN_TIMEOUT_MS),
  })
  if (!res.ok) {
    const detail = await res.text().catch(() => '')
    throw new Error(`Pinata HTTP ${res.status}${detail ? `: ${detail.slice(0, 200)}` : ''}`)
  }
  const json = (await res.json()) as { IpfsHash?: string }
  const cid = json.IpfsHash
  if (!cid || typeof cid !== 'string') {
    throw new Error('Pinata response missing IpfsHash')
  }
  return { cid, metadataURI: `ipfs://${cid}`, service: 'pinata' }
}

/**
 * Pin raw bytes to a local (or self-hosted) Kubo node via its HTTP API.
 *
 * `cid-version=1` matches the Pinata path so both backends mint the same
 * base32 CIDv1 shape, and `pin=true` keeps the block from being garbage
 * collected out from under the on-chain reference. A single file is added with
 * `wrap-with-directory` left off, so the returned hash addresses exactly these
 * bytes and `ipfs://<cid>` resolves back to them — the same contract Pinata's
 * path upholds.
 *
 * Kubo's `/api/v0/add` streams newline-delimited JSON, one object per added
 * object. With a single unwrapped file that is one line, but the loop below
 * takes the LAST non-empty line regardless, because that is the root entry in
 * every shape the endpoint can return.
 */
async function pinToKubo(
  bytes: Uint8Array,
  apiUrl: string,
  fetchImpl: typeof fetch = fetch,
): Promise<PinResult> {
  const form = new FormData()
  const blob = new Blob([bytes.slice()], { type: 'application/json' })
  form.append('file', blob, 'metadata.json')

  const base = apiUrl.replace(/\/+$/, '')
  const res = await fetchImpl(`${base}/api/v0/add?cid-version=1&pin=true`, {
    method: 'POST',
    body: form,
    signal: AbortSignal.timeout(PIN_TIMEOUT_MS),
  })
  if (!res.ok) {
    const detail = await res.text().catch(() => '')
    throw new Error(`Kubo HTTP ${res.status}${detail ? `: ${detail.slice(0, 200)}` : ''}`)
  }

  const text = await res.text()
  const lines = text.split('\n').filter((l) => l.trim().length > 0)
  const last = lines[lines.length - 1]
  if (!last) throw new Error('Kubo add returned an empty response')
  let parsed: { Hash?: string }
  try {
    parsed = JSON.parse(last) as { Hash?: string }
  } catch {
    throw new Error(`Kubo add returned unparseable output: ${last.slice(0, 200)}`)
  }
  const cid = parsed.Hash
  if (!cid || typeof cid !== 'string') {
    throw new Error('Kubo add response missing Hash')
  }
  return { cid, metadataURI: `ipfs://${cid}`, service: 'kubo' }
}

/**
 * Dev fallback: encode the raw bytes into a self-contained
 * `data:application/json;base64,...` URI. The fetcher decodes base64 back to
 * the exact same bytes before hashing, so the round-trip hash still matches.
 *
 * No CID exists for a data: URI, so `cid` is null. Note the contract's 512-byte
 * URI cap: only small payloads (~360 bytes of JSON) fit on-chain via data:.
 */
function pinToDataUri(bytes: Uint8Array): PinResult {
  // Base64 of the raw bytes (Buffer is the simplest correct encoder in Node).
  const base64 = Buffer.from(bytes).toString('base64')
  return {
    cid: null,
    metadataURI: `data:application/json;base64,${base64}`,
    service: 'data-uri',
  }
}

// --- Route -------------------------------------------------------------------

const app = new Hono()

/**
 * POST /metadata/pin
 *
 * Request body: the exact metadata JSON object to pin (raw bytes, verbatim).
 * Response (200):
 * ```
 * {
 *   "cid": "bafy…" | null,            // null when using the dev data: fallback
 *   "metadataURI": "ipfs://bafy…",    // or "data:application/json;base64,…"
 *   "metadataHash": "0x<keccak256 of the exact pinned bytes>",
 *   "service": "pinata" | "kubo" | "data-uri"  // informational
 * }
 * ```
 *
 * Errors: 400 (empty / oversize / non-JSON / non-object body),
 * 429 (rate limited), 502 (pinning service failure).
 */
/**
 * Injectable fetch for the pinning backends.
 *
 * Mirrors `fetchMetadata`'s `fetchImpl` parameter, and exists for the same
 * reason: tests must be able to stand in for the network WITHOUT reassigning
 * `globalThis.fetch`. That matters more here than it looks — Ponder's dev build
 * evaluates every file under `src/`, test files included, so a test that swaps
 * the global swaps it inside the running indexer process, underneath Ponder's
 * own RPC client.
 */
let pinFetch: typeof fetch = fetch

/** Test-only seam. Pass no argument to restore the real fetch. */
export function __setPinFetchForTests(impl?: typeof fetch): void {
  pinFetch = impl ?? fetch
}

app.post('/pin', async (c) => {
  // Rate sanity first — cheap rejection before reading the body.
  const key = clientKey(c.req.header('x-forwarded-for'), c.req.header('x-real-ip'))
  if (pinLimiter.limited(key)) {
    return c.json({ error: 'rate_limited', message: 'Too many pin requests; slow down.' }, 429)
  }

  // Reject obviously-oversize requests up front via Content-Length when present.
  const contentLength = Number(c.req.header('content-length') ?? '')
  if (Number.isFinite(contentLength) && contentLength > MAX_BODY_BYTES) {
    return c.json(
      { error: 'too_large', message: `Body exceeds ${MAX_BODY_BYTES} byte cap.` },
      400,
    )
  }

  // Read the RAW bytes the client posted — never re-serialize. These exact
  // bytes are both hashed and pinned.
  const buf = await c.req.arrayBuffer()
  const bytes = new Uint8Array(buf)

  if (bytes.length === 0) {
    return c.json({ error: 'empty', message: 'Request body is empty.' }, 400)
  }
  if (bytes.length > MAX_BODY_BYTES) {
    return c.json(
      { error: 'too_large', message: `Body exceeds ${MAX_BODY_BYTES} byte cap.` },
      400,
    )
  }

  // Validate that the bytes are a JSON object. We parse only to validate; we
  // do NOT use the parsed value for hashing or pinning (that would re-serialize
  // and change the bytes).
  let parsed: unknown
  try {
    parsed = JSON.parse(new TextDecoder('utf-8').decode(bytes))
  } catch {
    return c.json({ error: 'invalid_json', message: 'Body is not valid JSON.' }, 400)
  }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return c.json(
      { error: 'not_object', message: 'Metadata must be a JSON object.' },
      400,
    )
  }

  // Hash the exact bytes — this is what goes on-chain as metadataHash.
  const metadataHash: Hex = keccak256(bytes)

  // Pin the same exact bytes. Precedence: Pinata (hosted, survives the laptop
  // closing), then a local Kubo node, then the inline `data:` fallback. Each
  // step down trades durability for not needing an account.
  const jwt = process.env.PINATA_JWT?.trim()
  const kuboUrl = process.env.IPFS_API_URL?.trim()
  let pin: PinResult
  if (jwt) {
    try {
      pin = await pinToPinata(bytes, jwt)
    } catch (err) {
      return c.json(
        {
          error: 'pin_failed',
          message: `Pinning service error: ${err instanceof Error ? err.message : String(err)}`,
        },
        502,
      )
    }
  } else if (kuboUrl) {
    // A configured-but-unreachable node is an error, never a silent downgrade:
    // falling back to `data:` here would quietly reintroduce the 512-byte cap
    // the node was started to escape, and the author would find out from a
    // reverted transaction rather than from this response.
    try {
      pin = await pinToKubo(bytes, kuboUrl, pinFetch)
    } catch (err) {
      return c.json(
        {
          error: 'pin_failed',
          message:
            `IPFS node at ${kuboUrl} could not be reached: ` +
            `${err instanceof Error ? err.message : String(err)}. ` +
            `Start it with \`docker compose up -d ipfs\`, or unset IPFS_API_URL to inline metadata instead.`,
        },
        502,
      )
    }
  } else {
    // No pinning backend at all → dev fallback so the flow works offline.
    pin = pinToDataUri(bytes)
  }

  return c.json({
    cid: pin.cid,
    metadataURI: pin.metadataURI,
    metadataHash,
    service: pin.service,
  })
})

export default app
