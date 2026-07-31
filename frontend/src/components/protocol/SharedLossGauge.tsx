import { formatLambdaPercentFull, lambdaToFraction } from '../../lib/format'
import { HealthGauge, StatBlock } from '../ui'

export type SharedLossGaugeSize = 'sm' | 'md' | 'lg'

export interface SharedLossGaugeProps {
  /** Lambda — the mutual's cumulative loss FRACTION, 1e18-scaled (0 ≤ Λ ≤ 1e18). */
  cumulativeLoss: bigint
  /**
   * Optional member loss snapshot (1e18-scaled). Rendered as a hairline tick on
   * the gauge — the member only owes the loss share accrued since this point
   * (Λ − snapshot), so the gap between the tick and the live Λ is what's owed.
   */
  memberSnapshot?: bigint
  /** Row label above the gauge. Defaults to "cumulative loss share". */
  label?: string
  /** Caption below the gauge. */
  caption?: string
  /** Render the headline percentage StatBlock alongside the gauge. Default true. */
  showStat?: boolean
  size?: SharedLossGaugeSize
}

/**
 * SharedLossGauge — renders a Mutual's Lambda (cumulative loss fraction)
 * as a cumulative loss-share percentage, optionally highlighting a member's loss
 * snapshot so the unsettled gap (Λ − snapshot) reads at a glance.
 *
 * Protocol-layer wrapper over the generic {@link HealthGauge}: it knows the
 * Lambda semantics (1e18 fixed point, monotonic, capped at 1e18) but defers all
 * visuals to the gauge. The visible percentage is rounded to 2 decimals; the
 * canonical full-precision value is always surfaced via `title=` on the
 * headline StatBlock value (design contract rule 4).
 */
export function SharedLossGauge({
  cumulativeLoss,
  memberSnapshot,
  label = 'cumulative loss share',
  caption,
  showStat = true,
  size = 'md',
}: SharedLossGaugeProps) {
  const lambdaPct = lambdaToFraction(cumulativeLoss) * 100
  const snapshotPct = memberSnapshot !== undefined ? lambdaToFraction(memberSnapshot) * 100 : undefined
  const lambdaFull = formatLambdaPercentFull(cumulativeLoss)
  const snapshotFull = memberSnapshot !== undefined ? formatLambdaPercentFull(memberSnapshot) : undefined

  const owedPct = snapshotPct !== undefined ? Math.max(0, lambdaPct - snapshotPct) : undefined
  const defaultCaption =
    snapshotPct !== undefined
      ? `Your snapshot sits at ${snapshotPct.toFixed(2)}% — you owe the ${(owedPct ?? 0).toFixed(2)}% accrued since.`
      : 'Cumulative loss applied across the mutual. Monotonic — it only ever rises, never retroactive past your join.'

  return (
    <div className="ds-stack ds-stack-3" data-size={size}>
      {showStat && (
        <StatBlock
          label={label}
          value={<span title={lambdaFull}>{lambdaPct.toFixed(2)}%</span>}
          tone={lambdaPct >= 50 ? 'negative' : 'neutral'}
          meta={
            snapshotPct !== undefined ? (
              <span title={snapshotFull}>snapshot {snapshotPct.toFixed(2)}%</span>
            ) : undefined
          }
        />
      )}
      <HealthGauge
        value={lambdaPct}
        min={0}
        max={100}
        target={snapshotPct}
        ariaLabel={label}
        label={label}
        caption={caption ?? defaultCaption}
        format={(n) => `${n.toFixed(2)}%`}
        zones={[
          { to: 10, tone: 'success' },
          { to: 50, tone: 'warn' },
          { to: 100, tone: 'danger', label: '100%' },
        ]}
        size={size}
      />
    </div>
  )
}
