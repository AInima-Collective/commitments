import { useEffect, useMemo, useRef, useState } from 'react'
import { type Address } from 'viem'
import { useChainId } from 'wagmi'
import { hasIndexer, indexerGraphql } from '../config/indexer'

/**
 * Indexer Improvements #5 — bulk operator-name resolution with module-level cache.
 *
 * Given a list of addresses (typically the union of `arbiter` + `counterparty`
 * + `depositor` for the visible commitment set), one GraphQL round-trip pulls
 * `operators(where: { address_in: [...] })` and the returned `Map<lc-address, name>`
 * is what callers feed into `<AddressDisplay ens={...}>`.
 *
 * Caching is process-lifetime via a module Map. Names rarely change (a metadata
 * update is a deliberate operator action), so we don't bother with TTL for v1 —
 * a hard reload clears the cache. The cache stores `null` for "looked up but
 * not registered" so we don't refetch known non-operator addresses.
 *
 * Cache keys are `${chainId}:${lowercaseAddress}` so that switching networks
 * never serves a name resolved against a different chain's indexer.
 */

type Resolution = { name: string | null; metadataStatus: string | null }

/** Cache/pending key — namespaces a lowercase address by its chain id. */
function cacheKey(chainId: number, lcAddress: string): string {
  return `${chainId}:${lcAddress}`
}

/** Recover the bare address from a `${chainId}:${address}` key. */
function addressOf(key: string): string {
  return key.slice(key.indexOf(':') + 1)
}

const cache = new Map<string, Resolution>()
let inFlight: Promise<void> | null = null
const pending = new Set<string>()

interface RawOperatorMetadataRow {
  address: string
  metadataStatus: string | null
  metadataContent: Record<string, unknown> | null
}

async function flushPending(): Promise<void> {
  if (!hasIndexer || pending.size === 0) return
  const keys = Array.from(pending)
  pending.clear()
  // The GraphQL query is address-keyed; chain namespacing lives only in the
  // cache key, so collapse to the distinct bare addresses for the round-trip.
  const addresses = Array.from(new Set(keys.map(addressOf)))
  try {
    const res = await indexerGraphql<{ operators: { items: RawOperatorMetadataRow[] } }>(
      /* GraphQL */ `
        query OperatorNames($addresses: [String!]!) {
          operators(where: { address_in: $addresses }, limit: 1000) {
            items {
              address
              metadataStatus
              metadataContent
            }
          }
        }
      `,
      { addresses },
    )
    if (res.errors && res.errors.length > 0) {
      // Cache lookup-failure as null so we don't tight-loop retries.
      for (const k of keys) cache.set(k, { name: null, metadataStatus: null })
      return
    }
    const found = new Map<string, RawOperatorMetadataRow>()
    for (const item of res.data?.operators.items ?? []) {
      found.set(item.address.toLowerCase(), item)
    }
    for (const key of keys) {
      const row = found.get(addressOf(key))
      if (!row) {
        cache.set(key, { name: null, metadataStatus: null })
        continue
      }
      const name =
        row.metadataStatus === 'ok' &&
        row.metadataContent &&
        typeof row.metadataContent === 'object' &&
        typeof (row.metadataContent as { name?: unknown }).name === 'string'
          ? ((row.metadataContent as { name: string }).name)
          : null
      cache.set(key, { name, metadataStatus: row.metadataStatus })
    }
  } catch {
    for (const k of keys) cache.set(k, { name: null, metadataStatus: null })
  }
}

function scheduleFetch(): Promise<void> {
  if (inFlight) return inFlight
  // Defer one tick so multiple components mounting in the same render flush
  // their address sets together — turns N parallel hooks into one HTTP request.
  inFlight = new Promise<void>((resolve) => {
    queueMicrotask(async () => {
      try {
        await flushPending()
      } finally {
        inFlight = null
        resolve()
      }
    })
  })
  return inFlight
}

export interface OperatorNameMap {
  /** Returns the resolved operator name (or undefined if not registered / not loaded). */
  get: (address: string | undefined | null) => string | undefined
  isLoading: boolean
}

/**
 * Resolve an address list to operator names. Unknown addresses are queued and
 * fetched in one batched GraphQL call; known addresses return synchronously
 * from the module cache.
 *
 * Pass the **same array reference** across renders or memoize via `useMemo` —
 * the hook checks element-wise equality against the previous render but
 * doesn't deep-compare on every render.
 */
export function useOperatorNames(addresses: ReadonlyArray<Address | string | undefined>): OperatorNameMap {
  const chainId = useChainId()
  // Normalise to lowercase + dedupe + drop falsy entries.
  const lc = useMemo(() => {
    const out = new Set<string>()
    for (const a of addresses) {
      if (!a) continue
      out.add(a.toLowerCase())
    }
    return Array.from(out).sort()
  }, [addresses])
  const [, setTick] = useState(0)
  const lastKeyRef = useRef('')

  useEffect(() => {
    if (!hasIndexer || lc.length === 0) return
    // Re-run when the chain changes too — cache keys are chain-namespaced.
    const key = `${chainId}|${lc.join(',')}`
    if (key === lastKeyRef.current) return
    lastKeyRef.current = key
    let added = false
    for (const addr of lc) {
      const ck = cacheKey(chainId, addr)
      if (cache.has(ck)) continue
      pending.add(ck)
      added = true
    }
    if (!added) return
    void scheduleFetch().then(() => {
      // Bump local state to re-render with cache entries the batch just filled.
      setTick((n) => n + 1)
    })
  }, [lc, chainId])

  const isLoading = hasIndexer && lc.some((a) => !cache.has(cacheKey(chainId, a)))

  function get(address: string | undefined | null): string | undefined {
    if (!address) return undefined
    const entry = cache.get(cacheKey(chainId, address.toLowerCase()))
    return entry?.name ?? undefined
  }

  return { get, isLoading }
}
