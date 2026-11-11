import { useQuery } from '@tanstack/react-query'
import { type Address } from 'viem'
import { hasIndexer, indexerJson } from '../config/indexer'
import {
  parseCommitmentRow,
  type CommitmentRowWire,
  type IndexedCommitmentRow,
} from '../lib/indexerRows'
import { POLL } from './polling'

interface GraphEdgeWire {
  id: string
  /** Source CommitmentManager. Namespaces the per-manager `id`. Null on
   *  pre-multi-manager indexer payloads. */
  manager: string | null
  from: string
  to: string
  amount: string
  status: string
  agreementId: string | null
  agreementSide: 'A' | 'B' | null
  agreementStatus: string | null
}

/** Direction of a commitment from the viewer's vantage point. */
export type CommitmentDirection = 'one-way' | 'paired'

/** Role of the viewer for a commitment row. */
export type CommitmentRole = 'committer' | 'counterparty'

/**
 * Unified row shape consumed by the commitments DataTable: the indexed
 * commitment plus the viewer-relative role and agreement linkage.
 */
export interface UnifiedCommitmentRow extends IndexedCommitmentRow {
  /** Viewer-relative role. Always exactly one of committer/counterparty. */
  role: CommitmentRole
  /** `'one-way'` for solo commitments, `'paired'` when part of an agreement. */
  direction: CommitmentDirection
  /** Set when `direction === 'paired'`. */
  agreementId: bigint | undefined
  /** Side of the agreement this commitment occupies (A or B). */
  agreementSide: 'A' | 'B' | undefined
  /** Lifecycle of the agreement (active / forfeited / released / partialForfeitA / partialForfeitB). */
  agreementStatus: string | undefined
}

interface UseIndexedCommitmentsParams {
  /** Address whose commitments to display (committer OR counterparty matches). */
  viewAddress: Address | undefined
  /** Cap to the indexer endpoint default (100 / max 500). */
  limit?: number
}

interface UseIndexedCommitmentsReturn {
  rows: UnifiedCommitmentRow[]
  isLoading: boolean
  error: Error | null
  indexerOnline: boolean
  refetch: () => void
}

async function fetchRows(viewAddress: Address, limit: number): Promise<UnifiedCommitmentRow[]> {
  const lower = viewAddress.toLowerCase()
  const [urgent, graph] = await Promise.all([
    indexerJson<{ rows?: CommitmentRowWire[] }>(`/commitments/urgent?address=${lower}&limit=${limit}`),
    indexerJson<{ edges?: GraphEdgeWire[] }>(`/graph/agreements?address=${lower}`),
  ])
  // Commitment ids repeat across managers (each numbers from 0), so the
  // agreement lookup keys by (manager, id); otherwise a WETH-manager
  // commitment can inherit a USDC-manager commitment's agreement. Falls back
  // to the bare id when manager is absent (pre-multi-manager rows).
  const commitmentKey = (manager: string | null | undefined, id: string) =>
    manager ? `${manager.toLowerCase()}-${id}` : id
  const edgeByCommitment = new Map<string, GraphEdgeWire>()
  for (const e of graph.edges ?? []) {
    if (e.agreementId) edgeByCommitment.set(commitmentKey(e.manager, e.id), e)
  }
  return (urgent.rows ?? []).map((w): UnifiedCommitmentRow => {
    const edge = edgeByCommitment.get(commitmentKey(w.manager, w.id))
    return {
      ...parseCommitmentRow(w),
      role: w.committer.toLowerCase() === lower ? 'committer' : 'counterparty',
      direction: edge ? 'paired' : 'one-way',
      agreementId: edge?.agreementId ? BigInt(edge.agreementId) : undefined,
      agreementSide: edge?.agreementSide ?? undefined,
      agreementStatus: edge?.agreementStatus ?? undefined,
    }
  })
}

/**
 * useIndexedCommitments: single source of truth for the unified commitments
 * table. Fetches `/commitments/urgent?address=...` for row data and
 * `/graph/agreements?address=...` for agreement linkage in parallel, and
 * merges them into UnifiedCommitmentRow[].
 *
 * The endpoint is the canonical urgency-sorted list (forfeitPending → active →
 * terminal, then forfeitChallengeEnd ASC, then id DESC), so rows arrive in the
 * table's default order. When the indexer is offline (`hasIndexer === false`),
 * `indexerOnline` is `false` and `rows` is empty.
 */
export function useIndexedCommitments({
  viewAddress,
  limit = 500,
}: UseIndexedCommitmentsParams): UseIndexedCommitmentsReturn {
  const query = useQuery({
    enabled: hasIndexer && !!viewAddress,
    queryKey: ['indexed-commitments', viewAddress?.toLowerCase(), limit],
    queryFn: () => fetchRows(viewAddress!, limit),
    refetchInterval: POLL.fast,
  })
  return {
    rows: query.data ?? [],
    isLoading: query.isLoading,
    error: query.error,
    indexerOnline: hasIndexer,
    refetch: () => void query.refetch(),
  }
}
