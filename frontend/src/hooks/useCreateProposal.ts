/**
 * Write hook for creating a governance proposal. Encodes
 * `(targets, values, calldatas, description)` and submits via
 * Governor.propose(). The step is derived from wagmi state at render time.
 *
 * Revert handling: the installed `@wagmi/core` throws on a reverted receipt,
 * so a revert arrives as the receipt error and the step reads 'error'.
 */
import { useEffect, useEffectEvent } from 'react'
import { decodeEventLog, type Address, type Hex, type TransactionReceipt } from 'viem'

import { commitmentsGovernorAbi } from '../generated'
import { useTx, type TxStep } from './useWriteAction'

export type ProposalStep = TxStep

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
  /** Fired exactly once when the receipt confirms. Forms use this to
   *  auto-navigate to the proposal detail page. */
  onConfirmed?: (proposalId: string | undefined) => void
}

/** The proposalId from the receipt's ProposalCreated log. */
function proposalIdOf(receipt: TransactionReceipt | undefined): string | undefined {
  if (!receipt) return undefined
  for (const log of receipt.logs) {
    try {
      const decoded = decodeEventLog({
        abi: commitmentsGovernorAbi,
        eventName: 'ProposalCreated',
        data: log.data,
        topics: log.topics,
      })
      return decoded.args.proposalId.toString()
    } catch {
      // Not a ProposalCreated log; keep scanning.
    }
  }
  return undefined
}

export function useCreateProposal(
  governor: Address | undefined,
  options: UseCreateProposalOptions = {},
): CreateProposalFlow {
  const tx = useTx()
  const proposalId = proposalIdOf(tx.receipt)

  const confirmed = useEffectEvent((receipt: TransactionReceipt) => options.onConfirmed?.(proposalIdOf(receipt)))
  useEffect(() => {
    if (tx.receipt) confirmed(tx.receipt)
  }, [tx.receipt])

  // With a hash the write was sent, so the error is the receipt's — usually a
  // revert. Name the common causes.
  const error: Error | null =
    tx.error && tx.hash
      ? new Error(
          `The proposal transaction failed (tx ${tx.hash}): ${tx.error.message}\nCommon causes: duplicate proposal (same targets / values / calldatas / description hash already exists) or proposer below the proposalThreshold. Inspect the tx in a block explorer for the revert reason.`,
          { cause: tx.error },
        )
      : tx.error

  function propose(args: ProposalArgs) {
    if (!governor) return
    tx.write({
      abi: commitmentsGovernorAbi,
      address: governor,
      functionName: 'propose',
      args: [args.targets, args.values, args.calldatas, args.description],
    })
  }

  return { step: tx.step, txHash: tx.hash, proposalId, error, propose, reset: tx.reset }
}
