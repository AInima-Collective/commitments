import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { type Address } from 'viem'
import { useChainId } from 'wagmi'

import { getVaultRegistry, type VaultDescriptor } from '../config/contracts'
import { hasIndexer, indexerGraphqlData } from '../config/indexer'
import { truncateAddress } from '../lib/format'
import { POLL } from './polling'

interface VaultWire {
  address: string
  asset: string | null
  name: string | null
  symbol: string | null
  assetSymbol: string | null
  assetDecimals: number | null
}

const QUERY = /* GraphQL */ `
  query Vaults {
    vaults(orderBy: "deployedBlock", orderDirection: "asc", limit: 1000) {
      items { address asset name symbol assetSymbol assetDecimals }
    }
  }
`

function toDescriptor(w: VaultWire): VaultDescriptor {
  const assetSymbol = w.assetSymbol ?? w.symbol ?? 'TOKEN'
  return {
    address: w.address as Address,
    name: w.name ?? undefined,
    assetSymbol,
    asset: (w.asset ?? undefined) as Address | undefined,
    assetDecimals: w.assetDecimals ?? undefined,
  }
}

export interface UseVaultsReturn {
  vaults: VaultDescriptor[]
  /** Case-insensitive lookup by vault address. */
  vaultFor: (address: string | null | undefined) => VaultDescriptor | undefined
  /** The vault's name, or `vault 0x1234…abcd` when it has none. */
  vaultName: (address: Address) => string
  isLoading: boolean
}

/**
 * Every factory-deployed vault, from the indexer's `vault` table, oldest
 * first. Until the first answer (or without an indexer) it is the env list
 * from {@link getVaultRegistry}; a failed refetch keeps the last list.
 */
export function useVaults(): UseVaultsReturn {
  const chainId = useChainId()
  const query = useQuery({
    enabled: hasIndexer,
    queryKey: ['vaults', chainId],
    queryFn: async () => (await indexerGraphqlData<{ vaults: { items: VaultWire[] } }>(QUERY)).vaults.items,
    refetchInterval: POLL.idle,
    retry: false,
  })
  const vaults = useMemo(
    () => (query.data ? query.data.map(toDescriptor) : getVaultRegistry(chainId)),
    [query.data, chainId],
  )
  const isLoading = hasIndexer && query.isLoading
  return useMemo(() => {
    const byAddress = new Map(vaults.map((v) => [v.address.toLowerCase(), v]))
    const vaultFor = (address: string | null | undefined) => (address ? byAddress.get(address.toLowerCase()) : undefined)
    return {
      vaults,
      vaultFor,
      vaultName: (address: Address) => vaultFor(address)?.name ?? `vault ${truncateAddress(address)}`,
      isLoading,
    }
  }, [vaults, isLoading])
}
