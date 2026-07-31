/**
 * Tests for the metadata fetcher module.
 * Uses node:test (Node 20+ built-in) and injected fetchImpl for zero network I/O.
 *
 * Run: node --experimental-strip-types --test src/metadataFetcher.test.ts
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { fetchMetadata } from './metadataFetcher.ts'
import { keccak256 } from 'viem'

const ZERO = ('0x' + '0'.repeat(64)) as `0x${string}`

/**
 * Helper: create a mock fetch that returns a Response with the given body and
 * status code. Supports string or binary body.
 */
function mockFetchOk(body: string | Uint8Array, status = 200): typeof fetch {
  return (async () => {
    const bytes = typeof body === 'string' ? new TextEncoder().encode(body) : body
    return new Response(bytes, { status })
  }) as unknown as typeof fetch
}

// Test 1: empty URI returns 'empty' status
test('empty URI returns empty status', async () => {
  const r = await fetchMetadata('', ZERO)
  assert.equal(r.status, 'empty')
  assert.equal(r.uri, '')
  assert.equal(r.content, null)
  assert.equal(r.contentRaw, null)
})

// Test 2: empty URI with non-zero hash still returns 'empty' (URI dominates)
test('empty URI with non-zero hash still returns empty status', async () => {
  const nonZeroHash = ('0x' + 'a'.repeat(64)) as `0x${string}`
  const r = await fetchMetadata('', nonZeroHash)
  assert.equal(r.status, 'empty')
})

// Test 3: https:// with zero hash (no attestation) → ok, content parsed
test('https ok with zero hash returns ok and parsed content', async () => {
  const body = '{"schemaVersion":"commitment.v1","title":"hi"}'
  const r = await fetchMetadata('https://ok.example/m.json', ZERO, mockFetchOk(body))
  assert.equal(r.status, 'ok')
  assert.deepEqual(r.content, { schemaVersion: 'commitment.v1', title: 'hi' })
  assert.equal(r.contentRaw, null)
})

// Test 4: https:// with matching non-zero hash → ok
test('https ok with matching non-zero hash returns ok', async () => {
  const body = '{"a":1}'
  const bodyBytes = new TextEncoder().encode(body)
  const hash = keccak256(bodyBytes)
  const r = await fetchMetadata('https://ok.example/m.json', hash, mockFetchOk(body))
  assert.equal(r.status, 'ok')
  assert.deepEqual(r.content, { a: 1 })
})

// Test 5: https:// with wrong hash → mismatch, content still populated
test('https ok with wrong hash returns mismatch with content populated', async () => {
  const body = '{"a":1}'
  const wrongHash = ('0x' + '1'.repeat(64)) as `0x${string}`
  const r = await fetchMetadata('https://ok.example/m.json', wrongHash, mockFetchOk(body))
  assert.equal(r.status, 'mismatch')
  assert.deepEqual(r.content, { a: 1 })
  assert.equal(r.contentRaw, null)
})

// Test 6: non-JSON body with zero hash → ok, contentRaw populated, content null
test('invalid json falls back to contentRaw', async () => {
  const body = 'not { json'
  const r = await fetchMetadata('https://ok.example/m', ZERO, mockFetchOk(body))
  assert.equal(r.status, 'ok')
  assert.equal(r.content, null)
  assert.equal(r.contentRaw, 'not { json')
})

// Test 7: http:// scheme not in allowlist → unreachable, no fetch call
test('http:// scheme is unreachable without fetch call', async () => {
  let called = false
  const noFetch = (async () => {
    called = true
    return new Response('')
  }) as unknown as typeof fetch
  const r = await fetchMetadata('http://insecure.example/m', ZERO, noFetch)
  assert.equal(r.status, 'unreachable')
  assert.equal(called, false)
})

// Test 8: file:// scheme → unreachable, no fetch call
test('file:// scheme is unreachable without fetch call', async () => {
  let called = false
  const noFetch = (async () => {
    called = true
    return new Response('')
  }) as unknown as typeof fetch
  const r = await fetchMetadata('file:///etc/passwd', ZERO, noFetch)
  assert.equal(r.status, 'unreachable')
  assert.equal(called, false)
})

// Test 9a: data: scheme with non-JSON media type → unreachable, no fetch call
test('data: with non-json media type is unreachable without fetch call', async () => {
  let called = false
  const noFetch = (async () => {
    called = true
    return new Response('')
  }) as unknown as typeof fetch
  const r = await fetchMetadata('data:text/plain,hi', ZERO, noFetch)
  assert.equal(r.status, 'unreachable')
  assert.equal(called, false)
})

// Test 9b: data:application/json plaintext — ok, no fetch call, content parsed
test('data:application/json plaintext parses content without fetch', async () => {
  let called = false
  const noFetch = (async () => {
    called = true
    return new Response('')
  }) as unknown as typeof fetch
  const json = '{"schemaVersion":"commitment.v1","title":"inline"}'
  const uri = `data:application/json,${encodeURIComponent(json)}`
  const r = await fetchMetadata(uri, ZERO, noFetch)
  assert.equal(r.status, 'ok')
  assert.equal(called, false)
  assert.deepEqual(r.content, { schemaVersion: 'commitment.v1', title: 'inline' })
  assert.equal(r.contentRaw, null)
})

// Test 9c: data:application/json;base64 — ok, no fetch call
test('data:application/json;base64 decodes and parses content without fetch', async () => {
  let called = false
  const noFetch = (async () => {
    called = true
    return new Response('')
  }) as unknown as typeof fetch
  const json = '{"schemaVersion":"operator.v1","name":"Inline Op"}'
  const base64 = Buffer.from(json, 'utf-8').toString('base64')
  const uri = `data:application/json;base64,${base64}`
  const r = await fetchMetadata(uri, ZERO, noFetch)
  assert.equal(r.status, 'ok')
  assert.equal(called, false)
  assert.deepEqual(r.content, { schemaVersion: 'operator.v1', name: 'Inline Op' })
})

// Test 9d: data:application/json;base64 with matching non-zero hash → ok
test('data:application/json;base64 with matching hash returns ok', async () => {
  const json = '{"schemaVersion":"commitment.v1","title":"hashed"}'
  const bytes = new TextEncoder().encode(json)
  const expectedHash = keccak256(bytes)
  const base64 = Buffer.from(bytes).toString('base64')
  const uri = `data:application/json;base64,${base64}`
  const noFetch = (async () => new Response('')) as unknown as typeof fetch
  const r = await fetchMetadata(uri, expectedHash, noFetch)
  assert.equal(r.status, 'ok')
  assert.deepEqual(r.content, { schemaVersion: 'commitment.v1', title: 'hashed' })
})

// Test 9e: data:application/json;base64 with wrong hash → mismatch, content still populated
test('data:application/json with mismatched hash returns mismatch', async () => {
  const uri = `data:application/json,${encodeURIComponent('{"x":1}')}`
  const wrongHash = '0x1111111111111111111111111111111111111111111111111111111111111111' as const
  const noFetch = (async () => new Response('')) as unknown as typeof fetch
  const r = await fetchMetadata(uri, wrongHash, noFetch)
  assert.equal(r.status, 'mismatch')
  assert.deepEqual(r.content, { x: 1 })
})

// Test 10: ipfs:// rewritten to gateway URL
test('ipfs:// URI is rewritten through IPFS gateway', async () => {
  let calledUrl = ''
  const mock = (async (url: string) => {
    calledUrl = url
    return new Response(new TextEncoder().encode('{}'))
  }) as unknown as typeof fetch
  await fetchMetadata('ipfs://bafyTESTCID/m.json', ZERO, mock)
  assert.ok(
    calledUrl.includes('bafyTESTCID/m.json'),
    `Expected URL to contain CID path, got: ${calledUrl}`
  )
  assert.ok(
    calledUrl.startsWith('https://'),
    `Expected gateway URL to start with https://, got: ${calledUrl}`
  )
})

// Test 11: fetch that hangs → unreachable within 5s timeout
test('hanging fetch returns unreachable due to timeout', async () => {
  // Use a mock that never resolves (simulates hang)
  const hangingFetch = (async (_url: string, opts?: RequestInit) => {
    await new Promise<never>((_, reject) => {
      const signal = (opts as any)?.signal as AbortSignal | undefined
      if (signal) {
        if (signal.aborted) {
          reject(new DOMException('AbortError', 'AbortError'))
          return
        }
        signal.addEventListener('abort', () =>
          reject(new DOMException('AbortError', 'AbortError'))
        )
      }
      // Otherwise, hang forever (but AbortController will fire)
    })
    return new Response('')
  }) as unknown as typeof fetch

  const start = Date.now()
  const r = await fetchMetadata('https://slow.example/m', ZERO, hangingFetch)
  const elapsed = Date.now() - start

  assert.equal(r.status, 'unreachable')
  // Should resolve within 6 seconds (timeout = 5s + small buffer)
  assert.ok(elapsed < 6000, `Expected to resolve within 6s, took ${elapsed}ms`)
})

// Test 12: oversize body (300 KiB > 256 KiB cap) → unreachable
test('oversize body returns unreachable', async () => {
  const big = new Uint8Array(300 * 1024) // 300 KiB > 256 KiB cap
  const r = await fetchMetadata('https://big.example/m', ZERO, mockFetchOk(big))
  assert.equal(r.status, 'unreachable')
})

// Test 13: non-200 response → unreachable
test('non-200 response returns unreachable', async () => {
  const r = await fetchMetadata('https://err.example/m', ZERO, mockFetchOk('error', 500))
  assert.equal(r.status, 'unreachable')
})
