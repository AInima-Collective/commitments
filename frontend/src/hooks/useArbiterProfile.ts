import { useQuery } from '@tanstack/react-query'
import { type Address, type PublicClient } from 'viem'
import { useChainId, usePublicClient } from 'wagmi'

import { findConfiguredArbiterProfile } from '../config/arbiters'
import {
  buildArbiterProfile,
  I_ARBITER_INTERFACE_ID,
  type ArbiterIntrospection,
  type ArbiterProfile,
  type IndependentRead,
} from '../lib/arbiterProfile'

const I_ARBITER_ABI = [
  {
    type: 'function',
    name: 'supportsInterface',
    stateMutability: 'view',
    inputs: [{ name: 'interfaceId', type: 'bytes4' }],
    outputs: [{ name: '', type: 'bool' }],
  },
  {
    type: 'function',
    name: 'commitmentManager',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'address' }],
  },
  {
    type: 'function',
    name: 'arbiterCapabilities',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'arbiterMetadataURI',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'string' }],
  },
] as const

async function independent<T>(read: () => Promise<T>): Promise<IndependentRead<T>> {
  try {
    return { status: 'success', value: await read() }
  } catch (error) {
    return { status: 'error', error: error instanceof Error ? error.message : String(error) }
  }
}
/** Every call is caught separately so one legacy/reverting selector cannot erase the profile. */
export async function readArbiterIntrospection(
  client: PublicClient,
  address: Address,
): Promise<ArbiterIntrospection> {
  const [code, interfaceSupport, reportedManager, capabilities, metadataURI] = await Promise.all([
    independent(() => client.getCode({ address })),
    independent(() =>
      client.readContract({
        address,
        abi: I_ARBITER_ABI,
        functionName: 'supportsInterface',
        args: [I_ARBITER_INTERFACE_ID],
      }),
    ),
    independent(() =>
      client.readContract({ address, abi: I_ARBITER_ABI, functionName: 'commitmentManager' }),
    ),
    independent(() =>
      client.readContract({ address, abi: I_ARBITER_ABI, functionName: 'arbiterCapabilities' }),
    ),
    independent(() =>
      client.readContract({ address, abi: I_ARBITER_ABI, functionName: 'arbiterMetadataURI' }),
    ),
  ])
  return { code, interfaceSupport, reportedManager, capabilities, metadataURI }
}

export function useArbiterProfile(
  address: Address | undefined,
  expectedManager: Address | undefined,
): {
  profile: ArbiterProfile | undefined
  isLoading: boolean
  error: Error | null
  refetch: () => void
} {
  const chainId = useChainId()
  const client = usePublicClient()
  const configured = findConfiguredArbiterProfile(chainId, address)
  const query = useQuery({
    enabled: Boolean(client && address),
    queryKey: ['arbiter-profile', chainId, address?.toLowerCase(), expectedManager?.toLowerCase()],
    queryFn: () => readArbiterIntrospection(client!, address!),
    staleTime: 30_000,
    refetchInterval: 60_000,
  })
  const profile =
    address && query.data
      ? buildArbiterProfile({ address, expectedManager, configured, introspection: query.data })
      : undefined
  return {
    profile,
    isLoading: query.isLoading,
    error: query.error as Error | null,
    refetch: () => void query.refetch(),
  }
}
