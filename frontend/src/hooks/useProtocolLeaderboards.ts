import { useQuery } from '@tanstack/react-query'
import type { Address } from 'viem'

import { hasIndexer, indexerFetch } from '../config/indexer'

export type LeaderboardMetric = 'arbiter' | 'counterparty' | 'operator'

/**
 * Common shape returned for arbiter / counterparty leaderboards. These rank by
 * count; heterogeneous backing units are never added together.
 */
export interface PartyLeaderboardRow {
  address: Address
  commitmentCount: number
  activeCount: number
}

/** Operators leaderboard — sorted by totalDelegatedStake then activeDelegationCount. */
export interface OperatorLeaderboardRow {
  address: Address
  totalDelegatedStake: bigint
  activeDelegationCount: number
  services: string[]
}

interface PartyWire {
  address: string
  commitmentCount: number
  activeCount: number
}

interface OperatorWire {
  address: string
  totalDelegatedStake: string
  activeDelegationCount: number
  services: string[]
}

interface LeaderboardEnvelope<T> {
  metric: LeaderboardMetric
  rows: T[]
}

/**
 * useProtocolLeaderboards — top-N rows for the Explorer leaderboards card.
 *
 * The `metric` selects the role being ranked. Returns are typed differently
 * for `operator` vs `arbiter|counterparty` — narrow on the union below or
 * use the typed helpers exposed alongside.
 *
 * `limit` defaults to 10 (max 50 server-side).
 */
export function useProtocolLeaderboards<M extends LeaderboardMetric>(
  metric: M,
  limit = 10,
): {
  data:
    | (M extends 'operator' ? OperatorLeaderboardRow[] : PartyLeaderboardRow[])
    | undefined
  isLoading: boolean
  error: unknown
} {
  const query = useQuery({
    enabled: hasIndexer,
    queryKey: ['protocol-leaderboard', metric, limit],
    queryFn: async () => {
      const res = await indexerFetch(`/protocol/leaderboard?metric=${metric}&limit=${limit}`)
      if (!res.ok) throw new Error(`Indexer error: ${res.status}`)
      if (metric === 'operator') {
        const env = (await res.json()) as LeaderboardEnvelope<OperatorWire>
        const rows: OperatorLeaderboardRow[] = env.rows.map((r) => ({
          address: r.address as Address,
          totalDelegatedStake: BigInt(r.totalDelegatedStake),
          activeDelegationCount: r.activeDelegationCount,
          services: r.services ?? [],
        }))
        return rows
      }
      const env = (await res.json()) as LeaderboardEnvelope<PartyWire>
      const rows: PartyLeaderboardRow[] = env.rows.map((r) => ({
        address: r.address as Address,
        commitmentCount: r.commitmentCount,
        activeCount: r.activeCount,
      }))
      return rows
    },
    refetchInterval: 30_000,
  })
  return {
    data: query.data as
      | (M extends 'operator' ? OperatorLeaderboardRow[] : PartyLeaderboardRow[])
      | undefined,
    isLoading: query.isLoading,
    error: query.error,
  }
}
