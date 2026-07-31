export type SortableByUrgency = {
  status: string
  forfeitChallengeEnd?: bigint
  id: bigint
}

const FAR_FUTURE = 0xffff_ffff_ffff_ffffn

const tier = (s: string): number =>
  s === 'FORFEIT_PENDING' ? 0 : s === 'ACTIVE' ? 1 : 2

/**
 * Canonical urgency comparator — kept in lock-step with the indexer's
 * /commitments/urgent ORDER BY so any UI surface reading from either source
 * ranks rows identically. Tiers and tiebreakers:
 *
 *   1. FORFEIT_PENDING (0) → ACTIVE (1) → terminal/EXPIRED (2)
 *   2. Within tier: COALESCE(forfeitChallengeEnd, +∞) ASC — imminent deadlines float up
 *   3. Final tiebreaker: id DESC (newest first)
 */
export function compareCommitmentUrgency<T extends SortableByUrgency>(a: T, b: T): number {
  const ta = tier(a.status)
  const tb = tier(b.status)
  if (ta !== tb) return ta - tb
  const da = a.forfeitChallengeEnd ?? FAR_FUTURE
  const db = b.forfeitChallengeEnd ?? FAR_FUTURE
  if (da !== db) return da < db ? -1 : 1
  return a.id < b.id ? 1 : a.id > b.id ? -1 : 0
}

export function sortByCommitmentUrgency<T extends SortableByUrgency>(rows: readonly T[]): T[] {
  return [...rows].sort(compareCommitmentUrgency)
}
