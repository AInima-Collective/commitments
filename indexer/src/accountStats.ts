/**
 * Shared per-address aggregate maintenance for the `accountStats` table.
 * Lives outside `index.ts` so the mutual handlers (side-effect-imported from
 * `index.ts`) can bump the same counters without a circular import.
 */
import { accountStats } from 'ponder:schema'

export async function bumpAccount(
  db: any,
  addr: `0x${string}`,
  patch: {
    commitmentsOut?: number
    commitmentsIn?: number
    convictionOut?: bigint
    convictionIn?: bigint
    activeDelta?: number
    forfeitedDelta?: number
    releasedDelta?: number
  }
) {
  await db
    .insert(accountStats)
    .values({
      address: addr,
      commitmentsOut: patch.commitmentsOut ?? 0,
      commitmentsIn: patch.commitmentsIn ?? 0,
      convictionOut: patch.convictionOut ?? 0n,
      convictionIn: patch.convictionIn ?? 0n,
      activeCount: patch.activeDelta ?? 0,
      forfeitedCount: patch.forfeitedDelta ?? 0,
      releasedCount: patch.releasedDelta ?? 0,
    })
    .onConflictDoUpdate((row: {
      commitmentsOut: number
      commitmentsIn: number
      convictionOut: bigint
      convictionIn: bigint
      activeCount: number
      forfeitedCount: number
      releasedCount: number
    }) => ({
      commitmentsOut: row.commitmentsOut + (patch.commitmentsOut ?? 0),
      commitmentsIn: row.commitmentsIn + (patch.commitmentsIn ?? 0),
      convictionOut: row.convictionOut + (patch.convictionOut ?? 0n),
      convictionIn: row.convictionIn + (patch.convictionIn ?? 0n),
      activeCount: row.activeCount + (patch.activeDelta ?? 0),
      forfeitedCount: row.forfeitedCount + (patch.forfeitedDelta ?? 0),
      releasedCount: row.releasedCount + (patch.releasedDelta ?? 0),
    }))
}
