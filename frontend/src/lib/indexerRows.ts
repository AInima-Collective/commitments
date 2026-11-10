import { type Address } from 'viem'
import { type CommitmentStatus } from '../utils/commitments'
import { asMetadataObject, type MetadataStatus } from './commitmentMetadata'

/**
 * Parsing for indexer commitment rows. `GET /commitments/urgent` and
 * `GET /commitments/:id` both return the whole `commitment` table row, so
 * every hook that reads either endpoint shares this wire type and mapper.
 */

export type CommitmentStatusWire =
  | 'active'
  | 'unbonding'
  | 'forfeitPending'
  | 'forfeited'
  | 'released'
  | 'expired'

const STATUS_FROM_WIRE: Record<CommitmentStatusWire, CommitmentStatus> = {
  active: 'ACTIVE',
  unbonding: 'UNBONDING',
  forfeitPending: 'FORFEIT_PENDING',
  forfeited: 'FORFEITED',
  released: 'RELEASED',
  expired: 'EXPIRED',
}

/** Indexer wire status to the domain enum. Unknown values read as ACTIVE. */
export function commitmentStatusFromWire(status: string): CommitmentStatus {
  return STATUS_FROM_WIRE[status as CommitmentStatusWire] ?? 'ACTIVE'
}

/**
 * Wire shape of one commitment row. BigInts arrive as decimal strings; null
 * marks an unset nullable column. Optional fields are absent on rows written
 * by older indexer schemas.
 */
export interface CommitmentRowWire {
  id: string
  committer: string
  arbiter: string
  counterparty: string
  token: string
  adapter: string
  amount: string
  maxPenaltyBps: number
  status: CommitmentStatusWire
  forfeitPenaltyBps: number | null
  forfeitChallengeEnd: string | null
  forfeitSharesExecuted: string | null
  forfeitCounterparty: string | null
  unbondInitiatedAt: string | null
  unbondMaturesAt: string | null
  createdBlock: string
  /** Unix seconds; null on rows that predate the column. */
  createdAt: string | null
  updatedBlock: string
  metadataURI: string | null
  metadataHash: string | null
  metadataStatus: MetadataStatus | null
  /** Parsed JSON the indexer fetched and hash-verified; rides on every row. */
  metadataContent?: Record<string, unknown> | null
  /** Raw bytes, set only when the fetch succeeded but JSON.parse did not. */
  metadataContentRaw?: string | null
  acceptsContributions?: boolean
  vault?: string | null
  manager?: string | null
}

/** A commitment row as the app uses it, before any viewer-relative fields. */
export interface IndexedCommitmentRow {
  id: bigint
  committer: Address
  arbiter: Address
  counterparty: Address
  /** Backing token + pricing adapter (v2: every commitment carries them). */
  token: Address
  adapter: Address
  amount: bigint
  maxPenaltyBps: number
  status: CommitmentStatus
  forfeitPenaltyBps: number | undefined
  forfeitChallengeEnd: bigint | undefined
  forfeitSharesExecuted: bigint | undefined
  forfeitCounterparty: Address | undefined
  /** Unix seconds of the requestUnbond() call; undefined when none is pending. */
  unbondInitiatedAt: bigint | undefined
  /** Unix seconds at which finalizeUnbond() becomes callable. */
  unbondMaturesAt: bigint | undefined
  createdBlock: bigint
  /** Unix seconds of creation; undefined on older rows (sorts last, never 1970). */
  createdAt: bigint | undefined
  metadataURI: string | undefined
  metadataHash: string | undefined
  metadataStatus: MetadataStatus | undefined
  /** Read through `lib/commitmentMetadata`: what may be displayed depends on `metadataStatus`. */
  metadataContent: Record<string, unknown> | undefined
  /** Fetched bytes that failed JSON.parse. Only the provenance surface shows it. */
  metadataContentRaw: string | undefined
  /** v2.5 Part B opt-in flag: true once anyone has called contributeEncumbered. */
  acceptsContributions: boolean
  /** Backing vault, when the token is a vault share. Undefined on older rows. */
  vault: Address | undefined
  /** CommitmentManager that created the row. Undefined on older rows. */
  manager: Address | undefined
}

/** Parse an optional decimal string; empty, null or malformed reads as undefined. */
export function toBigInt(v: string | null | undefined): bigint | undefined {
  if (v === null || v === undefined || v === '') return undefined
  try {
    return BigInt(v)
  } catch {
    return undefined
  }
}

export function parseCommitmentRow(w: CommitmentRowWire): IndexedCommitmentRow {
  return {
    id: BigInt(w.id),
    committer: w.committer as Address,
    arbiter: w.arbiter as Address,
    counterparty: w.counterparty as Address,
    token: w.token as Address,
    adapter: w.adapter as Address,
    amount: BigInt(w.amount),
    maxPenaltyBps: w.maxPenaltyBps,
    status: commitmentStatusFromWire(w.status),
    forfeitPenaltyBps: w.forfeitPenaltyBps ?? undefined,
    forfeitChallengeEnd: toBigInt(w.forfeitChallengeEnd),
    forfeitSharesExecuted: toBigInt(w.forfeitSharesExecuted),
    forfeitCounterparty: (w.forfeitCounterparty ?? undefined) as Address | undefined,
    unbondInitiatedAt: toBigInt(w.unbondInitiatedAt),
    unbondMaturesAt: toBigInt(w.unbondMaturesAt),
    createdBlock: BigInt(w.createdBlock),
    createdAt: toBigInt(w.createdAt),
    metadataURI: w.metadataURI ?? undefined,
    metadataHash: w.metadataHash ?? undefined,
    metadataStatus: w.metadataStatus ?? undefined,
    metadataContent: asMetadataObject(w.metadataContent),
    metadataContentRaw: w.metadataContentRaw ?? undefined,
    acceptsContributions: w.acceptsContributions ?? false,
    vault: (w.vault ?? undefined) as Address | undefined,
    manager: (w.manager ?? undefined) as Address | undefined,
  }
}
