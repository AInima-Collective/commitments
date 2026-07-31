import { describe, expect, it } from 'vitest'
import {
  formatCompact,
  formatTokenAmount,
  formatPercent,
  formatDuration,
  truncateAddress,
} from '../format'

describe('formatCompact', () => {
  it('returns null for zero', () => {
    expect(formatCompact(0n)).toBeNull()
  })

  it('returns null below the 10_000 threshold', () => {
    expect(formatCompact(9_999n)).toBeNull()
    expect(formatCompact(1n)).toBeNull()
    expect(formatCompact(-9_999n)).toBeNull()
  })

  it.each([
    [10_000n, '10K'],
    [12_400n, '12.4K'],
    [4_221_000n, '4.22M'],
    [1_500_000_000n, '1.5B'],
    [2_000_000_000_000n, '2T'],
  ])('compacts %s to %s', (input, expected) => {
    expect(formatCompact(input)).toBe(expected)
  })

  it('preserves negative sign', () => {
    expect(formatCompact(-12_400n)).toBe('-12.4K')
    expect(formatCompact(-4_221_000n)).toBe('-4.22M')
  })

  it('accepts a number and coerces via Math.trunc', () => {
    expect(formatCompact(12_400)).toBe('12.4K')
    expect(formatCompact(12_400.7)).toBe('12.4K')
    expect(formatCompact(9_999)).toBeNull()
  })

  it('strips trailing zeros in the decimal portion', () => {
    // 10_000 / 1_000 → 10.00 → trailing zeros stripped → "10K"
    expect(formatCompact(10_000n)).toBe('10K')
    // 100_000 / 1_000 = 100, no fractional remainder → "100K"
    expect(formatCompact(100_000n)).toBe('100K')
    // 1_500_000 / 1_000_000 = 1.5 → "1.5M"
    expect(formatCompact(1_500_000n)).toBe('1.5M')
  })
})

describe('formatTokenAmount', () => {
  it('returns zero parts for amount 0n', () => {
    const parts = formatTokenAmount(0n, 18)
    expect(parts).toEqual({ int: '0', fraction: '', full: '0' })
  })

  it('formats sub-unit values with leading zero', () => {
    // 1234567 wei at 18 decimals = 0.000000000001234567
    const parts = formatTokenAmount(1_234_567n, 18, { precision: 8 })
    expect(parts.int).toBe('0')
    expect(parts.full).toBe('0.000000000001234567')
  })

  it('comma-groups the integer portion', () => {
    // 1247.328573291847562 × 10^18 → integer 1247, fraction .328573291847562
    const amount = 1_247_328_573_291_847_562_000n
    const parts = formatTokenAmount(amount, 18)
    expect(parts.int).toBe('1,247')
    expect(parts.fraction).toBe('.3285')
    expect(parts.full).toBe('1247.328573291847562')
  })

  it('strips trailing zeros from the fraction', () => {
    // 12.4000... should render fraction as ".4"
    const amount = 12_400_000_000_000_000_000n // 12.4 * 10^18
    const parts = formatTokenAmount(amount, 18)
    expect(parts.int).toBe('12')
    expect(parts.fraction).toBe('.4')
  })

  it('honors precision option', () => {
    const amount = 1_234567890123456789n // 1.234567890123456789
    const parts = formatTokenAmount(amount, 18, { precision: 2 })
    expect(parts.fraction).toBe('.23')
  })

  it('produces empty fraction when fully truncated to zero', () => {
    // 1.00009 with precision 2 → .00 → trimmed to empty
    const amount = 1_000_000_000_000_090_000n // 1.00000000000009
    const parts = formatTokenAmount(amount, 18, { precision: 2 })
    expect(parts.fraction).toBe('')
  })

  it('emits compact when above threshold', () => {
    // 12_500 * 10^18 → integer magnitude 12500 → "12.5K"
    const amount = 12_500_000_000_000_000_000_000n
    const parts = formatTokenAmount(amount, 18, { compact: true })
    expect(parts.compact).toBe('12.5K')
  })

  it('does not emit compact below the threshold', () => {
    // 9_999 * 10^18
    const amount = 9_999_000_000_000_000_000_000n
    const parts = formatTokenAmount(amount, 18, { compact: true })
    expect(parts.compact).toBeUndefined()
  })

  it('handles MAX_UINT-class values without overflow', () => {
    const amount = (1n << 256n) - 1n
    const parts = formatTokenAmount(amount, 18)
    // The integer portion still parses; just verify it doesn't throw.
    expect(parts.full.length).toBeGreaterThan(0)
    expect(parts.int.length).toBeGreaterThan(0)
  })
})

describe('formatPercent', () => {
  it('renders 5000 bps as 50.00%', () => {
    expect(formatPercent(5000)).toBe('50.00%')
  })

  it('honors precision', () => {
    expect(formatPercent(1234, { precision: 1 })).toBe('12.3%')
  })

  it('handles 0n', () => {
    expect(formatPercent(0n)).toBe('0.00%')
  })

  it('accepts bigint inputs', () => {
    expect(formatPercent(2_500n)).toBe('25.00%')
  })

  it('renders 100% at 10_000 bps', () => {
    expect(formatPercent(10_000)).toBe('100.00%')
  })

  it('precision 0 rounds to whole percent', () => {
    expect(formatPercent(1234, { precision: 0 })).toBe('12%')
  })
})

describe('truncateAddress', () => {
  it('middle-truncates a full 0x address with default lead/tail', () => {
    expect(truncateAddress('0xabcdef0123456789abcdef0123456789abcdef01')).toBe(
      '0xabcd\u2026ef01',
    )
  })

  it('returns the input unchanged when below the lead+tail+1 threshold', () => {
    expect(truncateAddress('0xshort')).toBe('0xshort')
  })

  it('respects custom lead and tail', () => {
    expect(
      truncateAddress('0xabcdef0123456789abcdef0123456789abcdef01', 8, 6),
    ).toBe('0xabcdef\u2026cdef01')
  })
})

describe('formatDuration', () => {
  it.each([
    [0, '0s'],
    [59, '59s'],
    [60, '1m'],
    [3_600, '1h'],
    [90_000, '1d 1h'],
    [86_400 * 9, '9d'],
  ])('formats %s seconds as %s', (input, expected) => {
    expect(formatDuration(input)).toBe(expected)
  })

  it('clamps negatives to 0s', () => {
    expect(formatDuration(-30)).toBe('0s')
  })

  it('renders mixed minute/hour for values under a day', () => {
    expect(formatDuration(3_660)).toBe('1h 1m')
    expect(formatDuration(3_900)).toBe('1h 5m')
  })

  it('truncates fractional seconds', () => {
    expect(formatDuration(59.9)).toBe('59s')
  })
})
