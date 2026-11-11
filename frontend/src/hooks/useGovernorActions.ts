/**
 * Write hooks for queue + execute. Both are signature-identical
 * (`(targets, values, calldatas, descriptionHash)`); we expose two named
 * functions over the shared `useTx` step so the proposal-detail page can
 * route them to the right button without duplicating boilerplate.
 */
import { keccak256, stringToHex, type Address, type Hex } from 'viem'

import { commitmentsGovernorAbi } from '../generated'
import type { ProposalStep } from './useCreateProposal'
import { useTx } from './useWriteAction'

export interface ProposalActionsArgs {
  targets: Address[]
  values: bigint[]
  calldatas: Hex[]
  description: string
}

export interface ProposalActionFlow {
  step: ProposalStep
  txHash: Hex | undefined
  error: Error | null
  reset: () => void
}

export interface QueueProposalFlow extends ProposalActionFlow {
  queue: (args: ProposalActionsArgs) => void
}

export interface ExecuteProposalFlow extends ProposalActionFlow {
  execute: (args: ProposalActionsArgs) => void
}

export function useQueueProposal(governor: Address | undefined): QueueProposalFlow {
  const tx = useTx()

  function queue(args: ProposalActionsArgs) {
    if (!governor) return
    const descriptionHash = keccak256(stringToHex(args.description))
    tx.write({
      abi: commitmentsGovernorAbi,
      address: governor,
      functionName: 'queue',
      args: [args.targets, args.values, args.calldatas, descriptionHash],
    })
  }

  return { step: tx.step, txHash: tx.hash, error: tx.error, queue, reset: tx.reset }
}

export function useExecuteProposal(governor: Address | undefined): ExecuteProposalFlow {
  const tx = useTx()

  function execute(args: ProposalActionsArgs) {
    if (!governor) return
    const descriptionHash = keccak256(stringToHex(args.description))
    tx.write({
      abi: commitmentsGovernorAbi,
      address: governor,
      functionName: 'execute',
      args: [args.targets, args.values, args.calldatas, descriptionHash],
    })
  }

  return { step: tx.step, txHash: tx.hash, error: tx.error, execute, reset: tx.reset }
}
