import { describe, expect, it } from 'vitest'
import {
  applyCommitmentFilters,
  availableTags,
  type CommitmentFilterState,
} from '../commitmentFilters'
import { type UnifiedRow } from '../../hooks/useUnifiedRows'
import { COUNTERPARTY, NONZERO_HASH, makeOkRow, makeRow } from './fixtures/commitmentRows'

const BASE: CommitmentFilterState = { direction: 'all', statuses: [], role: 'all' }

const rows: UnifiedRow[] = [
  makeOkRow(
    {
      title: 'Oracle uptime bond',
      description: 'Secures a 99.9% uptime target on the price oracle.',
      tags: ['oracle', 'sla'],
    },
    { id: 1n },
  ),
  makeOkRow(
    {
      title: 'Bridge relayer bond',
      description: 'Covers censored or replayed messages on the WETH lane.',
      tags: ['bridge', 'relay'],
    },
    { id: 2n },
  ),
  makeOkRow({ title: 'Weekly data delivery', tags: ['sla', 'data-feed'] }, { id: 3n }),
  // Never named — only its counterparty address is searchable.
  makeRow({ id: 4n, metadataStatus: 'empty' }),
]

const ids = (out: UnifiedRow[]) => out.map((r) => Number(r.id))

describe('applyCommitmentFilters — search', () => {
  it('still matches the counterparty address', () => {
    const out = applyCommitmentFilters(rows, { ...BASE, search: COUNTERPARTY.slice(0, 10) })
    expect(out).toHaveLength(4)
  })

  it('matches a metadata title', () => {
    expect(ids(applyCommitmentFilters(rows, { ...BASE, search: 'uptime' }))).toEqual([1])
  })

  it('matches a description', () => {
    expect(ids(applyCommitmentFilters(rows, { ...BASE, search: 'replayed' }))).toEqual([2])
  })

  it('matches a tag', () => {
    expect(ids(applyCommitmentFilters(rows, { ...BASE, search: 'data-feed' }))).toEqual([3])
  })

  it('is case-insensitive and trims', () => {
    expect(ids(applyCommitmentFilters(rows, { ...BASE, search: '  ORACLE ' }))).toEqual([1])
  })

  it('excludes rows with nothing to match', () => {
    expect(ids(applyCommitmentFilters(rows, { ...BASE, search: 'bond' }))).toEqual([1, 2])
  })
})

describe('applyCommitmentFilters — tags', () => {
  it('keeps only rows carrying the tag', () => {
    expect(ids(applyCommitmentFilters(rows, { ...BASE, tags: ['sla'] }))).toEqual([1, 3])
  })

  it('OR-combines multiple tags, matching the status facet', () => {
    expect(ids(applyCommitmentFilters(rows, { ...BASE, tags: ['bridge', 'data-feed'] }))).toEqual([
      2, 3,
    ])
  })

  it('an empty tag list filters nothing out', () => {
    expect(applyCommitmentFilters(rows, { ...BASE, tags: [] })).toHaveLength(4)
  })

  it('combines with search rather than replacing it', () => {
    expect(ids(applyCommitmentFilters(rows, { ...BASE, tags: ['sla'], search: 'weekly' }))).toEqual([
      3,
    ])
  })

  it('still matches a tampered row, because filtering is lookup rather than display', () => {
    const tampered = makeRow({
      id: 9n,
      metadataStatus: 'mismatch',
      metadataHash: NONZERO_HASH,
      metadataContent: { title: 'Sneaky', tags: ['sla'] },
    })
    expect(ids(applyCommitmentFilters([tampered], { ...BASE, tags: ['sla'] }))).toEqual([9])
  })
})

describe('availableTags', () => {
  it('returns every tag present, most frequent first', () => {
    expect(availableTags(rows)).toEqual(['sla', 'bridge', 'data-feed', 'oracle', 'relay'])
  })

  it('returns nothing for a corpus with no metadata', () => {
    expect(availableTags([makeRow({ metadataStatus: 'empty' })])).toEqual([])
  })
})
