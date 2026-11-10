import { describe, expect, it } from 'vitest'
import {
  proposalTitle,
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
