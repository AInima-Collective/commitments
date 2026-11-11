import { useQuery } from '@tanstack/react-query'
import { type Address } from 'viem'

import { hasIndexer, indexerJson } from '../config/indexer'
import { type CommitmentRowWire } from '../lib/indexerRows'
import { POLL } from './polling'
import {
  parseManagerForfeitEvent,
  parseMechanismArbitrationEvent,
  type ManagerForfeitEvent,
  type MechanismArbitrationEvent,
} from './useCommitmentArbitration'

type ActivityWire = Parameters<typeof parseManagerForfeitEvent>[0] & {
  manager: string
  commitmentId: string
}

export interface ArbiterOverviewCommitment {
  id: bigint
  manager: Address
  token: Address
  amount: bigint
  status: string
  committer: Address
  counterparty: Address
}

export interface ArbiterActivityEvent extends ManagerForfeitEvent {
  manager: Address
  commitmentId: bigint
}

export function useArbiterOverview(address: Address | undefined, options: {
  limit?: number
  offset?: number
  status?: 'active' | 'unbonding' | 'forfeitPending' | 'forfeited' | 'released' | 'expired'
} = {}): {
  commitments: ArbiterOverviewCommitment[]
  activity: ArbiterActivityEvent[]
  mechanismActivity: MechanismArbitrationEvent[]
  isLoading: boolean
  error: Error | null
  indexerOnline: boolean
  page: { limit: number; offset: number; nextOffset: number | null }
  counts: { needsAction: number; openProposals: number; active: number; other: number; total: number }
} {
  const { limit = 25, offset = 0, status } = options
  const query = useQuery({
    enabled: hasIndexer && Boolean(address),
    queryKey: ['public-arbiter-overview', address?.toLowerCase(), limit, offset, status ?? null],
    queryFn: async () => {
      const arbiter = address!.toLowerCase()
      const commitmentParams = new URLSearchParams({
        arbiter,
        limit: String(limit),
        offset: String(offset),
      })
      if (status) commitmentParams.set('status', status)
      const [commitmentPayload, activityPayload, mechanismPayload] = await Promise.all([
        indexerJson<{
          rows: CommitmentRowWire[]
          counts: { needsAction: number; openProposals: number; active: number; other: number; total: number }
          page: { limit: number; offset: number; nextOffset: number | null }
        }>(`/commitments/urgent?${commitmentParams.toString()}`),
        indexerJson<{ events: ActivityWire[] }>(`/commitments/arbitration/activity?arbiter=${arbiter}&limit=50`),
        indexerJson<{ events: Parameters<typeof parseMechanismArbitrationEvent>[0][] }>(
          `/protocol/mechanism-activity?arbiter=${arbiter}&limit=50`,
        ),
      ])
      return {
        commitments: commitmentPayload.rows.map((row) => ({
          id: BigInt(row.id),
          manager: row.manager as Address,
          token: row.token as Address,
          amount: BigInt(row.amount),
          status: row.status,
          committer: row.committer as Address,
          counterparty: row.counterparty as Address,
        })),
        activity: activityPayload.events.map((event) => ({
          ...parseManagerForfeitEvent(event),
          manager: event.manager as Address,
          commitmentId: BigInt(event.commitmentId),
        })),
        mechanismActivity: mechanismPayload.events.map(parseMechanismArbitrationEvent),
        counts: commitmentPayload.counts,
        page: commitmentPayload.page,
      }
    },
    refetchInterval: POLL.slow,
  })
  return {
    commitments: query.data?.commitments ?? [],
    activity: query.data?.activity ?? [],
    mechanismActivity: query.data?.mechanismActivity ?? [],
    isLoading: query.isLoading,
    error: query.error as Error | null,
    indexerOnline: hasIndexer,
    counts: query.data?.counts ?? { needsAction: 0, openProposals: 0, active: 0, other: 0, total: 0 },
    page: query.data?.page ?? { limit, offset, nextOffset: null },
  }
}
