import { Link } from 'react-router-dom'
import { EntityLogo, TokenAmount, TokenIcon, UsdAmount } from '../ui'
import { rewriteIpfsURI } from '../../lib/ipfs'
import type { ServiceStakeDenom } from '../../hooks/useServiceStakeSummary'

export interface ServiceStakeBreakdownProps {
  denoms: ServiceStakeDenom[]
  /**
   * USD value (USDC-shape, 6 decimals) for one denom row. Returning `null`
   * renders "PRICE UNAVAILABLE" for that row instead of a missing column.
   * Caller composes this with `useAssetPrices()` to keep the price
   * dependency out of the primitive.
   */
  usdAmountFor?: (denom: ServiceStakeDenom) => bigint | null
  /** Suppress the rows while the indexer call is in flight. */
  isLoading?: boolean
  /** Empty-state copy override. */
  emptyHint?: string
}

/**
 * ServiceStakeBreakdown — per-vault committed stake rows for one service.
 * One row per denom (= per backing vault). Renders:
 *
 *   [logo] vault name        12,500 USDC    ≈ $12,498.20
 *   [logo] WETH Vault        3.247  WETH    ≈ $11,234.50
 *
 * Pure presentation. Pages compose with `useServiceStakeSummary` for the
 * data and `useAssetPrices` for the optional USD column.
 */
export function ServiceStakeBreakdown({
  denoms,
  usdAmountFor,
  isLoading,
  emptyHint = 'No stake committed to this service yet.',
}: ServiceStakeBreakdownProps) {
  if (isLoading && denoms.length === 0) {
    return (
      <div className="ds-card ds-stack ds-stack-2">
        <span className="ds-subtle ds-text-sm">Loading committed stake&hellip;</span>
      </div>
    )
  }
  if (denoms.length === 0) {
    return (
      <div className="ds-card">
        <span className="ds-subtle ds-text-sm">{emptyHint}</span>
      </div>
    )
  }
  return (
    <div className="ds-card">
      <ul className="ds-service-stake-list">
        {denoms.map((denom) => {
          const usd = usdAmountFor?.(denom)
          const logoSrc = denom.logoURI ? rewriteIpfsURI(denom.logoURI) : null
          return (
            <li key={denom.vault}>
              <Link
                to={`/app/vaults/${denom.vault}`}
                className="ds-service-stake-link"
                aria-label={`Open vault ${denom.name ?? denom.vault} detail page`}
              >
                <ServiceStakeRow denom={denom} usd={usd} logoSrc={logoSrc} />
              </Link>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

function ServiceStakeRow({
  denom,
  usd,
  logoSrc,
}: {
  denom: ServiceStakeDenom
  usd: bigint | null | undefined
  logoSrc: string | null
}) {
  // Render the underlying asset value when available (converted via the live
  // share price). Use the asset's own symbol + decimals (e.g. "USDC", 6) —
  // never the share decimals (e.g. 15 for cvUSDC), which would scale the
  // value into invisibility. Fall back to share count + vault symbol when
  // the convertToAssets read fails so the row is never blank.
  const usingAssetValue = denom.totalAssets !== null && denom.assetDecimals !== null
  const amount = usingAssetValue ? (denom.totalAssets as bigint) : denom.totalShares
  const decimals = usingAssetValue
    ? (denom.assetDecimals as number)
    : (denom.decimals ?? 18)
  const amountSymbol = usingAssetValue
    ? (denom.assetSymbol ?? 'TOKEN')
    : (denom.symbol ?? 'TOKEN')
  // Display name + sub-line. The sub-line uses the asset symbol when the
  // value is asset-denominated; otherwise it surfaces the share-fallback
  // state explicitly.
  const heroName = denom.name ?? `${amountSymbol} Vault`
  const subLabel = usingAssetValue
    ? (denom.assetSymbol ?? 'asset')
    : `${denom.symbol ?? 'shares'} (asset value unavailable)`
  // Prefer a logoURI off vault.v1 metadata; otherwise let TokenIcon render
  // the asset symbol's stock glyph (USDC, ETH, etc.).
  const usingLogo = Boolean(logoSrc)
  return (
    <div className="ds-service-stake-row">
      <div className="ds-service-stake-identity">
        {usingLogo ? (
          <EntityLogo name={heroName} src={logoSrc ?? undefined} size="md" />
        ) : (
          <TokenIcon symbol={amountSymbol} size="md" />
        )}
        <div className="ds-stack ds-stack-1 ds-service-stake-text">
          <span className="ds-service-stake-name">{heroName}</span>
          <span className="ds-subtle ds-text-xs">{subLabel}</span>
        </div>
      </div>
      <div className="ds-stack ds-stack-1 ds-service-stake-amounts">
        <TokenAmount amount={amount} decimals={decimals} symbol={amountSymbol} compact size="inline" />
        {usd !== undefined && <UsdAmount amount={usd} size="inline" compact />}
      </div>
    </div>
  )
}
