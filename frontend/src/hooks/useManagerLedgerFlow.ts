import { useState } from 'react'
import { type Address, parseSignature } from 'viem'
import { useChainId, usePublicClient, useReadContract, useSignTypedData } from 'wagmi'
import { commitmentManagerAbi } from '../generated'
import { ERC2612_ABI, buildPermitTypedData, resolvePermitDomain } from '../lib/erc2612'
import { useApproveThenWrite } from './useApproveThenWrite'

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
  /** This flow's approve has mined: render it as two steps until it resets. */
  approvedInFlow: boolean
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
  // The permit path signs off-chain before its one write; this holds that
  // phase. Every action clears it, so it never outlives the latest action.
  const [permit, setPermit] = useState<'idle' | 'signing' | Error>('idle')

  const chainId = useChainId()
  const publicClient = usePublicClient()
  const { signTypedDataAsync } = useSignTypedData()

  const flow = useApproveThenWrite({
    token,
    spender: managerAddress,
    owner: userAddress,
    onSuccess: () => onSuccess?.(),
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
    query: { enabled: !!token && !!userAddress && !!managerAddress },
  })
  const supportsPermit = permitProbeError ? false : permitNonce !== undefined ? true : undefined

  function approve(amount: bigint) {
    setPermit('idle')
    flow.approve(amount)
  }

  function deposit(amount: bigint) {
    if (!managerAddress || !token) return
    setPermit('idle')
    flow.write({
      abi: commitmentManagerAbi,
      address: managerAddress,
      functionName: 'deposit',
      args: [token, amount],
    })
  }

  async function depositWithPermit(amount: bigint) {
    if (!managerAddress || !token || !userAddress || !publicClient) return
    flow.reset()
    setPermit('signing')
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
      setPermit('idle')
      flow.write({
        abi: commitmentManagerAbi,
        address: managerAddress,
        functionName: 'depositWithPermit',
        args: [token, amount, deadline, vByte, r, s],
      })
    } catch (err) {
      setPermit(err instanceof Error ? err : new Error('Permit signing failed'))
    }
  }

  function withdraw(amount: bigint) {
    if (!managerAddress || !token) return
    setPermit('idle')
    flow.write({
      abi: commitmentManagerAbi,
      address: managerAddress,
      functionName: 'withdraw',
      args: [token, amount],
    })
  }

  function reset() {
    setPermit('idle')
    flow.reset()
  }

  const step: LedgerFlowStep =
    permit === 'signing'
      ? 'signing'
      : permit instanceof Error
        ? 'error'
        : flow.step === 'writing'
          ? flow.writeVariables?.functionName === 'withdraw'
            ? 'withdrawing'
            : 'depositing'
          : flow.step

  return {
    step,
    walletBalance: flow.balance,
    currentAllowance: flow.allowance,
    approvedInFlow: flow.approvedInFlow,
    supportsPermit,
    approve,
    deposit,
    depositWithPermit,
    withdraw,
    reset,
    error: permit instanceof Error ? permit : flow.error,
  }
}
