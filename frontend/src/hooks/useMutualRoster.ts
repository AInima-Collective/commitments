import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { type Address } from 'viem'
import { useChainId } from 'wagmi'

import { hasIndexer, indexerJson } from '../config/indexer'
import { POLL } from './polling'

/**
 * A single mutual member, as returned by the indexer's
 * `GET /mutuals/:id/members` endpoint. All amounts are raw units except
 * `lossSnapshot`, which is 1e18-scaled (Λ at the member's last snapshot).
 */
export interface MutualRosterMember {
  commitmentId: bigint
  committer: Address
  /** Eᵢ — the member's forfeitable units exposed to shared loss. */
  forfeitableUnits: bigint
  /** Units already settled to the beneficiary. */
  settledUnits: bigint
  /** Value credited at join (== forfeitableUnits in homogeneous mode). */
  creditedValue: bigint
  /** Member's Λ snapshot (1e18-scaled) at join / last settlement. */
  lossSnapshot: bigint
  /** Live owed markdown = Eᵢ·(Λ − lossSnapshot)/1e18, raw units. */
  owedUnits: bigint
  /** 0 unless the member has requested exit (deallocation window running). */
  unbondRequestedAt: number
}

/** Wire shape — bigints arrive as decimal strings. */
interface MutualRosterWire {
  commitmentId: string
  committer: string
  forfeitableUnits: string
  settledUnits: string
  creditedValue: string
  lossSnapshot: string
  owedUnits: string
  unbondRequestedAt: number
}

export interface UseMutualRosterReturn {
  members: MutualRosterMember[]
  /** True when the indexer is configured and the roster query is in flight. */
  isLoading: boolean
  isError: boolean
  error: Error | null
  /** True when no indexer is configured — caller should fall back to chain. */
  unavailable: boolean
  refetch: () => void
}

function parseMember(w: MutualRosterWire): MutualRosterMember {
  return {
    commitmentId: BigInt(w.commitmentId),
    committer: w.committer as Address,
    forfeitableUnits: BigInt(w.forfeitableUnits),
    settledUnits: BigInt(w.settledUnits),
    creditedValue: BigInt(w.creditedValue),
    lossSnapshot: BigInt(w.lossSnapshot),
    owedUnits: BigInt(w.owedUnits),
    unbondRequestedAt: w.unbondRequestedAt,
  }
}

/**
 * useMutualRoster — the FULL, mutual-wide membership roster for one Mutual
 * from `GET /mutuals/:id/members`. This is the authoritative source for
 * mutual-wide settlement progress (every member, not just the viewer's own
 * positions). Tolerates an absent indexer via `unavailable`.
 */
export function useMutualRoster(mutualId: bigint | undefined): UseMutualRosterReturn {
  const chainId = useChainId()
  const enabled = hasIndexer && mutualId !== undefined

  const query = useQuery<MutualRosterWire[]>({
    enabled,
    queryKey: ['mutual-roster', chainId, mutualId?.toString()],
    queryFn: async () => {
      return indexerJson<MutualRosterWire[]>(`/mutuals/${mutualId!.toString()}/members`)
    },
    refetchInterval: POLL.fast,
    retry: false,
  })

  const members = useMemo(() => (query.data ?? []).map(parseMember), [query.data])

  return {
    members,
    isLoading: query.isLoading,
    isError: query.isError,
    error: (query.error as Error | null) ?? null,
    unavailable: !hasIndexer,
    refetch: () => {
      void query.refetch()
    },
  }
}
