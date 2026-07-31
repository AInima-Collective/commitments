/**
 * Round-trip tests for the metadata pin endpoint.
 *
 * The critical property: pinning bytes returns a metadataHash and metadataURI
 * such that feeding both into the read-side fetcher yields metadataStatus 'ok'.
 * Tests run against the dev data: fallback (no PINATA_JWT) so they need no
 * network and no credentials.
 *
 * Run: node --experimental-strip-types --test src/api/metadata.test.ts
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import app, { __setPinFetchForTests } from './metadata.ts'
import { fetchMetadata } from '../metadataFetcher.ts'
import { keccak256, toBytes, type Hex } from 'viem'

// Ensure we exercise the data: fallback rather than a real pinning backend.
// IPFS_API_URL matters as much as PINATA_JWT here: a developer with a local
// node exported would otherwise have these tests silently talk to it.
delete process.env.PINATA_JWT
delete process.env.IPFS_API_URL

function postPin(body: string): Promise<Response> {
  return app.request('/pin', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body,
  })
}

test('pin → hash → fetch round-trip yields status ok (data: fallback)', async () => {
  const json = '{"schemaVersion":"commitment.v1","title":"Delivery SLA"}'
  const res = await postPin(json)
  assert.equal(res.status, 200)
  const out = (await res.json()) as {
    cid: string | null
    metadataURI: string
    metadataHash: Hex
    service: string
  }

  // data: fallback shape
  assert.equal(out.service, 'data-uri')
  assert.equal(out.cid, null)
  assert.ok(out.metadataURI.startsWith('data:application/json;base64,'))

  // Hash is keccak256 of the EXACT posted bytes (no canonicalization).
  assert.equal(out.metadataHash, keccak256(toBytes(json)))

  // The fetcher re-verifies the same URI + hash → ok.
  const fetched = await fetchMetadata(out.metadataURI, out.metadataHash)
  assert.equal(fetched.status, 'ok')
  assert.deepEqual(fetched.content, JSON.parse(json))
})

test('whitespace is preserved in the hash (no re-serialization)', async () => {
  // Pretty-printed JSON with non-canonical spacing.
  const json = '{\n  "schemaVersion": "commitment.v1",\n  "title": "Spaced"\n}'
  const res = await postPin(json)
  const out = (await res.json()) as { metadataHash: Hex; metadataURI: string }

  // The hash must reflect the exact bytes, including newlines/indentation.
  assert.equal(out.metadataHash, keccak256(toBytes(json)))
  // And it must differ from the compact form's hash.
  const compact = JSON.stringify(JSON.parse(json))
  assert.notEqual(out.metadataHash, keccak256(toBytes(compact)))

  const fetched = await fetchMetadata(out.metadataURI, out.metadataHash)
  assert.equal(fetched.status, 'ok')
})

test('rejects non-JSON body with 400', async () => {
  const res = await postPin('not json at all')
  assert.equal(res.status, 400)
  const out = (await res.json()) as { error: string }
  assert.equal(out.error, 'invalid_json')
})

test('rejects JSON arrays/scalars (must be an object) with 400', async () => {
  const arr = await postPin('[1,2,3]')
  assert.equal(arr.status, 400)
  assert.equal(((await arr.json()) as { error: string }).error, 'not_object')

  const scalar = await postPin('42')
  assert.equal(scalar.status, 400)
  assert.equal(((await scalar.json()) as { error: string }).error, 'not_object')
})

test('rejects empty body with 400', async () => {
  const res = await postPin('')
  assert.equal(res.status, 400)
  assert.equal(((await res.json()) as { error: string }).error, 'empty')
})

test('rejects oversize body (>256 KiB) with 400', async () => {
  // Build a valid-JSON object whose serialized form exceeds 256 KiB.
  const big = '{"schemaVersion":"commitment.v1","blob":"' + 'a'.repeat(256 * 1024) + '"}'
  const res = await postPin(big)
  assert.equal(res.status, 400)
  assert.equal(((await res.json()) as { error: string }).error, 'too_large')
})

// ── Local Kubo backend ───────────────────────────────────────────────────────
//
// Exercised against a stubbed fetch rather than a live daemon: the contract
// under test is "the endpoint speaks Kubo's add API and returns its CID", not
// "IPFS works". A real node is covered by `docker compose up -d ipfs` plus the
// round-trip above.

/**
 * Run `fn` with IPFS_API_URL set and the pin backend's fetch stubbed.
 *
 * Injects through `__setPinFetchForTests` rather than reassigning
 * `globalThis.fetch`. Ponder's dev build evaluates every file under `src/`,
 * this one included, so swapping the global would swap it inside the running
 * indexer process — underneath Ponder's own RPC client.
 */
async function withKubo(
  fetchImpl: typeof fetch,
  fn: () => Promise<void>,
): Promise<void> {
  const prevUrl = process.env.IPFS_API_URL
  process.env.IPFS_API_URL = 'http://127.0.0.1:5001'
  __setPinFetchForTests(fetchImpl)
  try {
    await fn()
  } finally {
    __setPinFetchForTests()
    if (prevUrl === undefined) delete process.env.IPFS_API_URL
    else process.env.IPFS_API_URL = prevUrl
  }
}

test('IPFS_API_URL routes to the Kubo add API and returns an ipfs:// URI', async () => {
  const json = '{"schemaVersion":"commitment.v1","title":"Pinned locally"}'
  const cid = 'bafkreihdwdcefgh4dqkjv67uzcmw7ojee6xedzdetojuzjevtenxquvyku'
  let calledUrl = ''

  await withKubo(
    (async (input: RequestInfo | URL) => {
      calledUrl = String(input)
      return new Response(JSON.stringify({ Name: 'metadata.json', Hash: cid, Size: '64' }) + '\n', {
        status: 200,
      })
    }) as typeof fetch,
    async () => {
      const res = await postPin(json)
      assert.equal(res.status, 200)
      const out = (await res.json()) as {
        cid: string | null
        metadataURI: string
        metadataHash: Hex
        service: string
      }
      assert.equal(out.service, 'kubo')
      assert.equal(out.cid, cid)
      assert.equal(out.metadataURI, `ipfs://${cid}`)
      // The hash is still keccak of the exact posted bytes, unchanged by backend.
      assert.equal(out.metadataHash, keccak256(toBytes(json)))
      // CIDv1 + pin are what make `ipfs://<cid>` resolve to these exact bytes
      // and keep the block from being collected out from under the chain.
      assert.match(calledUrl, /\/api\/v0\/add\?cid-version=1&pin=true$/)
      // A short URI is the entire point: it fits the 512-byte cap at any size.
      assert.ok(out.metadataURI.length < 100)
    },
  )
})

test('takes the last NDJSON line as the root entry', async () => {
  const rootCid = 'bafkreiroot4dqkjv67uzcmw7ojee6xedzdetojuzjevtenxquvykuaaaa'
  await withKubo(
    (async () =>
      new Response(
        JSON.stringify({ Name: 'inner', Hash: 'bafkreichild', Size: '9' }) +
          '\n' +
          JSON.stringify({ Name: 'metadata.json', Hash: rootCid, Size: '64' }) +
          '\n',
        { status: 200 },
      )) as typeof fetch,
    async () => {
      const res = await postPin('{"schemaVersion":"commitment.v1","title":"x"}')
      const out = (await res.json()) as { cid: string | null }
      assert.equal(out.cid, rootCid)
    },
  )
})

test('an unreachable configured node 502s rather than silently inlining', async () => {
  await withKubo(
    (async () => {
      throw new Error('connect ECONNREFUSED 127.0.0.1:5001')
    }) as typeof fetch,
    async () => {
      const res = await postPin('{"schemaVersion":"commitment.v1","title":"x"}')
      // Falling back to a data: URI here would quietly reimpose the 512-byte
      // cap the node exists to escape, and the author would discover it as a
      // reverted transaction instead of an error on this response.
      assert.equal(res.status, 502)
      const out = (await res.json()) as { error: string; message: string }
      assert.equal(out.error, 'pin_failed')
      assert.match(out.message, /127\.0\.0\.1:5001/)
    },
  )
})

test('a non-200 from the node 502s with the status in the message', async () => {
  await withKubo(
    (async () => new Response('bad request', { status: 400 })) as typeof fetch,
    async () => {
      const res = await postPin('{"schemaVersion":"commitment.v1","title":"x"}')
      assert.equal(res.status, 502)
      assert.match(((await res.json()) as { message: string }).message, /Kubo HTTP 400/)
    },
  )
})
