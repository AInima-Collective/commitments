import { useMemo } from 'react'
import { useQueries } from '@tanstack/react-query'
import { useChainId } from 'wagmi'
import { hasIndexer } from '../config/indexer'

/**
 * Coalesce per-address lookups made in the same tick into one `fetchMany`
 * call. A failed lookup resolves every queued address to `null` ("looked up,
 * not found"), so a down indexer is not retried in a tight loop.
 */
export function createAddressBatcher<T>(
  fetchMany: (addresses: string[]) => Promise<Map<string, T>>,
): (address: string) => Promise<T | null> {
  let queue: Map<string, Array<(value: T | null) => void>> | null = null
  return (address) =>
    new Promise((resolve) => {
      if (!queue) {
        const batch = new Map<string, Array<(value: T | null) => void>>()
        queue = batch
        queueMicrotask(async () => {
          queue = null
          let found = new Map<string, T>()
          try {
            found = await fetchMany(Array.from(batch.keys()))
          } catch {
            // Fall through: every address in the batch reads as not found.
          }
          for (const [addr, waiters] of batch) for (const w of waiters) w(found.get(addr) ?? null)
        })
      }
      const waiters = queue.get(address)
      if (waiters) waiters.push(resolve)
      else queue.set(address, [resolve])
    })
}

/**
 * `useQueries` keeps a combined result's identity while the answers are
 * unchanged, so the memo over it holds across renders. Module-level so the
 * function's identity is stable too.
 */
function combineAnswers<T>(results: Array<{ data: T | null | undefined; isPending: boolean }>) {
  return { data: results.map((r) => r.data), isPending: results.some((r) => r.isPending) }
}

/**
 * Resolve a page's address list through a batcher, one query per address in
 * the query cache (keyed by chain, so a network switch never serves another
 * chain's answer). Values are cached for the session: names and identities
 * change only by deliberate on-chain action. The return keeps its identity
 * until an answer arrives.
 *
 * `get` returns `undefined` while unknown, `null` for "looked up, not found".
 */
export function useBatchedByAddress<T>(
  kind: string,
  addresses: ReadonlyArray<string | undefined>,
  load: (address: string) => Promise<T | null>,
): { lc: string[]; get: (address: string | undefined | null) => T | null | undefined; isLoading: boolean } {
  const chainId = useChainId()
  const lc = useMemo(() => {
    const out = new Set<string>()
    for (const a of addresses) if (a) out.add(a.toLowerCase())
    return Array.from(out).sort()
  }, [addresses])
  const results = useQueries({
    queries: lc.map((address) => ({
      enabled: hasIndexer,
      queryKey: [kind, chainId, address],
      queryFn: () => load(address),
      staleTime: Infinity,
    })),
    combine: combineAnswers<T>,
  })
  return useMemo(() => {
    const byAddress = new Map<string, T | null>()
    results.data.forEach((d, i) => {
      if (d !== undefined) byAddress.set(lc[i], d)
    })
    return {
      lc,
      get: (address) => (address ? byAddress.get(address.toLowerCase()) : undefined),
      isLoading: hasIndexer && results.isPending,
    }
  }, [lc, results])
}
