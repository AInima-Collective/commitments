import { useEffect, useState } from 'react'
import { erc20Abi, parseEventLogs, type Address, type Hex } from 'viem'
import { useReadContract, useWaitForTransactionReceipt, useWriteContract } from 'wagmi'

import { optimisticInsuranceArbiterAbi } from '../generated'
import { ZERO_HASH } from '../utils/metadataForm'

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
  txHash: `0x${string}` | undefined
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
 * useProposeClaimFlow — open an optimistic-insurance claim: approve the bond
 * token to the arbiter, then `proposeClaim`. Mirrors {@link useBuyCoverFlow}'s
 * two-phase transaction state machine (approve → act); the act is
 * `proposeClaim(commitmentId, amountBps, evidenceHash, templateId=0, bond)`.
 *
 * The new claim's id is parsed from the `ClaimProposed` event in the propose
 * receipt (preferred over a pre-send `nextClaimId` read, which races other
 * proposers) and handed to `onSuccess` so the caller can route to
 * `/app/claims/:id`.
 */
export function useProposeClaimFlow({
  arbiterAddress,
  bondToken,
  userAddress,
  onSuccess,
}: UseProposeClaimFlowParams): ProposeClaimFlow {
  const [step, setStep] = useState<ProposeClaimStep>('idle')
  const [error, setError] = useState<Error | null>(null)
  const [claimId, setClaimId] = useState<bigint | undefined>(undefined)

  const readEnabled = !!bondToken && !!userAddress && !!arbiterAddress

  const { data: tokenBalance } = useReadContract({
    abi: erc20Abi,
    address: bondToken,
    functionName: 'balanceOf',
    args: userAddress ? [userAddress] : undefined,
    query: { enabled: readEnabled, refetchInterval: 15_000 },
  })

  const { data: currentAllowance, refetch: refetchAllowance } = useReadContract({
    abi: erc20Abi,
    address: bondToken,
    functionName: 'allowance',
    args: userAddress && arbiterAddress ? [userAddress, arbiterAddress] : undefined,
    query: { enabled: readEnabled, refetchInterval: 15_000 },
  })

  // Approve write: targets the bond ERC-20, arbiter is the spender argument.
  const {
    writeContract: writeApprove,
    data: approveTxHash,
    isError: approveIsError,
    error: approveError,
    reset: resetApprove,
  } = useWriteContract()
  const { isSuccess: approveSuccess, isError: approveReceiptError } = useWaitForTransactionReceipt({
    hash: approveTxHash,
  })

  // Propose write: targets the arbiter via proposeClaim.
  const {
    writeContract: writePropose,
    data: proposeTxHash,
    isError: proposeIsError,
    error: proposeError,
    reset: resetPropose,
  } = useWriteContract()
  const {
    data: proposeReceipt,
    isSuccess: proposeSuccess,
    isError: proposeReceiptError,
  } = useWaitForTransactionReceipt({ hash: proposeTxHash })

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
    if (proposeSuccess && proposeReceipt && step === 'proposing') {
      // Parse the new claim id from the receipt's ClaimProposed log — the
      // canonical id source (a pre-send nextClaimId read can race).
      let parsed: bigint | undefined
      try {
        const logs = parseEventLogs({
          abi: optimisticInsuranceArbiterAbi,
          eventName: 'ClaimProposed',
          logs: proposeReceipt.logs,
        })
        parsed = logs[0]?.args.claimId
      } catch {
        parsed = undefined
      }
      // eslint-disable-next-line react-hooks/set-state-in-effect -- transaction state machine; see frontend/docs/eslint-disable-rationale.md §Pattern-1
      setClaimId(parsed)
      setStep('complete')
      onSuccess?.(parsed)
    }
  }, [proposeSuccess, proposeReceipt, step, onSuccess])

  useEffect(() => {
    if ((proposeIsError || proposeReceiptError) && step === 'proposing') {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- transaction state machine; see frontend/docs/eslint-disable-rationale.md §Pattern-1
      setError(proposeError ?? new Error('Propose-claim transaction failed'))
      setStep('error')
    }
  }, [proposeIsError, proposeReceiptError, proposeError, step])

  function approve(amount: bigint) {
    if (!bondToken || !arbiterAddress) return
    setError(null)
    setStep('approving')
    writeApprove({
      abi: erc20Abi,
      address: bondToken,
      functionName: 'approve',
      args: [arbiterAddress, amount],
    })
  }

  function propose(commitmentId: bigint, amountBps: number, evidenceHash: Hex, bond: bigint) {
    if (!arbiterAddress) return
    setError(null)
    setStep('proposing')
    writePropose({
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

  function reset() {
    resetApprove()
    resetPropose()
    setStep('idle')
    setError(null)
    setClaimId(undefined)
  }

  const txHash = step === 'approving' ? approveTxHash : step === 'proposing' ? proposeTxHash : undefined

  return {
    step,
    tokenBalance: tokenBalance as bigint | undefined,
    currentAllowance: currentAllowance as bigint | undefined,
    approve,
    propose,
    reset,
    error,
    txHash,
    claimId,
    refetchAllowance: () => {
      void refetchAllowance()
    },
  }
}
