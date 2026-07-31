import { useCallback, useEffect, useRef, useState } from 'react'
import { type Address, type Hex } from 'viem'
import { useWaitForTransactionReceipt, useWriteContract } from 'wagmi'
import { commitmentManagerAbi } from '../generated'
import { useToasts } from '../components/ui'

export interface ClaimAllQueueEntry {
  commitmentId: bigint
  /** v2 distribution strategy + claimData to claim from. The dashboard populates
   *  these from useClaimableYield (one entry per bound strategy). An entry
   *  without a strategy is skipped. */
  strategy?: Address
  claimData?: Hex
}

export interface UseClaimAllQueueParams {
  managerAddress: Address | undefined
  /** Called once per row when its claim tx confirms successfully. The Dashboard
   *  uses this to update the optimistic `claimedIds` set and emit a toast. */
  onRowClaimed?: (commitmentId: bigint) => void
}

export interface ClaimAllQueueProgress {
  current: number
  total: number
}

export interface UseClaimAllQueueReturn {
  /** Kick off a sequential claim across the supplied entries. No-op when busy. */
  run: (entries: ClaimAllQueueEntry[]) => void
  /** Stop after the in-flight tx settles (best-effort: a tx already submitted will still complete). */
  cancel: () => void
  /** True between `run()` and the queue's natural completion / halt. */
  isRunning: boolean
  /** Progress shape suitable for passing to PortfolioHero's claimAllAction prop. */
  progress: ClaimAllQueueProgress | null
}

/**
 * useClaimAllQueue — sequential per-(commitment, strategy) `claim` queue.
 *
 * The CommitmentManager exposes claim per (commitment, strategy); there is no
 * batch entry. To give users a one-click "Claim all" CTA we drive a queue
 * ourselves: fire one writeContract, await the receipt, advance to the next
 * entry. Halts on any revert with a danger toast — remaining entries stay
 * claimable so the user can retry per-row.
 *
 * v2: each entry carries a `strategy` + `claimData` (claim is per-strategy); the
 * dashboard builds these from useClaimableYield's per-binding entries.
 */
export function useClaimAllQueue({
  managerAddress,
  onRowClaimed,
}: UseClaimAllQueueParams): UseClaimAllQueueReturn {
  const { writeContract, data: hash, reset } = useWriteContract()
  const { isSuccess, isError, error } = useWaitForTransactionReceipt({ hash })
  const { push } = useToasts()

  const [queue, setQueue] = useState<ClaimAllQueueEntry[]>([])
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
    const entry = queue[index]
    if (!entry.strategy) return
    writeContract({
      abi: commitmentManagerAbi,
      address: managerAddress,
      functionName: 'claim',
      args: [entry.commitmentId, entry.strategy, entry.claimData ?? ('0x' as Hex)],
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps -- writeContract is stable; deps narrowed to drivers
  }, [queue, index, managerAddress])

  // On success: notify caller, advance, and clear receipt state for the next loop.
  useEffect(() => {
    if (!isSuccess || !isRunning) return
    const id = queue[index]?.commitmentId
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

  // On revert: halt the queue; emit a toast that names the failing commitment.
  useEffect(() => {
    if (!isError || !isRunning) return
    const id = queue[index]?.commitmentId
    push({
      tone: 'danger',
      title: 'CLAIM HALTED',
      body:
        (error as { shortMessage?: string })?.shortMessage ??
        `Claim of #${id?.toString() ?? '?'} reverted. Remaining rows still claimable.`,
    })
    reset()
    // eslint-disable-next-line react-hooks/set-state-in-effect -- external subscription (wagmi revert) halts queue
    setQueue([])
    setIndex(0)
    cancelledRef.current = false
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isError])

  const run = useCallback(
    (entries: ClaimAllQueueEntry[]) => {
      if (entries.length === 0) return
      if (queue.length > 0) return
      cancelledRef.current = false
      setIndex(0)
      setQueue(entries)
    },
    [queue.length],
  )

  const cancel = useCallback(() => {
    cancelledRef.current = true
  }, [])

  return { run, cancel, isRunning, progress }
}
