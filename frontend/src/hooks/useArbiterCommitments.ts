import { useQuery } from '@tanstack/react-query'
import { type Address } from 'viem'
import { useReadContracts } from 'wagmi'

import { hasIndexer, indexerFetch } from '../config/indexer'
import { asMetadataObject } from '../lib/commitmentMetadata'
import { type CommitmentWithStatus } from '../utils/commitments'
import { COMMITMENT_STRIDE, commitmentReadContracts, mapCommitmentWindow } from './commitmentReads'

/**
 * Commitment enriched with its backing vault address — needed for the
 * forfeiture-ledger lookup (`/vaults/:vault/forfeit-ledger`), which is the
 * canonical timeline source for the selected commitment.
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

/** Minimal wire shape we consume from `/commitments/urgent`. */
interface UrgentRowWire {
  id: string
  vault?: string | null
  metadataURI?: string | null
  metadataHash?: string | null
  metadataStatus?: 'empty' | 'ok' | 'mismatch' | 'unreachable' | null
  metadataContent?: Record<string, unknown> | null
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

interface UseArbiterCommitmentsParams {
  managerAddress: Address | undefined
  /** Connected wallet — the prospective arbiter. */
  viewAddress: Address | undefined
  /** Cap to the indexer endpoint default (100 / max 500). */
  limit?: number
}

interface UseArbiterCommitmentsReturn {
  commitments: ArbiterCommitment[]
  isLoading: boolean
  error: Error | null
  indexerOnline: boolean
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
  limit = 500,
}: UseArbiterCommitmentsParams): UseArbiterCommitmentsReturn {
  const enabled = hasIndexer && !!viewAddress && !!managerAddress

  const {
    data: idRows,
    isLoading: isLoadingIds,
    error: idsError,
    refetch: refetchIds,
  } = useQuery<ArbiterIdRow[]>({
    enabled,
    queryKey: ['arbiter-commitments', viewAddress?.toLowerCase(), managerAddress?.toLowerCase(), limit],
    queryFn: async () => {
      const lower = viewAddress!.toLowerCase()
      const res = await indexerFetch(
        `/commitments/urgent?arbiter=${lower}&manager=${managerAddress!.toLowerCase()}&limit=${limit}`,
      )
      if (!res.ok) throw new Error(`Indexer error: ${res.status}`)
      const payload = (await res.json()) as { rows?: UrgentRowWire[] }
      return (payload.rows ?? []).map((r) => ({
        id: BigInt(r.id),
        vault: (r.vault ?? undefined) as Address | undefined,
        metadataURI: r.metadataURI ?? undefined,
        metadataHash: r.metadataHash ?? undefined,
        metadataStatus: r.metadataStatus ?? undefined,
        metadataContent: asMetadataObject(r.metadataContent),
      }))
    },
    refetchInterval: 15_000,
  })

  const ids = idRows ?? []
  const indexedById = new Map(ids.map((r) => [r.id.toString(), r]))

  const {
    data: multicallData,
    isLoading: isLoadingData,
    refetch: refetchMulticall,
  } = useReadContracts({
    contracts: ids.flatMap((r) => commitmentReadContracts(managerAddress!, r.id)),
    query: {
      enabled: ids.length > 0 && !!managerAddress,
      refetchInterval: 15_000,
    },
  })

  const commitments: ArbiterCommitment[] = (() => {
    if (!multicallData || ids.length === 0) return []
    const result: ArbiterCommitment[] = []
    for (let i = 0; i < ids.length; i++) {
      const mapped = mapCommitmentWindow(ids[i].id, multicallData, i * COMMITMENT_STRIDE)
      if (!mapped) continue
      const indexed = indexedById.get(ids[i].id.toString())
      result.push({
        ...mapped,
        vault: indexed?.vault,
        metadataURI: indexed?.metadataURI,
        metadataHash: indexed?.metadataHash,
        metadataStatus: indexed?.metadataStatus,
        metadataContent: indexed?.metadataContent,
      })
    }
    return result
  })()

  function refetch() {
    void refetchIds()
    void refetchMulticall()
  }

  return {
    commitments,
    isLoading: isLoadingIds || (ids.length > 0 && isLoadingData),
    error: (idsError as Error | null) ?? null,
    indexerOnline: hasIndexer,
    refetch,
  }
}
