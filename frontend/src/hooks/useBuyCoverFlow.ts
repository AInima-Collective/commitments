import { useEffect, useState } from 'react'
import { type Address, erc20Abi } from 'viem'
import { useReadContract, useWaitForTransactionReceipt, useWriteContract } from 'wagmi'

import { linkedMutualPolicyAbi } from '../generated'

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
  txHash: `0x${string}` | undefined
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
 * numeraire to {@link linkedMutualPolicyAbi} then `bindCover`. Mirrors
 * {@link useDepositFlow}'s two-phase transaction state machine (approve → act),
 * but the act is `bindCover(mutualId, notional, duration)` and the approval
 * spender is the policy rather than a vault.
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
  const [step, setStep] = useState<BuyCoverStep>('idle')
  const [error, setError] = useState<Error | null>(null)

  const readEnabled = !!numeraire && !!userAddress && !!policyAddress

  const { data: tokenBalance } = useReadContract({
    abi: erc20Abi,
    address: numeraire,
    functionName: 'balanceOf',
    args: userAddress ? [userAddress] : undefined,
    query: { enabled: readEnabled, refetchInterval: 15_000 },
  })

  const { data: currentAllowance, refetch: refetchAllowance } = useReadContract({
    abi: erc20Abi,
    address: numeraire,
    functionName: 'allowance',
    args: userAddress && policyAddress ? [userAddress, policyAddress] : undefined,
    query: { enabled: readEnabled, refetchInterval: 15_000 },
  })

  // Approve write: targets the numeraire ERC-20, policy is the spender argument.
  const {
    writeContract: writeApprove,
    data: approveTxHash,
    isPending: approveIsPending,
    isError: approveIsError,
    error: approveError,
    reset: resetApprove,
  } = useWriteContract()
  const { isSuccess: approveSuccess, isError: approveReceiptError } = useWaitForTransactionReceipt({
    hash: approveTxHash,
  })

  // Bind write: targets the policy via linkedMutualPolicyAbi.bindCover.
  const {
    writeContract: writeBind,
    data: bindTxHash,
    isPending: bindIsPending,
    isError: bindIsError,
    error: bindError,
    reset: resetBind,
  } = useWriteContract()
  const { isSuccess: bindSuccess, isError: bindReceiptError } = useWaitForTransactionReceipt({
    hash: bindTxHash,
  })

  useEffect(() => {
    if (approveSuccess && step === 'approving') {
      void refetchAllowance()
      // eslint-disable-next-line react-hooks/set-state-in-effect -- transaction state machine; see frontend/docs/eslint-disable-rationale.md §Pattern-1
      setStep('approved')
    }
  }, [approveSuccess, step, refetchAllowance])

  useEffect(() => {
    if ((approveIsError || approveReceiptError) && step === 'approving') {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- transaction state machine; see frontend/docs/eslint-disable-rationale.md §Pattern-1
      setError(approveError ?? new Error('Approve transaction failed'))
      setStep('error')
    }
  }, [approveIsError, approveReceiptError, approveError, step])

  useEffect(() => {
    if (bindSuccess && step === 'binding') {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- transaction state machine; see frontend/docs/eslint-disable-rationale.md §Pattern-1
      setStep('complete')
      onSuccess?.()
    }
  }, [bindSuccess, step, onSuccess])

  useEffect(() => {
    if ((bindIsError || bindReceiptError) && step === 'binding') {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- transaction state machine; see frontend/docs/eslint-disable-rationale.md §Pattern-1
      setError(bindError ?? new Error('Buy-cover transaction failed'))
      setStep('error')
    }
  }, [bindIsError, bindReceiptError, bindError, step])

  useEffect(() => {
    if (approveIsPending && step === 'idle') {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- transaction state machine; see frontend/docs/eslint-disable-rationale.md §Pattern-1
      setStep('approving')
    }
  }, [approveIsPending, step])

  useEffect(() => {
    if (bindIsPending && (step === 'approved' || step === 'idle')) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- transaction state machine; see frontend/docs/eslint-disable-rationale.md §Pattern-1
      setStep('binding')
    }
  }, [bindIsPending, step])

  function approve(amount: bigint) {
    if (!numeraire || !policyAddress) return
    setError(null)
    setStep('approving')
    writeApprove({
      abi: erc20Abi,
      address: numeraire,
      functionName: 'approve',
      args: [policyAddress, amount],
    })
  }

  function bind(mutualId: bigint, notional: bigint, duration: bigint) {
    if (!policyAddress) return
    setError(null)
    setStep('binding')
    writeBind({
      abi: linkedMutualPolicyAbi,
      address: policyAddress,
      functionName: 'bindCover',
      args: [mutualId, notional, duration],
    })
  }

  function reset() {
    resetApprove()
    resetBind()
    setStep('idle')
    setError(null)
  }

  const txHash = step === 'approving' ? approveTxHash : step === 'binding' ? bindTxHash : undefined

  return {
    step,
    tokenBalance: tokenBalance as bigint | undefined,
    currentAllowance: currentAllowance as bigint | undefined,
    approve,
    bind,
    reset,
    error,
    txHash,
    refetchAllowance: () => {
      void refetchAllowance()
    },
  }
}
