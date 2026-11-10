import { type Address } from 'viem'

import {
  useReadCommitmentManagerGetMutualPremiumState,
} from '../generated'
import { useNowSeconds } from './useNow'
import { POLL } from './polling'

/** Seconds in a 365-day year — the basis for annualizing the premium stream. */
const SECONDS_PER_YEAR = 31_536_000n

/**
 * Live §G premium-stream state for a Mutual — the typed
 * `getMutualPremiumState` 9-tuple.
 *
 * This is the underwriters' *yield* surface: a mutual sells cover, the premium
 * paid funds a reward stream (`rewardRate` numeraire/sec) shared pro-rata by
 * member shares until `periodFinish`. `premiumPool` is the unstreamed reserve.
 */
export interface MutualPremiumStream {
  /** Pi — accumulated premium-per-share, 1e27-scaled. */
  premiumPerShareStored: bigint
  /** Numeraire capacity the stream yields against (the APR denominator). */
  activeCover: bigint
  /** Member units already settled to the beneficiary. */
  settledTotal: bigint
  /** Streamed numeraire per second (the stream rate). */
  rewardRate: bigint
  /** Last time the per-share accumulator was updated. */
  lastUpdate: bigint
  /** Unix second the current stream period ends. */
  periodFinish: bigint
  /** Sub-wei streaming remainder carried to avoid rounding drift. */
  premiumRemainder: bigint
  /** Lifetime premium banked to members (claimed + claimable). */
  bankedTotal: bigint
  /** Unstreamed premium reserve (funded − streamed). */
  premiumPool: bigint
}

export interface UseMutualPremiumReturn {
  stream: MutualPremiumStream | undefined
  /**
   * Annualized premium yield on deployed capacity, in basis points:
   * `rewardRate × secondsPerYear / activeCover`. `undefined` when there is no
   * active cover to yield against.
   */
  premiumAprBps: number | undefined
  /** True while the reward stream is live (rate > 0 and period not elapsed). */
  isStreaming: boolean
  /** Seconds until the stream period ends (0 once elapsed). */
  secondsRemaining: number
  isLoading: boolean
  refetch: () => void
}

interface UseMutualPremiumParams {
  managerAddress: Address | undefined
  mutualId: bigint | undefined
  enabled?: boolean
}

/**
 * useMutualPremium — reads a Mutual's live premium-stream state directly
 * on-chain (`getMutualPremiumState`) and derives the
 * annualized premium APR underwriters earn on deployed capacity.
 *
 * Self-contained: no indexer dependency, so the mutual page surfaces premium
 * yield even on a fresh chain. The read refetches every 15s to keep the rate and
 * countdown fresh.
 */
export function useMutualPremium({
  managerAddress,
  mutualId,
  enabled,
}: UseMutualPremiumParams): UseMutualPremiumReturn {
  const queryEnabled = !!managerAddress && mutualId !== undefined && enabled !== false
  // useNowSeconds returns a bigint; the countdown math below is in plain
  // numbers, so coerce once here to avoid mixing BigInt and Number.
  const now = Number(useNowSeconds())

  const {
    data: stateRaw,
    isLoading: stateLoading,
    refetch: refetchState,
  } = useReadCommitmentManagerGetMutualPremiumState({
    address: managerAddress,
    args: mutualId !== undefined ? [mutualId] : undefined,
    query: { enabled: queryEnabled, refetchInterval: POLL.fast },
  })

  // getMutualPremiumState returns a positional 9-tuple (named uint256 outputs,
  // not a struct) — keep the index order in lockstep with the ABI.
  const stream: MutualPremiumStream | undefined = stateRaw
    ? {
        premiumPerShareStored: stateRaw[0],
        activeCover: stateRaw[1],
        settledTotal: stateRaw[2],
        rewardRate: stateRaw[3],
        lastUpdate: stateRaw[4],
        periodFinish: stateRaw[5],
        premiumRemainder: stateRaw[6],
        bankedTotal: stateRaw[7],
        premiumPool: stateRaw[8],
      }
    : undefined

  let premiumAprBps: number | undefined
  if (stream && stream.activeCover > 0n) {
    // bps = rewardRate × secondsPerYear × 1e4 / activeCover. Multiply before
    // dividing to preserve precision on small per-second rates.
    premiumAprBps = Number(
      (stream.rewardRate * SECONDS_PER_YEAR * 10_000n) / stream.activeCover,
    )
  }

  const periodFinish = stream ? Number(stream.periodFinish) : 0
  const secondsRemaining = Math.max(0, periodFinish - now)
  const isStreaming = !!stream && stream.rewardRate > 0n && secondsRemaining > 0

  return {
    stream,
    premiumAprBps,
    isStreaming,
    secondsRemaining,
    isLoading: stateLoading,
    refetch: () => {
      void refetchState()
    },
  }
}
