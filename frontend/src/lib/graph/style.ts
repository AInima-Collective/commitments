import type { CommitmentLifecycle, GraphEdge } from './types'
import {
  agreementEdgeColor,
  getGraphPalette,
  lifecycleEdgeColor,
  type GraphPalette,
} from './palette'

/**
 * Edge lifecycle opacity. Mirrored in the plan's design contract:
 *   active         — solid, color scales with conviction magnitude
 *   forfeitPending   — full opacity, pulses via renderer
 *   forfeited        — near-full opacity, dashed
 *   released       — faded
 *   expired        — faded (like released, slightly more so)
 *
 * Color choices live in palette.ts (CSS-token-driven). This file only owns
 * non-color visual axes (opacity, size).
 */
export const LIFECYCLE_OPACITY: Record<CommitmentLifecycle, number> = {
  active: 0.9,
  forfeitPending: 1,
  forfeited: 0.95,
  released: 0.35,
  expired: 0.25,
}

const AGREEMENT_OPACITY = 1
const AGREEMENT_SIZE_MULTIPLIER = 1.5

/**
 * Resolve the color for an edge given its lifecycle / agreement state.
 *
 * - Solo commitments: lifecycle palette
 * - Agreed pairs (active|forfeited|released): bonded agreement palette
 * - Asymmetric (partialForfeitA/B): the forfeited side wears the lifecycle
 *   `forfeited` color, the intact side keeps `agreementActive` so the
 *   asymmetry is legible at a glance.
 */
export function colorForEdge(
  edge: GraphEdge,
  palette: GraphPalette = getGraphPalette()
): string {
  if (edge.agreementId && edge.agreementStatus) {
    const es = edge.agreementStatus
    if (es === 'partialForfeitA') {
      return edge.agreementSide === 'A'
        ? lifecycleEdgeColor('forfeited', palette)
        : agreementEdgeColor('active', palette)
    }
    if (es === 'partialForfeitB') {
      return edge.agreementSide === 'B'
        ? lifecycleEdgeColor('forfeited', palette)
        : agreementEdgeColor('active', palette)
    }
    if (es === 'active' || es === 'forfeited' || es === 'released') {
      return agreementEdgeColor(es, palette)
    }
  }
  return lifecycleEdgeColor(edge.status, palette)
}

export function opacityForEdge(edge: GraphEdge): number {
  if (edge.agreementId && edge.agreementStatus) return AGREEMENT_OPACITY
  return LIFECYCLE_OPACITY[edge.status]
}

export function sizeMultiplierForEdge(edge: GraphEdge): number {
  return edge.agreementId ? AGREEMENT_SIZE_MULTIPLIER : 1
}

/**
 * Parse a CSS color string (`#rgb`, `#rrggbb`, `rgb(...)`, `rgba(...)`) into
 * an `[r, g, b]` triple. Used by `nodeColorForValue` to interpolate across
 * the palette endpoints. Returns a defensive mid-grey on parse failure so
 * the renderer never crashes.
 */
function parseHexOrRgb(input: string): [number, number, number] {
  const t = input.trim()
  const hex = t.match(/^#([0-9a-fA-F]{3,8})$/)
  if (hex) {
    let h = hex[1]
    if (h.length === 3) h = h.split('').map((c) => c + c).join('')
    const n = parseInt(h.slice(0, 6), 16)
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
  }
  const rgb = t.match(/rgba?\(([^)]+)\)/)
  if (rgb) {
    const parts = rgb[1].split(',').map((x) => parseFloat(x.trim()))
    return [parts[0] || 0, parts[1] || 0, parts[2] || 0]
  }
  return [148, 163, 184]
}

/**
 * Node color ramp. Interpolates between the default fill (`fillDefault`,
 * low conviction) and the selection accent (`strokeSelected`, high
 * conviction) based on `value01` ∈ [0, 1]. Both endpoints resolve from CSS
 * variables every call so theme switches are picked up live.
 */
export function nodeColorForValue(
  value01: number,
  palette: GraphPalette = getGraphPalette()
): string {
  const t = Math.max(0, Math.min(1, value01))
  const [r0, g0, b0] = parseHexOrRgb(palette.nodes.fillDefault)
  const [r1, g1, b1] = parseHexOrRgb(palette.nodes.strokeSelected)
  const r = Math.round(r0 * (1 - t) + r1 * t)
  const g = Math.round(g0 * (1 - t) + g1 * t)
  const b = Math.round(b0 * (1 - t) + b1 * t)
  return `rgb(${r}, ${g}, ${b})`
}

export function nodeSizeForValue(value01: number): number {
  return 6 + 10 * Math.max(0, Math.min(1, value01))
}

export function edgeSizeForConviction(conviction: bigint, maxConviction: bigint): number {
  if (maxConviction === 0n) return 1
  const ratio = Number((conviction * 1000n) / maxConviction) / 1000
  return 1 + 4 * Math.max(0, Math.min(1, ratio))
}
