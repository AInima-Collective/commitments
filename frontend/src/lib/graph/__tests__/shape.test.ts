import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { buildAgreementsGraph, buildMeshGraph } from '../buildGraph'
import { agreementEdgeColor, lifecycleEdgeColor } from '../palette'
import type {
  AgreementsGraphPayload,
  GraphEdge,
  GraphNode,
  MeshGraphPayload,
} from '../types'

// shape tests assert resolved colors flow from the palette through buildGraph,
// so we need to inject a deterministic palette into jsdom <:root> for the run.
function injectPaletteTokens() {
  let style = document.getElementById('__shape_test_tokens') as HTMLStyleElement | null
  if (!style) {
    style = document.createElement('style')
    style.id = '__shape_test_tokens'
    document.head.appendChild(style)
  }
  style.textContent = `:root {
    --graph-edge-active:#c2410c;
    --graph-edge-forfeited:#b91c1c;
    --graph-edge-released:#52525b;
    --graph-edge-pending:#a16207;
    --graph-edge-expired:#c8c8c4;
    --graph-edge-agreement-active:#c2410c;
    --graph-edge-agreement-forfeited:#b91c1c;
    --graph-edge-agreement-released:#52525b;
    --graph-node-fan-in:#ebebe8;
    --graph-node-fan-out:#ebebe8;
    --graph-node-token-weighting:#ebebe8;
    --graph-node-operator:#f4f4f2;
    --graph-node-commitment:#f4f4f2;
    --graph-node-address:#f4f4f2;
    --graph-node-fill-default:#f4f4f2;
    --graph-node-stroke-default:#e6e6e3;
    --graph-node-stroke-selected:#c2410c;
    --graph-node-stroke-hover:#c2410c;
    --graph-label-default:#18181b;
    --graph-label-hover:#c2410c;
    --graph-label-edge-default:#52525b;
    --graph-dim-bg:#ebebe8;
  }`
}
beforeEach(() => injectPaletteTokens())
afterEach(() => {
  const style = document.getElementById('__shape_test_tokens')
  if (style) style.remove()
})

const A = '0x00000000000000000000000000000000000000aa' as const
const B = '0x00000000000000000000000000000000000000bb' as const
const C = '0x00000000000000000000000000000000000000cc' as const
const D = '0x00000000000000000000000000000000000000dd' as const

function node(id: `0x${string}`, overrides: Partial<GraphNode> = {}): GraphNode {
  return {
    id,
    commitmentsOut: 0,
    commitmentsIn: 0,
    convictionOut: 0n,
    convictionIn: 0n,
    activeCount: 0,
    forfeitedCount: 0,
    releasedCount: 0,
    ...overrides,
  }
}

function edge(
  id: string,
  from: `0x${string}`,
  to: `0x${string}`,
  overrides: Partial<GraphEdge> = {}
): GraphEdge {
  return {
    id,
    from,
    to,
    amount: 1000n,
    maxPenaltyBps: 5000,
    conviction: 500n,
    status: 'active',
    forfeitPenaltyBps: null,
    forfeitChallengeEnd: null,
    agreementId: null,
    agreementSide: null,
    agreementStatus: null,
    ...overrides,
  }
}

describe('buildAgreementsGraph', () => {
  it('creates one node per participating address and one edge per commitment', () => {
    const payload: AgreementsGraphPayload = {
      nodes: [node(A), node(B), node(C), node(D)],
      edges: [
        edge('1', A, B),
        edge('2', B, C),
        edge('3', C, D),
        edge('4', A, C),
        edge('5', B, D),
      ],
    }
    const g = buildAgreementsGraph(payload)
    expect(g.order).toBe(4)
    expect(g.size).toBe(5)
  })

  it('colors edges by lifecycle status', () => {
    const payload: AgreementsGraphPayload = {
      nodes: [node(A), node(B), node(C)],
      edges: [
        edge('active', A, B, { status: 'active' }),
        edge('pending', A, C, { status: 'forfeitPending' }),
        edge('forfeited', B, C, { status: 'forfeited' }),
      ],
    }
    const g = buildAgreementsGraph(payload)
    expect(g.getEdgeAttribute('active', 'color')).toBe(lifecycleEdgeColor('active'))
    expect(g.getEdgeAttribute('pending', 'color')).toBe(lifecycleEdgeColor('forfeitPending'))
    expect(g.getEdgeAttribute('forfeited', 'color')).toBe(lifecycleEdgeColor('forfeited'))
  })

  it('agreed pairs render with the bonded palette and thicker stroke', () => {
    const payload: AgreementsGraphPayload = {
      nodes: [node(A), node(B), node(C)],
      edges: [
        edge('solo', A, C, { status: 'active' }),
        edge('ent-A', A, B, {
          agreementId: '7',
          agreementSide: 'A',
          agreementStatus: 'active',
        }),
        edge('ent-B', B, A, {
          agreementId: '7',
          agreementSide: 'B',
          agreementStatus: 'active',
        }),
      ],
    }
    const g = buildAgreementsGraph(payload)
    // Agreed edges use the bonded palette, solo stays on the lifecycle palette.
    expect(g.getEdgeAttribute('solo', 'color')).toBe(lifecycleEdgeColor('active'))
    expect(g.getEdgeAttribute('ent-A', 'color')).toBe(agreementEdgeColor('active'))
    expect(g.getEdgeAttribute('ent-B', 'color')).toBe(agreementEdgeColor('active'))
    // Agreed edges are visibly thicker than the solo edge so the pair reads
    // as a bonded unit at a glance.
    const soloSize = g.getEdgeAttribute('solo', 'size') as number
    const entSize = g.getEdgeAttribute('ent-A', 'size') as number
    expect(entSize).toBeGreaterThan(soloSize)
  })

  it('partial-forfeit shows the forfeited side in red and the intact side in cyan', () => {
    const payload: AgreementsGraphPayload = {
      nodes: [node(A), node(B)],
      edges: [
        edge('sideA', A, B, {
          agreementId: '1',
          agreementSide: 'A',
          agreementStatus: 'partialForfeitA',
        }),
        edge('sideB', B, A, {
          agreementId: '1',
          agreementSide: 'B',
          agreementStatus: 'partialForfeitA',
        }),
      ],
    }
    const g = buildAgreementsGraph(payload)
    expect(g.getEdgeAttribute('sideA', 'color')).toBe(lifecycleEdgeColor('forfeited'))
    expect(g.getEdgeAttribute('sideB', 'color')).toBe(agreementEdgeColor('active'))
  })

  it('curves parallel agreed edges so they render side-by-side', () => {
    const payload: AgreementsGraphPayload = {
      nodes: [node(A), node(B)],
      edges: [
        edge('A-side', A, B, {
          agreementId: '42',
          agreementSide: 'A',
          agreementStatus: 'active',
        }),
        edge('B-side', A, B, {
          agreementId: '42',
          agreementSide: 'B',
          agreementStatus: 'active',
        }),
      ],
    }
    const g = buildAgreementsGraph(payload)
    const aType = g.getEdgeAttribute('A-side', 'type')
    const bType = g.getEdgeAttribute('B-side', 'type')
    expect(aType).toBe('curved')
    expect(bType).toBe('curved')
    // Parallel indices must differ so the curves don't overlap.
    expect(g.getEdgeAttribute('A-side', 'parallelIndex')).not.toBe(
      g.getEdgeAttribute('B-side', 'parallelIndex')
    )
  })

  it('creates a node implicitly for any edge endpoint missing from nodes[]', () => {
    const payload: AgreementsGraphPayload = {
      nodes: [node(A)],
      edges: [edge('1', A, B)],
    }
    const g = buildAgreementsGraph(payload)
    expect(g.hasNode(A.toLowerCase())).toBe(true)
    expect(g.hasNode(B.toLowerCase())).toBe(true)
    expect(g.order).toBe(2)
  })

  it('5 commitments + 2 agreements → 7 nodes + 5 edges with 2 curved', () => {
    const E = '0x00000000000000000000000000000000000000ee' as const
    const F = '0x00000000000000000000000000000000000000ff' as const
    const G = '0x0000000000000000000000000000000000000011' as const
    const payload: AgreementsGraphPayload = {
      nodes: [node(A), node(B), node(C), node(D), node(E), node(F), node(G)],
      edges: [
        edge('1', A, B),
        edge('2', A, B, { agreementId: '1', agreementSide: 'A' }),
        edge('3', B, A, { agreementId: '1', agreementSide: 'B' }),
        edge('4', C, D),
        edge('5', E, F),
      ],
    }
    const g = buildAgreementsGraph(payload)
    // buildGraph adds every node in payload.nodes, so all 7 participants are present.
    expect(g.hasNode(G.toLowerCase())).toBe(true)
    expect(g.order).toBe(7)
    expect(g.size).toBe(5)
    const curvedEdges: string[] = []
    g.forEachEdge((edgeKey, attrs) => {
      if (attrs.type === 'curved') curvedEdges.push(edgeKey)
    })
    // Edges 1+2+3 are all between A<->B: 1 is A->B, 2 is A->B, 3 is B->A.
    // indexParallelEdgesIndex considers A->B and A->B as parallel; A->B and B->A as reverse parallels.
    // Expect at least edges 2 and 3 curved; edge 1 may also be curved since it's parallel to 2.
    expect(curvedEdges.length).toBeGreaterThanOrEqual(2)
  })

  it('namespaces edge keys by manager so per-manager commitment ids do not collide', () => {
    // Each CommitmentManager numbers its commitments from 0, so two managers
    // both have a commitment "0". A bare id as the graphology key makes
    // addEdgeWithKey throw on the duplicate; the (manager, id) key keeps them
    // distinct.
    const M1 = '0x0000000000000000000000000000000000000001' as const
    const M2 = '0x0000000000000000000000000000000000000002' as const
    const payload: AgreementsGraphPayload = {
      nodes: [node(A), node(B), node(C)],
      edges: [
        edge('0', A, B, { manager: M1 }),
        edge('0', B, C, { manager: M2 }),
      ],
    }
    const g = buildAgreementsGraph(payload)
    expect(g.size).toBe(2)
  })
})

describe('buildMeshGraph', () => {
  it('colors mesh-implementation nodes from the shared mesh token and addresses from the address token', () => {
    // Per 27-01 palette design, all mesh-implementation node types
    // (fan_in / fan_out / token_weighting) resolve to the same shared mesh
    // surface token, while `address` resolves to a distinct token. The mesh
    // tokens are intentionally collapsed: visual disambiguation comes from
    // the type-prefixed label, NOT the fill color. Plan 27-02 expanded the
    // palette mapping to source these from `nodeColorByType()`.
    const payload: MeshGraphPayload = {
      nodes: [
        { id: A, type: 'fan_in', impl: null },
        { id: B, type: 'fan_out', impl: null },
        { id: C, type: 'token_weighting', impl: null },
        { id: D, type: 'address', impl: null },
      ],
      edges: [],
    }
    const g = buildMeshGraph(payload)
    const colorByNode = new Map<string, string>()
    g.forEachNode((id, attrs) => colorByNode.set(id, attrs.color))
    // Mesh-implementation types share one token.
    expect(colorByNode.get(A.toLowerCase())).toBe(colorByNode.get(B.toLowerCase()))
    expect(colorByNode.get(B.toLowerCase())).toBe(colorByNode.get(C.toLowerCase()))
    // address resolves to a different token from mesh-implementation nodes.
    expect(colorByNode.get(D.toLowerCase())).not.toBe(colorByNode.get(A.toLowerCase()))
    // Resolve to two distinct color buckets total.
    const distinct = new Set(colorByNode.values())
    expect(distinct.size).toBe(2)
  })

  it('stake flows render as directed edges with non-zero size when amount > 0', () => {
    const payload: MeshGraphPayload = {
      nodes: [
        { id: A, type: 'address', impl: null },
        { id: B, type: 'fan_in', impl: null },
      ],
      edges: [{ from: A, to: B, denom: '0x00', amount: 1000n }],
    }
    const g = buildMeshGraph(payload)
    expect(g.size).toBe(1)
    const [only] = g.edges()
    expect(g.source(only)).toBe(A.toLowerCase())
    expect(g.target(only)).toBe(B.toLowerCase())
    expect(g.getEdgeAttribute(only, 'size')).toBeGreaterThan(0)
  })

  it('labels stake flow edges with a human-readable share amount', () => {
    // 3e18 raw units at 15 decimals (USDC 6 + decimalsOffset 9) = 3,000 shares
    const payload: MeshGraphPayload = {
      nodes: [
        { id: A, type: 'address', impl: null },
        { id: B, type: 'token_weighting', impl: null },
      ],
      edges: [{ from: A, to: B, denom: '0x00', amount: 3_000_000_000_000_000_000n }],
    }
    const g = buildMeshGraph(payload)
    const [only] = g.edges()
    const label = g.getEdgeAttribute(only, 'label')
    expect(label).toBeDefined()
    // Intl compact format emits "3K" for 3,000.
    expect(label).toMatch(/^3K$/)
  })
})
