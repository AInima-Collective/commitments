/**
 * Reads the connected account's current voting power from the Governor's
 * IVotes-shaped voting source (the `TokenWeightingVotesShim`). Returns
 * raw uint256 — callers format it through `<TokenAmount>` or
 * `formatTokenAmount` per the design contract.
 */
import { type Address, type Hex } from 'viem'
import { useAccount, useReadContract } from 'wagmi'

import { tokenWeightingVotesShimAbi } from '../generated'
import { POLL } from './polling'

export interface UseVotingPowerOptions {
  /** Override the connected wallet — useful for displaying another account. */
  account?: Address
}

export interface VotingPowerResult {
  /** Current voting power, in raw IVotes units (1e18 for the canonical source). */
  power: bigint | undefined
  /** Address whose power was read. `undefined` when no wallet is connected. */
  account: Address | undefined
  isLoading: boolean
  isError: boolean
  error: Error | null
}

export function useVotingPower(
  shim: Hex | undefined,
  options: UseVotingPowerOptions = {},
): VotingPowerResult {
  const { address: connected } = useAccount()
  const account = options.account ?? connected

  const { data, isLoading, isError, error } = useReadContract({
    abi: tokenWeightingVotesShimAbi,
    address: shim,
    functionName: 'getVotes',
    args: account ? [account] : undefined,
    query: {
      enabled: Boolean(shim) && Boolean(account),
      refetchInterval: POLL.fast,
    },
  })

  return {
    power: data as bigint | undefined,
    account,
    isLoading,
    isError,
    error: (error as Error | null) ?? null,
  }
}
