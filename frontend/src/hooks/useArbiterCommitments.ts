import { useCallback, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { type Address } from 'viem'
import { useReadContracts } from 'wagmi'

import { hasIndexer, indexerJson } from '../config/indexer'
import { parseCommitmentRow, type CommitmentRowWire } from '../lib/indexerRows'
import { type CommitmentWithStatus } from '../utils/commitments'
import { COMMITMENT_STRIDE, commitmentReadContracts, mapCommitmentWindow } from './commitmentReads'
import { POLL } from './polling'

/**
 * Commitment enriched with its backing vault address for existing vault views.
 * Per-commitment arbitration history is manager+id scoped and does not require it.
 */
export interface ArbiterCommitment extends CommitmentWithStatus {
  /** Backing vault (denormalized by the indexer). Undefined on legacy rows. */
  vault: Address | undefined
  /**
   * Resolved metadata, carried straight off the list response. An arbiter
   * deciding whether to execute a forfeit needs to know what the commitment
   * promised, and `/commitments/urgent` already returns it — reading it here
   * costs nothing and saves the queue from listing bare integers.
   */
  metadataURI: string | undefined
  metadataHash: string | undefined
  metadataStatus: 'empty' | 'ok' | 'mismatch' | 'unreachable' | undefined
  metadataContent: Record<string, unknown> | undefined
}

/** The id-row shape carried between the indexer fetch and the multicall. */
interface ArbiterIdRow {
  id: bigint
  vault: Address | undefined
  metadataURI: string | undefined
  metadataHash: string | undefined
  metadataStatus: 'empty' | 'ok' | 'mismatch' | 'unreachable' | undefined
  metadataContent: Record<string, unknown> | undefined
}

const NO_ROWS: ArbiterIdRow[] = []
const NO_COUNTS = { needsAction: 0, openProposals: 0, active: 0, other: 0, total: 0 }

interface UseArbiterCommitmentsParams {
  managerAddress: Address | undefined
  /** Connected wallet — the prospective arbiter. */
  viewAddress: Address | undefined
  /** Explicit page size; the endpoint never claims completeness from a cap. */
  limit?: number
  offset?: number
}

interface UseArbiterCommitmentsReturn {
  commitments: ArbiterCommitment[]
  isLoading: boolean
  error: Error | null
  indexerOnline: boolean
  counts: {
    needsAction: number
    openProposals: number
    active: number
    other: number
    total: number
  }
  refetch: () => void
}

/**
 * useArbiterCommitments — lists every commitment where the connected wallet is
 * the `arbiter`, the data source for the arbitration queue.
 *
 * Two-step pipeline:
 *   1. Pull the candidate ids from the indexer's canonical urgency endpoint
 *      with the new `?arbiter=` filter. `arbiter` is *not* an indexed event arg
 *      (only `commitmentId` + `committer` are), so a client-side log scan can't
 *      filter on it without reading every commitment — the indexer filter is
 *      the only practical source.
 *   2. Enrich each id via multicall (getCommitment + getForfeitProposal +
 *      unbondInitiatedAt + strategiesOf) into a full `CommitmentWithStatus`, so
 *      the resolve modal + `getAvailableActions` have `challengeWindow` etc.
 *
 * When the indexer is offline (`hasIndexer === false`) the queue cannot be
 * built; callers should render an explanatory state.
 */
export function useArbiterCommitments({
  managerAddress,
  viewAddress,
  limit = 50,
  offset = 0,
}: UseArbiterCommitmentsParams): UseArbiterCommitmentsReturn {
  const enabled = hasIndexer && !!viewAddress && !!managerAddress

  const {
    data: idRows,
    isLoading: isLoadingIds,
    error: idsError,
    refetch: refetchIds,
  } = useQuery<{
    rows: ArbiterIdRow[]
    counts: UseArbiterCommitmentsReturn['counts']
  }>({
    enabled,
    queryKey: ['arbiter-commitments', viewAddress?.toLowerCase(), managerAddress?.toLowerCase(), limit, offset],
    queryFn: async () => {
      const lower = viewAddress!.toLowerCase()
      const payload = await indexerJson<{
        rows?: CommitmentRowWire[]
        counts?: UseArbiterCommitmentsReturn['counts']
      }>(
        `/commitments/urgent?arbiter=${lower}&manager=${managerAddress!.toLowerCase()}&limit=${limit}&offset=${offset}`,
      )
      return {
        rows: (payload.rows ?? []).map((w) => {
          const r = parseCommitmentRow(w)
          return {
            id: r.id,
            vault: r.vault,
            metadataURI: r.metadataURI,
            metadataHash: r.metadataHash,
            metadataStatus: r.metadataStatus,
            metadataContent: r.metadataContent,
          }
        }),
        counts: payload.counts ?? { needsAction: 0, openProposals: 0, active: 0, other: 0, total: 0 },
      }
    },
    refetchInterval: POLL.fast,
  })

  const ids = idRows?.rows ?? NO_ROWS
  const {
    data: multicallData,
    isLoading: isLoadingData,
    refetch: refetchMulticall,
  } = useReadContracts({
    contracts: ids.flatMap((r) => commitmentReadContracts(managerAddress!, r.id)),
    query: {
      enabled: ids.length > 0 && !!managerAddress,
      refetchInterval: POLL.fast,
    },
  })

  // Memoised on the two query results (both structurally shared), so a poll
  // that changes nothing hands back the same rows and the queue's memoised
  // rows skip their render.
  const commitments = useMemo<ArbiterCommitment[]>(() => {
    if (!multicallData || ids.length === 0) return []
    const result: ArbiterCommitment[] = []
    for (let i = 0; i < ids.length; i++) {
      const mapped = mapCommitmentWindow(ids[i].id, multicallData, i * COMMITMENT_STRIDE)
      if (!mapped) continue
      const { id: _id, ...indexed } = ids[i]
      result.push({ ...mapped, ...indexed })
    }
    return result
  }, [ids, multicallData])

  const refetch = useCallback(() => {
    void refetchIds()
    void refetchMulticall()
  }, [refetchIds, refetchMulticall])

  return {
    commitments,
    isLoading: isLoadingIds || (ids.length > 0 && isLoadingData),
    error: (idsError as Error | null) ?? null,
    indexerOnline: hasIndexer,
    counts: idRows?.counts ?? NO_COUNTS,
    refetch,
  }
}
