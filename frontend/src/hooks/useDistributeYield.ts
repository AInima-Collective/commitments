import { useEffect } from 'react'
import { type Address } from 'viem'
import { useWaitForTransactionReceipt, useWriteContract } from 'wagmi'
import { commitmentManagerAbi } from '../generated'

interface UseDistributeYieldParams {
  managerAddress: Address | undefined
  commitmentId: bigint
}

interface UseDistributeYieldReturn {
  distribute: () => void
  isPending: boolean
  isConfirming: boolean
  isSuccess: boolean
  isError: boolean
  error: unknown
  hash: `0x${string}` | undefined
  reset: () => void
}

/**
 * useDistributeYield(commitmentId) — wraps writeContract for the permissionless
 * v2 `distributeAll(uint256)` selector, which pushes accrued payouts across
 * every distribution strategy bound to the commitment in one call.
 *
 * Standard write/wait pattern: separate primitives for write/wait, auto-clears
 * the success-state after 3000ms so the inline label flips back to idle without
 * a manual reset.
 */
export function useDistributeYield({
  managerAddress,
  commitmentId,
}: UseDistributeYieldParams): UseDistributeYieldReturn {
  const {
    writeContract,
    data: hash,
    isPending,
    reset,
    error: writeError,
  } = useWriteContract()
  const {
    isLoading: isConfirming,
    isSuccess,
    isError,
    error: receiptError,
  } = useWaitForTransactionReceipt({ hash })

  // Auto-clear after 3s success so the inline label flips back to idle
  useEffect(() => {
    if (isSuccess) {
      const timer = setTimeout(() => reset(), 3000)
      return () => clearTimeout(timer)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSuccess])

  const distribute = () => {
    if (!managerAddress) return
    writeContract({
      abi: commitmentManagerAbi,
      address: managerAddress,
      functionName: 'distributeAll',
      args: [commitmentId],
    })
  }

  return {
    distribute,
    isPending,
    isConfirming,
    isSuccess,
    isError,
    error: writeError ?? receiptError,
    hash,
    reset,
  }
}
