import { useQuery } from '@tanstack/react-query'
import type { Hex } from 'viem'

import { hasIndexer, indexerFetch } from '../config/indexer'
import type {
  CommitmentLifecycle,
  AgreementsGraphPayload,
  GraphEdge,
  GraphNode,
} from '../lib/graph/types'

/** Wire shape from GET /graph/agreements (no address). */
interface NodeWire {
  id: string
  commitmentsOut: number
  commitmentsIn: number
  convictionOut: string
  convictionIn: string
  activeCount: number
  forfeitedCount: number
  releasedCount: number
}

interface EdgeWire {
  id: string
  from: string
  to: string
  amount: string
  maxPenaltyBps: number
  conviction: string
  status: CommitmentLifecycle
  forfeitPenaltyBps: number | null
  forfeitChallengeEnd: string | null
  agreementId: string | null
  agreementSide: 'A' | 'B' | null
  agreementStatus: string | null
  createdBlock: string
}

interface PayloadWire {
  nodes: NodeWire[]
  edges: EdgeWire[]
}

interface UseProtocolAgreementsOptions {
  /** Cap on commitments returned by the indexer. Defaults to 500, max 1000. */
  limit?: number
}

/**
 * useProtocolAgreements — protocol-wide agreements graph payload for
 * the Explorer page's hero graph. Calls GET /graph/agreements with no
 * `address` parameter (returns recent commitments capped at `limit`).
 *
 * BigInt strings are converted to native bigint to match
 * AgreementsGraphPayload — the shape expected by `<CommitmentsGraph
 * mode="agreements"/>`.
 */
export function useProtocolAgreements({
  limit = 500,
}: UseProtocolAgreementsOptions = {}): {
  data: AgreementsGraphPayload | undefined
  isLoading: boolean
  error: unknown
} {
  const query = useQuery({
    enabled: hasIndexer,
    queryKey: ['protocol-agreements', limit],
    queryFn: async (): Promise<AgreementsGraphPayload> => {
      const res = await indexerFetch(`/graph/agreements?limit=${limit}`)
      if (!res.ok) throw new Error(`Indexer error: ${res.status}`)
      const wire = (await res.json()) as PayloadWire
      const nodes: GraphNode[] = wire.nodes.map((n) => ({
        id: n.id as Hex,
        commitmentsOut: n.commitmentsOut,
        commitmentsIn: n.commitmentsIn,
        convictionOut: BigInt(n.convictionOut),
        convictionIn: BigInt(n.convictionIn),
        activeCount: n.activeCount,
        forfeitedCount: n.forfeitedCount,
        releasedCount: n.releasedCount,
      }))
      const edges: GraphEdge[] = wire.edges.map((e) => ({
        id: e.id,
        from: e.from as Hex,
        to: e.to as Hex,
        amount: BigInt(e.amount),
        maxPenaltyBps: e.maxPenaltyBps,
        conviction: BigInt(e.conviction),
        status: e.status,
        forfeitPenaltyBps: e.forfeitPenaltyBps,
        forfeitChallengeEnd: e.forfeitChallengeEnd ? BigInt(e.forfeitChallengeEnd) : null,
        agreementId: e.agreementId,
        agreementSide: e.agreementSide,
        agreementStatus: e.agreementStatus,
      }))
      return { nodes, edges }
    },
    refetchInterval: 15_000,
  })
  return { data: query.data, isLoading: query.isLoading, error: query.error }
}
