import { keccak256, toBytes, type Hex, zeroHash } from 'viem'

export const EMPTY_URI = ''
const URI_MAX_BYTES = 512
const HASH_HEX_LENGTH = 66 // '0x' + 64 hex chars

/** Prefix of an inline base64 JSON URI, per RFC 2397. */
export const DATA_JSON_PREFIX = 'data:application/json;base64,'

/**
 * Largest JSON payload that still fits under the contract's 512-byte URI cap
 * once inlined as a `data:` URI.
 *
 * 512 minus the 29-character prefix leaves 483 base64 characters; base64
 * encodes three bytes per four characters, so 120 complete groups carry 360
 * bytes. One byte more and the URI clears the cap and `createCommitment`
 * reverts — which is why this is a computed constant and not a guess.
 */
export const MAX_INLINE_JSON_BYTES =
  Math.floor((URI_MAX_BYTES - DATA_JSON_PREFIX.length) / 4) * 3

export interface MetadataValidation {
  error: string | null
  warning: string | null
}

export function validateMetadataURI(uri: string): MetadataValidation {
  if (uri.length === 0) return { error: null, warning: null }
  // Byte length, not char count — enforce contract cap.
  const byteLength = new TextEncoder().encode(uri).length
  if (byteLength > URI_MAX_BYTES) {
    return { error: 'URI TOO LONG — MAXIMUM 512 BYTES', warning: null }
  }
  const isIpfs = uri.startsWith('ipfs://')
  const isHttps = uri.startsWith('https://')
  // Inline JSON — the indexer's metadataFetcher decodes
  // data:application/json[;base64],<payload> and hashes the decoded bytes.
  const isDataJson = uri.startsWith('data:application/json')
  if (!isIpfs && !isHttps && !isDataJson) {
    return { error: null, warning: 'URI SCHEME NOT ALLOWED — INDEXER WILL MARK UNREACHABLE' }
  }
  return { error: null, warning: null }
}

export function validateMetadataHash(hash: string): MetadataValidation {
  if (hash.length === 0) return { error: null, warning: null }
  if (hash === zeroHash) return { error: null, warning: null }
  const hex = /^0x[0-9a-fA-F]{64}$/
  if (hash.length !== HASH_HEX_LENGTH || !hex.test(hash)) {
    return { error: 'INVALID HASH — MUST BE 32-BYTE HEX', warning: null }
  }
  return { error: null, warning: null }
}

/**
 * Compute keccak256(utf8Bytes(text)) per docs/protocol/reference/concepts/metadata.md.
 * Producer controls the exact bytes; no canonicalization.
 */
export function computeHashFromJsonText(text: string): Hex {
  return keccak256(toBytes(text))
}

/**
 * Encode a JSON text as an inline `data:application/json;base64,…` URI.
 *
 * The indexer's metadataFetcher decodes the payload back to raw bytes and
 * verifies `keccak256(bytes)` against the on-chain hash, so the matching
 * content hash for this URI is `computeHashFromJsonText(json)` — keccak over
 * the exact same bytes that get base64-encoded here.
 */
export function buildDataJsonUri(json: string): string {
  const bytes = new TextEncoder().encode(json)
  // btoa expects a latin-1 string; map each byte through fromCharCode so
  // multi-byte UTF-8 sequences survive the round-trip.
  let binary = ''
  for (const b of bytes) binary += String.fromCharCode(b)
  return `data:application/json;base64,${btoa(binary)}`
}

/** Returns the tuple actually posted to the contract: empty string + zero hash when user left fields blank. */
export function resolveMetadataArgs(uri: string, hash: string): { uri: string; hash: Hex } {
  const resolvedUri = uri.trim().length === 0 ? EMPTY_URI : uri
  const resolvedHash: Hex =
    hash.trim().length === 0 ? zeroHash : (hash as Hex)
  return { uri: resolvedUri, hash: resolvedHash }
}
