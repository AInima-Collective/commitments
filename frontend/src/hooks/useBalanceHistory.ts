import { useQuery } from '@tanstack/react-query'
import { type Address } from 'viem'

import { hasIndexer, indexerJson } from '../config/indexer'
import { POLL } from './polling'

/** One folded balance point. Both balances are cumulative raw token units. */
export interface BalancePoint {
  /** Unix seconds. */
  t: number
  free: bigint
  encumbered: bigint
  /** Movement that produced this point — see the indexer's LedgerFlowKind. */
  kind: string
  commitmentId: bigint | null
  txHash: `0x${string}`
}

export interface TokenBalanceHistory {
  token: Address
  /**
   * Fold result over every row the indexer returned. Compare against a live
   * on-chain balance to size the anchoring correction — see the caveats in
   * {@link useBalanceHistory}.
   */
  latest: { free: bigint; encumbered: bigint }
  /** Chronological, oldest first. */
  points: BalancePoint[]
}

export interface BalanceHistory {
  address: Address
  days: number
  /** True when the account has more ledger movements than the endpoint returns. */
  truncated: boolean
  tokens: TokenBalanceHistory[]
}

interface PointWire {
  t: string
  free: string
  encumbered: string
  kind: string
  commitmentId: string | null
  txHash: string
}

interface HistoryWire {
  address: string
  days: number
  truncated: boolean
  tokens: Array<{
    token: string
    latest: { free: string; encumbered: string }
    points: PointWire[]
  }>
}

interface UseBalanceHistoryParams {
  address: Address | undefined
  /** Trailing window in days. Default 30, max 365. */
  days?: number
}

/**
 * Per-token free/encumbered balance history for one account, folded from the
 * indexer's `ledgerFlow` log.
 *
 * TWO CAVEATS, both structural rather than incidental:
 *
 *   1. **The free series is a shape, not an authority.** A strategy paying yield
 *      into a free balance (`MovementKind.FromEscrowToFree`) emits exactly the
 *      same `DistributionPaid` event as one paying out of custody
 *      (`FromEscrowToExternal`), so the indexer cannot attribute it and does not
 *      fold it. Consumers must anchor the series to a live `freeBalance` read —
 *      `PortfolioChart` does, by adding `live - latest` to every point.
 *   2. **The encumbered series is exact.** Every path that moves encumbered
 *      emits an attributable event.
 *
 * Polls every 60s. Balance history only changes when the account transacts, and
 * the pages that show it already refetch on user action.
 */
export function useBalanceHistory({ address, days = 30 }: UseBalanceHistoryParams): {
  data: BalanceHistory | undefined
  isLoading: boolean
  error: unknown
} {
  const enabled = hasIndexer && Boolean(address)
  const query = useQuery<BalanceHistory>({
    enabled,
    queryKey: ['balance-history', address, days],
    queryFn: async () => {
      if (!address) throw new Error('address required')
      const wire = await indexerJson<HistoryWire>(
        `/account/${address.toLowerCase()}/balance-history?days=${days}`,
      )
      return {
        address: wire.address as Address,
        days: wire.days,
        truncated: wire.truncated,
        tokens: wire.tokens.map((t) => ({
          token: t.token as Address,
          latest: { free: BigInt(t.latest.free), encumbered: BigInt(t.latest.encumbered) },
          points: t.points.map((p) => ({
            t: Number(p.t),
            free: BigInt(p.free),
            encumbered: BigInt(p.encumbered),
            kind: p.kind,
            commitmentId: p.commitmentId === null ? null : BigInt(p.commitmentId),
            txHash: p.txHash as `0x${string}`,
          })),
        })),
      }
    },
    refetchInterval: POLL.idle,
  })
  return { data: query.data, isLoading: query.isLoading, error: query.error }
}
