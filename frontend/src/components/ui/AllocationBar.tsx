import { TokenAmount } from './TokenAmount'

export type AllocationTone = 'success' | 'warn' | 'danger' | 'accent' | 'muted'

export interface AllocationSegment {
  label: string
  value: bigint
  tone: AllocationTone
}

export interface AllocationBarProps {
  segments: AllocationSegment[]
  total: bigint
  decimals: number
  symbol: string
  /** Compact the legend amounts (e.g. 6.45B) for large/raw-unit values. */
  compact?: boolean
}

export function AllocationBar({ segments, total, decimals, symbol, compact = false }: AllocationBarProps) {
  const totalNum = Number(total)
  const pct = (v: bigint) => (totalNum === 0 ? 0 : (Number(v) / totalNum) * 100)
  return (
    <div className="ds-allocation-bar">
      <div className="ds-allocation-bar-track" role="img" aria-label="allocation">
        {segments.map((s) => (
          <div
            key={s.label}
            className="ds-allocation-bar-fill"
            data-tone={s.tone}
            style={{ width: `${pct(s.value)}%` }}
            title={`${s.label}: ${pct(s.value).toFixed(1)}%`}
          />
        ))}
      </div>
      <div className="ds-allocation-bar-legend">
        {segments.map((s) => (
          <span key={s.label} className="ds-allocation-bar-legend-item">
            <span className="ds-allocation-bar-legend-dot" data-tone={s.tone} />
            <span>{s.label}</span>
            <TokenAmount amount={s.value} decimals={decimals} symbol={symbol} compact={compact} size="inline" />
            <span className="ds-subtle">({pct(s.value).toFixed(1)}%)</span>
          </span>
        ))}
      </div>
    </div>
  )
}
