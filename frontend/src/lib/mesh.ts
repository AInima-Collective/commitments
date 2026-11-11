import { type Address } from 'viem'

// ─── Status Types ─────────────────────────────────────────────────────────────

/**
 * All possible states for an operator in the registry.
 *
 *   ACTIVE           — operator is registered, active, and meets min stake
 *   INACTIVE         — operator is registered but deactivated
 *   BELOW_MIN_STAKE  — operator is active but total delegated stake < minStake
 */
export type OperatorStatus = 'ACTIVE' | 'INACTIVE' | 'BELOW_MIN_STAKE'

// ─── Operator Info ─────────────────────────────────────────────────────────────

/**
 * Typed representation of an on-chain Operator struct, enriched with address.
 */
export interface OperatorInfo {
  address: Address
  active: boolean
  selfStakeCommitmentId: bigint
  totalDelegatedStake: bigint
  activeDelegationCount: bigint
  registeredAt: bigint
  /**
   * Resolved self-stake amount (the `amount` of the commitment with id
   * `selfStakeCommitmentId`). Populated by the indexer-backed hook only —
   * the on-chain `useOperators` fallback leaves this `undefined` because
   * resolving it would require a per-row chain read.
   */
  selfStake?: bigint
}

// ─── Status Derivation ─────────────────────────────────────────────────────────

/**
 * Derive operator status from the operator struct fields.
 *
 * Precedence order:
 *  1. !op.active                                    → INACTIVE
 *  2. minStake && op.totalDelegatedStake < minStake → BELOW_MIN_STAKE
 *  3. Otherwise                                     → ACTIVE
 */
export function deriveOperatorStatus(
  op: { active: boolean; totalDelegatedStake: bigint },
  minStake?: bigint,
): OperatorStatus {
  if (!op.active) return 'INACTIVE'
  if (minStake !== undefined && op.totalDelegatedStake < minStake) return 'BELOW_MIN_STAKE'
  return 'ACTIVE'
}

// ─── Service Operator Info ───────────────────────────────────────────────────────

/**
 * Services-layer state for an operator (from OperatorServiceRegistry).
 */
export interface ServiceOperatorInfo {
  address: Address
  registeredInService: boolean
  signingKey: Address | null
  votingPower: bigint
}
