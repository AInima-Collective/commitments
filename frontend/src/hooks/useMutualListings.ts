import { useMemo } from 'react'
import { type Address } from 'viem'

import { useMutuals } from './useMutuals'

/**
 * A registered Mutual listing: the MutualRegistry terms plus the core
 * `Mutual`'s numeraire, beneficiary and filled capacity.
 */
export interface MutualListing {
  mutualId: bigint
  numeraire: Address
  beneficiary: Address
  /** Target underwriting capacity in numeraire units. */
  targetCapacity: bigint
  /** Filled capacity (sum of members' creditedValue) in numeraire units. */
  filled: bigint
  /** Loss-adjusted live coverage (raw numeraire units). */
  liveCapacity: bigint
  termEnd: bigint
  perilURI: string
  perilHash: `0x${string}`
}

export interface UseMutualListingsReturn {
  listings: MutualListing[]
  isLoading: boolean
  refetch: () => void
}

/**
 * useMutualListings — every mutual registered in the MutualRegistry, from the
 * indexer's `GET /mutuals` (the registry terms ride on the mutual row). Empty
 * without an indexer.
 */
export function useMutualListings(): UseMutualListingsReturn {
  const { mutuals, isLoading, refetch } = useMutuals()
  const listings = useMemo<MutualListing[]>(
    () =>
      mutuals.flatMap((m) =>
        m.targetCapacity === null
          ? []
          : [
              {
                mutualId: m.mutualId,
                numeraire: m.numeraire,
                beneficiary: m.beneficiary,
                targetCapacity: m.targetCapacity,
                filled: m.totalShares,
                liveCapacity: m.liveCapacity,
                termEnd: m.termEnd,
                perilURI: m.perilURI,
                perilHash: m.perilHash,
              },
            ],
      ),
    [mutuals],
  )
  return { listings, isLoading, refetch }
}
