/**
 * Integration tests for the metadata fetcher — end-to-end scenarios
 * exercising the full fetch-verify-store path for canonical payloads.
 *
 * Unlike metadataFetcher.test.ts (which isolates individual branches),
 * these tests use realistic JSON payloads matching each canonical schemaVersion
 * from metadata-conventions.md (Phase 15 Plan 01) and validate the complete
 * round-trip that a Phase 16 frontend consumer will depend on.
 *
 * Run: node --experimental-strip-types --test src/integration.test.ts
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { fetchMetadata, type MetadataFetchDependencies } from './metadataFetcher.ts'
import { keccak256 } from 'viem'

const ZERO = ('0x' + '0'.repeat(64)) as `0x${string}`
const TEST_DEPS: MetadataFetchDependencies = {
  resolveHostname: async () => [{ address: '93.184.216.34', family: 4 }],
}

function mockFetch(body: string, status = 200): typeof fetch {
  return (async () => new Response(new TextEncoder().encode(body), { status })) as unknown as typeof fetch
}

test('canonical commitment.v1 payload round-trips ok with matching hash', async () => {
  const payload = JSON.stringify({
    schemaVersion: 'commitment.v1',
    title: 'Weekly data delivery',
    description: 'Provider supplies 7 days of market data.',
    tags: ['data', 'sla'],
  })
  const hash = keccak256(new TextEncoder().encode(payload))
  const r = await fetchMetadata('https://host.example/c.json', hash, mockFetch(payload), TEST_DEPS)
  assert.equal(r.status, 'ok')
  assert.equal((r.content as any).schemaVersion, 'commitment.v1')
  assert.equal((r.content as any).title, 'Weekly data delivery')
  assert.equal(r.contentRaw, null)
  assert.equal(r.hash, hash)
})

test('canonical agreement.v1 payload round-trips ok', async () => {
  const payload = JSON.stringify({
    schemaVersion: 'agreement.v1',
    title: 'Delivery vs payment',
    description: 'Both parties commit stake until delivery is confirmed.',
    agreementURI: 'ipfs://bafy.../agreement.pdf',
    proposerContact: 'alice.eth',
  })
  const hash = keccak256(new TextEncoder().encode(payload))
  const r = await fetchMetadata('https://host.example/e.json', hash, mockFetch(payload), TEST_DEPS)
  assert.equal(r.status, 'ok')
  assert.equal((r.content as any).schemaVersion, 'agreement.v1')
  assert.equal((r.content as any).proposerContact, 'alice.eth')
})

test('canonical operator.v1 payload round-trips ok', async () => {
  const payload = JSON.stringify({
    schemaVersion: 'operator.v1',
    name: 'Node Alpha',
    description: 'Operator, US-East-1',
    logoURI: 'https://alpha.example/logo.png',
    p2pEndpoint: '/ip4/1.2.3.4/tcp/4001/p2p/Qm...',
    services: ['avs-1', 'avs-2'],
    social: { github: 'node-alpha', email: 'ops@alpha.example' },
  })
  const hash = keccak256(new TextEncoder().encode(payload))
  const r = await fetchMetadata('https://host.example/o.json', hash, mockFetch(payload), TEST_DEPS)
  assert.equal(r.status, 'ok')
  assert.equal((r.content as any).name, 'Node Alpha')
  assert.deepEqual((r.content as any).services, ['avs-1', 'avs-2'])
})

test('whitespace drift causes mismatch (producer responsibility)', async () => {
  // Producer's original bytes (with trailing newline and indent)
  const producedBytes = '{\n  "schemaVersion": "commitment.v1",\n  "title": "x"\n}\n'
  const producerHash = keccak256(new TextEncoder().encode(producedBytes))
  // Some middleware re-serializes without whitespace and posts these bytes instead:
  const corruptedBytes = '{"schemaVersion":"commitment.v1","title":"x"}'
  const r = await fetchMetadata(
    'https://host.example/c.json',
    producerHash,
    mockFetch(corruptedBytes),
    TEST_DEPS,
  )
  assert.equal(r.status, 'mismatch',
    'bytes-sensitivity: any whitespace change breaks verification')
})

test('unknown schemaVersion is ingested ok (forward-compat)', async () => {
  const payload = JSON.stringify({
    schemaVersion: 'commitment.v99',
    title: 'Future fields',
    somethingNew: { nested: true },
  })
  const hash = keccak256(new TextEncoder().encode(payload))
  const r = await fetchMetadata(
    'https://host.example/future.json',
    hash,
    mockFetch(payload),
    TEST_DEPS,
  )
  assert.equal(r.status, 'ok')
  assert.equal((r.content as any).schemaVersion, 'commitment.v99')
  assert.deepEqual((r.content as any).somethingNew, { nested: true })
})

test('ipfs:// URI resolved through IPFS_GATEWAY env', async () => {
  // The single place in this suite that mutates IPFS_GATEWAY. Both gateway
  // shapes are asserted here rather than in two tests, because the variable is
  // process-global: a second mutating test can interleave with this one
  // wherever the files share a process (Ponder's dev build evaluates
  // `src/**/*.ts`, test files included).
  const prev = process.env.IPFS_GATEWAY
  try {
    let observedUrl = ''
    const mock = (async (url: string) => {
      observedUrl = url
      return new Response(new TextEncoder().encode('{}'))
    }) as unknown as typeof fetch

    process.env.IPFS_GATEWAY = 'https://test-gateway.example/ipfs/'
    await fetchMetadata('ipfs://bafyTEST/m.json', ZERO, mock, TEST_DEPS)
    assert.equal(observedUrl, 'https://test-gateway.example/ipfs/bafyTEST/m.json')

    // A plain-http gateway is not trusted for server-side metadata resolution.
    // Local operators can put Kubo behind HTTPS or leave IPFS_GATEWAY unset and
    // use the default public gateway.
    process.env.IPFS_GATEWAY = 'http://127.0.0.1:8080/ipfs/'
    const payload = '{"schemaVersion":"commitment.v1","title":"Locally pinned"}'
    const localMock = (async (url: string) => {
      observedUrl = url
      return new Response(new TextEncoder().encode(payload))
    }) as unknown as typeof fetch
    const hash = keccak256(new TextEncoder().encode(payload))
    observedUrl = ''
    const r = await fetchMetadata('ipfs://bafyLOCAL', hash, localMock, TEST_DEPS)
    assert.equal(observedUrl, '')
    assert.equal(r.status, 'unreachable')
  } finally {
    if (prev === undefined) delete process.env.IPFS_GATEWAY
    else process.env.IPFS_GATEWAY = prev
  }
})

test('a bare http:// URI is still rejected outright', async () => {
  // Same transport, different provenance: the gateway is our configuration,
  // an http:// URI is the producer's choice, and only one of those is trusted.
  const r = await fetchMetadata('http://host.example/m.json', ZERO, mockFetch('{}'))
  assert.equal(r.status, 'unreachable')
  assert.equal(r.content, null)
})

test('oversize payload (>256 KiB) returns unreachable before DB write', async () => {
  // Build >256KiB of valid JSON
  const big = '{"schemaVersion":"commitment.v1","title":"x","padding":"' + 'x'.repeat(260 * 1024) + '"}'
  const r = await fetchMetadata('https://big.example/m', ZERO, mockFetch(big), TEST_DEPS)
  assert.equal(r.status, 'unreachable')
  assert.equal(r.content, null)
})
