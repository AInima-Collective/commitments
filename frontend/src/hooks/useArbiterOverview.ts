import { useQuery } from '@tanstack/react-query'
import { type Address } from 'viem'

import { hasIndexer, indexerFetch } from '../config/indexer'
import { parseManagerForfeitEvent, type ManagerForfeitEvent } from './useCommitmentArbitration'

interface CommitmentWire {
  id: string
  manager: string
  token: string
  amount: string
  status: string
  committer: string
  counterparty: string
}

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

export function useArbiterOverview(address: Address | undefined): {
  commitments: ArbiterOverviewCommitment[]
  activity: ArbiterActivityEvent[]
  isLoading: boolean
  error: Error | null
  indexerOnline: boolean
} {
  const query = useQuery({
    enabled: hasIndexer && Boolean(address),
    queryKey: ['public-arbiter-overview', address?.toLowerCase()],
    queryFn: async () => {
      const arbiter = address!.toLowerCase()
      const [commitmentsResponse, activityResponse] = await Promise.all([
        indexerFetch(`/commitments/urgent?arbiter=${arbiter}&limit=500`),
        indexerFetch(`/commitments/arbitration/activity?arbiter=${arbiter}&limit=50`),
      ])
      if (!commitmentsResponse.ok) {
        throw new Error(`Commitments indexer error: ${commitmentsResponse.status}`)
      }
      if (!activityResponse.ok) {
        throw new Error(`Arbitration activity error: ${activityResponse.status}`)
      }
      const commitmentPayload = (await commitmentsResponse.json()) as { rows: CommitmentWire[] }
      const activityPayload = (await activityResponse.json()) as { events: ActivityWire[] }
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
      }
    },
    refetchInterval: 30_000,
  })
  return {
    commitments: query.data?.commitments ?? [],
    activity: query.data?.activity ?? [],
    isLoading: query.isLoading,
    error: query.error as Error | null,
    indexerOnline: hasIndexer,
  }
}
