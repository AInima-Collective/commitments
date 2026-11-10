import { CapacityMeter, StatBlock, TokenAmount } from '../ui'

interface SettlementProgressProps {
  /** Members already settled to the beneficiary. */
  settledCount: number
  /** Total members exposed to the active loss. */
  totalCount: number
  /** Numeraire units actually collected by the beneficiary so far. */
  collected: bigint
  /** Numeraire units declared by the executed loss (the settlement target). */
  declared: bigint
  decimals: number
  symbol: string
}

/**
 * SettlementProgress — "X of N settled" plus value collected vs declared for a
 * mutual whose loss has executed. Feature-shaped composition of the StatBlock +
 * CapacityMeter primitives.
 */
export function SettlementProgress({
  settledCount,
  totalCount,
  collected,
  declared,
  decimals,
  symbol,
}: SettlementProgressProps) {
  const remaining = declared > collected ? declared - collected : 0n
  return (
    <div className="ds-stack ds-stack-3">
      <div className="ds-stat-grid">
        <StatBlock
          label="members settled"
          value={`${settledCount} / ${totalCount}`}
          tone={totalCount > 0 && settledCount >= totalCount ? 'success' : 'neutral'}
        />
        <StatBlock
          label="collected"
          value={<TokenAmount amount={collected} decimals={decimals} symbol={symbol} compact />}
        />
        <StatBlock
          label="declared loss"
          value={<TokenAmount amount={declared} decimals={decimals} symbol={symbol} compact />}
        />
        <StatBlock
          label="outstanding"
          value={<TokenAmount amount={remaining} decimals={decimals} symbol={symbol} compact />}
          tone={remaining > 0n ? 'danger' : 'success'}
        />
      </div>
      <CapacityMeter
        label="settled / declared"
        filled={collected}
        cap={declared}
        decimals={decimals}
        symbol={symbol}
        tone={declared > 0n && collected >= declared ? 'success' : 'info'}
      />
    </div>
  )
}
