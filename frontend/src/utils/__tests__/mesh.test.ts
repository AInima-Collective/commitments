import { describe, expect, it } from 'vitest'
import {
  deriveOperatorStatus,
  nodeTypeLabel,
  nodeTypeBadgeClass,
  decodeDenom,
  OPERATOR_STATUS_CONFIG,
  type OperatorStatus,
} from '../mesh'

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

  it('every status has an OPERATOR_STATUS_CONFIG entry', () => {
    const statuses: OperatorStatus[] = ['ACTIVE', 'INACTIVE', 'BELOW_MIN_STAKE']
    for (const s of statuses) {
      expect(OPERATOR_STATUS_CONFIG[s]?.className).toBeTruthy()
      expect(OPERATOR_STATUS_CONFIG[s]?.ariaLabel).toBeTruthy()
    }
  })
})

describe('nodeTypeLabel / nodeTypeBadgeClass', () => {
  it('maps known node types to labels', () => {
    expect(nodeTypeLabel('fan_in')).toBe('FAN IN')
    expect(nodeTypeLabel('fan_out')).toBe('FAN OUT')
    expect(nodeTypeLabel('token_weighting')).toBe('TOKEN WEIGHTING')
  })

  it('upper-cases unknown node types as a fallback label', () => {
    expect(nodeTypeLabel('mystery')).toBe('MYSTERY')
  })

  it('maps known node types to badge classes and unknown to a fallback', () => {
    expect(nodeTypeBadgeClass('fan_in')).toBe('node-type-fan-in')
    expect(nodeTypeBadgeClass('fan_out')).toBe('node-type-fan-out')
    expect(nodeTypeBadgeClass('token_weighting')).toBe('node-type-weighting')
    expect(nodeTypeBadgeClass('mystery')).toBe('node-type-unknown')
  })
})

describe('decodeDenom', () => {
  it('decodes left-aligned ASCII bytes32 to the symbol', () => {
    // bytes32("USDC") = 0x5553444300…00
    const usdc = ('0x55534443' + '0'.repeat(56)) as `0x${string}`
    expect(decodeDenom(usdc)).toBe('USDC')
  })

  it('returns (unknown) for an all-zero denom', () => {
    expect(decodeDenom(('0x' + '0'.repeat(64)) as `0x${string}`)).toBe('(unknown)')
  })

  it('falls back to a truncated hex chip for opaque hash denoms', () => {
    // A denom whose first byte is non-printable (0x01) is not ASCII-shaped.
    const hash = ('0x01' + 'ab'.repeat(31)) as `0x${string}`
    const out = decodeDenom(hash)
    expect(out).toContain('…')
    expect(out.startsWith('0x01ababab')).toBe(true)
  })
})
