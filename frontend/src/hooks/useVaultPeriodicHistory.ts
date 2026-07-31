import { useQuery } from '@tanstack/react-query'
import { type Address } from 'viem'

import { hasIndexer, indexerFetch } from '../config/indexer'

interface PeriodicSnapshotWire {
  vault: string
  timestamp: string
  sharePrice: string
  totalAssets: string
  totalSupply: string
  apy7d: number | null
  apy30d: number | null
  totalForfeitable: string
  totalEncumberedShares: string
  activeCommitmentCount: number
  forfeitPendingCount: number
}

interface PeriodicHistoryWire {
  vault: string
  days: number
  rows: PeriodicSnapshotWire[]
}

export interface PeriodicSnapshot {
  vault: Address
  /** Unix seconds. */
  timestamp: number
  sharePrice: bigint
  totalAssets: bigint
  totalSupply: bigint
  apy7d: number | null
  apy30d: number | null
  totalForfeitable: bigint
  totalEncumberedShares: bigint
  activeCommitmentCount: number
  forfeitPendingCount: number
}

export interface PeriodicHistory {
  vault: Address
  days: number
  /** Newest-first array of snapshots. */
  rows: PeriodicSnapshot[]
}

interface UseVaultPeriodicHistoryParams {
  vaultAddress: Address | undefined
  /** Trailing window in days. Default 7, max 90. */
  days?: number
}

/**
 * Time-series snapshots for one vault, sourced from
 * `offchain.vault_periodic_snapshot` via the indexer's REST endpoint. Polls
 * every 60s — snapshots fire on a 5-minute cadence so faster polling is
 * wasted work. Returns `data: undefined` until the indexer responds; rows
 * are newest-first.
 */
export function useVaultPeriodicHistory({
  vaultAddress,
  days = 7,
}: UseVaultPeriodicHistoryParams): {
  data: PeriodicHistory | undefined
  isLoading: boolean
  error: unknown
} {
  const enabled = hasIndexer && Boolean(vaultAddress)
  const query = useQuery<PeriodicHistory>({
    enabled,
    queryKey: ['vault-periodic-history', vaultAddress, days],
    queryFn: async () => {
      if (!vaultAddress) throw new Error('vaultAddress required')
      const res = await indexerFetch(
        `/vaults/${vaultAddress.toLowerCase()}/periodic?days=${days}`,
      )
      if (!res.ok) throw new Error(`Indexer error: ${res.status}`)
      const wire = (await res.json()) as PeriodicHistoryWire
      const rows: PeriodicSnapshot[] = wire.rows.map((r) => ({
        vault: r.vault as Address,
        timestamp: Number(r.timestamp),
        sharePrice: BigInt(r.sharePrice),
        totalAssets: BigInt(r.totalAssets),
        totalSupply: BigInt(r.totalSupply),
        apy7d: r.apy7d,
        apy30d: r.apy30d,
        totalForfeitable: BigInt(r.totalForfeitable),
        totalEncumberedShares: BigInt(r.totalEncumberedShares),
        activeCommitmentCount: r.activeCommitmentCount,
        forfeitPendingCount: r.forfeitPendingCount,
      }))
      return {
        vault: wire.vault as Address,
        days: wire.days,
        rows,
      }
    },
    refetchInterval: 60_000,
  })
  return { data: query.data, isLoading: query.isLoading, error: query.error }
}
