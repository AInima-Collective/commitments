/**
 * Pure fold for `GET /account/:address/balance-history`.
 *
 * Split out of the route handler (same shape as `snapshotMath.ts` next to
 * `snapshot.ts`) so the cumulative arithmetic — the part that silently corrupts
 * a whole chart if it's wrong — is testable without a database.
 */

export interface FlowRow {
  token: string
  freeDelta: bigint
  encumberedDelta: bigint
  kind: string
  commitmentId: bigint | null
  blockTimestamp: bigint
  txHash: string
}

export interface FoldedPoint {
  t: string
  free: string
  encumbered: string
  kind: string
  commitmentId: string | null
  txHash: string
}

export interface FoldedToken {
  token: string
  latest: { free: string; encumbered: string }
  points: FoldedPoint[]
}

/**
 * Fold chronologically-ordered flow rows into per-token cumulative series.
 *
 * `rows` MUST arrive in CHAIN order — ascending by (blockNumber, logIndex) —
 * because a cumulative fold over out-of-order deltas is wrong everywhere except
 * its endpoint, which is worse than an obvious failure.
 *
 * Chain order, specifically, not timestamp order. Sorting by blockTimestamp is
 * the intuitive thing and it is wrong twice over: a deposit and the encumbrance
 * it funds routinely share one block, and under instant mining whole runs of
 * blocks share one timestamp. Either way the tiebreak decides the fold, and
 * getting it backwards drives free negative for the remainder of the series.
 *
 * This function cannot detect the mistake for you. Negative balances are not a
 * usable signal: the unattributable FromEscrowToFree path (see the endpoint
 * docs) means a correctly-ordered fold can legitimately go negative too.
 *
 * Everything older than `cutoff` collapses into ONE opening point stamped at
 * the cutoff, rather than being dropped. Dropping it would restart the fold
 * from zero and show a year-old account as having just deposited; collapsing it
 * keeps the opening balance correct without shipping the whole history.
 */
export function foldFlows(rows: FlowRow[], cutoff: bigint): FoldedToken[] {
  const byToken = new Map<
    string,
    { points: FoldedPoint[]; opening: FoldedPoint | null; free: bigint; encumbered: bigint }
  >()

  for (const f of rows) {
    const key = f.token.toLowerCase()
    let acc = byToken.get(key)
    if (!acc) {
      acc = { points: [], opening: null, free: 0n, encumbered: 0n }
      byToken.set(key, acc)
    }
    acc.free += f.freeDelta
    acc.encumbered += f.encumberedDelta
    const point: FoldedPoint = {
      t: f.blockTimestamp.toString(),
      free: acc.free.toString(),
      encumbered: acc.encumbered.toString(),
      kind: f.kind,
      commitmentId: f.commitmentId?.toString() ?? null,
      txHash: f.txHash,
    }
    if (f.blockTimestamp < cutoff) acc.opening = { ...point, t: cutoff.toString() }
    else acc.points.push(point)
  }

  return [...byToken.entries()].map(([token, acc]) => ({
    token,
    latest: { free: acc.free.toString(), encumbered: acc.encumbered.toString() },
    points: acc.opening ? [acc.opening, ...acc.points] : acc.points,
  }))
}
