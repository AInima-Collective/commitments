import { useMemo } from 'react'
import { type Abi, type Address } from 'viem'
import { useReadContracts } from 'wagmi'

import { commitmentManagerAbi } from '../generated'

/** A single mutual membership with its live claimable premium. */
export interface MyMutualPremiumEntry {
  commitmentId: bigint
  mutualId: bigint
  /**
   * Commitment backing token. In homogeneous mode (the only supported mutual
   * mode) `MutualLib` enforces `commitment.token == mutual.numeraire`, so the
   * `claimable` premium is denominated in THIS token's units.
   */
  token: Address
  /** Vault backing the commitment, when the token is an ERC-4626 share. */
  vault: Address | undefined
  /**
   * Live claimable (accrued, unclaimed) premium the underwriter has earned on
   * this membership, in `token` units. This is the actionable figure — what a
   * `claimMemberPremium` call would pay out right now.
   */
  claimable: bigint
}

export interface UseMyMutualPremiumParams {
  managerAddress: Address | undefined
  /**
   * The viewer's commitments (id + backing token + vault), threaded from the
   * rows the page already loaded — this hook does NOT refetch commitments. Pass
   * a memoized array to keep the multicall query key stable.
   */
  commitments: ReadonlyArray<{ id: bigint; token: Address; vault: Address | undefined }>
}

export interface UseMyMutualPremiumReturn {
  /** token (lowercased) → Σ claimable premium across the viewer's member commitments. */
  totalByToken: Map<Address, bigint>
  /** One entry per commitment that is actually a mutual member (mutualId > 0). */
  entries: MyMutualPremiumEntry[]
  isLoading: boolean
  /** Re-read the membership multicall — call after a premium claim confirms. */
  refetch: () => void
}

/**
 * useMyMutualPremium — batched read of the viewer's claimable underwriting
 * premium across every mutual they back. The earn-side mirror of
 * {@link useMyMutualLosses}: premium streamed to underwriters is yield the
 * dashboard must reflect, just as accrued markdown is exposure it surfaces.
 *
 * For each supplied commitment it reads `getMembership` (to learn whether the
 * commitment is a mutual member and which mutual) and `pendingMemberPremium`
 * (the live claimable premium) in a single `useReadContracts` multicall, so the
 * hook count is fixed regardless of how many commitments the viewer holds.
 *
 * Element types are widened (`abi: Abi`, `functionName: string`) to keep
 * wagmi's per-element inference from blowing the instantiation depth on the
 * manager ABI — same pattern the dashboard ledger read uses.
 */
export function useMyMutualPremium({
  managerAddress,
  commitments,
}: UseMyMutualPremiumParams): UseMyMutualPremiumReturn {
  type MembershipCall = {
    abi: Abi
    address: Address
    functionName: string
    args: readonly [bigint]
  }

  const contracts = useMemo<MembershipCall[]>(() => {
    if (!managerAddress || commitments.length === 0) return []
    return commitments.flatMap((c) => [
      {
        abi: commitmentManagerAbi as Abi,
        address: managerAddress,
        functionName: 'getMembership',
        args: [c.id] as const,
      },
      {
        abi: commitmentManagerAbi as Abi,
        address: managerAddress,
        functionName: 'pendingMemberPremium',
        args: [c.id] as const,
      },
    ])
  }, [managerAddress, commitments])

  const { data, isLoading, refetch } = useReadContracts({
    contracts,
    query: { enabled: contracts.length > 0, refetchInterval: 15_000 },
  })

  return useMemo(() => {
    const entries: MyMutualPremiumEntry[] = []
    const totalByToken = new Map<Address, bigint>()

    commitments.forEach((c, i) => {
      // getMembership returns the Membership tuple; mutualId === 0 is the
      // "not-a-member" sentinel (mutual ids are 1-based).
      const membership = data?.[i * 2]?.result as { mutualId: bigint } | undefined
      if (!membership) return
      const mutualId = BigInt(membership.mutualId)
      if (mutualId === 0n) return

      const claimableRaw = data?.[i * 2 + 1]?.result as bigint | undefined
      const claimable = claimableRaw !== undefined ? BigInt(claimableRaw) : 0n

      entries.push({ commitmentId: c.id, mutualId, token: c.token, vault: c.vault, claimable })
      const key = c.token.toLowerCase() as Address
      totalByToken.set(key, (totalByToken.get(key) ?? 0n) + claimable)
    })

    return { totalByToken, entries, isLoading, refetch: () => void refetch() }
  }, [commitments, data, isLoading, refetch])
}
