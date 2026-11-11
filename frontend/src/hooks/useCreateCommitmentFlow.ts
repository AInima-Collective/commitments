import { useRef } from 'react'
import { type Address, type ContractFunctionArgs, type TransactionReceipt } from 'viem'
import { commitmentManagerAbi } from '../generated'
import { useApproveThenWrite } from './useApproveThenWrite'

export type FullCommitmentParams = ContractFunctionArgs<
  typeof commitmentManagerAbi,
  'nonpayable',
  'createCommitment'
>[0]

export type CreateFlowStep = 'idle' | 'approving' | 'creating' | 'complete' | 'error'

export interface CreateCommitmentFlow {
  /** Current phase of the approve → create state machine. */
  step: CreateFlowStep
  /** ERC-20 balance of the backing token in the user's wallet (funding source). */
  walletBalance: bigint | undefined
  /** Allowance the user has granted the manager to pull the backing token. */
  allowance: bigint | undefined
  /** True once the CREATE tx confirms (never fires for the interim approve). */
  isSuccess: boolean
  /** True while any tx is in flight (wallet prompt or on-chain confirmation). */
  isPending: boolean
  /** True while the in-flight tx waits on the wallet rather than the chain. */
  awaitingWallet: boolean
  error: Error | null
  /** The create receipt, once mined — callers parse the new id from its logs. */
  receipt: TransactionReceipt | undefined
  /**
   * Submit a create. `depositAmount` is the shortfall pulled from the wallet to
   * top up the free balance before encumbering (`0` ⇒ plain `createCommitment`
   * against the existing free balance). When a deposit is needed and the manager
   * lacks allowance, an ERC-20 `approve` fires first, then `createAndFund`.
   */
  submit: (params: FullCommitmentParams, depositAmount: bigint) => void
  reset: () => void
}

interface UseCreateCommitmentFlowParams {
  managerAddress: Address | undefined
  /** Backing token being encumbered (raw ERC-20 or vault share). */
  token: Address | undefined
  userAddress: Address | undefined
  /** Fired once when the create mines, with its receipt. */
  onSuccess?: (receipt: TransactionReceipt) => void
}

/**
 * Drives commitment creation with optional inline funding against the
 * CommitmentManager:
 *   - `depositAmount == 0` → `createCommitment(params)` (free balance covers it)
 *   - `depositAmount > 0`, allowance sufficient → `createAndFund(depositAmount, params)`
 *   - `depositAmount > 0`, allowance short → `approve(manager, depositAmount)`
 *     then `createAndFund(...)`
 *
 * `createAndFund` validates params BEFORE pulling the token (revert-before-pull)
 * and credits the measured balance delta, so `depositAmount` should be the exact
 * shortfall (`amount − free`). Callers gate on `walletBalance` covering it.
 *
 * The manager is the ERC-20 spender for the approve step (it pulls the token on
 * deposit), distinct from the vault-deposit flow where the vault is the spender.
 */
export function useCreateCommitmentFlow({
  managerAddress,
  token,
  userAddress,
  onSuccess,
}: UseCreateCommitmentFlowParams): CreateCommitmentFlow {
  // Params + shortfall stashed so the create can fire after the approve confirms.
  const pendingRef = useRef<{ params: FullCommitmentParams; depositAmount: bigint } | null>(null)

  const flow = useApproveThenWrite({
    token,
    spender: managerAddress,
    owner: userAddress,
    // Approve confirmed → fire the deferred createAndFund.
    onApproved: () => {
      const pending = pendingRef.current
      if (pending) fireCreate(pending.params, pending.depositAmount)
    },
    onSuccess,
  })

  function fireCreate(params: FullCommitmentParams, depositAmount: bigint) {
    if (!managerAddress) return
    if (depositAmount > 0n) {
      flow.write({
        abi: commitmentManagerAbi,
        address: managerAddress,
        functionName: 'createAndFund',
        args: [depositAmount, params],
      })
    } else {
      flow.write({
        abi: commitmentManagerAbi,
        address: managerAddress,
        functionName: 'createCommitment',
        args: [params],
      })
    }
  }

  function submit(params: FullCommitmentParams, depositAmount: bigint) {
    if (!managerAddress || !token) return
    pendingRef.current = { params, depositAmount }

    // No funding needed, or allowance already covers the shortfall → create now.
    if (depositAmount === 0n || (flow.allowance !== undefined && flow.allowance >= depositAmount)) {
      fireCreate(params, depositAmount)
      return
    }

    // Need to approve the shortfall first; the create fires when it confirms.
    flow.approve(depositAmount)
  }

  function reset() {
    pendingRef.current = null
    flow.reset()
  }

  // 'approved' lasts the one render before the deferred create fires.
  const step: CreateFlowStep =
    flow.step === 'approved' ? 'approving' : flow.step === 'writing' ? 'creating' : flow.step

  return {
    step,
    walletBalance: flow.balance,
    allowance: flow.allowance,
    isSuccess: step === 'complete',
    isPending: step === 'approving' || step === 'creating',
    awaitingWallet: flow.awaitingWallet,
    error: flow.error,
    receipt: flow.receipt,
    submit,
    reset,
  }
}
