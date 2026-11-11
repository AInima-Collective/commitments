import { useQuery } from '@tanstack/react-query'

import { hasIndexer, indexerJson } from '../config/indexer'
import { POLL } from './polling'

/**
 * Wire shape returned by GET /protocol/stats. BigInts come down as strings.
 */
export interface ProtocolStatsWire {
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
  ledger: {
    totalEncumbered: string
    positionCount: number
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
  ledger: {
    totalEncumbered: bigint
    positionCount: number
  }
  updatedAt: number
}

/** Map the GET /protocol/stats wire payload to native types. */
export function toProtocolStats(wire: ProtocolStatsWire): ProtocolStats {
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
    ledger: {
      totalEncumbered: BigInt(wire.ledger.totalEncumbered),
      positionCount: wire.ledger.positionCount,
    },
    updatedAt: wire.updatedAt,
  }
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
      return toProtocolStats(await indexerJson<ProtocolStatsWire>('/protocol/stats'))
    },
    refetchInterval: POLL.fast,
  })
  return { data: query.data, isLoading: query.isLoading, error: query.error }
}
