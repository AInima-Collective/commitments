/**
 * Hooks for the governance index page (`/governance`).
 *
 * Reads the indexer's /governors REST endpoint. Falls back to an empty list
 * when the indexer is offline (frontend stays usable; Notice shows "indexer
 * not configured").
 */
import { useQuery } from '@tanstack/react-query'
import type { Hex } from 'viem'

import { hasIndexer, indexerFetch } from '../config/indexer'

export interface GovernorRow {
  address: Hex
  timelock: Hex
  shim: Hex
  votingPowerSource: Hex
  name: string
  isCanonical: boolean
  factory: Hex
  deployer: Hex
  createdBlock: string
  createdTx: Hex
  votingDelay: string
  votingPeriod: string
  proposalThreshold: string
  quorumNumerator: string
  quorumDenominator: string
  timelockMinDelay: string
  proposalCounts: Record<string, number>
}

export function useGovernors(canonicalOnly = false) {
  return useQuery<GovernorRow[]>({
    enabled: hasIndexer,
    queryKey: ['governors', canonicalOnly] as const,
    queryFn: async () => {
      const path = canonicalOnly ? '/governors?canonical=1' : '/governors'
      const res = await indexerFetch(path)
      if (!res.ok) throw new Error(`Indexer error: ${res.status}`)
      return (await res.json()) as GovernorRow[]
    },
    refetchInterval: 15_000,
  })
}
