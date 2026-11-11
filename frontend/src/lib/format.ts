import { formatUnits } from 'viem'

/**
 * Convert a token-denominated bigint amount into USD-denominated bigint with
 * 6 decimals of precision (matching USDC's natural precision).
 *
 * Math is integer-only — the floating-point USD price is scaled to a fixed
 * 1e8 factor before multiplication so a 6-decimal result drops out without
 * float drift. Returns `null` when the price is missing/non-finite, so
 * callers can render a "PRICE UNAVAILABLE" path without ambiguity around
 * what 0n means.
 *
 * @example
 * bigintToUsd(1_000_000_000n, 18, 3500) // 1 ETH → 3_500_000_000n (3,500.00 USD)
 *
 * @example
 * bigintToUsd(123_456789n, 6, 1) // 123.456789 USDC → 123_456789n (123.46 USD)
 */
export function bigintToUsd(
  amount: bigint,
  decimals: number,
  priceUsd: number | null | undefined,
): bigint | null {
  if (priceUsd === null || priceUsd === undefined || !Number.isFinite(priceUsd)) {
    return null
  }
  // 8 decimals of price precision is more than CoinGecko surfaces (typically 6)
  // and matches Chainlink's standard feed precision so future feed work slots
  // in cleanly.
  const PRICE_SCALE = 100_000_000n
  const priceScaled = BigInt(Math.round(priceUsd * Number(PRICE_SCALE)))
  // amount × price / (10^decimals × PRICE_SCALE / 10^USD_DECIMALS)
  // USD_DECIMALS = 6 → divisor = 10^decimals × 10^2
  const USD_DECIMALS = 6n
  const divisor = 10n ** BigInt(decimals) * (PRICE_SCALE / 10n ** USD_DECIMALS)
  return (amount * priceScaled) / divisor
}

export type TokenAmountParts = {
  /** Comma-grouped integer portion: "1,247" */
  int: string
  /** Fraction including leading dot: ".4057" or "" */
  fraction: string
  /** Canonical full-precision string for tooltips: "1247.328573291847562" */
  full: string
  /** K/M/B compact form when requested AND value is above the threshold */
  compact?: string
}

/**
 * Format a bigint token amount into renderable parts.
 *
 * The fraction is trimmed to `precision` digits, then trailing zeros stripped
 * so `12.40` reads as `12.4` but `12.05` keeps the leading zero. Compact form
 * is only emitted when the integer value reaches 10,000 — never `0.0042K`.
 *
 * `full` always carries the unrounded value so the renderer can attach it to
 * a `title` attribute regardless of visible truncation.
 *
 * @example
 * formatTokenAmount(1_247_328573291847562n, 18)
 * // → { int: '1,247', fraction: '.3286', full: '1247.328573291847562' }
 *
 * @example
 * formatTokenAmount(0n, 18)
 * // → { int: '0', fraction: '', full: '0' }
 *
 * @example
 * formatTokenAmount(12_500_000_000_000_000_000_000n, 18, { compact: true })
 * // → { int: '12,500', fraction: '', full: '12500', compact: '12.5K' }
 */
export function formatTokenAmount(
  amount: bigint,
  decimals: number,
  opts: { precision?: number; compact?: boolean } = {},
): TokenAmountParts {
  const { precision = 4, compact = false } = opts
  const raw = formatUnits(amount, decimals)
  const [intRaw, fracRaw = ''] = raw.split('.')

  const intStr = intRaw === '-0' ? '0' : Number(intRaw).toLocaleString('en-US')
  const fracTrim = fracRaw.slice(0, precision).replace(/0+$/, '')
  const fraction = fracTrim ? `.${fracTrim}` : ''

  const parts: TokenAmountParts = { int: intStr, fraction, full: raw }

  if (compact) {
    const intMagnitude = BigInt(intRaw === '-0' ? '0' : intRaw)
    const compactStr = formatCompact(intMagnitude)
    if (compactStr !== null) parts.compact = compactStr
  }

  return parts
}

/**
 * Compact-format an integer-valued bigint or number into the conventional
 * K / M / B / T short form: `12_400 → "12.4K"`, `4_221_000 → "4.22M"`.
 *
 * Returns `null` below 10,000 so callers can fall back to full formatting
 * (we never emit `0.0042K`-style nonsense). Numbers are coerced via
 * `BigInt(Math.trunc(value))` so fractional inputs are floored toward zero.
 *
 * @example
 * formatCompact(12_400n) // → '12.4K'
 *
 * @example
 * formatCompact(9_999n) // → null (below threshold)
 *
 * @example
 * formatCompact(-4_221_000n) // → '-4.22M'
 *
 * @example
 * formatCompact(1_500_000_000n) // → '1.5B'
 */
export function formatCompact(value: bigint | number): string | null {
  const n = typeof value === 'bigint' ? value : BigInt(Math.trunc(value))
  const abs = n < 0n ? -n : n
  if (abs < 10_000n) return null

  const sign = n < 0n ? '-' : ''
  const tiers: Array<{ limit: bigint; suffix: string }> = [
    { limit: 1_000_000_000_000n, suffix: 'T' },
    { limit: 1_000_000_000n, suffix: 'B' },
    { limit: 1_000_000n, suffix: 'M' },
    { limit: 1_000n, suffix: 'K' },
  ]
  for (const tier of tiers) {
    if (abs >= tier.limit) {
      const whole = abs / tier.limit
      const rem = abs % tier.limit
      const decimal = Number((rem * 100n) / tier.limit)
        .toString()
        .padStart(2, '0')
        .replace(/0+$/, '')
      return decimal ? `${sign}${whole}.${decimal}${tier.suffix}` : `${sign}${whole}${tier.suffix}`
    }
  }
  return null
}

/**
 * Format basis points as a percentage string, with optional precision control.
 * This is the canonical bps→percent formatter; the protocol-domain `formatBps`
 * in `lib/commitments` is a fixed-2-decimal alias that delegates here.
 *
 * @example
 * formatPercent(5000) // → '50.00%'
 *
 * @example
 * formatPercent(1234, { precision: 1 }) // → '12.3%'
 *
 * @example
 * formatPercent(0n) // → '0.00%'
 */
export function formatPercent(
  bps: number | bigint,
  opts: { precision?: number } = {},
): string {
  const { precision = 2 } = opts
  const n = typeof bps === 'bigint' ? Number(bps) : bps
  return `${(n / 100).toFixed(precision)}%`
}

/** 1e18 — the fixed-point scale of a Mutual cumulative-loss fraction (Λ). */
export const LAMBDA_SCALE = 10n ** 18n

/**
 * 1e18-scaled loss fraction (Λ) → float in [0, 1], at 1e6 resolution.
 * Divides in bigint space first so very large Λ values don't lose precision.
 */
export function lambdaToFraction(scaled: bigint): number {
  return Number((scaled * 1_000_000n) / LAMBDA_SCALE) / 1_000_000
}

/**
 * 1e18-scaled loss fraction (Λ) → rounded percentage string in [0, 100]
 * (e.g. `1e18 → '100.00%'`). The display form for gauges and headline stats.
 */
export function formatLambdaPercent(scaled: bigint, opts: { precision?: number } = {}): string {
  const { precision = 2 } = opts
  return `${(Number((scaled * 1_000_000n) / LAMBDA_SCALE) / 10_000).toFixed(precision)}%`
}

/**
 * 1e18-scaled loss fraction (Λ) → canonical full-precision percentage string,
 * for surfacing the exact value via `title=` behind a rounded display.
 */
export function formatLambdaPercentFull(scaled: bigint): string {
  const pctScaled = scaled * 100n // percentage, still 1e18-scaled
  const intPart = pctScaled / LAMBDA_SCALE
  const frac = (pctScaled % LAMBDA_SCALE).toString().padStart(18, '0').replace(/0+$/, '')
  return frac ? `${intPart}.${frac}%` : `${intPart}%`
}

/**
 * Middle-truncate a hex address. Default 6 leading + 4 trailing — the
 * convention every wallet UI has converged on. Returns the input unchanged
 * when it is short enough that truncation would not save space.
 *
 * @example
 * truncateAddress('0xabcdef0123456789abcdef0123456789abcdef01')
 * // → '0xabcd…ef01'
 *
 * @example
 * truncateAddress('0xshort') // → '0xshort' (below truncation threshold)
 */
export function truncateAddress(address: string, lead = 6, tail = 4): string {
  // Defensive: tolerate a missing address so one not-yet-migrated field can't
  // crash the whole render with `undefined.length`.
  if (!address) return '\u2014'
  if (address.length <= lead + tail + 1) return address
  return `${address.slice(0, lead)}\u2026${address.slice(-tail)}`
}

/**
 * Human-readable duration for a seconds offset. Compact enough for table cells.
 * Negative inputs clamp to `0s`. Past the hour scale we degrade gracefully into
 * single-unit displays (`1d 1h`, `9d`) since challenge windows / unbonding
 * periods care about "minutes vs days?", not seconds.
 *
 * @example
 * formatDuration(59)         // → '59s'
 *
 * @example
 * formatDuration(3_600)      // → '1h'
 *
 * @example
 * formatDuration(90_000)     // → '1d 1h'
 *
 * @example
 * formatDuration(86_400 * 9) // → '9d'
 */
export function formatDuration(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds))
  if (s < 60) return `${s}s`
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m`
  const h = Math.floor(m / 60)
  if (h < 24) {
    const remM = m % 60
    return remM ? `${h}h ${remM}m` : `${h}h`
  }
  const d = Math.floor(h / 24)
  const remH = h % 24
  return remH ? `${d}d ${remH}h` : `${d}d`
}

/**
 * A unix-seconds timestamp as a short local date and time ("Mar 04, 09:30"),
 * or "—" when there is none.
 */
export function formatTimestamp(ts: bigint | null | undefined): string {
  if (ts == null) return '—'
  const date = new Date(Number(ts) * 1000)
  if (Number.isNaN(date.getTime())) return '—'
  return date.toLocaleString(undefined, {
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}
