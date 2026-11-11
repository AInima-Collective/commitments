import { useEffect, useRef, useState } from 'react'
import { type Address, type Hex } from 'viem'
import { useConfig } from 'wagmi'
import { waitForTransactionReceipt } from 'wagmi/actions'
import { commitmentManagerAbi } from '../generated'
import { useToasts } from '../components/ui'
import { useTx } from './useWriteAction'

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

export interface UseClaimAllQueueReturn<T> {
  /** Kick off a sequential claim across the supplied entries. No-op when busy. */
  run: (entries: T[]) => void
  /** Stop after the in-flight tx settles (best-effort: a tx already submitted will still complete). */
  cancel: () => void
  /** True between `run()` and the queue's natural completion / halt. */
  isRunning: boolean
  /** Progress shape suitable for passing to PortfolioHero's claimAllAction prop. */
  progress: ClaimAllQueueProgress | null
}

interface TxQueueParams<T> {
  /** The write for one entry, or null to skip it. */
  send: (
    entry: T,
    write: ReturnType<typeof useTx>['writeAsync'],
  ) => Promise<Hex> | null
  commitmentIdOf: (entry: T) => bigint
  onRowClaimed?: (commitmentId: bigint) => void
  haltTitle: string
  /** Toast body when the failure has no short message. */
  haltBody: (commitmentId: bigint) => string
}

/**
 * Send one write per entry in order, each after the last one mines. Halts on
 * the first rejection or revert with a danger toast; the remaining entries
 * stay claimable per row.
 */
export function useTxQueue<T>({
  send,
  commitmentIdOf,
  onRowClaimed,
  haltTitle,
  haltBody,
}: TxQueueParams<T>): UseClaimAllQueueReturn<T> {
  const config = useConfig()
  const { writeAsync } = useTx()
  const { push } = useToasts()
  const [progress, setProgress] = useState<ClaimAllQueueProgress | null>(null)
  const cancelledRef = useRef(false)
  // Leaving the page stops the queue: no wallet prompts for a list no longer shown.
  useEffect(() => () => {
    cancelledRef.current = true
  }, [])

  async function drain(entries: T[]) {
    cancelledRef.current = false
    for (let i = 0; i < entries.length && !cancelledRef.current; i++) {
      setProgress({ current: i + 1, total: entries.length })
      const id = commitmentIdOf(entries[i])
      try {
        const sent = send(entries[i], writeAsync)
        if (!sent) continue
        await waitForTransactionReceipt(config, { hash: await sent })
        onRowClaimed?.(id)
      } catch (error) {
        push({
          tone: 'danger',
          title: haltTitle,
          body: (error as { shortMessage?: string })?.shortMessage ?? haltBody(id),
        })
        break
      }
    }
    setProgress(null)
  }

  return {
    run: (entries) => {
      if (entries.length === 0 || progress) return
      void drain(entries)
    },
    cancel: () => {
      cancelledRef.current = true
    },
    isRunning: progress !== null,
    progress,
  }
}

/**
 * useClaimAllQueue — sequential per-(commitment, strategy) `claim` queue.
 *
 * The CommitmentManager exposes claim per (commitment, strategy); there is no
 * batch entry, so "Claim all" drives a {@link useTxQueue}.
 */
export function useClaimAllQueue({
  managerAddress,
  onRowClaimed,
}: UseClaimAllQueueParams): UseClaimAllQueueReturn<ClaimAllQueueEntry> {
  return useTxQueue<ClaimAllQueueEntry>({
    send: (entry, write) =>
      managerAddress && entry.strategy
        ? write({
            abi: commitmentManagerAbi,
            address: managerAddress,
            functionName: 'claim',
            args: [entry.commitmentId, entry.strategy, entry.claimData ?? '0x'],
          })
        : null,
    commitmentIdOf: (entry) => entry.commitmentId,
    onRowClaimed,
    haltTitle: 'CLAIM HALTED',
    haltBody: (id) => `Claim of #${id.toString()} reverted. Remaining rows still claimable.`,
  })
}
