import { useCallback, useState } from 'react'
import { type Address, erc20Abi, parseUnits } from 'viem'
import { useChainId, usePublicClient } from 'wagmi'
import { useQueryClient } from '@tanstack/react-query'

import { commitmentsVaultAbi } from '../generated'
import { hasIndexer, indexerFetch } from '../config/indexer'
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

interface SnapshotWireData {
  timestamp: string
  sharePrice: string
  apy7d: number | null
}

interface SnapshotWireResult {
  status: 'created' | 'exists' | 'error'
  message: string
  timestamp: string
  data?: SnapshotWireData
}

/** A parsed snapshot POST response. */
interface SnapshotResult {
  status: 'created' | 'exists' | 'error'
  timestamp: number
  sharePrice: bigint | null
  apy7d: number | null
}

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

async function postSnapshot(vault: Address): Promise<SnapshotResult> {
  const res = await indexerFetch(`/vaults/${vault.toLowerCase()}/periodic/snapshot`, {
    method: 'POST',
  })
  if (!res.ok) {
    throw new Error(`snapshot failed: indexer returned ${res.status}`)
  }
  const wire = (await res.json()) as SnapshotWireResult
  return {
    status: wire.status,
    timestamp: Number(wire.data?.timestamp ?? wire.timestamp),
    sharePrice: wire.data ? BigInt(wire.data.sharePrice) : null,
    apy7d: wire.data?.apy7d ?? null,
  }
}

/**
 * End-to-end "simulate yield → APY" orchestration for a plain (strategy-less)
 * vault on anvil. Closes the loop with REAL backing rather than a mock strategy:
 *
 *   1. POST a baseline periodic snapshot (captures the current chain-time price).
 *   2. `vault.donate(amount)` — raises NAV/share for real; mints the MockERC20
 *      underlying if the actor is short, then approves + donates. `donate` works
 *      even when the vault has no yield strategy (idle), so this is the canonical
 *      NAV source now that plain vaults ship strategy-less.
 *   3. Advance anvil chain time by ~4 days (above the apy7d guard floor, below
 *      the 7-day window ceiling) and mine, so `block.timestamp` moves forward.
 *   4. POST a second snapshot (now at chain-time +4d with the higher price) →
 *      apy7d computes a real positive delta against the baseline.
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

        // step 1 — baseline snapshot at the current chain-time price.
        const baseline = await postSnapshot(vault)

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

        // step 4 — snapshot at chain-time +4d with the raised price.
        setStep('snapshot')
        const final = await postSnapshot(vault)

        // step 5 — refetch the periodic history so the chart reflects the delta.
        await queryClient.invalidateQueries({ queryKey: ['vault-periodic-history'] })

        const result: SimulateYieldResult = {
          vault,
          baselineTimestamp: baseline.timestamp || null,
          finalTimestamp: final.timestamp || null,
          sharePriceBefore: baseline.sharePrice,
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
