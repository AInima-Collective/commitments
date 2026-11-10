import { describe, expect, it } from 'vitest'
import { parseAmount } from '../useAmountInput'

describe('parseAmount', () => {
  it('parses at the given decimals', () => {
    expect(parseAmount('1.5', 6)).toEqual({ amount: 1_500_000n, invalid: false })
    expect(parseAmount('0', 18)).toEqual({ amount: 0n, invalid: false })
  })
  it('treats empty text as no amount', () => {
    expect(parseAmount('', 18)).toEqual({ amount: undefined, invalid: false })
  })
  it('rejects unparseable and negative text', () => {
    expect(parseAmount('abc', 18)).toEqual({ amount: undefined, invalid: true })
    expect(parseAmount('-1', 18)).toEqual({ amount: undefined, invalid: true })
  })
})
