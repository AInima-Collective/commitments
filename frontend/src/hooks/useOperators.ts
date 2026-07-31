import { useReadContracts } from 'wagmi'
import { type Address, type ReadContractReturnType } from 'viem'
import { operatorRegistryAbi } from '../generated'
import { type OperatorInfo, deriveOperatorStatus, type OperatorStatus } from '../utils/mesh'

/** ABI-derived shape of `getOperator`'s returned struct. */
type OperatorStruct = ReadContractReturnType<typeof operatorRegistryAbi, 'getOperator'>

interface UseOperatorsOptions {
  registryAddress: Address | undefined
}

interface OperatorWithStatus extends OperatorInfo {
  status: OperatorStatus
  belowMinStake: boolean
}

export function useOperators({ registryAddress }: UseOperatorsOptions) {
  // Step 1: Get operator set (all addresses in one call)
  const { data: setResult, isLoading: isLoadingSet, refetch } = useReadContracts({
    contracts: [{
      abi: operatorRegistryAbi,
      address: registryAddress!,
      functionName: 'getOperatorSet',
    }],
    query: { enabled: !!registryAddress },
  })

  const addresses = (setResult?.[0]?.status === 'success' ? setResult[0].result : []) as Address[]

  // Step 2: Batch-fetch Operator structs for each address
  const { data: operatorResults, isLoading: isLoadingData } = useReadContracts({
    contracts: addresses.map((addr) => ({
      abi: operatorRegistryAbi,
      address: registryAddress!,
      functionName: 'getOperator' as const,
      args: [addr] as const,
    })),
    query: { enabled: addresses.length > 0, refetchInterval: 30_000 },
  })

  // Build typed operator list
  const operators: OperatorWithStatus[] = addresses.map((addr, i) => {
    const result = operatorResults?.[i]
    if (result?.status !== 'success' || !result.result) {
      return {
        address: addr,
        active: false,
        selfStakeCommitmentId: 0n,
        totalDelegatedStake: 0n,
        activeDelegationCount: 0n,
        registeredAt: 0n,
        belowMinStake: false,
        status: 'INACTIVE' as const,
      }
    }
    const op = result.result as OperatorStruct
    const info: OperatorInfo = {
      address: addr,
      active: op.active,
      selfStakeCommitmentId: op.selfStakeCommitmentId,
      totalDelegatedStake: op.totalDelegatedStake,
      activeDelegationCount: BigInt(op.activeDelegationCount),
      registeredAt: op.registeredAt,
    }
    const belowMinStake = op.belowMinStake
    // Use belowMinStake from contract when available; deriveOperatorStatus handles minStake threshold
    const status = belowMinStake
      ? ('BELOW_MIN_STAKE' as const)
      : deriveOperatorStatus(info)
    return { ...info, belowMinStake, status }
  })

  return {
    operators,
    isLoading: isLoadingSet || isLoadingData,
    refetch,
  }
}
