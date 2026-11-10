import { type Address, zeroAddress } from 'viem'

import {
  useReadCommitmentManagerGetMutual,
  useReadCommitmentManagerGetMutualLossProposal,
} from '../generated'
import { lambdaToFraction } from '../lib/format'
import { useMutuals } from './useMutuals'
import { POLL } from './polling'

/** Header view of a Mutual (the `getMutual` tuple, typed). */
export interface MutualHeader {
  arbiter: Address
  numeraire: Address
  beneficiary: Address
  challengeWindow: bigint
  deallocationWindow: bigint
  /** Sum of active members' creditedValue (changes only on join/release). */
  totalShares: bigint
  /** Lambda — 1e18-scaled cumulative loss FRACTION, monotonic, capped at 1e18. */
  cumulativeLoss: bigint
  active: boolean
  terminal: boolean
}

/** Pending bonded loss proposal (the `getMutualLossProposal` tuple, typed). */
export interface MutualLossProposal {
  lossNumeraire: bigint
  initiatedAt: bigint
  evidenceHash: `0x${string}`
  proposer: Address
  executed: boolean
  cancelled: boolean
}

export interface UseMutualReturn {
  mutual: MutualHeader | undefined
  proposal: MutualLossProposal | undefined
  /** True when a loss proposal is live (initiated, not executed/cancelled). */
  hasPendingLoss: boolean
  /** Lambda as a plain markdown fraction in [0, 1]. */
  markdownFraction: number
  /** Lambda as a percentage in [0, 100] (cumulative markdown). */
  markdownPct: number
  /**
   * Loss-adjusted live coverage (raw numeraire units) from the indexer's
   * `GET /mutuals`. `undefined` when the indexer hasn't supplied this mutual —
   * callers must then label nominal figures as "loss not yet applied" rather
   * than presenting `totalShares` as remaining cover.
   */
  liveCapacity: bigint | undefined
  /** True when {@link liveCapacity} reflects an actual indexer read. */
  liveCapacityAvailable: boolean
  /** Number of members, from the indexer (undefined when unavailable). */
  memberCount: number | undefined
  /**
   * True once the header read resolved to the zero struct — i.e. the mutual id
   * does not exist on-chain. Distinct from `isLoading` and `isError`.
   */
  notFound: boolean
  isLoading: boolean
  isError: boolean
  error: Error | null
  refetch: () => void
}

interface UseMutualParams {
  managerAddress: Address | undefined
  mutualId: bigint | undefined
  enabled?: boolean
}

/**
 * useMutual — reads a Mutual header (`getMutual`) and its pending bonded loss
 * proposal (`getMutualLossProposal`) for one mutual, and derives the cumulative
 * markdown fraction/percentage from Lambda (`cumulativeLoss`, 1e18-scaled).
 *
 * Both reads refetch every 15s so the live Lambda and challenge-window state
 * stay fresh. Returns `mutual === undefined` until the header read resolves so
 * callers can branch on loading.
 */
export function useMutual({
  managerAddress,
  mutualId,
  enabled,
}: UseMutualParams): UseMutualReturn {
  const queryEnabled =
    !!managerAddress && mutualId !== undefined && enabled !== false

  const {
    data: mutualRaw,
    isLoading: mutualLoading,
    isError: mutualIsError,
    error: mutualError,
    refetch: refetchMutual,
  } = useReadCommitmentManagerGetMutual({
    address: managerAddress,
    args: mutualId !== undefined ? [mutualId] : undefined,
    query: { enabled: queryEnabled, refetchInterval: POLL.fast },
  })

  const {
    data: proposalRaw,
    isLoading: proposalLoading,
    isError: proposalIsError,
    error: proposalError,
    refetch: refetchProposal,
  } = useReadCommitmentManagerGetMutualLossProposal({
    address: managerAddress,
    args: mutualId !== undefined ? [mutualId] : undefined,
    query: { enabled: queryEnabled, refetchInterval: POLL.fast },
  })

  // Indexer enrichment: the loss-adjusted live coverage that the on-chain
  // header cannot compute without enumerating members.
  const { byId: indexedById, refetch: refetchIndexed } = useMutuals()
  const indexed = mutualId !== undefined ? indexedById.get(mutualId) : undefined

  const mutual: MutualHeader | undefined = mutualRaw
    ? {
        arbiter: mutualRaw.arbiter,
        numeraire: mutualRaw.numeraire,
        beneficiary: mutualRaw.beneficiary,
        challengeWindow: BigInt(mutualRaw.challengeWindow),
        deallocationWindow: BigInt(mutualRaw.deallocationWindow),
        totalShares: BigInt(mutualRaw.totalShares),
        cumulativeLoss: BigInt(mutualRaw.cumulativeLoss),
        active: mutualRaw.active,
        terminal: mutualRaw.terminal,
      }
    : undefined

  // A zero-value struct (initiatedAt === 0n) means no proposal has ever been
  // recorded for this mutual; treat that as "no proposal" (Solidity returns the
  // zero struct for unset mappings).
  const proposal: MutualLossProposal | undefined =
    proposalRaw && mutualRaw && BigInt(proposalRaw.initiatedAt) > 0n
      ? {
          lossNumeraire: BigInt(proposalRaw.lossNumeraire),
          initiatedAt: BigInt(proposalRaw.initiatedAt),
          evidenceHash: proposalRaw.evidenceHash,
          proposer: mutualRaw.arbiter, // only the mutual's arbiter can initiate a loss
          executed: proposalRaw.executed,
          cancelled: proposalRaw.cancelled,
        }
      : undefined

  const hasPendingLoss =
    proposal !== undefined && !proposal.executed && !proposal.cancelled

  const lambda = mutual?.cumulativeLoss ?? 0n
  const markdownFraction = lambdaToFraction(lambda)
  const markdownPct = markdownFraction * 100

  // A non-existent mutual id reads back as the zero struct: no arbiter, never
  // activated, no shares. Treat that as "not found" rather than a real mutual.
  const notFound =
    mutual !== undefined &&
    mutual.arbiter.toLowerCase() === zeroAddress &&
    !mutual.active &&
    !mutual.terminal &&
    mutual.totalShares === 0n &&
    mutual.cumulativeLoss === 0n

  return {
    mutual,
    proposal,
    hasPendingLoss,
    markdownFraction,
    markdownPct,
    liveCapacity: indexed?.liveCapacity,
    liveCapacityAvailable: indexed !== undefined,
    memberCount: indexed?.memberCount,
    notFound,
    isLoading: mutualLoading || proposalLoading,
    isError: mutualIsError || proposalIsError,
    error: (mutualError as Error | null) ?? (proposalError as Error | null) ?? null,
    refetch: () => {
      void refetchMutual()
      void refetchProposal()
      refetchIndexed()
    },
  }
}
