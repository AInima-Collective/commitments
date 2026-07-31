import { type Address } from 'viem'

import { Notice, TimeSeriesChart, type TimeSeriesPoint } from '../ui'
import { useVaultPeriodicHistory } from '../../hooks/useVaultPeriodicHistory'

interface VaultApyChartProps {
  vaultAddress: Address
}

/**
 * Two-series APY chart: 7d rolling (success tone) and 30d rolling (muted),
 * both in basis points. Hides itself behind an info notice until at least
 * one rolling window has populated — the snapshot job emits null APY for
 * the early days, and rendering an empty line would look like 0%.
 */
export function VaultApyChart({ vaultAddress }: VaultApyChartProps) {
  const { data, isLoading, error } = useVaultPeriodicHistory({ vaultAddress, days: 30 })

  if (error) {
    return (
      <Notice tone="warn" title="APY history unavailable">
        APY history is temporarily unavailable — please retry shortly.
      </Notice>
    )
  }

  const rows = data?.rows ?? []
  const apy7d: TimeSeriesPoint[] = []
  const apy30d: TimeSeriesPoint[] = []
  for (const r of [...rows].reverse()) {
    if (r.apy7d !== null) apy7d.push({ t: r.timestamp, v: r.apy7d })
    if (r.apy30d !== null) apy30d.push({ t: r.timestamp, v: r.apy30d })
  }

  if (!isLoading && apy7d.length === 0 && apy30d.length === 0) {
    return (
      <Notice tone="info" title="APY history not yet available">
        Rolling APYs populate after at least 3.5 days of snapshot history (half the 7d
        window). The chart will appear here once enough data accumulates.
      </Notice>
    )
  }

  return (
    <TimeSeriesChart
      ariaLabel="Vault APY over time"
      series={[
        { label: 'APY 7d', data: apy7d, tone: 'success' },
        { label: 'APY 30d', data: apy30d, tone: 'muted' },
      ]}
      tUnit="s"
      unit="bps"
      defaultRange="1M"
    />
  )
}
