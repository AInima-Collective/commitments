import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'

import {
  AddressDisplay,
  Button,
  DataTable,
  EmptyState,
  Notice,
  TokenAmount,
  type DataTableColumn,
} from '../ui'
import { AgentBadge, CommitmentStatusBadge, AgreementStatusBadge, OperatorIdentity } from '../protocol'
import { useAgentIdentities, type AgentIdentityMap } from '../../hooks/useAgentIdentities'
import { useBlockTimestamps } from '../../hooks/useBlockTimestamps'
import { useDisplayNow } from '../../hooks/useDisplayNow'
import { useOperatorNames } from '../../hooks/useOperatorNames'
import {
  useProtocolCommitmentsList,
  useProtocolAgreementsList,
  type ProtocolCommitmentRow,
  type ProtocolAgreementRow,
} from '../../hooks/useProtocolEntityList'
import { formatDuration } from '../../lib/format'

const COMMITMENTS_LIMIT = 100

const COMMITMENT_STATUS_TIER: Record<ProtocolCommitmentRow['status'], number> = {
  FORFEIT_PENDING: 0,
  UNBONDING: 1,
  ACTIVE: 2,
  EXPIRED: 3,
  RELEASED: 3,
  FORFEITED: 3,
}

/** Shared badge-slot renderer — resolved from the table-level bulk agent query. */
function agentBadgeFor(agents: AgentIdentityMap, address: string | undefined) {
  if (!address) return undefined
  const a = agents.get(address)
  return a?.isAgent ? <AgentBadge agentId={a.agentId} /> : undefined
}

type EntityType = 'commitments' | 'agreements'

const TABS: { id: EntityType; label: string }[] = [
  { id: 'commitments', label: 'commitments' },
  { id: 'agreements', label: 'agreements' },
]

/**
 * Etherscan-style tabbed browser of protocol entities. Lives below the
 * Explorer page's hero graph; each tab renders a sortable DataTable backed by
 * a dedicated hook. Row clicks navigate to existing detail pages.
 *
 * When `filterAddress` is set (a node was selected in the hero graph), the
 * tables narrow to rows that touch that address so the browser acts as the
 * graph's detail surface. `onClearFilter` clears the selection from here.
 */
export function EntityBrowser({
  defaultTab = 'commitments',
  filterAddress,
  onClearFilter,
}: {
  defaultTab?: EntityType
  filterAddress?: string | null
  onClearFilter?: () => void
}) {
  const [activeTab, setActiveTab] = useState<EntityType>(defaultTab)

  return (
    <section className="ds-stack ds-stack-3">
      <header className="ds-section-header">
        <h2 className="ds-section-title">Entity browser</h2>
        <span className="ds-section-eyebrow">browse every commitment and agreement</span>
      </header>

      {filterAddress && (
        <Notice tone="info" size="sm">
          <span className="ds-row ds-row-2" style={{ alignItems: 'center', flexWrap: 'wrap' }}>
            <span>
              Filtered to{' '}
              <AddressDisplay address={filterAddress as `0x${string}`} compact /> — showing rows that
              touch this address.
            </span>
            {onClearFilter && (
              <Button size="sm" variant="ghost" onClick={onClearFilter}>
                Clear filter
              </Button>
            )}
          </span>
        </Notice>
      )}

      <div className="ds-tabs" role="tablist" aria-label="Entity browser tabs">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={activeTab === t.id}
            className="ds-tab"
            onClick={() => setActiveTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div role="tabpanel">
        {activeTab === 'commitments' && <CommitmentsTable filterAddress={filterAddress} />}
        {activeTab === 'agreements' && <AgreementsTable filterAddress={filterAddress} />}
      </div>
    </section>
  )
}

function CommitmentsTable({ filterAddress }: { filterAddress?: string | null }) {
  const navigate = useNavigate()
  const { rows, isLoading } = useProtocolCommitmentsList({ limit: COMMITMENTS_LIMIT })
  const filtered = useMemo(() => {
    if (!filterAddress) return rows
    const a = filterAddress.toLowerCase()
    return rows.filter(
      (r) =>
        r.committer.toLowerCase() === a ||
        r.counterparty.toLowerCase() === a ||
        r.arbiter.toLowerCase() === a,
    )
  }, [rows, filterAddress])
  const allAddresses = useMemo(() => {
    const out: string[] = []
    for (const r of filtered) {
      out.push(r.committer, r.counterparty, r.arbiter)
    }
    return out
  }, [filtered])
  const names = useOperatorNames(allAddresses)
  const agents = useAgentIdentities(allAddresses)
  const blockNumbers = useMemo(() => filtered.map((r) => r.createdBlock), [filtered])
  const blockTimestamps = useBlockTimestamps(blockNumbers)
  const now = useDisplayNow()
  const capped = !filterAddress && rows.length === COMMITMENTS_LIMIT

  const columns = useMemo<DataTableColumn<ProtocolCommitmentRow>[]>(
    () => [
      {
        id: 'id',
        header: 'id',
        sortable: true,
        render: (r) => `#${r.id.toString()}`,
        width: '88px',
      },
      {
        id: 'committer',
        header: 'committer',
        render: (r) => (
          <OperatorIdentity
            address={r.committer}
            name={names.get(r.committer)}
            size="sm"
            badge={agentBadgeFor(agents, r.committer)}
          />
        ),
      },
      {
        id: 'counterparty',
        header: 'counterparty',
        render: (r) => (
          <OperatorIdentity
            address={r.counterparty}
            name={names.get(r.counterparty)}
            size="sm"
            badge={agentBadgeFor(agents, r.counterparty)}
          />
        ),
      },
      {
        id: 'arbiter',
        header: 'arbiter',
        render: (r) => (
          <OperatorIdentity
            address={r.arbiter}
            name={names.get(r.arbiter)}
            size="sm"
            badge={agentBadgeFor(agents, r.arbiter)}
          />
        ),
      },
      {
        id: 'amount',
        header: 'amount',
        align: 'right',
        sortable: true,
        render: (r) => <TokenAmount amount={r.amount} decimals={6} symbol="USDC" compact />,
      },
      {
        id: 'penalty',
        header: 'max penalty',
        align: 'right',
        render: (r) => `${(r.maxPenaltyBps / 100).toFixed(0)}%`,
      },
      {
        id: 'status',
        header: 'status',
        sortable: true,
        render: (r) => <CommitmentStatusBadge status={r.status} />,
      },
      {
        id: 'age',
        header: 'age',
        width: '110px',
        render: (r) => {
          const ts = blockTimestamps.get(r.createdBlock)
          if (ts === undefined) {
            return <span className="ds-subtle ds-text-xs" title={`Block ${r.createdBlock.toString()}`}>…</span>
          }
          const age = now - Number(ts)
          if (age < 0) return <span className="ds-subtle">—</span>
          return (
            <span
              className="ds-text-xs ds-subtle"
              title={`Block ${r.createdBlock.toString()} · ${new Date(Number(ts) * 1000).toISOString()}`}
            >
              {formatDuration(age)} ago
            </span>
          )
        },
      },
    ],
    [names, agents, blockTimestamps, now],
  )

  const [sort, setSort] = useState<{ columnId: string; direction: 'asc' | 'desc' } | undefined>()
  const sortedRows = useMemo(() => {
    if (!sort) return filtered
    const dir = sort.direction === 'asc' ? 1 : -1
    const copy = [...filtered]
    copy.sort((a, b) => {
      switch (sort.columnId) {
        case 'id':
          return (a.id < b.id ? -1 : a.id > b.id ? 1 : 0) * dir
        case 'amount':
          return (a.amount < b.amount ? -1 : a.amount > b.amount ? 1 : 0) * dir
        case 'status':
          return (COMMITMENT_STATUS_TIER[a.status] - COMMITMENT_STATUS_TIER[b.status]) * dir
        default:
          return 0
      }
    })
    return copy
  }, [filtered, sort])

  return (
    <div className="ds-stack ds-stack-2">
      <DataTable<ProtocolCommitmentRow>
        aria-label="Commitments"
        columns={columns}
        rows={sortedRows}
        isLoading={isLoading}
        getRowKey={(r) => r.id.toString()}
        onRowClick={(r) =>
          navigate(`/app/commitments/${r.id}`, {
            state: { commitmentOrigin: 'explorer' },
          })
        }
        sort={sort}
        onSortChange={setSort}
        emptyState={
          filterAddress ? (
            <EmptyState title="NO COMMITMENTS" description="This address has no commitments." />
          ) : (
            <EmptyState title="NO COMMITMENTS" description="No commitments yet — create one to get started." />
          )
        }
      />
      {capped && (
        <Notice tone="info" size="sm">
          Showing the first {COMMITMENTS_LIMIT} commitments.
        </Notice>
      )}
    </div>
  )
}

function AgreementsTable({ filterAddress }: { filterAddress?: string | null }) {
  const navigate = useNavigate()
  const { rows, isLoading } = useProtocolAgreementsList({ limit: 100 })
  const filtered = useMemo(() => {
    if (!filterAddress) return rows
    const a = filterAddress.toLowerCase()
    return rows.filter(
      (r) =>
        r.committerA?.toLowerCase() === a || r.committerB?.toLowerCase() === a,
    )
  }, [rows, filterAddress])
  const allAddresses = useMemo(() => {
    const out: string[] = []
    for (const r of filtered) {
      if (r.committerA) out.push(r.committerA)
      if (r.committerB) out.push(r.committerB)
    }
    return out
  }, [filtered])
  const names = useOperatorNames(allAddresses)
  const agents = useAgentIdentities(allAddresses)

  const columns = useMemo<DataTableColumn<ProtocolAgreementRow>[]>(
    () => [
      {
        id: 'id',
        header: 'id',
        render: (r) => `#${r.id.toString()}`,
        width: '88px',
      },
      {
        id: 'aOperator',
        header: 'A operator',
        render: (r) =>
          r.committerA ? (
            <OperatorIdentity
              address={r.committerA}
              name={names.get(r.committerA)}
              size="sm"
              badge={agentBadgeFor(agents, r.committerA)}
            />
          ) : (
            <span className="ds-subtle">—</span>
          ),
      },
      {
        id: 'bOperator',
        header: 'B operator',
        render: (r) =>
          r.committerB ? (
            <OperatorIdentity
              address={r.committerB}
              name={names.get(r.committerB)}
              size="sm"
              badge={agentBadgeFor(agents, r.committerB)}
            />
          ) : (
            <span className="ds-subtle">—</span>
          ),
      },
      {
        id: 'sides',
        header: 'sides',
        width: '120px',
        render: (r) => (
          <span className="ds-mono-num ds-text-xs ds-subtle">
            #{r.commitmentIdA.toString()} ↔ #{r.commitmentIdB.toString()}
          </span>
        ),
      },
      {
        id: 'status',
        header: 'status',
        render: (r) => <AgreementStatusBadge status={r.status} />,
      },
      {
        id: 'exposure',
        header: 'exposure',
        align: 'right',
        render: (r) =>
          r.exposure !== undefined ? (
            <TokenAmount amount={r.exposure} decimals={6} symbol="USDC" compact />
          ) : (
            <span className="ds-subtle">—</span>
          ),
      },
      {
        id: 'flow',
        header: 'flow (P→A)',
        align: 'right',
        render: (r) => (
          <TokenAmount amount={r.cumulativeProposerToAcceptor} decimals={6} symbol="USDC" compact />
        ),
      },
    ],
    [names, agents],
  )

  return (
    <DataTable<ProtocolAgreementRow>
      aria-label="Agreements"
      columns={columns}
      rows={filtered}
      isLoading={isLoading}
      getRowKey={(r) => r.id.toString()}
      onRowClick={(r) =>
        navigate(`/app/commitments/${r.commitmentIdA}`, {
          state: { commitmentOrigin: 'explorer' },
        })
      }
      emptyState={
        filterAddress ? (
          <EmptyState title="NO AGREEMENTS" description="This address is not party to any agreement." />
        ) : (
          <EmptyState title="NO AGREEMENTS" description="Propose and accept an agreement to see it here." />
        )
      }
    />
  )
}
