import { useEffect } from 'react'
import { useWaitForTransactionReceipt } from 'wagmi'
import { useToasts } from '../components/ui'
import type { ReactNode } from 'react'

export interface UseTxReceiptOptions {
  /** The write hook's tx hash (`writeContract` `data`). */
  hash: `0x${string}` | undefined
  /** Success-toast title, shown once the receipt confirms. */
  successTitle: string
  /** Optional success-toast body. */
  successBody?: ReactNode
  /** Fired once on confirmation — refetch reads, clear form state, etc. */
  onSuccess?: () => void
  /** The write hook's `reset`, called after a confirmed tx so the next click starts clean. */
  reset?: () => void
}

/**
 * Watch a write transaction's receipt and fire the canonical success toast +
 * `onSuccess` + `reset` once it confirms.
 *
 * Pairs with any write hook that exposes `{ data: hash, reset }` — including the
 * wagmi-generated typed hooks (`useWriteCommitmentManagerJoinGroup`, …) and a
 * bare `useWriteContract`. Lets pages compose typed writes with the shared
 * receipt/toast UX instead of hand-rolling a `useWaitForTransactionReceipt` +
 * `useEffect(() => { if (isSuccess) { push(...); ...; reset() } })` block per
 * action. Returns the receipt query so callers can read `isLoading` for button
 * state.
 */
export function useTxReceipt({
  hash,
  successTitle,
  successBody,
  onSuccess,
  reset,
}: UseTxReceiptOptions) {
  const receipt = useWaitForTransactionReceipt({ hash })
  const { push } = useToasts()

  useEffect(() => {
    if (!receipt.isSuccess) return
    push({ tone: 'success', title: successTitle, body: successBody })
    onSuccess?.()
    reset?.()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [receipt.isSuccess])

  return receipt
}
