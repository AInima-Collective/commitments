/**
 * Pure math for the vault snapshot pipeline: the `VaultSnapshot:block` handler
 * (`src/vaultSnapshot.ts`) writes with it and `GET /vaults/:vault/periodic`
 * reads with it. No ponder imports, so `node --test` can load it.
 */

const DAY = 86_400
export const APY_7D_SECONDS = 7 * DAY
export const APY_30D_SECONDS = 30 * DAY
const WAD = 10n ** 18n

/** `totalAssets` per 1e18 shares; 1e18 for an empty vault. */
export function sharePriceOf(totalAssets: bigint, totalSupply: bigint): bigint {
  return totalSupply > 0n ? (totalAssets * WAD) / totalSupply : WAD
}

/**
 * Compute APY in basis points by comparing two share prices over a window.
 *
 * Formula: ((curPrice / pastPrice)^(year/elapsed) - 1) * 10_000
 *
 * Returns null when there isn't enough history (we require at least half the
 * window) or when either share price is non-positive. Uses Number for the
 * exponent — 18-decimal share prices fit comfortably in double precision
 * after the ratio cancels the scaling. Acceptable for a UI KPI.
 */
export function annualizedBps(
  curPrice: bigint,
  pastPrice: bigint,
  elapsedSec: bigint,
  windowSec: bigint,
): number | null {
  if (pastPrice <= 0n || curPrice <= 0n) return null
  if (elapsedSec * 2n < windowSec) return null
  const ratio = Number(curPrice) / Number(pastPrice)
  if (!Number.isFinite(ratio) || ratio <= 0) return null
  const elapsedYears = Number(elapsedSec) / (365 * 24 * 60 * 60)
  if (elapsedYears <= 0) return null
  const annualized = Math.pow(ratio, 1 / elapsedYears) - 1
  if (!Number.isFinite(annualized)) return null
  return Math.round(annualized * 10_000)
}

/**
 * Rolling APY at `now` against `ref`, the vault's oldest snapshot inside the
 * trailing window (undefined when it has none).
 */
export function rollingApyBps(
  now: bigint,
  sharePrice: bigint,
  ref: { timestamp: bigint; sharePrice: bigint } | undefined,
  windowSec: number,
): number | null {
  return ref ? annualizedBps(sharePrice, ref.sharePrice, now - ref.timestamp, BigInt(windowSec)) : null
}

/** The read side's point spacing: hourly for up to 7 days, daily beyond. */
export function periodicStepSeconds(days: number): number {
  return days <= 7 ? 3_600 : DAY
}
