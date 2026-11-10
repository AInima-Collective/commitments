import { useReadContract } from 'wagmi'
import { type Address } from 'viem'
import { commitmentManagerAbi } from '../generated'
import {
  calculateForfeitEnforcement,
  type ForfeitEnforcement,
  type ForfeitEnforcementState,
  type ManagerPauseSnapshot,
} from '../lib/forfeitEnforcement'
import { toForfeitProposal, type ForfeitProposalView } from './commitmentReads'
import { POLL } from './polling'
import { useDisplayNow } from './useDisplayNow'

interface UseForfeitProposalParams {
  managerAddress: Address | undefined
  commitmentId: bigint | undefined
  challengeWindowSecs: bigint
  enabled?: boolean
}

interface UseForfeitProposalReturn {
  proposal: ForfeitProposalView | undefined
  state: ForfeitEnforcementState
  enforcement: ForfeitEnforcement
  pauseState: ManagerPauseSnapshot | undefined
  deadline: bigint
  staleCancelAt: bigint
  isLoading: boolean
  error: Error | null
  refetch: () => void
}

export function useForfeitProposal({
  managerAddress,
  commitmentId,
  challengeWindowSecs,
  enabled,
}: UseForfeitProposalParams): UseForfeitProposalReturn {
  const now = BigInt(useDisplayNow())
  const queryEnabled =
    !!managerAddress && commitmentId !== undefined && enabled !== false
  const { data, isLoading, error: proposalError, refetch } = useReadContract({
    abi: commitmentManagerAbi,
    functionName: 'getForfeitProposal',
    address: managerAddress,
    args: commitmentId !== undefined ? [commitmentId] : undefined,
    query: {
      enabled: queryEnabled,
      refetchInterval: POLL.fast,
    },
  })
  const {
    data: pauseRaw,
    isLoading: pauseLoading,
    error: pauseError,
    refetch: refetchPause,
  } = useReadContract({
    abi: commitmentManagerAbi,
    functionName: 'pauseState',
    address: managerAddress,
    query: { enabled: queryEnabled, refetchInterval: POLL.fast },
  })
  const {
    data: ttl,
    isLoading: ttlLoading,
    error: ttlError,
    refetch: refetchTtl,
  } = useReadContract({
    abi: commitmentManagerAbi,
    functionName: 'FORFEIT_PROPOSAL_TTL',
    address: managerAddress,
    query: { enabled: queryEnabled },
  })

  // Guard initiatedAt === 0n — Solidity returns zero-value struct when no proposal exists (Pitfall 2)
  const view = toForfeitProposal(data)
  const proposal = view && view.initiatedAt > 0n ? view : undefined

  const pauseState = pauseRaw
    ? {
        paused: pauseRaw[0],
        pausedAt: pauseRaw[1],
        cumulativePaused: pauseRaw[2],
        maxPauseDuration: pauseRaw[3],
        creditable: pauseRaw[4],
      }
    : undefined
  const calculatedEnforcement = calculateForfeitEnforcement({
    proposal,
    challengeWindow: challengeWindowSecs,
    pauseState,
    proposalTtl: ttl,
    now,
  })
  // A missing proposal result and a confirmed zero-value proposal are distinct.
  // Never turn an RPC failure into the reassuring `NONE` state.
  const enforcement: ForfeitEnforcement =
    proposalError && data === undefined
      ? {
          state: 'UNAVAILABLE',
          executionAvailable: false,
          staleCancellationAvailable: false,
          managerPaused: pauseState?.paused,
        }
      : calculatedEnforcement

  return {
    proposal,
    state: enforcement.state,
    enforcement,
    pauseState,
    deadline: enforcement.effectiveExecutionAt ?? 0n,
    staleCancelAt: enforcement.staleCancelAt ?? 0n,
    isLoading: isLoading || pauseLoading || ttlLoading,
    error: (proposalError ?? pauseError ?? ttlError) as Error | null,
    refetch: () => {
      void refetch()
      void refetchPause()
      void refetchTtl()
    },
  }
}
