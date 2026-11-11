import { useQuery } from '@tanstack/react-query'
import type { Address, Hex } from 'viem'

import { hasIndexer, indexerJson } from '../config/indexer'

export type MeshDenomWeight = {
  denom: Hex
  weightBps: bigint
  updatedBlock: bigint
}

export type FanInProviderRow = {
  provider: Address
  denomIn: Hex
  denomOut: Hex
  maxPenaltyBps: number
  unbondingPeriod: bigint
  registeredBlock: bigint
}

export type MeshNodeSecurity = {
  address: Address | null
  weights: MeshDenomWeight[]
  providers: FanInProviderRow[]
}

type RawResponse = {
  address: string
  weights: Array<{ denom: string; weightBps: string; updatedBlock: string }>
  providers: Array<{
    provider: string
    denomIn: string
    denomOut: string
    maxPenaltyBps: number
    unbondingPeriod: string
    registeredBlock: string
  }>
}

/**
 * Fetch per-(node, denom) security parameters from the indexer's
 * `/graph/mesh-security` endpoint. Returns the TokenWeighting weights and the
 * FanInNode provider rows for the queried address. Empty arrays for
 * FanOutNode (no security state indexed today).
 *
 * Used by `WeightUpdateForm` to show a node's current `weightBps` alongside
 * the proposed value — one indexer round-trip per node.
 */
export function useMeshNodeSecurity(address: Address | null | undefined): {
  data: MeshNodeSecurity | undefined
  isLoading: boolean
  error: unknown
} {
  const query = useQuery({
    enabled: hasIndexer && !!address,
    queryKey: ['mesh-security', address ?? null],
    queryFn: async (): Promise<MeshNodeSecurity> => {
      const raw = await indexerJson<RawResponse>(`/graph/mesh-security?address=${address}`)
      return {
        address: raw.address as Address,
        weights: raw.weights.map((w) => ({
          denom: w.denom as Hex,
          weightBps: BigInt(w.weightBps),
          updatedBlock: BigInt(w.updatedBlock),
        })),
        providers: raw.providers.map((p) => ({
          provider: p.provider as Address,
          denomIn: p.denomIn as Hex,
          denomOut: p.denomOut as Hex,
          maxPenaltyBps: p.maxPenaltyBps,
          unbondingPeriod: BigInt(p.unbondingPeriod),
          registeredBlock: BigInt(p.registeredBlock),
        })),
      }
    },
    staleTime: 30_000,
  })

  return {
    data: query.data,
    isLoading: query.isLoading,
    error: query.error,
  }
}
