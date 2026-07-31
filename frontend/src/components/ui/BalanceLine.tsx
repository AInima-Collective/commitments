import { TokenAmount } from './TokenAmount'

export interface BalanceLineProps {
  amount: bigint
  decimals: number
  symbol: string
  label?: string
  onMax?: () => void
  maxDisabled?: boolean
}

export function BalanceLine({
  amount,
  decimals,
  symbol,
  label = 'Balance',
  onMax,
  maxDisabled,
}: BalanceLineProps) {
  return (
    <span className="ds-balance">
      <span className="ds-balance-label">{label}</span>
      <span className="ds-balance-value">
        <TokenAmount amount={amount} decimals={decimals} symbol={symbol} size="inline" />
      </span>
      {onMax && (
        <button type="button" className="ds-balance-max" onClick={onMax} disabled={maxDisabled}>
          MAX
        </button>
      )}
    </span>
  )
}
