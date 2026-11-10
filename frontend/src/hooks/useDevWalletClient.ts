import { useMemo } from 'react'
import { createWalletClient, http, type WalletClient } from 'viem'
import { useDevWallet } from '../contexts/devWallet'
import { ANVIL_RPC_URL, anvil } from '../config/wagmi'

/**
 * Returns a viem walletClient bound to the actor currently selected in
 * `<DevWalletProvider>`. Admin-page write panels call
 * `client.writeContract({ address, abi, functionName, args })` directly —
 * no MetaMask popup, no wagmi connector.
 *
 * Anvil-only. Throws if used outside the dev wallet context.
 */
export function useDevWalletClient(): WalletClient {
  const { current } = useDevWallet()

  return useMemo(() => {
    return createWalletClient({
      account: current.account,
      chain: anvil,
      transport: http(ANVIL_RPC_URL),
    })
  }, [current])
}
