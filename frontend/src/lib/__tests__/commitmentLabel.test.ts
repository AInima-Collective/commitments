import { describe, expect, it } from 'vitest'
import { commitmentLabel, type CommitmentLabelContext } from '../commitmentLabel'
import {
  metadataAttestationId,
  metadataSearchText,
  metadataTags,
  metadataTrust,
} from '../commitmentMetadata'
import type { UnifiedRow } from '../../hooks/useUnifiedRows'
import {
  COMMITTER,
  COUNTERPARTY,
  NONZERO_HASH,
  makeOkRow as okMetadata,
  makeProposal,
  makeRow as row,
} from './fixtures/commitmentRows'
import { zeroHash } from 'viem'

const TOKEN_CTX: CommitmentLabelContext = {
  tokenMeta: () => ({ decimals: 6, symbol: 'cvUSDC' }),
}

describe('commitmentLabel — tier 1, the off-chain title', () => {
  it('promotes a title whose hash was attested and matched', () => {
    const label = commitmentLabel(okMetadata({ title: 'Weekly market-data delivery' }))
    expect(label).toMatchObject({
      text: 'Weekly market-data delivery',
      source: 'metadata',
      trust: 'attested',
    })
  })

  it('promotes a title with no hash attestation, but marks it unattested', () => {
    const label = commitmentLabel(
      row({ metadataStatus: 'ok', metadataHash: zeroHash, metadataContent: { title: 'Oracle uptime bond' } }),
    )
    expect(label).toMatchObject({ text: 'Oracle uptime bond', source: 'metadata', trust: 'unattested' })
  })

  it('collapses newlines so a title cannot break a table row', () => {
    const label = commitmentLabel(okMetadata({ title: 'Line one\n\n   line two' }))
    expect(label.text).toBe('Line one line two')
  })

  it('clamps an over-long title and keeps the full value for the tooltip', () => {
    const long = 'x'.repeat(200)
    const label = commitmentLabel(okMetadata({ title: long }))
    expect(label.text.length).toBeLessThan(long.length)
    expect(label.text.endsWith('…')).toBe(true)
    expect(label.full).toBe(long)
  })

  it('ignores a non-string title', () => {
    const label = commitmentLabel(okMetadata({ title: { evil: true } }), TOKEN_CTX)
    expect(label.source).toBe('derived')
  })
})

describe('commitmentLabel — the security rule', () => {
  it('never promotes a title whose bytes no longer match the attested hash', () => {
    const label = commitmentLabel(
      row({
        metadataStatus: 'mismatch',
        metadataHash: NONZERO_HASH,
        metadataContent: { title: 'Pay me instead' },
      }),
      TOKEN_CTX,
    )
    expect(label.source).toBe('derived')
    expect(label.text).not.toContain('Pay me instead')
    expect(label.trust).toBe('mismatch')
  })

  it('carries the refused title separately so a warning block can quote it', () => {
    const label = commitmentLabel(
      row({
        metadataStatus: 'mismatch',
        metadataHash: NONZERO_HASH,
        metadataContent: { title: 'Pay me instead' },
      }),
      TOKEN_CTX,
    )
    expect(label.withheldTitle).toBe('Pay me instead')
  })

  it('withholds nothing when the metadata could not be fetched at all', () => {
    const label = commitmentLabel(
      row({ metadataStatus: 'unreachable', metadataHash: NONZERO_HASH }),
      TOKEN_CTX,
    )
    expect(label).toMatchObject({ source: 'derived', trust: 'unreachable' })
    expect(label.withheldTitle).toBeUndefined()
  })
})

describe('commitmentLabel — tier 2, structure', () => {
  it('names a paired row after its agreement and side', () => {
    const label = commitmentLabel(
      row({ direction: 'paired', agreementId: 4n, agreementSide: 'A' }),
      TOKEN_CTX,
    )
    expect(label).toMatchObject({ text: 'Agreement #4, side A', source: 'derived' })
  })

  it('drops the side when the indexer did not resolve one', () => {
    const label = commitmentLabel(row({ direction: 'paired', agreementId: 4n }), TOKEN_CTX)
    expect(label.text).toBe('Agreement #4')
  })

  it('names a registered operator counterparty, directionally', () => {
    const ctx: CommitmentLabelContext = {
      ...TOKEN_CTX,
      operatorName: (a) => (a === COUNTERPARTY ? 'Acme Node Co.' : undefined),
    }
    expect(commitmentLabel(row(), ctx).text).toBe('Delegation to Acme Node Co.')
  })

  it('reads the other direction when the viewer is the counterparty', () => {
    const ctx: CommitmentLabelContext = {
      ...TOKEN_CTX,
      operatorName: (a) => (a === COMMITTER ? 'Acme Node Co.' : undefined),
    }
    expect(commitmentLabel(row({ role: 'counterparty' }), ctx).text).toBe(
      'Delegation from Acme Node Co.',
    )
  })

  it('uses a known protocol contract label', () => {
    const ctx: CommitmentLabelContext = {
      ...TOKEN_CTX,
      knownAddress: (a) =>
        a === COUNTERPARTY ? { label: 'Vault depositors (restitution)' } : undefined,
    }
    expect(commitmentLabel(row(), ctx).text).toBe('Vault depositors (restitution)')
  })

  it('names an open pledge', () => {
    expect(commitmentLabel(row({ acceptsContributions: true }), TOKEN_CTX).text).toBe(
      'Open pledge, accepting contributions',
    )
  })

  it('falls back to the shape of the stake itself', () => {
    expect(commitmentLabel(row(), TOKEN_CTX).text).toBe('1,204 cvUSDC held against 0x2222…22ab')
  })

  it('omits the amount when the token symbol has not resolved yet', () => {
    expect(commitmentLabel(row()).text).toBe('Stake held against 0x2222…22ab')
  })

  it('prefers the agreement over the counterparty identity', () => {
    const ctx: CommitmentLabelContext = {
      ...TOKEN_CTX,
      operatorName: () => 'Acme Node Co.',
      knownAddress: () => ({ label: 'Vault depositors (restitution)' }),
    }
    const label = commitmentLabel(
      row({ direction: 'paired', agreementId: 9n, agreementSide: 'B', acceptsContributions: true }),
      ctx,
    )
    expect(label.text).toBe('Agreement #9, side B')
  })
})

describe('commitmentLabel — tier 3 and proposals', () => {
  it('falls back to the bare id only when no counterparty is known', () => {
    const bare = { ...row(), counterparty: undefined, committer: undefined } as unknown as UnifiedRow
    expect(commitmentLabel(bare)).toMatchObject({ text: '#12', source: 'id' })
  })

  it('names a proposal after the party it is addressed to', () => {
    const proposal = makeProposal()
    expect(commitmentLabel(proposal).text).toBe('Proposed agreement with 0x2222…22ab')
    expect(commitmentLabel(proposal).trust).toBe('none')
  })
})

describe('metadataTrust', () => {
  it.each([
    ['ok with a hash', { metadataStatus: 'ok' as const, metadataHash: NONZERO_HASH }, 'attested'],
    ['ok with the zero hash', { metadataStatus: 'ok' as const, metadataHash: zeroHash }, 'unattested'],
    ['ok with no hash at all', { metadataStatus: 'ok' as const }, 'unattested'],
    ['mismatch', { metadataStatus: 'mismatch' as const, metadataHash: NONZERO_HASH }, 'mismatch'],
    ['unreachable', { metadataStatus: 'unreachable' as const }, 'unreachable'],
    ['empty', { metadataStatus: 'empty' as const }, 'none'],
    ['not yet fetched', {}, 'none'],
  ])('classifies %s as %s', (_name, overrides, expected) => {
    expect(metadataTrust(row(overrides))).toBe(expected)
  })
})

describe('metadataTags', () => {
  it('normalizes, de-duplicates, and drops non-strings', () => {
    const tags = metadataTags(okMetadata({ tags: ['SLA', ' sla ', 'Oracle', 42, '', 'uptime'] }))
    expect(tags).toEqual(['sla', 'oracle', 'uptime'])
  })

  it('caps how many tags one row can contribute', () => {
    const many = Array.from({ length: 40 }, (_, i) => `tag-${i}`)
    expect(metadataTags(okMetadata({ tags: many })).length).toBe(12)
  })

  it('returns an empty array when tags is not an array', () => {
    expect(metadataTags(okMetadata({ tags: 'sla' }))).toEqual([])
  })
})

describe('metadataAttestationId', () => {
  it('reads the trustgraphs key', () => {
    expect(metadataAttestationId(okMetadata({ trustgraphsAttestationId: 'attestation-id' }))).toBe(
      'attestation-id',
    )
  })
})

describe('metadataSearchText', () => {
  it('matches title, description, and tags', () => {
    const text = metadataSearchText(
      okMetadata({ title: 'Oracle uptime bond', description: 'Secures 99.9%', tags: ['SLA'] }),
    )
    expect(text).toContain('oracle uptime bond')
    expect(text).toContain('secures 99.9%')
    expect(text).toContain('sla')
  })

  it('still matches a tampered title, because search is lookup rather than display', () => {
    const tampered = row({
      metadataStatus: 'mismatch',
      metadataHash: NONZERO_HASH,
      metadataContent: { title: 'Nightly backup' },
    })
    expect(metadataSearchText(tampered)).toContain('nightly backup')
  })
})
