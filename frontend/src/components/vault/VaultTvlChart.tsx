import { type Address } from 'viem'

import { Notice, TimeSeriesChart, type TimeSeriesPoint } from '../ui'
import { formatTokenAmount } from '../../lib/format'
import { useVaultPeriodicHistory } from '../../hooks/useVaultPeriodicHistory'

interface VaultTvlChartProps {
  vaultAddress: Address
  /** Asset decimals (USDC=6, WETH=18). Used to convert raw bigint to display units. */
  assetDecimals: number | undefined
  /** Asset symbol shown in tooltip. */
  assetSymbol: string | undefined
}

/**
 * Convert a bigint asset amount in `decimals` to a Number. Loses precision
 * for very large balances but stays well under `Number.MAX_SAFE_INTEGER`
 * for any plausible vault TVL — the chart axis only needs 6 sig figs.
 */
function toDisplayNumber(amount: bigint, decimals: number): number {
  const f = formatTokenAmount(amount, decimals)
  return Number(f.full)
}

export function VaultTvlChart({
  vaultAddress,
  assetDecimals,
  assetSymbol,
}: VaultTvlChartProps) {
  const { data, isLoading, error } = useVaultPeriodicHistory({ vaultAddress, days: 30 })
  const decimals = assetDecimals ?? 6
  const symbol = assetSymbol ?? ''

  if (error) {
    return (
      <Notice tone="warn" title="TVL history unavailable">
        TVL history is temporarily unavailable — please retry shortly.
      </Notice>
    )
  }

  const rows = data?.rows ?? []
  const series: TimeSeriesPoint[] = rows
    .map((r) => ({ t: r.timestamp, v: toDisplayNumber(r.totalAssets, decimals) }))
    .reverse() // hook returns newest-first; chart reads chronological

  if (!isLoading && rows.length === 0) {
    return (
      <Notice tone="info" title="Snapshot history empty">
        No TVL snapshots have been written yet. The chart fills in as the
        indexer records them.
      </Notice>
    )
  }

  return (
    <TimeSeriesChart
      ariaLabel="Total value locked over time"
      series={[{ label: 'TVL', data: series, tone: 'accent' }]}
      tUnit="s"
      unit={symbol}
      defaultRange="1W"
    />
  )
}
