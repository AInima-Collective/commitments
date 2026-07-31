import { useReadContracts } from 'wagmi'
import { type Address } from 'viem'
import { operatorRegistryAbi } from '../generated'

/**
 * Result shape for `useRegistryPolicy`.
 *
 * The four value fields are `undefined` while the multicall is pending or
 * if any individual read failed. `error` surfaces the first non-null wagmi
 * error encountered (top-level or per-call). The hook does not retry.
 */
export interface RegistryPolicy {
  requiredArbiter: Address | undefined
  /** v2: backing token operators must stake (`getAcceptancePolicy()` tuple[2]).
   *  Zero address means any token is accepted. */
  requiredToken: Address | undefined
  minOperatorStake: bigint | undefined
  minMaxPenaltyBps: number | undefined
  maxDelegationsPerOperator: number | undefined
  isLoading: boolean
  error: Error | null
}

/**
 * Multicall reader for the four `OperatorRegistry` policy fields surfaced by
 * the Phase 21 `<ServicePolicyCard>`:
 *
 *   - `requiredArbiter`           — from `getAcceptancePolicy()` tuple[0]
 *   - `minMaxPenaltyBps`          — from `getAcceptancePolicy()` tuple[1]
 *   - `minOperatorStake`          — uint256
 *   - `maxDelegationsPerOperator` — uint256, coerced to `number` for UI
 *
 * `getAcceptancePolicy()` returns the pair `(address arbiter, uint16 floor)`.
 * The hook decomposes that tuple so callers consume four flat fields.
 *
 * No `refetchInterval`; registry policy changes via on-chain governance only.
 * The hook fires no RPC when `registryAddress` is undefined.
 */
export function useRegistryPolicy(
  registryAddress: Address | undefined,
): RegistryPolicy {
  const { data, isLoading, error } = useReadContracts({
    contracts: [
      {
        abi: operatorRegistryAbi,
        address: registryAddress!,
        functionName: 'getAcceptancePolicy',
      },
      {
        abi: operatorRegistryAbi,
        address: registryAddress!,
        functionName: 'minOperatorStake',
      },
      {
        abi: operatorRegistryAbi,
        address: registryAddress!,
        functionName: 'maxDelegationsPerOperator',
      },
    ],
    query: { enabled: !!registryAddress },
  })

  // Untouched if no address: return shape per UI-SPEC §"useRegistryPolicy".
  if (!registryAddress) {
    return {
      requiredArbiter: undefined,
      requiredToken: undefined,
      minOperatorStake: undefined,
      minMaxPenaltyBps: undefined,
      maxDelegationsPerOperator: undefined,
      isLoading: false,
      error: null,
    }
  }

  const policyEntry = data?.[0]
  const minStakeEntry = data?.[1]
  const maxDelegEntry = data?.[2]

  // Decompose the (address arbiter, uint16 floor, address requiredToken) tuple
  // from getAcceptancePolicy (v2 added requiredToken).
  let requiredArbiter: Address | undefined
  let minMaxPenaltyBps: number | undefined
  let requiredToken: Address | undefined
  if (policyEntry?.status === 'success' && policyEntry.result) {
    const tuple = policyEntry.result as readonly [Address, number, Address]
    requiredArbiter = tuple[0]
    minMaxPenaltyBps = Number(tuple[1])
    requiredToken = tuple[2]
  }

  const minOperatorStake =
    minStakeEntry?.status === 'success' && minStakeEntry.result !== undefined
      ? (minStakeEntry.result as bigint)
      : undefined

  const maxDelegationsPerOperator =
    maxDelegEntry?.status === 'success' && maxDelegEntry.result !== undefined
      ? Number(maxDelegEntry.result as bigint)
      : undefined

  // Surface the first encountered error: prefer top-level, then per-call.
  let firstError: Error | null = error ?? null
  if (!firstError) {
    for (const entry of [policyEntry, minStakeEntry, maxDelegEntry]) {
      if (entry?.status === 'failure' && entry.error) {
        firstError = entry.error as Error
        break
      }
    }
  }

  return {
    requiredArbiter,
    requiredToken,
    minOperatorStake,
    minMaxPenaltyBps,
    maxDelegationsPerOperator,
    isLoading,
    error: firstError,
  }
}
