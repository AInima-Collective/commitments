import { TokenAmount } from './TokenAmount'

export type SettlementBarTone = 'neutral' | 'info' | 'success' | 'warn' | 'danger'

export interface SettlementBarDirection {
  /** Display label for this direction (e.g. "proposer → acceptor"). */
  label: string
  /** Lifetime cap on this direction (set at proposal time). */
  cap: bigint
  /** Cumulative flow to date in this direction. */
  cumulative: bigint
}

export interface SettlementBarProps {
  /** The two directions of an agreement's bilateral flow. */
  directions: [SettlementBarDirection, SettlementBarDirection]
  /** Token decimals (vault share decimals). */
  decimals: number
  /** Token symbol for the legend. */
  symbol: string
  /** Tone driver: defaults to `info`. */
  tone?: SettlementBarTone
}

/**
 * v2.5 SettlementBar — two stacked progress bars (one per direction) showing
 * cumulative-vs-cap. Settle-disabled directions (cap == 0) render a neutral
 * "disabled" track.
 *
 * Follows the design-system contract:
 *  - composition over configuration (caller passes pre-computed directions)
 *  - `tone` vocabulary; `data-tone` on each fill
 *  - full-precision `title` on the bar fills (cumulative + cap)
 *  - styles via `var(--…)` tokens only
 */
export function SettlementBar({ directions, decimals, symbol, tone = 'info' }: SettlementBarProps) {
  return (
    <div className="ds-settlement-bar">
      {directions.map((dir, i) => {
        const disabled = dir.cap === 0n
        const pct = disabled ? 0 : Math.min(100, (Number(dir.cumulative) / Number(dir.cap)) * 100)
        return (
          <div key={`${dir.label}-${i}`} className="ds-settlement-bar-row">
            <span className="ds-settlement-bar-label">{dir.label}</span>
            <div
              className="ds-settlement-bar-track"
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={Number(dir.cap)}
              aria-valuenow={Number(dir.cumulative)}
              aria-label={dir.label}
            >
              <div
                className="ds-settlement-bar-fill"
                data-tone={tone}
                data-disabled={disabled ? 'true' : 'false'}
                style={{ width: `${pct}%` }}
                title={
                  disabled
                    ? `${dir.label}: settle disabled (cap = 0)`
                    : `${dir.label}: ${dir.cumulative.toString()} / ${dir.cap.toString()} shares (${pct.toFixed(1)}%)`
                }
              />
            </div>
            <span className="ds-settlement-bar-value">
              {disabled ? (
                <span className="ds-subtle">disabled</span>
              ) : (
                <>
                  <TokenAmount amount={dir.cumulative} decimals={decimals} symbol={symbol} size="inline" />
                  <span className="ds-subtle"> / </span>
                  <TokenAmount amount={dir.cap} decimals={decimals} symbol={symbol} size="inline" />
                </>
              )}
            </span>
          </div>
        )
      })}
    </div>
  )
}
