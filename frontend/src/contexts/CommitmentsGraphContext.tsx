import { useQuery } from '@tanstack/react-query'
import { type ReactNode } from 'react'
import type { Hex } from 'viem'

import { indexerFetch, hasIndexer } from '../config/indexer'
import type {
  AgreementsGraphPayload,
  GraphEdge,
  GraphNode,
  MeshGraphEdge,
  MeshGraphNode,
  MeshGraphPayload,
} from '../lib/graph/types'
import { GraphContext } from './commitmentsGraphContextValue'

type AgreementsRaw = {
  nodes: Array<{
    id: string
    commitmentsOut: number
    commitmentsIn: number
    convictionOut: string
    convictionIn: string
    activeCount: number
    forfeitedCount: number
    releasedCount: number
  }>
  edges: Array<{
    id: string
    manager: string | null
    from: string
    to: string
    amount: string
    maxPenaltyBps: number
    conviction: string
    status: GraphEdge['status']
    forfeitPenaltyBps: number | null
    forfeitChallengeEnd: string | null
    agreementId: string | null
    agreementSide: 'A' | 'B' | null
    agreementStatus: string | null
  }>
}

type MeshRaw = {
  nodes: Array<{ id: string; type: MeshGraphNode['type']; impl: string | null }>
  edges: Array<{ from: string; to: string; denom: string; amount: string }>
}

function parseAgreements(raw: AgreementsRaw): AgreementsGraphPayload {
  const nodes: GraphNode[] = raw.nodes.map((n) => ({
    id: n.id as Hex,
    commitmentsOut: n.commitmentsOut,
    commitmentsIn: n.commitmentsIn,
    convictionOut: BigInt(n.convictionOut),
    convictionIn: BigInt(n.convictionIn),
    activeCount: n.activeCount,
    forfeitedCount: n.forfeitedCount,
    releasedCount: n.releasedCount,
  }))
  const edges: GraphEdge[] = raw.edges.map((e) => ({
    id: e.id,
    manager: e.manager ? (e.manager as Hex) : undefined,
    from: e.from as Hex,
    to: e.to as Hex,
    amount: BigInt(e.amount),
    maxPenaltyBps: e.maxPenaltyBps,
    conviction: BigInt(e.conviction),
    status: e.status,
    forfeitPenaltyBps: e.forfeitPenaltyBps,
    forfeitChallengeEnd: e.forfeitChallengeEnd ? BigInt(e.forfeitChallengeEnd) : null,
    agreementId: e.agreementId,
    agreementSide: e.agreementSide,
    agreementStatus: e.agreementStatus,
  }))
  return { nodes, edges }
}

function parseMesh(raw: MeshRaw): MeshGraphPayload {
  const nodes: MeshGraphNode[] = raw.nodes.map((n) => ({
    id: n.id as Hex,
    type: n.type,
    impl: (n.impl ?? null) as Hex | null,
  }))
  const edges: MeshGraphEdge[] = raw.edges.map((e) => ({
    from: e.from as Hex,
    to: e.to as Hex,
    denom: e.denom as Hex,
    amount: BigInt(e.amount),
  }))
  return { nodes, edges }
}

export function CommitmentsGraphProvider({
  address,
  children,
}: {
  address?: Hex
  children: ReactNode
}) {
  const agreements = useQuery({
    enabled: hasIndexer,
    queryKey: ['graph', 'agreements', address ?? null],
    queryFn: async () => {
      const res = await indexerFetch(
        `/graph/agreements${address ? `?address=${address}` : ''}`
      )
      if (!res.ok) throw new Error(`Indexer error: ${res.status}`)
      return parseAgreements((await res.json()) as AgreementsRaw)
    },
    refetchInterval: 10_000,
  })

  const mesh = useQuery({
    enabled: hasIndexer,
    queryKey: ['graph', 'mesh'],
    queryFn: async () => {
      const res = await indexerFetch('/graph/mesh')
      if (!res.ok) throw new Error(`Indexer error: ${res.status}`)
      return parseMesh((await res.json()) as MeshRaw)
    },
    refetchInterval: 10_000,
  })

  return (
    <GraphContext.Provider
      value={{
        agreements: {
          data: agreements.data,
          isLoading: agreements.isLoading,
          error: agreements.error,
        },
        mesh: { data: mesh.data, isLoading: mesh.isLoading, error: mesh.error },
        hasIndexer,
      }}
    >
      {children}
    </GraphContext.Provider>
  )
}
