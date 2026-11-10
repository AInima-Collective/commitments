/**
 * Hook for a single Governor instance.
 *
 * Reads /governors/:address from the indexer. State derivation already happens server-side; the frontend
 * just renders.
 */
import { useQuery } from '@tanstack/react-query'
import type { Hex } from 'viem'

import { hasIndexer, indexerJsonOrNull } from '../config/indexer'
import type { GovernorRow } from './useGovernors'
import { POLL } from './polling'

export interface ProposalRow {
  id: string
  governor: Hex
  proposalId: string
  proposer: Hex
  description: string
  descriptionHash: Hex
  voteStart: string
  voteEnd: string
  eta: string | null
  forVotes: string
  againstVotes: string
  abstainVotes: string
  quorumAtSnapshot: string | null
  state: string
  persistedState: string
  kind: string
  createdBlock: string
  createdTx: Hex
  canceledBlock: string | null
  canceledTx: Hex | null
  queuedBlock: string | null
  queuedTx: Hex | null
  executedBlock: string | null
  executedTx: Hex | null
}

export interface GovernorDetailPayload extends GovernorRow {
  recentProposals: ProposalRow[]
}

export function useGovernor(address: Hex | undefined) {
  return useQuery<GovernorDetailPayload | null>({
    enabled: hasIndexer && Boolean(address),
    queryKey: ['governor', address?.toLowerCase()] as const,
    queryFn: async () => {
      if (!address) return null
      return indexerJsonOrNull<GovernorDetailPayload>(`/governors/${address}`)
    },
    refetchInterval: POLL.fast,
  })
}
