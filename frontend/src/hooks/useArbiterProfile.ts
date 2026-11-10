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
import { POLL } from './polling'

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
    return { status: 'failed', error: error instanceof Error ? error.message : String(error) }
  }
}

function skipped<T>(status: IndependentRead<T>['status']): IndependentRead<T> {
  return { status }
}

/**
 * A selector revert on a contract that has not claimed ERC-165/IArbiter is a
 * normal legacy-contract result. Transport/RPC failures remain verification
 * failures because they say nothing about the implementation.
 */
function isContractRevert(error: string | undefined): boolean {
  const message = error?.toLowerCase() ?? ''
  return [
    'execution reverted',
    'contract function execution error',
    'returned no data',
    'function selector was not recognized',
  ].some((needle) => message.includes(needle))
}
/** Every call is caught separately so one legacy/reverting selector cannot erase the profile. */
export async function readArbiterIntrospection(
  client: PublicClient,
  address: Address,
): Promise<ArbiterIntrospection> {
  // Classification is intentionally first. Calling contract selectors on an
  // EOA produces provider-dependent empty-data errors that are not evidence of
  // partial introspection.
  const code = await independent(() => client.getCode({ address }))
  if (code.status !== 'success') {
    return {
      code,
      interfaceSupport: skipped('unknown'),
      reportedManager: skipped('unknown'),
      capabilities: skipped('unknown'),
      metadataURI: skipped('unknown'),
    }
  }
  if (!code.value || code.value === '0x') {
    return {
      code,
      interfaceSupport: skipped('not-applicable'),
      reportedManager: skipped('not-applicable'),
      capabilities: skipped('not-applicable'),
      metadataURI: skipped('not-applicable'),
    }
  }

  let interfaceSupport = await independent(() =>
    client.readContract({
      address,
      abi: I_ARBITER_ABI,
      functionName: 'supportsInterface',
      args: [I_ARBITER_INTERFACE_ID],
    }),
  )
  if (interfaceSupport.status === 'failed' && isContractRevert(interfaceSupport.error)) {
    interfaceSupport = { status: 'not-declared' }
  }
  if (interfaceSupport.status === 'success' && interfaceSupport.value === false) {
    interfaceSupport = { status: 'unsupported', value: false }
  }
  if (interfaceSupport.status !== 'success' || interfaceSupport.value !== true) {
    const status = interfaceSupport.status === 'failed' ? 'unknown' : 'not-declared'
    return {
      code,
      interfaceSupport,
      reportedManager: skipped(status),
      capabilities: skipped(status),
      metadataURI: skipped(status),
    }
  }

  // Once the contract positively claims IArbiter, every required selector is
  // read independently so incomplete implementations stay partially useful.
  const [reportedManager, capabilities, metadataURI] = await Promise.all([
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
    refetchInterval: POLL.idle,
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
