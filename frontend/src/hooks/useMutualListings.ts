import { useMemo } from 'react'
import { type Address } from 'viem'
import { useChainId, useReadContract, useReadContracts } from 'wagmi'

import { mutualRegistryAbi } from '../generated'
import { getContractAddresses } from '../config/contracts'
import { useMutuals } from './useMutuals'

/** A registered Mutual listing (the `getMutualListing` tuple + live capacity). */
export interface MutualListing {
  mutualId: bigint
  creator: Address
  numeraire: Address
  beneficiary: Address
  /** Target underwriting capacity in numeraire units. */
  targetCapacity: bigint
  /** Filled capacity (sum of members' creditedValue) in numeraire units. */
  filled: bigint
  /**
   * Loss-adjusted live coverage (raw numeraire units) from the indexer's
   * `GET /mutuals`. `undefined` when the indexer hasn't supplied this mutual.
   */
  liveCapacity: bigint | undefined
  termEnd: bigint
  perilURI: string
  perilHash: `0x${string}`
  isFilled: boolean
}

export interface UseMutualListingsReturn {
  listings: MutualListing[]
  isLoading: boolean
  refetch: () => void
}

/**
 * useMutualListings — lists every registered Mutual listing.
 *
 * Indexer-plus-chain merge strategy: when `VITE_INDEXER_URL` is set it
 * pulls the denormalized list from the indexer's `/mutuals` endpoint; either
 * way it reads `allMutualIds` from the on-chain `MutualRegistry` and fans out
 * `getMutualListing` + `capacity` + `isFilled` so the list renders fresh values
 * without waiting on the indexer. Chain reads win where both exist.
 */
export function useMutualListings(): UseMutualListingsReturn {
  const chainId = useChainId()
  const registry = getContractAddresses(chainId).mutualRegistry

  // Optional indexer enrichment — tolerated absent. The `GET /mutuals` endpoint
  // carries the loss-adjusted `liveCapacity` and the canonical numeraire /
  // beneficiary; the registry-only fields (creator, targetCapacity, peril,
  // term) come from chain below.
  const indexed = useMutuals()

  const {
    data: idsRaw,
    isLoading: idsLoading,
    refetch: refetchIds,
  } = useReadContract({
    abi: mutualRegistryAbi,
    address: registry,
    functionName: 'allMutualIds',
    query: { enabled: Boolean(registry), refetchInterval: 30_000 },
  })

  const ids = useMemo(() => (idsRaw as readonly bigint[] | undefined) ?? [], [idsRaw])

  // Three reads per mutual: getMutualListing, capacity (filled/target), isFilled.
  const contracts = useMemo(
    () =>
      ids.flatMap((id) => [
        { abi: mutualRegistryAbi, address: registry, functionName: 'getMutualListing' as const, args: [id] as const },
        { abi: mutualRegistryAbi, address: registry, functionName: 'capacity' as const, args: [id] as const },
        { abi: mutualRegistryAbi, address: registry, functionName: 'isFilled' as const, args: [id] as const },
      ]),
    [ids, registry],
  )

  const {
    data: detailRaw,
    isLoading: detailLoading,
    refetch: refetchDetail,
  } = useReadContracts({
    contracts,
    query: { enabled: Boolean(registry) && ids.length > 0, refetchInterval: 20_000 },
  })

  const listings = useMemo<MutualListing[]>(() => {
    return ids.map((id, i) => {
      const s = detailRaw?.[i * 3]?.result as
        | {
            mutualId: bigint
            creator: Address
            numeraire: Address
            beneficiary: Address
            targetCapacity: bigint
            termEnd: bigint
            perilURI: string
            perilHash: `0x${string}`
          }
        | undefined
      const cap = detailRaw?.[i * 3 + 1]?.result as readonly [bigint, bigint] | undefined
      const filledFlag = detailRaw?.[i * 3 + 2]?.result as boolean | undefined

      // Indexer enrichment for the canonical mutual header + live capacity.
      const grp = indexed.byId.get(id)

      const filled = cap?.[0] ?? grp?.totalShares ?? 0n
      const target = s?.targetCapacity ?? 0n

      return {
        mutualId: id,
        creator: (s?.creator ?? ZERO) as Address,
        numeraire: (s?.numeraire ?? grp?.numeraire ?? ZERO) as Address,
        beneficiary: (s?.beneficiary ?? grp?.beneficiary ?? ZERO) as Address,
        targetCapacity: target,
        filled,
        liveCapacity: grp?.liveCapacity,
        termEnd: s?.termEnd ?? 0n,
        perilURI: s?.perilURI ?? '',
        perilHash: (s?.perilHash ?? EMPTY_HASH),
        isFilled: filledFlag ?? (target > 0n && filled >= target),
      }
    })
  }, [ids, detailRaw, indexed.byId])

  return {
    listings,
    isLoading: idsLoading || detailLoading || indexed.isLoading,
    refetch: () => {
      void refetchIds()
      void refetchDetail()
      indexed.refetch()
    },
  }
}

const ZERO = '0x0000000000000000000000000000000000000000'
const EMPTY_HASH = '0x0000000000000000000000000000000000000000000000000000000000000000' as const
