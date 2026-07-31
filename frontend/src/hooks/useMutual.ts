import { type Address } from 'viem'

import {
  useReadCommitmentManagerGetMutual,
  useReadCommitmentManagerGetMutualLossProposal,
} from '../generated'
import { lambdaToFraction } from '../lib/format'
import { useMutuals } from './useMutuals'

/** Header view of a Mutual (the `getMutual` tuple, typed). */
export interface MutualHeader {
  arbiter: Address
  numeraire: Address
  beneficiary: Address
  /** Zero address ⇒ homogeneous mode (every member posts the numeraire). */
  valuationAuthority: Address
  challengeWindow: bigint
  deallocationWindow: bigint
  /** 0n when no loss proposal has ever been initiated. */
  lastInitiatedAt: bigint
  /** Sum of active members' creditedValue (changes only on join/release). */
  totalShares: bigint
  /** Lambda — 1e18-scaled cumulative loss FRACTION, monotonic, capped at 1e18. */
  cumulativeLoss: bigint
  active: boolean
  terminal: boolean
  // Heterogeneous mode (ERC §H §8 / M4) — zero/empty for homogeneous & attested-unconfigured mutuals.
  /** Band valuation adapter; zero address ⇒ NOT heterogeneous (homogeneous M1 behaviour). */
  bandAdapter: Address
  /** Band lower bound on premiumWeight, basis points. */
  valuationFloorBps: bigint
  /** Band upper bound on premiumWeight, basis points (≤1e4). */
  valuationCeilBps: bigint
  /** Premium-funding split routed to the junior absorber, basis points. */
  juniorBps: bigint
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
  /** True in homogeneous mode (valuationAuthority == 0). */
  isHomogeneous: boolean
  /** True in heterogeneous mode (ERC §H §8): a band valuation adapter is configured. */
  isHeterogeneous: boolean
  /**
   * Junior shortfall reserve (funded − drawn) in raw numeraire units, from the indexer's
   * `GET /mutuals`. `undefined` when the indexer hasn't supplied this mutual. 0n for homogeneous.
   */
  juniorPool: bigint | undefined
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

const ZERO = '0x0000000000000000000000000000000000000000'

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
    query: { enabled: queryEnabled, refetchInterval: 15_000 },
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
    query: { enabled: queryEnabled, refetchInterval: 15_000 },
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
        valuationAuthority: mutualRaw.valuationAuthority,
        challengeWindow: BigInt(mutualRaw.challengeWindow),
        deallocationWindow: BigInt(mutualRaw.deallocationWindow),
        lastInitiatedAt: BigInt(mutualRaw.lastInitiatedAt),
        totalShares: BigInt(mutualRaw.totalShares),
        cumulativeLoss: BigInt(mutualRaw.cumulativeLoss),
        active: mutualRaw.active,
        terminal: mutualRaw.terminal,
        bandAdapter: mutualRaw.bandAdapter,
        valuationFloorBps: BigInt(mutualRaw.valuationFloorBps),
        valuationCeilBps: BigInt(mutualRaw.valuationCeilBps),
        juniorBps: BigInt(mutualRaw.juniorBps),
      }
    : undefined

  // A zero-value struct (initiatedAt === 0n) means no proposal has ever been
  // recorded for this mutual; treat that as "no proposal" (Solidity returns the
  // zero struct for unset mappings).
  const proposal: MutualLossProposal | undefined =
    proposalRaw && BigInt(proposalRaw.initiatedAt) > 0n
      ? {
          lossNumeraire: BigInt(proposalRaw.lossNumeraire),
          initiatedAt: BigInt(proposalRaw.initiatedAt),
          evidenceHash: proposalRaw.evidenceHash,
          proposer: proposalRaw.proposer,
          executed: proposalRaw.executed,
          cancelled: proposalRaw.cancelled,
        }
      : undefined

  const hasPendingLoss =
    proposal !== undefined && !proposal.executed && !proposal.cancelled

  const lambda = mutual?.cumulativeLoss ?? 0n
  const markdownFraction = lambdaToFraction(lambda)
  const markdownPct = markdownFraction * 100

  const isHomogeneous =
    mutual !== undefined && mutual.valuationAuthority.toLowerCase() === ZERO

  // Heterogeneous iff a band adapter is configured (set by configureHeterogeneous before
  // activation). Distinct from `!isHomogeneous`: an attested-but-unconfigured mutual has a
  // non-zero valuationAuthority yet still prices premium homogeneously (bandAdapter == 0).
  const isHeterogeneous =
    mutual !== undefined && mutual.bandAdapter.toLowerCase() !== ZERO

  // A non-existent mutual id reads back as the zero struct: no arbiter, never
  // activated, no shares. Treat that as "not found" rather than a real mutual.
  const notFound =
    mutual !== undefined &&
    mutual.arbiter.toLowerCase() === ZERO &&
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
    isHomogeneous,
    isHeterogeneous,
    juniorPool: indexed?.juniorPool,
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
