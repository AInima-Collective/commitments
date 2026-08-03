/**
 * Metadata fetcher module for the Commitments Protocol indexer.
 *
 * Fetches off-chain metadata referenced by on-chain URI and verifies its
 * keccak256 hash against the on-chain contentHash field.
 *
 * Design constraints (from metadata-conventions.md and CONTEXT.md):
 *  - Scheme allowlist: ipfs:// and https:// only; all other schemes → 'unreachable'
 *  - Direct HTTPS DNS answers must all be globally routable unicast addresses
 *  - Validated DNS is pinned into the socket lookup; redirects are disabled
 *  - 5-second timeout via AbortController
 *  - 256 KiB body size cap via streaming read (prevents memory exhaustion)
 *  - One-shot fetch per event, no retry loop
 *  - IPFS gateway: trusted operator IPFS_GATEWAY, default https://ipfs.io/ipfs/
 *  - Hash verified on RAW bytes (pre-parse); keccak256(utf8_bytes_fetched) vs on-chain hash
 *  - Parsed JSON → metadataContent; parse failure → metadataContentRaw (raw text)
 *
 * Status values:
 *  - 'empty'       — URI is empty string (no metadata attached; hash field ignored)
 *  - 'ok'          — fetch succeeded AND (hash is zero OR hash matches keccak256 of bytes)
 *  - 'mismatch'    — fetch succeeded but keccak256 ≠ on-chain hash (non-zero hash only)
 *  - 'unreachable' — fetch failed: wrong scheme, timeout, oversize, non-200, network error
 */
import { lookup } from 'node:dns/promises'
import type { LookupFunction } from 'node:net'
import ipaddr from 'ipaddr.js'
import { Agent, fetch as undiciFetch, type Dispatcher } from 'undici'
import { keccak256, type Hex } from 'viem'

export type MetadataStatus = 'empty' | 'ok' | 'mismatch' | 'unreachable'

export interface MetadataFetchResult {
  status: MetadataStatus
  uri: string
  hash: Hex
  content: unknown | null
  contentRaw: string | null
}

export interface ResolvedAddress {
  address: string
  family: 4 | 6
}

export type MetadataHostResolver = (hostname: string) => Promise<ResolvedAddress[]>

export interface MetadataTransportRequest {
  url: URL
  init: RequestInit
  address: ResolvedAddress
  fetchImpl: typeof fetch
}

export interface MetadataTransportResponse {
  response: Response
  release: () => Promise<void>
}

/**
 * Transport seam used by tests and alternative runtimes. Production uses an
 * Undici Agent whose DNS lookup always returns the already-validated address,
 * binding the security decision to the socket connection and preventing DNS
 * rebinding between validation and connect.
 */
export type MetadataTransport = (
  request: MetadataTransportRequest,
) => Promise<MetadataTransportResponse>

export interface MetadataFetchDependencies {
  resolveHostname?: MetadataHostResolver
  transport?: MetadataTransport
  /** Override the operator-selected gateway. Primarily useful for tests. */
  ipfsGateway?: string
}

// ----------------------------------------------------------------------------
// Constants
// ----------------------------------------------------------------------------

const ZERO_HASH =
  '0x0000000000000000000000000000000000000000000000000000000000000000' as const
const MAX_BODY_BYTES = 256 * 1024 // 256 KiB
const FETCH_TIMEOUT_MS = 5000
const DEFAULT_IPFS_GATEWAY = 'https://ipfs.io/ipfs/'
const DEFAULT_FETCH = undiciFetch as unknown as typeof fetch

// ----------------------------------------------------------------------------
// Public API
// ----------------------------------------------------------------------------

/**
 * Fetch metadata from the given URI, verify the keccak256 hash against
 * `expectedHash`, and return a structured result.
 *
 * @param uri           On-chain metadata URI. Empty string → status 'empty'.
 * @param expectedHash  On-chain contentHash. Zero bytes32 means "no attestation".
 * @param fetchImpl     Injectable fetch implementation (default: Undici fetch).
 *                      Pass a mock in tests to avoid real network calls.
 * @param dependencies  Injectable resolver/transport/gateway security seams.
 */
export async function fetchMetadata(
  uri: string,
  expectedHash: Hex,
  fetchImpl: typeof fetch = DEFAULT_FETCH,
  dependencies: MetadataFetchDependencies = {},
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
  const target = resolveUri(uri, dependencies.ipfsGateway)
  if (target === null) {
    return { status: 'unreachable', uri, hash: expectedHash, content: null, contentRaw: null }
  }

  // 4. Resolve every address, reject any non-public result for direct HTTPS,
  //    then pin one validated result into the actual connection. IPFS is the
  //    deliberate exception: its origin comes only from trusted operator
  //    configuration, so a private gateway is permitted (but still pinned).
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
  let releaseTransport: (() => Promise<void>) | null = null
  try {
    const resolver = dependencies.resolveHostname ?? defaultResolveHostname
    const hostname = unbracketHostname(target.url.hostname)
    const addresses = await abortable(resolver(hostname), controller.signal)
    const validated = validateResolvedAddresses(addresses)
    if (validated === null) {
      return { status: 'unreachable', uri, hash: expectedHash, content: null, contentRaw: null }
    }
    if (!target.trustedGateway && validated.some((address) => !isPublicAddress(address.address))) {
      return { status: 'unreachable', uri, hash: expectedHash, content: null, contentRaw: null }
    }

    const transport = dependencies.transport ?? pinnedUndiciTransport
    const transported = await transport({
      url: target.url,
      init: { signal: controller.signal, redirect: 'manual' },
      address: validated[0]!,
      fetchImpl,
    })
    releaseTransport = transported.release
    const res = transported.response

    // Redirects are never followed. This rejects HTTPS→HTTP and public→private
    // redirects without parsing Location, resolving the destination, or reading
    // any response bytes from a potentially internal service.
    if (res.status >= 300 && res.status < 400) {
      await discardBody(res)
      return { status: 'unreachable', uri, hash: expectedHash, content: null, contentRaw: null }
    }
    if (!res.ok) {
      await discardBody(res)
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
    if (releaseTransport) {
      try {
        await releaseTransport()
      } catch {
        // A failed transport cleanup must not turn an otherwise classified
        // metadata result into an indexing failure.
      }
    }
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

interface ResolvedTarget {
  url: URL
  /** True only when the origin came from parsed operator configuration. */
  trustedGateway: boolean
}

/** Resolve and strictly parse a network metadata URI. */
function resolveUri(uri: string, gatewayOverride?: string): ResolvedTarget | null {
  if (/^ipfs:\/\//i.test(uri)) {
    return resolveIpfsUri(uri, gatewayOverride)
  }

  let url: URL
  try {
    url = new URL(uri)
  } catch {
    return null
  }
  if (url.protocol !== 'https:' || !url.hostname || url.username || url.password) return null
  return { url, trustedGateway: false }
}

/**
 * Resolve an ipfs:// URI beneath an operator-selected gateway path. HTTPS is
 * preferred and used by default; explicit HTTP gateways are allowed because
 * their origin is operator authority (for example, loopback Kubo in dev).
 * User-controlled input is decoded segment-by-segment and reconstructed, so it
 * cannot replace the configured origin or escape the configured path using
 * dot segments, encoded separators, credentials, queries, or fragments.
 */
function resolveIpfsUri(uri: string, gatewayOverride?: string): ResolvedTarget | null {
  const rawPath = uri.slice(uri.indexOf('://') + 3)
  if (!rawPath || /[?#\\]/.test(rawPath)) return null

  const rawSegments = rawPath.split('/')
  const cid = rawSegments.shift()
  if (!cid || !/^[A-Za-z0-9]+$/.test(cid)) return null

  const segments: string[] = [cid]
  try {
    for (const rawSegment of rawSegments) {
      const decoded = decodeURIComponent(rawSegment)
      if (
        decoded === '.' ||
        decoded === '..' ||
        decoded.includes('/') ||
        decoded.includes('\\') ||
        decoded.includes('\0')
      ) {
        return null
      }
      segments.push(decoded)
    }
  } catch {
    return null
  }

  const configured =
    gatewayOverride?.trim() || process.env.IPFS_GATEWAY?.trim() || DEFAULT_IPFS_GATEWAY
  let gateway: URL
  try {
    gateway = new URL(configured)
  } catch {
    return null
  }
  if (
    (gateway.protocol !== 'https:' && gateway.protocol !== 'http:') ||
    !gateway.hostname ||
    gateway.username ||
    gateway.password ||
    gateway.search ||
    gateway.hash
  ) {
    return null
  }

  const basePath = gateway.pathname.endsWith('/') ? gateway.pathname : `${gateway.pathname}/`
  const url = new URL(gateway.href)
  url.pathname = basePath + segments.map((segment) => encodeURIComponent(segment)).join('/')
  if (url.origin !== gateway.origin || !url.pathname.startsWith(basePath)) return null
  return { url, trustedGateway: true }
}

function unbracketHostname(hostname: string): string {
  return hostname.startsWith('[') && hostname.endsWith(']') ? hostname.slice(1, -1) : hostname
}

async function defaultResolveHostname(hostname: string): Promise<ResolvedAddress[]> {
  if (ipaddr.isValid(hostname)) {
    const parsed = ipaddr.parse(hostname)
    return [{ address: parsed.toString(), family: parsed.kind() === 'ipv4' ? 4 : 6 }]
  }
  const addresses = await lookup(hostname, { all: true, order: 'verbatim' })
  return addresses.map(({ address, family }) => ({ address, family: family as 4 | 6 }))
}

/** Validate resolver output and normalize it for the pinned socket lookup. */
function validateResolvedAddresses(addresses: ResolvedAddress[]): ResolvedAddress[] | null {
  if (addresses.length === 0) return null
  const normalized: ResolvedAddress[] = []
  for (const candidate of addresses) {
    if (candidate.address.includes('%') || !ipaddr.isValid(candidate.address)) return null
    const parsed = ipaddr.parse(candidate.address)
    const family = parsed.kind() === 'ipv4' ? 4 : 6
    if (candidate.family !== family) return null
    normalized.push({ address: parsed.toString(), family })
  }
  return normalized
}

/** Only globally routable unicast addresses are valid for direct HTTPS URIs. */
export function isPublicAddress(address: string): boolean {
  if (!ipaddr.isValid(address)) return false
  let parsed = ipaddr.parse(address)
  if (parsed instanceof ipaddr.IPv6 && parsed.isIPv4MappedAddress()) {
    parsed = parsed.toIPv4Address()
  }
  return parsed.range() === 'unicast'
}

/** Build the lookup callback installed on the actual Undici connection. */
export function createPinnedLookup(pinned: ResolvedAddress): LookupFunction {
  return (_hostname, options, callback) => {
    if (options.all) {
      callback(null, [{ address: pinned.address, family: pinned.family }])
    } else {
      callback(null, pinned.address, pinned.family)
    }
  }
}

const pinnedUndiciTransport: MetadataTransport = async ({ url, init, address, fetchImpl }) => {
  const dispatcher: Dispatcher = new Agent({
    connect: {
      lookup: createPinnedLookup(address),
      autoSelectFamily: false,
    },
  })
  try {
    const response = await fetchImpl(
      url.href,
      { ...init, dispatcher } as RequestInit & { dispatcher: Dispatcher },
    )
    return { response, release: () => dispatcher.close() }
  } catch (error) {
    await dispatcher.destroy().catch(() => undefined)
    throw error
  }
}

async function discardBody(response: Response): Promise<void> {
  try {
    await response.body?.cancel()
  } catch {
    // Best-effort connection cleanup only; never read or surface response bytes.
  }
}

function abortable<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) return Promise.reject(new DOMException('Aborted', 'AbortError'))
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => reject(new DOMException('Aborted', 'AbortError'))
    signal.addEventListener('abort', onAbort, { once: true })
    promise.then(
      (value) => {
        signal.removeEventListener('abort', onAbort)
        resolve(value)
      },
      (error) => {
        signal.removeEventListener('abort', onAbort)
        reject(error)
      },
    )
  })
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
    try {
      await reader.cancel()
    } catch {
      // Stream may already be errored or closed.
    }
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
