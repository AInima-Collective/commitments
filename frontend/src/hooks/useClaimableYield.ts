import { useEffect, useRef, useState } from 'react'
import { type Address } from 'viem'
import { useReadContracts } from 'wagmi'
import { commitmentManagerAbi } from '../generated'
import { hasIndexer, indexerFetch } from '../config/indexer'
import {
  buildClaimableEntries,
  type ClaimableBindingRow,
  type ClaimableYieldEntry,
} from '../lib/claimableYield'

export type { ClaimableYieldEntry }

interface UseClaimableYieldParams {
  managerAddress: Address | undefined
  viewAddress: Address | undefined
}

interface UseClaimableYieldReturn {
  entries: ClaimableYieldEntry[]
  isLoading: boolean
  error: Error | null
  indexerOnline: boolean
  refetch: () => void
}

/** Raw binding shape from GET /account/:address/claimable-yield. */
interface RawBinding {
  commitmentId: string
  strategy: string
  commitment: { committer: string; token: string; vault?: string | null }
}

/**
 * useClaimableYield(viewAddress) — claim-panel data layer for the dashboard.
 *
 * v2: yield is paid per-(commitment, strategy); there is no aggregate column.
 * This composes two reads:
 *   1. the indexer's `/account/:address/claimable-yield` endpoint, which lists
 *      the strategy bindings on active commitments where the address is the
 *      counterparty (the potential recipient), plus the parent commitment;
 *   2. a live `manager.pending(commitmentId, strategy, 0x)` multicall over those
 *      bindings to get the current claimable amount per (commitment, strategy).
 *
 * Returns one entry per (commitment, strategy) with a positive pending amount.
 * Without an indexer it returns empty (scanning every commitment on chain isn't
 * worth it for a dashboard convenience panel).
 */
export function useClaimableYield({
  managerAddress,
  viewAddress,
}: UseClaimableYieldParams): UseClaimableYieldReturn {
  const [rows, setRows] = useState<ClaimableBindingRow[]>([])
  const [bindingsLoading, setBindingsLoading] = useState(hasIndexer)
  const [error, setError] = useState<Error | null>(null)
  const [tick, setTick] = useState(0)
  const requestIdRef = useRef(0)

  useEffect(() => {
    if (!hasIndexer || !viewAddress) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- external subscription reset on indexer/address change
      setRows([])
      setBindingsLoading(false)
      return
    }
    const reqId = ++requestIdRef.current
    setBindingsLoading(true)
    setError(null)
    indexerFetch(`/account/${viewAddress}/claimable-yield`)
      .then((res) => res.json() as Promise<{ bindings: RawBinding[] }>)
      .then((data) => {
        if (reqId !== requestIdRef.current) return
        const next: ClaimableBindingRow[] = (data.bindings ?? []).map((b) => ({
          commitmentId: b.commitmentId,
          strategy: b.strategy,
          committer: b.commitment.committer,
          token: b.commitment.token,
          vault: b.commitment.vault ?? null,
        }))
        setRows(next)
        setBindingsLoading(false)
      })
      .catch((e: unknown) => {
        if (reqId !== requestIdRef.current) return
        setRows([])
        setError(e instanceof Error ? e : new Error('Failed to load claimable yield'))
        setBindingsLoading(false)
      })
  }, [viewAddress, tick])

  const {
    data: pendingData,
    isLoading: pendingLoading,
    refetch: refetchPending,
  } = useReadContracts({
    contracts: rows.map((r) => ({
      abi: commitmentManagerAbi,
      address: managerAddress,
      functionName: 'pending' as const,
      args: [BigInt(r.commitmentId), r.strategy as Address, '0x'] as const,
    })),
    query: { enabled: !!managerAddress && rows.length > 0, refetchInterval: 15_000 },
  })

  const pendings = rows.map((_, i) => pendingData?.[i]?.result as bigint | undefined)
  const entries = buildClaimableEntries(rows, pendings)

  return {
    entries,
    isLoading: bindingsLoading || pendingLoading,
    error,
    indexerOnline: hasIndexer,
    refetch: () => {
      setTick((t) => t + 1)
      void refetchPending()
    },
  }
}
