import { useReadContracts } from 'wagmi'
import { type Address, zeroAddress } from 'viem'
import { operatorServiceRegistryAbi } from '../generated'
import { type ServiceOperatorInfo } from '../utils/mesh'
import { POLL } from './polling'

interface UseServiceOperatorsOptions {
  stakeRegistryAddress: Address | undefined
  operatorAddresses: Address[]
}

export function useServiceOperators({ stakeRegistryAddress, operatorAddresses }: UseServiceOperatorsOptions) {
  const enabled = !!stakeRegistryAddress && operatorAddresses.length > 0

  // Batch: for each operator, read registeredInService + signingKey + votingPower
  // Plus a global read: getTotalPower.
  const perOperatorContracts = operatorAddresses.flatMap((addr) => [
    {
      abi: operatorServiceRegistryAbi,
      address: stakeRegistryAddress!,
      functionName: 'operatorRegistered' as const,
      args: [addr] as const,
    },
    {
      abi: operatorServiceRegistryAbi,
      address: stakeRegistryAddress!,
      functionName: 'getLatestOperatorSigningKey' as const,
      args: [addr] as const,
    },
    {
      abi: operatorServiceRegistryAbi,
      address: stakeRegistryAddress!,
      functionName: 'getOperatorWeight' as const,
      args: [addr] as const,
    },
  ])

  const globalContracts = [
    {
      abi: operatorServiceRegistryAbi,
      address: stakeRegistryAddress!,
      functionName: 'getTotalPower' as const,
    },
  ]

  const { data: results, isLoading } = useReadContracts({
    contracts: [...perOperatorContracts, ...globalContracts],
    query: { enabled, refetchInterval: POLL.slow },
  })

  // Parse per-operator results (3 calls per operator)
  const serviceOperators: ServiceOperatorInfo[] = operatorAddresses.map((addr, i) => {
    const base = i * 3
    const registered = results?.[base]?.status === 'success' ? (results[base].result as boolean) : false
    const rawKey = results?.[base + 1]?.status === 'success' ? (results[base + 1].result as Address) : zeroAddress
    const power = results?.[base + 2]?.status === 'success' ? (results[base + 2].result as bigint) : 0n

    return {
      address: addr,
      registeredInService: registered,
      signingKey: rawKey === zeroAddress ? null : rawKey,
      votingPower: power,
    }
  })

  // Parse global results
  const globalBase = operatorAddresses.length * 3
  const totalPower = results?.[globalBase]?.status === 'success'
    ? (results[globalBase].result as bigint)
    : 0n

  return {
    serviceOperators,
    totalPower,
    isLoading,
  }
}
