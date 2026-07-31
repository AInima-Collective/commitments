import { TokenAmount } from './TokenAmount'

export type CapacityMeterTone = 'neutral' | 'info' | 'success' | 'warn' | 'danger'
export type CapacityMeterSize = 'sm' | 'md' | 'lg'

export interface CapacityMeterProps {
  /** Currently deposited balance (in raw asset units). */
  filled: bigint
  /** Hard deposit cap (in raw asset units). */
  cap: bigint
  /** Token decimals for the asset. */
  decimals: number
  /** Token symbol shown in the legend. */
  symbol: string
  /** Optional soft cap — rendered as a hairline tick on the track (e.g. a
   * deposit-pause threshold or guardian-flag trigger). */
  softCap?: bigint
  /** Number of segments in the stepped bar (default 24). */
  segments?: number
  /** Optional tone override. If omitted, the tone is computed from the fill
   * ratio: <70% info, 70–90% warn, ≥90% danger. */
  tone?: CapacityMeterTone
  /** Optional caller-supplied label (e.g. "deposit cap", "buffer remaining"). */
  label?: string
  size?: CapacityMeterSize
}

function computeAutoTone(ratio: number): CapacityMeterTone {
  if (ratio >= 0.9) return 'danger'
  if (ratio >= 0.7) return 'warn'
  return 'info'
}

/**
 * CapacityMeter — stepped utilization bar for a DeFi vault's deposit cap.
 *
 * Renders a fixed number of segments (default 24, like a mini battery) that
 * fill in proportion to `filled / cap`. A hairline tick renders the soft cap
 * if supplied. Above the bar the legend reports the deposited and cap values
 * in canonical token-amount form; below, the percentage and remaining buffer.
 *
 * Pure UI primitive — no protocol knowledge. Composable into vault hero
 * cards, marketplace rows, and operator dashboards.
 */
export function CapacityMeter({
  filled,
  cap,
  decimals,
  symbol,
  softCap,
  segments = 24,
  tone,
  label,
  size = 'md',
}: CapacityMeterProps) {
  const denom = cap === 0n ? 1n : cap
  const ratio = Number(filled) / Number(denom)
  const clampRatio = Math.max(0, Math.min(1, ratio))
  const filledSegments = Math.round(clampRatio * segments)
  const softCapPct = softCap != null && cap > 0n ? (Number(softCap) / Number(denom)) * 100 : null
  const resolvedTone = tone ?? computeAutoTone(clampRatio)
  const remaining = filled >= cap ? 0n : cap - filled

  return (
    <div className="ds-capacity-meter" data-size={size} data-tone={resolvedTone}>
      <div className="ds-capacity-meter-head">
        <span className="ds-capacity-meter-label">{label ?? 'capacity'}</span>
        <span className="ds-capacity-meter-pct ds-mono-num" title={`${(ratio * 100).toFixed(6)}%`}>
          {(clampRatio * 100).toFixed(1)}%
        </span>
      </div>

      <div
        className="ds-capacity-meter-track"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={Number(cap)}
        aria-valuenow={Number(filled)}
        aria-label={label ?? 'capacity'}
      >
        {Array.from({ length: segments }, (_, i) => (
          <span
            key={i}
            className="ds-capacity-meter-segment"
            data-filled={i < filledSegments ? 'true' : 'false'}
            data-tone={resolvedTone}
          />
        ))}
        {softCapPct != null && softCapPct < 100 && softCapPct > 0 && (
          <span
            className="ds-capacity-meter-soft-cap"
            style={{ left: `${softCapPct}%` }}
            title={`soft cap`}
            aria-hidden="true"
          />
        )}
      </div>

      <div className="ds-capacity-meter-foot">
        <span className="ds-capacity-meter-foot-line">
          <span className="ds-subtle">filled</span>
          <TokenAmount amount={filled} decimals={decimals} symbol={symbol} compact size="inline" />
        </span>
        <span className="ds-capacity-meter-foot-line">
          <span className="ds-subtle">cap</span>
          <TokenAmount amount={cap} decimals={decimals} symbol={symbol} compact size="inline" />
        </span>
        <span className="ds-capacity-meter-foot-line">
          <span className="ds-subtle">free</span>
          <TokenAmount
            amount={remaining}
            decimals={decimals}
            symbol={symbol}
            compact
            size="inline"
          />
        </span>
        {softCap != null && (
          <span className="ds-capacity-meter-foot-line">
            <span className="ds-subtle">soft</span>
            <TokenAmount
              amount={softCap}
              decimals={decimals}
              symbol={symbol}
              compact
              size="inline"
            />
          </span>
        )}
      </div>
    </div>
  )
}
