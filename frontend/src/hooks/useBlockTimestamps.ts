import { useEffect, useMemo, useState } from 'react'
import { usePublicClient } from 'wagmi'

/**
 * Resolve a list of block numbers to their unix-seconds timestamps. Batches the
 * unique set in a single Promise.all per render and caches the result in a
 * module-level Map so subsequent components asking for overlapping blocks
 * don't re-fetch.
 *
 * Mirrors the inline pattern in useVaultActivity but pulled out so multiple
 * Explorer tables can share the cache. Returns an in-progress Map — entries
 * appear as block fetches resolve. Reading from a non-yet-resolved block is
 * `undefined`; the consumer falls back to "—".
 */
const cache = new Map<bigint, bigint>()
const inFlight = new Set<bigint>()

export function useBlockTimestamps(blockNumbers: ReadonlyArray<bigint>): {
  get: (block: bigint) => bigint | undefined
  isLoading: boolean
} {
  const client = usePublicClient()
  const [, setTick] = useState(0)

  const unique = useMemo(() => {
    const out: bigint[] = []
    const seen = new Set<bigint>()
    for (const b of blockNumbers) {
      const key = b
      if (seen.has(key)) continue
      seen.add(key)
      out.push(key)
    }
    return out
  }, [blockNumbers])

  useEffect(() => {
    if (!client) return
    const todo = unique.filter((b) => !cache.has(b) && !inFlight.has(b))
    if (todo.length === 0) return
    for (const b of todo) inFlight.add(b)
    let cancelled = false
    Promise.all(
      todo.map(async (b) => {
        try {
          const block = await client.getBlock({ blockNumber: b })
          cache.set(b, block.timestamp)
        } catch {
          /* leave unresolved — consumer will show "—" */
        } finally {
          inFlight.delete(b)
        }
      }),
    ).then(() => {
      if (cancelled) return
      setTick((n) => n + 1)
    })
    return () => {
      cancelled = true
    }
  }, [client, unique])

  const isLoading = unique.some((b) => inFlight.has(b))

  return {
    get: (b) => cache.get(b),
    isLoading,
  }
}
