import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { type Address } from 'viem'
import { useChainId } from 'wagmi'

import { hasIndexer, indexerJson } from '../config/indexer'
import { POLL } from './polling'

/**
 * A single value-flow event affecting an account, from the indexer's
 * `GET /account/:address/activity` endpoint. Two kinds today:
 *   - `mutual-loss`   — a loss was applied to a mutual the account is exposed to;
 *   - `premium-yield` — a premium payout the account claimed.
 * Both carry the ERC-20 `token` (for decimals/symbol) and a raw `amount`.
 */
export interface AccountActivityEvent {
  kind: 'mutual-loss' | 'premium-yield'
  /** Stable indexer row key — used as the activity-feed React key. */
  id: string
  /** Unix seconds the event was recorded. */
  timestamp: number
  txHash: `0x${string}` | null
  mutualId: string | null
  /** ERC-20 backing token — drives the displayed amount's decimals. Undefined
   *  when the indexer couldn't attribute one. */
  token: Address | undefined
  /** Raw token units. */
  amount: bigint
}

/** Wire shape — bigints arrive as decimal strings; nullable fields stay null. */
interface ActivityWire {
  kind: 'mutual-loss' | 'premium-yield'
  id: string
  timestamp: string
  txHash: string | null
  mutualId: string | null
  token: string | null
  amount: string
}

interface ActivityFeedWire {
  events?: ActivityWire[]
}

export interface UseAccountActivityReturn {
  events: AccountActivityEvent[]
  isLoading: boolean
  /** True when no indexer is configured — the feed can't be sourced from chain. */
  unavailable: boolean
  refetch: () => void
}

function parseEvent(w: ActivityWire): AccountActivityEvent {
  return {
    kind: w.kind,
    id: w.id,
    timestamp: Number(w.timestamp),
    txHash: (w.txHash ?? null) as `0x${string}` | null,
    mutualId: w.mutualId ?? null,
    token: (w.token ?? undefined) as Address | undefined,
    amount: BigInt(w.amount),
  }
}

/**
 * useAccountActivity — loss + premium-yield events for one account, from
 * `GET /account/:address/activity`. Complements the on-chain commitment/vault
 * activity the dashboard already builds; this surfaces value flows that only
 * the indexer can reconstruct, so it tolerates an absent indexer via
 * `unavailable`. Polls at 20s like the other indexer-only feeds.
 */
export function useAccountActivity(address: Address | undefined): UseAccountActivityReturn {
  const chainId = useChainId()
  const enabled = hasIndexer && !!address

  const query = useQuery<ActivityFeedWire>({
    enabled,
    queryKey: ['account-activity', chainId, address?.toLowerCase()],
    queryFn: async () => {
      return indexerJson<ActivityFeedWire>(`/account/${address!.toLowerCase()}/activity?limit=100`)
    },
    refetchInterval: POLL.fast,
    retry: false,
  })

  const events = useMemo(() => (query.data?.events ?? []).map(parseEvent), [query.data])

  return {
    events,
    isLoading: query.isLoading,
    unavailable: !hasIndexer,
    refetch: () => {
      void query.refetch()
    },
  }
}
