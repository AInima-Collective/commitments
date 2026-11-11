import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { type Address } from 'viem'
import { useChainId, useReadContract } from 'wagmi'
import { getContractAddresses } from '../config/contracts'
import { hasIndexer, indexerGraphqlData } from '../config/indexer'
import { operatorRegistryAbi } from '../generated'
import { type OperatorMetadataLite } from '../lib/operatorFilter'
import { deriveOperatorStatus, type OperatorInfo, type OperatorStatus } from '../lib/mesh'

interface OperatorWithStatus extends OperatorInfo {
  status: OperatorStatus
  belowMinStake: boolean
  /** Service tags from indexed metadataContent.services (Indexer Improvements #1). */
  services: string[]
  /** Profile name + services from verified metadata; null unless `metadataStatus` is ok. */
  metadata: OperatorMetadataLite | null
}

interface UseOperatorsIndexedReturn {
  operators: OperatorWithStatus[]
  isLoading: boolean
  /** True iff the indexer is configured AND the query succeeded. Callers should
   *  fall back to the on-chain `useOperators` hook when this is false. */
  isReady: boolean
  refetch: () => void
}

interface RawOperatorRow {
  address: string
  status: string
  selfStake: string
  selfStakeCommitmentId: string | null
  totalDelegatedStake: string
  activeDelegationCount: number
  services: string[] | null
  registeredBlock: string
  registeredAt: string
  metadataStatus: string | null
  metadataContent: Record<string, unknown> | null
}

const QUERY = /* GraphQL */ `
  query Operators {
    operators(limit: 1000) {
      items {
        address
        status
        selfStake
        selfStakeCommitmentId
        totalDelegatedStake
        activeDelegationCount
        services
        registeredBlock
        registeredAt
        metadataStatus
        metadataContent
      }
    }
  }
`

/**
 * `useOperatorsIndexed` — single-query operator list backed by the Ponder indexer.
 *
 * Replaces the per-row `getOperator` fan-out in `useOperators` (which issues
 * `O(N)` chain reads). The indexer mirrors `selfStake`, `totalDelegatedStake`,
 * `activeDelegationCount`, and `services` per Indexer Improvements #1, so one
 * GraphQL round-trip yields everything the operator list needs.
 *
 * Status mapping: indexer rows carry `status: 'registered' | 'deregistered'`
 * (a binary registry-state signal). We widen that to the frontend's
 * `OperatorStatus` enum (`ACTIVE / INACTIVE / BELOW_MIN_STAKE`) with the same
 * rule as `useOperators`: `BELOW_MIN_STAKE` compares the indexed
 * `totalDelegatedStake` against the registry's live `minOperatorStake`.
 *
 * Callers MUST gate on `isReady` to choose between this and the chain hook —
 * `isReady === false` means either the indexer is unconfigured or the query
 * failed, in which case the chain-read `useOperators` should be used instead.
 */
export function useOperatorsIndexed(): UseOperatorsIndexedReturn {
  const chainId = useChainId()
  const registry = getContractAddresses(chainId).operatorRegistry
  // The registry stores no below-minimum flag; derive it from the current threshold.
  const { data: minStake } = useReadContract({
    abi: operatorRegistryAbi,
    address: registry,
    functionName: 'minOperatorStake',
    query: { enabled: !!registry },
  })
  const query = useQuery({
    enabled: hasIndexer,
    queryKey: ['operators-indexed'],
    queryFn: async () =>
      (await indexerGraphqlData<{ operators: { items: RawOperatorRow[] } }>(QUERY)).operators.items,
  })
  const operators = useMemo(
    () => (query.isSuccess ? query.data.map((row) => toOperatorWithStatus(row, minStake)) : []),
    [query.isSuccess, query.data, minStake],
  )
  return {
    operators,
    isLoading: query.isLoading,
    isReady: query.isSuccess,
    refetch: () => void query.refetch(),
  }
}

function toOperatorWithStatus(row: RawOperatorRow, minStake: bigint | undefined): OperatorWithStatus {
  const info: OperatorInfo = {
    address: row.address as Address,
    active: row.status === 'registered',
    selfStake: BigInt(row.selfStake),
    selfStakeCommitmentId: row.selfStakeCommitmentId ? BigInt(row.selfStakeCommitmentId) : 0n,
    totalDelegatedStake: BigInt(row.totalDelegatedStake),
    activeDelegationCount: BigInt(row.activeDelegationCount),
    registeredAt: BigInt(row.registeredAt),
  }
  const status = deriveOperatorStatus(info, minStake)
  return {
    ...info,
    services: row.services ?? [],
    status,
    belowMinStake: status === 'BELOW_MIN_STAKE',
    metadata: toMetadataLite(row),
  }
}

function toMetadataLite(row: RawOperatorRow): OperatorMetadataLite | null {
  const c = row.metadataContent
  if (row.metadataStatus !== 'ok' || !c || typeof c !== 'object') return null
  return {
    name: typeof c.name === 'string' ? c.name : undefined,
    services: Array.isArray(c.services) ? c.services.filter((s): s is string => typeof s === 'string') : undefined,
  }
}
