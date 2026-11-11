import type { Chain } from 'viem'

export const ANVIL_RPC_URL: string = import.meta.env.VITE_RPC_URL_ANVIL || 'http://127.0.0.1:8545'

/**
 * The local dev chain. The one declaration: the wagmi config, the dev wallet
 * and the anvil test client all use it. It lives apart from `config/wagmi.ts`
 * so importing it does not build the wagmi config as a side effect.
 */
export const anvil = {
  id: 31337,
  name: 'Anvil',
  nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  rpcUrls: { default: { http: [ANVIL_RPC_URL] } },
} as const satisfies Chain
