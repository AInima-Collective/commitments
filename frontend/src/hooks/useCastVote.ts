/**
 * Write hook for casting a vote on a governance proposal.
 *
 * Uses Governor.castVoteWithReason so the optional reason flows into
 * the OZ VoteCast/VoteCastWithReason event log surface; the indexer's
 * Wave-6 handlers persist both shapes.
 */
import type { Address, Hex } from 'viem'
import { useWaitForTransactionReceipt, useWriteContract } from 'wagmi'

import { commitmentsGovernorAbi } from '../abi/governance'
import type { ProposalStep } from './useCreateProposal'

export interface CastVoteFlow {
  step: ProposalStep
  txHash: Hex | undefined
  error: Error | null
  /** support: 0=against, 1=for, 2=abstain. */
  castVote: (support: 0 | 1 | 2, reason?: string) => void
  reset: () => void
}

export function useCastVote(
  governor: Address | undefined,
  proposalId: bigint | string | undefined,
): CastVoteFlow {
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

  const step: ProposalStep = receiptSuccess
    ? 'confirmed'
    : receiptError || writeError
      ? 'error'
      : writeSuccess
        ? 'confirming'
        : writePending
          ? 'signing'
          : 'idle'

  function castVote(support: 0 | 1 | 2, reason: string = '') {
    if (!governor || proposalId == null) return
    const id = typeof proposalId === 'bigint' ? proposalId : BigInt(proposalId)
    writeContract({
      abi: commitmentsGovernorAbi,
      address: governor,
      functionName: 'castVoteWithReason',
      args: [id, support, reason],
    })
  }

  return {
    step,
    txHash,
    error: writeError ?? receiptErr ?? null,
    castVote,
    reset,
  }
}
