/**
 * Metadata fetcher module for the Commitments Protocol indexer.
 *
 * Fetches off-chain metadata referenced by on-chain URI and verifies its
 * keccak256 hash against the on-chain contentHash field.
 *
 * Design constraints (from metadata-conventions.md and CONTEXT.md):
 *  - Scheme allowlist: ipfs:// and https:// only; all other schemes → 'unreachable'
 *  - 5-second timeout via AbortController
 *  - 256 KiB body size cap via streaming read (prevents memory exhaustion)
 *  - One-shot fetch per event, no retry loop
 *  - IPFS gateway: IPFS_GATEWAY env var, default https://ipfs.io/ipfs/
 *  - Hash verified on RAW bytes (pre-parse); keccak256(utf8_bytes_fetched) vs on-chain hash
 *  - Parsed JSON → metadataContent; parse failure → metadataContentRaw (raw text)
 *
 * Status values:
 *  - 'empty'       — URI is empty string (no metadata attached; hash field ignored)
 *  - 'ok'          — fetch succeeded AND (hash is zero OR hash matches keccak256 of bytes)
 *  - 'mismatch'    — fetch succeeded but keccak256 ≠ on-chain hash (non-zero hash only)
 *  - 'unreachable' — fetch failed: wrong scheme, timeout, oversize, non-200, network error
 */
import { keccak256, type Hex } from 'viem'

export type MetadataStatus = 'empty' | 'ok' | 'mismatch' | 'unreachable'

export interface MetadataFetchResult {
  status: MetadataStatus
  uri: string
  hash: Hex
  content: unknown | null
  contentRaw: string | null
}

// ----------------------------------------------------------------------------
// Constants
// ----------------------------------------------------------------------------

const ZERO_HASH =
  '0x0000000000000000000000000000000000000000000000000000000000000000' as const
const MAX_BODY_BYTES = 256 * 1024 // 256 KiB
const FETCH_TIMEOUT_MS = 5000
const DEFAULT_IPFS_GATEWAY = 'https://ipfs.io/ipfs/'

// ----------------------------------------------------------------------------
// Public API
// ----------------------------------------------------------------------------

/**
 * Fetch metadata from the given URI, verify the keccak256 hash against
 * `expectedHash`, and return a structured result.
 *
 * @param uri           On-chain metadata URI. Empty string → status 'empty'.
 * @param expectedHash  On-chain contentHash. Zero bytes32 means "no attestation".
 * @param fetchImpl     Injectable fetch implementation (default: global fetch).
 *                      Pass a mock in tests to avoid real network calls.
 */
export async function fetchMetadata(
  uri: string,
  expectedHash: Hex,
  fetchImpl: typeof fetch = fetch,
): Promise<MetadataFetchResult> {
  // 1. Empty sentinel — URI empty means no metadata regardless of hash value
  if (!uri || uri.length === 0) {
    return { status: 'empty', uri: '', hash: expectedHash, content: null, contentRaw: null }
  }

  // 2. Inline data: URI — self-contained JSON, no network. Parsed synchronously
  //    so the indexer can seed demo/test content without an IPFS gateway.
  //    Supported forms (per RFC 2397, narrowed to JSON):
  //      data:application/json,<urlencoded>
  //      data:application/json;base64,<base64>
  if (uri.startsWith('data:')) {
    const inline = decodeDataUri(uri)
    if (inline === null) {
      return { status: 'unreachable', uri, hash: expectedHash, content: null, contentRaw: null }
    }
    return buildResult(uri, expectedHash, inline)
  }

  // 3. Scheme allowlist — ipfs:// and https:// are permitted; everything else rejected
  const resolvedUrl = resolveUri(uri)
  if (resolvedUrl === null) {
    return { status: 'unreachable', uri, hash: expectedHash, content: null, contentRaw: null }
  }

  // 4. Fetch with AbortController timeout + streaming size cap
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
  try {
    const res = await fetchImpl(resolvedUrl, { signal: controller.signal })
    if (!res.ok) {
      return { status: 'unreachable', uri, hash: expectedHash, content: null, contentRaw: null }
    }

    // Read stream with 256 KiB cap
    const bytes = await readCapped(res, MAX_BODY_BYTES)
    if (bytes === null) {
      return { status: 'unreachable', uri, hash: expectedHash, content: null, contentRaw: null }
    }

    return buildResult(uri, expectedHash, bytes)
  } catch {
    // AbortError (timeout), network error, or any other fetch failure
    return { status: 'unreachable', uri, hash: expectedHash, content: null, contentRaw: null }
  } finally {
    clearTimeout(timer)
  }
}

// ----------------------------------------------------------------------------
// Helpers (module-private)
// ----------------------------------------------------------------------------

/**
 * Shared post-fetch path: hash raw bytes, classify status, parse JSON.
 * Used by both the data: inline path and the http(s)/ipfs fetch path so both
 * routes apply the same keccak256-on-raw-bytes rule.
 */
function buildResult(uri: string, expectedHash: Hex, bytes: Uint8Array): MetadataFetchResult {
  const computedHash = keccak256(bytes)
  const hashIsZero = expectedHash.toLowerCase() === ZERO_HASH.toLowerCase()
  let status: MetadataStatus
  if (hashIsZero) {
    status = 'ok'
  } else if (computedHash.toLowerCase() === expectedHash.toLowerCase()) {
    status = 'ok'
  } else {
    status = 'mismatch'
  }

  const text = new TextDecoder('utf-8').decode(bytes)
  let content: unknown | null = null
  let contentRaw: string | null = null
  try {
    content = JSON.parse(text)
  } catch {
    contentRaw = text
  }
  return { status, uri, hash: expectedHash, content, contentRaw }
}

/**
 * Decode a `data:application/json[;base64],<payload>` URI to its raw bytes.
 * Narrowed to the JSON media type to keep the allowlist tight — arbitrary
 * media types are not accepted. Returns null if the URI is malformed, uses
 * a different media type, or decodes to more than MAX_BODY_BYTES.
 *
 * Intended for test/demo/seed use where a producer wants a self-contained
 * URI that the indexer can resolve without a gateway. Production producers
 * should prefer ipfs:// (content-addressed) or https:// (hosted).
 */
function decodeDataUri(uri: string): Uint8Array | null {
  // Minimum: "data:application/json,"
  const comma = uri.indexOf(',')
  if (comma < 0) return null
  const meta = uri.slice('data:'.length, comma) // e.g. "application/json" or "application/json;base64"
  const payload = uri.slice(comma + 1)
  const parts = meta.split(';').map((s) => s.trim().toLowerCase())
  const mediaType = parts[0]
  const isBase64 = parts.includes('base64')
  if (mediaType !== 'application/json') return null

  try {
    let bytes: Uint8Array
    if (isBase64) {
      // atob is global in Node 20+ and browsers; decodes standard base64 alphabet
      const binary = atob(payload)
      bytes = new Uint8Array(binary.length)
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
    } else {
      // percent-encoded UTF-8 text per RFC 2397
      const decoded = decodeURIComponent(payload)
      bytes = new TextEncoder().encode(decoded)
    }
    if (bytes.length > MAX_BODY_BYTES) return null
    return bytes
  } catch {
    return null
  }
}

/**
 * Resolve a metadata URI to an HTTP(S) URL the native fetch can consume.
 * Returns null if the URI scheme is not in the allowlist.
 *
 * Supported:
 *  - ipfs://CID[/path] → ${IPFS_GATEWAY}CID[/path]
 *  - https://...       → returned as-is
 *  - data:application/json[;base64],...  handled upstream by decodeDataUri
 *
 * Blocked (return null → status 'unreachable'):
 *  - http://  (cleartext — intentionally excluded)
 *  - file://  (SSRF / local file read)
 *  - anything else
 */
function resolveUri(uri: string): string | null {
  if (uri.startsWith('ipfs://')) {
    const gateway = process.env.IPFS_GATEWAY ?? DEFAULT_IPFS_GATEWAY
    const path = uri.slice('ipfs://'.length)
    return gateway + path
  }
  if (uri.startsWith('https://')) {
    return uri
  }
  // http://, file://, ftp://, etc. — explicitly rejected. data: is handled
  // before reaching this function.
  return null
}

/**
 * Read a fetch Response body stream, accumulating chunks up to `maxBytes`.
 * Returns null if the body is absent or if the total size exceeds the cap.
 *
 * Streaming prevents allocating a large buffer before the size is known.
 */
async function readCapped(res: Response, maxBytes: number): Promise<Uint8Array | null> {
  if (!res.body) return null
  const reader = res.body.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      if (!value) continue
      total += value.length
      if (total > maxBytes) {
        // Cancel the stream to free resources, then signal cap exceeded
        try {
          await reader.cancel()
        } catch {
          // Ignore cancel errors — stream may already be closed
        }
        return null
      }
      chunks.push(value)
    }
  } catch {
    return null
  }
  // Assemble chunks into a single Uint8Array
  const out = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) {
    out.set(chunk, offset)
    offset += chunk.length
  }
  return out
}
