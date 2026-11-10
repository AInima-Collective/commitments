import { Button } from './Button'

export interface PaginationProps {
  /** Index of the first row on this page. */
  offset: number
  /** Rows per page; Previous steps back by this much. */
  limit: number
  /** Rows on this page. */
  count: number
  /** Rows across every page. */
  total: number
  /** Called with the offset of the page to show. */
  onOffsetChange: (offset: number) => void
  /** Disables both buttons while a page loads. */
  loading?: boolean
  'aria-label'?: string
  className?: string
}

/**
 * Previous / Next pager for an offset-paged list, with the range shown
 * between. Controlled only: the offset is what the caller fetches by, so the
 * caller always owns it and an uncontrolled mode would have no reader.
 */
export function Pagination({
  offset,
  limit,
  count,
  total,
  onOffsetChange,
  loading = false,
  'aria-label': ariaLabel,
  className,
}: PaginationProps) {
  const cls = ['ds-row ds-row-2', className].filter(Boolean).join(' ')
  return (
    <nav className={cls} aria-label={ariaLabel} style={{ justifyContent: 'space-between' }}>
      <Button
        size="sm"
        variant="ghost"
        disabled={offset === 0 || loading}
        onClick={() => onOffsetChange(Math.max(0, offset - limit))}
      >
        Previous
      </Button>
      <span className="ds-text-xs ds-subtle">
        {total === 0 ? 'No rows' : `${offset + 1}–${offset + count} of ${total}`}
      </span>
      <Button
        size="sm"
        variant="ghost"
        disabled={offset + count >= total || loading}
        onClick={() => onOffsetChange(offset + count)}
      >
        Next
      </Button>
    </nav>
  )
}
