import { useEffect, useMemo, useState, type CSSProperties } from 'react'
import { Line } from 'react-chartjs-2'
import type { ChartOptions } from 'chart.js'

import {
  ensureChartSetup,
  cssVar,
  toneColors,
  type ChartTone,
} from '../../lib/chartSetup'

ensureChartSetup()

export type TimeSeriesChartTone = ChartTone
export type TimeSeriesChartSize = 'sm' | 'md' | 'lg'
export type TimeSeriesChartRange = '1D' | '1W' | '1M' | '1Y' | 'ALL'

export interface TimeSeriesPoint {
  /** Unix seconds (or ms — chart uses ms internally; see `tUnit`). */
  t: number
  v: number
  /** When true, this segment renders with a dashed stroke (forecast band). */
  projected?: boolean
}

export interface TimeSeriesSeries {
  label: string
  data: TimeSeriesPoint[]
  tone?: TimeSeriesChartTone
}

export interface TimeSeriesChartProps {
  /** One or more series. Each series gets its own tone-derived line color. */
  series: TimeSeriesSeries[]
  /** Time unit of the `t` field. `s` = unix seconds (default), `ms` = unix ms. */
  tUnit?: 's' | 'ms'
  /** Y-axis value formatter (axis labels + tooltip body). */
  formatValue?: (v: number) => string
  /** Y-axis units suffix shown after each tooltip value. Pass an empty string to hide. */
  unit?: string
  /** Visual size — drives chart height. Width is always 100%. */
  size?: TimeSeriesChartSize
  /** Selected range. Controlled. */
  range?: TimeSeriesChartRange
  /** Default range when uncontrolled. Defaults to '1W'. */
  defaultRange?: TimeSeriesChartRange
  /** Range change callback; required when `range` is controlled. */
  onRangeChange?: (next: TimeSeriesChartRange) => void
  /** Hide the range selector chips. */
  hideRangeSelector?: boolean
  /** Custom set of ranges to surface (default ['1D','1W','1M','ALL']). */
  ranges?: TimeSeriesChartRange[]
  /**
   * Stack the series into bands whose heights sum to the total, instead of
   * overlaying independent lines.
   *
   * Use this only when the series are genuinely parts of a whole (free +
   * encumbered = balance). Stacking series that aren't additive makes the top
   * edge read as a total that means nothing. When stacked, each band is filled
   * against the one below it and the tooltip lists every band at that instant.
   */
  stacked?: boolean
  /** Accessible label for the chart container. */
  ariaLabel?: string
  /** Extra class names appended to the root. */
  className?: string
}

const SIZE_HEIGHT: Record<TimeSeriesChartSize, number> = {
  sm: 120,
  md: 220,
  lg: 320,
}

const RANGE_SECONDS: Record<TimeSeriesChartRange, number | null> = {
  '1D': 24 * 60 * 60,
  '1W': 7 * 24 * 60 * 60,
  '1M': 30 * 24 * 60 * 60,
  '1Y': 365 * 24 * 60 * 60,
  ALL: null,
}

const DEFAULT_FORMAT_VALUE = (v: number) => {
  if (!Number.isFinite(v)) return '—'
  if (Math.abs(v) >= 1e9) return `${(v / 1e9).toFixed(2)}B`
  if (Math.abs(v) >= 1e6) return `${(v / 1e6).toFixed(2)}M`
  if (Math.abs(v) >= 1e3) return `${(v / 1e3).toFixed(2)}K`
  return v.toFixed(2)
}

function toMs(t: number, unit: 's' | 'ms') {
  return unit === 's' ? t * 1000 : t
}

function filterByRange(
  points: TimeSeriesPoint[],
  range: TimeSeriesChartRange,
  tUnit: 's' | 'ms',
): TimeSeriesPoint[] {
  const windowSec = RANGE_SECONDS[range]
  if (windowSec === null) return points
  const nowMs = Date.now()
  const cutoffMs = nowMs - windowSec * 1000
  return points.filter((p) => toMs(p.t, tUnit) >= cutoffMs)
}

/**
 * TimeSeriesChart — full-axis line chart for vault metrics over time.
 *
 * Sister primitive to `YieldSparkline`: sparkline is for inline at-a-glance
 * use, this is for tab/panel-sized views that need axes, tooltips, and a
 * range selector. Composes via the series → tone → range vocabulary in
 * components/ui/CONTRIBUTING.md §1; tones map to design tokens via
 * `toneColors` so no hex literals leak into component CSS.
 *
 * Pass `stacked` when the series are additive parts of a whole — the bands
 * then sum to a meaningful total and the tooltip gains a total footer.
 */
export function TimeSeriesChart({
  series,
  tUnit = 's',
  formatValue = DEFAULT_FORMAT_VALUE,
  unit,
  size = 'md',
  range: controlledRange,
  defaultRange = '1W',
  onRangeChange,
  hideRangeSelector,
  ranges = ['1D', '1W', '1M', 'ALL'],
  stacked = false,
  ariaLabel,
  className,
}: TimeSeriesChartProps) {
  const isControlled = controlledRange !== undefined
  const [internalRange, setInternalRange] = useState<TimeSeriesChartRange>(defaultRange)
  const range = isControlled ? controlledRange : internalRange

  const handleRange = (next: TimeSeriesChartRange) => {
    if (!isControlled) setInternalRange(next)
    onRangeChange?.(next)
  }

  // Re-resolve theme tokens whenever the document theme attribute flips.
  // Cheaper than subscribing to system colorScheme — just re-render on toggle.
  const [themeTick, setThemeTick] = useState(0)
  useEffect(() => {
    if (typeof document === 'undefined') return
    const el = document.documentElement
    const observer = new MutationObserver(() => setThemeTick((t) => t + 1))
    observer.observe(el, { attributes: true, attributeFilter: ['data-theme', 'class'] })
    return () => observer.disconnect()
  }, [])
  // Read tokens via cssVar. The themeTick dependency forces a fresh read on toggle.
  void themeTick
  const axisColor = cssVar('--text-subtle')
  const gridColor = cssVar('--border')
  const surfaceColor = cssVar('--surface')
  const fontMono = cssVar('--font-mono') || 'monospace'

  const filtered = useMemo(
    () =>
      series.map((s) => ({
        ...s,
        data: filterByRange(s.data, range, tUnit),
      })),
    [series, range, tUnit],
  )

  const chartData = useMemo(() => {
    return {
      datasets: filtered.map((s, i) => {
        const colors = toneColors(s.tone ?? 'accent')
        const hasProjected = s.data.some((p) => p.projected)
        return {
          label: s.label,
          data: s.data.map((p) => ({ x: toMs(p.t, tUnit), y: p.v })),
          borderColor: colors.line,
          backgroundColor: colors.fill,
          borderWidth: 1.5,
          pointRadius: 0,
          pointHoverRadius: 3,
          pointHoverBorderWidth: 2,
          pointHoverBackgroundColor: colors.line,
          pointHoverBorderColor: surfaceColor,
          tension: 0,
          // Stacked bands fill down to the band below ('-1'); the bottom band
          // and every unstacked series fill to the axis. Chart.js reads '-1'
          // as a relative dataset index, so this only works because the
          // datasets are emitted in the same order as `series`.
          fill: stacked ? (i === 0 ? 'origin' : '-1') : true,
          // Render dashed when the dominant samples are projected.
          borderDash: hasProjected ? [4, 4] : undefined,
        }
      }),
    }
    // surfaceColor folded in via dependency on themeTick (already triggers parent re-render)
  }, [filtered, tUnit, surfaceColor, stacked])

  const options: ChartOptions<'line'> = useMemo(
    () => ({
      responsive: true,
      maintainAspectRatio: false,
      animation: false,
      interaction: { mode: 'index', intersect: false },
      scales: {
        x: {
          type: 'time',
          time: {
            tooltipFormat: 'MMM d, HH:mm',
            displayFormats: {
              millisecond: 'HH:mm:ss',
              second: 'HH:mm:ss',
              minute: 'HH:mm',
              hour: 'HH:mm',
              day: 'MMM d',
              week: 'MMM d',
              month: 'MMM yyyy',
              year: 'yyyy',
            },
          },
          ticks: {
            color: axisColor,
            font: { family: fontMono, size: 10 },
            // Without a cap, chart.js emits one tick per data point: a busy
            // account produced ~60 rotated timestamps overlapping into a grey
            // smear. Eight upright labels is the most this reads at, and
            // `maxRotation: 0` keeps them horizontal — a rotated mono label is
            // both harder to read and taller, which eats the plot area.
            autoSkip: true,
            maxTicksLimit: 8,
            maxRotation: 0,
            autoSkipPadding: 16,
          },
          grid: { color: gridColor, tickColor: gridColor },
          border: { color: gridColor },
        },
        y: {
          // Chart.js sums same-stack datasets when `stacked` is true; the band
          // heights then add up to the total instead of overlapping.
          stacked,
          ticks: {
            color: axisColor,
            font: { family: fontMono, size: 10 },
            callback: (v) => formatValue(typeof v === 'number' ? v : Number(v)),
          },
          grid: { color: gridColor, tickColor: gridColor },
          border: { color: gridColor },
        },
      },
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: surfaceColor,
          borderColor: gridColor,
          borderWidth: 1,
          titleColor: axisColor,
          bodyColor: cssVar('--text'),
          titleFont: { family: fontMono, size: 11 },
          bodyFont: { family: fontMono, size: 12 },
          // Chart.js defaults `footerColor` to white, which rendered the
          // stacked total invisibly against this near-white surface in light
          // theme — the tooltip just had an unexplained blank strip. Every
          // colour on this tooltip has to be a token, not a library default.
          footerColor: cssVar('--text'),
          footerFont: { family: fontMono, size: 12 },
          footerMarginTop: 6,
          padding: 8,
          displayColors: true,
          callbacks: {
            label: (ctx) => {
              const yRaw = ctx.parsed.y
              if (yRaw === null || yRaw === undefined) return ctx.dataset.label ?? ''
              const formatted = formatValue(yRaw)
              const suffix = unit ? ` ${unit}` : ''
              return `${ctx.dataset.label ?? ''}  ${formatted}${suffix}`
            },
            // Stacked bands are parts of a whole, and the whole is the number
            // the reader actually came for. Chart.js reports each band's own
            // value in `parsed.y` (stacking happens at render), so the total
            // has to be summed here.
            footer: stacked
              ? (items) => {
                  const total = items.reduce((acc, it) => acc + (it.parsed.y ?? 0), 0)
                  return `total  ${formatValue(total)}${unit ? ` ${unit}` : ''}`
                }
              : undefined,
          },
        },
      },
    }),
    [axisColor, gridColor, surfaceColor, fontMono, formatValue, unit, stacked],
  )

  const containerStyle: CSSProperties = {
    height: SIZE_HEIGHT[size],
    width: '100%',
  }

  const cls = ['ds-time-series', className].filter(Boolean).join(' ')

  // Empty state
  const totalPoints = filtered.reduce((acc, s) => acc + s.data.length, 0)
  const empty = totalPoints === 0

  // Re-mount the canvas when theme flips so chart.js re-reads the new
  // resolved colors instead of keeping stale ones from the previous theme.
  // themeTick already increments inside the MutationObserver effect; using
  // it directly as the key avoids a redundant setState chain.
  const canvasKey = themeTick

  return (
    <div
      className={cls}
      data-size={size}
      data-stacked={stacked ? 'true' : undefined}
      role="figure"
      aria-label={ariaLabel ?? 'Time-series chart'}
    >
      {!hideRangeSelector && (
        <div className="ds-time-series-range" role="tablist" aria-label="Range">
          {ranges.map((r) => (
            <button
              key={r}
              type="button"
              role="tab"
              aria-selected={range === r}
              className="ds-tab ds-tab--xs"
              onClick={() => handleRange(r)}
            >
              {r}
            </button>
          ))}
        </div>
      )}
      <div style={containerStyle} className="ds-time-series-canvas">
        {empty ? (
          <div className="ds-time-series-empty ds-subtle ds-text-xs">
            No data in the selected range
          </div>
        ) : (
          <Line data={chartData} options={options} key={canvasKey} />
        )}
      </div>
    </div>
  )
}
