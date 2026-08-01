import type { Address } from 'viem'

import { bigintToUsd } from '../format'
import type { ProtocolCommitmentRow } from '../../hooks/useProtocolEntityList'
import type {
  LaidOutSankeyLink,
  LaidOutSankeyNode,
  SankeyLayout,
  SankeyLink,
  SankeyLinkToken,
  SankeyNode,
  SankeyNodeKind,
  SankeyPayload,
} from './types'

/** Resolved display metadata for a token, mirroring `useTokenMetaMap`. */
export type TokenMetaLite = { decimals: number; symbol: string }

export type SankeyWeight = 'amount' | 'conviction'

/** Which statuses contribute to the flow. */
export type SankeyScope = 'live' | 'all'

/**
 * Which question the diagram answers.
 *
 * - `flow` — Token → Arbiter → Counterparty. Who can seize this capital, and
 *   who receives it if they do. The protocol-wide view on /app/explorer.
 * - `allocation` — Token → free | encumbered → Counterparty. How much of what
 *   the manager holds is actually working, and who it is promised to. Free
 *   balance terminates in the middle column, so the diagram accounts for every
 *   unit of manager-held capital rather than only the committed part.
 */
export type SankeyMode = 'flow' | 'allocation'

export type BuildSankeyOptions = {
  /** Resolve decimals + symbol for a token address. */
  metaFor: (token?: Address) => TokenMetaLite
  /** USD price per whole token, by symbol (case-insensitive). `null` when unknown. */
  priceForSymbol: (symbol: string) => number | null
  /** `amount` (committed) or `conviction` (amount × maxPenaltyBps). */
  weight: SankeyWeight
  /** `live` = active + forfeit-pending; `all` = every status. */
  scope: SankeyScope
  /** Stage pipeline. Defaults to `flow` — the pre-allocation-mode behaviour. */
  mode?: SankeyMode
  /**
   * Allocation mode only: live free balance per LOWERCASED token address.
   *
   * Required for the free stubs — free capital isn't derivable from
   * commitments, which by definition only describe the encumbered side.
   * Omitting it renders the encumbered half alone, which is still correct,
   * just no longer a complete account of holdings.
   */
  freeByToken?: Map<string, bigint>
  /**
   * Optional exact valuation, consulted before the symbol-price path.
   *
   * The default path prices a raw amount by the token's OWN symbol, which is
   * wrong for an ERC-4626 backing token: the ledger holds `cvUSDC` and the
   * price feed knows `USDC`, so every vault-share flow fell through to raw
   * token units and the diagram had to disclaim that its widths were not
   * comparable. A caller that can convert shares to their underlying supplies
   * it here. Return null to fall through.
   */
  // NOT named `valueOf`: that collides with `Object.prototype.valueOf`, and
  // TypeScript then structurally matches any object literal missing the key
  // against the prototype's signature and reports a baffling
  // "Type 'Object' is not assignable to type 'number'".
  exactValue?: (token: Address, raw: bigint) => number | null
  /**
   * Allocation mode only: name each commitment. When present, the terminal
   * column is one node PER commitment (kind 'commitment', `meta.commitmentId`
   * set) instead of aggregated counterparty addresses — the personal dashboard
   * has metadata-derived names and a detail page to link to, so an address
   * column would waste both. Absent, the counterparty aggregation stands.
   */
  commitmentLabelFor?: (row: ProtocolCommitmentRow) => string
}

/** Statuses that carry live forfeiture exposure. */
const LIVE_STATUSES = new Set(['ACTIVE', 'FORFEIT_PENDING'])

const BPS_DENOM = 10_000n

/** Stable node id per stage so the same address in two roles stays distinct. */
function nodeId(kind: SankeyNodeKind, key: string): string {
  return `${kind}:${key.toLowerCase()}`
}

/**
 * Aggregate commitments into a Sankey payload.
 *
 * Commitments become *links*, grouped by the stage pipeline `mode` selects;
 * link weight is USD-normalized so a 6-decimal USDC amount and an 18-decimal
 * WETH amount produce comparable widths. The raw per-token amount and the
 * aggregated count ride along on each link for full-precision tooltips.
 *
 * In `allocation` mode the middle column is per-token rather than global: a
 * `free` node shared by every token would merge unrelated balances into one
 * bar, which reads as a single pool that doesn't exist. Per-token keeps each
 * backing asset's split legible along its own ribbon.
 */
export function buildSankey(
  rows: ProtocolCommitmentRow[],
  opts: BuildSankeyOptions,
): SankeyPayload {
  const {
    metaFor,
    priceForSymbol,
    weight,
    scope,
    mode = 'flow',
    freeByToken,
    exactValue,
    commitmentLabelFor,
  } = opts

  const nodes = new Map<string, SankeyNode>()
  // Keyed by `${sourceId}\u0000${targetId}` then by token for the per-token roll-up.
  const linkAcc = new Map<string, Map<string, SankeyLinkToken & { value: number }>>()
  const linkOrder: string[] = []
  const missingPrices = new Set<string>()

  const addNode = (
    kind: SankeyNodeKind,
    key: string,
    label: string,
    stage: number,
    meta?: SankeyNode['meta'],
  ): string => {
    const id = nodeId(kind, key)
    if (!nodes.has(id)) nodes.set(id, { id, label, kind, stage, ...(meta ? { meta } : {}) })
    return id
  }

  /**
   * Ribbon width for `raw` units of `token`, as a positive float, or null when
   * the flow should be skipped entirely.
   *
   * Three tiers, in order: the caller's exact `valueOf`, then USD by symbol,
   * then raw token units. Only the last is not comparable across tokens, and
   * reaching it is what populates `missingPriceSymbols` — so the diagram's
   * disclaimer now appears when, and only when, the widths really are
   * incommensurable.
   */
  function valueOfRaw(token: Address, raw: bigint, meta: TokenMetaLite): number | null {
    const exact = exactValue?.(token, raw)
    if (exact !== undefined && exact !== null) {
      return Number.isFinite(exact) && exact > 0 ? exact : null
    }
    const price = priceForSymbol(meta.symbol)
    if (price === null) missingPrices.add(meta.symbol)
    const usdBig = bigintToUsd(raw, meta.decimals, price)
    const value = usdBig !== null ? Number(usdBig) / 1e6 : Number(raw) / 10 ** meta.decimals
    return Number.isFinite(value) && value > 0 ? value : null
  }

  for (const row of rows) {
    if (scope === 'live' && !LIVE_STATUSES.has(row.status)) continue

    const meta = metaFor(row.token)
    const rawWeight =
      weight === 'conviction'
        ? (row.amount * BigInt(row.maxPenaltyBps)) / BPS_DENOM
        : row.amount
    if (rawWeight <= 0n) continue

    const value = valueOfRaw(row.token, rawWeight, meta)
    if (value === null) continue

    const tokenMeta = { token: row.token.toLowerCase(), symbol: meta.symbol }
    const tokenNode = addNode('token', row.token, meta.symbol, 0, tokenMeta)

    if (mode === 'allocation') {
      // token → encumbered(token) → commitment | counterparty. The middle node
      // is keyed by token so each backing asset keeps its own split.
      // Labelled with the token, not just "encumbered". The middle column has
      // one pair of nodes PER token, so an account holding two backing assets
      // got four nodes reading free/encumbered/free/encumbered with no way to
      // tell which belonged to which ribbon.
      const encNode = addNode(
        'encumbered',
        `${row.token}:encumbered`,
        `${meta.symbol} committed`,
        1,
        tokenMeta,
      )
      // With a label resolver, the terminal node IS the commitment — named
      // from its metadata and linkable. Without one, fall back to the
      // aggregated counterparty address.
      const targetNode = commitmentLabelFor
        ? addNode('commitment', `c${row.id.toString()}`, commitmentLabelFor(row), 2, {
            ...tokenMeta,
            commitmentId: row.id.toString(),
          })
        : addNode('counterparty', row.counterparty, shortLabel(row.counterparty), 2)
      accumulate(linkAcc, linkOrder, tokenNode, encNode, row.token, meta, rawWeight, value)
      accumulate(linkAcc, linkOrder, encNode, targetNode, row.token, meta, rawWeight, value)
    } else {
      const cpNode = addNode('counterparty', row.counterparty, shortLabel(row.counterparty), 2)
      const arbiterNode = addNode('arbiter', row.arbiter, shortLabel(row.arbiter), 1)
      accumulate(linkAcc, linkOrder, tokenNode, arbiterNode, row.token, meta, rawWeight, value)
      accumulate(linkAcc, linkOrder, arbiterNode, cpNode, row.token, meta, rawWeight, value)
    }
  }

  // Free balance: a terminal stub in the middle column, so the widths across
  // the first column add up to everything the manager holds for this account
  // rather than only the promised part. Deliberately NOT weighted by conviction
  // — uncommitted capital has no penalty, and rendering it at zero height would
  // silently drop it from a diagram whose whole claim is completeness. The
  // caller restricts allocation mode to amount-weighting for the same reason.
  if (mode === 'allocation' && freeByToken) {
    for (const [tokenKey, freeRaw] of freeByToken) {
      if (freeRaw <= 0n) continue
      const token = tokenKey as Address
      const meta = metaFor(token)
      const value = valueOfRaw(token, freeRaw, meta)
      if (value === null) continue

      const tokenMeta = { token: token.toLowerCase(), symbol: meta.symbol }
      const tokenNode = addNode('token', token, meta.symbol, 0, tokenMeta)
      const freeNode = addNode('free', `${token}:free`, `${meta.symbol} idle`, 1, tokenMeta)
      accumulate(linkAcc, linkOrder, tokenNode, freeNode, token, meta, freeRaw, value)
    }
  }

  const links: SankeyLink[] = linkOrder.map((key) => {
    const [source, target] = key.split('\u0000')
    const byToken = linkAcc.get(key)!
    const tokens: SankeyLinkToken[] = []
    let value = 0
    let count = 0
    for (const t of byToken.values()) {
      tokens.push({ token: t.token, symbol: t.symbol, decimals: t.decimals, raw: t.raw, count: t.count })
      value += t.value
      count += t.count
    }
    tokens.sort((a, b) => b.count - a.count)
    return { source, target, value, count, tokens }
  })

  return {
    nodes: Array.from(nodes.values()),
    links,
    missingPriceSymbols: Array.from(missingPrices).sort(),
  }
}

function accumulate(
  linkAcc: Map<string, Map<string, SankeyLinkToken & { value: number }>>,
  linkOrder: string[],
  source: string,
  target: string,
  token: Address,
  meta: TokenMetaLite,
  raw: bigint,
  value: number,
): void {
  const key = `${source}\u0000${target}`
  let byToken = linkAcc.get(key)
  if (!byToken) {
    byToken = new Map()
    linkAcc.set(key, byToken)
    linkOrder.push(key)
  }
  const tk = token.toLowerCase()
  const existing = byToken.get(tk)
  if (existing) {
    existing.raw += raw
    existing.count += 1
    existing.value += value
  } else {
    byToken.set(tk, {
      token,
      symbol: meta.symbol,
      decimals: meta.decimals,
      raw,
      count: 1,
      value,
    })
  }
}

function shortLabel(addr: string): string {
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`
}

// ─── Layout ──────────────────────────────────────────────────────────────────

export type LayoutOptions = {
  width: number
  height: number
  /** Node column width in px. */
  nodeWidth?: number
  /** Vertical gap between stacked nodes in px. */
  nodePadding?: number
}

/**
 * Hand-rolled layered Sankey layout. No external deps:
 *  - nodes grouped by `stage` into vertical columns,
 *  - node height ∝ max(Σ in, Σ out) value, scaled so the busiest column fits,
 *  - greedy vertical packing (value-descending) per column,
 *  - links stacked along each node edge, ordered by the opposite node's y,
 *  - cubic-bezier ribbons (rendered as stroked paths of width ∝ value).
 */
export function layoutSankey(payload: SankeyPayload, opts: LayoutOptions): SankeyLayout {
  const { width, height } = opts
  const nodeWidth = opts.nodeWidth ?? 14
  const nodePadding = opts.nodePadding ?? 16

  const nodes = payload.nodes
  const links = payload.links
  if (nodes.length === 0 || links.length === 0) {
    return { nodes: [], links: [], width, height }
  }

  const byId = new Map(nodes.map((n) => [n.id, n]))
  const stages = Math.max(...nodes.map((n) => n.stage)) + 1

  // Aggregate node value = max(incoming, outgoing).
  const outValue = new Map<string, number>()
  const inValue = new Map<string, number>()
  for (const l of links) {
    outValue.set(l.source, (outValue.get(l.source) ?? 0) + l.value)
    inValue.set(l.target, (inValue.get(l.target) ?? 0) + l.value)
  }
  const nodeValue = new Map<string, number>()
  for (const n of nodes) {
    nodeValue.set(n.id, Math.max(outValue.get(n.id) ?? 0, inValue.get(n.id) ?? 0))
  }

  // Group by stage, value-descending (greedy packing).
  const columns: SankeyNode[][] = Array.from({ length: stages }, () => [])
  for (const n of nodes) columns[n.stage].push(n)
  for (const col of columns) {
    col.sort((a, b) => (nodeValue.get(b.id) ?? 0) - (nodeValue.get(a.id) ?? 0))
  }

  // Vertical scale: pick the column whose (value + padding) packing is tallest.
  let valueScale = Infinity
  for (const col of columns) {
    if (col.length === 0) continue
    const totalValue = col.reduce((s, n) => s + (nodeValue.get(n.id) ?? 0), 0)
    const avail = height - nodePadding * (col.length - 1)
    if (totalValue > 0 && avail > 0) {
      valueScale = Math.min(valueScale, avail / totalValue)
    }
  }
  if (!Number.isFinite(valueScale) || valueScale <= 0) valueScale = 1

  const laidNodes: LaidOutSankeyNode[] = []
  const nodeRects = new Map<string, LaidOutSankeyNode>()
  const xFor = (stage: number): number =>
    stages <= 1 ? 0 : (stage * (width - nodeWidth)) / (stages - 1)

  for (let s = 0; s < stages; s++) {
    const col = columns[s]
    const colHeight = col.reduce(
      (sum, n) => sum + Math.max(1, (nodeValue.get(n.id) ?? 0) * valueScale),
      0,
    ) + nodePadding * Math.max(0, col.length - 1)
    let cursor = Math.max(0, (height - colHeight) / 2)
    for (const n of col) {
      const h = Math.max(1, (nodeValue.get(n.id) ?? 0) * valueScale)
      const rect: LaidOutSankeyNode = {
        ...n,
        x: xFor(s),
        y0: cursor,
        y1: cursor + h,
        value: nodeValue.get(n.id) ?? 0,
      }
      laidNodes.push(rect)
      nodeRects.set(n.id, rect)
      cursor += h + nodePadding
    }
  }

  // Order links along each node edge by the opposite node's vertical center.
  const centerOf = (id: string): number => {
    const r = nodeRects.get(id)
    return r ? (r.y0 + r.y1) / 2 : 0
  }
  const sourceCursor = new Map<string, number>()
  const targetCursor = new Map<string, number>()

  const sortedForSource = [...links].sort(
    (a, b) =>
      a.source.localeCompare(b.source) ||
      centerOf(a.target) - centerOf(b.target),
  )
  const linkWidth = new Map<SankeyLink, number>()
  const linkSy = new Map<SankeyLink, number>()
  for (const l of sortedForSource) {
    const w = Math.max(1, l.value * valueScale)
    linkWidth.set(l, w)
    const start = sourceCursor.get(l.source) ?? nodeRects.get(l.source)?.y0 ?? 0
    linkSy.set(l, start + w / 2)
    sourceCursor.set(l.source, start + w)
  }

  const sortedForTarget = [...links].sort(
    (a, b) =>
      a.target.localeCompare(b.target) ||
      centerOf(a.source) - centerOf(b.source),
  )
  const linkTy = new Map<SankeyLink, number>()
  for (const l of sortedForTarget) {
    const w = linkWidth.get(l)!
    const start = targetCursor.get(l.target) ?? nodeRects.get(l.target)?.y0 ?? 0
    linkTy.set(l, start + w / 2)
    targetCursor.set(l.target, start + w)
  }

  const laidLinks: LaidOutSankeyLink[] = []
  for (const l of links) {
    const src = nodeRects.get(l.source)
    const tgt = nodeRects.get(l.target)
    if (!src || !tgt) continue
    const x0 = src.x + nodeWidth
    const x1 = tgt.x
    const y0 = linkSy.get(l)!
    const y1 = linkTy.get(l)!
    const xMid = (x0 + x1) / 2
    const path = `M${x0},${y0} C${xMid},${y0} ${xMid},${y1} ${x1},${y1}`
    laidLinks.push({
      ...l,
      width: linkWidth.get(l)!,
      path,
      sourceKind: byId.get(l.source)?.kind ?? 'token',
      targetKind: byId.get(l.target)?.kind ?? 'counterparty',
    })
  }

  return { nodes: laidNodes, links: laidLinks, width, height }
}
