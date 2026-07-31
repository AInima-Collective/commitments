/**
 * Hooks for a single Governor instance and its proposals.
 *
 * Reads /governors/:address and /governors/:address/proposals from the
 * indexer. State derivation already happens server-side; the frontend
 * just renders.
 */
import { useQuery } from '@tanstack/react-query'
import type { Hex } from 'viem'

import { hasIndexer, indexerFetch } from '../config/indexer'
import type { GovernorRow } from './useGovernors'

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
      const res = await indexerFetch(`/governors/${address}`)
      if (res.status === 404) return null
      if (!res.ok) throw new Error(`Indexer error: ${res.status}`)
      return (await res.json()) as GovernorDetailPayload
    },
    refetchInterval: 15_000,
  })
}

export interface ProposalsPage {
  rows: ProposalRow[]
  hasNext: boolean
  nextCursor: string | null
}

export interface ProposalsFilter {
  state?: string
  kind?: string
  proposer?: Hex
  limit?: number
  cursor?: string
}

export function useProposals(governor: Hex | undefined, filter: ProposalsFilter = {}) {
  return useQuery<ProposalsPage | null>({
    enabled: hasIndexer && Boolean(governor),
    queryKey: ['proposals', governor?.toLowerCase(), filter] as const,
    queryFn: async () => {
      if (!governor) return null
      const params = new URLSearchParams()
      if (filter.state) params.set('state', filter.state)
      if (filter.kind) params.set('kind', filter.kind)
      if (filter.proposer) params.set('proposer', filter.proposer)
      if (filter.limit != null) params.set('limit', String(filter.limit))
      if (filter.cursor) params.set('cursor', filter.cursor)
      const qs = params.toString()
      const path = `/governors/${governor}/proposals${qs ? `?${qs}` : ''}`
      const res = await indexerFetch(path)
      if (!res.ok) throw new Error(`Indexer error: ${res.status}`)
      return (await res.json()) as ProposalsPage
    },
    refetchInterval: 15_000,
  })
}
