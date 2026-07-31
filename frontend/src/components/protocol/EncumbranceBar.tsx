/**
 * EncumbranceBar — single horizontal meter visualizing the free / encumbered
 * split of a position. Uses bigint arithmetic so values never lose precision
 * via floats.
 *
 * Visuals are token-driven (no hex literals, no inline color styles). The
 * matching `.ds-encumbrance-bar*` rules live in `frontend/src/styles/tokens.css`
 * and are owned by Plan 23-03 — the component renders functionally correct
 * structure today, full styling lands alongside the broader vault tokens edit.
 */

export type EncumbranceBarSize = 'sm' | 'md'

export type EncumbranceBarProps = {
  /** Encumbered share/asset amount (locked by active commitments). */
  encumbered: bigint
  /** Total position (free + encumbered). When 0n, renders the NO POSITION empty state. */
  total: bigint
  /** Override the default `aria-label` ("Encumbrance"). */
  label?: string
  /** `md` (default) is 12px tall; `sm` is 8px (set on the track via tokens). */
  size?: EncumbranceBarSize
  className?: string
}

/**
 * Format a percent value (0–100, 2-decimal precision) to a fixed-2-decimal
 * string so the label reads `70.00%` consistently across all magnitudes.
 *
 * Internal — keeps the format inline rather than going through `formatPercent`
 * (basis points) because the percentages here are already computed from
 * bigint ratios and don't represent bps.
 */
function formatBarPercent(pct: number): string {
  return `${pct.toFixed(2)}%`
}

export function EncumbranceBar({
  encumbered,
  total,
  label,
  size = 'md',
  className,
}: EncumbranceBarProps) {
  const isEmpty = total === 0n

  // bigint-precise percentage with 2-decimal resolution. Rounded by the *100/100
  // truncation pattern so the meter value is integer-stable for valid inputs.
  const encPct = isEmpty ? 0 : Number((encumbered * 10000n) / total) / 100
  const freePct = isEmpty ? 0 : 100 - encPct

  const ariaValueNow = isEmpty ? 0 : Math.round(encPct)

  const root = ['ds-encumbrance-bar', className].filter(Boolean).join(' ')

  return (
    <div className={root} data-size={size}>
      <div className="ds-encumbrance-bar-label">
        {isEmpty
          ? 'NO POSITION'
          : `FREE: ${formatBarPercent(freePct)} · ENCUMBERED: ${formatBarPercent(encPct)}`}
      </div>
      <div
        role="meter"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={ariaValueNow}
        aria-label={label ?? 'Encumbrance'}
        className="ds-encumbrance-bar-track"
      >
        <div
          className="ds-encumbrance-bar-free"
          style={{ width: `${freePct}%` }}
          aria-hidden
        />
        <div
          className="ds-encumbrance-bar-encumbered"
          style={{ width: `${encPct}%` }}
          aria-hidden
        />
      </div>
    </div>
  )
}
