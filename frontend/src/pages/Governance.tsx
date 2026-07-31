import { Link } from 'react-router-dom'

import {
  Card,
  DataTable,
  EmptyState,
  Notice,
  StatBlock,
  type DataTableColumn,
} from '../components/ui'
import { AddressDisplay } from '../components/ui'
import { PageHeader } from '../components/protocol'
import { hasIndexer } from '../config/indexer'
import { useGovernors, type GovernorRow } from '../hooks/useGovernors'
import { useVotingPower } from '../hooks/useVotingPower'

interface GovernorRowDisplay extends GovernorRow {
  totalProposals: number
  activeProposals: number
}

function formatVotes(raw: bigint | undefined): string {
  if (raw === undefined) return '—'
  if (raw === 0n) return '0'
  const wholes = raw / 10n ** 18n
  if (wholes === 0n) return '<1'
  return wholes.toString()
}

const COLUMNS: DataTableColumn<GovernorRowDisplay>[] = [
  {
    id: 'name',
    header: 'Name',
    render: (row) => (
      <Link to={`/app/governance/${row.address}`} className="ds-link">
        {row.name || 'Unnamed DAO'}
        {row.isCanonical && <span className="ds-subtle"> · canonical</span>}
      </Link>
    ),
  },
  {
    id: 'address',
    header: 'Governor',
    render: (row) => <AddressDisplay address={row.address} compact />,
  },
  {
    id: 'source',
    header: 'Power source',
    render: (row) => <AddressDisplay address={row.votingPowerSource} compact />,
  },
  {
    id: 'active',
    header: 'Active',
    align: 'right',
    render: (row) => <span className="ds-mono-num">{row.activeProposals}</span>,
  },
  {
    id: 'total',
    header: 'Total',
    align: 'right',
    render: (row) => <span className="ds-mono-num">{row.totalProposals}</span>,
  },
]

export default function Governance() {
  const { data, isLoading, error } = useGovernors()
  const governors = data ?? []
  const display: GovernorRowDisplay[] = governors.map((g) => {
    const counts = g.proposalCounts ?? {}
    const total = Object.values(counts).reduce((a, b) => a + b, 0)
    const active = (counts.active ?? 0) + (counts.pending ?? 0) + (counts.queued ?? 0)
    return { ...g, totalProposals: total, activeProposals: active }
  })
  const canonical = display.find((g) => g.isCanonical)
  const canonicalVotes = useVotingPower(canonical?.shim)

  const totalActive = display.reduce((acc, g) => acc + g.activeProposals, 0)
  const totalProposals = display.reduce((acc, g) => acc + g.totalProposals, 0)

  if (!hasIndexer) {
    return (
      <div className="ds-page">
        <PageHeader
          eyebrow="protocol"
          title="Governance"
          lead="DAOs deployed via the GovernorFactory. Each governor reads voting power from a registered IVotingPowerSource (typically a TokenWeighting mesh node)."
        />
        <Notice tone="info">
          Indexer not configured. Set <code>VITE_INDEXER_URL</code> to see live data.
        </Notice>
      </div>
    )
  }

  return (
    <div className="ds-page">
      <PageHeader
        eyebrow="protocol"
        title="Governance"
        lead="DAOs deployed via the GovernorFactory. Each governor reads voting power from a registered IVotingPowerSource (typically a TokenWeighting mesh node)."
      />

      <Card>
        <div className="ds-stat-grid">
          <StatBlock
            label="Your voting power"
            value={
              canonicalVotes.account === undefined
                ? <span className="ds-subtle">connect wallet</span>
                : !canonical
                  ? '—'
                  : canonicalVotes.isLoading
                    ? '—'
                    : formatVotes(canonicalVotes.power)
            }
            tone={canonicalVotes.power && canonicalVotes.power > 0n ? 'accent' : 'neutral'}
            meta={
              canonical
                ? <span className="ds-subtle">in {canonical.name || 'canonical DAO'}</span>
                : undefined
            }
          />
          <StatBlock
            label="Canonical DAO"
            value={
              canonical
                ? <Link to={`/app/governance/${canonical.address}`} className="ds-link">{canonical.name}</Link>
                : '—'
            }
          />
          <StatBlock label="Governors" value={String(display.length)} />
          <StatBlock label="Active proposals" value={String(totalActive)} />
          <StatBlock label="Total proposals" value={String(totalProposals)} />
        </div>
      </Card>

      {error && (
        <Notice tone="danger">Failed to load governors: {String((error as Error).message)}</Notice>
      )}

      {isLoading ? (
        <Card>
          <div className="ds-subtle">Loading governors…</div>
        </Card>
      ) : display.length === 0 ? (
        <EmptyState
          title="No DAOs yet"
          description="Deploy a Governor via the GovernorFactory to create the first DAO. The reference deployment lives in script/Simulate.s.sol."
        />
      ) : (
        <Card>
          <DataTable
            columns={COLUMNS}
            rows={display}
            getRowKey={(r) => r.address}
          />
        </Card>
      )}
    </div>
  )
}
