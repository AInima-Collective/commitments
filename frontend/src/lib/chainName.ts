import { mainnet, sepolia } from 'wagmi/chains'
import { anvil } from '../config/anvil'

const CHAIN_NAMES: Record<number, string> = {
  [mainnet.id]: 'Ethereum',
  [sepolia.id]: 'Sepolia',
  [anvil.id]: 'Anvil',
}

/**
 * Best-effort human-readable chain label. Falls back to "Chain {N}" for
 * unknown chainIds and "Unknown" when the id is undefined. Used for
 * page-level orientation (page header eyebrows, breadcrumbs) — wallet
 * UX wants a richer chain pill, not just a name.
 */
export function chainName(chainId: number | undefined): string {
  if (!chainId) return 'Unknown'
  return CHAIN_NAMES[chainId] ?? `Chain ${chainId}`
}
