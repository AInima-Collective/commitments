import { useQuery } from '@tanstack/react-query'

import { hasIndexer, indexerJson } from '../config/indexer'
import { POLL } from './polling'

export type PriceSource = 'coingecko' | 'fallback'

export interface PriceEntry {
  symbol: string
  usd: number
  /** Unix seconds. */
  updatedAt: number
  source: PriceSource
}

interface PricesResponse {
  prices: Record<string, PriceEntry>
  fetchedAt: number
}

interface UseAssetPricesParams {
  /** Asset symbols to look up — case-insensitive. Empty list disables the fetch. */
  symbols: string[]
}

interface UseAssetPricesReturn {
  prices: Map<string, PriceEntry>
  /** Convenience getter — looks up by symbol case-insensitively. */
  getPrice: (symbol: string | undefined) => PriceEntry | undefined
  isLoading: boolean
  error: unknown
  /** True when the indexer is offline; the dashboard treats this as "USD unavailable". */
  indexerOffline: boolean
}

const STALE_AFTER_SECS = 5 * 60

/**
 * useAssetPrices — pulls USD prices from the Ponder indexer's `/prices`
 * endpoint. The indexer caches CoinGecko responses for 60s (with a static
 * fallback table for offline dev), so frontend polling at 30s gives sub-2-min
 * freshness without hammering upstream.
 *
 * The hook does NOT block on price availability — `prices` is always defined
 * (empty Map until the first fetch resolves). Callers render USD if a price
 * is present and fall back to a "PRICE UNAVAILABLE" path when absent or
 * stale (`updatedAt` older than {@link STALE_AFTER_SECS}).
 */
export function useAssetPrices({ symbols }: UseAssetPricesParams): UseAssetPricesReturn {
  const enabled = hasIndexer && symbols.length > 0
  const dedup = useMemoizedSymbols(symbols)

  const query = useQuery<PricesResponse>({
    enabled,
    queryKey: ['asset-prices', dedup],
    queryFn: async () => {
      return indexerJson<PricesResponse>(`/prices?symbols=${encodeURIComponent(dedup)}`)
    },
    refetchInterval: POLL.slow,
    staleTime: 30_000,
  })

  const prices = new Map<string, PriceEntry>()
  if (query.data) {
    for (const [, entry] of Object.entries(query.data.prices)) {
      prices.set(entry.symbol.toLowerCase(), entry)
    }
  }

  const getPrice = (symbol: string | undefined): PriceEntry | undefined => {
    if (!symbol) return undefined
    const entry = prices.get(symbol.toLowerCase())
    if (!entry) return undefined
    const now = Math.floor(Date.now() / 1000)
    if (now - entry.updatedAt > STALE_AFTER_SECS) return undefined
    return entry
  }

  return {
    prices,
    getPrice,
    isLoading: query.isLoading,
    error: query.error,
    indexerOffline: !hasIndexer,
  }
}

/**
 * Stable, sorted, comma-joined symbol key — keeps react-query's queryKey
 * stable across renders that pass a re-built array of the same logical set.
 */
function useMemoizedSymbols(symbols: string[]): string {
  // No useMemo dep array is needed — the key derivation is cheap and the
  // returned string is value-stable across calls with the same logical set.
  const normalized = [...new Set(symbols.map((s) => s.toLowerCase()))].sort().join(',')
  return normalized
}
