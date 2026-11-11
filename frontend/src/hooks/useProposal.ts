/**
 * Single-proposal hook. Reads /governors/:address/proposals/:id and returns
 * the proposal row + decoded actions + the latest 100 votes. State derivation
 * already happens server-side; the UI just renders.
 */
import { useQuery } from '@tanstack/react-query'
import type { Hex } from 'viem'

import { hasIndexer, indexerJsonOrNull } from '../config/indexer'
import type { ProposalRow } from './useGovernor'
import { POLL } from './polling'

export interface ProposalActionPayload {
  index: number
  target: Hex
  value: string
  calldata: Hex
  kind: string
  selector: Hex | null
  decoded: unknown
}

export interface VotePayload {
  voter: Hex
  support: number
  weight: string
  reason: string
  blockNumber: string
  blockTimestamp: string
  txHash: Hex
}

export interface ProposalDetailPayload {
  proposal: ProposalRow
  actions: ProposalActionPayload[]
  votes: VotePayload[]
}

export function useProposal(governor: Hex | undefined, proposalId: string | undefined) {
  return useQuery<ProposalDetailPayload | null>({
    enabled: hasIndexer && Boolean(governor) && Boolean(proposalId),
    queryKey: ['proposal', governor?.toLowerCase(), proposalId] as const,
    queryFn: async () => {
      if (!governor || !proposalId) return null
      return indexerJsonOrNull<ProposalDetailPayload>(`/governors/${governor}/proposals/${proposalId}`)
    },
    refetchInterval: POLL.fast,
  })
}
