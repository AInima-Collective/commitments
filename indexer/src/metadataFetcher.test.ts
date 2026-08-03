/**
 * Tests for the metadata fetcher module.
 * Uses node:test (Node 20+ built-in) and injected fetchImpl for zero network I/O.
 *
 * Run: node --experimental-strip-types --test src/metadataFetcher.test.ts
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  createPinnedLookup,
  fetchMetadata,
  isPublicAddress,
  type MetadataFetchDependencies,
  type MetadataHostResolver,
  type MetadataTransport,
  type ResolvedAddress,
} from './metadataFetcher.ts'
import { keccak256 } from 'viem'

const ZERO = ('0x' + '0'.repeat(64)) as `0x${string}`
const PUBLIC_V4: ResolvedAddress = { address: '93.184.216.34', family: 4 }

const passthroughTransport: MetadataTransport = async ({ url, init, fetchImpl }) => ({
  response: await fetchImpl(url.href, init),
  release: async () => undefined,
})

const TEST_DEPS: MetadataFetchDependencies = {
  resolveHostname: async () => [PUBLIC_V4],
  transport: passthroughTransport,
}

function depsWithResolver(resolveHostname: MetadataHostResolver): MetadataFetchDependencies {
  return { resolveHostname, transport: passthroughTransport }
}

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
  const r = await fetchMetadata('https://ok.example/m.json', ZERO, mockFetchOk(body), TEST_DEPS)
  assert.equal(r.status, 'ok')
  assert.deepEqual(r.content, { schemaVersion: 'commitment.v1', title: 'hi' })
  assert.equal(r.contentRaw, null)
})

// Test 4: https:// with matching non-zero hash → ok
test('https ok with matching non-zero hash returns ok', async () => {
  const body = '{"a":1}'
  const bodyBytes = new TextEncoder().encode(body)
  const hash = keccak256(bodyBytes)
  const r = await fetchMetadata('https://ok.example/m.json', hash, mockFetchOk(body), TEST_DEPS)
  assert.equal(r.status, 'ok')
  assert.deepEqual(r.content, { a: 1 })
})

// Test 5: https:// with wrong hash → mismatch, content still populated
test('https ok with wrong hash returns mismatch with content populated', async () => {
  const body = '{"a":1}'
  const wrongHash = ('0x' + '1'.repeat(64)) as `0x${string}`
  const r = await fetchMetadata('https://ok.example/m.json', wrongHash, mockFetchOk(body), TEST_DEPS)
  assert.equal(r.status, 'mismatch')
  assert.deepEqual(r.content, { a: 1 })
  assert.equal(r.contentRaw, null)
})

// Test 6: non-JSON body with zero hash → ok, contentRaw populated, content null
test('invalid json falls back to contentRaw', async () => {
  const body = 'not { json'
  const r = await fetchMetadata('https://ok.example/m', ZERO, mockFetchOk(body), TEST_DEPS)
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
  await fetchMetadata('ipfs://bafyTESTCID/m.json', ZERO, mock, TEST_DEPS)
  assert.ok(
    calledUrl.includes('bafyTESTCID/m.json'),
    `Expected URL to contain CID path, got: ${calledUrl}`
  )
  assert.ok(
    calledUrl.startsWith('https://'),
    `Expected gateway URL to start with https://, got: ${calledUrl}`
  )
})

test('rejects every non-public IPv4 and IPv6 resolver result before fetch', async (t) => {
  const blocked: ResolvedAddress[] = [
    { address: '0.0.0.0', family: 4 },
    { address: '10.0.0.1', family: 4 },
    { address: '100.64.0.1', family: 4 },
    { address: '127.0.0.1', family: 4 },
    { address: '169.254.169.254', family: 4 },
    { address: '172.16.0.1', family: 4 },
    { address: '192.168.1.1', family: 4 },
    { address: '224.0.0.1', family: 4 },
    { address: '255.255.255.255', family: 4 },
    { address: '::', family: 6 },
    { address: '::1', family: 6 },
    { address: '::ffff:127.0.0.1', family: 6 },
    { address: 'fc00::1', family: 6 },
    { address: 'fe80::1', family: 6 },
    { address: 'ff02::1', family: 6 },
    { address: '2001:db8::1', family: 6 },
  ]

  for (const address of blocked) {
    await t.test(address.address, async () => {
      let called = false
      const fetchImpl = (async () => {
        called = true
        return new Response('{}')
      }) as unknown as typeof fetch
      const result = await fetchMetadata(
        'https://metadata.example/doc.json',
        ZERO,
        fetchImpl,
        depsWithResolver(async () => [address]),
      )
      assert.equal(result.status, 'unreachable')
      assert.equal(called, false)
      assert.equal(isPublicAddress(address.address), false)
    })
  }
})

test('rejects hostnames with mixed public and private DNS answers', async () => {
  let called = false
  const fetchImpl = (async () => {
    called = true
    return new Response('{}')
  }) as unknown as typeof fetch
  const result = await fetchMetadata(
    'https://rebinding.example/meta.json',
    ZERO,
    fetchImpl,
    depsWithResolver(async () => [PUBLIC_V4, { address: '127.0.0.1', family: 4 }]),
  )
  assert.equal(result.status, 'unreachable')
  assert.equal(called, false)
})

test('URL parsing canonicalizes and blocks alternate loopback encodings', async (t) => {
  const cases = [
    ['https://2130706433/meta', '127.0.0.1'],
    ['https://0177.0.0.1/meta', '127.0.0.1'],
    ['https://0x7f000001/meta', '127.0.0.1'],
    ['https://[::1]/meta', '::1'],
    ['https://[::ffff:127.0.0.1]/meta', '::ffff:7f00:1'],
  ] as const
  for (const [uri, canonicalHost] of cases) {
    await t.test(uri, async () => {
      let resolvedHost = ''
      const result = await fetchMetadata(
        uri,
        ZERO,
        mockFetchOk('{}'),
        depsWithResolver(async (hostname) => {
          resolvedHost = hostname
          return [{ address: canonicalHost, family: canonicalHost.includes(':') ? 6 : 4 }]
        }),
      )
      assert.equal(result.status, 'unreachable')
      assert.equal(resolvedHost, canonicalHost)
    })
  }
})

test('allows public IPv4 and IPv6 answers and pins the selected address', async (t) => {
  const publicAddresses: ResolvedAddress[] = [
    PUBLIC_V4,
    { address: '2606:2800:220:1:248:1893:25c8:1946', family: 6 },
    { address: '::ffff:93.184.216.34', family: 6 },
  ]
  for (const address of publicAddresses) {
    await t.test(address.address, async () => {
      let pinned: ResolvedAddress | null = null
      const transport: MetadataTransport = async (request) => {
        pinned = request.address
        return {
          response: await request.fetchImpl(request.url.href, request.init),
          release: async () => undefined,
        }
      }
      const result = await fetchMetadata(
        'https://metadata.example/doc.json',
        ZERO,
        mockFetchOk('{}'),
        { resolveHostname: async () => [address], transport },
      )
      assert.equal(result.status, 'ok')
      assert.equal(pinned?.family, address.family)
      assert.equal(isPublicAddress(pinned?.address ?? ''), true)
      assert.equal(isPublicAddress(address.address), true)
    })
  }
})

test('rejects URL credentials before DNS and permits an explicit public port', async () => {
  let resolutions = 0
  let fetchedUrl = ''
  const resolver: MetadataHostResolver = async () => {
    resolutions += 1
    return [PUBLIC_V4]
  }
  const fetchImpl = (async (input: RequestInfo | URL) => {
    fetchedUrl = String(input)
    return new Response('{}')
  }) as typeof fetch

  for (const uri of [
    'https://user@metadata.example/doc',
    'https://user:password@metadata.example/doc',
  ]) {
    const rejected = await fetchMetadata(uri, ZERO, fetchImpl, depsWithResolver(resolver))
    assert.equal(rejected.status, 'unreachable')
  }
  assert.equal(resolutions, 0)

  const allowed = await fetchMetadata(
    'https://metadata.example:8443/doc',
    ZERO,
    fetchImpl,
    depsWithResolver(resolver),
  )
  assert.equal(allowed.status, 'ok')
  assert.equal(resolutions, 1)
  assert.equal(fetchedUrl, 'https://metadata.example:8443/doc')
})

test('redirects are manual, never followed, and their bodies are never exposed', async (t) => {
  for (const location of ['http://127.0.0.1/secret', 'https://127.0.0.1/secret']) {
    await t.test(location, async () => {
      let calls = 0
      let redirectMode: RequestRedirect | undefined
      const body = new ReadableStream({
        start(controller) {
          controller.enqueue(new TextEncoder().encode('internal secret'))
        },
      })
      const fetchImpl = (async (_input: RequestInfo | URL, init?: RequestInit) => {
        calls += 1
        redirectMode = init?.redirect
        return new Response(body, { status: 302, headers: { Location: location } })
      }) as typeof fetch
      const result = await fetchMetadata(
        'https://public.example/redirect',
        ZERO,
        fetchImpl,
        TEST_DEPS,
      )
      assert.equal(result.status, 'unreachable')
      assert.equal(result.content, null)
      assert.equal(result.contentRaw, null)
      assert.equal(calls, 1)
      assert.equal(redirectMode, 'manual')
    })
  }
})

test('IPFS stays beneath a parsed trusted HTTPS gateway origin and path', async () => {
  let calledUrl = ''
  let resolvedHost = ''
  const fetchImpl = (async (input: RequestInfo | URL) => {
    calledUrl = String(input)
    return new Response('{}')
  }) as typeof fetch
  const result = await fetchMetadata(
    'ipfs://bafyCID/folder/file name.json',
    ZERO,
    fetchImpl,
    {
      ipfsGateway: 'https://gateway.example:8443/trusted/ipfs/',
      resolveHostname: async (hostname) => {
        resolvedHost = hostname
        // A private operator gateway is safe because the on-chain URI cannot
        // influence its configured origin; the actual connection is still pinned.
        return [{ address: '10.0.0.5', family: 4 }]
      },
      transport: passthroughTransport,
    },
  )
  assert.equal(result.status, 'ok')
  assert.equal(resolvedHost, 'gateway.example')
  assert.equal(
    calledUrl,
    'https://gateway.example:8443/trusted/ipfs/bafyCID/folder/file%20name.json',
  )
})

test('rejects insecure or malformed IPFS gateway and path inputs before fetch', async () => {
  let called = false
  const fetchImpl = (async () => {
    called = true
    return new Response('{}')
  }) as unknown as typeof fetch
  const cases: Array<[string, string]> = [
    ['ipfs://bafyCID/file', 'http://127.0.0.1:8080/ipfs/'],
    ['ipfs://bafyCID/file', 'https://user:pass@gateway.example/ipfs/'],
    ['ipfs://bafyCID/%2e%2e/secret', 'https://gateway.example/ipfs/'],
    ['ipfs://evil.example\\@gateway.example/file', 'https://gateway.example/ipfs/'],
    ['ipfs://bafyCID/file?redirect=https://evil.example', 'https://gateway.example/ipfs/'],
  ]
  for (const [uri, ipfsGateway] of cases) {
    const result = await fetchMetadata(uri, ZERO, fetchImpl, { ...TEST_DEPS, ipfsGateway })
    assert.equal(result.status, 'unreachable', `${uri} via ${ipfsGateway}`)
  }
  assert.equal(called, false)
})

test('production transport installs an Undici dispatcher with the pinned lookup', async () => {
  let dispatcherSeen = false
  const fetchImpl = (async (_input: RequestInfo | URL, init?: RequestInit) => {
    dispatcherSeen = Boolean((init as RequestInit & { dispatcher?: unknown })?.dispatcher)
    return new Response('{}')
  }) as typeof fetch
  const result = await fetchMetadata('https://public.example/doc', ZERO, fetchImpl, {
    resolveHostname: async () => [PUBLIC_V4],
  })
  assert.equal(result.status, 'ok')
  assert.equal(dispatcherSeen, true)
})

test('pinned lookup ignores later DNS changes for single and all-address lookups', async () => {
  const pinned: ResolvedAddress = { address: '93.184.216.34', family: 4 }
  const pinnedLookup = createPinnedLookup(pinned)
  const single = await new Promise<{ address: string; family?: number }>((resolve, reject) => {
    pinnedLookup('rebinding.example', { all: false }, (error, address, family) => {
      if (error) reject(error)
      else resolve({ address: address as string, family })
    })
  })
  assert.deepEqual(single, pinned)

  const all = await new Promise<unknown>((resolve, reject) => {
    pinnedLookup('rebinding.example', { all: true }, (error, addresses) => {
      if (error) reject(error)
      else resolve(addresses)
    })
  })
  assert.deepEqual(all, [pinned])
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
  const r = await fetchMetadata('https://slow.example/m', ZERO, hangingFetch, TEST_DEPS)
  const elapsed = Date.now() - start

  assert.equal(r.status, 'unreachable')
  // Should resolve within 6 seconds (timeout = 5s + small buffer)
  assert.ok(elapsed < 6000, `Expected to resolve within 6s, took ${elapsed}ms`)
})

// Test 12: oversize body (300 KiB > 256 KiB cap) → unreachable
test('oversize body returns unreachable', async () => {
  const big = new Uint8Array(300 * 1024) // 300 KiB > 256 KiB cap
  const r = await fetchMetadata('https://big.example/m', ZERO, mockFetchOk(big), TEST_DEPS)
  assert.equal(r.status, 'unreachable')
})

// Test 13: non-200 response → unreachable
test('non-200 response returns unreachable', async () => {
  const r = await fetchMetadata(
    'https://err.example/m',
    ZERO,
    mockFetchOk('error', 500),
    TEST_DEPS,
  )
  assert.equal(r.status, 'unreachable')
})
