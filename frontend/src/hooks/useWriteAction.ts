import { useEffect, useEffectEvent, type ReactNode } from 'react'
import type { TransactionReceipt } from 'viem'
import {
  useWaitForTransactionReceipt,
  useWriteContract,
  type UseWriteContractParameters,
} from 'wagmi'
import { useToasts } from '../components/ui'
import { legibleWriteError } from '../lib/contractErrors'

/** Where one write stands: wallet prompt, mining, mined, or failed. */
export type TxStep = 'idle' | 'signing' | 'confirming' | 'confirmed' | 'error'

/**
 * One contract write and its receipt, with the step derived from wagmi's flags
 * at render time. The installed `@wagmi/core` throws on a reverted receipt, so
 * a revert lands in `error` like a wallet rejection does. {@link useWriteAction},
 * the approve-then-write flows, the claim queues and the governance hooks all
 * build on it.
 */
export function useTx(wagmi?: UseWriteContractParameters) {
  const write = useWriteContract(wagmi)
  const receipt = useWaitForTransactionReceipt({ hash: write.data })
  const error = write.error ?? receipt.error ?? null
  const step: TxStep = write.isIdle
    ? 'idle'
    : error
      ? 'error'
      : receipt.isSuccess
        ? 'confirmed'
        : write.isPending
          ? 'signing'
          : 'confirming'
  return {
    write: write.writeContract,
    /** `write` as a promise of the hash, for callers that sequence writes. */
    writeAsync: write.writeContractAsync,
    /** The parameters of the latest `write` call. */
    variables: write.variables,
    hash: write.data,
    receipt: receipt.data,
    step,
    error,
    reset: write.reset,
  }
}

export interface TxFeedbackOptions {
  /** Toast title shown on success — pass undefined to skip the success toast. */
  successTitle?: string
  /** Toast body for the success toast (e.g. <>0.42 USDC distributed</>). */
  successBody?: ReactNode
  /** Toast title on revert / RPC failure. Defaults to "TRANSACTION FAILED". */
  errorTitle?: string
  /** Fired once per mined receipt, so callers can poll the indexer up to `receipt.blockNumber`. */
  onSuccess?: (receipt: TransactionReceipt) => void
  /** Fired once per failure, after the danger toast. */
  onError?: () => void
}

/** The canonical success / failure toasts for one write. */
export function useTxFeedback(
  receipt: TransactionReceipt | undefined,
  error: Error | null,
  { successTitle, successBody, errorTitle = 'TRANSACTION FAILED', onSuccess, onError }: TxFeedbackOptions,
) {
  const { push } = useToasts()
  const succeeded = useEffectEvent((mined: TransactionReceipt) => {
    if (successTitle) push({ tone: 'success', title: successTitle, body: successBody })
    onSuccess?.(mined)
  })
  const failed = useEffectEvent((failure: Error) => {
    push({ tone: 'danger', title: errorTitle, body: legibleWriteError(failure) })
    onError?.()
  })
  useEffect(() => {
    if (receipt) succeeded(receipt)
  }, [receipt])
  useEffect(() => {
    if (error) failed(error)
  }, [error])
}

export interface UseWriteActionResult {
  write: ReturnType<typeof useWriteContract>['writeContract']
  hash: `0x${string}` | undefined
  receipt: TransactionReceipt | undefined
  step: TxStep
  isPending: boolean
  isConfirming: boolean
  isSuccess: boolean
  isError: boolean
  error: Error | null
  reset: () => void
}

interface UseWriteActionOptions extends TxFeedbackOptions {
  /** Wagmi options pass-through. */
  wagmi?: UseWriteContractParameters
}

/**
 * {@link useTx} plus the canonical success / failure toasts (the error toast
 * carries a decoded revert via `legibleWriteError`), and a reset 3 s after
 * success so an inline "done" label flips back to idle.
 */
export function useWriteAction(options: UseWriteActionOptions = {}): UseWriteActionResult {
  const { wagmi, ...feedback } = options
  const tx = useTx(wagmi)
  useTxFeedback(tx.receipt, tx.error, feedback)

  const isSuccess = tx.step === 'confirmed'
  const { reset } = tx
  useEffect(() => {
    if (!isSuccess) return
    const timer = setTimeout(reset, 3000)
    return () => clearTimeout(timer)
  }, [isSuccess, reset])

  return {
    write: tx.write,
    hash: tx.hash,
    receipt: tx.receipt,
    step: tx.step,
    isPending: tx.step === 'signing',
    isConfirming: tx.step === 'confirming',
    isSuccess,
    isError: tx.step === 'error',
    error: tx.error,
    reset,
  }
}
