import { useEffect, useRef, useState } from 'react'
import { type Address, type ContractFunctionArgs, erc20Abi } from 'viem'
import { useReadContract, useWaitForTransactionReceipt, useWriteContract } from 'wagmi'
import { commitmentManagerAbi } from '../generated'

/**
 * The full `createCommitment` param struct, inferred from the ABI so it can
 * never drift from the on-chain shape (domain params + `token`/`adapter`/
 * `strategies`). This is exactly `writeContract`'s `args[0]` for the call.
 */
export type FullCommitmentParams = ContractFunctionArgs<
  typeof commitmentManagerAbi,
  'nonpayable',
  'createCommitment'
>[0]

export type CreateFlowStep = 'idle' | 'approving' | 'creating' | 'complete' | 'error'

export interface CreateCommitmentFlow {
  /** Current phase of the approve → create state machine. */
  step: CreateFlowStep
  /** ERC-20 balance of the backing token in the user's wallet (funding source). */
  walletBalance: bigint | undefined
  /** Allowance the user has granted the manager to pull the backing token. */
  allowance: bigint | undefined
  /** True once the CREATE tx confirms (never fires for the interim approve). */
  isSuccess: boolean
  /** True while any tx is in flight (wallet prompt or on-chain confirmation). */
  isPending: boolean
  error: Error | null
  txHash: `0x${string}` | undefined
  /**
   * Submit a create. `depositAmount` is the shortfall pulled from the wallet to
   * top up the free balance before encumbering (`0` ⇒ plain `createCommitment`
   * against the existing free balance). When a deposit is needed and the manager
   * lacks allowance, an ERC-20 `approve` fires first, then `createAndFund`.
   */
  submit: (params: FullCommitmentParams, depositAmount: bigint) => void
  reset: () => void
}

interface UseCreateCommitmentFlowParams {
  managerAddress: Address | undefined
  /** Backing token being encumbered (raw ERC-20 or vault share). */
  token: Address | undefined
  userAddress: Address | undefined
}

/**
 * Drives commitment creation with optional inline funding against the
 * CommitmentManager:
 *   - `depositAmount == 0` → `createCommitment(params)` (free balance covers it)
 *   - `depositAmount > 0`, allowance sufficient → `createAndFund(depositAmount, params)`
 *   - `depositAmount > 0`, allowance short → `approve(manager, depositAmount)`
 *     then `createAndFund(...)`
 *
 * `createAndFund` validates params BEFORE pulling the token (revert-before-pull)
 * and credits the measured balance delta, so `depositAmount` should be the exact
 * shortfall (`amount − free`). Callers gate on `walletBalance` covering it.
 *
 * The manager is the ERC-20 spender for the approve step (it pulls the token on
 * deposit), distinct from the vault-deposit flow where the vault is the spender.
 */
export function useCreateCommitmentFlow({
  managerAddress,
  token,
  userAddress,
}: UseCreateCommitmentFlowParams): CreateCommitmentFlow {
  const [step, setStep] = useState<CreateFlowStep>('idle')
  const [error, setError] = useState<Error | null>(null)
  // Params + shortfall stashed so the create can fire after the approve confirms.
  const pendingRef = useRef<{ params: FullCommitmentParams; depositAmount: bigint } | null>(null)

  const readEnabled = !!token && !!userAddress && !!managerAddress

  const { data: walletBalance } = useReadContract({
    abi: erc20Abi,
    address: token,
    functionName: 'balanceOf',
    args: userAddress ? [userAddress] : undefined,
    query: { enabled: readEnabled, refetchInterval: 15_000 },
  })

  const { data: allowance, refetch: refetchAllowance } = useReadContract({
    abi: erc20Abi,
    address: token,
    functionName: 'allowance',
    args: userAddress && managerAddress ? [userAddress, managerAddress] : undefined,
    query: { enabled: readEnabled, refetchInterval: 15_000 },
  })

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

  const {
    writeContract: writeCreate,
    data: createTxHash,
    isError: createIsError,
    error: createError,
    reset: resetCreate,
  } = useWriteContract()
  const { isSuccess: createSuccess, isError: createReceiptError } = useWaitForTransactionReceipt({
    hash: createTxHash,
  })

  function fireCreate(params: FullCommitmentParams, depositAmount: bigint) {
    if (!managerAddress) return
    if (depositAmount > 0n) {
      writeCreate({
        abi: commitmentManagerAbi,
        address: managerAddress,
        functionName: 'createAndFund',
        args: [depositAmount, params],
      })
    } else {
      writeCreate({
        abi: commitmentManagerAbi,
        address: managerAddress,
        functionName: 'createCommitment',
        args: [params],
      })
    }
  }

  // Approve confirmed → fire the deferred createAndFund.
  useEffect(() => {
    if (approveSuccess && step === 'approving') {
      void refetchAllowance()
      const pending = pendingRef.current
      if (pending) {
        setStep('creating')
        fireCreate(pending.params, pending.depositAmount)
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [approveSuccess, step])

  useEffect(() => {
    if ((approveIsError || approveReceiptError) && step === 'approving') {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- transaction state machine; see frontend/docs/eslint-disable-rationale.md §Pattern-1
      setError(approveError ?? new Error('Approve transaction failed'))
      setStep('error')
    }
  }, [approveIsError, approveReceiptError, approveError, step])

  // Create confirmed → complete.
  useEffect(() => {
    if (createSuccess && step === 'creating') {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- transaction state machine; see frontend/docs/eslint-disable-rationale.md §Pattern-1
      setStep('complete')
    }
  }, [createSuccess, step])

  useEffect(() => {
    if ((createIsError || createReceiptError) && step === 'creating') {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- transaction state machine; see frontend/docs/eslint-disable-rationale.md §Pattern-1
      setError(createError ?? new Error('Create transaction failed'))
      setStep('error')
    }
  }, [createIsError, createReceiptError, createError, step])

  function submit(params: FullCommitmentParams, depositAmount: bigint) {
    if (!managerAddress || !token) return
    setError(null)
    pendingRef.current = { params, depositAmount }

    // No funding needed, or allowance already covers the shortfall → create now.
    if (depositAmount === 0n || (allowance !== undefined && allowance >= depositAmount)) {
      setStep('creating')
      fireCreate(params, depositAmount)
      return
    }

    // Need to approve the shortfall first; the create fires when it confirms.
    setStep('approving')
    writeApprove({
      abi: erc20Abi,
      address: token,
      functionName: 'approve',
      args: [managerAddress, depositAmount],
    })
  }

  function reset() {
    resetApprove()
    resetCreate()
    pendingRef.current = null
    setStep('idle')
    setError(null)
  }

  const txHash = step === 'approving' ? approveTxHash : createTxHash

  return {
    step,
    walletBalance: walletBalance as bigint | undefined,
    allowance: allowance as bigint | undefined,
    isSuccess: step === 'complete',
    isPending: step === 'approving' || step === 'creating',
    error,
    txHash,
    submit,
    reset,
  }
}
