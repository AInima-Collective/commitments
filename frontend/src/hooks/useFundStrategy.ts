import { useEffect, useState } from 'react'
import { type Address, erc20Abi } from 'viem'
import {
  useReadContract,
  useWaitForTransactionReceipt,
  useWriteContract,
} from 'wagmi'
import { commitmentManagerAbi } from '../generated'
import { POLL } from './polling'

export type FundStrategyStep =
  | 'idle'
  | 'approving'
  | 'approved'
  | 'funding'
  | 'complete'
  | 'error'

export interface FundStrategyFlow {
  step: FundStrategyStep
  /** Current allowance the user has granted the manager to pull `token`. */
  currentAllowance: bigint | undefined
  /** ERC-20 approve(manager, amount) on the fee token. */
  approve: (amount: bigint) => void
  /** manager.fundStrategy(strategy, token, amount) — credits the strategy escrow. */
  fund: (amount: bigint) => void
  reset: () => void
  error: Error | null
}

interface UseFundStrategyParams {
  managerAddress: Address | undefined
  strategy: Address | undefined
  /** The fee token (the commitment's backing token). */
  token: Address | undefined
  userAddress: Address | undefined
  onSuccess?: () => void
}

/**
 * Drives the FlatFeeAtCreate pre-funding step: a commitment that binds
 * FlatFeeAtCreate reverts at creation unless the strategy escrow already holds
 * the fee. This funds it via approve(manager) → manager.fundStrategy(strategy,
 * token, fee). The manager is the spender (it pulls the fee on fundStrategy).
 */
export function useFundStrategy({
  managerAddress,
  strategy,
  token,
  userAddress,
  onSuccess,
}: UseFundStrategyParams): FundStrategyFlow {
  const [step, setStep] = useState<FundStrategyStep>('idle')
  const [error, setError] = useState<Error | null>(null)

  const readEnabled = !!token && !!userAddress && !!managerAddress

  const { data: currentAllowance, refetch: refetchAllowance } = useReadContract({
    abi: erc20Abi,
    address: token,
    functionName: 'allowance',
    args: userAddress && managerAddress ? [userAddress, managerAddress] : undefined,
    query: { enabled: readEnabled, refetchInterval: POLL.fast },
  })

  const {
    writeContract: writeApprove,
    data: approveTxHash,
    isError: approveIsError,
    error: approveError,
    reset: resetApprove,
  } = useWriteContract()
  const { isSuccess: approveSuccess, isError: approveReceiptError } =
    useWaitForTransactionReceipt({ hash: approveTxHash })

  const {
    writeContract: writeFund,
    data: fundTxHash,
    isError: fundIsError,
    error: fundError,
    reset: resetFund,
  } = useWriteContract()
  const { isSuccess: fundSuccess, isError: fundReceiptError } =
    useWaitForTransactionReceipt({ hash: fundTxHash })

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
    if (fundSuccess && step === 'funding') {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- transaction state machine; see frontend/docs/eslint-disable-rationale.md §Pattern-1
      setStep('complete')
      onSuccess?.()
    }
  }, [fundSuccess, step, onSuccess])

  useEffect(() => {
    if ((fundIsError || fundReceiptError) && step === 'funding') {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- transaction state machine; see frontend/docs/eslint-disable-rationale.md §Pattern-1
      setError(fundError ?? new Error('fundStrategy transaction failed'))
      setStep('error')
    }
  }, [fundIsError, fundReceiptError, fundError, step])

  function approve(amount: bigint) {
    if (!token || !managerAddress) return
    setError(null)
    setStep('approving')
    writeApprove({
      abi: erc20Abi,
      address: token,
      functionName: 'approve',
      args: [managerAddress, amount],
    })
  }

  function fund(amount: bigint) {
    if (!managerAddress || !strategy || !token) return
    setError(null)
    setStep('funding')
    writeFund({
      abi: commitmentManagerAbi,
      address: managerAddress,
      functionName: 'fundStrategy',
      args: [strategy, token, amount],
    })
  }

  function reset() {
    resetApprove()
    resetFund()
    setStep('idle')
    setError(null)
  }

  return {
    step,
    currentAllowance: currentAllowance as bigint | undefined,
    approve,
    fund,
    reset,
    error,
  }
}
