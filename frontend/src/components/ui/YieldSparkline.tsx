export type YieldSparklineTone = 'neutral' | 'info' | 'success' | 'warn' | 'danger' | 'accent'
export type YieldSparklineSize = 'sm' | 'md' | 'lg'

export interface YieldSparklineProps {
  /** Time-ordered numeric series. Min 2 points. Decimal fractions are fine
   * (e.g. APY samples) — the component normalises to its own viewBox. */
  values: number[]
  /** Width in CSS px (default sized via `size`). */
  width?: number
  /** Height in CSS px (default sized via `size`). */
  height?: number
  /** Stroke tone. Defaults to `accent`. */
  tone?: YieldSparklineTone
  /** Show min/max ticks at the right edge. Caller supplies `format`. */
  showRange?: boolean
  /** Show a filled area under the line. */
  showArea?: boolean
  /** Optional formatter for tooltip + range labels. */
  format?: (n: number) => string
  /** Accessible label for the chart. */
  ariaLabel?: string
  size?: YieldSparklineSize
}

const SIZE_DIMS: Record<YieldSparklineSize, { w: number; h: number }> = {
  sm: { w: 64, h: 18 },
  md: { w: 120, h: 32 },
  lg: { w: 240, h: 56 },
}

const DEFAULT_FORMAT = (n: number) => n.toFixed(2)

/**
 * YieldSparkline — inline SVG sparkline for time-series numeric data.
 *
 * Used for trailing APY, vault NAV deltas, utilization curves, oracle drift —
 * any compact chart that needs to read at a glance inside a stat block.
 *
 * Pure SVG, no chart library. The path renders in `currentColor`-derived tone
 * so it inherits sensibly anywhere it's dropped (table cell, hero card,
 * sidebar row). The endpoint dot pings in `--accent` to anchor the eye on
 * the most recent sample.
 */
export function YieldSparkline({
  values,
  width,
  height,
  tone = 'accent',
  showRange = false,
  showArea = false,
  format = DEFAULT_FORMAT,
  ariaLabel,
  size = 'md',
}: YieldSparklineProps) {
  const dims = SIZE_DIMS[size]
  const w = width ?? dims.w
  const h = height ?? dims.h

  if (values.length < 2) {
    return (
      <span
        className="ds-sparkline ds-sparkline--empty"
        style={{ width: w, height: h }}
        role="img"
        aria-label={ariaLabel ?? 'sparkline'}
      >
        <span className="ds-subtle ds-text-xs">—</span>
      </span>
    )
  }

  const min = Math.min(...values)
  const max = Math.max(...values)
  const range = max - min || 1
  const stepX = w / (values.length - 1)
  const padY = 2

  const points = values.map((v, i) => {
    const x = i * stepX
    const y = h - padY - ((v - min) / range) * (h - padY * 2)
    return [x, y] as const
  })

  const pathD = points.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(2)},${y.toFixed(2)}`).join(' ')
  const areaD = `${pathD} L${(w).toFixed(2)},${h.toFixed(2)} L0,${h.toFixed(2)} Z`
  const last = points[points.length - 1]
  const first = values[0]
  const lastV = values[values.length - 1]
  const trend = lastV >= first ? 'up' : 'down'

  return (
    <span
      className="ds-sparkline"
      data-tone={tone}
      data-trend={trend}
      data-size={size}
      role="img"
      aria-label={ariaLabel ?? `sparkline ${format(first)} → ${format(lastV)}`}
      title={`${format(first)} → ${format(lastV)} · min ${format(min)} · max ${format(max)}`}
    >
      <svg
        className="ds-sparkline-svg"
        viewBox={`0 0 ${w} ${h}`}
        width={w}
        height={h}
        preserveAspectRatio="none"
        aria-hidden="true"
      >
        {showArea && <path className="ds-sparkline-area" d={areaD} />}
        <path className="ds-sparkline-path" d={pathD} />
        <circle
          className="ds-sparkline-dot"
          cx={last[0]}
          cy={last[1]}
          r={size === 'sm' ? 1.5 : 2.25}
        />
      </svg>
      {showRange && (
        <span className="ds-sparkline-range">
          <span className="ds-sparkline-range-max ds-mono-num">{format(max)}</span>
          <span className="ds-sparkline-range-min ds-mono-num">{format(min)}</span>
        </span>
      )}
    </span>
  )
}
