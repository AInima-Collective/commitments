import { parseEventLogs, type Address, type Hex, type TransactionReceipt } from 'viem'

import { optimisticInsuranceArbiterAbi } from '../generated'
import { ZERO_HASH } from '../utils/metadataForm'
import { useApproveThenWrite } from './useApproveThenWrite'

export type ProposeClaimStep = 'idle' | 'approving' | 'approved' | 'proposing' | 'complete' | 'error'

export interface ProposeClaimFlow {
  step: ProposeClaimStep
  /** Proposer's balance of the arbiter's bond token. */
  tokenBalance: bigint | undefined
  /** Current bond-token allowance granted to the arbiter. */
  currentAllowance: bigint | undefined
  approve: (amount: bigint) => void
  propose: (commitmentId: bigint, amountBps: number, evidenceHash: Hex, bond: bigint) => void
  reset: () => void
  error: Error | null
  /** ClaimProposed.claimId parsed from the propose receipt — set on 'complete'. */
  claimId: bigint | undefined
  refetchAllowance: () => void
}

interface UseProposeClaimFlowParams {
  /** OptimisticInsuranceArbiter — the proposeClaim entry point and approval spender. */
  arbiterAddress: Address | undefined
  /** The arbiter's bond token (read from `arbiter.bondToken()` by the caller). */
  bondToken: Address | undefined
  userAddress: Address | undefined
  onSuccess?: (claimId: bigint | undefined) => void
}

/**
 * The new claim's id, from the receipt's `ClaimProposed` log — the canonical
 * id source (a pre-send `nextClaimId` read races other proposers).
 */
function claimIdOf(receipt: TransactionReceipt | undefined): bigint | undefined {
  if (!receipt) return undefined
  try {
    return parseEventLogs({
      abi: optimisticInsuranceArbiterAbi,
      eventName: 'ClaimProposed',
      logs: receipt.logs,
    })[0]?.args.claimId
  } catch {
    return undefined
  }
}

/**
 * useProposeClaimFlow — open an optimistic-insurance claim: approve the bond
 * token to the arbiter, then
 * `proposeClaim(commitmentId, amountBps, evidenceHash, templateId=0, bond)`.
 * The new claim's id is handed to `onSuccess` so the caller can route to
 * `/app/claims/:id`.
 */
export function useProposeClaimFlow({
  arbiterAddress,
  bondToken,
  userAddress,
  onSuccess,
}: UseProposeClaimFlowParams): ProposeClaimFlow {
  const flow = useApproveThenWrite({
    token: bondToken,
    spender: arbiterAddress,
    owner: userAddress,
    onSuccess: (receipt) => onSuccess?.(claimIdOf(receipt)),
  })

  function propose(commitmentId: bigint, amountBps: number, evidenceHash: Hex, bond: bigint) {
    if (!arbiterAddress) return
    flow.write({
      abi: optimisticInsuranceArbiterAbi,
      address: arbiterAddress,
      functionName: 'proposeClaim',
      args: [
        commitmentId,
        amountBps,
        evidenceHash,
        // templateId — reserved for claim-template registries; zero today.
        ZERO_HASH,
        bond,
      ],
    })
  }

  return {
    step: flow.step === 'writing' ? 'proposing' : flow.step,
    tokenBalance: flow.balance,
    currentAllowance: flow.allowance,
    approve: flow.approve,
    propose,
    reset: flow.reset,
    error: flow.error,
    claimId: claimIdOf(flow.receipt),
    refetchAllowance: () => {
      void flow.refetchAllowance()
    },
  }
}
