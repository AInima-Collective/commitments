import { useState } from 'react'
import { parseUnits } from 'viem'
import { formatTokenAmount } from '../lib/format'

/**
 * Decimal text to base units. `amount` is undefined for empty or unparseable
 * text; `invalid` is true for unparseable or negative text.
 */
export function parseAmount(text: string, decimals: number): { amount: bigint | undefined; invalid: boolean } {
  if (!text) return { amount: undefined, invalid: false }
  try {
    const amount = parseUnits(text.trim(), decimals)
    return amount < 0n ? { amount: undefined, invalid: true } : { amount, invalid: false }
  } catch {
    return { amount: undefined, invalid: true }
  }
}

/**
 * A token-amount text field, parsed at render against `decimals` so the
 * amount follows the token's decimals once they load.
 */
export function useAmountInput(decimals: number) {
  const [text, setText] = useState('')
  const { amount, invalid } = parseAmount(text, decimals)
  return {
    text,
    setText,
    amount,
    invalid,
    clear: () => setText(''),
    setMax: (value: bigint) => setText(formatTokenAmount(value, decimals).full),
  }
}
