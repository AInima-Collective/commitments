import { type Address } from 'viem'
import { linkedMutualPolicyAbi } from '../generated'
import { useApproveThenWrite } from './useApproveThenWrite'

export type BuyCoverStep = 'idle' | 'approving' | 'approved' | 'binding' | 'complete' | 'error'

export interface BuyCoverFlow {
  step: BuyCoverStep
  /** Policyholder's balance of the numeraire (vault-share) token premium is paid in. */
  tokenBalance: bigint | undefined
  /** Current numeraire allowance granted to the LinkedMutualPolicy spender. */
  currentAllowance: bigint | undefined
  approve: (amount: bigint) => void
  bind: (mutualId: bigint, notional: bigint, duration: bigint) => void
  reset: () => void
  error: Error | null
  refetchAllowance: () => void
}

interface UseBuyCoverFlowParams {
  /** The mutual's numeraire — the vault-share ERC-20 the premium is pulled in. */
  numeraire: Address | undefined
  /** LinkedMutualPolicy — the bindCover entry point and the approval spender. */
  policyAddress: Address | undefined
  userAddress: Address | undefined
  onSuccess?: () => void
}

/**
 * useBuyCoverFlow — the policyholder side of a mutual: approve the premium
 * numeraire to {@link linkedMutualPolicyAbi}, then `bindCover(mutualId,
 * notional, duration)`. The policy is the approval spender.
 *
 * Premium is pulled from the policyholder's vault-share balance, so the
 * numeraire here is the mutual's share token; the caller quotes the premium via
 * `premiumScheduler.quote` and approves at least that much before binding.
 */
export function useBuyCoverFlow({
  numeraire,
  policyAddress,
  userAddress,
  onSuccess,
}: UseBuyCoverFlowParams): BuyCoverFlow {
  const flow = useApproveThenWrite({
    token: numeraire,
    spender: policyAddress,
    owner: userAddress,
    onSuccess: () => onSuccess?.(),
  })

  function bind(mutualId: bigint, notional: bigint, duration: bigint) {
    if (!policyAddress) return
    flow.write({
      abi: linkedMutualPolicyAbi,
      address: policyAddress,
      functionName: 'bindCover',
      args: [mutualId, notional, duration],
    })
  }

  return {
    step: flow.step === 'writing' ? 'binding' : flow.step,
    tokenBalance: flow.balance,
    currentAllowance: flow.allowance,
    approve: flow.approve,
    bind,
    reset: flow.reset,
    error: flow.error,
    refetchAllowance: () => {
      void flow.refetchAllowance()
    },
  }
}
