import { useQuery } from '@tanstack/react-query'
import { getAbiItem, type Address } from 'viem'
import { useChainId, usePublicClient, useReadContracts, useWatchContractEvent } from 'wagmi'
import { commitmentManagerAbi } from '../generated'
import { type CommitmentWithStatus } from '../utils/commitments'
import { COMMITMENT_STRIDE, commitmentReadContracts, mapCommitmentWindow } from './commitmentReads'
import { POLL } from './polling'

const commitmentCreatedEvent = getAbiItem({
  abi: commitmentManagerAbi,
  name: 'CommitmentCreated',
})

interface UseCommitmentsParams {
  managerAddress: Address | undefined
  /** The committer (creator) side. Renamed from `depositorAddress` in v2. */
  committerAddress: Address | undefined
}

interface UseCommitmentsReturn {
  commitments: CommitmentWithStatus[]
  isLoading: boolean
  isError: boolean
  error: Error | null
  refetch: () => void
}

export function useCommitments({
  managerAddress,
  committerAddress,
}: UseCommitmentsParams): UseCommitmentsReturn {
  const chainId = useChainId()
  const client = usePublicClient()

  // ── Step 1: Scan CommitmentCreated logs for this committer ──────────────────
  const logs = useQuery({
    enabled: !!client && !!managerAddress && !!committerAddress,
    queryKey: ['commitment-created-ids', chainId, managerAddress, committerAddress],
    queryFn: async () => {
      // TODO: replace fromBlock: 0n with deployment block once known
      const found = await client!.getLogs({
        address: managerAddress!,
        event: commitmentCreatedEvent,
        args: { committer: committerAddress },
        fromBlock: 0n,
      })
      return found.map((l) => l.args.commitmentId).filter((id): id is bigint => id !== undefined)
    },
  })
  const commitmentIds = logs.data ?? []

  // ── Step 2: Multicall enrichment ────────────────────────────────────────────
  // Batch four reads for every ID in a single useReadContracts call.
  // Layout per id: [getCommitment, getForfeitProposal, unbondInitiatedAt, strategiesOf]
  const { data: multicallData, isLoading: isLoadingData, error: multicallError, refetch: refetchMulticall } =
    useReadContracts({
      contracts: commitmentIds.flatMap((id) => commitmentReadContracts(managerAddress!, id)),
      query: {
        enabled: commitmentIds.length > 0 && !!managerAddress,
        refetchInterval: POLL.fast,
      },
    })

  // ── Step 3: Build CommitmentWithStatus[] sorted newest-first (D-04) ─────────
  const commitments: CommitmentWithStatus[] = (() => {
    if (!multicallData || commitmentIds.length === 0) {
      return []
    }

    const result: CommitmentWithStatus[] = []

    for (let i = 0; i < commitmentIds.length; i++) {
      const mapped = mapCommitmentWindow(commitmentIds[i], multicallData, i * COMMITMENT_STRIDE)
      if (mapped) result.push(mapped)
    }

    // Sort newest-first by createdAt (D-04)
    result.sort((a, b) => (a.createdAt > b.createdAt ? -1 : a.createdAt < b.createdAt ? 1 : 0))

    return result
  })()

  // ── Step 4: Real-time watcher — re-scan logs on new CommitmentCreated ───────
  useWatchContractEvent({
    address: managerAddress,
    abi: commitmentManagerAbi,
    eventName: 'CommitmentCreated',
    args: { committer: committerAddress },
    enabled: !!managerAddress && !!committerAddress,
    onLogs: () => {
      void logs.refetch()
    },
  })

  function refetch() {
    void logs.refetch()
    void refetchMulticall()
  }

  // A failed log scan must surface: it otherwise looks identical to
  // "this committer has no commitments".
  const error = logs.error ?? (multicallError as Error | null) ?? null

  return {
    commitments,
    isLoading: logs.isLoading || (commitmentIds.length > 0 && isLoadingData),
    isError: error !== null,
    error,
    refetch,
  }
}
