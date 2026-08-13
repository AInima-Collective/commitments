import { useQuery } from '@tanstack/react-query'
import type { Address } from 'viem'

import { hasIndexer, indexerFetch, indexerGraphql } from '../config/indexer'
import type { CommitmentStatus } from '../utils/commitments'

/**
 * Hooks that power the Explorer's Etherscan-style entity browser tabs.
 * Each tab pulls a paginated, sortable list of one entity type. The hooks
 * are intentionally lean (no joins, no denormalization) — `EntityBrowser`
 * formats and routes from these rows.
 *
 * Operators tab reuses the existing `useOperatorsIndexed` hook (no need to
 * duplicate). Vaults tab is composed in-page from `VITE_VAULT_ADDRESS` +
 * `useVaultStats` since the indexer has no vault entity.
 */

const STATUS_WIRE_TO_DOMAIN: Record<string, CommitmentStatus> = {
  active: 'ACTIVE',
  unbonding: 'UNBONDING',
  forfeitPending: 'FORFEIT_PENDING',
  forfeited: 'FORFEITED',
  released: 'RELEASED',
  expired: 'EXPIRED',
}

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
}

interface CommitmentWire {
  id: string
  manager: string
  committer: string
  arbiter: string
  counterparty: string
  token: string
  amount: string
  maxPenaltyBps: number
  status: string
  forfeitChallengeEnd: string | null
  unbondMaturesAt: string | null
  createdBlock: string
}

interface UrgentEnvelope {
  rows: CommitmentWire[]
}

/**
 * useProtocolCommitmentsList — protocol-wide commitment list using the
 * canonical `/commitments/urgent` sort (forfeitPending → unbonding → active →
 * terminal, then deadline ASC, then id DESC). Caller may filter by status.
 */
export function useProtocolCommitmentsList(options: {
  status?: 'active' | 'unbonding' | 'forfeitPending' | 'forfeited' | 'released' | 'expired'
  limit?: number
} = {}): {
  rows: ProtocolCommitmentRow[]
  isLoading: boolean
  error: unknown
} {
  const { status, limit = 100 } = options
  const query = useQuery({
    enabled: hasIndexer,
    queryKey: ['protocol-commitments-list', status ?? null, limit],
    queryFn: async (): Promise<ProtocolCommitmentRow[]> => {
      const params = new URLSearchParams()
      params.set('limit', String(limit))
      if (status) params.set('status', status)
      const res = await indexerFetch(`/commitments/urgent?${params.toString()}`)
      if (!res.ok) throw new Error(`Indexer error: ${res.status}`)
      const env = (await res.json()) as UrgentEnvelope
      return (env.rows ?? []).map(
        (w): ProtocolCommitmentRow => ({
          id: BigInt(w.id),
          manager: w.manager as Address,
          committer: w.committer as Address,
          arbiter: w.arbiter as Address,
          counterparty: w.counterparty as Address,
          token: w.token as Address,
          amount: BigInt(w.amount),
          maxPenaltyBps: w.maxPenaltyBps,
          status: STATUS_WIRE_TO_DOMAIN[w.status] ?? 'ACTIVE',
          forfeitChallengeEnd: w.forfeitChallengeEnd ? BigInt(w.forfeitChallengeEnd) : null,
          unbondMaturesAt: w.unbondMaturesAt ? BigInt(w.unbondMaturesAt) : null,
          createdBlock: BigInt(w.createdBlock),
        }),
      )
    },
    refetchInterval: 15_000,
  })
  return {
    rows: query.data ?? [],
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
  commitmentIdA: string
  commitmentIdB: string
  status: string
  acceptedBlock: string
  cumulativeProposerToAcceptor: string
  cumulativeAcceptorToProposer: string
}

interface CommitmentLiteWire {
  id: string
  committer: string
  amount: string
}

const AGREEMENTS_QUERY = /* GraphQL */ `
  query Agreements($limit: Int!) {
    agreements(limit: $limit, orderBy: "id", orderDirection: "desc") {
      items {
        id
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
      const res = await indexerGraphql<{ agreements: { items: AgreementWire[] } }>(
        AGREEMENTS_QUERY,
        { limit },
      )
      if (res.errors && res.errors.length > 0) {
        throw new Error(res.errors[0].message)
      }
      const items = res.data?.agreements.items ?? []
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
      const byId = new Map<string, CommitmentLiteWire>()
      for (const c of cRes.data?.commitments.items ?? []) {
        byId.set(c.id, c)
      }

      return items.map((w): ProtocolAgreementRow => {
        const a = byId.get(w.commitmentIdA)
        const b = byId.get(w.commitmentIdB)
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
    refetchInterval: 15_000,
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
      const response = await indexerFetch(`/protocol/arbiters?${params.toString()}`)
      if (!response.ok) throw new Error(`Arbiter directory error: ${response.status}`)
      const body = (await response.json()) as ArbiterDirectoryWire
      return {
        rows: body.rows.map((row) => ({ ...row, address: row.address as Address })),
        page: body.page,
      }
    },
    refetchInterval: 30_000,
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
      const response = await indexerFetch(`/protocol/cases?${params.toString()}`)
      if (!response.ok) throw new Error(`Cases explorer error: ${response.status}`)
      const body = (await response.json()) as CasesWire
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
    refetchInterval: 30_000,
  })
  return {
    rows: query.data?.rows ?? [],
    page: query.data?.page ?? { limit, offset, total: 0, nextOffset: null },
    isLoading: query.isLoading,
    error: query.error,
  }
}
