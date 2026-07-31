import { useQuery } from '@tanstack/react-query'

import { hasIndexer, indexerFetch } from '../config/indexer'

/**
 * Wire shape returned by GET /protocol/stats. BigInts come down as strings.
 */
interface ProtocolStatsWire {
  commitments: {
    active: number
    unbonding: number
    forfeitPending: number
    forfeited: number
    released: number
    expired: number
  }
  totalForfeitable: string
  arbiterCount: number
  agreements: {
    active: number
    forfeited: number
    released: number
    partialForfeitA: number
    partialForfeitB: number
  }
  operators: {
    registered: number
    deregistered: number
    totalDelegatedStake: string
  }
  meshNodes: {
    fanIn: number
    fanOut: number
    tokenWeighting: number
    total: number
  }
  vaultPositions: {
    totalEncumberedShares: string
    totalQueuedShares: string
    totalQueuedAssets: string
    depositorCount: number
  }
  updatedAt: number
}

export interface ProtocolStats {
  commitments: ProtocolStatsWire['commitments'] & { total: number }
  totalForfeitable: bigint
  arbiterCount: number
  agreements: ProtocolStatsWire['agreements'] & { total: number }
  operators: {
    registered: number
    deregistered: number
    totalDelegatedStake: bigint
  }
  meshNodes: ProtocolStatsWire['meshNodes']
  vaultPositions: {
    totalEncumberedShares: bigint
    totalQueuedShares: bigint
    totalQueuedAssets: bigint
    depositorCount: number
  }
  updatedAt: number
}

/**
 * useProtocolStats — single round-trip protocol-wide KPI payload for the
 * Explorer page. Polls every 15s. Returns `data: undefined` while loading or
 * when the indexer isn't configured (`hasIndexer === false`).
 *
 * BigInt fields are converted from wire strings to native bigint. Counts are
 * passed through as numbers; `total` is computed for commitments and
 * agreements as a convenience.
 */
export function useProtocolStats(): {
  data: ProtocolStats | undefined
  isLoading: boolean
  error: unknown
} {
  const query = useQuery({
    enabled: hasIndexer,
    queryKey: ['protocol-stats'],
    queryFn: async (): Promise<ProtocolStats> => {
      const res = await indexerFetch('/protocol/stats')
      if (!res.ok) throw new Error(`Indexer error: ${res.status}`)
      const wire = (await res.json()) as ProtocolStatsWire
      const commitmentsTotal =
        wire.commitments.active +
        wire.commitments.unbonding +
        wire.commitments.forfeitPending +
        wire.commitments.forfeited +
        wire.commitments.released +
        wire.commitments.expired
      const agreementsTotal =
        wire.agreements.active +
        wire.agreements.forfeited +
        wire.agreements.released +
        wire.agreements.partialForfeitA +
        wire.agreements.partialForfeitB
      return {
        commitments: { ...wire.commitments, total: commitmentsTotal },
        totalForfeitable: BigInt(wire.totalForfeitable),
        arbiterCount: wire.arbiterCount,
        agreements: { ...wire.agreements, total: agreementsTotal },
        operators: {
          registered: wire.operators.registered,
          deregistered: wire.operators.deregistered,
          totalDelegatedStake: BigInt(wire.operators.totalDelegatedStake),
        },
        meshNodes: wire.meshNodes,
        vaultPositions: {
          totalEncumberedShares: BigInt(wire.vaultPositions.totalEncumberedShares),
          totalQueuedShares: BigInt(wire.vaultPositions.totalQueuedShares),
          totalQueuedAssets: BigInt(wire.vaultPositions.totalQueuedAssets),
          depositorCount: wire.vaultPositions.depositorCount,
        },
        updatedAt: wire.updatedAt,
      }
    },
    refetchInterval: 15_000,
  })
  return { data: query.data, isLoading: query.isLoading, error: query.error }
}
