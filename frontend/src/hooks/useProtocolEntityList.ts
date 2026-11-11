import { useQuery } from '@tanstack/react-query'
import type { Address } from 'viem'

import { hasIndexer, indexerGraphql, indexerGraphqlData, indexerJson } from '../config/indexer'
import { parseCommitmentRow, type CommitmentRowWire } from '../lib/indexerRows'
import type { CommitmentStatus } from '../lib/commitments'
import { POLL } from './polling'

/**
 * Hooks that power the Explorer's Etherscan-style entity browser tabs.
 * Each tab pulls a paginated, sortable list of one entity type. The hooks
 * are intentionally lean (no joins, no denormalization) — `EntityBrowser`
 * formats and routes from these rows. The browser has no operators or
 * vaults tab, so there are no hooks for them here (the indexer does index
 * both).
 */

export interface ProtocolCommitmentRow {
  id: bigint
  manager: Address
  committer: Address
  arbiter: Address
  counterparty: Address
  /** Backing token of the commitment (raw ERC-20 or ERC-4626 share). */
  token: Address
  amount: bigint
  maxPenaltyBps: number
  status: CommitmentStatus
  forfeitChallengeEnd: bigint | null
  unbondMaturesAt: bigint | null
  createdBlock: bigint
  /** Block timestamp of creation (unix seconds); null on rows that predate the column. */
  createdAt: bigint | null
}

interface UrgentEnvelope {
  rows: CommitmentRowWire[]
  counts?: { total: number }
}

const EMPTY_COMMITMENTS: ProtocolCommitmentRow[] = []

/** `/commitments/urgent` serves at most this many rows per request. */
const URGENT_PAGE = 100

/**
 * useProtocolCommitmentsList — protocol-wide commitment list using the
 * canonical `/commitments/urgent` sort (forfeitPending → unbonding → active →
 * terminal, then deadline ASC, then id DESC): the first page of 100, the
 * endpoint's maximum. Callers wanting fewer rows slice, so every caller shares
 * one cached request. `address` filters server-side to commitments where it is
 * committer or counterparty. `total` counts every matching row.
 */
export function useProtocolCommitmentsList(options: { address?: string } = {}): {
  rows: ProtocolCommitmentRow[]
  total: number
  isLoading: boolean
  error: unknown
} {
  const address = options.address?.toLowerCase()
  const query = useQuery({
    enabled: hasIndexer,
    queryKey: ['protocol-commitments-list', address ?? null],
    queryFn: async () => {
      const params = new URLSearchParams({ limit: String(URGENT_PAGE) })
      if (address) params.set('address', address)
      const env = await indexerJson<UrgentEnvelope>(`/commitments/urgent?${params.toString()}`)
      const rows = (env.rows ?? []).map((w): ProtocolCommitmentRow => {
        const r = parseCommitmentRow(w)
        return {
          id: r.id,
          manager: w.manager as Address,
          committer: r.committer,
          arbiter: r.arbiter,
          counterparty: r.counterparty,
          token: r.token,
          amount: r.amount,
          maxPenaltyBps: r.maxPenaltyBps,
          status: r.status,
          forfeitChallengeEnd: r.forfeitChallengeEnd ?? null,
          unbondMaturesAt: r.unbondMaturesAt ?? null,
          createdBlock: r.createdBlock,
          createdAt: r.createdAt ?? null,
        }
      })
      return { rows, total: env.counts?.total ?? rows.length }
    },
    refetchInterval: POLL.fast,
  })
  return {
    rows: query.data?.rows ?? EMPTY_COMMITMENTS,
    total: query.data?.total ?? 0,
    isLoading: query.isLoading,
    error: query.error,
  }
}

export interface ProtocolAgreementRow {
  id: bigint
  commitmentIdA: bigint
  commitmentIdB: bigint
  status: string
  acceptedBlock: bigint
  cumulativeProposerToAcceptor: bigint
  cumulativeAcceptorToProposer: bigint
  /** Committer of the A-side commitment (the agreement proposer). */
  committerA: Address | undefined
  /** Committer of the B-side commitment (the agreement acceptor). */
  committerB: Address | undefined
  /** Sum of underlying commitment amounts — the bilateral exposure. */
  exposure: bigint | undefined
}

interface AgreementWire {
  id: string
  manager: string
  commitmentIdA: string
  commitmentIdB: string
  status: string
  acceptedBlock: string
  cumulativeProposerToAcceptor: string
  cumulativeAcceptorToProposer: string
}

interface CommitmentLiteWire {
  id: string
  manager: string
  committer: string
  amount: string
}

const AGREEMENTS_QUERY = /* GraphQL */ `
  query Agreements($limit: Int!) {
    agreements(limit: $limit, orderBy: "id", orderDirection: "desc") {
      items {
        id
        manager
        commitmentIdA
        commitmentIdB
        status
        acceptedBlock
        cumulativeProposerToAcceptor
        cumulativeAcceptorToProposer
      }
    }
  }
`

const COMMITMENTS_BY_ID_QUERY = /* GraphQL */ `
  query CommitmentsByIds($ids: [BigInt!]!) {
    commitments(where: { id_in: $ids }, limit: 1000) {
      items {
        id
        manager
        committer
        amount
      }
    }
  }
`

/**
 * useProtocolAgreementsList — protocol-wide agreement list ordered
 * newest-first by id. Two round trips to the indexer:
 *   1. fetch agreements (id, sides, status, flows)
 *   2. fetch the unique set of underlying commitments to enrich rows with
 *      committerA / committerB and total exposure
 *
 * Ponder's auto-generated GraphQL doesn't define a relation between
 * agreement and commitment so we join client-side. Acceptable cost: a
 * second sibling query is ~one round trip and the lookup is in-memory after.
 */
export function useProtocolAgreementsList(options: { limit?: number } = {}): {
  rows: ProtocolAgreementRow[]
  isLoading: boolean
  error: unknown
} {
  const { limit = 100 } = options
  const query = useQuery({
    enabled: hasIndexer,
    queryKey: ['protocol-agreements-list', limit],
    queryFn: async (): Promise<ProtocolAgreementRow[]> => {
      const data = await indexerGraphqlData<{ agreements: { items: AgreementWire[] } }>(
        AGREEMENTS_QUERY,
        { limit },
      )
      const items = data.agreements.items
      if (items.length === 0) return []

      const ids = new Set<string>()
      for (const w of items) {
        ids.add(w.commitmentIdA)
        ids.add(w.commitmentIdB)
      }
      const cRes = await indexerGraphql<{ commitments: { items: CommitmentLiteWire[] } }>(
        COMMITMENTS_BY_ID_QUERY,
        { ids: Array.from(ids) },
      )
      // Commitment ids repeat across managers, so key the join by (manager, id);
      // an agreement's legs live on the agreement's own manager.
      const key = (manager: string, id: string) => `${manager.toLowerCase()}-${id}`
      const byKey = new Map<string, CommitmentLiteWire>()
      for (const c of cRes.data?.commitments.items ?? []) {
        byKey.set(key(c.manager, c.id), c)
      }

      return items.map((w): ProtocolAgreementRow => {
        const a = byKey.get(key(w.manager, w.commitmentIdA))
        const b = byKey.get(key(w.manager, w.commitmentIdB))
        const exposure =
          a && b ? BigInt(a.amount) + BigInt(b.amount) : a ? BigInt(a.amount) : b ? BigInt(b.amount) : undefined
        return {
          id: BigInt(w.id),
          commitmentIdA: BigInt(w.commitmentIdA),
          commitmentIdB: BigInt(w.commitmentIdB),
          status: w.status,
          acceptedBlock: BigInt(w.acceptedBlock),
          cumulativeProposerToAcceptor: BigInt(w.cumulativeProposerToAcceptor),
          cumulativeAcceptorToProposer: BigInt(w.cumulativeAcceptorToProposer),
          committerA: a ? (a.committer as Address) : undefined,
          committerB: b ? (b.committer as Address) : undefined,
          exposure,
        }
      })
    },
    refetchInterval: POLL.fast,
  })
  return {
    rows: query.data ?? [],
    isLoading: query.isLoading,
    error: query.error,
  }
}

export interface ProtocolArbiterRow {
  address: Address
  totalCommitments: number
  activeCommitments: number
  pendingManagerForfeits: number
  openMechanismCases: number
}

export interface ProtocolEntityPage {
  limit: number
  offset: number
  total: number
  nextOffset: number | null
}

interface ArbiterDirectoryWire {
  rows: Array<Omit<ProtocolArbiterRow, 'address'> & { address: string }>
  page: ProtocolEntityPage
}

export function useProtocolArbitersList(options: {
  limit?: number
  offset?: number
  address?: string
  enabled?: boolean
} = {}): {
  rows: ProtocolArbiterRow[]
  page: ProtocolEntityPage
  isLoading: boolean
  error: unknown
} {
  const { limit = 50, offset = 0, address, enabled = true } = options
  const query = useQuery({
    enabled: hasIndexer && enabled,
    queryKey: ['protocol-arbiters-list', limit, offset, address?.toLowerCase() ?? null],
    queryFn: async () => {
      const params = new URLSearchParams({ limit: String(limit), offset: String(offset) })
      if (address) params.set('address', address.toLowerCase())
      const body = await indexerJson<ArbiterDirectoryWire>(`/protocol/arbiters?${params.toString()}`)
      return {
        rows: body.rows.map((row) => ({ ...row, address: row.address as Address })),
        page: body.page,
      }
    },
    refetchInterval: POLL.slow,
  })
  return {
    rows: query.data?.rows ?? [],
    page: query.data?.page ?? { limit, offset, total: 0, nextOffset: null },
    isLoading: query.isLoading,
    error: query.error,
  }
}

export interface ProtocolCaseRow {
  source: 'CommitmentManager' | 'arbiter mechanism'
  mechanismSource: 'arbiter mechanism' | null
  managerSource: 'CommitmentManager'
  mechanism: string | null
  caseId: string | null
  commitmentId: bigint | null
  manager: Address | null
  arbiter: Address
  mechanismPhase: string
  managerPhase: string
  nextDeadline: bigint | null
  nextAction: string | null
  terminalOutcome: string | null
  penaltyBps: number | null
  proposalInitiatedAt: bigint | null
  updatedAt: bigint
  transactionHash: `0x${string}` | null
}

interface CasesWire {
  rows: Array<Omit<ProtocolCaseRow, 'commitmentId' | 'nextDeadline' | 'proposalInitiatedAt' | 'updatedAt'> & {
    commitmentId: string | null
    nextDeadline: string | null
    proposalInitiatedAt: string | null
    updatedAt: string
  }>
  page: ProtocolEntityPage
}

export function useProtocolCasesList(options: {
  limit?: number
  offset?: number
  arbiter?: Address
  enabled?: boolean
  openOnly?: boolean
} = {}): {
  rows: ProtocolCaseRow[]
  page: ProtocolEntityPage
  isLoading: boolean
  error: unknown
} {
  const { limit = 50, offset = 0, arbiter, enabled = true, openOnly = false } = options
  const query = useQuery({
    enabled: hasIndexer && enabled,
    queryKey: ['protocol-cases-list', limit, offset, arbiter?.toLowerCase() ?? null, openOnly],
    queryFn: async () => {
      const params = new URLSearchParams({ limit: String(limit), offset: String(offset) })
      if (arbiter) params.set('arbiter', arbiter.toLowerCase())
      if (openOnly) params.set('open', 'true')
      const body = await indexerJson<CasesWire>(`/protocol/cases?${params.toString()}`)
      return {
        rows: body.rows.map((row) => ({
          ...row,
          commitmentId: row.commitmentId === null ? null : BigInt(row.commitmentId),
          nextDeadline: row.nextDeadline === null ? null : BigInt(row.nextDeadline),
          proposalInitiatedAt: row.proposalInitiatedAt === null ? null : BigInt(row.proposalInitiatedAt),
          updatedAt: BigInt(row.updatedAt),
        })),
        page: body.page,
      }
    },
    refetchInterval: POLL.slow,
  })
  return {
    rows: query.data?.rows ?? [],
    page: query.data?.page ?? { limit, offset, total: 0, nextOffset: null },
    isLoading: query.isLoading,
    error: query.error,
  }
}
