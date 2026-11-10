import { formatTokenAmount } from '../../lib/format'

export type UsdAmountSize = 'inline' | 'default' | 'display'

export interface UsdAmountProps {
  /** USD-denominated bigint with 6 decimals of precision (USDC-shape).
   *  Pass `null` to render the explicit "PRICE UNAVAILABLE" empty state. */
  amount: bigint | null
  size?: UsdAmountSize
  /** K/M/B abbreviation when ≥ $10,000. */
  compact?: boolean
  /** Cents-precision rendering. Default 2; pass 0 for whole-dollar headlines. */
  precision?: 0 | 2 | 4
  /** Mute the cents segment so the dollar integer leads. Default true at size='display'. */
  dimFraction?: boolean
  /** Override the always-on full-precision tooltip. */
  title?: string
  className?: string
}

const USD_DECIMALS = 6

/**
 * UsdAmount — canonical USD value renderer.
 *
 * Mirrors `TokenAmount`'s structural slots so the two read identically when
 * stacked (e.g. "$1,234.56" headline + "12.4 shares" secondary). Uses the
 * same `.ds-amount` class family — values land in the design-system surface
 * without bespoke USD CSS.
 *
 * Pass `amount={null}` to render the explicit
 * "PRICE UNAVAILABLE" path. The full-precision tooltip always carries the
 * canonical underlying value so any rounded display remains inspectable.
 */
export function UsdAmount({
  amount,
  size = 'default',
  compact = false,
  precision = 2,
  dimFraction,
  title,
  className,
}: UsdAmountProps) {
  const sizeClass =
    size === 'inline' ? 'ds-amount--inline' : size === 'display' ? 'ds-amount--display' : ''
  const rootClass = ['ds-amount', sizeClass, className].filter(Boolean).join(' ')

  if (amount === null) {
    return (
      <span className={`${rootClass} ds-amount--empty`} title={title ?? 'Price unavailable'}>
        <span className="ds-amount-symbol">$</span>
        <span className="ds-amount-empty">—</span>
      </span>
    )
  }

  const parts = formatTokenAmount(amount, USD_DECIMALS, { compact, precision })
  const fullTitle = title ?? `$${parts.full}`
  const dim = dimFraction ?? size === 'display'

  if (parts.compact) {
    return (
      <span className={rootClass} title={fullTitle}>
        <span className="ds-amount-symbol">$</span>
        <span className="ds-amount-int">{parts.compact}</span>
      </span>
    )
  }

  if (amount === 0n) {
    return (
      <span className={`${rootClass} ds-amount--empty`} title={fullTitle}>
        <span className="ds-amount-symbol">$</span>
        <span className="ds-amount-int">0</span>
        {precision > 0 && <span className="ds-amount-fraction ds-amount-fraction--dim">.00</span>}
      </span>
    )
  }

  // Pad the cents to exactly `precision` digits so $1.5 reads as $1.50 (USD
  // convention overrides the trailing-zero strip from formatTokenAmount).
  const fracDigits = parts.fraction.startsWith('.') ? parts.fraction.slice(1) : ''
  const paddedFrac =
    precision > 0 ? `.${(fracDigits + '0'.repeat(precision)).slice(0, precision)}` : ''

  return (
    <span className={rootClass} title={fullTitle}>
      <span className="ds-amount-symbol">$</span>
      <span className="ds-amount-int">{parts.int}</span>
      {paddedFrac && (
        <span className={`ds-amount-fraction${dim ? ' ds-amount-fraction--dim' : ''}`}>
          {paddedFrac}
        </span>
      )}
    </span>
  )
}
