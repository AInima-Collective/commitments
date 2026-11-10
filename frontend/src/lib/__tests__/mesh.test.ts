import { describe, expect, it } from 'vitest'
import { deriveOperatorStatus } from '../mesh'

describe('deriveOperatorStatus', () => {
  it('returns INACTIVE when the operator is not active, regardless of stake', () => {
    expect(deriveOperatorStatus({ active: false, totalDelegatedStake: 10n }, 1n)).toBe('INACTIVE')
  })

  it('returns BELOW_MIN_STAKE when active but under the minimum', () => {
    expect(deriveOperatorStatus({ active: true, totalDelegatedStake: 5n }, 10n)).toBe(
      'BELOW_MIN_STAKE',
    )
  })

  it('returns ACTIVE when active and at/above the minimum (or no minimum)', () => {
    expect(deriveOperatorStatus({ active: true, totalDelegatedStake: 10n }, 10n)).toBe('ACTIVE')
    expect(deriveOperatorStatus({ active: true, totalDelegatedStake: 0n })).toBe('ACTIVE')
  })
})
