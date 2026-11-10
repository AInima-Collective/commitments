import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useChainId } from 'wagmi'
import type { Address } from 'viem'

import {
  AddressDisplay,
  Button,
  DataTable,
  EmptyState,
  Notice,
  Pagination,
  Tabs,
  TokenAmount,
  type DataTableColumn,
} from '../ui'
import { AgentBadge, CommitmentStatusBadge, AgreementStatusBadge, OperatorIdentity } from '../protocol'
import { useAgentIdentities, type AgentIdentityMap } from '../../hooks/useAgentIdentities'
import { useBlockTimestamps } from '../../hooks/useBlockTimestamps'
import { useDisplayNow } from '../../hooks/useDisplayNow'
import { useOperatorNames } from '../../hooks/useOperatorNames'
import { useTokenMetaMap } from '../../hooks/useTokenMeta'
import {
  useProtocolCommitmentsList,
  useProtocolAgreementsList,
  useProtocolArbitersList,
  useProtocolCasesList,
  type ProtocolCommitmentRow,
  type ProtocolAgreementRow,
  type ProtocolArbiterRow,
  type ProtocolCaseRow,
} from '../../hooks/useProtocolEntityList'
import { useArbiterProfile } from '../../hooks/useArbiterProfile'
import type { ArbiterProfile } from '../../lib/arbiterProfile'
import { getContractAddresses } from '../../config/contracts'
import { findConfiguredArbiterProfile } from '../../config/arbiters'
import { formatDuration } from '../../lib/format'
import { arbiterProfilePath, commitmentDetailPath } from '../../lib/arbitrationRoutes'

const AGREEMENTS_LIMIT = 100

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

type EntityType = 'commitments' | 'agreements' | 'arbiters' | 'cases'

const TABS: { id: EntityType; label: string }[] = [
  { id: 'commitments', label: 'commitments' },
  { id: 'agreements', label: 'agreements' },
  { id: 'arbiters', label: 'arbiters' },
  { id: 'cases', label: 'cases' },
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
        <span className="ds-section-eyebrow">protocol-wide entities and arbitration activity</span>
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

      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as EntityType)}>
        <Tabs.List aria-label="Entity browser tabs">
          {TABS.map((t) => (
            <Tabs.Trigger key={t.id} value={t.id}>
              {t.label}
            </Tabs.Trigger>
          ))}
        </Tabs.List>
        <Tabs.Panel value="commitments">
          <CommitmentsTable filterAddress={filterAddress} />
        </Tabs.Panel>
        <Tabs.Panel value="agreements">
          <AgreementsTable filterAddress={filterAddress} />
        </Tabs.Panel>
        <Tabs.Panel value="arbiters">
          <ArbitersTable filterAddress={filterAddress} />
        </Tabs.Panel>
        <Tabs.Panel value="cases">
          <CasesTable filterAddress={filterAddress} />
        </Tabs.Panel>
      </Tabs>
    </section>
  )
}

function ArbitersTable({ filterAddress }: { filterAddress?: string | null }) {
  const [offset, setOffset] = useState(0)
  const limit = 50
  const { rows, page, isLoading } = useProtocolArbitersList({
    limit,
    offset,
    address: filterAddress ?? undefined,
  })
  const columns = useMemo<DataTableColumn<ProtocolArbiterRow>[]>(
    () => [
      {
        id: 'arbiter',
        header: 'arbiter · form · mechanism · capabilities',
        render: (row) => <ArbiterCell address={row.address} />,
      },
      {
        id: 'commitments',
        header: 'commitments',
        align: 'right',
        render: (row) => `${row.activeCommitments} active / ${row.totalCommitments} total`,
      },
      {
        id: 'manager',
        header: 'pending manager forfeits',
        align: 'right',
        render: (row) => row.pendingManagerForfeits,
      },
      {
        id: 'cases',
        header: 'open mechanism cases',
        align: 'right',
        render: (row) => row.openMechanismCases,
      },
    ],
    [],
  )
  return (
    <div className="ds-stack ds-stack-2">
      <DataTable
        aria-label="Arbiters"
        columns={columns}
        rows={rows}
        isLoading={isLoading}
        getRowKey={(row) => row.address.toLowerCase()}
        emptyState={<EmptyState title="NO ARBITERS" description="No indexed commitment names an arbiter yet." />}
      />
      <Pagination
        aria-label="Table pages"
        offset={page.offset}
        limit={page.limit}
        count={rows.length}
        total={page.total}
        loading={isLoading}
        onOffsetChange={setOffset}
      />
    </div>
  )
}

/** One profile read per row: identity plus the declared profile fields, stacked. */
function ArbiterCell({ address }: { address: Address }) {
  const chainId = useChainId()
  const manager = getContractAddresses(chainId).commitmentManager
  const { profile, isLoading } = useArbiterProfile(address, manager)
  return (
    <span className="ds-stack ds-stack-1">
      <Link to={arbiterProfilePath(address)} aria-label={`View arbiter ${address}`}>
        <span className="ds-stack ds-stack-1">
          <strong>{profile?.displayName ?? 'Arbiter'}</strong>
          <AddressDisplay address={address} compact />
        </span>
      </Link>
      {isLoading || !profile ? (
        <span className="ds-subtle">…</span>
      ) : (
        <span className="ds-text-xs ds-stack ds-stack-1">
          <span>{profile.addressForm}</span>
          <span>
            {profile.mechanism} <span className="ds-badge">{profile.mechanismVerification}</span>
          </span>
          <ArbiterCapabilities profile={profile} />
        </span>
      )}
    </span>
  )
}

function ArbiterCapabilities({ profile }: { profile: ArbiterProfile }) {
  if (profile.fieldStatus.capabilities === 'not-applicable') {
    return <span className="ds-subtle">capabilities not applicable</span>
  }
  if (['not-declared', 'unsupported'].includes(profile.fieldStatus.capabilities)) {
    return <span className="ds-subtle">capabilities not declared</span>
  }
  if (profile.declaredCapabilities.length === 0) return <span className="ds-subtle">no capabilities declared</span>
  return <span>{profile.declaredCapabilities.map((item) => item.label).join(', ')}</span>
}

function CasesTable({ filterAddress }: { filterAddress?: string | null }) {
  const chainId = useChainId()
  const [offset, setOffset] = useState(0)
  const [openOnly, setOpenOnly] = useState(false)
  const limit = 50
  const { rows, page, isLoading } = useProtocolCasesList({
    limit,
    offset,
    arbiter: filterAddress as Address | undefined,
    openOnly,
  })
  const columns = useMemo<DataTableColumn<ProtocolCaseRow>[]>(
    () => [
      {
        id: 'case',
        header: 'case / claim',
        render: (row) => row.caseId ? (
          row.mechanism === 'optimistic-insurance' ? (
            <Link to={`/app/claims/${row.caseId}?arbiter=${row.arbiter}`}>Claim #{row.caseId}</Link>
          ) : row.mechanism === 'optimistic-mutual' ? (
            <Link to={`/app/marketplace/${row.caseId}`}>Mutual loss #{row.caseId}</Link>
          ) : row.mechanism === 'two-tier' ? (
            <Link to={`/app/arbitration/two-tier/${row.caseId}?arbiter=${row.arbiter}`}>Court case #{row.caseId}</Link>
          ) : `Case #${row.caseId}`
        ) : 'Manager proposal',
      },
      {
        id: 'commitment',
        header: 'commitment / manager',
        render: (row) => (
          row.commitmentId !== null && row.manager ? (
            <span className="ds-stack ds-stack-1">
              <Link to={commitmentDetailPath(row.commitmentId, row.manager)}>
                Commitment #{row.commitmentId.toString()}
              </Link>
              <AddressDisplay address={row.manager} compact />
            </span>
          ) : <span className="ds-subtle">Mechanism-scoped activity</span>
        ),
      },
      {
        id: 'arbiter',
        header: 'arbiter / mechanism',
        render: (row) => {
          const configured = findConfiguredArbiterProfile(chainId, row.arbiter)
          return (
            <span className="ds-stack ds-stack-1">
              <Link to={arbiterProfilePath(row.arbiter)}>
                <AddressDisplay address={row.arbiter} compact />
              </Link>
              <span className="ds-text-xs ds-subtle">
                {configured?.mechanism ?? 'Unrecognized mechanism'}
              </span>
            </span>
          )
        },
      },
      {
        id: 'mechanismPhase',
        header: 'mechanism phase',
        render: (row) => (
          <span className="ds-stack ds-stack-1">
            <span>{row.mechanismPhase}</span>
            {row.mechanismSource && <span className="ds-badge">source: {row.mechanismSource}</span>}
          </span>
        ),
      },
      {
        id: 'managerPhase',
        header: 'manager enforcement',
        render: (row) => (
          <span className="ds-stack ds-stack-1">
            <span>{row.managerPhase}</span>
            <span className="ds-badge">source: {row.managerSource}</span>
          </span>
        ),
      },
      {
        id: 'next',
        header: 'next deadline / action',
        render: (row) => row.terminalOutcome ? (
          <span className="ds-subtle">Case is terminal</span>
        ) : (
          <span className="ds-stack ds-stack-1">
            <span>{row.nextDeadline
              ? new Date(Number(row.nextDeadline) * 1_000).toLocaleString()
              : 'No pending deadline'}</span>
            {row.nextAction && <span className="ds-text-xs ds-subtle">{row.nextAction}</span>}
          </span>
        ),
      },
      {
        id: 'outcome',
        header: 'terminal outcome',
        render: (row) => row.terminalOutcome ?? <span className="ds-subtle">Open</span>,
      },
    ],
    [chainId],
  )
  return (
    <div className="ds-stack ds-stack-2">
      <Notice tone="info" size="sm" title="Source coverage">
        Mechanism phases come from recognized arbiter contracts; enforcement phases come from the CommitmentManager. Manager-only rows explicitly say when no mechanism state is indexed.
      </Notice>
      <label className="ds-row ds-row-2 ds-text-sm" style={{ alignItems: 'center' }}>
        <span>case status</span>
        <select
          aria-label="Case status filter"
          value={openOnly ? 'open' : 'all'}
          onChange={(event) => {
            setOpenOnly(event.target.value === 'open')
            setOffset(0)
          }}
        >
          <option value="all">All cases</option>
          <option value="open">Open only</option>
        </select>
      </label>
      <DataTable
        aria-label="Arbitration cases"
        columns={columns}
        rows={rows}
        isLoading={isLoading}
        getRowKey={(row) => `${row.source}-${row.arbiter}-${row.caseId ?? row.commitmentId}-${row.proposalInitiatedAt ?? row.updatedAt}`}
        emptyState={<EmptyState title="NO CASES" description="No arbitration or manager-enforcement activity has occurred." />}
      />
      <Pagination
        aria-label="Table pages"
        offset={page.offset}
        limit={page.limit}
        count={rows.length}
        total={page.total}
        loading={isLoading}
        onOffsetChange={setOffset}
      />
    </div>
  )
}

function CommitmentsTable({ filterAddress }: { filterAddress?: string | null }) {
  const navigate = useNavigate()
  // The indexer filters by address (committer or counterparty), so a filtered
  // view is not limited to the first page of the unfiltered list. Arbiter
  // roles are on the arbiters and cases tabs.
  const { rows: filtered, total, isLoading } = useProtocolCommitmentsList({
    address: filterAddress ?? undefined,
  })
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
  const { metaFor } = useTokenMetaMap(filtered.map((row) => row.token))
  const capped = total > filtered.length

  const columns: DataTableColumn<ProtocolCommitmentRow>[] = [
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
        <Link
          to={arbiterProfilePath(r.arbiter)}
          onClick={(event) => event.stopPropagation()}
          aria-label={`View arbiter ${r.arbiter}`}
        >
          <OperatorIdentity
            address={r.arbiter}
            name={names.get(r.arbiter)}
            size="sm"
            badge={agentBadgeFor(agents, r.arbiter)}
          />
        </Link>
      ),
    },
    {
      id: 'amount',
      header: 'amount',
      align: 'right',
      sortable: true,
      render: (r) => {
        const meta = metaFor(r.token)
        return <TokenAmount amount={r.amount} decimals={meta.decimals} symbol={meta.symbol} compact />
      },
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
      render: (r) => <AgeCell block={r.createdBlock} timestamp={blockTimestamps.get(r.createdBlock)} />,
    },
  ]

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
        getRowKey={(r) => `${r.manager}-${r.id.toString()}`}
        onRowClick={(r) =>
          navigate(commitmentDetailPath(r.id, r.manager), {
            state: { commitmentOrigin: 'explorer' },
          })
        }
        sort={sort}
        onSortChange={setSort}
        emptyState={
          filterAddress ? (
            <EmptyState
              title="NO COMMITMENTS"
              description="This address is not the committer or counterparty of any commitment."
            />
          ) : (
            <EmptyState title="NO COMMITMENTS" description="No commitments yet — create one to get started." />
          )
        }
      />
      {capped && (
        <Notice tone="info" size="sm">
          Showing the first {filtered.length} of {total} commitments.
        </Notice>
      )}
    </div>
  )
}

/** The age cell owns the clock, so a tick re-renders this cell, not the table. */
function AgeCell({ block, timestamp }: { block: bigint; timestamp: bigint | undefined }) {
  const now = useDisplayNow()
  if (timestamp === undefined) {
    return <span className="ds-subtle ds-text-xs" title={`Block ${block.toString()}`}>…</span>
  }
  const age = now - Number(timestamp)
  if (age < 0) return <span className="ds-subtle">—</span>
  return (
    <span
      className="ds-text-xs ds-subtle"
      title={`Block ${block.toString()} · ${new Date(Number(timestamp) * 1000).toISOString()}`}
    >
      {formatDuration(age)} ago
    </span>
  )
}

function AgreementsTable({ filterAddress }: { filterAddress?: string | null }) {
  const navigate = useNavigate()
  // Agreements have no address filter on the indexer, so the filter runs over
  // the first page only, and the notice below says so.
  const { rows, isLoading } = useProtocolAgreementsList({ limit: AGREEMENTS_LIMIT })
  const capped = rows.length === AGREEMENTS_LIMIT
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

  const columns: DataTableColumn<ProtocolAgreementRow>[] = [
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
  ]

  return (
    <div className="ds-stack ds-stack-2">
      <DataTable<ProtocolAgreementRow>
        aria-label="Agreements"
        columns={columns}
        rows={filtered}
        isLoading={isLoading}
        getRowKey={(r) => r.id.toString()}
        onRowClick={(r) =>
          navigate(commitmentDetailPath(r.commitmentIdA), {
            state: { commitmentOrigin: 'explorer' },
          })
        }
        emptyState={
          filterAddress ? (
            <EmptyState
              title="NO AGREEMENTS"
              description={
                capped
                  ? `This address is not party to any of the latest ${AGREEMENTS_LIMIT} agreements.`
                  : 'This address is not party to any agreement.'
              }
            />
          ) : (
            <EmptyState title="NO AGREEMENTS" />
          )
        }
      />
      {capped && (
        <Notice tone="info" size="sm">
          Showing the latest {AGREEMENTS_LIMIT} agreements{filterAddress ? '; the address filter applies to these only' : ''}.
        </Notice>
      )}
    </div>
  )
}
