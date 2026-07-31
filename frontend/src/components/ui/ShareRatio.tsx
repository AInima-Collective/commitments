import { TokenAmount } from './TokenAmount'

export interface ShareRatioProps {
  shares: bigint
  assets: bigint
  shareSymbol: string
  assetSymbol: string
  decimals: number
}

export function ShareRatio({
  shares,
  assets,
  shareSymbol,
  assetSymbol,
  decimals,
}: ShareRatioProps) {
  return (
    <span className="ds-share-ratio">
      <TokenAmount amount={shares} decimals={decimals} symbol={shareSymbol} size="inline" withIcon />
      <span className="ds-share-ratio-arrow">≈</span>
      <TokenAmount amount={assets} decimals={decimals} symbol={assetSymbol} size="inline" withIcon />
    </span>
  )
}
