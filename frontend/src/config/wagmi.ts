import { createConfig, http } from 'wagmi'
import { mainnet, sepolia, type Chain } from 'wagmi/chains'
import { injected, walletConnect } from 'wagmi/connectors'
import { ANVIL_RPC_URL, anvil } from './anvil'

const walletConnectProjectId = import.meta.env.VITE_WALLETCONNECT_PROJECT_ID

export const EXPECTED_CHAIN_ID = Number(import.meta.env.VITE_EXPECTED_CHAIN_ID || mainnet.id)

const ALL_CHAINS = [mainnet, sepolia, anvil] as const

// wagmi reads default to `chains[0]` when no wallet is connected. Put the
// expected chain first so disconnected / view-only reads (TVL, token
// decimals/symbol, claim state) target the right network instead of
// falling back to mainnet's public RPC. Falls back to the original order
// when the expected chain isn't configured here.
const expectedChain = ALL_CHAINS.find((c) => c.id === EXPECTED_CHAIN_ID)
const chains = (
  expectedChain
    ? [expectedChain, ...ALL_CHAINS.filter((c) => c.id !== expectedChain.id)]
    : ALL_CHAINS
) as readonly [Chain, ...Chain[]]

export const wagmiConfig = createConfig({
  chains,
  connectors: [
    injected(),
    ...(walletConnectProjectId
      ? [walletConnect({
          projectId: walletConnectProjectId,
          metadata: {
            name: 'Commitments Protocol',
            description: 'Composable on-chain commitments',
            url: import.meta.env.VITE_APP_URL ?? 'http://localhost:5173',
            icons: [],
          },
        })]
      : []),
  ],
  transports: {
    [mainnet.id]: http(import.meta.env.VITE_RPC_URL_MAINNET || undefined),
    [sepolia.id]: http(import.meta.env.VITE_RPC_URL_SEPOLIA || undefined),
    // Anvil has no Multicall3, so wagmi's multicall batching falls back to one
    // eth_call per read. JSON-RPC batching sends those as one HTTP request.
    [anvil.id]: http(ANVIL_RPC_URL, { batch: true }),
  },
})
