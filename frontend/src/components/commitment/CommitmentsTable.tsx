import { useMemo, type ReactNode } from 'react'
import {
  DataTable,
  TokenAmount,
  type DataTableColumn,
  type DataTableSort,
} from '../ui'
import {
  AmountCell,
  CopyableAddress,
  NameCell,
  RowResolveAction,
  StatusCell,
  type CommitmentsResolveContext,
  type TokenMetaResolver,
} from './commitmentCells'
import { useCommitmentLabelContext } from '../../hooks/useCommitmentLabelContext'
import { type ClaimableYieldEntry } from '../../lib/claimableYield'
import { type UnifiedRow } from '../../hooks/useUnifiedRows'
import { otherParty } from '../../lib/commitmentFilters'
import { claimableFor, rowTone, sumClaimableById } from '../../lib/commitmentRow'

/** @deprecated Use {@link CommitmentsResolveContext}; kept for existing callers. */
export type CommitmentsTableResolveContext = CommitmentsResolveContext

export interface CommitmentsTableProps {
  /** Already-filtered, already-sorted rows. Commitments + proposals are both
   *  accepted (proposals carry status PENDING). */
  rows: UnifiedRow[]
  onOpenRow: (row: UnifiedRow) => void
  /** Per-(token) decimals/symbol — amounts are denominated in each row's own
   *  backing token, never the vault share. */
  tokenMeta: TokenMetaResolver
  /** Cap the rendered rows (Dashboard preview = 5). Omit for the full list. */
  limit?: number
  /** Render the Yield column. Default false — pass `claimableEntries` alongside. */
  showYield?: boolean
  /** Live claimable-yield entries (per commitment+strategy). Summed per
   *  commitment id to fill the Yield column; absent rows render "—". */
  claimableEntries?: ClaimableYieldEntry[]
  /** When set, renders a per-row Resolve action (commitment rows only) that
   *  opens the resolve modal. */
  resolveContext?: CommitmentsResolveContext
  /** Controlled sort (Commitments page). Enables sortable headers when paired
   *  with `onSortChange`. */
  sort?: DataTableSort
  onSortChange?: (sort: DataTableSort) => void
  /** Applies a tag filter. When omitted, tag chips render as inert labels. */
  onSelectTag?: (tag: string) => void
  /** Tags currently applied as filters, so chips can render as active. */
  activeTags?: readonly string[]
  isLoading?: boolean
  emptyState?: ReactNode
  'aria-label'?: string
}

/**
 * Shared commitments table used by the Dashboard, Commitments page, and Vault
 * page. Columns: Commitment, Dir, Status, Role, Counterparty, Arbiter,
 * [Yield], Amount, [Resolve]. The parent owns filtering/sorting/slicing of
 * `rows`; this component only renders.
 *
 * The leading column is a name, not an id. Every cell it renders comes from
 * `commitmentCells` so the card layout shows the same name, the same status
 * rules, and the same tone for a given row — see that module for why.
 */
export function CommitmentsTable({
  rows,
  onOpenRow,
  tokenMeta,
  limit,
  showYield = false,
  claimableEntries,
  resolveContext,
  sort,
  onSortChange,
  onSelectTag,
  activeTags,
  isLoading,
  emptyState,
  'aria-label': ariaLabel = 'commitments',
}: CommitmentsTableProps) {
  const sortable = !!onSortChange
  const visibleRows = useMemo(
    () => (limit !== undefined ? rows.slice(0, limit) : rows),
    [rows, limit],
  )
  // Resolved against the visible rows only: the Dashboard renders five of them
  // and has no reason to pay for name resolution on the other four hundred.
  const labelContext = useCommitmentLabelContext(visibleRows, tokenMeta)

  // Sum claimable amounts per commitment id (a commitment can have several
  // strategy bindings). Amounts are in the commitment's own token, matching the
  // decimals used to render the Yield cell below.
  const claimableById = useMemo(() => sumClaimableById(claimableEntries), [claimableEntries])

  const columns = useMemo<DataTableColumn<UnifiedRow>[]>(() => {
    const cols: DataTableColumn<UnifiedRow>[] = [
      {
        id: 'id',
        header: 'commitment',
        // Wide enough for a real title to breathe; the cell clamps beyond it.
        width: '34%',
        sortable,
        render: (r) => (
          <NameCell row={r} ctx={labelContext} onSelectTag={onSelectTag} activeTags={activeTags} />
        ),
      },
      {
        id: 'direction',
        header: 'dir',
        width: '52px',
        render: (r) => (
          <span
            title={r.direction === 'paired' ? 'Agreed — paired commitment' : 'One-way commitment'}
            style={{ color: 'var(--text-muted)' }}
          >
            {r.direction === 'paired' ? '↔' : '→'}
          </span>
        ),
      },
      {
        id: 'status',
        header: 'status',
        width: '184px',
        render: (r) => <StatusCell row={r} />,
      },
      {
        id: 'role',
        header: 'role',
        width: '110px',
        render: (r) => <span className="ds-subtle">{r.role}</span>,
      },
      {
        id: 'counterparty',
        header: 'counterparty',
        render: (r) => <CopyableAddress address={otherParty(r)} />,
      },
      {
        id: 'arbiter',
        header: 'arbiter',
        render: (r) => <CopyableAddress address={r.arbiter} />,
      },
    ]

    if (showYield) {
      cols.push({
        id: 'yield',
        header: 'yield',
        align: 'right',
        render: (r) => {
          const claimable = claimableFor(r, claimableById)
          if (claimable === undefined) {
            return <span className="ds-mono-num ds-subtle">—</span>
          }
          const { decimals, symbol } = tokenMeta.metaFor(r.token)
          return (
            <span data-tone="success">
              <TokenAmount amount={claimable} decimals={decimals} symbol={symbol} size="inline" />
            </span>
          )
        },
      })
    }

    cols.push({
      id: 'amount',
      header: 'amount',
      align: 'right',
      sortable,
      render: (r) => <AmountCell row={r} tokenMeta={tokenMeta} />,
    })

    if (resolveContext) {
      cols.push({
        id: 'actions',
        header: '',
        align: 'right',
        width: '116px',
        // Proposals resolve via the agreement drawer (row click), never here.
        render: (r) =>
          r.kind === 'commitment' ? <RowResolveAction row={r} ctx={resolveContext} /> : null,
      })
    }

    return cols
  }, [
    sortable,
    showYield,
    claimableById,
    tokenMeta,
    resolveContext,
    labelContext,
    onSelectTag,
    activeTags,
  ])

  return (
    <DataTable<UnifiedRow>
      aria-label={ariaLabel}
      columns={columns}
      rows={visibleRows}
      getRowKey={(r) => `${r.kind === 'proposal' ? 'p' : 'c'}-${r.id.toString()}`}
      sort={sort}
      onSortChange={onSortChange}
      rowTone={rowTone}
      onRowClick={onOpenRow}
      isLoading={isLoading}
      emptyState={emptyState}
    />
  )
}
