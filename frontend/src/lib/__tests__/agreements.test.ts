import { describe, expect, it } from 'vitest'
import { deriveAgreementStatus } from '../agreements'

const nowSecs = (): bigint => BigInt(Math.floor(Date.now() / 1000))

describe('deriveAgreementStatus', () => {
  it('returns CANCELLED ahead of everything else', () => {
    expect(
      deriveAgreementStatus({ accepted: true, cancelled: true, expiresAt: 0n }, 'FORFEITED'),
    ).toBe('CANCELLED')
  })

  it('maps an accepted proposal to its resolvedStatus when terminal', () => {
    expect(
      deriveAgreementStatus({ accepted: true, cancelled: false, expiresAt: 0n }, 'FORFEITED'),
    ).toBe('FORFEITED')
    expect(
      deriveAgreementStatus({ accepted: true, cancelled: false, expiresAt: 0n }, 'RESOLVED'),
    ).toBe('RESOLVED')
  })

  it('returns ACTIVE for an accepted proposal with no resolution', () => {
    expect(deriveAgreementStatus({ accepted: true, cancelled: false, expiresAt: 0n })).toBe(
      'ACTIVE',
    )
  })

  it('returns EXPIRED for an unaccepted proposal past its expiry', () => {
    expect(
      deriveAgreementStatus({ accepted: false, cancelled: false, expiresAt: nowSecs() - 100n }),
    ).toBe('EXPIRED')
  })

  it('returns PROPOSED for an open, unexpired proposal', () => {
    expect(
      deriveAgreementStatus({ accepted: false, cancelled: false, expiresAt: nowSecs() + 10_000n }),
    ).toBe('PROPOSED')
    expect(deriveAgreementStatus({ accepted: false, cancelled: false, expiresAt: 0n })).toBe(
      'PROPOSED',
    )
  })
})
