export type ApyMeterTone = 'neutral' | 'info' | 'success' | 'warn' | 'danger'
export type ApyMeterSize = 'sm' | 'md' | 'lg'

export interface ApySource {
  label: string
  /** APY contribution expressed as a decimal fraction (0.0432 → 4.32%). */
  apy: number
  tone?: ApyMeterTone
  /** Optional explanatory subtitle (e.g. "Aave wstETH supply"). */
  detail?: string
}

export interface ApyMeterProps {
  /** Total APY as a decimal fraction. If omitted, the sum of `sources` is used. */
  total?: number
  /** Yield decomposition (base + boosts + incentives, etc.). */
  sources: ApySource[]
  /** Optional trailing-period delta in absolute APY points (0.0034 → +0.34pp). */
  delta?: number
  /** Optional period label paired with `delta` (e.g. "30d", "7d"). */
  period?: string
  /** Optional caller-supplied formatter (default: x100 with 2 decimals + %). */
  format?: (apy: number) => string
  /** Layout density. `lg` displays the headline at 2xl. */
  size?: ApyMeterSize
  /** Optional caption rendered under the legend (e.g. "net of fees"). */
  caption?: string
}

const DEFAULT_FORMAT = (apy: number) => `${(apy * 100).toFixed(2)}%`

/**
 * ApyMeter — headline yield read-out for a DeFi vault.
 *
 * Combines a focal APY display, a stacked decomposition bar (one segment per
 * source), a trailing-period delta tag, and a labelled legend.
 *
 * Pure presentation primitive. Caller passes an array of sources — the
 * component never assumes a particular yield model (lending, LP fees, vAMM
 * incentives, restaking, …). Compose vault-specific wrappers in
 * `components/protocol/` or feature folders.
 */
export function ApyMeter({
  total,
  sources,
  delta,
  period,
  format = DEFAULT_FORMAT,
  size = 'md',
  caption,
}: ApyMeterProps) {
  const sum = sources.reduce((acc, s) => acc + s.apy, 0)
  const headline = total ?? sum
  const denom = sum === 0 ? 1 : sum
  const deltaSign = delta == null ? null : delta === 0 ? 'zero' : delta > 0 ? 'positive' : 'negative'
  const deltaTone =
    deltaSign === 'positive' ? 'success' : deltaSign === 'negative' ? 'danger' : 'neutral'

  return (
    <div className="ds-apy-meter" data-size={size}>
      <div className="ds-apy-meter-head">
        <div className="ds-apy-meter-headline">
          <span className="ds-apy-meter-label">apy</span>
          <span
            className="ds-apy-meter-value ds-mono-num"
            title={`${(headline * 100).toFixed(6)}%`}
          >
            {format(headline)}
          </span>
        </div>
        {delta != null && (
          <span
            className="ds-apy-meter-delta"
            data-tone={deltaTone}
            title={`${(delta * 100).toFixed(6)}pp${period ? ` over ${period}` : ''}`}
          >
            <span className="ds-apy-meter-delta-arrow" aria-hidden="true">
              {deltaSign === 'positive' ? '↑' : deltaSign === 'negative' ? '↓' : '·'}
            </span>
            <span className="ds-mono-num">
              {delta >= 0 ? '+' : '−'}
              {Math.abs(delta * 100).toFixed(2)}pp
            </span>
            {period && <span className="ds-subtle"> · {period}</span>}
          </span>
        )}
      </div>

      <div
        className="ds-apy-meter-track"
        role="img"
        aria-label={`yield decomposition · ${format(headline)}`}
      >
        {sources.map((s, i) => (
          <div
            key={`${i}-${s.label}`}
            className="ds-apy-meter-fill"
            data-tone={s.tone ?? (i === 0 ? 'info' : i === 1 ? 'success' : 'neutral')}
            style={{ width: `${(s.apy / denom) * 100}%` }}
            title={`${s.label}: ${(s.apy * 100).toFixed(4)}%`}
          />
        ))}
      </div>

      <ul className="ds-apy-meter-legend">
        {sources.map((s, i) => (
          <li key={`${i}-${s.label}`} className="ds-apy-meter-legend-item">
            <span
              className="ds-apy-meter-legend-dot"
              data-tone={s.tone ?? (i === 0 ? 'info' : i === 1 ? 'success' : 'neutral')}
              aria-hidden="true"
            />
            <span className="ds-apy-meter-legend-label">{s.label}</span>
            <span
              className="ds-apy-meter-legend-value ds-mono-num"
              title={`${(s.apy * 100).toFixed(6)}%`}
            >
              {format(s.apy)}
            </span>
            {s.detail && <span className="ds-apy-meter-legend-detail">{s.detail}</span>}
          </li>
        ))}
      </ul>

      {caption && <p className="ds-apy-meter-caption">{caption}</p>}
    </div>
  )
}
