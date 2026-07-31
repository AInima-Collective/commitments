/**
 * Write hooks for queue + execute. Both are signature-identical
 * (`(targets, values, calldatas, descriptionHash)`); we expose two named
 * functions plus a shared step machine so the proposal-detail page can
 * route them to the right button without duplicating boilerplate.
 */
import { keccak256, stringToHex, type Address, type Hex } from 'viem'
import { useWaitForTransactionReceipt, useWriteContract } from 'wagmi'

import { commitmentsGovernorAbi } from '../abi/governance'
import type { ProposalStep } from './useCreateProposal'

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

function deriveStep(args: {
  writePending: boolean
  writeSuccess: boolean
  writeError?: Error | null
  receiptSuccess: boolean
  receiptError: boolean
}): ProposalStep {
  if (args.receiptSuccess) return 'confirmed'
  if (args.receiptError || args.writeError) return 'error'
  if (args.writeSuccess) return 'confirming'
  if (args.writePending) return 'signing'
  return 'idle'
}

export function useQueueProposal(governor: Address | undefined): QueueProposalFlow {
  const {
    writeContract,
    data: txHash,
    error: writeError,
    reset,
    isPending: writePending,
    isSuccess: writeSuccess,
  } = useWriteContract()

  const { isSuccess: receiptSuccess, isError: receiptError, error: receiptErr } =
    useWaitForTransactionReceipt({ hash: txHash })

  function queue(args: ProposalActionsArgs) {
    if (!governor) return
    const descriptionHash = keccak256(stringToHex(args.description))
    writeContract({
      abi: commitmentsGovernorAbi,
      address: governor,
      functionName: 'queue',
      args: [args.targets, args.values, args.calldatas, descriptionHash],
    })
  }

  return {
    step: deriveStep({ writePending, writeSuccess, writeError, receiptSuccess, receiptError }),
    txHash,
    error: writeError ?? receiptErr ?? null,
    queue,
    reset,
  }
}

export function useExecuteProposal(governor: Address | undefined): ExecuteProposalFlow {
  const {
    writeContract,
    data: txHash,
    error: writeError,
    reset,
    isPending: writePending,
    isSuccess: writeSuccess,
  } = useWriteContract()

  const { isSuccess: receiptSuccess, isError: receiptError, error: receiptErr } =
    useWaitForTransactionReceipt({ hash: txHash })

  function execute(args: ProposalActionsArgs) {
    if (!governor) return
    const descriptionHash = keccak256(stringToHex(args.description))
    writeContract({
      abi: commitmentsGovernorAbi,
      address: governor,
      functionName: 'execute',
      args: [args.targets, args.values, args.calldatas, descriptionHash],
    })
  }

  return {
    step: deriveStep({ writePending, writeSuccess, writeError, receiptSuccess, receiptError }),
    txHash,
    error: writeError ?? receiptErr ?? null,
    execute,
    reset,
  }
}
