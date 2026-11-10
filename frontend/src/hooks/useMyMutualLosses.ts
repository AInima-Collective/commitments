import { useMemo } from 'react'
import { type Abi, type Address } from 'viem'
import { useReadContracts } from 'wagmi'

import { commitmentManagerAbi } from '../generated'
import { POLL } from './polling'

/** A single mutual membership with its live accrued markdown. */
export interface MyMutualLossEntry {
  commitmentId: bigint
  mutualId: bigint
  /**
   * Commitment backing token. In homogeneous mode (the only supported mutual
   * mode) `MutualLib` enforces `commitment.token == mutual.numeraire`, so the
   * `owed` markdown is denominated in THIS token's units.
   */
  token: Address
  /** Vault backing the commitment, when the token is an ERC-4626 share. */
  vault: Address | undefined
  /**
   * Live accrued markdown (owedUnits = forfeitableUnits × (Λ − snapshot) / 1e18)
   * in `token` units. Not yet settled — this is exposure, not a realized loss.
   */
  owed: bigint
}

export interface UseMyMutualLossesParams {
  managerAddress: Address | undefined
  /**
   * The viewer's commitments (id + backing token + vault), threaded from the
   * rows the page already loaded — this hook does NOT refetch commitments. Pass
   * a memoized array to keep the multicall query key stable.
   */
  commitments: ReadonlyArray<{ id: bigint; token: Address; vault: Address | undefined }>
}

export interface UseMyMutualLossesReturn {
  /** token (lowercased) → Σ owed across the viewer's member commitments. */
  totalByToken: Map<Address, bigint>
  /** One entry per commitment that is actually a mutual member (mutualId > 0). */
  entries: MyMutualLossEntry[]
  isLoading: boolean
}

/**
 * useMyMutualLosses — batched read of the viewer's accrued mutual markdown.
 *
 * For each supplied commitment it reads `getMembership` (to learn whether the
 * commitment is a mutual member and which mutual) and `pendingMemberLoss` (the
 * live owed units) in a single `useReadContracts` multicall, so the hook count
 * is fixed regardless of how many commitments the viewer holds.
 *
 * Element types are widened (`abi: Abi`, `functionName: string`) to keep
 * wagmi's per-element inference from blowing the instantiation depth on the
 * manager ABI — same pattern the dashboard ledger read uses.
 */
export function useMyMutualLosses({
  managerAddress,
  commitments,
}: UseMyMutualLossesParams): UseMyMutualLossesReturn {
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
        functionName: 'pendingMemberLoss',
        args: [c.id] as const,
      },
    ])
  }, [managerAddress, commitments])

  const { data, isLoading } = useReadContracts({
    contracts,
    query: { enabled: contracts.length > 0, refetchInterval: POLL.fast },
  })

  return useMemo(() => {
    const entries: MyMutualLossEntry[] = []
    const totalByToken = new Map<Address, bigint>()

    commitments.forEach((c, i) => {
      // getMembership returns the Membership tuple; mutualId === 0 is the
      // "not-a-member" sentinel (mutual ids are 1-based).
      const membership = data?.[i * 2]?.result as { mutualId: bigint } | undefined
      if (!membership) return
      const mutualId = BigInt(membership.mutualId)
      if (mutualId === 0n) return

      const owedRaw = data?.[i * 2 + 1]?.result as bigint | undefined
      const owed = owedRaw !== undefined ? BigInt(owedRaw) : 0n

      entries.push({ commitmentId: c.id, mutualId, token: c.token, vault: c.vault, owed })
      const key = c.token.toLowerCase() as Address
      totalByToken.set(key, (totalByToken.get(key) ?? 0n) + owed)
    })

    return { totalByToken, entries, isLoading }
  }, [commitments, data, isLoading])
}
