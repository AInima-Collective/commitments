#!/usr/bin/env node
/**
 * Pin the seed's metadata BEFORE the seed runs, and write the manifest
 * `Simulate.s.sol` reads back.
 *
 * ── Why this step exists ────────────────────────────────────────────────────
 *
 * `metadataURI` is immutable once written, and `Simulate.s.sol` is Solidity: it
 * cannot POST to IPFS. So the ordering is forced — pin first, seed second, with
 * a file in between.
 *
 * ── Why it talks to Kubo directly ───────────────────────────────────────────
 *
 * The indexer exposes `POST /metadata/pin` for the *browser*, which cannot
 * reach a local daemon and must not hold pinning credentials. This script is a
 * Node process on the same machine as the daemon, and making `just dev-up`
 * depend on the indexer already running would be a worse coupling than the ~20
 * lines of duplication. The two callers are genuinely different; the byte
 * contract they uphold is identical, and it is the contract that matters:
 * pin the exact bytes, hash those same bytes, never re-serialize.
 *
 * ── Why the manifest carries the JSON and not the hash ──────────────────────
 *
 * The consumer is Solidity, which has `keccak256` natively. Shipping the exact
 * bytes and letting the script hash them means the hash is provably over what
 * the manifest carries, and this file needs no keccak implementation at all.
 * Verified byte-identical against viem.
 *
 * ── Behaviour ───────────────────────────────────────────────────────────────
 *
 *   a Kubo daemon answering         ->  pin the `full` payloads, emit ipfs:// URIs
 *   otherwise                       ->  emit the `short` payloads as data: URIs
 *
 * The daemon is auto-detected at the conventional `http://127.0.0.1:5001` so
 * that `just ipfs-up && just dev-up` needs no exported variables: having gone to
 * the trouble of running a node, you should not also have to remember a flag to
 * make the seed use it. `IPFS_API_URL` overrides the address; set it to `none`
 * to force the inline path even with a daemon up (which is how the fallback
 * gets tested).
 *
 * The fallback is not a degraded mode to be fixed later. `just dev-up` must
 * work end to end with no daemon; that is the whole reason each catalogue entry
 * carries a short variant.
 *
 * Usage:
 *   node script/pin-metadata.mjs
 *   IPFS_API_URL=http://127.0.0.1:5001 node script/pin-metadata.mjs
 */

import { writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { CATALOGUE, CATALOGUE_KEYS, TERMS_PLACEHOLDER, UNREACHABLE_URI } from './metadata/catalogue.mjs'

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..')
const MANIFEST_PATH = join(repoRoot, 'script', 'metadata-manifest.json')

/** Where a local Kubo node listens by default — matches docker-compose.yml. */
const DEFAULT_KUBO_API = 'http://127.0.0.1:5001'

/** Contract cap on `metadataURI` (CommitmentManager). */
const URI_MAX_BYTES = 512
const DATA_PREFIX = 'data:application/json;base64,'
/** Largest JSON that still fits once inlined: floor((512-29)/4)*3. */
const MAX_INLINE_JSON_BYTES = Math.floor((URI_MAX_BYTES - DATA_PREFIX.length) / 4) * 3
const PIN_TIMEOUT_MS = 15_000

/** Fields that may carry a link to a separately-pinned document, by schema. */
const LINK_FIELDS = ['termsURI', 'agreementURI']

const byteLength = (s) => Buffer.byteLength(s, 'utf8')

/**
 * A timeout signal whose timer is always cleared.
 *
 * `AbortSignal.timeout(ms)` leaves its timer armed after the request settles.
 * When it later fires with nothing listening, Node surfaces the `TimeoutError`
 * from the timer callback rather than as a promise rejection — which a
 * `try/catch` around the `await` cannot catch, so it takes the process down.
 * Observed on Node 24 killing an entire `just anvil-seed`.
 *
 * Always call `done()` in a `finally`.
 */
function timeoutSignal(ms) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(new Error(`timed out after ${ms}ms`)), ms)
  return { signal: controller.signal, done: () => clearTimeout(timer) }
}

/**
 * Serialize a payload to the exact bytes that get pinned AND hashed.
 *
 * `JSON.stringify` with no spacing, once, and the result is used for both. Any
 * second serialization anywhere in this pipeline would change the bytes and
 * therefore the hash, which is the single failure mode this whole convention
 * exists to prevent.
 */
function serialize(payload) {
  return JSON.stringify(payload)
}

/** Inline a payload as a self-contained `data:` URI. */
function toDataUri(json) {
  return DATA_PREFIX + Buffer.from(json, 'utf8').toString('base64')
}

/**
 * Add bytes to a Kubo node and return its CID.
 *
 * `cid-version=1` matches what the indexer's Pinata and Kubo paths both
 * produce, and `pin=true` keeps the block from being garbage collected out
 * from under an immutable on-chain reference.
 */
async function addToKubo(apiUrl, json) {
  const form = new FormData()
  form.append('file', new Blob([json], { type: 'application/json' }), 'metadata.json')
  const { signal, done } = timeoutSignal(PIN_TIMEOUT_MS)
  let res
  try {
    res = await fetch(`${apiUrl.replace(/\/+$/, '')}/api/v0/add?cid-version=1&pin=true`, {
      method: 'POST',
      body: form,
      signal,
    })
  } finally {
    done()
  }
  if (!res.ok) {
    throw new Error(`Kubo HTTP ${res.status}: ${(await res.text().catch(() => '')).slice(0, 200)}`)
  }
  // Newline-delimited JSON, one object per added entry; the root is last.
  const lines = (await res.text()).split('\n').filter((l) => l.trim().length > 0)
  const last = lines[lines.length - 1]
  if (!last) throw new Error('Kubo add returned an empty response')
  const { Hash: cid } = JSON.parse(last)
  if (!cid) throw new Error('Kubo add response missing Hash')
  return cid
}

/** True when a daemon is actually answering, not merely configured. */
async function kuboReachable(apiUrl) {
  const { signal, done } = timeoutSignal(3_000)
  try {
    const res = await fetch(`${apiUrl.replace(/\/+$/, '')}/api/v0/id`, {
      method: 'POST',
      signal,
    })
    return res.ok
  } catch {
    return false
  } finally {
    done()
  }
}

/**
 * Encode every catalogue entry, either by pinning or by inlining.
 *
 * Throws if a pin fails; the caller degrades to the inline path rather than
 * letting an IPFS problem take down the seed.
 */
async function buildPayloads(usePinning, apiUrl) {
  const payloads = {}
  let oversize = 0
  let termsPinned = 0

  for (const key of CATALOGUE_KEYS) {
    const entry = CATALOGUE[key]
    const variant = usePinning ? 'full' : 'short'
    let payload = entry[variant]

    // Two-pass pin: the document goes first so its CID can be linked from the
    // payload that references it. A link that 404s invites a click and wastes
    // it, which is worse than not offering the link.
    //
    // Which FIELD holds the link depends on the schema — `commitment.v1` calls
    // it `termsURI`, `agreement.v1` calls it `agreementURI` — so substitute
    // wherever the placeholder appears rather than hard-coding one name.
    const linkField = LINK_FIELDS.find((f) => payload[f] === TERMS_PLACEHOLDER)
    if (linkField) {
      if (usePinning && entry.terms) {
        const cid = await addToKubo(apiUrl, entry.terms)
        payload = { ...payload, [linkField]: `ipfs://${cid}` }
        termsPinned++
      } else {
        // No backend, or no document authored. Either way there is nothing to
        // link, so drop the field rather than ship a placeholder as a URI.
        const { [linkField]: _dropped, ...rest } = payload
        payload = rest
      }
    }

    const json = serialize(payload)

    let uri
    if (usePinning) {
      uri = `ipfs://${await addToKubo(apiUrl, json)}`
    } else {
      if (byteLength(json) > MAX_INLINE_JSON_BYTES) {
        // A `short` variant that does not fit defeats its own purpose. Fail
        // here rather than let the seed revert inside createCommitment.
        console.error(
          `[pin-metadata] ${key}.short is ${byteLength(json)} B, over the ${MAX_INLINE_JSON_BYTES} B inline budget. ` +
            'Shorten it, or run a pinning backend.',
        )
        oversize++
        continue
      }
      uri = toDataUri(json)
    }

    if (byteLength(uri) > URI_MAX_BYTES) {
      console.error(`[pin-metadata] ${key} produced a ${byteLength(uri)} B URI, over the ${URI_MAX_BYTES} B cap.`)
      oversize++
      continue
    }

    payloads[key] = { uri, json }
  }

  return { payloads, oversize, termsPinned }
}

async function main() {
  const configured = process.env.IPFS_API_URL?.trim()
  const optedOut = configured === 'none' || configured === 'off'
  const apiUrl = optedOut ? undefined : configured || DEFAULT_KUBO_API
  let usePinning = apiUrl ? await kuboReachable(apiUrl) : false

  if (optedOut) {
    console.log('[pin-metadata] IPFS_API_URL=none — using the inline data: path deliberately.')
  } else if (configured && !usePinning) {
    // Loud only when someone explicitly pointed us somewhere: they expected the
    // full payloads and are not getting them. An unreachable DEFAULT is the
    // ordinary no-daemon case and does not deserve a warning.
    console.warn(
      `[pin-metadata] IPFS_API_URL=${configured} is set but no daemon answered; falling back to inline data: URIs.`,
    )
    console.warn('[pin-metadata] Start one with `just ipfs-up`, or set IPFS_API_URL=none to silence this.')
  }

  // A node can answer `/api/v0/id` and still fail, hang, or time out on `add`.
  // When that happens the seed must still run: this step exists to enrich the
  // corpus, not to gate it. Degrade to the inline path and say so.
  let built
  if (usePinning) {
    try {
      built = await buildPayloads(true, apiUrl)
    } catch (err) {
      console.warn(`[pin-metadata] pinning failed: ${err instanceof Error ? err.message : String(err)}`)
      console.warn('[pin-metadata] falling back to inline data: URIs so the seed can still run.')
      usePinning = false
      built = await buildPayloads(false)
    }
  } else {
    built = await buildPayloads(false)
  }
  const { payloads, oversize, termsPinned } = built

  if (oversize > 0) {
    console.error(`[pin-metadata] ${oversize} payload(s) could not be encoded. Refusing to write a partial manifest.`)
    process.exit(1)
  }

  // `variant` is written for the seed's console output and for anyone reading
  // the file to work out why a description is one sentence long.
  const manifest = {
    variant: usePinning ? 'full' : 'short',
    service: usePinning ? 'kubo' : 'data-uri',
    // Carried here so the URI lives in exactly one place. The seed points one
    // commitment at it to keep the `unreachable` path represented; duplicating
    // the literal in Solidity would be a second place for it to drift.
    unreachableUri: UNREACHABLE_URI,
    payloads,
  }
  writeFileSync(MANIFEST_PATH, `${JSON.stringify(manifest, null, 2)}\n`)

  const widest = Math.max(...Object.values(payloads).map((p) => byteLength(p.uri)))
  console.log(`[pin-metadata] wrote ${MANIFEST_PATH}`)
  console.log(
    `[pin-metadata] ${CATALOGUE_KEYS.length} payloads, ${manifest.variant} variant via ${manifest.service}; ` +
      `widest URI ${widest}/${URI_MAX_BYTES} B`,
  )
  if (termsPinned > 0) console.log(`[pin-metadata] ${termsPinned} terms documents pinned and linked`)
  if (!usePinning) {
    console.log('[pin-metadata] No pinning backend: descriptions are the one-sentence variants.')
    console.log('[pin-metadata] Run `just ipfs-up` and re-seed for the full text.')
  }
}

await main()
