import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { type Address } from 'viem'
import { useChainId } from 'wagmi'

import { hasIndexer, indexerFetch } from '../config/indexer'

/** Seconds in a 365-day year — the basis for annualizing the premium stream. */
const SECONDS_PER_YEAR = 31_536_000n

/**
 * Indexer-sourced Mutual header (the `GET /mutuals` contract).
 *
 * `liveCapacity` is the loss-adjusted Σ Eᵢ·(1e18−lossSnapshotᵢ)/1e18 in raw
 * numeraire units — i.e. the coverage that actually remains *after* applying
 * every member's accrued markdown. It is the figure a page MUST present as
 * available cover; `totalShares` is the nominal subscribed amount and overstates
 * cover once any loss has accrued.
 */
export interface MutualIndexed {
  mutualId: bigint
  arbiter: Address
  beneficiary: Address
  numeraire: Address
  /** Zero address ⇒ homogeneous mode. */
  valuationAuthority: Address
  challengeWindow: bigint
  deallocationWindow: bigint
  memberCount: number
  /** Nominal Σ creditedValue — overstates cover after any loss. */
  totalShares: bigint
  /** Λ — 1e18-scaled cumulative loss fraction. */
  cumulativeLoss: bigint
  /** Loss-adjusted live coverage in raw numeraire units. */
  liveCapacity: bigint
  /** Streamed premium per second (numeraire units/sec) — the §G stream rate. */
  rewardRate: bigint
  /** Numeraire capacity the premium stream yields against (the APR denominator). */
  activeCover: bigint
  /** Unix second the current premium stream period ends. */
  periodFinish: number
  /** Unstreamed premium reserve (funded − streamed), raw numeraire units. */
  premiumPool: bigint
  /**
   * Annualized premium yield on deployed capacity, in basis points
   * (`rewardRate × secondsPerYear × 1e4 / activeCover`); `undefined` when there
   * is no active cover to yield against. Mirrors {@link useMutualPremium}.
   */
  premiumAprBps: number | undefined
  active: boolean
  terminal: boolean
  /**
   * Underwritten-vault association: the vault whose deposits this pool
   * ambient-covers (premium funded from the vault's own yield via the keyless
   * conduit), or null for an ordinary mutual. Detection key for every
   * "automatically covered" surface.
   */
  coveredVault: Address | null
  /** The keyless VaultCoverConduit funding the premium stream; null unless covered. */
  conduit: Address | null
  /** True ⇒ heterogeneous mode (ERC §H §8): premium priced off a band-valuation adapter. */
  heterogeneous: boolean
  /** Band valuation adapter; null ⇒ homogeneous. */
  bandAdapter: Address | null
  /** Band lower bound on premiumWeight, in basis points (0 for homogeneous). */
  valuationFloorBps: number
  /** Band upper bound on premiumWeight, in basis points (≤1e4; 0 for homogeneous). */
  valuationCeilBps: number
  /** Premium-funding split routed to the junior absorber, in basis points. */
  juniorBps: number
  /** Junior shortfall reserve (funded − drawn), raw numeraire units. */
  juniorPool: bigint
}

/** Wire shape — every bigint arrives as a decimal string. */
interface MutualWire {
  mutualId: string
  arbiter: string
  beneficiary: string
  numeraire: string
  valuationAuthority: string
  challengeWindow: string
  deallocationWindow: string
  memberCount: number
  totalShares: string
  cumulativeLoss: string
  liveCapacity: string
  // §G premium stream — present on every row; defaulted for older indexer builds.
  rewardRate?: string
  activeCover?: string
  periodFinish?: number
  premiumPool?: string
  active: boolean
  terminal: boolean
  // Underwritten-vault association — defaulted for older indexer builds.
  coveredVault?: string | null
  conduit?: string | null
  // Heterogeneous mode (§H §8 / M4) — present on every row; defaulted for older indexer builds.
  heterogeneous?: boolean
  bandAdapter?: string | null
  valuationFloorBps?: number
  valuationCeilBps?: number
  juniorBps?: number
  juniorPool?: string
}

export interface UseMutualsReturn {
  mutuals: MutualIndexed[]
  byId: Map<bigint, MutualIndexed>
  isLoading: boolean
  isError: boolean
  error: Error | null
  refetch: () => void
}

function parseMutual(w: MutualWire): MutualIndexed {
  const rewardRate = BigInt(w.rewardRate ?? '0')
  const activeCover = BigInt(w.activeCover ?? '0')
  // bps = rewardRate × secondsPerYear × 1e4 / activeCover. Multiply before
  // dividing to preserve precision on small per-second rates. Same formula as
  // useMutualPremium so the list and detail page agree.
  const premiumAprBps =
    activeCover > 0n ? Number((rewardRate * SECONDS_PER_YEAR * 10_000n) / activeCover) : undefined
  return {
    mutualId: BigInt(w.mutualId),
    arbiter: w.arbiter as Address,
    beneficiary: w.beneficiary as Address,
    numeraire: w.numeraire as Address,
    valuationAuthority: w.valuationAuthority as Address,
    challengeWindow: BigInt(w.challengeWindow),
    deallocationWindow: BigInt(w.deallocationWindow),
    memberCount: w.memberCount,
    totalShares: BigInt(w.totalShares),
    cumulativeLoss: BigInt(w.cumulativeLoss),
    liveCapacity: BigInt(w.liveCapacity),
    rewardRate,
    activeCover,
    periodFinish: w.periodFinish ?? 0,
    premiumPool: BigInt(w.premiumPool ?? '0'),
    premiumAprBps,
    active: w.active,
    terminal: w.terminal,
    coveredVault: (w.coveredVault ?? null) as Address | null,
    conduit: (w.conduit ?? null) as Address | null,
    heterogeneous: w.heterogeneous ?? w.bandAdapter != null,
    bandAdapter: (w.bandAdapter ?? null) as Address | null,
    valuationFloorBps: w.valuationFloorBps ?? 0,
    valuationCeilBps: w.valuationCeilBps ?? 0,
    juniorBps: w.juniorBps ?? 0,
    juniorPool: BigInt(w.juniorPool ?? '0'),
  }
}

/**
 * useMutuals — the denormalized list of every Mutual from the indexer's
 * `GET /mutuals` endpoint, including the loss-adjusted `liveCapacity` that the
 * on-chain header cannot compute without enumerating members.
 *
 * Tolerates an absent indexer (returns an empty list with `isError === false`
 * when `hasIndexer` is false) so callers can fall back to chain reads and label
 * figures as "nominal" rather than blocking.
 */
export function useMutuals(): UseMutualsReturn {
  const chainId = useChainId()

  const query = useQuery<MutualWire[]>({
    enabled: hasIndexer,
    queryKey: ['mutuals', chainId],
    queryFn: async () => {
      const res = await indexerFetch('/mutuals')
      if (!res.ok) throw new Error(`Indexer error: ${res.status}`)
      return (await res.json()) as MutualWire[]
    },
    refetchInterval: 30_000,
    retry: false,
  })

  const mutuals = useMemo(() => (query.data ?? []).map(parseMutual), [query.data])
  const byId = useMemo(() => {
    const m = new Map<bigint, MutualIndexed>()
    for (const g of mutuals) m.set(g.mutualId, g)
    return m
  }, [mutuals])

  return {
    mutuals,
    byId,
    isLoading: query.isLoading,
    isError: query.isError,
    error: (query.error as Error | null) ?? null,
    refetch: () => {
      void query.refetch()
    },
  }
}
