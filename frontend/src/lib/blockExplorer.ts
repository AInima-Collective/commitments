/**
 * Block-explorer URL helper for Phase 21 ServicePolicyCard / DelegateToOperatorForm
 * / OperatorCompareDrawer arbiter + operator-address links.
 *
 * Chain IDs match the wagmi config in `frontend/src/config/wagmi.ts`:
 *   - mainnet  -> 1          -> https://etherscan.io
 *   - sepolia  -> 11155111   -> https://sepolia.etherscan.io
 *   - anvil    -> 31337      -> '' (no public explorer; caller falls back to plain text)
 *
 * Returning `''` (empty string) is the documented "no explorer" sentinel — it
 * lets callers do a single truthiness check (`blockExplorer && <a>...</a>`)
 * to suppress the link when the chain has no block explorer.
 *
 * Pure module: no React, no wagmi, no side effects.
 */
export function getBlockExplorer(chainId: number): string {
  switch (chainId) {
    case 1:
      return 'https://etherscan.io'
    case 11155111:
      return 'https://sepolia.etherscan.io'
    case 31337:
      return ''
    default:
      return ''
  }
}
