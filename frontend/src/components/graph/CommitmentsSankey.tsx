import { useMemo, useState } from 'react'
import type { Address } from 'viem'

import {
  buildSankey,
  layoutSankey,
  type SankeyMode,
  type SankeyScope,
  type SankeyWeight,
} from '../../lib/graph/buildSankey'
import { getGraphPalette } from '../../lib/graph/palette'
import type { LaidOutSankeyLink, SankeyNodeKind } from '../../lib/graph/types'
import { formatTokenAmount } from '../../lib/format'
import type { ProtocolCommitmentRow } from '../../hooks/useProtocolEntityList'
import { useAssetPrices } from '../../hooks/useAssetPrices'
import { useTokenMetaMap } from '../../hooks/useTokenMeta'
import { Notice, ViewToggle } from '../ui'
import { useTheme } from '../ui/useTheme'

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
}: Props) {
  const { theme } = useTheme()
  // Re-resolve the palette when the theme changes (CSS-cascade re-read).
  // eslint-disable-next-line react-hooks/exhaustive-deps -- theme drives CSS-cascade re-resolve, see frontend/docs/eslint-disable-rationale.md §Pattern-5
  const palette = useMemo(() => getGraphPalette(), [theme])

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
      }),
    [commitments, metaFor, getPrice, weight, scope, mode, freeByToken, exactValue],
  )

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
          {STAGE_TITLES[mode].map((title, i, all) => {
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
              {layout.links.map((l) => (
                <SankeyRibbon key={`${l.source}->${l.target}`} link={l} palette={palette} />
              ))}
            </g>

            {/* Nodes */}
            {layout.nodes.map((n) => (
              <g key={n.id}>
                <rect
                  x={n.x}
                  y={n.y0}
                  width={NODE_WIDTH}
                  height={Math.max(1, n.y1 - n.y0)}
                  fill={nodeColor(n.kind, palette)}
                >
                  <title>{n.label}</title>
                </rect>
                <text
                  x={n.stage === 2 ? n.x - 4 : n.x + NODE_WIDTH + 4}
                  y={(n.y0 + n.y1) / 2}
                  textAnchor={n.stage === 2 ? 'end' : 'start'}
                  dominantBaseline="middle"
                  fontSize={10}
                  fill={palette.labels.default}
                >
                  {n.label}
                </text>
              </g>
            ))}
          </g>
        </svg>
      </div>
    </div>
  )
}

function SankeyRibbon({
  link,
  palette,
}: {
  link: LaidOutSankeyLink
  palette: ReturnType<typeof getGraphPalette>
}) {
  // Colour by where the ribbon LANDS when that says something, otherwise by
  // where it comes from. In allocation mode every ribbon leaves the same token
  // node, so colouring by source painted the whole diagram one grey and the
  // question it exists to answer — how much of this is working — could not be
  // read off it. The palette is deliberately near-monochrome, so the signal is
  // weight rather than hue: idle capital recedes, committed capital holds.
  const idle = link.targetKind === 'free'
  const kind = link.targetKind === 'free' || link.targetKind === 'encumbered'
    ? link.targetKind
    : link.sourceKind
  return (
    <path
      d={link.path}
      stroke={nodeColor(kind, palette)}
      strokeOpacity={idle ? 0.18 : 0.45}
      strokeWidth={link.width}
    >
      <title>{tooltipFor(link)}</title>
    </path>
  )
}

/** Full-precision tooltip text (design-system rule 4). */
function tooltipFor(link: LaidOutSankeyLink): string {
  const head = `${stripKind(link.source)} → ${stripKind(link.target)}`
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
    case 'status':
      return palette.nodes.fillDefault
  }
}
