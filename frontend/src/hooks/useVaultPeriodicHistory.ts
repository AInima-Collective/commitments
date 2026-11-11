import { useQuery } from '@tanstack/react-query'
import { type Address } from 'viem'

import { hasIndexer, indexerJson } from '../config/indexer'
import { POLL } from './polling'

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
  /** Fetch only the newest snapshot (`?latest=1`); `days` is then ignored. */
  latest?: boolean
}

/**
 * Query options for one vault's snapshots from the indexer's
 * `/vaults/:vault/periodic`, which serves the `vaultSnapshot` table
 * downsampled to hourly (up to 7 days) or daily points. Polls every 60s; rows
 * are newest-first. Shared by {@link useVaultPeriodicHistory} and list pages
 * that read several vaults at once.
 */
export function vaultPeriodicQuery({ vaultAddress, days = 7, latest = false }: UseVaultPeriodicHistoryParams) {
  return {
    enabled: hasIndexer && Boolean(vaultAddress),
    queryKey: ['vault-periodic-history', vaultAddress, latest ? 'latest' : days],
    queryFn: async (): Promise<PeriodicHistory> => {
      if (!vaultAddress) throw new Error('vaultAddress required')
      const wire = await indexerJson<PeriodicHistoryWire>(
        `/vaults/${vaultAddress.toLowerCase()}/periodic?${latest ? 'latest=1' : `days=${days}`}`,
      )
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
    refetchInterval: POLL.idle,
  }
}

/** Snapshots for one vault; `data: undefined` until the indexer responds. */
export function useVaultPeriodicHistory(params: UseVaultPeriodicHistoryParams): {
  data: PeriodicHistory | undefined
  isLoading: boolean
  error: unknown
} {
  const query = useQuery(vaultPeriodicQuery(params))
  return { data: query.data, isLoading: query.isLoading, error: query.error }
}
