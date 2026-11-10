import { type Address } from 'viem'
import { formatPercent } from '../lib/format'
import type { ForfeitEnforcementState, ForfeitProposalSnapshot } from '../lib/forfeitEnforcement'

// ─── Status Types ────────────────────────────────────────────────────────────

export type CommitmentStatus =
  | 'ACTIVE'
  | 'UNBONDING'
  | 'RELEASED'
  | 'FORFEITED'
  | 'FORFEIT_PENDING'
  | 'EXPIRED'

export type ForfeitProposalState = ForfeitEnforcementState

// ─── Commitment Interface ─────────────────────────────────────────────────────

/**
 * Enriched commitment for UI — combines on-chain Commitment struct with derived status.
 *
 * v2 (manager-custody): the commitment carries its own backing `token` + pricing
 * `adapter` (backing is any ERC-20 / ERC-4626 share, not implicitly vault shares),
 * and yield is no longer a per-commitment accumulator — it's paid by distribution
 * `strategies` bound at creation. Unbonding is per-commitment (`unbondInitiatedAt`),
 * not a vault withdrawal queue.
 */
export interface CommitmentWithStatus {
  id: bigint
  committer: Address
  arbiter: Address
  counterparty: Address
  /** Backing token custodied by the manager (raw ERC-20 or ERC-4626 vault share). */
  token: Address
  /** Pricing adapter that denominates `token` (ERC20Static or ERC4626). */
  adapter: Address
  amount: bigint
  maxPenaltyBps: number
  challengeWindow: bigint
  createdAt: bigint
  expiresAt: bigint
  released: boolean
  forfeited: boolean
  /**
   * Unix timestamp the committer requested unbond at, or `0n`/undefined when no
   * unbond is pending. Read live from `manager.unbondInitiatedAt(id)`. Maturity
   * is `unbondInitiatedAt + manager.unbondingPeriod()`.
   */
  unbondInitiatedAt?: bigint
  /** Distribution strategies bound to this commitment (`manager.strategiesOf(id)`). */
  strategies?: Address[]
  status: CommitmentStatus
  /** Live manager proposal snapshot, including its lifetime pause-credit anchor. */
  forfeitProposal?: ForfeitProposalSnapshot
  /**
   * Nominal event-time end (`initiatedAt + challengeWindow`) used only as an
   * index/list ordering approximation. It is not executable time: manager
   * lifetime pause credit can move the effective deadline later.
   * Undefined for any other status.
   *
   * Used by the canonical urgency sort (`sortByCommitmentUrgency`) so the
   * imminent deadline floats to the top within the FORFEIT_PENDING tier — mirrors the
   * indexer's `COALESCE(forfeitChallengeEnd, BIG) ASC` (Indexer Improvements #3).
   */
  forfeitChallengeEnd?: bigint
}

// ─── Status Derivation ────────────────────────────────────────────────────────

/**
 * Derive commitment status from on-chain struct fields and optional forfeit proposal.
 *
 * Precedence order (per RESEARCH Pattern 2):
 *  1. forfeited === true        → FORFEITED
 *  2. released === true       → RELEASED
 *  3. Active forfeit proposal   → FORFEIT_PENDING  (a live dispute outranks unbonding)
 *  4. Unbond requested        → UNBONDING      (manager.unbondInitiatedAt(id) > 0)
 *  5. Past expiry             → EXPIRED
 *  6. Otherwise               → ACTIVE
 *
 * v2: UNBONDING is per-commitment (the vault withdrawal queue is gone). A forfeit
 * proposal blocks unbond finalization on-chain, so FORFEIT_PENDING takes precedence
 * even when an unbond was previously requested.
 */
export function deriveStatus(
  commitment: { released: boolean; forfeited: boolean; expiresAt: bigint; unbondInitiatedAt?: bigint },
  forfeitProposal: { initiatedAt: bigint; executed: boolean; cancelled: boolean } | undefined,
): CommitmentStatus {
  if (commitment.forfeited) return 'FORFEITED'
  if (commitment.released) return 'RELEASED'
  if (
    forfeitProposal &&
    forfeitProposal.initiatedAt > 0n &&
    !forfeitProposal.executed &&
    !forfeitProposal.cancelled
  ) {
    return 'FORFEIT_PENDING'
  }
  if (commitment.unbondInitiatedAt !== undefined && commitment.unbondInitiatedAt > 0n) {
    return 'UNBONDING'
  }
  const nowSecs = BigInt(Math.floor(Date.now() / 1000))
  if (commitment.expiresAt > 0n && nowSecs > commitment.expiresAt) return 'EXPIRED'
  return 'ACTIVE'
}

// ─── Forfeit Proposal State Machine ─────────────────────────────────────────────

// ─── BPS Formatting ───────────────────────────────────────────────────────────

/**
 * Format basis points as a percentage string — the protocol-domain alias for
 * the canonical `formatPercent` (fixed at 2-decimal precision).
 * formatBps(5000) → "50.00%"
 * formatBps(10000) → "100.00%"
 */
export function formatBps(bps: number | bigint): string {
  return formatPercent(bps)
}
