import { useCallback, useState } from 'react'
import { usePublicClient } from 'wagmi'
import type { Hash, TransactionReceipt } from 'viem'
import { useDevWalletClient } from './useDevWalletClient'
import { useDevWallet } from '../contexts/devWallet'

export type AdminActionStatus = 'idle' | 'pending' | 'success' | 'error'

export interface AdminActionState {
  status: AdminActionStatus
  hash: Hash | undefined
  receipt: TransactionReceipt | undefined
  error: Error | undefined
}

export interface AdminActionResult {
  hash: Hash
  receipt: TransactionReceipt
}

const INITIAL: AdminActionState = {
  status: 'idle',
  hash: undefined,
  receipt: undefined,
  error: undefined,
}

/**
 * Run a `walletClient.writeContract` style action through a small finite
 * state machine: pending → success/error. The caller's `submit` closure
 * receives the dev wallet client, the public client, and the active actor
 * address (for use as `args[i]` where the contract expects `msg.sender` to
 * also appear in calldata).
 */
export function useAdminAction() {
  const walletClient = useDevWalletClient()
  const publicClient = usePublicClient()
  const { current } = useDevWallet()

  const [state, setState] = useState<AdminActionState>(INITIAL)

  const reset = useCallback(() => setState(INITIAL), [])

  const run = useCallback(
    async (
      submit: (ctx: {
        walletClient: typeof walletClient
        publicClient: NonNullable<typeof publicClient>
        actorAddress: typeof current.address
      }) => Promise<Hash>,
    ): Promise<AdminActionResult | null> => {
      if (!publicClient) {
        setState({
          status: 'error',
          hash: undefined,
          receipt: undefined,
          error: new Error('No public client available — is wagmi configured for chain 31337?'),
        })
        return null
      }
      setState({ status: 'pending', hash: undefined, receipt: undefined, error: undefined })
      try {
        const hash = await submit({
          walletClient,
          publicClient,
          actorAddress: current.address,
        })
        setState((s) => ({ ...s, hash }))
        const receipt = await publicClient.waitForTransactionReceipt({ hash })
        if (receipt.status === 'reverted') {
          setState({ status: 'error', hash, receipt, error: new Error('Transaction reverted') })
          return null
        }
        setState({ status: 'success', hash, receipt, error: undefined })
        return { hash, receipt }
      } catch (e) {
        setState({
          status: 'error',
          hash: undefined,
          receipt: undefined,
          error: e instanceof Error ? e : new Error(String(e)),
        })
        return null
      }
    },
    [walletClient, publicClient, current],
  )

  return { state, run, reset }
}
