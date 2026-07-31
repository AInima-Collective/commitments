import { useEffect } from 'react'
import { type TransactionReceipt } from 'viem'
import {
  useWaitForTransactionReceipt,
  useWriteContract,
  type UseWriteContractParameters,
} from 'wagmi'
import { useToasts } from '../../ui'
import { legibleWriteError } from '../../../utils/contractErrors'
import type { ReactNode } from 'react'

export interface UseWriteActionResult {
  write: (args: Parameters<ReturnType<typeof useWriteContract>['writeContract']>[0]) => void
  hash: `0x${string}` | undefined
  isPending: boolean
  isConfirming: boolean
  isSuccess: boolean
  isError: boolean
  error: Error | null
  reset: () => void
}

interface UseWriteActionOptions {
  /** Toast title shown on success — pass undefined to skip the success toast. */
  successTitle?: string
  /** Toast body for the success toast (e.g. <>0.42 USDC distributed</>). */
  successBody?: ReactNode
  /** Toast title on revert / RPC failure. Defaults to "TRANSACTION FAILED". */
  errorTitle?: string
  /** Optional callback fired once on transition into isSuccess. Receives the
   *  tx receipt so callers can poll the indexer up to `receipt.blockNumber`. */
  onSuccess?: (receipt?: TransactionReceipt) => void
  /** Wagmi options pass-through. */
  wagmi?: UseWriteContractParameters
}

/**
 * Shared wrapper around `useWriteContract` + `useWaitForTransactionReceipt`
 * that emits the canonical success / failure toasts the rest of the app uses
 * and exposes a clean `{ write, isPending, isConfirming, ... }` surface.
 *
 * One source of truth for write-action UX so every resolve-modal action card
 * behaves identically (3 s reset on success, error toast carries a legible
 * decoded revert via `legibleWriteError`).
 */
export function useWriteAction(
  options: UseWriteActionOptions = {},
): UseWriteActionResult {
  const {
    successTitle,
    successBody,
    errorTitle = 'TRANSACTION FAILED',
    onSuccess,
    wagmi,
  } = options

  const {
    writeContract,
    data: hash,
    isPending,
    error: writeError,
    reset,
  } = useWriteContract(wagmi)
  const {
    isLoading: isConfirming,
    isSuccess,
    isError,
    error: receiptError,
    data: receipt,
  } = useWaitForTransactionReceipt({ hash })

  const { push } = useToasts()

  useEffect(() => {
    if (isSuccess) {
      if (successTitle) {
        push({ tone: 'success', title: successTitle, body: successBody })
      }
      onSuccess?.(receipt)
      const timer = setTimeout(() => reset(), 3000)
      return () => clearTimeout(timer)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSuccess])

  useEffect(() => {
    if (writeError || isError) {
      push({
        tone: 'danger',
        title: errorTitle,
        body: legibleWriteError(writeError ?? receiptError),
      })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [writeError, isError])

  return {
    write: writeContract,
    hash,
    isPending,
    isConfirming,
    isSuccess,
    isError,
    error: (writeError ?? receiptError) as Error | null,
    reset,
  }
}
