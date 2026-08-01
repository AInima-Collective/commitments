import type { CommitmentLifecycle, MeshGraphNode } from './types'

/**
 * Single source of truth for graph palette colors.
 *
 * Resolves CSS custom properties from `tokens.css` at call time so theme
 * switching (light/dark) takes effect without rebuilding the Sigma instance.
 *
 * - No React, no Sigma imports — pure module
 * - All graph color decisions live here
 * - Consumers (style.ts, CommitmentsGraph.tsx) MUST go through
 *   `getGraphPalette()` or one of the per-axis helpers
 */

export type GraphPalette = {
  edges: {
    active: string
    forfeited: string
    released: string
    pending: string
    expired: string
    agreementActive: string
    agreementForfeited: string
    agreementReleased: string
  }
  nodes: {
    fanIn: string
    fanOut: string
    tokenWeighting: string
    operator: string
    commitment: string
    address: string
    fillDefault: string
    strokeDefault: string
    strokeSelected: string
    strokeHover: string
  }
  labels: {
    default: string
    hover: string
    edgeDefault: string
  }
  /** Dim/dehighlight color when hovering a different node. */
  dim: string
  /**
   * Fixed-order categorical slots for per-asset flow lanes (allocation
   * Sankey). Assign by slot in order, never cycle — consumers past the last
   * slot fall back to `nodes.fillDefault`. Validated against both theme
   * surfaces; see the `--viz-flow-*` block in tokens.css.
   */
  flow: string[]
}

/**
 * Mesh node taxonomy → CSS variable name. Add new node types here in lockstep
 * with `tokens.css` `/* === Graph Palette === *\/` block.
 */
const NODE_TYPE_TOKEN: Record<MeshGraphNode['type'], string> = {
  fan_in: '--graph-node-fan-in',
  fan_out: '--graph-node-fan-out',
  token_weighting: '--graph-node-token-weighting',
  address: '--graph-node-address',
}

/**
 * Slate-400 fallback used only if SSR / detached document / missing tokens.
 * This is the one place a hex literal is intentional: the CSS cascade is the
 * source of truth, but if it isn't present (server render, test stub) we
 * still need to emit a parseable color so the renderer doesn't NaN.
 */
// eslint-disable-next-line no-restricted-syntax -- intentional last-resort fallback when tokens.css cascade is absent
const FALLBACK = '#94a3b8'

/**
 * Resolve a single CSS custom property from `:root` (the theme cascade root).
 * Falls back to a sane neutral when document is not present (e.g. SSR).
 */
export function resolveTokenColor(varName: string): string {
  if (typeof document === 'undefined') return FALLBACK
  const v = getComputedStyle(document.documentElement).getPropertyValue(varName).trim()
  return v.length > 0 ? v : FALLBACK
}

/**
 * Build a fresh palette snapshot from the current theme. Cheap enough to call
 * per-render — `getComputedStyle` is a single browser call and the property
 * lookups are constant-time.
 */
export function getGraphPalette(): GraphPalette {
  const r = resolveTokenColor
  return {
    edges: {
      active: r('--graph-edge-active'),
      forfeited: r('--graph-edge-forfeited'),
      released: r('--graph-edge-released'),
      pending: r('--graph-edge-pending'),
      expired: r('--graph-edge-expired'),
      agreementActive: r('--graph-edge-agreement-active'),
      agreementForfeited: r('--graph-edge-agreement-forfeited'),
      agreementReleased: r('--graph-edge-agreement-released'),
    },
    nodes: {
      fanIn: r('--graph-node-fan-in'),
      fanOut: r('--graph-node-fan-out'),
      tokenWeighting: r('--graph-node-token-weighting'),
      operator: r('--graph-node-operator'),
      commitment: r('--graph-node-commitment'),
      address: r('--graph-node-address'),
      fillDefault: r('--graph-node-fill-default'),
      strokeDefault: r('--graph-node-stroke-default'),
      strokeSelected: r('--graph-node-stroke-selected'),
      strokeHover: r('--graph-node-stroke-hover'),
    },
    labels: {
      default: r('--graph-label-default'),
      hover: r('--graph-label-hover'),
      edgeDefault: r('--graph-label-edge-default'),
    },
    dim: r('--graph-dim-bg'),
    flow: [
      r('--viz-flow-1'),
      r('--viz-flow-2'),
      r('--viz-flow-3'),
      r('--viz-flow-4'),
      r('--viz-flow-5'),
      r('--viz-flow-6'),
    ],
  }
}

/** Resolve the edge color for a given commitment lifecycle state. */
export function lifecycleEdgeColor(
  kind: CommitmentLifecycle,
  palette: GraphPalette = getGraphPalette()
): string {
  switch (kind) {
    case 'active':
      return palette.edges.active
    case 'forfeited':
      return palette.edges.forfeited
    case 'released':
      return palette.edges.released
    case 'forfeitPending':
      return palette.edges.pending
    case 'expired':
      return palette.edges.expired
  }
}

/** Resolve the edge color for an agreement-pair state. */
export function agreementEdgeColor(
  state: 'active' | 'forfeited' | 'released',
  palette: GraphPalette = getGraphPalette()
): string {
  if (state === 'active') return palette.edges.agreementActive
  if (state === 'forfeited') return palette.edges.agreementForfeited
  return palette.edges.agreementReleased
}

/**
 * Resolve a node color by mesh-node taxonomy. Unknown types fall back to the
 * default fill so unknown protocol additions don't crash the render.
 */
export function nodeColorByType(
  type: MeshGraphNode['type'] | string,
  palette: GraphPalette = getGraphPalette()
): string {
  const tok = NODE_TYPE_TOKEN[type as MeshGraphNode['type']]
  if (!tok) return palette.nodes.fillDefault
  return resolveTokenColor(tok)
}

type GraphologyLike = {
  forEachNode: (cb: (id: string, attr: Record<string, unknown>) => void) => void
  setNodeAttribute: (id: string, key: string, value: unknown) => void
  forEachEdge: (cb: (id: string, attr: Record<string, unknown>) => void) => void
  setEdgeAttribute: (id: string, key: string, value: unknown) => void
}

/**
 * Re-apply palette to an already-built graphology instance in place. Caller
 * passes the same graph used at mount; Sigma re-renders on its next frame
 * without a fresh instance.
 *
 * Used by the live theme-switch path in plan 27-02.
 */
export function applyPalette(
  graph: GraphologyLike,
  palette: GraphPalette = getGraphPalette()
): void {
  graph.forEachNode((id, attrs) => {
    const data = (attrs as {
      data?: {
        type?: string
        kind?: 'service' | 'operator'
        registeredInService?: boolean
        votingPower?: bigint
      }
    }).data
    const k = data?.kind
    if (k === 'service') {
      graph.setNodeAttribute(id, 'color', palette.edges.active)
      return
    }
    if (k === 'operator') {
      const isContributing = !!data?.registeredInService && (data?.votingPower ?? 0n) > 0n
      graph.setNodeAttribute(
        id,
        'color',
        isContributing ? palette.nodes.operator : palette.edges.expired,
      )
      return
    }
    // MeshTopologyNode: type ∈ 'service' | 'fan_in' | 'fan_out' | 'token_weighting' | 'vault'
    if (data?.type === 'service') {
      graph.setNodeAttribute(id, 'color', palette.edges.active)
      return
    }
    if (data?.type === 'vault') {
      graph.setNodeAttribute(id, 'color', palette.nodes.commitment)
      return
    }
    const t = data?.type as MeshGraphNode['type'] | undefined
    const color = t ? nodeColorByType(t, palette) : palette.nodes.fillDefault
    graph.setNodeAttribute(id, 'color', color)
  })
  graph.forEachEdge((id, attrs) => {
    const data = (attrs as {
      data?: {
        status?: CommitmentLifecycle
        agreementStatus?: string | null
        kind?:
          | 'fan_in_provider'
          | 'fan_out_outflow'
          | 'service_binding'
          | 'vault_source'
      }
    }).data
    if (!data) return
    // MeshTopologyEdge: kind dictates color (independent of stake lifecycle).
    if (data.kind === 'fan_in_provider') {
      graph.setEdgeAttribute(id, 'color', palette.edges.active)
      return
    }
    if (data.kind === 'fan_out_outflow') {
      graph.setEdgeAttribute(id, 'color', palette.edges.released)
      return
    }
    if (data.kind === 'service_binding') {
      graph.setEdgeAttribute(id, 'color', palette.edges.pending)
      return
    }
    if (data.kind === 'vault_source') {
      graph.setEdgeAttribute(id, 'color', palette.edges.active)
      return
    }
    let color: string
    if (
      data.agreementStatus === 'active' ||
      data.agreementStatus === 'forfeited' ||
      data.agreementStatus === 'released'
    ) {
      color = agreementEdgeColor(data.agreementStatus, palette)
    } else if (data.status) {
      color = lifecycleEdgeColor(data.status, palette)
    } else {
      color = palette.edges.released
    }
    graph.setEdgeAttribute(id, 'color', color)
  })
}
