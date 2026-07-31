import { useEffect, useState } from 'react'
import { type Address, erc20Abi } from 'viem'
import {
  useReadContract,
  useWaitForTransactionReceipt,
  useWriteContract,
} from 'wagmi'
import { commitmentsVaultAbi } from '../generated'

export type DepositStep = 'idle' | 'approving' | 'approved' | 'depositing' | 'complete' | 'error'

export interface DepositFlow {
  step: DepositStep
  tokenBalance: bigint | undefined
  currentAllowance: bigint | undefined
  approve: (amount: bigint) => void
  deposit: (amount: bigint) => void
  reset: () => void
  error: Error | null
  txHash: `0x${string}` | undefined
}

interface UseDepositFlowParams {
  vaultAddress: Address | undefined
  assetAddress: Address | undefined
  userAddress: Address | undefined
  onSuccess?: () => void
}

export function useDepositFlow({
  vaultAddress,
  assetAddress,
  userAddress,
  onSuccess,
}: UseDepositFlowParams): DepositFlow {
  const [step, setStep] = useState<DepositStep>('idle')
  const [error, setError] = useState<Error | null>(null)

  const readEnabled = !!assetAddress && !!userAddress && !!vaultAddress

  // Read token balance
  const { data: tokenBalance } = useReadContract({
    abi: erc20Abi,
    address: assetAddress,
    functionName: 'balanceOf',
    args: userAddress ? [userAddress] : undefined,
    query: {
      enabled: readEnabled,
      refetchInterval: 15_000,
    },
  })

  // Read current allowance
  const { data: currentAllowance, refetch: refetchAllowance } = useReadContract({
    abi: erc20Abi,
    address: assetAddress,
    functionName: 'allowance',
    args: userAddress && vaultAddress ? [userAddress, vaultAddress] : undefined,
    query: {
      enabled: readEnabled,
      refetchInterval: 15_000,
    },
  })

  // Approve write: targets assetAddress (ERC-20), vault is the spender argument
  const {
    writeContract: writeApprove,
    data: approveTxHash,
    isPending: approveIsPending,
    isError: approveIsError,
    error: approveError,
    reset: resetApprove,
  } = useWriteContract()

  // Wait for approve tx
  const { isSuccess: approveSuccess, isError: approveReceiptError } =
    useWaitForTransactionReceipt({
      hash: approveTxHash,
    })

  // Deposit write: targets vault using commitmentsVaultAbi
  const {
    writeContract: writeDeposit,
    data: depositTxHash,
    isPending: depositIsPending,
    isError: depositIsError,
    error: depositError,
    reset: resetDeposit,
  } = useWriteContract()

  // Wait for deposit tx
  const { isSuccess: depositSuccess, isError: depositReceiptError } =
    useWaitForTransactionReceipt({
      hash: depositTxHash,
    })

  // Advance step when approve confirms
  useEffect(() => {
    if (approveSuccess && step === 'approving') {
      void refetchAllowance()
      // eslint-disable-next-line react-hooks/set-state-in-effect -- transaction state machine; see frontend/docs/eslint-disable-rationale.md §Pattern-1
      setStep('approved')
    }
  }, [approveSuccess, step, refetchAllowance])

  // Handle approve error
  useEffect(() => {
    if ((approveIsError || approveReceiptError) && step === 'approving') {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- transaction state machine; see frontend/docs/eslint-disable-rationale.md §Pattern-1
      setError(approveError ?? new Error('Approve transaction failed'))
      setStep('error')
    }
  }, [approveIsError, approveReceiptError, approveError, step])

  // Advance step when deposit confirms
  useEffect(() => {
    if (depositSuccess && step === 'depositing') {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- transaction state machine; see frontend/docs/eslint-disable-rationale.md §Pattern-1
      setStep('complete')
      onSuccess?.()
    }
  }, [depositSuccess, step, onSuccess])

  // Handle deposit error
  useEffect(() => {
    if ((depositIsError || depositReceiptError) && step === 'depositing') {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- transaction state machine; see frontend/docs/eslint-disable-rationale.md §Pattern-1
      setError(depositError ?? new Error('Deposit transaction failed'))
      setStep('error')
    }
  }, [depositIsError, depositReceiptError, depositError, step])

  // Handle pending states to keep step in sync with wallet
  useEffect(() => {
    if (approveIsPending && step === 'idle') {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- transaction state machine; see frontend/docs/eslint-disable-rationale.md §Pattern-1
      setStep('approving')
    }
  }, [approveIsPending, step])

  useEffect(() => {
    if (depositIsPending && step === 'approved') {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- transaction state machine; see frontend/docs/eslint-disable-rationale.md §Pattern-1
      setStep('depositing')
    }
  }, [depositIsPending, step])

  function approve(amount: bigint) {
    if (!assetAddress || !vaultAddress) return
    setError(null)
    setStep('approving')
    writeApprove({
      abi: erc20Abi,
      address: assetAddress,
      functionName: 'approve',
      args: [vaultAddress, amount],
    })
  }

  function deposit(amount: bigint) {
    if (!vaultAddress || !userAddress) return
    setError(null)
    setStep('depositing')
    writeDeposit({
      abi: commitmentsVaultAbi,
      address: vaultAddress,
      functionName: 'deposit',
      args: [amount, userAddress],
    })
  }

  function reset() {
    resetApprove()
    resetDeposit()
    setStep('idle')
    setError(null)
  }

  // Determine active tx hash
  const txHash = step === 'approving' ? approveTxHash : step === 'depositing' ? depositTxHash : undefined

  return {
    step,
    tokenBalance: tokenBalance as bigint | undefined,
    currentAllowance: currentAllowance as bigint | undefined,
    approve,
    deposit,
    reset,
    error,
    txHash,
  }
}
