import { useQuery } from '@tanstack/react-query'
import { type Address } from 'viem'
import { hasIndexer, indexerGraphqlData } from '../config/indexer'

/**
 * `useAgentsIndexed` — the /agents showcase query set, backed by the Ponder
 * indexer. One page-level round-trip pair:
 *
 *   1. `agents(limit: 200)` — every registered ERC-8004 identity with its
 *      resolved registration file (`metadataContent`).
 *   2. `commitments(where: { committer_in: [owners] })` — the agents' bonds,
 *      joined client-side by owner and summarized per agent (no per-row
 *      fetches).
 *   3. `memberships(where: { commitmentId_in: [bond ids] })` — the
 *      mutual-membership overlay (joinMutual stakes), matched back on the
 *      (manager, commitmentId) pair to set each bond's `mutualId`.
 *
 * Follows the {@link useOperatorsIndexed} isReady/fallback discipline:
 * `isReady === false` means the indexer is unconfigured or the query failed.
 * There is no chain fallback — enumerating agents needs the indexer's
 * registry mirror (the ERC-721 has no on-chain enumeration we can afford),
 * so callers render an "indexer required" notice when `!isReady`.
 */

/** One bond (commitment where committer == the agent's owner). */
export interface AgentBondRow {
  id: bigint
  manager: Address
  status: string // wire format: 'active' | 'unbonding' | 'forfeitPending' | …
  token: Address
  amount: bigint
  maxPenaltyBps: number
  arbiter: Address
  counterparty: Address
  metadataURI: string | null
  metadataStatus: string | null
  /**
   * Set when this commitment is a mutual MEMBERSHIP (created via
   * `manager.joinMutual`) — the id of the mutual the stake underwrites.
   * Undefined for plain bilateral bonds. Joined from the indexer's
   * `memberships` table by (manager, commitmentId).
   */
  mutualId?: bigint
}

/** Per-agent bond rollup for the list cards. */
export interface AgentBondSummary {
  bonds: AgentBondRow[]
  activeCount: number
  totalCount: number
  /** Sum of `amount` across ACTIVE bonds, keyed by lowercase backing token. */
  totalActiveByToken: Map<string, { token: Address; total: bigint }>
}

export interface IndexedAgent {
  agentId: bigint
  registry: Address
  owner: Address
  agentWallet: Address | null
  agentURI: string
  metadataStatus: string | null // 'empty' | 'ok' | 'unreachable'
  metadataContent: Record<string, unknown> | null
  registeredAt: bigint
  bonds: AgentBondSummary
}

interface UseAgentsIndexedReturn {
  agents: IndexedAgent[]
  isLoading: boolean
  /** True iff the indexer is configured AND both queries succeeded. */
  isReady: boolean
  refetch: () => void
}

interface RawAgentRow {
  agentId: string
  registry: string
  owner: string
  agentWallet: string | null
  agentURI: string
  metadataStatus: string | null
  metadataContent: Record<string, unknown> | null
  registeredAt: string
}

interface RawMembershipRow {
  manager: string
  commitmentId: string
  mutualId: string
}

interface RawBondRow {
  id: string
  manager: string
  committer: string
  status: string
  token: string
  amount: string
  maxPenaltyBps: number
  arbiter: string
  counterparty: string
  metadataURI: string | null
  metadataStatus: string | null
}

const AGENTS_QUERY = /* GraphQL */ `
  query AgentsIndexed {
    agents(limit: 200, orderBy: "agentId", orderDirection: "asc") {
      items {
        agentId
        registry
        owner
        agentWallet
        agentURI
        metadataStatus
        metadataContent
        registeredAt
      }
    }
  }
`

// Which of the agents' bond commitments are mutual memberships? The membership
// PK is `${manager}-${commitmentId}` (manager lowercased) — we re-key client-side
// on that pair, so a commitmentId collision across managers cannot mislabel.
const MEMBERSHIPS_QUERY = /* GraphQL */ `
  query AgentBondMemberships($ids: [BigInt!]!) {
    memberships(where: { commitmentId_in: $ids }, limit: 1000) {
      items {
        manager
        commitmentId
        mutualId
      }
    }
  }
`

const BONDS_QUERY = /* GraphQL */ `
  query AgentBonds($owners: [String]) {
    commitments(where: { committer_in: $owners }, limit: 1000) {
      items {
        id
        manager
        committer
        status
        token
        amount
        maxPenaltyBps
        arbiter
        counterparty
        metadataURI
        metadataStatus
      }
    }
  }
`

function emptySummary(): AgentBondSummary {
  return { bonds: [], activeCount: 0, totalCount: 0, totalActiveByToken: new Map() }
}

function toBondRow(w: RawBondRow): AgentBondRow {
  return {
    id: BigInt(w.id),
    manager: w.manager as Address,
    status: w.status,
    token: w.token as Address,
    amount: BigInt(w.amount),
    maxPenaltyBps: w.maxPenaltyBps,
    arbiter: w.arbiter as Address,
    counterparty: w.counterparty as Address,
    metadataURI: w.metadataURI,
    metadataStatus: w.metadataStatus,
  }
}

async function fetchAgents(): Promise<IndexedAgent[]> {
  const rows = (await indexerGraphqlData<{ agents: { items: RawAgentRow[] } }>(AGENTS_QUERY)).agents.items

  // Bond join: one bulk query over the distinct owner set.
  const owners = Array.from(new Set(rows.map((r) => r.owner.toLowerCase())))
  const bondsByOwner = new Map<string, AgentBondRow[]>()
  const allBonds: AgentBondRow[] = []
  if (owners.length > 0) {
    const bonds = await indexerGraphqlData<{ commitments: { items: RawBondRow[] } }>(BONDS_QUERY, { owners })
    for (const w of bonds.commitments.items) {
      const key = w.committer.toLowerCase()
      const list = bondsByOwner.get(key) ?? []
      const row = toBondRow(w)
      list.push(row)
      allBonds.push(row)
      bondsByOwner.set(key, list)
    }
  }

  // Membership overlay: one bulk query over the bonds' commitment ids,
  // matched back on the (manager, commitmentId) pair (the membership PK).
  if (allBonds.length > 0) {
    const ids = Array.from(new Set(allBonds.map((b) => b.id.toString())))
    const memberships = await indexerGraphqlData<{ memberships: { items: RawMembershipRow[] } }>(
      MEMBERSHIPS_QUERY,
      { ids },
    )
    const mutualByKey = new Map<string, bigint>()
    for (const m of memberships.memberships.items) {
      mutualByKey.set(`${m.manager.toLowerCase()}-${m.commitmentId}`, BigInt(m.mutualId))
    }
    for (const b of allBonds) {
      const mutualId = mutualByKey.get(`${b.manager.toLowerCase()}-${b.id.toString()}`)
      if (mutualId !== undefined) b.mutualId = mutualId
    }
  }

  return rows.map((r): IndexedAgent => {
    const bonds = bondsByOwner.get(r.owner.toLowerCase()) ?? []
    const summary = emptySummary()
    summary.bonds = bonds
    summary.totalCount = bonds.length
    for (const b of bonds) {
      // 'active' + in-flight states still encumber the stake; terminal
      // states (released / forfeited / expired) don't back anything.
      const backing = b.status === 'active' || b.status === 'unbonding' || b.status === 'forfeitPending'
      if (!backing) continue
      summary.activeCount += 1
      const key = b.token.toLowerCase()
      const entry = summary.totalActiveByToken.get(key)
      if (entry) entry.total += b.amount
      else summary.totalActiveByToken.set(key, { token: b.token, total: b.amount })
    }
    return {
      agentId: BigInt(r.agentId),
      registry: r.registry as Address,
      owner: r.owner as Address,
      agentWallet: (r.agentWallet ?? null) as Address | null,
      agentURI: r.agentURI,
      metadataStatus: r.metadataStatus,
      metadataContent: r.metadataContent,
      registeredAt: BigInt(r.registeredAt),
      bonds: summary,
    }
  })
}

export function useAgentsIndexed(): UseAgentsIndexedReturn {
  const query = useQuery({ enabled: hasIndexer, queryKey: ['agents-indexed'], queryFn: fetchAgents })
  return {
    agents: query.isSuccess ? query.data : [],
    isLoading: query.isLoading,
    isReady: query.isSuccess,
    refetch: () => void query.refetch(),
  }
}
