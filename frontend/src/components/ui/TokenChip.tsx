import { TokenIcon } from './TokenIcon'

export interface TokenChipProps {
  symbol: string
  src?: string
}

export function TokenChip({ symbol, src }: TokenChipProps) {
  return (
    <span className="ds-token-chip">
      <TokenIcon symbol={symbol} src={src} size="sm" />
      {symbol}
    </span>
  )
}
