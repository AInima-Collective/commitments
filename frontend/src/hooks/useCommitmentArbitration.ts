import { useQuery } from '@tanstack/react-query'
import { type Address } from 'viem'

import { hasIndexer, indexerJson } from '../config/indexer'
import { POLL } from './polling'

export type ManagerForfeitEventKind = 'initiated' | 'executed' | 'cancelled' | 'cancelledStale'

interface ArbitrationEventWire {
  kind: ManagerForfeitEventKind
  timestamp: string
  blockNumber: string
  logIndex: number
  transactionHash: string
  penaltyBps: number | null
  challengeWindow: string | null
  nominalExecutionAt: string | null
  proposalInitiatedAt: string
  unitsForfeited: string | null
  counterparty: string | null
  committer: string
  arbiter: string
}

interface ArbitrationPageWire {
  manager: string
  commitmentId: string
  summary: {
    status: string
    proposalStatus: string
    terminalOutcome: ManagerForfeitEventKind | null
    currentPenaltyBps: number | null
    proposalInitiatedAt: string | null
    nominalExecutionAt: string | null
    pauseAdjustedExecutionAt: null
    readiness: 'live-manager-state-required'
    amount: string
    token: string
    committer: string
    counterparty: string
    arbiter: string
  }
  events: ArbitrationEventWire[]
  page: { nextCursor: string | null }
}

interface MechanismEventWire {
  source: 'arbiter mechanism'
  mechanism: string
  arbiter: string
  caseId: string
  commitmentId: string | null
  manager: string | null
  kind: string
  actor: string | null
  phase: string
  deadline: string | null
  outcome: string | null
  timestamp: string
  blockNumber: string
  logIndex: number
  transactionHash: string
}

interface MechanismActivityPageWire {
  events: MechanismEventWire[]
  page: { limit: number; offset: number; total: number; nextOffset: number | null }
}

export interface ManagerForfeitEvent {
  kind: ManagerForfeitEventKind
  timestamp: bigint
  blockNumber: bigint
  logIndex: number
  transactionHash: `0x${string}`
  penaltyBps: number | null
  challengeWindow: bigint | null
  /** Event-time nominal end; never presented as current executable readiness. */
  nominalExecutionAt: bigint | null
  proposalInitiatedAt: bigint
  unitsForfeited: bigint | null
  counterparty: Address | null
  committer: Address
  arbiter: Address
}

export interface MechanismArbitrationEvent {
  source: 'arbiter mechanism'
  mechanism: string
  arbiter: Address
  caseId: bigint
  commitmentId: bigint | null
  manager: Address | null
  kind: string
  actor: Address | null
  phase: string
  deadline: bigint | null
  outcome: string | null
  timestamp: bigint
  blockNumber: bigint
  logIndex: number
  transactionHash: `0x${string}`
}

export interface CommitmentArbitrationHistory {
  manager: Address
  commitmentId: bigint
  summary: ArbitrationPageWire['summary']
  events: ManagerForfeitEvent[]
  mechanismEvents: MechanismArbitrationEvent[]
}

export function parseManagerForfeitEvent(event: ArbitrationEventWire): ManagerForfeitEvent {
  return {
    kind: event.kind,
    timestamp: BigInt(event.timestamp),
    blockNumber: BigInt(event.blockNumber),
    logIndex: event.logIndex,
    transactionHash: event.transactionHash as `0x${string}`,
    penaltyBps: event.penaltyBps,
    challengeWindow: event.challengeWindow === null ? null : BigInt(event.challengeWindow),
    nominalExecutionAt:
      event.nominalExecutionAt === null ? null : BigInt(event.nominalExecutionAt),
    proposalInitiatedAt: BigInt(event.proposalInitiatedAt),
    unitsForfeited: event.unitsForfeited === null ? null : BigInt(event.unitsForfeited),
    counterparty: event.counterparty as Address | null,
    committer: event.committer as Address,
    arbiter: event.arbiter as Address,
  }
}

export function parseMechanismArbitrationEvent(event: MechanismEventWire): MechanismArbitrationEvent {
  return {
    source: event.source,
    mechanism: event.mechanism,
    arbiter: event.arbiter as Address,
    caseId: BigInt(event.caseId),
    commitmentId: event.commitmentId === null ? null : BigInt(event.commitmentId),
    manager: event.manager as Address | null,
    kind: event.kind,
    actor: event.actor as Address | null,
    phase: event.phase,
    deadline: event.deadline === null ? null : BigInt(event.deadline),
    outcome: event.outcome,
    timestamp: BigInt(event.timestamp),
    blockNumber: BigInt(event.blockNumber),
    logIndex: event.logIndex,
    transactionHash: event.transactionHash as `0x${string}`,
  }
}

async function fetchCompleteMechanismHistory(
  commitmentId: bigint,
  manager: Address,
): Promise<MechanismArbitrationEvent[]> {
  let offset = 0
  let hasMore = true
  const events: MechanismArbitrationEvent[] = []
  const seenOffsets = new Set<number>()
  while (hasMore) {
    const params = new URLSearchParams({
      manager: manager.toLowerCase(),
      commitmentId: commitmentId.toString(),
      limit: '100',
      offset: String(offset),
    })
    const page = await indexerJson<MechanismActivityPageWire>(`/protocol/mechanism-activity?${params.toString()}`)
    events.push(...page.events.map(parseMechanismArbitrationEvent))
    if (page.page.nextOffset === null) {
      hasMore = false
      continue
    }
    if (seenOffsets.has(page.page.nextOffset)) {
      throw new Error('Indexer returned a repeated mechanism activity offset')
    }
    seenOffsets.add(page.page.nextOffset)
    offset = page.page.nextOffset
  }
  return events
}

/** Fetch every page so the commitment panel is an audit trail, not a recent sample. */
async function fetchCompleteHistory(
  commitmentId: bigint,
  manager: Address,
): Promise<CommitmentArbitrationHistory> {
  let cursor: string | null = null
  let first: ArbitrationPageWire | undefined
  const events: ManagerForfeitEvent[] = []
  const seenCursors = new Set<string>()
  do {
    const params = new URLSearchParams({ manager: manager.toLowerCase(), limit: '100' })
    if (cursor) params.set('cursor', cursor)
    const page = await indexerJson<ArbitrationPageWire>(
      `/commitments/${commitmentId.toString()}/arbitration?${params.toString()}`,
    )
    first ??= page
    events.push(...page.events.map(parseManagerForfeitEvent))
    cursor = page.page.nextCursor
    if (cursor) {
      if (seenCursors.has(cursor)) throw new Error('Indexer returned a repeated arbitration cursor')
      seenCursors.add(cursor)
    }
  } while (cursor)

  if (!first) throw new Error('Indexer returned no arbitration page')
  const mechanismEvents = await fetchCompleteMechanismHistory(commitmentId, manager)
  return {
    manager: first.manager as Address,
    commitmentId: BigInt(first.commitmentId),
    summary: first.summary,
    events,
    mechanismEvents,
  }
}

export function useCommitmentArbitration(
  commitmentId: bigint | undefined,
  manager: Address | undefined,
): {
  data: CommitmentArbitrationHistory | undefined
  isLoading: boolean
  error: Error | null
  indexerOnline: boolean
  refetch: () => void
} {
  const query = useQuery({
    enabled: hasIndexer && commitmentId !== undefined && Boolean(manager),
    queryKey: ['commitment-arbitration', manager?.toLowerCase(), commitmentId?.toString()],
    queryFn: () => fetchCompleteHistory(commitmentId!, manager!),
    refetchInterval: POLL.slow,
  })
  return {
    data: query.data,
    isLoading: query.isLoading,
    error: query.error as Error | null,
    indexerOnline: hasIndexer,
    refetch: () => void query.refetch(),
  }
}
