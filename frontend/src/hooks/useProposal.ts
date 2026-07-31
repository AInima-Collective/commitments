/**
 * Single-proposal hook. Reads /governors/:address/proposals/:id and returns
 * the proposal row + decoded actions + the latest 100 votes. State derivation
 * already happens server-side; the UI just renders.
 */
import { useQuery } from '@tanstack/react-query'
import type { Hex } from 'viem'

import { hasIndexer, indexerFetch } from '../config/indexer'
import type { ProposalRow } from './useGovernor'

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
      const res = await indexerFetch(`/governors/${governor}/proposals/${proposalId}`)
      if (res.status === 404) return null
      if (!res.ok) throw new Error(`Indexer error: ${res.status}`)
      return (await res.json()) as ProposalDetailPayload
    },
    refetchInterval: 10_000,
  })
}
