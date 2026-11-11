import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { type Address } from 'viem'
import { useChainId, useReadContracts } from 'wagmi'

import { hasIndexer, indexerJson } from '../config/indexer'
import { commitmentManagerAbi } from '../generated'
import { type CommitmentStruct } from '../lib/commitmentReads'
import { POLL } from './polling'
import { useViewAddress } from './useViewAddress'

/** One of the viewer's mutual memberships: the indexed listing joined with live chain state. */
export interface MyMembership {
  commitmentId: bigint
  mutualId: bigint
  creditedValue: bigint
  settledUnits: bigint
  /** Member's Λ snapshot (1e18-scaled). */
  lossSnapshot: bigint
  /** 0n unless exit requested (deallocation window running). */
  unbondRequestedAt: bigint
  /** Live owed loss share (`pendingMemberLoss`), in the commitment token's units. */
  owed: bigint
  /**
   * Claimable premium: the indexer's live `pendingMemberPremium` read, or the
   * banked `rewardBank` lower bound when the indexer skipped the live read.
   */
  claimablePremium: bigint
  /** The live commitment struct (residual `amount`, token, status inputs). */
  commitment: CommitmentStruct
}

/** `GET /account/:address/premium` membership rows; bigints as decimal strings. */
interface PremiumMembershipWire {
  manager: string
  mutualId: string
  commitmentId: string
  pendingPremium: string | null
  rewardBank: string
}

export interface UseMyMembershipsReturn {
  memberships: MyMembership[]
  isLoading: boolean
  /** Rows in the indexer's listing, released ones and other managers' included. */
  listed: number
  /** Re-read the listing and the chain state; resolves with the fresh `listed` count. */
  refetch: () => Promise<{ data: number | undefined }>
}

/**
 * The viewer's mutual memberships. The indexer's `GET /account/:address/premium`
 * lists them (with claimable premium); one multicall over just those ids reads
 * `getMembership`, `pendingMemberLoss` and `getCommitment` live, and a row is
 * kept only while the chain still reports the membership. A membership joined
 * a block ago appears once the indexer has caught up.
 */
export function useMyMemberships({
  managerAddress,
  viewer,
}: {
  managerAddress: Address | undefined
  viewer: Address | undefined
}): UseMyMembershipsReturn {
  const chainId = useChainId()
  const listing = useQuery({
    queryKey: ['my-memberships', chainId, viewer?.toLowerCase()],
    enabled: hasIndexer && !!viewer,
    queryFn: () =>
      indexerJson<{ memberships: PremiumMembershipWire[] }>(`/account/${viewer!.toLowerCase()}/premium`),
    refetchInterval: POLL.fast,
    retry: false,
  })

  const rows = useMemo(
    () =>
      (listing.data?.memberships ?? []).filter(
        (m) => managerAddress && m.manager.toLowerCase() === managerAddress.toLowerCase(),
      ),
    [listing.data, managerAddress],
  )

  const contracts = rows.flatMap((m) => {
    const args = [BigInt(m.commitmentId)] as const
    return [
      { abi: commitmentManagerAbi, address: managerAddress, functionName: 'getMembership' as const, args },
      { abi: commitmentManagerAbi, address: managerAddress, functionName: 'pendingMemberLoss' as const, args },
      { abi: commitmentManagerAbi, address: managerAddress, functionName: 'getCommitment' as const, args },
    ]
  })
  const chain = useReadContracts({
    contracts,
    query: { enabled: !!managerAddress && rows.length > 0, refetchInterval: POLL.fast },
  })

  const memberships = useMemo(() => {
    const out: MyMembership[] = []
    rows.forEach((w, i) => {
      const m = chain.data?.[i * 3]?.result as
        | {
            mutualId: bigint
            settledUnits: bigint
            forfeitableUnits: bigint
            lossSnapshot: bigint
            unbondRequestedAt: bigint
          }
        | undefined
      const owed = chain.data?.[i * 3 + 1]?.result as bigint | undefined
      const commitment = chain.data?.[i * 3 + 2]?.result as CommitmentStruct | undefined
      const mutualId = BigInt(w.mutualId)
      // mutualId 0 on chain: released since the indexer last saw it.
      if (!m || !commitment || m.mutualId !== mutualId) return
      out.push({
        commitmentId: BigInt(w.commitmentId),
        mutualId,
        creditedValue: m.forfeitableUnits, // E_i: the member's credited weight
        settledUnits: m.settledUnits,
        lossSnapshot: m.lossSnapshot,
        unbondRequestedAt: m.unbondRequestedAt,
        owed: owed ?? 0n,
        claimablePremium: BigInt(w.pendingPremium ?? w.rewardBank),
        commitment,
      })
    })
    return out
  }, [rows, chain.data])

  const { refetch: refetchListing } = listing
  const { refetch: refetchChain } = chain
  return {
    memberships,
    isLoading: listing.isLoading || chain.isLoading,
    listed: listing.data?.memberships.length ?? 0,
    refetch: async () => {
      const { data } = await refetchListing()
      void refetchChain()
      return { data: data?.memberships.length }
    },
  }
}

/** Per-token totals and entries over the viewer's memberships, for the Dashboard. */
interface MutualTotals {
  /** token (lowercased) → Σ amount across the viewer's member commitments. */
  totalByToken: Map<Address, bigint>
  entries: MyMutualEntry[]
  isLoading: boolean
  refetch: () => void
}

export interface MyMutualEntry {
  commitmentId: bigint
  mutualId: bigint
  /** Commitment backing token; mutual amounts are in its units (homogeneous mode). */
  token: Address
  /** Vault backing the commitment, when the token is an ERC-4626 share. */
  vault: Address | undefined
  /** Live accrued markdown: exposure, not yet settled. */
  owed: bigint
  /** Claimable underwriting premium. */
  claimable: bigint
}

interface UseMyMutualTotalsParams {
  managerAddress: Address | undefined
  /** The viewer's commitments (id + token + vault); memberships outside this list are skipped. */
  commitments: ReadonlyArray<{ id: bigint; token: Address; vault: Address | undefined }>
}

function useMutualTotals(
  { managerAddress, commitments }: UseMyMutualTotalsParams,
  key: 'owed' | 'claimable',
): MutualTotals {
  const viewer = useViewAddress()
  const { memberships, isLoading, refetch } = useMyMemberships({ managerAddress, viewer })
  return useMemo(() => {
    const byId = new Map(commitments.map((c) => [c.id, c]))
    const entries: MyMutualEntry[] = []
    const totalByToken = new Map<Address, bigint>()
    for (const m of memberships) {
      const c = byId.get(m.commitmentId)
      if (!c) continue
      const entry = {
        commitmentId: m.commitmentId,
        mutualId: m.mutualId,
        token: c.token,
        vault: c.vault,
        owed: m.owed,
        claimable: m.claimablePremium,
      }
      entries.push(entry)
      const token = c.token.toLowerCase() as Address
      totalByToken.set(token, (totalByToken.get(token) ?? 0n) + entry[key])
    }
    return { totalByToken, entries, isLoading, refetch: () => void refetch() }
  }, [commitments, memberships, isLoading, refetch, key])
}

/** The viewer's live accrued mutual markdown, totalled per token. */
export function useMyMutualLosses(params: UseMyMutualTotalsParams): MutualTotals {
  return useMutualTotals(params, 'owed')
}

/** The viewer's claimable underwriting premium across every mutual they back, totalled per token. */
export function useMyMutualPremium(params: UseMyMutualTotalsParams): MutualTotals {
  return useMutualTotals(params, 'claimable')
}
