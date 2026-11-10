import { describe, expect, it } from 'vitest'
import { keccak256, toBytes, zeroHash } from 'viem'
import {
  validateMetadataURI,
  validateMetadataHash,
  buildDataJsonUri,
  computeHashFromJsonText,
  resolveMetadataArgs,
  EMPTY_URI,
} from '../metadataForm'

describe('validateMetadataURI', () => {
  it('accepts an empty URI with no error or warning', () => {
    expect(validateMetadataURI('')).toEqual({ error: null, warning: null })
  })

  it('accepts ipfs:// and https:// schemes cleanly', () => {
    expect(validateMetadataURI('ipfs://abc')).toEqual({ error: null, warning: null })
    expect(validateMetadataURI('https://example.com/m.json')).toEqual({
      error: null,
      warning: null,
    })
  })

  it('warns (not errors) for an unsupported scheme', () => {
    const r = validateMetadataURI('http://insecure')
    expect(r.error).toBeNull()
    expect(r.warning).toMatch(/SCHEME NOT ALLOWED/)
  })

  it('accepts inline data:application/json URIs (indexer decodes them)', () => {
    expect(validateMetadataURI('data:application/json;base64,e30=')).toEqual({
      error: null,
      warning: null,
    })
    expect(validateMetadataURI('data:application/json,%7B%7D')).toEqual({
      error: null,
      warning: null,
    })
  })

  it('errors when the URI exceeds 512 bytes', () => {
    const long = 'https://x/' + 'a'.repeat(520)
    expect(validateMetadataURI(long).error).toMatch(/TOO LONG/)
  })
})

describe('validateMetadataHash', () => {
  it('accepts empty and the zero hash', () => {
    expect(validateMetadataHash('')).toEqual({ error: null, warning: null })
    expect(validateMetadataHash(zeroHash)).toEqual({ error: null, warning: null })
  })

  it('accepts a well-formed 32-byte hex hash', () => {
    expect(validateMetadataHash('0x' + 'a'.repeat(64)).error).toBeNull()
  })

  it('errors on the wrong length or non-hex characters', () => {
    expect(validateMetadataHash('0x' + 'a'.repeat(63)).error).toMatch(/INVALID HASH/)
    expect(validateMetadataHash('0x' + 'z'.repeat(64)).error).toMatch(/INVALID HASH/)
  })
})

describe('buildDataJsonUri', () => {
  it('base64-encodes the exact JSON bytes behind the data: prefix', () => {
    const json = '{"type":"agent-sla.v1","service":"intent-execution"}'
    const uri = buildDataJsonUri(json)
    expect(uri.startsWith('data:application/json;base64,')).toBe(true)
    const decoded = atob(uri.slice('data:application/json;base64,'.length))
    expect(decoded).toBe(json)
  })

  it('round-trips multi-byte UTF-8 content', () => {
    const json = '{"name":"ऐजेंट — agent ✓"}'
    const uri = buildDataJsonUri(json)
    const bytes = Uint8Array.from(atob(uri.slice('data:application/json;base64,'.length)), (c) =>
      c.charCodeAt(0),
    )
    expect(new TextDecoder().decode(bytes)).toBe(json)
  })

  it('pairs with computeHashFromJsonText — hash attests the encoded bytes', () => {
    // The indexer hashes the DECODED data-URI payload; both derive from the
    // same JSON text so they can never drift.
    const json = '{"maxDrawdownBps":500}'
    expect(computeHashFromJsonText(json)).toBe(keccak256(toBytes(json)))
    const decoded = atob(buildDataJsonUri(json).slice('data:application/json;base64,'.length))
    expect(computeHashFromJsonText(decoded)).toBe(computeHashFromJsonText(json))
  })
})

describe('computeHashFromJsonText', () => {
  it('is keccak256 over the raw utf-8 bytes (no canonicalization)', () => {
    const text = '{"name":"x"}'
    expect(computeHashFromJsonText(text)).toBe(keccak256(toBytes(text)))
  })

  it('is whitespace-sensitive — producer controls the exact bytes', () => {
    expect(computeHashFromJsonText('{"a":1}')).not.toBe(computeHashFromJsonText('{ "a": 1 }'))
  })
})

describe('resolveMetadataArgs', () => {
  it('maps blank/whitespace fields to EMPTY_URI + zeroHash', () => {
    expect(resolveMetadataArgs('   ', '')).toEqual({ uri: EMPTY_URI, hash: zeroHash })
  })

  it('passes through populated values unchanged', () => {
    const hash = ('0x' + 'b'.repeat(64)) as `0x${string}`
    expect(resolveMetadataArgs('ipfs://abc', hash)).toEqual({ uri: 'ipfs://abc', hash })
  })
})
