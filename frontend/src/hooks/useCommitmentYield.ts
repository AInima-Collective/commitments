import { type Address, type Hex } from 'viem'
import { useReadContract, useReadContracts } from 'wagmi'
import { commitmentManagerAbi } from '../generated'
import { POLL } from './polling'

export interface CommitmentYieldEntry {
  /** The bound distribution strategy. */
  strategy: Address
  /** Live claimable amount for the counterparty — `pending(id, strategy, 0x)`. */
  pending: bigint
}

export interface CommitmentYield {
  /** Every distribution strategy bound to the commitment. */
  strategies: Address[]
  /** Per-strategy pending amounts (counterparty claim view). */
  entries: CommitmentYieldEntry[]
  /** Sum of all per-strategy pending amounts. */
  totalPending: bigint
  isLoading: boolean
  refetch: () => void
}

const EMPTY_CLAIM_DATA = '0x' as Hex

interface UseCommitmentYieldParams {
  managerAddress: Address | undefined
  /** Pass `undefined` to disable the reads (e.g. a closed modal). */
  commitmentId: bigint | undefined
}

/**
 * Per-(commitment, strategy) yield reads for the v2 manager. Resolves the
 * commitment's bound strategies via `strategiesOf(id)`, then the live claimable
 * amount per strategy via `pending(id, strategy, 0x)` (the counterparty-claim
 * view — empty claimData). v2 has no aggregate pending read, so this composes
 * the per-strategy reads and sums them for the dossier/modal headline.
 */
export function useCommitmentYield({
  managerAddress,
  commitmentId,
}: UseCommitmentYieldParams): CommitmentYield {
  const enabled = !!managerAddress && commitmentId !== undefined

  const {
    data: strategiesData,
    isLoading: strategiesLoading,
    refetch: refetchStrategies,
  } = useReadContract({
    abi: commitmentManagerAbi,
    functionName: 'strategiesOf',
    address: managerAddress,
    args: commitmentId !== undefined ? [commitmentId] : undefined,
    query: { enabled, refetchInterval: POLL.fast },
  })

  const strategies = (strategiesData as readonly Address[] | undefined)?.slice() ?? []

  const {
    data: pendingData,
    isLoading: pendingLoading,
    refetch: refetchPending,
  } = useReadContracts({
    contracts: strategies.map((strategy) => ({
      abi: commitmentManagerAbi,
      address: managerAddress,
      functionName: 'pending' as const,
      args: [commitmentId as bigint, strategy, EMPTY_CLAIM_DATA] as const,
    })),
    query: { enabled: enabled && strategies.length > 0, refetchInterval: POLL.fast },
  })

  const entries: CommitmentYieldEntry[] = strategies.map((strategy, i) => ({
    strategy,
    pending: (pendingData?.[i]?.result as bigint | undefined) ?? 0n,
  }))

  const totalPending = entries.reduce((sum, e) => sum + e.pending, 0n)

  return {
    strategies,
    entries,
    totalPending,
    isLoading: strategiesLoading || pendingLoading,
    refetch: () => {
      void refetchStrategies()
      void refetchPending()
    },
  }
}
