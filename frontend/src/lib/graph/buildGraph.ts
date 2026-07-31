import { MultiDirectedGraph } from 'graphology'
import { DEFAULT_EDGE_CURVATURE, indexParallelEdgesIndex } from '@sigma/edge-curve'
import { formatUnits } from 'viem'
import { truncateAddress } from '../format'

import type {
  AgreementsGraphPayload,
  GraphEdge,
  GraphNode,
  MeshGraphPayload,
  MeshTopologyEdge,
  MeshTopologyNode,
  MeshTopologyPayload,
  OperatorsGraphNode,
  OperatorsGraphPayload,
} from './types'
import { getGraphPalette, nodeColorByType } from './palette'
import {
  colorForEdge,
  edgeSizeForConviction,
  nodeColorForValue,
  nodeSizeForValue,
  opacityForEdge,
  sizeMultiplierForEdge,
} from './style'

// Vault shares inherit USDC's 6 decimals plus the ERC-4626 decimals offset (9),
// so raw share amounts are scaled by 10^15. Commitment and stake-flow amounts
// are all denominated in shares, so this is the right unit for edge labels.
const SHARE_DECIMALS = 15

const COMPACT_FORMATTER = new Intl.NumberFormat('en-US', {
  notation: 'compact',
  maximumFractionDigits: 2,
})

function formatShares(amount: bigint): string {
  if (amount === 0n) return '0'
  const neg = amount < 0n
  const abs = neg ? -amount : amount
  const whole = Number(formatUnits(abs, SHARE_DECIMALS))
  const label = COMPACT_FORMATTER.format(whole)
  return neg ? `-${label}` : label
}

export type BuiltGraphNodeAttrs = {
  label: string
  x: number
  y: number
  size: number
  color: string
  // Raw data preserved for tooltips. Three distinct shapes:
  //   - GraphNode             (agreements / mesh-stake views)
  //   - OperatorsGraphNode    (operators-power view; carries `kind`)
  //   - MeshTopologyNode      (mesh topology view; carries `type` ∈ service/fan_in/...)
  data: GraphNode | OperatorsGraphNode | MeshTopologyNode
}

export type BuiltGraphEdgeAttrs = {
  label?: string
  size: number
  color: string
  type: 'arrow' | 'curved'
  curvature: number
  parallelIndex: number
  opacity: number
  // Topology edges carry `kind` ∈ {fan_in_provider, fan_out_outflow, service_binding};
  // commitment / mesh-stake edges use GraphEdge.
  data: GraphEdge | MeshTopologyEdge
}

export type BuiltGraph = MultiDirectedGraph<BuiltGraphNodeAttrs, BuiltGraphEdgeAttrs>

/**
 * Produce a sigma-ready graphology graph for the Agreements view.
 *
 * Pure function: identical input → identical output. Kept separate from the
 * React component so we can unit-test it without rendering.
 */
export function buildAgreementsGraph(payload: AgreementsGraphPayload): BuiltGraph {
  const g: BuiltGraph = new MultiDirectedGraph<BuiltGraphNodeAttrs, BuiltGraphEdgeAttrs>()
  // Resolve palette once per build and pass through to color helpers — avoids
  // 2N getComputedStyle calls on large graphs. applyPalette() will overwrite
  // these on theme change, so the snapshot is fine even across theme flips.
  const palette = getGraphPalette()

  let maxIncomingConviction = 0n
  for (const n of payload.nodes) {
    if (n.convictionIn > maxIncomingConviction) maxIncomingConviction = n.convictionIn
  }
  let maxEdgeConviction = 0n
  for (const e of payload.edges) {
    if (e.conviction > maxEdgeConviction) maxEdgeConviction = e.conviction
  }

  for (const n of payload.nodes) {
    const ratio =
      maxIncomingConviction === 0n
        ? 0
        : Number((n.convictionIn * 1000n) / maxIncomingConviction) / 1000
    g.addNode(n.id.toLowerCase(), {
      label: truncateAddress(n.id),
      x: Math.random(), // seeded by ForceAtlas2 below
      y: Math.random(),
      size: nodeSizeForValue(ratio),
      color: nodeColorForValue(ratio, palette),
      data: n,
    })
  }

  for (const e of payload.edges) {
    const from = e.from.toLowerCase()
    const to = e.to.toLowerCase()
    // Ensure endpoints exist (can happen if stats haven't caught up).
    if (!g.hasNode(from)) {
      g.addNode(from, emptyNodeAttrs(e.from, palette.nodes.fillDefault))
    }
    if (!g.hasNode(to)) {
      g.addNode(to, emptyNodeAttrs(e.to, palette.nodes.fillDefault))
    }
    // Commitment ids are per-manager, so `id` alone collides once a second
    // CommitmentManager is deployed. `${manager}-${id}` is the globally-unique
    // graphology key; fall back to the bare id when manager is absent
    // (synthetic edges / pre-multi-manager payloads) so single-manager
    // behavior is unchanged.
    const edgeKey = e.manager ? `${e.manager}-${e.id}` : e.id
    g.addEdgeWithKey(edgeKey, from, to, {
      label: formatShares(e.amount),
      size: edgeSizeForConviction(e.conviction, maxEdgeConviction) * sizeMultiplierForEdge(e),
      color: colorForEdge(e, palette),
      opacity: opacityForEdge(e),
      type: 'arrow', // may be upgraded to 'curved' below
      curvature: 0,
      parallelIndex: 0,
      data: e,
    })
  }

  // Curve parallel edges — agreement pairs are the main source, but this
  // also handles two depositor→counterparty commitments between the same
  // addresses.
  indexParallelEdgesIndex(g, {
    edgeIndexAttribute: 'parallelIndex',
    edgeMaxIndexAttribute: 'parallelMaxIndex',
  })
  g.forEachEdge((edge, attrs) => {
    const parallelMax = (attrs as { parallelMaxIndex?: number }).parallelMaxIndex ?? 0
    if (parallelMax > 0) {
      g.setEdgeAttribute(edge, 'type', 'curved')
      g.setEdgeAttribute(
        edge,
        'curvature',
        curvatureFor(attrs.parallelIndex, parallelMax)
      )
    }
  })

  return g
}

function curvatureFor(index: number, maxIndex: number): number {
  if (maxIndex <= 0) return 0
  if (index < 0) return -curvatureFor(-index, maxIndex)
  const amplitude = 3.5
  const maxCurvature = amplitude * (1 - Math.exp(-maxIndex / amplitude)) * DEFAULT_EDGE_CURVATURE
  return (maxCurvature * index) / maxIndex
}

function emptyNodeAttrs(id: string, color: string): BuiltGraphNodeAttrs {
  return {
    label: truncateAddress(id),
    x: Math.random(),
    y: Math.random(),
    size: 6,
    color,
    data: {
      id: id as `0x${string}`,
      commitmentsOut: 0,
      commitmentsIn: 0,
      convictionOut: 0n,
      convictionIn: 0n,
      activeCount: 0,
      forfeitedCount: 0,
      releasedCount: 0,
    },
  }
}


function bpsLabel(shareBps: number): string {
  if (shareBps <= 0) return '0%'
  const pct = shareBps / 100
  if (pct < 0.01) return '<0.01%'
  if (pct < 1) return `${pct.toFixed(2)}%`
  if (pct < 10) return `${pct.toFixed(1)}%`
  return `${Math.round(pct)}%`
}

/**
 * Operators-power graph — star topology: operator service in the center, each
 * operator is a spoke with edge thickness and node size proportional to its
 * voting-power share. Edges are emitted only for operators registered in the
 * stake registry (i.e. those actually contributing power to the service).
 */
export function buildOperatorsGraph(payload: OperatorsGraphPayload): BuiltGraph {
  const g: BuiltGraph = new MultiDirectedGraph<BuiltGraphNodeAttrs, BuiltGraphEdgeAttrs>()
  const palette = getGraphPalette()

  const total = payload.service.totalPower
  const ops = payload.operators
  const registeredCount = ops.filter((o) => o.registeredInService).length
  let maxPower = 0n
  for (const o of ops) if (o.votingPower > maxPower) maxPower = o.votingPower

  const serviceId = payload.service.address.toLowerCase()
  g.addNode(serviceId, {
    label: `service:${truncateAddress(payload.service.address)}`,
    // Random seed positions; the layout pass overwrites them — but giving a
    // deterministic (0,0) seed creates a degenerate ForceAtlas2 start state.
    x: Math.random(),
    y: Math.random(),
    size: 18,
    color: palette.edges.active,
    data: {
      kind: 'service',
      id: payload.service.address,
      totalPower: total,
      operatorCount: registeredCount,
    },
  })

  for (const op of ops) {
    const ratio =
      maxPower === 0n ? 0 : Number((op.votingPower * 1000n) / maxPower) / 1000
    const shareBps =
      total === 0n ? 0 : Number((op.votingPower * 10000n) / total)
    const isContributing = op.registeredInService && op.votingPower > 0n
    // Operators stay on a neutral grey palette (distinct from the orange
    // service node); voting-power variation is conveyed by node size and
    // edge thickness, not color, so the focal point reads cleanly. Faded
    // expired-commitment grey marks operators that aren't contributing.
    const baseColor = isContributing
      ? palette.nodes.operator
      : palette.edges.expired
    const opId = op.address.toLowerCase()
    if (opId === serviceId) continue // defensive: never add a self-loop
    g.addNode(opId, {
      label: truncateAddress(op.address),
      x: Math.random(),
      y: Math.random(),
      size: nodeSizeForValue(ratio),
      color: baseColor,
      data: {
        kind: 'operator',
        id: op.address,
        registeredInService: op.registeredInService,
        votingPower: op.votingPower,
        shareBps,
        status: op.status,
      },
    })
    if (isContributing) {
      g.addEdge(opId, serviceId, {
        label: bpsLabel(shareBps),
        size: edgeSizeForConviction(op.votingPower, maxPower),
        color: palette.edges.active,
        opacity: 0.85,
        type: 'arrow',
        curvature: 0,
        parallelIndex: 0,
        data: {
          id: `${opId}-power`,
          from: op.address,
          to: payload.service.address,
          amount: op.votingPower,
          maxPenaltyBps: 0,
          conviction: op.votingPower,
          status: 'active',
          forfeitPenaltyBps: null,
          forfeitChallengeEnd: null,
          agreementId: null,
          agreementSide: null,
          agreementStatus: null,
        },
      })
    }
  }

  return g
}

/**
 * Mesh graph — different topology (stake flow edges between addresses and
 * mesh node clones). Same builder philosophy.
 */
export function buildMeshGraph(payload: MeshGraphPayload): BuiltGraph {
  const g: BuiltGraph = new MultiDirectedGraph<BuiltGraphNodeAttrs, BuiltGraphEdgeAttrs>()
  const palette = getGraphPalette()

  let maxAmount = 0n
  for (const e of payload.edges) {
    if (e.amount > maxAmount) maxAmount = e.amount
  }

  // Layered seed positions so the DAG flow reads top-down even before
  // ForceAtlas2 disperses the cluster. TokenWeighting (sources) anchor at the
  // top, FanOut sits between sources and sinks, FanIn aggregates near the
  // bottom, addresses scatter on the outside.
  const layerY: Record<string, number> = {
    token_weighting: -1,
    fan_out: -0.3,
    fan_in: 0.4,
    address: 1,
  }
  const sizeByType: Record<string, number> = {
    token_weighting: 14,
    fan_out: 11,
    fan_in: 11,
    address: 6,
  }
  const labelByType: Record<string, string> = {
    token_weighting: 'TOKEN WEIGHTING',
    fan_out: 'FAN OUT',
    fan_in: 'FAN IN',
  }
  for (const n of payload.nodes) {
    const color = nodeColorByType(n.type, palette)
    const label =
      n.type === 'address'
        ? truncateAddress(n.id)
        : `${labelByType[n.type] ?? n.type} · ${truncateAddress(n.id)}`
    g.addNode(n.id.toLowerCase(), {
      label,
      x: (Math.random() - 0.5) * 1.5,
      y: (layerY[n.type] ?? 0) + (Math.random() - 0.5) * 0.4,
      size: sizeByType[n.type] ?? 8,
      color,
      data: {
        id: n.id,
        commitmentsOut: 0,
        commitmentsIn: 0,
        convictionOut: 0n,
        convictionIn: 0n,
        activeCount: 0,
        forfeitedCount: 0,
        releasedCount: 0,
      },
    })
  }

  for (const e of payload.edges) {
    const from = e.from.toLowerCase()
    const to = e.to.toLowerCase()
    if (!g.hasNode(from)) g.addNode(from, emptyNodeAttrs(e.from, palette.nodes.fillDefault))
    if (!g.hasNode(to)) g.addNode(to, emptyNodeAttrs(e.to, palette.nodes.fillDefault))
    g.addEdge(from, to, {
      label: formatShares(e.amount),
      size: edgeSizeForConviction(e.amount, maxAmount),
      color: palette.edges.released,
      opacity: 0.7,
      type: 'arrow',
      curvature: 0,
      parallelIndex: 0,
      data: {
        id: `${from}-${to}-${e.denom}`,
        from: e.from,
        to: e.to,
        amount: e.amount,
        maxPenaltyBps: 0,
        conviction: e.amount,
        status: 'active',
        forfeitPenaltyBps: null,
        forfeitChallengeEnd: null,
        agreementId: null,
        agreementSide: null,
        agreementStatus: null,
      },
    })
  }

  indexParallelEdgesIndex(g, {
    edgeIndexAttribute: 'parallelIndex',
    edgeMaxIndexAttribute: 'parallelMaxIndex',
  })
  g.forEachEdge((edge, attrs) => {
    const parallelMax = (attrs as { parallelMaxIndex?: number }).parallelMaxIndex ?? 0
    if (parallelMax > 0) {
      g.setEdgeAttribute(edge, 'type', 'curved')
      g.setEdgeAttribute(edge, 'curvature', curvatureFor(attrs.parallelIndex, parallelMax))
    }
  })

  return g
}

/**
 * Mesh-topology graph: contract-only DAG showing how the mesh is wired.
 *
 * Layered seed positions (TokenWeighting at the top → FanOut → FanIn →
 * service at the bottom) make the security flow read top-down even before
 * ForceAtlas2 disperses the cluster.
 *
 * Edge colors encode the kind of wiring:
 *   - fan_in_provider:   provider-into-FanIn — accent color (orange)
 *   - fan_out_outflow:   FanOut-to-consumer — released (mid-grey)
 *   - service_binding:   TokenWeighting → service — pending (amber tint)
 *
 * No operators/EOA addresses appear here; those live on the Operators tab.
 */
export function buildMeshTopologyGraph(payload: MeshTopologyPayload): BuiltGraph {
  const g: BuiltGraph = new MultiDirectedGraph<BuiltGraphNodeAttrs, BuiltGraphEdgeAttrs>()
  const palette = getGraphPalette()

  const layerY: Record<string, number> = {
    vault: -2,
    token_weighting: -1.2,
    fan_out: -0.4,
    fan_in: 0.4,
    service: 1.2,
  }
  const sizeByType: Record<string, number> = {
    vault: 16,
    token_weighting: 14,
    fan_out: 12,
    fan_in: 12,
    service: 16,
  }
  const labelByType: Record<string, string> = {
    vault: 'VAULT',
    token_weighting: 'TOKEN WEIGHTING',
    fan_out: 'FAN OUT',
    fan_in: 'FAN IN',
    service: 'SERVICE',
  }

  for (const n of payload.nodes) {
    const typeLabel = labelByType[n.type] ?? n.type.toUpperCase()
    // Vault nodes lead with the asset symbol so "USDC" / "WETH" reads at a
    // glance; the address is appended after for unambiguous identity.
    const baseLabel =
      n.type === 'vault' && n.symbol
        ? `${typeLabel} · ${n.symbol} · ${truncateAddress(n.id)}`
        : `${typeLabel} · ${truncateAddress(n.id)}`
    // For TokenWeighting, append a compact weight summary (e.g. "1.00× / 0.80×").
    const weightSuffix =
      n.type === 'token_weighting' && n.weights && n.weights.length > 0
        ? ` · ${n.weights
            .map((w) => `${(Number(w.weightBps) / 10_000).toFixed(2)}×`)
            .join(' / ')}`
        : ''
    g.addNode(n.id.toLowerCase(), {
      label: `${baseLabel}${weightSuffix}`,
      x: (Math.random() - 0.5) * 1.5,
      y: (layerY[n.type] ?? 0) + (Math.random() - 0.5) * 0.4,
      size: sizeByType[n.type] ?? 10,
      color:
        n.type === 'service'
          ? palette.edges.active
          : n.type === 'vault'
            ? palette.nodes.commitment
            : nodeColorByType(
                n.type as 'fan_in' | 'fan_out' | 'token_weighting',
                palette,
              ),
      data: n,
    })
  }

  // Pre-resolve edge colors per-kind (CSS-token-driven) so theme switches
  // re-resolve correctly through `applyPalette` (see palette.ts).
  const edgeColorByKind: Record<MeshTopologyEdge['kind'], string> = {
    fan_in_provider: palette.edges.active,
    fan_out_outflow: palette.edges.released,
    service_binding: palette.edges.pending,
    vault_source: palette.edges.active,
  }

  for (const e of payload.edges) {
    const from = e.from.toLowerCase()
    const to = e.to.toLowerCase()
    if (!g.hasNode(from) || !g.hasNode(to)) continue // skip edges to nodes outside the topology
    g.addEdge(from, to, {
      label: e.label,
      size: 2,
      color: edgeColorByKind[e.kind],
      opacity: 0.85,
      type: 'arrow',
      curvature: 0,
      parallelIndex: 0,
      data: e,
    })
  }

  // Curve parallel edges (e.g. multiple FanIn-provider entries between the
  // same two contracts on different denoms).
  indexParallelEdgesIndex(g, {
    edgeIndexAttribute: 'parallelIndex',
    edgeMaxIndexAttribute: 'parallelMaxIndex',
  })
  g.forEachEdge((edge, attrs) => {
    const parallelMax = (attrs as { parallelMaxIndex?: number }).parallelMaxIndex ?? 0
    if (parallelMax > 0) {
      g.setEdgeAttribute(edge, 'type', 'curved')
      g.setEdgeAttribute(edge, 'curvature', curvatureFor(attrs.parallelIndex, parallelMax))
    }
  })

  return g
}
