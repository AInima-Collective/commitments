import { useWaitForTransactionReceipt } from 'wagmi'
import type { ReactNode } from 'react'
import { useTxFeedback } from './useWriteAction'

export interface UseTxReceiptOptions {
  /** The write hook's tx hash (`writeContract` `data`). */
  hash: `0x${string}` | undefined
  /** Success-toast title, shown once the receipt confirms. */
  successTitle: string
  /** Optional success-toast body. */
  successBody?: ReactNode
  /** Fired once on confirmation — refetch reads, clear form state, etc. */
  onSuccess?: () => void
  /** The write hook's `reset`, called after a confirmed or reverted tx so the next click starts clean. */
  reset?: () => void
}

/**
 * The feedback half of `useWriteAction` for a write sent elsewhere (a
 * wagmi-generated typed hook such as `useWriteCommitmentManagerJoinGroup`):
 * watch `hash`, toast on success or failure, then `reset`. Returns the receipt
 * query so callers can read `isLoading` for button state.
 */
export function useTxReceipt({ hash, successTitle, successBody, onSuccess, reset }: UseTxReceiptOptions) {
  const receipt = useWaitForTransactionReceipt({ hash })
  useTxFeedback(receipt.data, receipt.error, {
    successTitle,
    successBody,
    onSuccess: () => {
      onSuccess?.()
      reset?.()
    },
    onError: reset,
  })
  return receipt
}
