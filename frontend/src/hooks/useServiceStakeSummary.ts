import { useQuery } from '@tanstack/react-query'
import type { Address } from 'viem'

import { hasIndexer, indexerJson } from '../config/indexer'
import { POLL } from './polling'

export interface ServiceStakeDenom {
  vault: Address
  /** Sum of vault shares committed to operators registered in this service.
   *  Formatted with `decimals` (the ERC-4626 share decimals — typically asset
   *  decimals + virtual offset, e.g. 15 for a 6-decimal USDC vault). */
  totalShares: bigint
  /** Underlying asset amount (vault.convertToAssets(totalShares)); null if
   *  the read failed. Formatted with `assetDecimals`, NOT `decimals`. */
  totalAssets: bigint | null
  /** Underlying asset address (e.g. USDC). */
  asset: Address | null
  /** Display name — vault.v1 metadata override, falling back to vault.name(). */
  name: string | null
  /** ERC-4626 share symbol (e.g. "cvUSDC"). Use for share-count fallback. */
  symbol: string | null
  /** ERC-4626 share decimals (asset + virtual offset). Use for `totalShares`. */
  decimals: number | null
  /** Underlying ERC-20 symbol (e.g. "USDC"). Use for USD price lookups. */
  assetSymbol: string | null
  /** Underlying ERC-20 decimals. Use to format `totalAssets`. */
  assetDecimals: number | null
  logoURI: string | null
}

export interface UseServiceStakeSummaryReturn {
  /** Per-vault stake totals — one row per vault that has any backing stake. */
  denoms: ServiceStakeDenom[]
  /** Number of operators currently registered in the service. */
  operatorCount: number
  isLoading: boolean
  error: unknown
  /** True when the indexer URL is not configured — page should fall back. */
  indexerOffline: boolean
  refetch: () => void
}

interface RawDenom {
  vault: string
  totalShares: string
  totalAssets: string | null
  asset: string | null
  name: string | null
  symbol: string | null
  decimals: number | null
  assetSymbol: string | null
  assetDecimals: number | null
  logoURI: string | null
}

interface RawResponse {
  service: string
  operatorCount: number
  denoms: RawDenom[]
}

function parseDenom(raw: RawDenom): ServiceStakeDenom {
  return {
    vault: raw.vault as Address,
    totalShares: BigInt(raw.totalShares),
    totalAssets: raw.totalAssets === null ? null : BigInt(raw.totalAssets),
    asset: raw.asset === null ? null : (raw.asset as Address),
    name: raw.name,
    symbol: raw.symbol,
    decimals: raw.decimals,
    assetSymbol: raw.assetSymbol,
    assetDecimals: raw.assetDecimals,
    logoURI: raw.logoURI,
  }
}

/**
 * useServiceStakeSummary — fetches per-vault committed stake totals for
 * one OperatorServiceRegistry from the indexer's /services/:address/stake-summary
 * endpoint. Multi-vault native: each registered operator's commitments are
 * grouped by their backing vault and summed independently, so a service that
 * draws stake from USDC + WETH vaults shows both as separate rows.
 *
 * The endpoint reads vault.convertToAssets() fresh per request, so totalAssets
 * tracks the live share-price (relevant once vaults accrue yield). USD
 * conversion is intentionally NOT done in this hook — pair it with
 * useAssetPrices() in the caller so the price fetch stays a separate concern.
 *
 * Forfeited and released stake fall out of the totals automatically — the
 * endpoint scopes the SUM to commitments with status in
 * (active, unbonding, forfeitPending), and the existing forfeit handler flips
 * status to 'forfeited' on execution. No bespoke decrement plumbing.
 */
export function useServiceStakeSummary(
  stakeRegistry: Address | undefined,
): UseServiceStakeSummaryReturn {
  const enabled = hasIndexer && Boolean(stakeRegistry)

  const query = useQuery<RawResponse>({
    enabled,
    queryKey: ['service-stake-summary', stakeRegistry?.toLowerCase()],
    queryFn: async () => {
      return indexerJson<RawResponse>(`/services/${stakeRegistry}/stake-summary`)
    },
    refetchInterval: POLL.fast,
    staleTime: 15_000,
  })

  const denoms = (query.data?.denoms ?? []).map(parseDenom)
  return {
    denoms,
    operatorCount: query.data?.operatorCount ?? 0,
    isLoading: query.isLoading,
    error: query.error,
    indexerOffline: !hasIndexer,
    refetch: () => {
      void query.refetch()
    },
  }
}
