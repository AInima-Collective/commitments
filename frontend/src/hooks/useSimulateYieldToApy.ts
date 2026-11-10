import { useCallback, useState } from 'react'
import { type Address, erc20Abi, parseUnits } from 'viem'
import { useChainId, usePublicClient } from 'wagmi'
import { useQueryClient } from '@tanstack/react-query'

import { commitmentsVaultAbi } from '../generated'
import { hasIndexer, indexerJson } from '../config/indexer'
import { useAnvilTime } from './useAnvilTime'
import { useDevWalletClient } from './useDevWalletClient'
import { MOCK_ERC20_MINT_ABI } from '../lib/mockErc20Abi'

const ANVIL_CHAIN_ID = 31337

/**
 * Chain-time advance between the two snapshots: 4 days. Chosen to sit ABOVE the
 * indexer's ~3.5-day apy7d guard floor (it emits `null` until at least half the
 * 7-day window has elapsed) and BELOW the 7-day window ceiling, so the baseline
 * snapshot is still the oldest reference inside the trailing window and apy7d
 * computes a real positive delta off the donate-raised share price.
 */
const SIMULATE_WARP_SECONDS = 4 * 86_400

/** One leg of the orchestration, surfaced for progress UI. */
export type SimulateYieldStep = 'idle' | 'baseline' | 'donating' | 'warping' | 'snapshot' | 'done'

interface LatestSnapshotWire {
  rows: { timestamp: string; sharePrice: string; apy7d: number | null }[]
}

/** The indexer's newest snapshot for the vault. */
interface SnapshotResult {
  timestamp: number
  sharePrice: bigint
  apy7d: number | null
}

/** The indexer writes a snapshot every 15 blocks (~30s) on anvil; allow for indexing lag. */
const SNAPSHOT_WAIT_MS = 120_000
const SNAPSHOT_POLL_MS = 2_000

export interface SimulateYieldResult {
  vault: Address
  /** Chain-time of the baseline snapshot (Unix seconds). */
  baselineTimestamp: number | null
  /** Chain-time of the post-warp snapshot (Unix seconds). */
  finalTimestamp: number | null
  /** Share price before the donate (18-dec fixed point). */
  sharePriceBefore: bigint | null
  /** Share price after the donate + warp. */
  sharePriceAfter: bigint | null
  /** apy7d (bps) reported by the post-warp snapshot; `null` until computable. */
  apy7dBps: number | null
}

export interface UseSimulateYieldToApyParams {
  vault: Address
  /** Human-readable donate amount (e.g. "100"). */
  amount: string
  /** Decimals of the vault's underlying asset. */
  decimals: number
}

async function latestSnapshot(vault: Address): Promise<SnapshotResult | null> {
  const wire = await indexerJson<LatestSnapshotWire>(`/vaults/${vault.toLowerCase()}/periodic?latest=1`)
  const row = wire.rows[0]
  return row ? { timestamp: Number(row.timestamp), sharePrice: BigInt(row.sharePrice), apy7d: row.apy7d } : null
}

/** Poll until the indexer has a snapshot taken at or after `chainTime`. */
async function waitForSnapshot(vault: Address, chainTime: number): Promise<SnapshotResult> {
  const deadline = Date.now() + SNAPSHOT_WAIT_MS
  for (;;) {
    const snapshot = await latestSnapshot(vault)
    if (snapshot && snapshot.timestamp >= chainTime) return snapshot
    if (Date.now() > deadline) {
      throw new Error('The indexer has not written a post-warp snapshot yet. Is it running and synced?')
    }
    await new Promise((resolve) => setTimeout(resolve, SNAPSHOT_POLL_MS))
  }
}

/**
 * End-to-end "simulate yield → APY" orchestration for a plain (strategy-less)
 * vault on anvil. Closes the loop with REAL backing rather than a mock strategy:
 *
 *   1. Read the indexer's newest snapshot as the baseline (the pre-donate price).
 *   2. `vault.donate(amount)` — raises NAV/share for real; mints the MockERC20
 *      underlying if the actor is short, then approves + donates. `donate` works
 *      even when the vault has no yield strategy (idle), so this is the canonical
 *      NAV source now that plain vaults ship strategy-less.
 *   3. Advance anvil chain time by ~4 days (above the apy7d guard floor, below
 *      the 7-day window ceiling) and mine, so `block.timestamp` moves forward.
 *   4. Wait for the indexer's next `VaultSnapshot` tick (every 15 blocks on
 *      anvil), now at chain-time +4d with the higher price → apy7d computes a
 *      real positive delta against the oldest snapshot in its window.
 *   5. Invalidate the `vault-periodic-history` query so the chart refetches.
 *
 * Anvil-only: `run` throws unless the connected chain is 31337. Callers should
 * still gate the surface on `chainId === 31337` (Admin already is).
 */
export function useSimulateYieldToApy(): {
  run: (params: UseSimulateYieldToApyParams) => Promise<SimulateYieldResult>
  isPending: boolean
  step: SimulateYieldStep
  error: Error | null
  lastResult: SimulateYieldResult | null
} {
  const chainId = useChainId()
  const walletClient = useDevWalletClient()
  const publicClient = usePublicClient()
  const time = useAnvilTime()
  const queryClient = useQueryClient()

  const [isPending, setIsPending] = useState(false)
  const [step, setStep] = useState<SimulateYieldStep>('idle')
  const [error, setError] = useState<Error | null>(null)
  const [lastResult, setLastResult] = useState<SimulateYieldResult | null>(null)

  const run = useCallback(
    async ({ vault, amount, decimals }: UseSimulateYieldToApyParams): Promise<SimulateYieldResult> => {
      setError(null)
      setIsPending(true)
      setStep('baseline')
      try {
        if (chainId !== ANVIL_CHAIN_ID) {
          throw new Error('Simulate yield is anvil-only (chain 31337).')
        }
        if (!hasIndexer) {
          throw new Error('Indexer not configured — snapshots require VITE_INDEXER_URL.')
        }
        if (!publicClient) {
          throw new Error('No public client — is wagmi configured for chain 31337?')
        }
        const account = walletClient.account
        if (!account) {
          throw new Error('No dev wallet account selected.')
        }
        const value = parseUnits(amount, decimals)
        if (value <= 0n) {
          throw new Error('Donate amount must be greater than zero.')
        }

        // step 1 — the indexer's newest snapshot, before the donate.
        const baseline = await latestSnapshot(vault)

        // step 2 — donate real backing (mint-if-short → approve → donate),
        // mirroring YieldTab's DonateNavPanel.
        setStep('donating')
        const asset = (await publicClient.readContract({
          address: vault,
          abi: commitmentsVaultAbi,
          functionName: 'asset',
        })) as Address

        const balance = (await publicClient.readContract({
          address: asset,
          abi: erc20Abi,
          functionName: 'balanceOf',
          args: [account.address],
        })) as bigint
        if (balance < value) {
          const mintHash = await walletClient.writeContract({
            address: asset,
            abi: MOCK_ERC20_MINT_ABI,
            functionName: 'mint',
            args: [account.address, value - balance],
            chain: walletClient.chain,
            account,
          })
          await publicClient.waitForTransactionReceipt({ hash: mintHash })
        }

        const allowance = (await publicClient.readContract({
          address: asset,
          abi: erc20Abi,
          functionName: 'allowance',
          args: [account.address, vault],
        })) as bigint
        if (allowance < value) {
          const approveHash = await walletClient.writeContract({
            address: asset,
            abi: erc20Abi,
            functionName: 'approve',
            args: [vault, value],
            chain: walletClient.chain,
            account,
          })
          await publicClient.waitForTransactionReceipt({ hash: approveHash })
        }

        const donateHash = await walletClient.writeContract({
          address: vault,
          abi: commitmentsVaultAbi,
          functionName: 'donate',
          args: [value],
          chain: walletClient.chain,
          account,
        })
        await publicClient.waitForTransactionReceipt({ hash: donateHash })

        // step 3 — advance chain time ~4 days (advance() warps + mines a block,
        // so the next snapshot reads a higher block.timestamp).
        setStep('warping')
        await time.advance(SIMULATE_WARP_SECONDS)

        // step 4 — wait for the indexer's first snapshot at chain-time +4d.
        setStep('snapshot')
        const warped = await publicClient.getBlock({ blockTag: 'latest' })
        const final = await waitForSnapshot(vault, Number(warped.timestamp))

        // step 5 — refetch the periodic history so the chart reflects the delta.
        await queryClient.invalidateQueries({ queryKey: ['vault-periodic-history'] })

        const result: SimulateYieldResult = {
          vault,
          baselineTimestamp: baseline?.timestamp ?? null,
          finalTimestamp: final.timestamp,
          sharePriceBefore: baseline?.sharePrice ?? null,
          sharePriceAfter: final.sharePrice,
          apy7dBps: final.apy7d,
        }
        setLastResult(result)
        setStep('done')
        return result
      } catch (e) {
        const err = e instanceof Error ? e : new Error(String(e))
        setError(err)
        setStep('idle')
        throw err
      } finally {
        setIsPending(false)
      }
    },
    [chainId, walletClient, publicClient, time, queryClient],
  )

  return { run, isPending, step, error, lastResult }
}
