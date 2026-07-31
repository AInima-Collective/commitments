import { useCallback, useMemo, useState, type ReactNode } from 'react'
import { Skeleton } from './Skeleton'

export type DataTableTone = 'neutral' | 'info' | 'success' | 'warn' | 'danger'
export type DataTableSize = 'sm' | 'md' | 'lg'
export type DataTableDensity = 'compact' | 'regular'
export type SortDirection = 'asc' | 'desc'

export type DataTableSort = {
  columnId: string
  direction: SortDirection
}

export type DataTableColumn<T> = {
  /** Stable column id used in sort state. */
  id: string
  /** Header content. */
  header: ReactNode
  /** Render the cell for a row. */
  render: (row: T) => ReactNode
  /** Allow this column to be sorted via header click. */
  sortable?: boolean
  /** Cell + header alignment. Default `'left'`. */
  align?: 'left' | 'right' | 'center'
  /** CSS width for the column (`<col>` width). */
  width?: string
}

export type DataTableProps<T> = {
  /** Column definitions. Render order matches array order. */
  columns: DataTableColumn<T>[]
  /** Rows. The component does not sort or filter — pass already-prepared data. */
  rows: T[]
  /** Stable row key function. Avoid index-based keys. */
  getRowKey: (row: T) => string
  /** Per-row tone — forwarded to the `<tr>` `data-tone` attribute. */
  rowTone?: (row: T) => DataTableTone | undefined
  /** Click handler. When provided, rows render with cursor:pointer + button semantics. */
  onRowClick?: (row: T) => void
  /** Controlled sort. Pair with `onSortChange`. */
  sort?: DataTableSort
  /** Initial sort in uncontrolled mode. */
  defaultSort?: DataTableSort
  /** Notified when the user changes the sort by clicking a header. */
  onSortChange?: (sort: DataTableSort) => void
  /** Show skeleton rows instead of `rows` content. */
  isLoading?: boolean
  /** Number of skeleton rows when `isLoading`. Default 6. */
  loadingRows?: number
  /** Rendered when `rows.length === 0` and `!isLoading`. */
  emptyState?: ReactNode
  /** Visual scale. Default `'md'`. */
  size?: DataTableSize
  /** Padding density. Default `'regular'`. */
  density?: DataTableDensity
  /** ARIA label naming the table content (e.g. "your commitments"). */
  'aria-label'?: string
  /** Extra class names appended to the root. */
  className?: string
}

/**
 * Generic sortable table over `.ds-table` CSS. No protocol vocabulary —
 * column renderers receive a typed row and return ReactNode.
 *
 * Sort is fully controlled (`sort` + `onSortChange`) or fully uncontrolled
 * (`defaultSort`); pages own state. The component never mutates `rows` —
 * pass already-sorted, already-filtered data.
 */
export function DataTable<T>({
  columns,
  rows,
  getRowKey,
  rowTone,
  onRowClick,
  sort: controlledSort,
  defaultSort,
  onSortChange,
  isLoading,
  loadingRows = 6,
  emptyState,
  size = 'md',
  density = 'regular',
  'aria-label': ariaLabel,
  className,
}: DataTableProps<T>) {
  const [uncontrolledSort, setUncontrolledSort] = useState<DataTableSort | undefined>(defaultSort)
  const isControlled = controlledSort !== undefined
  const sort = isControlled ? controlledSort : uncontrolledSort

  const handleSortClick = useCallback(
    (columnId: string) => {
      const next: DataTableSort =
        sort?.columnId === columnId
          ? { columnId, direction: sort.direction === 'asc' ? 'desc' : 'asc' }
          : { columnId, direction: 'asc' }
      if (!isControlled) setUncontrolledSort(next)
      onSortChange?.(next)
    },
    [sort, isControlled, onSortChange],
  )

  const cls = ['ds-table', 'ds-data-table', className].filter(Boolean).join(' ')

  const skeletonRows = useMemo(
    () => Array.from({ length: loadingRows }, (_, i) => i),
    [loadingRows],
  )

  return (
    <div className="ds-data-table-wrap" data-size={size} data-density={density}>
      <table className={cls} aria-label={ariaLabel}>
        {columns.some((c) => c.width) && (
          <colgroup>
            {columns.map((c) => (
              <col key={c.id} style={c.width ? { width: c.width } : undefined} />
            ))}
          </colgroup>
        )}
        <thead>
          <tr>
            {columns.map((col) => {
              const isSorted = sort?.columnId === col.id
              const ariaSort = isSorted
                ? sort.direction === 'asc'
                  ? 'ascending'
                  : 'descending'
                : col.sortable
                ? 'none'
                : undefined
              return (
                <th
                  key={col.id}
                  scope="col"
                  aria-sort={ariaSort}
                  data-align={col.align ?? 'left'}
                >
                  {col.sortable ? (
                    <button
                      type="button"
                      className="ds-data-table-sort"
                      onClick={() => handleSortClick(col.id)}
                      data-active={isSorted ? 'true' : 'false'}
                    >
                      {col.header}
                      <span className="ds-data-table-sort-indicator" aria-hidden>
                        {isSorted ? (sort.direction === 'asc' ? '↑' : '↓') : '⇅'}
                      </span>
                    </button>
                  ) : (
                    col.header
                  )}
                </th>
              )
            })}
          </tr>
        </thead>
        <tbody>
          {isLoading ? (
            skeletonRows.map((i) => (
              <tr key={`skeleton-${i}`} aria-hidden>
                {columns.map((col) => (
                  <td key={col.id} data-align={col.align ?? 'left'}>
                    <Skeleton width="80%" />
                  </td>
                ))}
              </tr>
            ))
          ) : rows.length === 0 ? (
            <tr>
              <td colSpan={columns.length} className="ds-data-table-empty">
                {emptyState ?? <span className="ds-muted">No rows.</span>}
              </td>
            </tr>
          ) : (
            rows.map((row) => {
              const tone = rowTone?.(row)
              const interactive = !!onRowClick
              return (
                <tr
                  key={getRowKey(row)}
                  data-tone={tone}
                  data-interactive={interactive ? 'true' : undefined}
                  tabIndex={interactive ? 0 : undefined}
                  role={interactive ? 'button' : undefined}
                  onClick={
                    interactive
                      ? (e) => {
                          // React portals bubble synthetic events through the
                          // React tree, so interactions inside a modal opened
                          // by a row-cell action land here even though their
                          // DOM target lives under document.body. Only a
                          // target physically inside the row counts as a
                          // row click.
                          if (!e.currentTarget.contains(e.target as Node)) return
                          onRowClick(row)
                        }
                      : undefined
                  }
                  onKeyDown={
                    interactive
                      ? (e) => {
                          // Only when the row itself is focused — interactive
                          // cell content (and portaled overlays) handle their
                          // own keys.
                          if (e.target !== e.currentTarget) return
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault()
                            onRowClick(row)
                          }
                        }
                      : undefined
                  }
                >
                  {columns.map((col) => (
                    <td key={col.id} data-align={col.align ?? 'left'}>
                      {col.render(row)}
                    </td>
                  ))}
                </tr>
              )
            })
          )}
        </tbody>
      </table>
    </div>
  )
}
