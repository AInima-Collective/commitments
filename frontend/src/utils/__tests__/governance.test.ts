import { describe, expect, it } from 'vitest'
import {
  proposalTitle,
  quorumProgressRatio,
  isPassing,
  isTerminal,
  compareProposalsForDisplay,
} from '../governance'

describe('proposalTitle', () => {
  it('uses the first non-empty line', () => {
    expect(proposalTitle('\n\n  Raise the cap  \nmore body')).toBe('Raise the cap')
  })

  it('strips a bracketed kind prefix', () => {
    expect(proposalTitle('[Weight] Rebalance USDC')).toBe('Rebalance USDC')
  })

  it('truncates titles longer than 80 chars with an ellipsis', () => {
    const out = proposalTitle('x'.repeat(100))
    expect(out).toHaveLength(78) // 77 chars + ellipsis
    expect(out.endsWith('…')).toBe(true)
  })
})

describe('quorumProgressRatio', () => {
  it('returns 0 for a null or zero target', () => {
    expect(quorumProgressRatio(10n, 5n, null)).toBe(0)
    expect(quorumProgressRatio(10n, 5n, 0n)).toBe(0)
  })

  it('sums for + abstain over the target', () => {
    expect(quorumProgressRatio(30n, 10n, 100n)).toBeCloseTo(0.4)
  })
})

describe('isPassing', () => {
  it('passes when quorum is met and for > against', () => {
    expect(isPassing(70n, 10n, 30n, 100n)).toBe(true) // 100 >= 100 quorum, 70 > 10
  })

  it('fails when quorum is not met even with a majority', () => {
    expect(isPassing(60n, 10n, 20n, 100n)).toBe(false) // 80 < 100
  })

  it('fails when against >= for even with quorum', () => {
    expect(isPassing(40n, 40n, 60n, 100n)).toBe(false)
  })

  it('treats a null target as quorum-met', () => {
    expect(isPassing(2n, 1n, 0n, null)).toBe(true)
  })
})

describe('isTerminal', () => {
  it('flags terminal states', () => {
    for (const s of ['executed', 'canceled', 'expired', 'defeated']) {
      expect(isTerminal(s)).toBe(true)
    }
  })

  it('does not flag in-flight states', () => {
    for (const s of ['active', 'pending', 'queued', 'succeeded']) {
      expect(isTerminal(s)).toBe(false)
    }
  })
})

describe('compareProposalsForDisplay', () => {
  it('orders by state priority (active before executed)', () => {
    const a = { state: 'active', createdBlock: '1' }
    const b = { state: 'executed', createdBlock: '999' }
    expect(compareProposalsForDisplay(a, b)).toBeLessThan(0)
  })

  it('breaks ties by createdBlock DESC', () => {
    const a = { state: 'active', createdBlock: '10' }
    const b = { state: 'active', createdBlock: '20' }
    expect(compareProposalsForDisplay(a, b)).toBeGreaterThan(0)
  })

  it('sorts unknown states last', () => {
    const known = { state: 'active', createdBlock: '1' }
    const unknown = { state: 'mystery', createdBlock: '999' }
    expect(compareProposalsForDisplay(known, unknown)).toBeLessThan(0)
  })
})
