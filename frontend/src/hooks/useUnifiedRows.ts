import { useMemo } from 'react'
import { type Address } from 'viem'
import {
  useIndexedCommitments,
  type UnifiedCommitmentRow,
} from './useIndexedCommitments'
import { useAgreements } from './useAgreements'
import { type AgreementProposalWithStatus } from '../utils/agreements'
import { type CommitmentStatus } from '../utils/commitments'

/** Status superset used by the unified table — adds `PENDING` for unaccepted proposals. */
export type UnifiedRowStatus = CommitmentStatus | 'PENDING'

/**
 * Tagged row union for the unified commitments table:
 * - `kind: 'commitment'` — indexer-backed commitment from useIndexedCommitments
 * - `kind: 'proposal'`   — pre-acceptance agreement proposal from useAgreements
 *
 * Each branch carries the same surface fields (id, status, role, parties, amount,
 * direction) plus its source payload (`commitment` / `proposal`) so detail surfaces
 * can render the appropriate UI without duplicate fetches.
 */
export type UnifiedRow =
  | UnifiedCommitmentRowEntry
  | UnifiedProposalRowEntry

export interface UnifiedCommitmentRowEntry {
  kind: 'commitment'
  id: bigint
  status: UnifiedRowStatus
  direction: 'one-way' | 'paired'
  role: 'committer' | 'counterparty'
  committer: Address
  counterparty: Address
  arbiter: Address
  /** Backing token — drives decimals + the token chip. */
  token: Address
  amount: bigint
  maxPenaltyBps: number
  forfeitChallengeEnd: bigint | undefined
  /** Vault that backs this commitment. Drives the vault chip in multi-vault
   *  deployments (USDC + WETH). Undefined on rows from older indexers. */
  vault: Address | undefined
  /** CommitmentManager that emitted CommitmentCreated. Undefined on older rows. */
  manager: Address | undefined
  /** Source payload — kept so the drawer renders without re-fetching. */
  commitment: UnifiedCommitmentRow
}

export interface UnifiedProposalRowEntry {
  kind: 'proposal'
  /** Use the proposalId; namespace is disjoint from commitmentIds in the contract. */
  id: bigint
  /** Always 'PENDING' — see useAgreements for filtering rules. */
  status: 'PENDING'
  /** Proposals are always paired by definition. */
  direction: 'paired'
  role: 'proposer' | 'acceptor'
  /** Proposer address (mapped to `committer` slot for column reuse). */
  committer: Address
  /** Acceptor address (mapped to `counterparty` slot for column reuse). */
  counterparty: Address
  arbiter: Address
  /** Backing token — drives decimals + the token chip. */
  token: Address
  /** Viewer's stake in this proposal. */
  amount: bigint
  maxPenaltyBps: number
  /** No forfeit window pre-acceptance. */
  forfeitChallengeEnd: undefined
  /** Proposal expiry timestamp (unix seconds). Drives the `window` column. */
  expiresAt: bigint
  /** Source payload — drives the accept/reject UI in the drawer. */
  proposal: AgreementProposalWithStatus
}

interface UseUnifiedRowsParams {
  managerAddress: Address | undefined
  viewAddress: Address | undefined
}

interface UseUnifiedRowsReturn {
  rows: UnifiedRow[]
  isLoading: boolean
  error: Error | null
  indexerOnline: boolean
  refetch: () => void
}

/**
 * Single source of truth for the unified commitments DataTable. Combines
 * `useIndexedCommitments` (indexer-backed commitment rows) with
 * `useAgreements` (pre-acceptance proposals) under one row union so the
 * page can render a single, sortable, filterable table that includes the
 * "Pending" filter spec'd in § 2 of the restructure plan.
 *
 * Rows are concatenated commitments-first; the indexer's canonical urgency
 * order is preserved among commitments, and proposals are sorted by expiry
 * ASC (soonest-expiring first). Pages can override via DataTable sort.
 */
export function useUnifiedRows({
  managerAddress,
  viewAddress,
}: UseUnifiedRowsParams): UseUnifiedRowsReturn {
  const indexed = useIndexedCommitments({ viewAddress })
  const proposals = useAgreements({ managerAddress, viewAddress })

  const rows = useMemo<UnifiedRow[]>(() => {
    const commitmentRows: UnifiedCommitmentRowEntry[] = indexed.rows.map((c) => ({
      kind: 'commitment' as const,
      id: c.id,
      status: c.status,
      direction: c.direction,
      role: c.role,
      committer: c.committer,
      counterparty: c.counterparty,
      arbiter: c.arbiter,
      token: c.token,
      amount: c.amount,
      maxPenaltyBps: c.maxPenaltyBps,
      forfeitChallengeEnd: c.forfeitChallengeEnd,
      vault: c.vault,
      manager: c.manager,
      commitment: c,
    }))

    // Only surface still-actionable proposals — accepted, cancelled, and expired
    // entries are downstream of a commitment that already shows up under the
    // commitment branch (or simply aren't actionable).
    const openProposals = proposals.agreements.filter(
      (p) => !p.accepted && !p.cancelled && p.status !== 'EXPIRED',
    )
    const proposalRows: UnifiedProposalRowEntry[] = openProposals.map((p) => {
      const role: 'proposer' | 'acceptor' = p.viewerIsProposer ? 'proposer' : 'acceptor'
      const myAmount = p.viewerIsProposer ? p.proposerAmount : p.acceptorAmount
      return {
        kind: 'proposal' as const,
        id: p.proposalId,
        status: 'PENDING' as const,
        direction: 'paired' as const,
        role,
        committer: p.proposer,
        counterparty: p.acceptor,
        arbiter: p.arbiter,
        token: p.token,
        amount: myAmount,
        maxPenaltyBps: p.maxPenaltyBps,
        forfeitChallengeEnd: undefined,
        expiresAt: p.expiresAt,
        proposal: p,
      }
    })

    proposalRows.sort((a, b) => (a.expiresAt < b.expiresAt ? -1 : a.expiresAt > b.expiresAt ? 1 : 0))

    return [...commitmentRows, ...proposalRows]
  }, [indexed.rows, proposals.agreements])

  const refetch = () => {
    indexed.refetch()
    proposals.refetch()
  }

  return {
    rows,
    isLoading: indexed.isLoading || proposals.isLoading,
    // Surface either side's failure — a proposal-scan error otherwise silently
    // drops the entire "Pending" branch with no signal to the consumer.
    error: indexed.error ?? proposals.error,
    indexerOnline: indexed.indexerOnline,
    refetch,
  }
}
