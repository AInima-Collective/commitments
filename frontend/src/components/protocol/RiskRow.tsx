import { formatPercent } from '../../lib/format'
import { riskTier } from '../../utils/risk'

export interface RiskRowProps {
  bps: number
  label: string
}

export function RiskRow({ bps, label }: RiskRowProps) {
  const tier = riskTier(bps)
  const dotClass =
    tier === 'success' ? 'ds-risk-dot--low' : tier === 'warn' ? 'ds-risk-dot--medium' : 'ds-risk-dot--high'
  const tierLabel = tier === 'success' ? 'low' : tier === 'warn' ? 'medium' : 'high'
  return (
    <span className="ds-row ds-row-2 ds-text-sm">
      <span className={`ds-risk-dot ${dotClass}`} aria-hidden />
      <span className="ds-mono-num">{formatPercent(bps)}</span>
      <span className="ds-subtle">· {label} · {tierLabel} risk</span>
    </span>
  )
}
