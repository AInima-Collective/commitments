/**
 * Pure fold for `GET /mutuals/:id/history`: `mutualState` rows (one per block
 * that moved the mutual) and `coverBinding` rows into one point per UTC day.
 *
 * Each day samples its last second (or `now`, for today). The state is the last
 * row at or before that instant, so the series is a true step function. A day
 * with no row at or before it is all `null`: there is no state to report.
 */

export const DAY = 86_400n
export const SECONDS_PER_YEAR = 31_536_000n
const LAMBDA_ONE = 1_000_000_000_000_000_000n

export interface StateRow {
  blockTimestamp: bigint
  totalShares: bigint
  activeCover: bigint
  cumulativeLoss: bigint
  rewardRate: bigint
  periodFinish: bigint
}

export interface BindingRow {
  notional: bigint
  createdAt: bigint
  expiry: bigint
  expiredAt: bigint | null
}

export interface HistoryPoint {
  /** UTC day, `YYYY-MM-DD`. */
  date: string
  /** Unix seconds the day was sampled at: its last second, or `now` for today. */
  t: string
  /** Annualised premium over active cover, basis points. Null when activeCover is 0. */
  premiumAprBps: string | null
  /** Loss-adjusted capital, numeraire units: totalShares × (1e18 − cumulativeLoss) / 1e18. */
  capital: string | null
  /** Σ notional of bindings in force at `t`, numeraire units. */
  coverSold: string | null
}

/**
 * `rows` must be ascending by (blockNumber); only rows at or before `now` are
 * read, and the fold needs the last row before the window to fill the first days.
 */
export function foldMutualHistory(
  rows: readonly StateRow[],
  bindings: readonly BindingRow[],
  now: bigint,
  days: number,
): HistoryPoint[] {
  const today = now - (now % DAY)
  const points: HistoryPoint[] = []
  let i = 0
  let state: StateRow | null = null
  for (let d = days - 1; d >= 0; d--) {
    const dayStart = today - BigInt(d) * DAY
    const lastSecond = dayStart + DAY - 1n
    const t = lastSecond < now ? lastSecond : now
    while (i < rows.length && rows[i].blockTimestamp <= t) state = rows[i++]
    const date = new Date(Number(dayStart) * 1000).toISOString().slice(0, 10)
    if (!state) {
      points.push({ date, t: t.toString(), premiumAprBps: null, capital: null, coverSold: null })
      continue
    }
    // A stream stops paying at periodFinish and emits nothing when it does.
    const rate = t < state.periodFinish ? state.rewardRate : 0n
    const apr = state.activeCover === 0n ? null : (rate * SECONDS_PER_YEAR * 10_000n) / state.activeCover
    const capital = (state.totalShares * (LAMBDA_ONE - state.cumulativeLoss)) / LAMBDA_ONE
    let cover = 0n
    for (const b of bindings) {
      if (b.createdAt <= t && t < b.expiry && (b.expiredAt === null || b.expiredAt > t)) cover += b.notional
    }
    points.push({
      date,
      t: t.toString(),
      premiumAprBps: apr === null ? null : apr.toString(),
      capital: capital.toString(),
      coverSold: cover.toString(),
    })
  }
  return points
}
