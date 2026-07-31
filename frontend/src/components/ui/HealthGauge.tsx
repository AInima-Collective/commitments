import { useId } from 'react'

export type HealthGaugeTone = 'neutral' | 'info' | 'success' | 'warn' | 'danger'
export type HealthGaugeSize = 'sm' | 'md' | 'lg'

export interface HealthGaugeZone {
  /** Upper bound of this zone in the same units as `value`. Zones are
   * contiguous: the first zone starts at `min`, the last zone ends at `max`.
   * The final zone's `to` should equal `max`. */
  to: number
  tone: HealthGaugeTone
  /** Optional short label rendered under the zone's right edge. */
  label?: string
}

export interface HealthGaugeProps {
  /** Current value — e.g. Aave Health Factor, collateralization ratio, LTV. */
  value: number
  /** Lower track bound. */
  min: number
  /** Upper track bound. Values past `max` clamp to 100% width. */
  max: number
  /** Contiguous zones describing the safety partition. */
  zones: HealthGaugeZone[]
  /** Optional caller-supplied formatter for the value display. */
  format?: (n: number) => string
  /** Optional row label rendered above the track. */
  label?: string
  /** Optional small caption below the track (e.g. threshold explanation). */
  caption?: string
  /** Optional comparison value rendered as a hairline tick (e.g. target HF). */
  target?: number
  /** Optional accessible name for screen readers. */
  ariaLabel?: string
  size?: HealthGaugeSize
}

const DEFAULT_FORMAT = (n: number) => n.toFixed(2)

/**
 * HealthGauge — linear safety gauge for collateralized vault positions.
 *
 * Used for: Aave health factor, LTV ratios, collateralization, any
 * threshold-driven safety read-out where zones have semantic meaning.
 *
 * Composition: caller passes the zone partition + current value. The
 * component never names the protocol-specific concept (HF, LTV) — that
 * belongs to a `components/protocol/` wrapper.
 */
export function HealthGauge({
  value,
  min,
  max,
  zones,
  format = DEFAULT_FORMAT,
  label,
  caption,
  target,
  ariaLabel,
  size = 'md',
}: HealthGaugeProps) {
  const id = useId()
  const span = max - min || 1
  const clampPct = (n: number) => Math.max(0, Math.min(100, ((n - min) / span) * 100))
  const pct = clampPct(value)
  const targetPct = target == null ? null : clampPct(target)

  const valueZone = zones.find((z) => value <= z.to) ?? zones[zones.length - 1]
  const valueTone = valueZone?.tone ?? 'neutral'

  // Compute zone widths from contiguous `to` boundaries. Each zone starts
  // where the previous one ended; the first zone starts at `min`.
  const segments = zones.map((z, i) => {
    const from = i === 0 ? min : zones[i - 1].to
    return {
      tone: z.tone,
      label: z.label,
      width: clampPct(z.to) - clampPct(from),
      to: z.to,
    }
  })

  return (
    <div className="ds-health-gauge" data-size={size}>
      {(label || target != null) && (
        <div className="ds-health-gauge-head">
          {label && <span className="ds-health-gauge-label">{label}</span>}
          {target != null && (
            <span className="ds-health-gauge-target" title={`target: ${format(target)}`}>
              target {format(target)}
            </span>
          )}
        </div>
      )}
      <div className="ds-health-gauge-row">
        <div
          className="ds-health-gauge-track"
          role="meter"
          aria-valuemin={min}
          aria-valuemax={max}
          aria-valuenow={value}
          aria-label={ariaLabel ?? label ?? 'health'}
          aria-describedby={caption ? `${id}-caption` : undefined}
        >
          {segments.map((s, i) => (
            <div
              key={`${i}-${s.to}`}
              className="ds-health-gauge-zone"
              data-tone={s.tone}
              style={{ width: `${s.width}%` }}
              title={s.label ? `${s.label} · ≤ ${format(s.to)}` : `≤ ${format(s.to)}`}
            />
          ))}
          {targetPct != null && (
            <div
              className="ds-health-gauge-target-tick"
              style={{ left: `${targetPct}%` }}
              aria-hidden="true"
            />
          )}
          <div
            className="ds-health-gauge-indicator"
            data-tone={valueTone}
            style={{ left: `${pct}%` }}
            title={`${format(value)}`}
            aria-hidden="true"
          />
        </div>
        <span className="ds-health-gauge-value" data-tone={valueTone} title={`${value}`}>
          {format(value)}
        </span>
      </div>
      <div className="ds-health-gauge-axis" aria-hidden="true">
        <span>{format(min)}</span>
        {segments.slice(0, -1).map((s, i) =>
          s.label ? (
            <span
              key={`lbl-${i}`}
              className="ds-health-gauge-axis-mid"
              style={{ left: `${clampPct(s.to)}%` }}
            >
              {s.label}
            </span>
          ) : null,
        )}
        <span>{format(max)}</span>
      </div>
      {caption && (
        <div className="ds-health-gauge-caption" id={`${id}-caption`}>
          {caption}
        </div>
      )}
    </div>
  )
}
