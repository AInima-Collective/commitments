// Row-level display facts shared by every commitment list layout.
//
// Pure, and deliberately separate from the components that consume them: the
// table and the card list both need to agree on which statuses colour a row
// and how claimable yield is attributed, and a rule that lives in one
// renderer's file is a rule the other renderer will eventually get wrong.

import { type UnifiedRow } from '../hooks/useUnifiedRows'

/**
 * Which rows get a coloured edge, and in what tone.
 *
 * Only states that need the reader to do something are coloured. An active
 * commitment is the normal case and stays neutral; colouring it would leave
 * nothing to notice about the row that is one day from being forfeited.
 */
export function rowTone(row: UnifiedRow): 'info' | 'warn' | 'danger' | undefined {
  if (row.status === 'FORFEIT_PENDING') return 'warn'
  if (row.status === 'FORFEITED') return 'danger'
  if (row.status === 'PENDING') return 'info'
  if (row.status === 'UNBONDING') return 'info'
  return undefined
}

/**
 * Live claimable yield for a row, or undefined when there is nothing to claim.
 *
 * Takes the pre-summed map rather than the raw entries because a commitment
 * can carry several strategy bindings, and summing per row inside the render
 * loop would be quadratic in the number of visible rows.
 */
export function claimableFor(
  row: UnifiedRow,
  claimableById: Map<string, bigint>,
): bigint | undefined {
  if (row.kind !== 'commitment') return undefined
  const value = claimableById.get(row.id.toString())
  return value !== undefined && value > 0n ? value : undefined
}

/** Sum claimable entries per commitment id, ready for {@link claimableFor}. */
export function sumClaimableById(
  entries: ReadonlyArray<{ commitmentId: bigint; amount: bigint }> | undefined,
): Map<string, bigint> {
  const map = new Map<string, bigint>()
  for (const e of entries ?? []) {
    const k = e.commitmentId.toString()
    map.set(k, (map.get(k) ?? 0n) + e.amount)
  }
  return map
}
