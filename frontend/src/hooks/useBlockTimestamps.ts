import { useMemo } from 'react'
import { useQueries } from '@tanstack/react-query'
import { useChainId, usePublicClient } from 'wagmi'

/**
 * Resolve a list of block numbers to their unix-seconds timestamps. One query
 * per block in the shared query cache (a block's timestamp never changes), so
 * tables asking for overlapping blocks don't re-fetch. Entries appear as
 * fetches resolve; an unresolved block reads `undefined` and the consumer
 * falls back to "—".
 */
export function useBlockTimestamps(blockNumbers: ReadonlyArray<bigint>): {
  get: (block: bigint) => bigint | undefined
  isLoading: boolean
} {
  const chainId = useChainId()
  const client = usePublicClient()
  const unique = useMemo(() => Array.from(new Set(blockNumbers)), [blockNumbers])
  const results = useQueries({
    queries: unique.map((block) => ({
      enabled: !!client,
      queryKey: ['block-timestamp', chainId, block.toString()],
      queryFn: async () => (await client!.getBlock({ blockNumber: block })).timestamp,
      staleTime: Infinity,
      retry: false,
    })),
  })
  const byBlock = new Map<bigint, bigint>()
  results.forEach((r, i) => {
    if (r.data !== undefined) byBlock.set(unique[i], r.data)
  })
  return {
    get: (b) => byBlock.get(b),
    isLoading: results.some((r) => r.isFetching),
  }
}
