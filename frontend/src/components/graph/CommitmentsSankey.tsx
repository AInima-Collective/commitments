import { useMemo, useState } from 'react'
import type { Address } from 'viem'

import {
  buildSankey,
  layoutSankey,
  type SankeyMode,
  type SankeyScope,
  type SankeyWeight,
} from '../../lib/graph/buildSankey'
import { getGraphPalette, resolveTokenColor } from '../../lib/graph/palette'
import type { LaidOutSankeyLink, LaidOutSankeyNode, SankeyNodeKind } from '../../lib/graph/types'
import { formatTokenAmount } from '../../lib/format'
import type { ProtocolCommitmentRow } from '../../hooks/useProtocolEntityList'
import { useAssetPrices } from '../../hooks/useAssetPrices'
import { useTokenMetaMap } from '../../hooks/useTokenMeta'
import { Notice, TokenIcon, useTheme, ViewToggle } from '../ui'

/**
 * Plot height bounds. The diagram used to be a flat 500 regardless of content,
 * so a two-token account reserved the same slab as a twenty-counterparty one
 * and the dashboard section ran past 700px for six ribbons. Height is derived
 * from the busiest column instead, clamped so it neither collapses nor runs
 * away.
 */
const MIN_HEIGHT = 220
const MAX_HEIGHT = 460
const ROW_HEIGHT = 46
/**
 * viewBox width. The svg is `width: 100%` with `height: auto`, so this is
 * really an aspect ratio: a narrower viewBox scales UP more to fill the
 * container and drags the rendered height with it. 720 against a ~1200px
 * column magnified a 320-unit plot to well over 500 real pixels. Wider costs
 * nothing (the plot is horizontal by nature) and buys label room.
 */
const WIDTH = 960
const NODE_WIDTH = 14

const STAGE_TITLES: Record<SankeyMode, string[]> = {
  flow: ['Token', 'Arbiter', 'Counterparty'],
  allocation: ['Backing', 'Allocation', 'Promised to'],
}

/** Terminal-column title when the third column is commitments, not addresses. */
const COMMITMENT_STAGE_TITLES = ['Backing', 'Allocation', 'Commitment']

/**
 * Terminal-column label budget. Commitment labels are clamped upstream at 96
 * chars — fine for a table cell, but at 10px SVG text a 96-char label would
 * run all the way back across the plot. ~40 chars fits the right third of the
 * viewBox; the full text stays available in the node tooltip.
 */
const MAX_NODE_LABEL_CHARS = 40

function clampLabel(label: string): string {
  if (label.length <= MAX_NODE_LABEL_CHARS) return label
  return `${label.slice(0, MAX_NODE_LABEL_CHARS - 1).trimEnd()}…`
}

/** Icon box for the backing-column token logos. */
const TOKEN_ICON_PX = 14

type Props = {
  commitments: ProtocolCommitmentRow[]
  isLoading?: boolean
  error?: unknown
  className?: string
  /**
   * Stage pipeline. Defaults to `flow` (Token → Arbiter → Counterparty), the
   * protocol-wide reading used on the Explorer page.
   */
  mode?: SankeyMode
  /**
   * Allocation mode: live free balance per lowercased token address. Renders
   * the idle half of the account's holdings, which commitments alone can't show.
   */
  freeByToken?: Map<string, bigint>
  /** Hide the amount/conviction toggle. Allocation mode is amount-only. */
  hideWeightToggle?: boolean
  /** Copy for the empty state — the personal view says something different. */
  emptyLabel?: string
  /**
   * Exact USD for a raw amount of a token, when the caller can do better than
   * the symbol lookup. See `BuildSankeyOptions.exactValue` — the case that
   * needs it is ERC-4626 backing, where the ledger holds `cvUSDC` and the price
   * feed only knows `USDC`.
   */
  exactValue?: (token: Address, raw: bigint) => number | null
  /**
   * Allocation mode: name each commitment (metadata title, derived label, or
   * id — the caller runs `commitmentLabel`). Turns the terminal column into
   * one node per commitment instead of aggregated counterparty addresses.
   */
  commitmentLabelFor?: (row: ProtocolCommitmentRow) => string
  /** Open a commitment's detail page. Makes commitment nodes clickable. */
  onOpenCommitment?: (id: bigint) => void
  /**
   * Icon symbol for a backing token (lowercased address), when the caller
   * knows better than the token's own symbol. An ERC-4626 share is the case:
   * `cvUSDC` has no brand mark, its underlying `USDC` does — the same
   * resolution the assets table uses.
   */
  iconSymbolFor?: (token: string) => string | undefined
}

/**
 * CommitmentsSankey — a dependency-free SVG Sankey of committed capital.
 *
 * Commitments are aggregated into links (Token → Arbiter → Counterparty), USD-
 * normalized so widths compare across tokens of different decimals. Layout is
 * hand-rolled in `lib/graph/buildSankey` (no d3); colors come from the shared
 * `getGraphPalette()` so the diagram is theme-aware. Reuses the
 * loading/empty/indexer-unreachable states of the Sigma graph.
 */
export function CommitmentsSankey({
  commitments,
  isLoading,
  error,
  className,
  mode = 'flow',
  freeByToken,
  hideWeightToggle,
  emptyLabel,
  exactValue,
  commitmentLabelFor,
  onOpenCommitment,
  iconSymbolFor,
}: Props) {
  const { theme } = useTheme()
  // Re-resolve the palette when the theme changes (CSS-cascade re-read).
  // eslint-disable-next-line react-hooks/exhaustive-deps -- `theme` is unread here; a theme change is what makes getGraphPalette's CSS variables differ
  const palette = useMemo(() => getGraphPalette(), [theme])
  // Card surface, for the label halo — node labels can cross ribbons, and a
  // paint-order stroke in the surface colour is what keeps them readable there.
  // eslint-disable-next-line react-hooks/exhaustive-deps -- `theme` is unread here; a theme change is what changes --surface
  const surface = useMemo(() => resolveTokenColor('--surface'), [theme])

  const [weight, setWeight] = useState<SankeyWeight>('amount')
  const [scope, setScope] = useState<SankeyScope>('live')

  // Free-balance tokens count too: an account can hold a token it has no
  // commitments in, and its symbol/decimals still have to resolve for pricing.
  const tokens = useMemo<Address[]>(
    () => [
      ...commitments.map((c) => c.token),
      ...[...(freeByToken?.keys() ?? [])].map((t) => t as Address),
    ],
    [commitments, freeByToken],
  )
  const { metaFor, byAddress } = useTokenMetaMap(tokens)

  const symbols = useMemo(
    () => Array.from(new Set(Object.values(byAddress).map((m) => m.symbol))),
    [byAddress],
  )
  const { getPrice } = useAssetPrices({ symbols })

  const payload = useMemo(
    () =>
      buildSankey(commitments, {
        metaFor,
        priceForSymbol: (symbol) => getPrice(symbol)?.usd ?? null,
        // Allocation mode is amount-only: free capital carries no penalty, so a
        // conviction weighting would render it at zero and quietly break the
        // "this accounts for everything you hold" claim.
        weight: mode === 'allocation' ? 'amount' : weight,
        scope,
        mode,
        freeByToken,
        exactValue,
        commitmentLabelFor,
      }),
    [commitments, metaFor, getPrice, weight, scope, mode, freeByToken, exactValue, commitmentLabelFor],
  )

  // ── Per-asset lane colours ────────────────────────────────────────────────
  // One categorical slot per backing token so a flow can be followed by hue
  // from asset to commitment. Slots are assigned in address order — a stable
  // property of the token itself — so the mapping cannot repaint when a
  // commitment is added or a filter changes the visible set. Overflow past the
  // last slot falls back to the neutral fill rather than cycling.
  const tokenColor = useMemo(() => {
    const addrs = payload.nodes
      .filter((n) => n.kind === 'token' && n.meta?.token)
      .map((n) => n.meta!.token!)
      .sort()
    const map = new Map<string, string>()
    addrs.forEach((addr, i) => {
      map.set(addr, i < palette.flow.length ? palette.flow[i] : palette.nodes.fillDefault)
    })
    return map
  }, [payload, palette])

  // Hover emphasis: the hovered ribbon (or a hovered commitment node's
  // incoming ribbons) comes forward, everything else recedes.
  const [hover, setHover] = useState<{ nodeId?: string; links: Set<string> } | null>(null)

  // Human labels for tooltip text — link endpoints are node ids.
  const labelById = useMemo(() => new Map(payload.nodes.map((n) => [n.id, n.label])), [payload])

  // Tallest column decides the plot height — that column is what has to fit.
  const height = useMemo(() => {
    const perStage = new Map<number, number>()
    for (const n of payload.nodes) perStage.set(n.stage, (perStage.get(n.stage) ?? 0) + 1)
    const busiest = Math.max(1, ...perStage.values())
    return Math.min(MAX_HEIGHT, Math.max(MIN_HEIGHT, busiest * ROW_HEIGHT))
  }, [payload])

  const layout = useMemo(
    () => layoutSankey(payload, { width: WIDTH, height, nodeWidth: NODE_WIDTH }),
    [payload, height],
  )

  const showError = error && commitments.length === 0
  const isEmpty = layout.nodes.length === 0

  const controls = (
    <div className="ds-row ds-row-3" style={{ flexWrap: 'wrap' }}>
      {!hideWeightToggle && (
        <ViewToggle
          aria-label="Flow weight"
          size="sm"
          value={weight}
          onChange={(v) => setWeight(v as SankeyWeight)}
          options={[
            { id: 'amount', label: 'amount' },
            { id: 'conviction', label: 'conviction' },
          ]}
        />
      )}
      <ViewToggle
        aria-label="Flow scope"
        size="sm"
        value={scope}
        onChange={(v) => setScope(v as SankeyScope)}
        options={[
          { id: 'live', label: 'active + forfeit-pending' },
          { id: 'all', label: 'all statuses' },
        ]}
      />
    </div>
  )

  if (isEmpty) {
    return (
      <div className={`ds-stack ds-stack-3${className ? ` ${className}` : ''}`}>
        {controls}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 6,
            height,
            alignItems: 'center',
            justifyContent: 'center',
            border: '1px dashed var(--border)',
            color: showError ? 'var(--danger)' : 'var(--text-muted)',
            textAlign: 'center',
            padding: 16,
          }}
        >
          {showError ? (
            <>
              <div>Live data is temporarily unavailable.</div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                Please retry shortly.
              </div>
            </>
          ) : isLoading ? (
            'Loading flow…'
          ) : (
            (emptyLabel ?? 'No committed capital to display in this scope yet.')
          )}
        </div>
      </div>
    )
  }

  return (
    <div className={`ds-stack ds-stack-3${className ? ` ${className}` : ''}`}>
      {controls}

      {payload.missingPriceSymbols.length > 0 && (
        <Notice tone="warn" size="sm">
          No USD price for {payload.missingPriceSymbols.join(', ')} — those flows use raw token units,
          so their widths are not USD-comparable.
        </Notice>
      )}

      <div style={{ overflowX: 'auto' }}>
        <svg
          role="img"
          aria-label="Committed-capital flow from tokens through arbiters to counterparties"
          viewBox={`0 0 ${WIDTH} ${height + 28}`}
          width="100%"
          // maxHeight is the backstop for the many-counterparty case, where
          // the plot hits MAX_HEIGHT and the aspect ratio alone would still let
          // it run away down the page. `meet` letterboxes rather than crops.
          preserveAspectRatio="xMidYMid meet"
          style={{ display: 'block', minWidth: 480, height: 'auto', maxHeight: 440 }}
        >
          {/* Stage headers */}
          {(mode === 'allocation' && commitmentLabelFor ? COMMITMENT_STAGE_TITLES : STAGE_TITLES[mode]).map((title, i, all) => {
            const x = i === 0 ? 0 : i === all.length - 1 ? WIDTH : WIDTH / 2
            const anchor = i === 0 ? 'start' : i === all.length - 1 ? 'end' : 'middle'
            return (
              <text
                key={title}
                x={x}
                y={12}
                textAnchor={anchor}
                fontSize={11}
                fill={palette.labels.default}
                style={{ textTransform: 'uppercase', letterSpacing: '0.06em' }}
              >
                {title}
              </text>
            )
          })}

          <g transform="translate(0, 24)">
            {/* Links */}
            <g fill="none">
              {layout.links.map((l) => {
                const key = `${l.source}->${l.target}`
                return (
                  <SankeyRibbon
                    key={key}
                    link={l}
                    palette={palette}
                    laneColor={laneColorFor(l, tokenColor)}
                    labelOf={(id) => labelById.get(id) ?? stripKind(id)}
                    emphasis={hover === null ? 'rest' : hover.links.has(key) ? 'raised' : 'dimmed'}
                    onHover={(entering) => setHover(entering ? { links: new Set([key]) } : null)}
                  />
                )
              })}
            </g>

            {/* Nodes */}
            {layout.nodes.map((n) => (
              <SankeyNodeGlyph
                key={n.id}
                node={n}
                palette={palette}
                surface={surface}
                laneColor={n.meta?.token ? tokenColor.get(n.meta.token) : undefined}
                iconSymbol={
                  n.meta?.token ? (iconSymbolFor?.(n.meta.token) ?? n.meta.symbol) : n.meta?.symbol
                }
                hovered={hover?.nodeId === n.id}
                onOpenCommitment={onOpenCommitment}
                onHover={(entering) =>
                  setHover(
                    entering
                      ? {
                          nodeId: n.id,
                          links: new Set(
                            layout.links
                              .filter((l) => l.source === n.id || l.target === n.id)
                              .map((l) => `${l.source}->${l.target}`),
                          ),
                        }
                      : null,
                  )
                }
              />
            ))}
          </g>
        </svg>
      </div>
    </div>
  )
}

/**
 * The lane colour for a ribbon — the categorical slot of the token whose
 * capital it carries. Allocation-mode links are per-token by construction
 * (both middle nodes are token-keyed), so the dominant token IS the token.
 */
function laneColorFor(
  link: LaidOutSankeyLink,
  tokenColor: Map<string, string>,
): string | undefined {
  const dominant = link.tokens[0]
  return dominant ? tokenColor.get(dominant.token.toLowerCase()) : undefined
}

function SankeyRibbon({
  link,
  palette,
  laneColor,
  labelOf,
  emphasis,
  onHover,
}: {
  link: LaidOutSankeyLink
  palette: ReturnType<typeof getGraphPalette>
  laneColor: string | undefined
  labelOf: (id: string) => string
  emphasis: 'rest' | 'raised' | 'dimmed'
  onHover: (entering: boolean) => void
}) {
  // Hue follows the backing asset (the lane colour) so a flow can be tracked
  // from token to commitment by colour alone; weight still separates idle from
  // working capital — free ribbons recede, committed ribbons hold. Without a
  // lane colour (flow mode, palette exhausted) fall back to the old
  // target-kind grays.
  const idle = link.targetKind === 'free'
  const fallbackKind = link.targetKind === 'free' || link.targetKind === 'encumbered'
    ? link.targetKind
    : link.sourceKind
  const stroke = laneColor ?? nodeColor(fallbackKind, palette)
  const restOpacity = idle ? 0.18 : 0.45
  const opacity = emphasis === 'raised' ? Math.max(0.7, restOpacity) : emphasis === 'dimmed' ? 0.08 : restOpacity
  return (
    <path
      d={link.path}
      stroke={stroke}
      strokeOpacity={opacity}
      strokeWidth={link.width}
      onMouseEnter={() => onHover(true)}
      onMouseLeave={() => onHover(false)}
    >
      <title>{tooltipFor(link, labelOf)}</title>
    </path>
  )
}

/**
 * One node bar + label. Token nodes carry the asset's logo; commitment nodes
 * are links into the commitment's own page.
 */
function SankeyNodeGlyph({
  node: n,
  palette,
  surface,
  laneColor,
  iconSymbol,
  hovered,
  onOpenCommitment,
  onHover,
}: {
  node: LaidOutSankeyNode
  palette: ReturnType<typeof getGraphPalette>
  surface: string
  laneColor: string | undefined
  iconSymbol: string | undefined
  hovered: boolean
  onOpenCommitment?: (id: bigint) => void
  onHover: (entering: boolean) => void
}) {
  // Free bars keep the quiet neutral even though the token is known — the
  // idle half must not compete with the committed half for attention.
  const fill = n.kind === 'free' ? nodeColor(n.kind, palette) : (laneColor ?? nodeColor(n.kind, palette))
  const clickable = n.kind === 'commitment' && n.meta?.commitmentId !== undefined && !!onOpenCommitment
  const open = () => {
    if (clickable) onOpenCommitment!(BigInt(n.meta!.commitmentId!))
  }
  const labelX = n.stage === 2 ? n.x - 4 : n.x + NODE_WIDTH + 4
  const midY = (n.y0 + n.y1) / 2
  const showIcon = n.kind === 'token' && !!iconSymbol
  return (
    <g
      onMouseEnter={() => onHover(true)}
      onMouseLeave={() => onHover(false)}
      onClick={clickable ? open : undefined}
      onKeyDown={
        clickable
          ? (e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault()
                open()
              }
            }
          : undefined
      }
      role={clickable ? 'link' : undefined}
      tabIndex={clickable ? 0 : undefined}
      aria-label={clickable ? `Open commitment: ${n.label}` : undefined}
      style={clickable ? { cursor: 'pointer' } : undefined}
    >
      <rect
        x={n.x}
        y={n.y0}
        width={NODE_WIDTH}
        height={Math.max(1, n.y1 - n.y0)}
        fill={fill}
        stroke={hovered && clickable ? palette.nodes.strokeHover : undefined}
      >
        <title>{clickable ? `${n.label}\nClick to open this commitment` : n.label}</title>
      </rect>
      {showIcon && (
        // A pixel of slack on every side + visible overflow: foreignObject
        // clips at its box by default, and the icon is an inline element that
        // sits on a text baseline inside it — together those shaved the bottom
        // of the circle. The flex wrapper (line-height 0) centres the icon
        // geometrically instead of typographically.
        <foreignObject
          x={labelX - 1}
          y={midY - TOKEN_ICON_PX / 2 - 1}
          width={TOKEN_ICON_PX + 2}
          height={TOKEN_ICON_PX + 2}
          style={{ pointerEvents: 'none', overflow: 'visible' }}
        >
          <div
            style={{
              display: 'flex',
              width: '100%',
              height: '100%',
              alignItems: 'center',
              justifyContent: 'center',
              lineHeight: 0,
            }}
          >
            <TokenIcon symbol={iconSymbol!} size="sm" />
          </div>
        </foreignObject>
      )}
      <text
        x={showIcon ? labelX + TOKEN_ICON_PX + 4 : labelX}
        y={midY}
        textAnchor={n.stage === 2 ? 'end' : 'start'}
        dominantBaseline="middle"
        fontSize={10}
        fill={palette.labels.default}
        // The halo: labels regularly sit on top of ribbons, and a stroke in
        // the surface colour painted UNDER the glyphs keeps them readable on
        // any lane colour in either theme.
        stroke={surface}
        strokeWidth={3}
        style={{
          paintOrder: 'stroke',
          ...(hovered && clickable ? { textDecoration: 'underline' } : {}),
        }}
      >
        {clampLabel(n.label)}
        {clickable ? ' ↗' : ''}
      </text>
    </g>
  )
}

/** Full-precision tooltip text (design-system rule 4). */
function tooltipFor(link: LaidOutSankeyLink, labelOf: (id: string) => string): string {
  const head = `${labelOf(link.source)} → ${labelOf(link.target)}`
  const usd = `≈ $${link.value.toLocaleString('en-US', { maximumFractionDigits: 2 })} · ${link.count} commitment${link.count === 1 ? '' : 's'}`
  const perToken = link.tokens
    .map((t) => {
      const { full } = formatTokenAmount(t.raw, t.decimals)
      return `${full} ${t.symbol} (${t.count})`
    })
    .join('\n')
  return `${head}\n${usd}\n${perToken}`
}

function stripKind(id: string): string {
  const idx = id.indexOf(':')
  return idx === -1 ? id : id.slice(idx + 1)
}

function nodeColor(kind: SankeyNodeKind, palette: ReturnType<typeof getGraphPalette>): string {
  switch (kind) {
    case 'token':
      return palette.nodes.commitment
    case 'arbiter':
      return palette.nodes.operator
    case 'counterparty':
      return palette.nodes.address
    case 'committer':
      return palette.nodes.fanIn
    // Allocation middle column. Free is the quiet default fill (idle capital
    // shouldn't compete for attention); encumbered borrows the commitment
    // colour, since that ribbon IS the commitment.
    case 'free':
      return palette.nodes.fillDefault
    case 'encumbered':
      return palette.nodes.commitment
    case 'commitment':
      return palette.nodes.commitment
    case 'status':
      return palette.nodes.fillDefault
  }
}
