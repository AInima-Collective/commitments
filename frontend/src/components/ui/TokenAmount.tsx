import { formatTokenAmount } from '../../lib/format'
import { TokenIcon, type TokenIconSize } from './TokenIcon'

export type TokenAmountSize = 'inline' | 'default' | 'display'

export type TokenAmountProps = {
  amount: bigint
  decimals: number
  symbol?: string
  size?: TokenAmountSize
  /** K/M/B abbreviation when ≥ 10,000 units. Falls back to full formatting below the threshold. */
  compact?: boolean
  /** Max fractional digits before trailing-zero stripping. Default 4. */
  precision?: number
  /** Mute the trailing decimals so the integer part leads. Default true at size='display'. */
  dimFraction?: boolean
  /** Render a leading TokenIcon. Requires `symbol`. Icon size scales with amount size. */
  withIcon?: boolean
  /** Override the icon source URL. Falls back to bundled registry / monogram if omitted. */
  iconSrc?: string
  className?: string
  /** Override the always-on full-precision tooltip. */
  title?: string
}

const ICON_SIZE_FOR_AMOUNT: Record<TokenAmountSize, TokenIconSize> = {
  inline: 'sm',
  default: 'md',
  display: 'lg',
}

/**
 * Canonical token amount renderer.
 *
 * The integer and fraction render in separate spans so display-size variants
 * can dim the trailing decimals while keeping the integer prominent.
 *
 * The `title` attribute always carries full-precision so users can hover any
 * truncated/compacted amount and inspect the canonical value — the killer-feature
 * absent from most DeFi UIs.
 */
export function TokenAmount({
  amount,
  decimals,
  symbol,
  size = 'default',
  compact = false,
  precision,
  dimFraction,
  withIcon = false,
  iconSrc,
  className,
  title,
}: TokenAmountProps) {
  const parts = formatTokenAmount(amount, decimals, { compact, precision })
  const sizeClass =
    size === 'inline' ? 'ds-amount--inline' : size === 'display' ? 'ds-amount--display' : ''
  const rootClass = ['ds-amount', sizeClass, className].filter(Boolean).join(' ')

  const icon =
    withIcon && symbol ? (
      <TokenIcon symbol={symbol} src={iconSrc} size={ICON_SIZE_FOR_AMOUNT[size]} className="ds-amount-icon" />
    ) : null

  if (amount === 0n) {
    return (
      <span className={`${rootClass} ds-amount--empty`} title={title ?? `0${symbol ? ` ${symbol}` : ''}`}>
        {icon}
        <span className="ds-amount-empty">—</span>
        {symbol && <span className="ds-amount-symbol">{symbol}</span>}
      </span>
    )
  }

  const fullTitle = title ?? `${parts.full}${symbol ? ` ${symbol}` : ''}`
  const dim = dimFraction ?? size === 'display'

  if (parts.compact) {
    return (
      <span className={rootClass} title={fullTitle}>
        {icon}
        <span className="ds-amount-int">{parts.compact}</span>
        {symbol && <span className="ds-amount-symbol">{symbol}</span>}
      </span>
    )
  }

  return (
    <span className={rootClass} title={fullTitle}>
      {icon}
      <span className="ds-amount-int">{parts.int}</span>
      {parts.fraction && (
        <span className={`ds-amount-fraction${dim ? ' ds-amount-fraction--dim' : ''}`}>
          {parts.fraction}
        </span>
      )}
      {symbol && <span className="ds-amount-symbol">{symbol}</span>}
    </span>
  )
}
