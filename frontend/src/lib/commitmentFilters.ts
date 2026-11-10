import { type Address } from 'viem'
import { type UnifiedRow } from '../hooks/useUnifiedRows'
import { metadataSearchText, metadataTags } from './commitmentMetadata'

/**
 * Shared commitment-table filter vocabulary. Commitment surfaces drive their
 * FilterBar + row filtering through these so semantics stay consistent.
 */
export type DirectionFilter = 'all' | 'one-way' | 'paired'
export type RoleFilter = 'all' | 'committer' | 'counterparty'

/** Direction options for a `FilterBar.Select`. */
export const DIRECTION_FILTER_OPTIONS = [
  { value: 'all', label: 'all' },
  { value: 'one-way', label: '→ one-way' },
  { value: 'paired', label: '↔ paired' },
]

/** Role options for a `FilterBar.Select`. */
export const ROLE_FILTER_OPTIONS = [
  { value: 'all', label: 'all' },
  { value: 'committer', label: 'committer' },
  { value: 'counterparty', label: 'counterparty' },
]

/** Status options for a commitments-only table (no pre-acceptance proposals). */
export const COMMITMENT_STATUS_FILTER_OPTIONS = [
  { value: 'ACTIVE', label: 'active' },
  { value: 'UNBONDING', label: 'unbonding' },
  { value: 'FORFEIT_PENDING', label: 'forfeit pending' },
  { value: 'RELEASED', label: 'released' },
  { value: 'FORFEITED', label: 'forfeited' },
  { value: 'EXPIRED', label: 'expired' },
]

/**
 * Returns the address of the *other* party from the viewer's vantage point.
 * Each row's `committer`/`counterparty` slots already point to the right
 * parties (commitment: committer/counterparty; proposal: proposer/acceptor),
 * so role 'committer' / 'proposer' both flow to the counterparty/acceptor.
 */
export function otherParty(row: UnifiedRow): Address {
  return row.role === 'committer' || row.role === 'proposer' ? row.counterparty : row.committer
}

export interface CommitmentFilterState {
  direction: DirectionFilter
  statuses: string[]
  role: RoleFilter
  /**
   * Free text, matched against the other party's address AND the row's
   * metadata title, description, and tags. Optional.
   */
  search?: string
  /**
   * Tags to keep. OR-combined, matching how the status facet behaves in the
   * same bar: selecting two tags widens the result set rather than narrowing
   * it to rows carrying both. Empty or absent means no tag filtering.
   */
  tags?: readonly string[]
}

/**
 * Apply the shared filter state to a set of unified rows. Pure — callers wrap
 * it in `useMemo`. The role filter unifies the commitment/proposal slot names:
 * committer + proposer share the "outgoing stake" slot; counterparty + acceptor
 * share the "incoming stake" slot.
 */
export function applyCommitmentFilters(rows: UnifiedRow[], state: CommitmentFilterState): UnifiedRow[] {
  const { direction, statuses, role } = state
  const search = state.search?.trim().toLowerCase() ?? ''
  const tags = state.tags ?? []
  return rows.filter((r) => {
    if (direction === 'one-way' && r.direction !== 'one-way') return false
    if (direction === 'paired' && r.direction !== 'paired') return false
    if (statuses.length > 0 && !statuses.includes(r.status)) return false
    if (role !== 'all') {
      const want =
        role === 'committer'
          ? r.role === 'committer' || r.role === 'proposer'
          : r.role === 'counterparty' || r.role === 'acceptor'
      if (!want) return false
    }
    if (search) {
      // Address first: it is the cheap check and the historical behaviour.
      const matched =
        otherParty(r).toLowerCase().includes(search) || metadataSearchText(r).includes(search)
      if (!matched) return false
    }
    if (tags.length > 0) {
      const rowTags = metadataTags(r)
      if (!tags.some((t) => rowTags.includes(t))) return false
    }
    return true
  })
}

/**
 * Every tag present in the loaded rows, sorted by frequency then alphabetically,
 * ready to populate a filter facet.
 *
 * Client-side on purpose. The corpus a viewer holds is their own commitments,
 * which is small, and the rows are already in memory. The scale answer is a
 * `tags` column on the indexer's `commitment` table derived at handler time —
 * `extractServices` in the indexer does exactly that shape for operators — but
 * that is worth building only if this measurably falls over.
 */
export function availableTags(rows: readonly UnifiedRow[]): string[] {
  const counts = new Map<string, number>()
  for (const r of rows) {
    for (const tag of metadataTags(r)) {
      counts.set(tag, (counts.get(tag) ?? 0) + 1)
    }
  }
  return Array.from(counts.entries())
    .sort((a, b) => (b[1] - a[1]) || a[0].localeCompare(b[0]))
    .map(([tag]) => tag)
}
