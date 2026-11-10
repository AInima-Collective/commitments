import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { getAbiItem } from 'viem'
import { useAccount, useChainId, usePublicClient } from 'wagmi'

import { operatorRegistryAbi } from '../generated'
import { getContractAddresses } from '../config/contracts'
import { type CommitmentWithStatus } from '../utils/commitments'
import { useCommitments } from './useCommitments'

const delegationCreatedEvent = getAbiItem({
  abi: operatorRegistryAbi,
  name: 'DelegationCreated',
})

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

/**
 * Resolves the connected account's delegations into a per-operator view.
 *
 * A delegation is a commitment (created by the staker) linked to an operator
 * via `OperatorRegistry.delegate`, surfaced on-chain by the
 * `DelegationCreated(staker indexed, operator indexed, commitmentId indexed, amount)`
 * event. We scan that event filtered by `staker = account` (one indexed RPC
 * call), build a commitmentId → operator map, then look the commitments up in
 * the account's own commitment set (`useCommitments`) so callers get the live
 * status (ACTIVE / UNBONDING / …) and a full object for the resolve modal.
 *
 * Released/forfeited delegations are dropped — they're no longer actionable.
 */
export function useMyDelegations(): MyDelegationsResult {
  const chainId = useChainId()
  const client = usePublicClient()
  const { address: account } = useAccount()
  const { commitmentManager, operatorRegistry } = getContractAddresses(chainId)

  // commitmentId(string) → operator(lowercased) from DelegationCreated logs.
  // A failed scan reads as "no delegations", as before.
  const scan = useQuery({
    enabled: !!client && !!operatorRegistry && !!account,
    queryKey: ['delegation-created', chainId, operatorRegistry, account],
    queryFn: async () => {
      const logs = await client!.getLogs({
        address: operatorRegistry!,
        event: delegationCreatedEvent,
        args: { staker: account },
        fromBlock: 0n,
      })
      const next = new Map<string, string>()
      for (const l of logs) {
        const id = l.args.commitmentId
        const operator = l.args.operator
        if (id === undefined || operator === undefined) continue
        next.set(id.toString(), operator.toLowerCase())
      }
      return next
    },
  })
  const operatorByCommitment = scan.data

  const { commitments, isLoading: isLoadingCommitments, refetch } = useCommitments({
    managerAddress: commitmentManager,
    committerAddress: account,
  })

  // `refetch` is a new function each render, so it stays out of the memo.
  const grouped = useMemo(() => {
    const byOperator = new Map<string, CommitmentWithStatus[]>()
    const delegatedOperators = new Set<string>()
    for (const c of commitments) {
      const operator = operatorByCommitment?.get(c.id.toString())
      if (!operator) continue
      if (c.status === 'RELEASED' || c.status === 'FORFEITED') continue
      delegatedOperators.add(operator)
      const list = byOperator.get(operator)
      if (list) list.push(c)
      else byOperator.set(operator, [c])
    }
    return { delegatedOperators, byOperator }
  }, [commitments, operatorByCommitment])

  if (!account) return EMPTY
  return { ...grouped, isLoading: scan.isLoading || isLoadingCommitments, refetch }
}
