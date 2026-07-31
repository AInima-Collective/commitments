import { useEffect, useRef, useState } from 'react'
import { getAbiItem, type Address } from 'viem'
import { usePublicClient, useReadContracts, useWatchContractEvent } from 'wagmi'
import { commitmentManagerAbi } from '../generated'
import { type CommitmentWithStatus } from '../utils/commitments'
import { COMMITMENT_STRIDE, commitmentReadContracts, mapCommitmentWindow } from './commitmentReads'

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
  addOptimistic: (commitment: CommitmentWithStatus) => void
}

export function useCommitments({
  managerAddress,
  committerAddress,
}: UseCommitmentsParams): UseCommitmentsReturn {
  const client = usePublicClient()
  const [commitmentIds, setCommitmentIds] = useState<bigint[]>([])
  const [isLoadingLogs, setIsLoadingLogs] = useState(true)
  const [logsError, setLogsError] = useState<Error | null>(null)
  // Optimistic entries prepended to the list until the next refetch
  const optimisticRef = useRef<CommitmentWithStatus[]>([])

  // ── Step 1: Scan CommitmentCreated logs for this committer ──────────────────
  const fetchLogs = () => {
    if (!client || !managerAddress || !committerAddress) {
      setIsLoadingLogs(false)
      return
    }
    setIsLoadingLogs(true)
    setLogsError(null)
    // TODO: replace fromBlock: 0n with deployment block once known
    client
      .getLogs({
        address: managerAddress,
        event: commitmentCreatedEvent,
        args: { committer: committerAddress },
        fromBlock: 0n,
      })
      .then((logs) => {
        const ids = logs
          .map((l) => l.args.commitmentId)
          .filter((id): id is bigint => id !== undefined)
        setCommitmentIds(ids)
        // Clear optimistic entries once we have fresh log data
        optimisticRef.current = []
        setIsLoadingLogs(false)
      })
      .catch((err: unknown) => {
        // Surface the failure — a failed log scan otherwise looks identical to
        // "this committer has no commitments".
        setLogsError(err instanceof Error ? err : new Error(String(err)))
        setIsLoadingLogs(false)
      })
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- external subscription (RPC log scan); see frontend/docs/eslint-disable-rationale.md §Pattern-3
    fetchLogs()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [client, managerAddress, committerAddress])

  // ── Step 2: Multicall enrichment ────────────────────────────────────────────
  // Batch four reads for every ID in a single useReadContracts call.
  // Layout per id: [getCommitment, getForfeitProposal, unbondInitiatedAt, strategiesOf]
  const { data: multicallData, isLoading: isLoadingData, error: multicallError, refetch: refetchMulticall } =
    useReadContracts({
      contracts: commitmentIds.flatMap((id) => commitmentReadContracts(managerAddress!, id)),
      query: {
        enabled: commitmentIds.length > 0 && !!managerAddress,
        refetchInterval: 15_000,
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

    // Prepend any optimistic entries not yet replaced by on-chain data.
    // The ref is mutated only by event handlers (`fetchLogs`, `addOptimistic`)
    // that schedule a re-render the next tick, so a render-time read returns
    // a stable value for this render. See frontend/docs/eslint-disable-rationale.md §Pattern-4.
    // eslint-disable-next-line react-hooks/refs -- intentional render-time read for optimistic-update merge; see frontend/docs/eslint-disable-rationale.md §Pattern-4
    const optimistic = optimisticRef.current.filter(
      (opt) => !result.some((r) => r.id === opt.id),
    )
    return [...optimistic, ...result]
  })()

  // ── Step 4: Real-time watcher — re-scan logs on new CommitmentCreated ───────
  useWatchContractEvent({
    address: managerAddress,
    abi: commitmentManagerAbi,
    eventName: 'CommitmentCreated',
    args: { committer: committerAddress },
    enabled: !!managerAddress && !!committerAddress,
    onLogs: () => {
      fetchLogs()
    },
  })

  // ── Step 5: Optimistic update ─────────────────────────────────────────────
  const addOptimistic = (commitment: CommitmentWithStatus) => {
    optimisticRef.current = [commitment, ...optimisticRef.current]
    // Immediately trigger a log rescan to pick up the real event
    fetchLogs()
  }

  function refetch() {
    fetchLogs()
    void refetchMulticall()
  }

  const error = logsError ?? (multicallError as Error | null) ?? null

  return {
    commitments,
    isLoading: isLoadingLogs || (commitmentIds.length > 0 && isLoadingData),
    isError: error !== null,
    error,
    refetch,
    addOptimistic,
  }
}
