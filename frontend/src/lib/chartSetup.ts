import {
  CategoryScale,
  Chart as ChartJS,
  Filler,
  LineController,
  LineElement,
  LinearScale,
  PointElement,
  TimeScale,
  Tooltip,
} from 'chart.js'
import 'chartjs-adapter-date-fns'

let registered = false

/**
 * Register the subset of chart.js controllers/elements/scales we use in the
 * commitments frontend. We import per-piece (instead of `chart.js/auto`) to
 * keep the bundle lean — chart.js auto registers ~250 KB; this set is ~70 KB.
 *
 * Idempotent: safe to call from every chart component's module load.
 */
export function ensureChartSetup() {
  if (registered) return
  ChartJS.register(
    LineController,
    LineElement,
    PointElement,
    LinearScale,
    CategoryScale,
    TimeScale,
    Filler,
    Tooltip,
  )
  registered = true
}

/**
 * Read a CSS custom property from the document root. Returns the trimmed
 * value or an empty string when the variable isn't defined yet — chart.js
 * falls back to its own internal defaults in that case.
 *
 * Don't memoize — theme switches change `:root` values on the fly and we
 * want charts to re-read after a re-render.
 */
export function cssVar(name: string): string {
  if (typeof document === 'undefined') return ''
  const v = getComputedStyle(document.documentElement).getPropertyValue(name)
  return v.trim()
}

export type ChartTone = 'accent' | 'success' | 'warn' | 'error' | 'muted'

/**
 * Resolve the line color + soft-fill color for a chart series tone, sourced
 * from the design tokens in `styles/tokens.css`. Returns CSS color strings
 * (hex, rgba, oklab, …) ready for chart.js dataset properties — whatever
 * the token resolves to in the current theme.
 */
export function toneColors(tone: ChartTone): { line: string; fill: string } {
  switch (tone) {
    case 'success':
      return { line: cssVar('--success'), fill: cssVar('--success-soft') }
    case 'warn':
      return { line: cssVar('--warn'), fill: cssVar('--warn-soft') }
    case 'error':
      return { line: cssVar('--error'), fill: cssVar('--error-soft') }
    case 'muted':
      return { line: cssVar('--text-subtle'), fill: 'transparent' }
    case 'accent':
    default:
      return { line: cssVar('--accent'), fill: cssVar('--accent-soft') }
  }
}
