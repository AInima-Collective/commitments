import { useCallback, useMemo } from 'react'
import { createTestClient, http, publicActions, type TestClient } from 'viem'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { ANVIL_RPC_URL, anvil } from '../config/wagmi'

type AnvilTestClient = TestClient<'anvil'> & ReturnType<typeof publicActions>

let cachedClient: AnvilTestClient | null = null

function getTestClient(): AnvilTestClient {
  if (cachedClient) return cachedClient
  const client = createTestClient({
    mode: 'anvil',
    chain: anvil,
    transport: http(ANVIL_RPC_URL),
  }).extend(publicActions) as AnvilTestClient
  cachedClient = client
  return client
}

const TIME_QUERY_KEY = ['anvil-time'] as const

export interface UseAnvilTimeResult {
  /** Current chain timestamp (Unix seconds). */
  now: bigint | undefined
  /** Latest block number. */
  blockNumber: bigint | undefined
  /** True while either field is initially loading. */
  isLoading: boolean
  /** Re-fetch now/blockNumber. */
  refresh: () => Promise<void>
  /** Advance chain time by `seconds`, then mine 1 block. */
  advance: (seconds: number) => Promise<void>
  /** Mine `blocks` empty blocks (no time change). */
  mine: (blocks: number) => Promise<void>
  /** Set the next block timestamp explicitly, then mine 1 block. */
  warpTo: (unixTimestamp: number) => Promise<void>
  /** Toggle anvil's automine. When `true`, every tx mines its own block. */
  setAutomine: (enabled: boolean) => Promise<void>
}

/**
 * One-shot helper: ensure anvil is auto-mining so tx receipts arrive promptly.
 * Safe to call multiple times.
 */
export async function ensureAutomine(): Promise<void> {
  const client = getTestClient()
  try {
    await client.setAutomine(true)
  } catch {
    // anvil unreachable — caller surfaces a better error
  }
}

/**
 * Anvil-only time controls. Wraps `evm_increaseTime`, `evm_mine`,
 * `evm_setNextBlockTimestamp` via viem's test actions, plus a polled readout
 * of `now` (latest block timestamp) and `blockNumber`.
 *
 * The readout polls the anvil RPC, so a caller that can mount on another
 * chain must pass `enabled = false` there; the admin tools only mount on anvil.
 */
export function useAnvilTime(pollMs = 2000, enabled = true): UseAnvilTimeResult {
  const queryClient = useQueryClient()
  const client = useMemo(() => getTestClient(), [])

  const query = useQuery({
    queryKey: TIME_QUERY_KEY,
    queryFn: async () => {
      const block = await client.getBlock({ blockTag: 'latest' })
      return { now: block.timestamp, blockNumber: block.number ?? 0n }
    },
    enabled,
    refetchInterval: pollMs,
    refetchOnWindowFocus: false,
    staleTime: pollMs,
  })

  const refresh = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: TIME_QUERY_KEY })
  }, [queryClient])

  const advance = useCallback(
    async (seconds: number) => {
      if (seconds <= 0) return
      // `dev-up` sets `anvil_setBlockTimestampInterval=1`, which pins every
      // mined block's timestamp to `prev+1` and silently overrides
      // `evm_increaseTime`. Compute the target timestamp explicitly and warp
      // there instead.
      const block = await client.getBlock({ blockTag: 'latest' })
      const target = block.timestamp + BigInt(seconds)
      await client.setNextBlockTimestamp({ timestamp: target })
      await client.mine({ blocks: 1 })
      await refresh()
    },
    [client, refresh],
  )

  const mine = useCallback(
    async (blocks: number) => {
      if (blocks <= 0) return
      await client.mine({ blocks })
      await refresh()
    },
    [client, refresh],
  )

  const warpTo = useCallback(
    async (unixTimestamp: number) => {
      if (!Number.isFinite(unixTimestamp) || unixTimestamp <= 0) return
      await client.setNextBlockTimestamp({ timestamp: BigInt(unixTimestamp) })
      await client.mine({ blocks: 1 })
      await refresh()
    },
    [client, refresh],
  )

  const setAutomine = useCallback(
    async (enabled: boolean) => {
      await client.setAutomine(enabled)
    },
    [client],
  )

  return {
    now: query.data?.now,
    blockNumber: query.data?.blockNumber,
    isLoading: query.isLoading,
    refresh,
    advance,
    mine,
    warpTo,
    setAutomine,
  }
}

/** Common preset durations exposed for `<TimeControls>`. */
export const TIME_PRESETS = [
  { id: '1d', label: '+ 1 day', seconds: 86_400, hint: 'forfeit challenge / unbonding' },
  { id: '14d', label: '+ 14 days', seconds: 14 * 86_400, hint: 'stale forfeit TTL' },
  { id: '90d', label: '+ 90 days', seconds: 90 * 86_400, hint: 'reclaim abandoned yield' },
] as const
