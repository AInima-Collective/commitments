import { useEffect, useRef, useState } from 'react'
import { type Address } from 'viem'
import { hasIndexer, indexerGraphql } from '../config/indexer'
import { type OperatorInfo, type OperatorStatus } from '../utils/mesh'

interface OperatorWithStatus extends OperatorInfo {
  status: OperatorStatus
  belowMinStake: boolean
  /** Service tags from indexed metadataContent.services (Indexer Improvements #1). */
  services: string[]
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
 * (a binary registry-state signal) — we widen that to the frontend's
 * `OperatorStatus` enum (`ACTIVE / INACTIVE / BELOW_MIN_STAKE`) using the same
 * derivation rule as `useOperators` (no min-stake input → `BELOW_MIN_STAKE` is
 * unreachable here; the on-chain fallback is the canonical source for that bit).
 *
 * Callers MUST gate on `isReady` to choose between this and the chain hook —
 * `isReady === false` means either the indexer is unconfigured or the query
 * failed, in which case the chain-read `useOperators` should be used instead.
 */
export function useOperatorsIndexed(): UseOperatorsIndexedReturn {
  const [state, setState] = useState<{
    operators: OperatorWithStatus[]
    isLoading: boolean
    isReady: boolean
  }>({ operators: [], isLoading: hasIndexer, isReady: false })
  const [tick, setTick] = useState(0)
  const requestIdRef = useRef(0)

  useEffect(() => {
    if (!hasIndexer) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- external subscription reset on indexer flag flip
      setState({ operators: [], isLoading: false, isReady: false })
      return
    }
    const reqId = ++requestIdRef.current
    setState((s) => ({ ...s, isLoading: true }))
    indexerGraphql<{ operators: { items: RawOperatorRow[] } }>(QUERY)
      .then((res) => {
        if (reqId !== requestIdRef.current) return
        if (res.errors && res.errors.length > 0) {
          setState({ operators: [], isLoading: false, isReady: false })
          return
        }
        const rows = res.data?.operators.items ?? []
        const operators = rows.map(toOperatorWithStatus)
        setState({ operators, isLoading: false, isReady: true })
      })
      .catch(() => {
        if (reqId !== requestIdRef.current) return
        setState({ operators: [], isLoading: false, isReady: false })
      })
  }, [tick])

  function refetch() {
    setTick((t) => t + 1)
  }

  return { ...state, refetch }
}

function toOperatorWithStatus(row: RawOperatorRow): OperatorWithStatus {
  const active = row.status === 'registered'
  return {
    address: row.address as Address,
    active,
    selfStake: BigInt(row.selfStake),
    selfStakeCommitmentId: row.selfStakeCommitmentId ? BigInt(row.selfStakeCommitmentId) : 0n,
    totalDelegatedStake: BigInt(row.totalDelegatedStake),
    activeDelegationCount: BigInt(row.activeDelegationCount),
    registeredAt: BigInt(row.registeredAt),
    services: row.services ?? [],
    status: active ? 'ACTIVE' : 'INACTIVE',
    belowMinStake: false,
  }
}
