import { type Address } from 'viem'
import type {
  UnifiedCommitmentRowEntry,
  UnifiedProposalRowEntry,
} from '../../../hooks/useUnifiedRows'
import type { CommitmentStatus } from '../../commitments'

export const COMMITTER = '0x1111111111111111111111111111111111111111' as Address
export const COUNTERPARTY = '0x22222222222222222222222222222222222222ab' as Address
export const ARBITER = '0x3333333333333333333333333333333333333333' as Address
export const TOKEN = '0x4444444444444444444444444444444444444444' as Address
export const NONZERO_HASH = `0x${'ab'.repeat(32)}`

export interface RowOverrides {
  id?: bigint
  /** Commitment statuses only — `PENDING` belongs to proposals. */
  status?: CommitmentStatus
  metadataStatus?: 'empty' | 'ok' | 'mismatch' | 'unreachable'
  metadataHash?: string
  metadataContent?: Record<string, unknown> | undefined
  direction?: 'one-way' | 'paired'
  agreementId?: bigint
  agreementSide?: 'A' | 'B'
  acceptsContributions?: boolean
  role?: 'committer' | 'counterparty'
  counterparty?: Address
  amount?: bigint
}

/**
 * Build a commitment row for tests. Defaults are the least-informative case
 * (one-way, no metadata, unknown counterparty) so each test only has to state
 * the signal it is actually exercising.
 */
export function makeRow(overrides: RowOverrides = {}): UnifiedCommitmentRowEntry {
  const role = overrides.role ?? 'committer'
  const counterparty = overrides.counterparty ?? COUNTERPARTY
  const commitment = {
    id: overrides.id ?? 12n,
    committer: COMMITTER,
    arbiter: ARBITER,
    counterparty,
    token: TOKEN,
    adapter: TOKEN,
    amount: overrides.amount ?? 1_204_000_000n,
    maxPenaltyBps: 2500,
    status: overrides.status ?? ('ACTIVE' as const),
    forfeitPenaltyBps: undefined,
    forfeitChallengeEnd: undefined,
    forfeitSharesExecuted: undefined,
    forfeitCounterparty: undefined,
    unbondInitiatedAt: undefined,
    unbondMaturesAt: undefined,
    createdBlock: 1n,
    createdAt: undefined,
    metadataURI: overrides.metadataStatus === 'empty' ? undefined : 'data:application/json,{}',
    metadataHash: overrides.metadataHash,
    metadataStatus: overrides.metadataStatus,
    metadataContent: overrides.metadataContent,
    metadataContentRaw: undefined,
    acceptsContributions: overrides.acceptsContributions ?? false,
    vault: undefined,
    manager: undefined,
    role,
    direction: overrides.direction ?? ('one-way' as const),
    agreementId: overrides.agreementId,
    agreementSide: overrides.agreementSide,
    agreementStatus: undefined,
  }
  return {
    kind: 'commitment',
    id: commitment.id,
    status: commitment.status,
    direction: commitment.direction,
    role,
    committer: COMMITTER,
    counterparty,
    arbiter: ARBITER,
    token: TOKEN,
    amount: commitment.amount,
    maxPenaltyBps: commitment.maxPenaltyBps,
    forfeitChallengeEnd: undefined,
    vault: undefined,
    manager: undefined,
    commitment,
  }
}

/** A row whose metadata fetched cleanly and matched its attested hash. */
export function makeOkRow(content: Record<string, unknown>, overrides: RowOverrides = {}) {
  return makeRow({
    ...overrides,
    metadataStatus: 'ok',
    metadataHash: NONZERO_HASH,
    metadataContent: content,
  })
}

/** A pre-acceptance agreement proposal row. */
export function makeProposal(overrides: { id?: bigint } = {}): UnifiedProposalRowEntry {
  return {
    kind: 'proposal',
    id: overrides.id ?? 7n,
    status: 'PENDING',
    direction: 'paired',
    role: 'proposer',
    committer: COMMITTER,
    counterparty: COUNTERPARTY,
    arbiter: ARBITER,
    token: TOKEN,
    amount: 1n,
    maxPenaltyBps: 3000,
    forfeitChallengeEnd: undefined,
    expiresAt: 0n,
    proposal: {} as UnifiedProposalRowEntry['proposal'],
  }
}
