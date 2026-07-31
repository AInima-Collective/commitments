import { formatDuration } from '../../lib/format'

export type CountdownTone = 'success' | 'warn' | 'danger' | 'info'

export interface CountdownProps {
  label: string
  elapsed: number
  total: number
  tone?: CountdownTone
}

export function Countdown({ label, elapsed, total, tone = 'warn' }: CountdownProps) {
  const remaining = Math.max(0, total - elapsed)
  const pct = total > 0 ? Math.min(100, (elapsed / total) * 100) : 0
  const valueText = `${formatDuration(remaining)} remaining of ${formatDuration(total)}`
  return (
    <div className="ds-countdown">
      <div className="ds-countdown-header">
        <span className="ds-countdown-label">{label}</span>
        <span className="ds-countdown-value">
          {formatDuration(remaining)} remaining · {formatDuration(total)} window
        </span>
      </div>
      <div
        className="ds-countdown-track"
        role="progressbar"
        aria-label={label}
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuetext={valueText}
      >
        <div className="ds-countdown-fill" data-tone={tone} style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
}
