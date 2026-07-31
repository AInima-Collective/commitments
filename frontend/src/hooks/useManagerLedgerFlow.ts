import { useEffect, useState } from 'react'
import { type Address, erc20Abi, parseSignature } from 'viem'
import {
  useChainId,
  usePublicClient,
  useReadContract,
  useSignTypedData,
  useWaitForTransactionReceipt,
  useWriteContract,
} from 'wagmi'
import { commitmentManagerAbi } from '../generated'
import { ERC2612_ABI, buildPermitTypedData, resolvePermitDomain } from '../lib/erc2612'

export type LedgerFlowStep =
  | 'idle'
  | 'approving'
  | 'approved'
  | 'signing'
  | 'depositing'
  | 'withdrawing'
  | 'complete'
  | 'error'

export interface ManagerLedgerFlow {
  step: LedgerFlowStep
  /** ERC-20 balance of `token` in the user's wallet (deposit source). */
  walletBalance: bigint | undefined
  /** Current allowance the user has granted the manager to pull `token`. */
  currentAllowance: bigint | undefined
  /**
   * Whether `token` implements ERC-2612 permit — i.e. `depositWithPermit` can
   * collapse approve + deposit into a single tx. `undefined` while probing.
   */
  supportsPermit: boolean | undefined
  approve: (amount: bigint) => void
  /** manager.deposit(token, amount) — moves wallet tokens into free balance. */
  deposit: (amount: bigint) => void
  /**
   * One-tap deposit: sign an ERC-2612 permit off-chain, then
   * manager.depositWithPermit(...) in a single tx. Only valid when
   * `supportsPermit` is true.
   */
  depositWithPermit: (amount: bigint) => void
  /** manager.withdraw(token, amount) — moves free balance back to the wallet. */
  withdraw: (amount: bigint) => void
  reset: () => void
  error: Error | null
  txHash: `0x${string}` | undefined
}

interface UseManagerLedgerFlowParams {
  managerAddress: Address | undefined
  /** Backing token being deposited/withdrawn (raw ERC-20 or vault share). */
  token: Address | undefined
  userAddress: Address | undefined
  onSuccess?: () => void
}

/**
 * Drives the v2 backing flow against the CommitmentManager ledger:
 *   - approve(amount) → ERC-20 approve(manager, amount) on `token`
 *   - deposit(amount) → manager.deposit(token, amount) (needs prior allowance)
 *   - withdraw(amount) → manager.withdraw(token, amount) (no approval)
 *
 * The manager is the spender for the approve step (it pulls the token on
 * deposit), distinct from the vault-deposit flow where the vault is the spender.
 */
export function useManagerLedgerFlow({
  managerAddress,
  token,
  userAddress,
  onSuccess,
}: UseManagerLedgerFlowParams): ManagerLedgerFlow {
  const [step, setStep] = useState<LedgerFlowStep>('idle')
  const [error, setError] = useState<Error | null>(null)

  const chainId = useChainId()
  const publicClient = usePublicClient()
  const { signTypedDataAsync } = useSignTypedData()

  const readEnabled = !!token && !!userAddress && !!managerAddress

  const { data: walletBalance } = useReadContract({
    abi: erc20Abi,
    address: token,
    functionName: 'balanceOf',
    args: userAddress ? [userAddress] : undefined,
    query: { enabled: readEnabled, refetchInterval: 15_000 },
  })

  const { data: currentAllowance, refetch: refetchAllowance } = useReadContract({
    abi: erc20Abi,
    address: token,
    functionName: 'allowance',
    args: userAddress && managerAddress ? [userAddress, managerAddress] : undefined,
    query: { enabled: readEnabled, refetchInterval: 15_000 },
  })

  // Permit probe: a successful `nonces(owner)` read means the token is ERC-2612
  // and can take the one-tx `depositWithPermit` path. A revert (plain ERC-20 or
  // vault share) surfaces as an error → `supportsPermit` false, and the UI keeps
  // the approve → deposit flow.
  const { data: permitNonce, isError: permitProbeError } = useReadContract({
    abi: ERC2612_ABI,
    address: token,
    functionName: 'nonces',
    args: userAddress ? [userAddress] : undefined,
    query: { enabled: readEnabled },
  })
  const supportsPermit = permitProbeError ? false : permitNonce !== undefined ? true : undefined

  const {
    writeContract: writeApprove,
    data: approveTxHash,
    isError: approveIsError,
    error: approveError,
    reset: resetApprove,
  } = useWriteContract()
  const { isSuccess: approveSuccess, isError: approveReceiptError } =
    useWaitForTransactionReceipt({ hash: approveTxHash })

  const {
    writeContract: writeMutation,
    data: mutationTxHash,
    isError: mutationIsError,
    error: mutationError,
    reset: resetMutation,
  } = useWriteContract()
  const { isSuccess: mutationSuccess, isError: mutationReceiptError } =
    useWaitForTransactionReceipt({ hash: mutationTxHash })

  // Advance when approve confirms.
  useEffect(() => {
    if (approveSuccess && step === 'approving') {
      void refetchAllowance()
      // eslint-disable-next-line react-hooks/set-state-in-effect -- transaction state machine; see frontend/docs/eslint-disable-rationale.md §Pattern-1
      setStep('approved')
    }
  }, [approveSuccess, step, refetchAllowance])

  useEffect(() => {
    if ((approveIsError || approveReceiptError) && step === 'approving') {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- transaction state machine; see frontend/docs/eslint-disable-rationale.md §Pattern-1
      setError(approveError ?? new Error('Approve transaction failed'))
      setStep('error')
    }
  }, [approveIsError, approveReceiptError, approveError, step])

  // Advance when deposit/withdraw confirms.
  useEffect(() => {
    if (mutationSuccess && (step === 'depositing' || step === 'withdrawing')) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- transaction state machine; see frontend/docs/eslint-disable-rationale.md §Pattern-1
      setStep('complete')
      onSuccess?.()
    }
  }, [mutationSuccess, step, onSuccess])

  useEffect(() => {
    if ((mutationIsError || mutationReceiptError) && (step === 'depositing' || step === 'withdrawing')) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- transaction state machine; see frontend/docs/eslint-disable-rationale.md §Pattern-1
      setError(mutationError ?? new Error('Transaction failed'))
      setStep('error')
    }
  }, [mutationIsError, mutationReceiptError, mutationError, step])

  function approve(amount: bigint) {
    if (!token || !managerAddress) return
    setError(null)
    setStep('approving')
    writeApprove({
      abi: erc20Abi,
      address: token,
      functionName: 'approve',
      args: [managerAddress, amount],
    })
  }

  function deposit(amount: bigint) {
    if (!managerAddress || !token) return
    setError(null)
    setStep('depositing')
    writeMutation({
      abi: commitmentManagerAbi,
      address: managerAddress,
      functionName: 'deposit',
      args: [token, amount],
    })
  }

  async function depositWithPermit(amount: bigint) {
    if (!managerAddress || !token || !userAddress || !publicClient) return
    setError(null)
    setStep('signing')
    try {
      // 1-hour window; the manager tolerates an already-consumed permit
      // (front-run defense), so a slightly generous deadline is safe.
      const deadline = BigInt(Math.floor(Date.now() / 1000) + 3600)
      const nonce = await publicClient.readContract({
        abi: ERC2612_ABI,
        address: token,
        functionName: 'nonces',
        args: [userAddress],
      })
      const domain = await resolvePermitDomain(publicClient, token, chainId)
      const signature = await signTypedDataAsync(
        buildPermitTypedData({
          domain,
          owner: userAddress,
          spender: managerAddress,
          value: amount,
          nonce,
          deadline,
        }),
      )
      const { r, s, v, yParity } = parseSignature(signature)
      const vByte = v !== undefined ? Number(v) : yParity + 27
      setStep('depositing')
      writeMutation({
        abi: commitmentManagerAbi,
        address: managerAddress,
        functionName: 'depositWithPermit',
        args: [token, amount, deadline, vByte, r, s],
      })
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Permit signing failed'))
      setStep('error')
    }
  }

  function withdraw(amount: bigint) {
    if (!managerAddress || !token) return
    setError(null)
    setStep('withdrawing')
    writeMutation({
      abi: commitmentManagerAbi,
      address: managerAddress,
      functionName: 'withdraw',
      args: [token, amount],
    })
  }

  function reset() {
    resetApprove()
    resetMutation()
    setStep('idle')
    setError(null)
  }

  const txHash =
    step === 'approving'
      ? approveTxHash
      : step === 'depositing' || step === 'withdrawing'
        ? mutationTxHash
        : undefined

  return {
    step,
    walletBalance: walletBalance as bigint | undefined,
    currentAllowance: currentAllowance as bigint | undefined,
    supportsPermit,
    approve,
    deposit,
    depositWithPermit,
    withdraw,
    reset,
    error,
    txHash,
  }
}
