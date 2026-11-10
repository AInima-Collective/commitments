import { useMemo, type ReactNode } from 'react'
import {
  DataTable,
  TokenAmount,
  type DataTableColumn,
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

export interface CommitmentsTableProps {
  /** Already-filtered, already-sorted rows. Commitments + proposals are both
   *  accepted (proposals carry status PENDING). */
  rows: UnifiedRow[]
  onOpenRow: (row: UnifiedRow) => void
  /** Per-(token) decimals/symbol — amounts are denominated in each row's own
   *  backing token, never the vault share. */
  tokenMeta: TokenMetaResolver
  /** Render the Yield column. Default false — pass `claimableEntries` alongside. */
  showYield?: boolean
  /** Live claimable-yield entries (per commitment+strategy). Summed per
   *  commitment id to fill the Yield column; absent rows render "—". */
  claimableEntries?: ClaimableYieldEntry[]
  /** When set, renders a per-row Resolve action (commitment rows only) that
   *  opens the resolve modal. */
  resolveContext?: CommitmentsResolveContext
  isLoading?: boolean
  emptyState?: ReactNode
  'aria-label'?: string
}

/**
 * Shared commitments table used by the Dashboard and Vault
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
  showYield = false,
  claimableEntries,
  resolveContext,
  isLoading,
  emptyState,
  'aria-label': ariaLabel = 'commitments',
}: CommitmentsTableProps) {
  const labelContext = useCommitmentLabelContext(rows, tokenMeta)

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
        render: (r) => <NameCell row={r} ctx={labelContext} />,
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
  }, [showYield, claimableById, tokenMeta, resolveContext, labelContext])

  return (
    <DataTable<UnifiedRow>
      aria-label={ariaLabel}
      columns={columns}
      rows={rows}
      getRowKey={(r) => `${r.kind === 'proposal' ? 'p' : 'c'}-${r.id.toString()}`}
      rowTone={rowTone}
      onRowClick={onOpenRow}
      isLoading={isLoading}
      emptyState={emptyState}
    />
  )
}
