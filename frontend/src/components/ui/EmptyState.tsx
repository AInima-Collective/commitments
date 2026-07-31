import type { ReactNode } from 'react'

export interface EmptyStateProps {
  /** Uppercase mono title — e.g. "NO COMMITMENTS". */
  title: string
  /** Sentence-case explanatory text rendered below the title. */
  description?: ReactNode
  /** Optional CTA slot — typically a `<button class="ds-btn">` or a `<Link>`. */
  action?: ReactNode
  /** Optional decorative glyph rendered above the title. ASCII / unicode only —
   *  this stays in the monospace aesthetic without dragging in an icon library. */
  glyph?: ReactNode
  /** Extra class names appended to the root element. */
  className?: string
}

/**
 * Empty / zero-data placeholder used by lists and panels. TUI-styled with
 * mono font and dotted border; emits `role="status"` so screen readers
 * announce the empty state. Composes via the title + description + action
 * vocabulary documented in components/ui/CONTRIBUTING.md §1 (composition).
 *
 * Use this for "nothing to claim", "no commitments yet", and similar
 * zero-data slots. For inline state announcements next to live data, use
 * {@link Notice} instead.
 */
export function EmptyState({
  title,
  description,
  action,
  glyph,
  className,
}: EmptyStateProps) {
  const cls = ['ds-empty-state', className].filter(Boolean).join(' ')
  return (
    <div role="status" className={cls}>
      {glyph !== undefined && (
        <span className="ds-empty-state-glyph" aria-hidden>
          {glyph}
        </span>
      )}
      <h3 className="ds-empty-state-title">{title}</h3>
      {description !== undefined && (
        <span className="ds-empty-state-description">{description}</span>
      )}
      {action !== undefined && (
        <span className="ds-empty-state-action">{action}</span>
      )}
    </div>
  )
}
