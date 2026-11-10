import { useMemo } from 'react'
import { type Address } from 'viem'
import { useChainId, useReadContract, useReadContracts } from 'wagmi'

import { commitmentManagerAbi, mutualRegistryAbi } from '../generated'
import { getContractAddresses } from '../config/contracts'
import { useMutuals } from './useMutuals'

/**
 * A registered Mutual listing: the `getMutualListing` terms plus the core
 * `Mutual`'s numeraire, beneficiary and filled capacity.
 */
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
 * `getMutualListing` plus the manager's `getMutual` (numeraire, beneficiary,
 * `totalShares`) so the list renders fresh values without waiting on the
 * indexer. Chain reads win where both exist.
 */
export function useMutualListings(): UseMutualListingsReturn {
  const chainId = useChainId()
  const { mutualRegistry: registry, commitmentManager: manager } = getContractAddresses(chainId)

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

  // Two reads per mutual: the registry's listing and the core Mutual.
  const contracts = useMemo(
    () =>
      ids.flatMap((id) => [
        { abi: mutualRegistryAbi, address: registry, functionName: 'getMutualListing' as const, args: [id] as const },
        { abi: commitmentManagerAbi, address: manager, functionName: 'getMutual' as const, args: [id] as const },
      ]),
    [ids, registry, manager],
  )

  const {
    data: detailRaw,
    isLoading: detailLoading,
    refetch: refetchDetail,
  } = useReadContracts({
    contracts,
    query: { enabled: Boolean(registry) && Boolean(manager) && ids.length > 0, refetchInterval: 20_000 },
  })

  const listings = useMemo<MutualListing[]>(() => {
    return ids.map((id, i) => {
      const s = detailRaw?.[i * 2]?.result as
        | {
            creator: Address
            targetCapacity: bigint
            termEnd: bigint
            perilURI: string
            perilHash: `0x${string}`
          }
        | undefined
      const core = detailRaw?.[i * 2 + 1]?.result as
        | { numeraire: Address; beneficiary: Address; totalShares: bigint }
        | undefined

      // Indexer enrichment for the canonical mutual header + live capacity.
      const grp = indexed.byId.get(id)

      const filled = core?.totalShares ?? grp?.totalShares ?? 0n
      const target = s?.targetCapacity ?? 0n

      return {
        mutualId: id,
        creator: (s?.creator ?? ZERO) as Address,
        numeraire: (core?.numeraire ?? grp?.numeraire ?? ZERO) as Address,
        beneficiary: (core?.beneficiary ?? grp?.beneficiary ?? ZERO) as Address,
        targetCapacity: target,
        filled,
        liveCapacity: grp?.liveCapacity,
        termEnd: s?.termEnd ?? 0n,
        perilURI: s?.perilURI ?? '',
        perilHash: (s?.perilHash ?? EMPTY_HASH),
        isFilled: s !== undefined && filled >= target,
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
