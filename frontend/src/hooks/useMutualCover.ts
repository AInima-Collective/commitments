import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { type Address } from 'viem'
import { useChainId } from 'wagmi'

import { hasIndexer, indexerFetch } from '../config/indexer'

/**
 * A single cover policy sold against a mutual, as returned in the `bindings`
 * array of the indexer's `GET /mutuals/:id/premium` endpoint (sourced from the
 * `coverBinding` table — one row per `LinkedMutualPolicy.CoverBound`, flipped
 * inactive by `BindingExpired`).
 */
export interface MutualCoverBinding {
  /** `${policy}-${bindingId}` — the indexer row key. */
  id: string
  policy: Address
  bindingId: bigint
  policyholder: Address
  /** Cover notional bound, raw numeraire (vault-share) units. */
  notional: bigint
  /** Unix second the cover expires. */
  expiry: bigint
  /** Premium paid up-front for this cover, raw numeraire units. */
  premiumPaid: bigint
  /** False once expired (flipped by BindingExpired). */
  active: boolean
}

/** Wire shape — bigints arrive as decimal strings. */
interface CoverBindingWire {
  id: string
  policy: string
  bindingId: string
  policyholder: string
  notional: string
  expiry: string
  premiumPaid: string
  active: boolean
}

interface PremiumFeedWire {
  bindings?: CoverBindingWire[]
}

export interface UseMutualCoverReturn {
  bindings: MutualCoverBinding[]
  isLoading: boolean
  isError: boolean
  error: Error | null
  /** True when no indexer is configured — the list can't be shown from chain. */
  unavailable: boolean
  refetch: () => void
}

function parseBinding(w: CoverBindingWire): MutualCoverBinding {
  return {
    id: w.id,
    policy: w.policy as Address,
    bindingId: BigInt(w.bindingId),
    policyholder: w.policyholder as Address,
    notional: BigInt(w.notional),
    expiry: BigInt(w.expiry),
    premiumPaid: BigInt(w.premiumPaid),
    active: w.active,
  }
}

/**
 * useMutualCover — the per-policyholder cover bindings sold against one Mutual,
 * from `GET /mutuals/:id/premium`. This is the "who bought cover" surface that
 * complements the aggregate `getActiveNotionalSold` read. Indexer-only (the
 * binding history isn't reconstructable from a single chain read), so it
 * tolerates an absent indexer via `unavailable`.
 */
export function useMutualCover(mutualId: bigint | undefined): UseMutualCoverReturn {
  const chainId = useChainId()
  const enabled = hasIndexer && mutualId !== undefined

  const query = useQuery<PremiumFeedWire>({
    enabled,
    queryKey: ['mutual-cover', chainId, mutualId?.toString()],
    queryFn: async () => {
      const res = await indexerFetch(`/mutuals/${mutualId!.toString()}/premium`)
      if (!res.ok) throw new Error(`Indexer error: ${res.status}`)
      return (await res.json()) as PremiumFeedWire
    },
    refetchInterval: 20_000,
    retry: false,
  })

  const bindings = useMemo(() => (query.data?.bindings ?? []).map(parseBinding), [query.data])

  return {
    bindings,
    isLoading: query.isLoading,
    isError: query.isError,
    error: (query.error as Error | null) ?? null,
    unavailable: !hasIndexer,
    refetch: () => {
      void query.refetch()
    },
  }
}
