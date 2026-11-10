import { useReadContract } from 'wagmi'
import { type Address } from 'viem'

import { claimRouterAbi, commitmentManagerAbi } from '../generated'
import { POLL } from './polling'

export interface ClaimPayout {
  /** True when the mutual's beneficiary answers `claimant()` — i.e. it is a
   *  ClaimRouter and the in-app collect flow applies. */
  isRouter: boolean
  /** The address entitled to collect the settled basket (when isRouter). */
  claimant: Address | undefined
  /** True when the viewer is that claimant. */
  isClaimant: boolean
  /** The router's uncollected free balance of the numeraire in the manager —
   *  settled member shares waiting for the claimant to collect. */
  collectable: bigint
  /** True while the claimant/collectable reads are in flight. */
  isLoading: boolean
  refetch: () => void
}

interface UseClaimPayoutArgs {
  managerAddress: Address | undefined
  /** The mutual's beneficiary — the ClaimRouter candidate. */
  beneficiary: Address | undefined
  /** The mutual numeraire (the token settled shares are denominated in). */
  token: Address | undefined
  viewer: Address | undefined
}

/**
 * useClaimPayout — the policyholder's "where's my money" read for one mutual.
 *
 * Settled member loss shares land in the mutual's beneficiary as FREE balance
 * in the manager. When that beneficiary is a ClaimRouter, its designated
 * `claimant` collects them out (`collect` / `settleAndCollect`) — so the two
 * facts this hook derives are: is the viewer the claimant, and how much is
 * sitting in the router uncollected.
 *
 * The `claimant()` read doubles as router detection: a plain-address
 * beneficiary has no such function, the read fails, and `isRouter` stays
 * false — callers fall back to "payout is routed off-app" copy.
 */
export function useClaimPayout({
  managerAddress,
  beneficiary,
  token,
  viewer,
}: UseClaimPayoutArgs): ClaimPayout {
  // Immutable on the router — no poll, no retry (an EOA/plain-contract
  // beneficiary fails this read permanently; retrying just burns RPC calls).
  const claimantRead = useReadContract({
    abi: claimRouterAbi,
    functionName: 'claimant',
    address: beneficiary,
    query: {
      enabled: Boolean(beneficiary),
      retry: false,
      staleTime: Infinity,
    },
  })
  const claimant = claimantRead.data as Address | undefined
  const isRouter = claimantRead.isSuccess && claimant !== undefined

  const collectableRead = useReadContract({
    abi: commitmentManagerAbi,
    functionName: 'freeBalance',
    address: managerAddress,
    args: token && beneficiary ? [token, beneficiary] : undefined,
    query: {
      enabled: Boolean(managerAddress && token && beneficiary && isRouter),
      refetchInterval: POLL.fast,
    },
  })

  return {
    isRouter,
    claimant,
    isClaimant:
      isRouter && viewer !== undefined && claimant !== undefined
        ? claimant.toLowerCase() === viewer.toLowerCase()
        : false,
    collectable: (collectableRead.data as bigint | undefined) ?? 0n,
    isLoading: claimantRead.isLoading || collectableRead.isLoading,
    refetch: () => {
      void claimantRead.refetch()
      void collectableRead.refetch()
    },
  }
}
