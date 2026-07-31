import { type Address } from 'viem'
import { useReadCommitmentManagerGetForfeitProposal } from '../generated'
import { getForfeitState, type ForfeitProposalState } from '../utils/commitments'

interface UseForfeitProposalParams {
  managerAddress: Address | undefined
  commitmentId: bigint | undefined
  challengeWindowSecs: bigint
  enabled?: boolean
}

interface UseForfeitProposalReturn {
  proposal:
    | { initiatedAt: bigint; penaltyBps: number; executed: boolean; cancelled: boolean }
    | undefined
  state: ForfeitProposalState
  deadline: bigint
  isLoading: boolean
  refetch: () => void
}

export function useForfeitProposal({
  managerAddress,
  commitmentId,
  challengeWindowSecs,
  enabled,
}: UseForfeitProposalParams): UseForfeitProposalReturn {
  const { data, isLoading, refetch } = useReadCommitmentManagerGetForfeitProposal({
    address: managerAddress,
    args: commitmentId !== undefined ? [commitmentId] : undefined,
    query: {
      enabled:
        !!managerAddress &&
        commitmentId !== undefined &&
        enabled !== false,
      refetchInterval: 15_000,
    },
  })

  // Guard initiatedAt === 0n — Solidity returns zero-value struct when no proposal exists (Pitfall 2)
  const proposal =
    data && (data as { initiatedAt: bigint }).initiatedAt > 0n
      ? {
          initiatedAt: (data as { initiatedAt: bigint }).initiatedAt,
          penaltyBps: Number((data as { penaltyBps: number }).penaltyBps),
          executed: (data as { executed: boolean }).executed,
          cancelled: (data as { cancelled: boolean }).cancelled,
        }
      : undefined

  const state = getForfeitState(proposal, challengeWindowSecs)
  const deadline = proposal ? proposal.initiatedAt + challengeWindowSecs : 0n

  return {
    proposal,
    state,
    deadline,
    isLoading,
    refetch: () => void refetch(),
  }
}
