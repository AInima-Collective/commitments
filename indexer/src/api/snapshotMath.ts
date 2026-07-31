import type { Hex } from 'viem'

import type { commitmentsVaultAbi } from '../abis'

/**
 * Minimal shape of the ponder/viem publicClient the snapshot job needs.
 *
 * `getBlock` is declared here only so we can read the on-chain clock; the real
 * viem publicClient already implements it. We type just the `timestamp` field
 * we consume rather than viem's full `Block` union.
 */
export interface PublicClientLike {
  readContract(args: {
    address: Hex
    abi: typeof commitmentsVaultAbi
    functionName: 'totalAssets' | 'totalSupply'
  }): Promise<bigint>
  getBlock(): Promise<{ timestamp: bigint }>
}

/**
 * Resolve the "now" anchor for a snapshot. Precedence:
 *
 *   1. `nowSeconds` — explicit override (tests, manual pin).
 *   2. on-chain block timestamp — the DEFAULT. The share price is read from the
 *      same chain, so elapsed time and price movement MUST share this clock.
 *      Anchoring "now" to wall-clock `Date.now()` while the price moves on chain
 *      time means an anvil `evm_increaseTime` warp bumps the NAV/price but not
 *      the elapsed window, so APY comes out ~0 (or absurd). Reading block time
 *      puts both on the chain clock, so time-warps produce real APY.
 *   3. wall-clock `Date.now()` — silent fallback when `getBlock` throws, so a
 *      live chain with a flaky RPC still snapshots. The tiny skew vs. block time
 *      on a real chain is acceptable for a UI KPI.
 */
export async function resolveNowSeconds(opts: {
  nowSeconds?: bigint
  publicClient: Pick<PublicClientLike, 'getBlock'>
}): Promise<bigint> {
  if (opts.nowSeconds !== undefined) return opts.nowSeconds
  try {
    const block = await opts.publicClient.getBlock()
    return block.timestamp
  } catch {
    // Silent fallback: a live chain with a flaky RPC still snapshots on wall time.
    return BigInt(Math.floor(Date.now() / 1000))
  }
}

/**
 * Compute APY in basis points by comparing two share prices over a window.
 *
 * Formula: ((curPrice / pastPrice)^(year/elapsed) - 1) * 10_000
 *
 * Returns null when there isn't enough history (we require at least half the
 * window) or when either share price is non-positive. Uses Number for the
 * exponent — 18-decimal share prices fit comfortably in double precision
 * after the ratio cancels the scaling. Acceptable for a UI KPI.
 */
export function annualizedBps(
  curPrice: bigint,
  pastPrice: bigint,
  elapsedSec: bigint,
  windowSec: bigint,
): number | null {
  if (pastPrice <= 0n || curPrice <= 0n) return null
  if (elapsedSec * 2n < windowSec) return null
  const ratio = Number(curPrice) / Number(pastPrice)
  if (!Number.isFinite(ratio) || ratio <= 0) return null
  const elapsedYears = Number(elapsedSec) / (365 * 24 * 60 * 60)
  if (elapsedYears <= 0) return null
  const annualized = Math.pow(ratio, 1 / elapsedYears) - 1
  if (!Number.isFinite(annualized)) return null
  return Math.round(annualized * 10_000)
}
