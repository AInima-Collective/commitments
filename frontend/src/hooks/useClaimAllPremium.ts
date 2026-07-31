import { useCallback, useEffect, useRef, useState } from 'react'
import { type Address } from 'viem'
import { useWaitForTransactionReceipt, useWriteContract } from 'wagmi'
import { commitmentManagerAbi } from '../generated'
import { useToasts } from '../components/ui'
import type { ClaimAllQueueProgress } from './useClaimAllQueue'

export interface UseClaimAllPremiumParams {
  managerAddress: Address | undefined
  /** Called once per membership when its premium-claim tx confirms. */
  onRowClaimed?: (commitmentId: bigint) => void
}

export interface UseClaimAllPremiumReturn {
  /** Sequentially claim premium across the supplied member commitments. No-op when busy. */
  run: (commitmentIds: bigint[]) => void
  /** Stop after the in-flight tx settles. */
  cancel: () => void
  isRunning: boolean
  progress: ClaimAllQueueProgress | null
}

/**
 * useClaimAllPremium — sequential per-membership `claimMemberPremium` queue.
 *
 * The earn-side twin of {@link useClaimAllQueue}: underwriting premium is
 * claimed per mutual membership (`claimMemberPremium(commitmentId)`), a
 * different manager entry point than the per-(commitment, strategy) `claim`
 * the yield queue drives — so it can't ride that queue. We sequence it the same
 * way: fire one `writeContract`, await the receipt, advance. Halts on any revert
 * with a danger toast; remaining memberships stay claimable for per-membership
 * retry from the mutual page.
 */
export function useClaimAllPremium({
  managerAddress,
  onRowClaimed,
}: UseClaimAllPremiumParams): UseClaimAllPremiumReturn {
  const { writeContract, data: hash, reset } = useWriteContract()
  const { isSuccess, isError, error } = useWaitForTransactionReceipt({ hash })
  const { push } = useToasts()

  const [queue, setQueue] = useState<bigint[]>([])
  const [index, setIndex] = useState(0)
  const cancelledRef = useRef(false)

  const total = queue.length
  const isRunning = total > 0 && index < total
  const progress: ClaimAllQueueProgress | null = isRunning
    ? { current: index + 1, total }
    : null

  // Fire the in-flight tx for the current index whenever queue or index changes.
  useEffect(() => {
    if (!isRunning) return
    if (!managerAddress) return
    if (cancelledRef.current) return
    writeContract({
      abi: commitmentManagerAbi,
      address: managerAddress,
      functionName: 'claimMemberPremium',
      args: [queue[index]],
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps -- writeContract is stable; deps narrowed to drivers
  }, [queue, index, managerAddress])

  // On success: notify caller, advance, and clear receipt state for the next loop.
  useEffect(() => {
    if (!isSuccess || !isRunning) return
    const id = queue[index]
    if (id !== undefined) onRowClaimed?.(id)
    const next = index + 1
    reset()
    if (cancelledRef.current || next >= queue.length) {
      setQueue([])
      setIndex(0)
      cancelledRef.current = false
    } else {
      setIndex(next)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSuccess])

  // On revert: halt the queue; emit a toast that names the failing membership.
  useEffect(() => {
    if (!isError || !isRunning) return
    const id = queue[index]
    push({
      tone: 'danger',
      title: 'PREMIUM CLAIM HALTED',
      body:
        (error as { shortMessage?: string })?.shortMessage ??
        `Premium claim for #${id?.toString() ?? '?'} reverted. Remaining memberships still claimable.`,
    })
    reset()
    // eslint-disable-next-line react-hooks/set-state-in-effect -- external subscription (wagmi revert) halts queue
    setQueue([])
    setIndex(0)
    cancelledRef.current = false
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isError])

  const run = useCallback(
    (commitmentIds: bigint[]) => {
      if (commitmentIds.length === 0) return
      if (queue.length > 0) return
      cancelledRef.current = false
      setIndex(0)
      setQueue(commitmentIds)
    },
    [queue.length],
  )

  const cancel = useCallback(() => {
    cancelledRef.current = true
  }, [])

  return { run, cancel, isRunning, progress }
}
