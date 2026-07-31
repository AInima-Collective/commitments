export type StrategyFlowTone = 'neutral' | 'info' | 'success' | 'warn' | 'danger'

export interface StrategyAllocation {
  /** Strategy or venue label (e.g. "Aave wstETH supply", "Avantis ETH-USDC"). */
  label: string
  /** Allocation weight in basis points (10000 = 100%). */
  bps: number
  tone?: StrategyFlowTone
  /** Optional secondary line — APY, market count, expected utilisation. */
  detail?: string
  /** Optional anchor — caller renders the row as a link by passing `href`. */
  href?: string
}

export interface StrategyFlowSource {
  /** Primary label for the capital source (e.g. "Vault deposits"). */
  label: string
  /** Optional sub-label (e.g. "23.4M USDC"). */
  sub?: string
}

export interface StrategyFlowProps {
  source: StrategyFlowSource
  allocations: StrategyAllocation[]
  /** Optional caption rendered below the diagram. */
  caption?: string
}

/**
 * StrategyFlow — capital-routing diagram for vault strategies.
 *
 * Renders the source on the left and each strategy on the right with a
 * weighted hairline connector — stroke thickness scales with `bps`. The
 * aesthetic is intentionally restrained: it's a wiring diagram, not a Sankey.
 *
 * Pure presentational primitive. Caller resolves the strategy list (which is
 * usually domain data: protocol IDs, market addresses, …) and passes the
 * shape this component understands.
 */
export function StrategyFlow({ source, allocations, caption }: StrategyFlowProps) {
  const total = allocations.reduce((acc, a) => acc + a.bps, 0)
  const denom = total === 0 ? 1 : total
  const rowCount = allocations.length

  // SVG viewBox: 240w × (rowCount × 28 + 16)h. Connector starts at the right
  // edge of the source pill (x = 4) and ends at the left edge of the row
  // (x = 232). The Y endpoint walks down the rows in the same order the JSX
  // renders them, so visual + DOM order stay in lockstep.
  const rowHeight = 28
  const vbH = Math.max(rowCount, 1) * rowHeight + 16
  const sourceY = vbH / 2
  const xStart = 4
  const xEnd = 236

  return (
    <div className="ds-strategy-flow">
      <div className="ds-strategy-flow-grid">
        <div className="ds-strategy-flow-source">
          <div className="ds-strategy-flow-source-label">{source.label}</div>
          {source.sub && <div className="ds-strategy-flow-source-sub">{source.sub}</div>}
        </div>

        <svg
          className="ds-strategy-flow-svg"
          viewBox={`0 0 240 ${vbH}`}
          preserveAspectRatio="none"
          aria-hidden="true"
        >
          {allocations.map((a, i) => {
            const cy = i * rowHeight + rowHeight / 2 + 8
            const weight = (a.bps / denom) * 4 + 0.5
            // Smooth-ish elbow: cubic from sourceY → rowY, with control
            // points at midX so the curve eases horizontally before peeling
            // up/down to the row.
            const midX = (xStart + xEnd) / 2
            const d = `M${xStart},${sourceY} C${midX},${sourceY} ${midX},${cy} ${xEnd},${cy}`
            return (
              <path
                key={`${i}-${a.label}`}
                className="ds-strategy-flow-edge"
                data-tone={a.tone ?? 'neutral'}
                d={d}
                strokeWidth={weight}
              />
            )
          })}
        </svg>

        <ul className="ds-strategy-flow-list">
          {allocations.map((a, i) => {
            const pct = (a.bps / denom) * 100
            const Tag = a.href ? 'a' : ('div' as const)
            const props = a.href ? { href: a.href } : {}
            return (
              <li key={`${i}-${a.label}`} className="ds-strategy-flow-row">
                <Tag className="ds-strategy-flow-row-inner" {...props}>
                  <span
                    className="ds-strategy-flow-row-dot"
                    data-tone={a.tone ?? 'neutral'}
                    aria-hidden="true"
                  />
                  <span className="ds-strategy-flow-row-body">
                    <span className="ds-strategy-flow-row-label">{a.label}</span>
                    {a.detail && <span className="ds-strategy-flow-row-detail">{a.detail}</span>}
                  </span>
                  <span
                    className="ds-strategy-flow-row-pct ds-mono-num"
                    title={`${a.bps} bps · ${pct.toFixed(4)}%`}
                  >
                    {pct.toFixed(1)}%
                  </span>
                </Tag>
              </li>
            )
          })}
        </ul>
      </div>
      {caption && <p className="ds-strategy-flow-caption">{caption}</p>}
    </div>
  )
}
