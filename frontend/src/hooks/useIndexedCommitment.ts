import { useQuery } from '@tanstack/react-query'
import { type Address } from 'viem'
import { hasIndexer, indexerJsonOrNull } from '../config/indexer'
import { parseCommitmentRow, type CommitmentRowWire } from '../lib/indexerRows'
import { type UnifiedCommitmentRow } from './useIndexedCommitments'
import { POLL, refetchUntil } from './polling'

interface SingleResponse {
  /** `GET /commitments/:id` selects the whole row, metadataContent included,
   *  so the detail page makes one metadata round trip, not two. */
  row: CommitmentRowWire
  agreement: {
    id: string
    commitmentIdA: string
    commitmentIdB: string
    status: string
    side: 'A' | 'B'
  } | null
}

export interface UseIndexedCommitmentReturn {
  row: UnifiedCommitmentRow | null
  isLoading: boolean
  /** True when the indexer responded but no commitment exists with that id. */
  notFound: boolean
  error: Error | null
  indexerOnline: boolean
  refetch: () => void
  /**
   * Refetch now and keep polling (~1s apart) until the indexer row's
   * `updatedBlock` reaches `minBlock`, i.e. until Ponder has processed the
   * block a just-confirmed tx landed in. Falls back to a plain refetch when
   * `minBlock` is undefined; gives up after ~12 attempts for actions that
   * don't touch the commitment row (e.g. yield claims).
   */
  refetchUntilBlock: (minBlock?: bigint) => void
}

/**
 * Single-commitment indexer fetch for the per-commitment detail page.
 *
 * Viewer-relative `role` is computed against `viewAddress` when provided.
 * Without it (anonymous deep link) the row falls back to `role: 'committer'`
 * plus the agreement linkage from the indexer payload.
 */
export function useIndexedCommitment(
  id: bigint | undefined,
  viewAddress: Address | undefined,
  managerAddress?: Address,
): UseIndexedCommitmentReturn {
  const query = useQuery({
    enabled: hasIndexer && id !== undefined,
    queryKey: ['indexed-commitment', id?.toString(), managerAddress?.toLowerCase()],
    queryFn: () =>
      indexerJsonOrNull<SingleResponse>(
        `/commitments/${id!.toString()}${
          managerAddress ? `?manager=${encodeURIComponent(managerAddress.toLowerCase())}` : ''
        }`,
      ),
    refetchInterval: POLL.fast,
  })

  const payload = query.data
  let row: UnifiedCommitmentRow | null = null
  if (payload) {
    const lower = viewAddress?.toLowerCase()
    const agreement = payload.agreement
    row = {
      ...parseCommitmentRow(payload.row),
      role: lower && payload.row.counterparty.toLowerCase() === lower ? 'counterparty' : 'committer',
      direction: agreement ? 'paired' : 'one-way',
      agreementId: agreement ? BigInt(agreement.id) : undefined,
      agreementSide: agreement?.side ?? undefined,
      agreementStatus: agreement?.status ?? undefined,
    }
  }

  const refetchUntilBlock = (minBlock?: bigint) => {
    if (minBlock === undefined) {
      void query.refetch()
      return
    }
    void refetchUntil(query.refetch, (data) => !!data && BigInt(data.row.updatedBlock) >= minBlock)
  }

  return {
    row,
    isLoading: query.isLoading,
    notFound: payload === null,
    error: query.error,
    indexerOnline: hasIndexer,
    refetch: () => void query.refetch(),
    refetchUntilBlock,
  }
}
