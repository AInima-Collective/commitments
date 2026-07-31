import type { ReactNode } from 'react'

export type StatBlockTone = 'neutral' | 'positive' | 'negative' | 'accent'

export interface StatBlockProps {
  label: string
  value: ReactNode
  loading?: boolean
  /** Optional caption rendered below the value — delta, qualifier, etc. */
  meta?: ReactNode
  /** Tone applied to the value color. Defaults to neutral. */
  tone?: StatBlockTone
}

/**
 * Stat surface — value on top, uppercase tracked label below, optional meta
 * line. Composes from `.ds-stat / .ds-stat-value / .ds-stat-label` /
 * `.ds-stat-meta` in tokens.css. Used inside `.ds-stat-grid` for headline
 * metrics or in any card / inline context that needs the value+label
 * vocabulary.
 *
 * Sized by the type scale (--text-xl value, --text-xs label); when the
 * value contains a `<UsdAmount/>` or `<TokenAmount/>` the inner primitive
 * wins on size — pass `size="display"` etc. on the child to scale up.
 */
export function StatBlock({ label, value, loading = false, meta, tone = 'neutral' }: StatBlockProps) {
  const displayValue = loading || value == null ? '---' : value
  const toneClass =
    tone === 'positive' ? ' ds-stat--positive'
    : tone === 'negative' ? ' ds-stat--negative'
    : tone === 'accent' ? ' ds-stat--accent'
    : ''

  return (
    <div className={`ds-stat${toneClass}`}>
      <div className="ds-stat-value">{displayValue}</div>
      <div className="ds-stat-label">{label}</div>
      {meta !== undefined && <div className="ds-stat-meta">{meta}</div>}
    </div>
  )
}
