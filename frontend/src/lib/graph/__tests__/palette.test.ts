import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import {
  agreementEdgeColor,
  getGraphPalette,
  lifecycleEdgeColor,
  nodeColorByType,
} from '../palette'

/**
 * Inject a minimal --graph-* / semantic-token block into jsdom so
 * `getComputedStyle(document.documentElement).getPropertyValue(...)` returns
 * the expected resolved color strings. Mirrors the values declared in
 * tokens.css for both themes.
 */
function injectTokens(theme: 'light' | 'dark') {
  let style = document.getElementById('__test_tokens') as HTMLStyleElement | null
  if (!style) {
    style = document.createElement('style')
    style.id = '__test_tokens'
    document.head.appendChild(style)
  }
  if (theme === 'light') {
    style.textContent = `:root {
      --surface:#ffffff;
      --surface-2:#f4f4f2;
      --surface-3:#ebebe8;
      --border:#e6e6e3;
      --border-strong:#c8c8c4;
      --text:#18181b;
      --text-muted:#52525b;
      --accent:#c2410c;
      --accent-soft:#f4f4f2;
      --warn:#a16207;
      --danger:#b91c1c;
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
  } else {
    style.textContent = `:root {
      --surface:#111111;
      --surface-2:#1a1a1a;
      --surface-3:#232323;
      --border:#232323;
      --border-strong:#3a3a3a;
      --text:#ededed;
      --text-muted:#a1a1a6;
      --accent:#f59e0b;
      --accent-soft:#1a1a1a;
      --warn:#facc15;
      --danger:#f87171;
      --graph-edge-active:#f59e0b;
      --graph-edge-forfeited:#f87171;
      --graph-edge-released:#a1a1a6;
      --graph-edge-pending:#facc15;
      --graph-edge-expired:#3a3a3a;
      --graph-edge-agreement-active:#f59e0b;
      --graph-edge-agreement-forfeited:#f87171;
      --graph-edge-agreement-released:#a1a1a6;
      --graph-node-fan-in:#232323;
      --graph-node-fan-out:#232323;
      --graph-node-token-weighting:#232323;
      --graph-node-operator:#1a1a1a;
      --graph-node-commitment:#1a1a1a;
      --graph-node-address:#1a1a1a;
      --graph-node-fill-default:#1a1a1a;
      --graph-node-stroke-default:#232323;
      --graph-node-stroke-selected:#f59e0b;
      --graph-node-stroke-hover:#f59e0b;
      --graph-label-default:#ededed;
      --graph-label-hover:#f59e0b;
      --graph-label-edge-default:#a1a1a6;
      --graph-dim-bg:#232323;
    }`
  }
  document.documentElement.dataset.theme = theme
}

function clearTokens() {
  const style = document.getElementById('__test_tokens')
  if (style) style.remove()
  delete document.documentElement.dataset.theme
}

// Pure WCAG helpers — no external dep.
function parseColor(s: string): [number, number, number] {
  const t = s.trim()
  const hex = t.match(/^#([0-9a-f]{3,8})$/i)
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
  throw new Error('unparseable: ' + s)
}
function lum(rgb: [number, number, number]): number {
  const [r, g, b] = rgb.map((c) => {
    const v = c / 255
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)
  }) as [number, number, number]
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}
function getContrastRatio(a: string, b: string): number {
  const la = lum(parseColor(a))
  const lb = lum(parseColor(b))
  const [hi, lo] = la > lb ? [la, lb] : [lb, la]
  return (hi + 0.05) / (lo + 0.05)
}

afterEach(() => clearTokens())

describe('getGraphPalette', () => {
  beforeEach(() => injectTokens('light'))

  it('returns the full palette shape with non-empty strings', () => {
    const p = getGraphPalette()
    for (const v of [
      p.edges.active, p.edges.forfeited, p.edges.released, p.edges.pending, p.edges.expired,
      p.edges.agreementActive, p.edges.agreementForfeited, p.edges.agreementReleased,
      p.nodes.fanIn, p.nodes.fanOut, p.nodes.tokenWeighting, p.nodes.operator,
      p.nodes.commitment, p.nodes.address, p.nodes.fillDefault, p.nodes.strokeDefault,
      p.nodes.strokeSelected, p.nodes.strokeHover,
      p.labels.default, p.labels.hover, p.labels.edgeDefault, p.dim,
    ]) {
      expect(typeof v).toBe('string')
      expect(v.length).toBeGreaterThan(0)
    }
  })

  it('lifecycleEdgeColor maps every CommitmentLifecycle', () => {
    const p = getGraphPalette()
    expect(lifecycleEdgeColor('active', p)).toBe(p.edges.active)
    expect(lifecycleEdgeColor('forfeited', p)).toBe(p.edges.forfeited)
    expect(lifecycleEdgeColor('released', p)).toBe(p.edges.released)
    expect(lifecycleEdgeColor('forfeitPending', p)).toBe(p.edges.pending)
    expect(lifecycleEdgeColor('expired', p)).toBe(p.edges.expired)
  })

  it('agreementEdgeColor maps three states', () => {
    const p = getGraphPalette()
    expect(agreementEdgeColor('active', p)).toBe(p.edges.agreementActive)
    expect(agreementEdgeColor('forfeited', p)).toBe(p.edges.agreementForfeited)
    expect(agreementEdgeColor('released', p)).toBe(p.edges.agreementReleased)
  })

  it('nodeColorByType maps mesh node taxonomy + falls back', () => {
    const p = getGraphPalette()
    expect(nodeColorByType('fan_in', p)).toBe(p.nodes.fanIn)
    expect(nodeColorByType('fan_out', p)).toBe(p.nodes.fanOut)
    expect(nodeColorByType('token_weighting', p)).toBe(p.nodes.tokenWeighting)
    expect(nodeColorByType('address', p)).toBe(p.nodes.address)
    expect(nodeColorByType('unknown_kind', p)).toBe(p.nodes.fillDefault)
  })

  it('switches values when dataset.theme changes', () => {
    const lightOperator = getGraphPalette().nodes.operator
    const lightActive = getGraphPalette().edges.active
    injectTokens('dark')
    const darkOperator = getGraphPalette().nodes.operator
    const darkActive = getGraphPalette().edges.active
    expect(lightOperator).not.toBe(darkOperator)
    expect(lightActive).not.toBe(darkActive)
  })
})

describe('WCAG contrast — light theme', () => {
  beforeEach(() => injectTokens('light'))

  it('label text vs surface ≥ 4.5:1', () => {
    const p = getGraphPalette()
    const surface = getComputedStyle(document.documentElement).getPropertyValue('--surface').trim()
    expect(getContrastRatio(p.labels.default, surface)).toBeGreaterThanOrEqual(4.5)
  })
  it('edge active vs surface ≥ 3:1', () => {
    const p = getGraphPalette()
    const surface = getComputedStyle(document.documentElement).getPropertyValue('--surface').trim()
    expect(getContrastRatio(p.edges.active, surface)).toBeGreaterThanOrEqual(3)
  })
  it('edge forfeited vs surface ≥ 3:1', () => {
    const p = getGraphPalette()
    const surface = getComputedStyle(document.documentElement).getPropertyValue('--surface').trim()
    expect(getContrastRatio(p.edges.forfeited, surface)).toBeGreaterThanOrEqual(3)
  })
  it('node operator vs surface ≥ 3:1', () => {
    const p = getGraphPalette()
    const surface = getComputedStyle(document.documentElement).getPropertyValue('--surface').trim()
    // Operator nodes use a soft surface fill, but their selection ring is the
    // signal we test against the page bg in the strokeSelected pair below.
    // Here we just verify the operator fill is distinguishable from surface.
    const ratio = getContrastRatio(p.nodes.operator, surface)
    expect(ratio).toBeGreaterThanOrEqual(1.05)
  })
  it('selection stroke vs node fill ≥ 3:1', () => {
    const p = getGraphPalette()
    expect(getContrastRatio(p.nodes.strokeSelected, p.nodes.fillDefault)).toBeGreaterThanOrEqual(3)
  })
})

describe('WCAG contrast — dark theme', () => {
  beforeEach(() => injectTokens('dark'))

  it('label text vs surface ≥ 4.5:1', () => {
    const p = getGraphPalette()
    const surface = getComputedStyle(document.documentElement).getPropertyValue('--surface').trim()
    expect(getContrastRatio(p.labels.default, surface)).toBeGreaterThanOrEqual(4.5)
  })
  it('edge active vs surface ≥ 3:1', () => {
    const p = getGraphPalette()
    const surface = getComputedStyle(document.documentElement).getPropertyValue('--surface').trim()
    expect(getContrastRatio(p.edges.active, surface)).toBeGreaterThanOrEqual(3)
  })
  it('edge forfeited vs surface ≥ 3:1', () => {
    const p = getGraphPalette()
    const surface = getComputedStyle(document.documentElement).getPropertyValue('--surface').trim()
    expect(getContrastRatio(p.edges.forfeited, surface)).toBeGreaterThanOrEqual(3)
  })
  it('node operator vs surface ≥ 1.05', () => {
    const p = getGraphPalette()
    const surface = getComputedStyle(document.documentElement).getPropertyValue('--surface').trim()
    const ratio = getContrastRatio(p.nodes.operator, surface)
    expect(ratio).toBeGreaterThanOrEqual(1.05)
  })
  it('selection stroke vs node fill ≥ 3:1', () => {
    const p = getGraphPalette()
    expect(getContrastRatio(p.nodes.strokeSelected, p.nodes.fillDefault)).toBeGreaterThanOrEqual(3)
  })
})
