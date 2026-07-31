import { useMemo } from 'react'
import { createWalletClient, http, type WalletClient } from 'viem'
import { useDevWallet } from '../contexts/devWallet'

const ANVIL_RPC_URL =
  (import.meta.env.VITE_RPC_URL_ANVIL as string | undefined) ?? 'http://127.0.0.1:8545'

const ANVIL_CHAIN = {
  id: 31337,
  name: 'Anvil',
  nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  rpcUrls: { default: { http: [ANVIL_RPC_URL] } },
} as const

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
      chain: ANVIL_CHAIN,
      transport: http(ANVIL_RPC_URL),
    })
  }, [current])
}
