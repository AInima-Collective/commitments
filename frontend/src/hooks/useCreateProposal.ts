/**
 * Write hook for creating a governance proposal. Encodes
 * `(targets, values, calldatas, description)` and submits via
 * Governor.propose(). The step is *derived* from wagmi state at render time
 * (no useEffect setState — react-hooks/set-state-in-effect lint rule).
 *
 * Revert handling: viem's `waitForTransactionReceipt` resolves successfully
 * when the tx reverts on-chain — it returns the receipt with
 * `status: 'reverted'` rather than throwing. We classify that as 'error' so
 * the form surfaces a danger Notice instead of falsely reporting success.
 */
import { useEffect, useRef } from 'react'
import { decodeEventLog, type Address, type Hex } from 'viem'
import { useWaitForTransactionReceipt, useWriteContract } from 'wagmi'

import { commitmentsGovernorAbi } from '../abi/governance'

export type ProposalStep = 'idle' | 'signing' | 'confirming' | 'confirmed' | 'error'

export interface ProposalArgs {
  targets: Address[]
  values: bigint[]
  calldatas: Hex[]
  description: string
}

export interface CreateProposalFlow {
  step: ProposalStep
  txHash: Hex | undefined
  /** Decoded proposalId from the ProposalCreated log on success. Undefined
   *  while pending or on error. */
  proposalId: string | undefined
  error: Error | null
  propose: (args: ProposalArgs) => void
  reset: () => void
}

export interface UseCreateProposalOptions {
  /** Fired exactly once when the receipt confirms successfully (status='success'
   *  and a ProposalCreated log decoded). Forms use this to auto-navigate to
   *  the proposal detail page. */
  onConfirmed?: (proposalId: string | undefined) => void
}

export function useCreateProposal(
  governor: Address | undefined,
  options: UseCreateProposalOptions = {},
): CreateProposalFlow {
  const {
    writeContract,
    data: txHash,
    error: writeError,
    reset: resetWrite,
    isPending: writePending,
    isSuccess: writeSuccess,
  } = useWriteContract()

  const {
    isSuccess: receiptSuccess,
    isError: receiptError,
    error: receiptErrorObj,
    data: receipt,
  } = useWaitForTransactionReceipt({ hash: txHash })

  // viem returns the receipt even when the tx reverted on-chain (status =
  // 'reverted') without throwing. Treat that as an error, not a success.
  const reverted = receiptSuccess && receipt?.status === 'reverted'
  const confirmed = receiptSuccess && receipt?.status === 'success'

  const step: ProposalStep = confirmed
    ? 'confirmed'
    : reverted || receiptError || writeError
      ? 'error'
      : writeSuccess
        ? 'confirming'
        : writePending
          ? 'signing'
          : 'idle'

  // Pull the proposalId out of the ProposalCreated log on success so the
  // form can navigate the user straight to /governance/:gov/:id without
  // a separate read.
  const proposalId = (() => {
    if (!confirmed || !receipt) return undefined
    for (const log of receipt.logs) {
      try {
        const decoded = decodeEventLog({
          abi: commitmentsGovernorAbi,
          eventName: 'ProposalCreated',
          data: log.data,
          topics: log.topics,
        })
        const args = decoded.args as { proposalId?: bigint } | readonly unknown[]
        const id =
          args && typeof args === 'object' && 'proposalId' in args
            ? (args as { proposalId: bigint }).proposalId
            : (args as readonly unknown[])[0]
        if (typeof id === 'bigint') return id.toString()
      } catch {
        // Not a ProposalCreated log; keep scanning.
      }
    }
    return undefined
  })()

  const error: Error | null =
    writeError
    ?? receiptErrorObj
    ?? (reverted
      ? new Error(
          `Transaction reverted on-chain (tx ${txHash ?? 'unknown'}). Common causes: duplicate proposal (same targets / values / calldatas / description hash already exists) or proposer below the proposalThreshold. Inspect the tx in a block explorer for the revert reason.`,
        )
      : null)

  // Fire onConfirmed exactly once per successful submission. Uses a ref to
  // gate so a re-render after the receipt arrives doesn't double-fire (and
  // a fresh propose() resets the gate).
  const firedFor = useRef<Hex | undefined>(undefined)
  const onConfirmed = options.onConfirmed
  useEffect(() => {
    if (step === 'confirmed' && txHash && firedFor.current !== txHash) {
      firedFor.current = txHash
      onConfirmed?.(proposalId)
    }
    if (step === 'idle') {
      firedFor.current = undefined
    }
  }, [step, txHash, proposalId, onConfirmed])

  function propose(args: ProposalArgs) {
    if (!governor) return
    writeContract({
      abi: commitmentsGovernorAbi,
      address: governor,
      functionName: 'propose',
      args: [args.targets, args.values, args.calldatas, args.description],
    })
  }

  return {
    step,
    txHash,
    proposalId,
    error,
    propose,
    reset: resetWrite,
  }
}
