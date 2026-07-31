import { Hono } from 'hono'

/**
 * USD price endpoint — `/prices?symbols=USDC,WETH`.
 *
 * Strategy: lazy 60s in-memory cache populated by CoinGecko's free
 * `simple/price` endpoint. CoinGecko maps each asset symbol to a coin id via
 * `SYMBOL_TO_COIN_ID` below; symbols not in the map fall through to the
 * `STATIC_FALLBACK` table, which keeps anvil dev usable without network access.
 *
 * The endpoint is read-only and stateless beyond the cache; restarting the
 * indexer simply triggers a refetch on next request. Failures degrade to
 * fallback values so the dashboard never renders a stale-by-omission empty.
 */

const CACHE_TTL_MS = 60_000

const SYMBOL_TO_COIN_ID: Record<string, string> = {
  USDC: 'usd-coin',
  USDT: 'tether',
  DAI: 'dai',
  WETH: 'weth',
  ETH: 'ethereum',
  WBTC: 'wrapped-bitcoin',
  // Extend here as new vault assets land.
}

/**
 * Last-resort prices used when CoinGecko is unreachable (anvil / offline dev).
 * Stablecoins are 1.00; ETH/WETH is illustrative only — the real number comes
 * from CoinGecko in prod, and the UI tags any fallback-sourced price as
 * `source: 'fallback'` so the dashboard can flag it.
 */
const STATIC_FALLBACK: Record<string, number> = {
  USDC: 1.0,
  USDT: 1.0,
  DAI: 1.0,
  WETH: 3500,
  ETH: 3500,
  WBTC: 65000,
}

export type PriceSource = 'coingecko' | 'fallback'

export interface PriceEntry {
  symbol: string
  usd: number
  /** Unix seconds. */
  updatedAt: number
  source: PriceSource
}

interface PriceCache {
  prices: Map<string, PriceEntry>
  fetchedAt: number
}

let cache: PriceCache | null = null
let inflight: Promise<PriceCache> | null = null

async function fetchFromCoinGecko(): Promise<Map<string, PriceEntry>> {
  const ids = Object.values(SYMBOL_TO_COIN_ID).join(',')
  const url = `https://api.coingecko.com/api/v3/simple/price?ids=${ids}&vs_currencies=usd`
  const res = await fetch(url, {
    headers: { accept: 'application/json' },
    // Cap the upstream wait so a slow CoinGecko doesn't pin our endpoint.
    signal: AbortSignal.timeout(5_000),
  })
  if (!res.ok) throw new Error(`CoinGecko HTTP ${res.status}`)
  const payload = (await res.json()) as Record<string, { usd?: number }>
  const now = Math.floor(Date.now() / 1000)
  const out = new Map<string, PriceEntry>()
  for (const [symbol, coinId] of Object.entries(SYMBOL_TO_COIN_ID)) {
    const usd = payload[coinId]?.usd
    if (typeof usd !== 'number') continue
    out.set(symbol.toLowerCase(), { symbol, usd, updatedAt: now, source: 'coingecko' })
  }
  return out
}

function buildFallback(): Map<string, PriceEntry> {
  const now = Math.floor(Date.now() / 1000)
  const out = new Map<string, PriceEntry>()
  for (const [symbol, usd] of Object.entries(STATIC_FALLBACK)) {
    out.set(symbol.toLowerCase(), { symbol, usd, updatedAt: now, source: 'fallback' })
  }
  return out
}

async function refreshCache(): Promise<PriceCache> {
  let prices: Map<string, PriceEntry>
  try {
    const fetched = await fetchFromCoinGecko()
    // Backfill any symbol the upstream omitted with the fallback so consumers
    // never see "PRICE UNAVAILABLE" purely because CoinGecko skipped a coin.
    const fallback = buildFallback()
    for (const [k, v] of fallback) {
      if (!fetched.has(k)) fetched.set(k, v)
    }
    prices = fetched
  } catch {
    prices = buildFallback()
  }
  const next: PriceCache = { prices, fetchedAt: Date.now() }
  cache = next
  return next
}

async function getCache(): Promise<PriceCache> {
  if (cache && Date.now() - cache.fetchedAt < CACHE_TTL_MS) {
    return cache
  }
  if (inflight) return inflight
  inflight = refreshCache().finally(() => {
    inflight = null
  })
  return inflight
}

const app = new Hono()

/**
 * GET /prices?symbols=USDC,WETH
 *
 * Returns:
 * ```
 * {
 *   prices: {
 *     USDC: { symbol, usd, updatedAt, source },
 *     WETH: { symbol, usd, updatedAt, source }
 *   },
 *   fetchedAt: <unix-seconds>
 * }
 * ```
 *
 * Symbols are matched case-insensitively. Unknown symbols are silently
 * dropped — the response includes only the symbols we have data for.
 */
app.get('/', async (c) => {
  const symbolsParam = c.req.query('symbols') ?? ''
  const requested = symbolsParam
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter((s) => s.length > 0)

  const cacheData = await getCache()
  const result: Record<string, PriceEntry> = {}
  // If no symbols requested, return everything we have. Otherwise filter.
  const keys = requested.length === 0 ? [...cacheData.prices.keys()] : requested
  for (const key of keys) {
    const entry = cacheData.prices.get(key)
    if (entry) result[entry.symbol] = entry
  }
  return c.json({
    prices: result,
    fetchedAt: Math.floor(cacheData.fetchedAt / 1000),
  })
})

export default app
