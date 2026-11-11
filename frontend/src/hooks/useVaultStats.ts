import { useReadContract } from 'wagmi'
import { type Address } from 'viem'
import { commitmentsVaultAbi } from '../generated'
import { POLL } from './polling'

export interface VaultStats {
  /** Underlying assets currently held by the vault (TVL in asset units). */
  totalAssets: bigint | undefined
  /** Total shares outstanding (sum of every depositor's `balanceOf`). */
  totalSupply: bigint | undefined
  isLoading: boolean
}

/**
 * Vault-wide aggregates. Separate from `useVaultPosition` because these reads
 * don't depend on a viewer address — anonymous viewers can still see TVL.
 */
export function useVaultStats(vaultAddress: Address | undefined): VaultStats {
  const enabled = !!vaultAddress
  const queryOpts = { enabled, refetchInterval: POLL.fast }

  const { data: totalAssets, isLoading: tvlLoading } = useReadContract({
    abi: commitmentsVaultAbi,
    functionName: 'totalAssets',
    address: vaultAddress,
    query: queryOpts,
  })
  const { data: totalSupply, isLoading: supplyLoading } = useReadContract({
    abi: commitmentsVaultAbi,
    functionName: 'totalSupply',
    address: vaultAddress,
    query: queryOpts,
  })

  return {
    totalAssets: totalAssets as bigint | undefined,
    totalSupply: totalSupply as bigint | undefined,
    isLoading: tvlLoading || supplyLoading,
  }
}
