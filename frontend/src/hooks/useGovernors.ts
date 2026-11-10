/**
 * Hooks for the governance index page (`/governance`).
 *
 * Reads the indexer's /governors REST endpoint. Falls back to an empty list
 * when the indexer is offline (frontend stays usable; Notice shows "indexer
 * not configured").
 */
import { useQuery } from '@tanstack/react-query'
import type { Hex } from 'viem'

import { hasIndexer, indexerJson } from '../config/indexer'
import { POLL } from './polling'

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
      return indexerJson<GovernorRow[]>(path)
    },
    refetchInterval: POLL.fast,
  })
}
