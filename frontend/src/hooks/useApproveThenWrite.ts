import { useEffect, useEffectEvent } from 'react'
import { type Address, type TransactionReceipt, erc20Abi } from 'viem'
import { useReadContract } from 'wagmi'
import { POLL } from './polling'
import { useTx } from './useWriteAction'

export type ApproveThenWriteStep = 'idle' | 'approving' | 'approved' | 'writing' | 'complete' | 'error'

interface UseApproveThenWriteParams {
  /** The ERC-20 the spender pulls. */
  token: Address | undefined
  /** The contract the write runs against, which pulls `token` from `owner`. */
  spender: Address | undefined
  owner: Address | undefined
  /** Fired once when the approve mines, after the allowance refetch starts. */
  onApproved?: (receipt: TransactionReceipt) => void
  /** Fired once when the write mines. */
  onSuccess?: (receipt: TransactionReceipt) => void
}

/**
 * The approve-then-write flow every funding hook shares: the owner's balance
 * and allowance of `token`, an ERC-20 `approve(spender, amount)`, and one
 * follow-up write. The step is derived from the two writes' wagmi flags; the
 * latest action wins, because `approve` clears the write.
 */
export function useApproveThenWrite({ token, spender, owner, onApproved, onSuccess }: UseApproveThenWriteParams) {
  const enabled = !!token && !!spender && !!owner
  const { data: balance } = useReadContract({
    abi: erc20Abi,
    address: token,
    functionName: 'balanceOf',
    args: owner ? [owner] : undefined,
    query: { enabled, refetchInterval: POLL.fast },
  })
  const { data: allowance, refetch: refetchAllowance } = useReadContract({
    abi: erc20Abi,
    address: token,
    functionName: 'allowance',
    args: owner && spender ? [owner, spender] : undefined,
    query: { enabled, refetchInterval: POLL.fast },
  })

  const approveTx = useTx()
  const writeTx = useTx()

  const approved = useEffectEvent((receipt: TransactionReceipt) => {
    void refetchAllowance()
    onApproved?.(receipt)
  })
  const written = useEffectEvent((receipt: TransactionReceipt) => onSuccess?.(receipt))
  useEffect(() => {
    if (approveTx.receipt) approved(approveTx.receipt)
  }, [approveTx.receipt])
  useEffect(() => {
    if (writeTx.receipt) written(writeTx.receipt)
  }, [writeTx.receipt])

  const step: ApproveThenWriteStep =
    writeTx.step !== 'idle'
      ? writeTx.step === 'confirmed'
        ? 'complete'
        : writeTx.step === 'error'
          ? 'error'
          : 'writing'
      : approveTx.step === 'idle'
        ? 'idle'
        : approveTx.step === 'confirmed'
          ? 'approved'
          : approveTx.step === 'error'
            ? 'error'
            : 'approving'

  function approve(amount: bigint) {
    if (!token || !spender) return
    writeTx.reset()
    approveTx.write({ abi: erc20Abi, address: token, functionName: 'approve', args: [spender, amount] })
  }

  function reset() {
    approveTx.reset()
    writeTx.reset()
  }

  return {
    step,
    balance,
    allowance,
    refetchAllowance,
    approve,
    /** Send the follow-up write. */
    write: writeTx.write,
    /** The latest write call's parameters, for flows with more than one write. */
    writeVariables: writeTx.variables,
    /** True while the active transaction waits on the wallet rather than the chain. */
    awaitingWallet: (writeTx.step === 'idle' ? approveTx : writeTx).step === 'signing',
    /** The follow-up write's receipt, once mined. */
    receipt: writeTx.receipt,
    error: step === 'error' ? (writeTx.error ?? approveTx.error) : null,
    reset,
  }
}
