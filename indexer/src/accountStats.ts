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
  const existing = await db.find(accountStats, { address: addr })
  const next = {
    address: addr,
    commitmentsOut: (existing?.commitmentsOut ?? 0) + (patch.commitmentsOut ?? 0),
    commitmentsIn: (existing?.commitmentsIn ?? 0) + (patch.commitmentsIn ?? 0),
    convictionOut: (existing?.convictionOut ?? 0n) + (patch.convictionOut ?? 0n),
    convictionIn: (existing?.convictionIn ?? 0n) + (patch.convictionIn ?? 0n),
    activeCount: (existing?.activeCount ?? 0) + (patch.activeDelta ?? 0),
    forfeitedCount: (existing?.forfeitedCount ?? 0) + (patch.forfeitedDelta ?? 0),
    releasedCount: (existing?.releasedCount ?? 0) + (patch.releasedDelta ?? 0),
  }
  if (existing) {
    await db.update(accountStats, { address: addr }).set(next)
  } else {
    await db.insert(accountStats).values(next)
  }
}
