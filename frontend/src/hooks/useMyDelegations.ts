import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { type Address } from 'viem'
import { useAccount, useChainId, useReadContracts } from 'wagmi'

import { getContractAddresses } from '../config/contracts'
import { hasIndexer, indexerGraphqlData } from '../config/indexer'
import { type CommitmentWithStatus } from '../lib/commitments'
import { COMMITMENT_STRIDE, commitmentReadContracts, mapCommitmentWindow } from '../lib/commitmentReads'
import { POLL } from './polling'

export interface MyDelegationsResult {
  /** Lowercased operator addresses the connected account has an *active*
   *  (not released/forfeited) delegation to. Drives the row-level badge. */
  delegatedOperators: Set<string>
  /** Active delegation commitments keyed by lowercased operator address.
   *  Each entry is a full `CommitmentWithStatus` ready to hand to the
   *  resolve/undelegate flow. */
  byOperator: Map<string, CommitmentWithStatus[]>
  isLoading: boolean
  refetch: () => void
}

const EMPTY: MyDelegationsResult = {
  delegatedOperators: new Set(),
  byOperator: new Map(),
  isLoading: false,
  refetch: () => {},
}

// The indexer tags a delegation commitment with its operator on DelegationCreated.
const DELEGATIONS_QUERY = /* GraphQL */ `
  query MyDelegations($manager: String!, $staker: String!) {
    commitments(
      where: {
        manager: $manager
        committer: $staker
        operatorBeneficiary_not: null
        status_not_in: ["released", "forfeited"]
      }
      limit: 1000
    ) {
      items { id operatorBeneficiary }
    }
  }
`

/**
 * Resolves the connected account's delegations into a per-operator view.
 *
 * The indexer lists the account's open delegation commitments with their
 * operator; one multicall over just those ids supplies the live status
 * (ACTIVE / UNBONDING / …) and a full object for the resolve modal.
 * Released/forfeited delegations are dropped — they're no longer actionable.
 */
export function useMyDelegations(): MyDelegationsResult {
  const chainId = useChainId()
  const { address: account } = useAccount()
  const { commitmentManager } = getContractAddresses(chainId)

  const listing = useQuery({
    enabled: hasIndexer && !!commitmentManager && !!account,
    queryKey: ['my-delegations', chainId, commitmentManager, account],
    queryFn: async () => {
      const { commitments } = await indexerGraphqlData<{
        commitments: { items: { id: string; operatorBeneficiary: string }[] }
      }>(DELEGATIONS_QUERY, { manager: commitmentManager!.toLowerCase(), staker: account!.toLowerCase() })
      return commitments.items.map((c) => ({ id: BigInt(c.id), operator: c.operatorBeneficiary.toLowerCase() }))
    },
    refetchInterval: POLL.slow,
    retry: false,
  })
  const rows = useMemo(() => listing.data ?? [], [listing.data])

  const chain = useReadContracts({
    contracts: rows.flatMap((r) => commitmentReadContracts(commitmentManager as Address, r.id)),
    query: { enabled: rows.length > 0 && !!commitmentManager, refetchInterval: POLL.fast },
  })

  const grouped = useMemo(() => {
    const byOperator = new Map<string, CommitmentWithStatus[]>()
    const delegatedOperators = new Set<string>()
    rows.forEach((r, i) => {
      const c = chain.data ? mapCommitmentWindow(r.id, chain.data, i * COMMITMENT_STRIDE) : undefined
      if (!c || c.status === 'RELEASED' || c.status === 'FORFEITED') return
      delegatedOperators.add(r.operator)
      const list = byOperator.get(r.operator)
      if (list) list.push(c)
      else byOperator.set(r.operator, [c])
    })
    return { delegatedOperators, byOperator }
  }, [rows, chain.data])

  if (!account) return EMPTY
  return {
    ...grouped,
    isLoading: listing.isLoading || (rows.length > 0 && chain.isLoading),
    refetch: () => {
      void listing.refetch()
      void chain.refetch()
    },
  }
}
