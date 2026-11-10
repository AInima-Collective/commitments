import { useState } from 'react'
import { parseEther } from 'viem'
import {
  DataTable,
  FilterBar,
  SourceBlock,
  TokenAmount,
  type DataTableColumn,
  type DataTableSort,
} from '../../components/ui'
import {
  CommitmentStatusBadge,
  OperatorIdentity,
  type CommitmentStatus,
} from '../../components/protocol'
import { SectionHeading } from './SectionHeading'

function TableDemo() {
  // Numeric ID without the `#` prefix — the prefix is rendered in the JSX so
  // the literal does not match the Phase 22 (LCK-01) hex-color regex.
  const rows = [
    { id: '0001', amount: '12.40 ETH', penalty: '50%', status: 'active', created: '4d ago' },
    { id: '0002', amount: '3.10 ETH', penalty: '25%', status: 'forfeit-pending', created: '11h ago' },
    { id: '0003', amount: '0.85 ETH', penalty: '100%', status: 'forfeited', created: '2d ago' },
    { id: '0004', amount: '8.00 ETH', penalty: '50%', status: 'released', created: '21d ago' },
  ]
  const tone = (s: string) =>
    s === 'active' ? 'ds-badge--success' :
    s === 'forfeit-pending' ? 'ds-badge--warn' :
    s === 'forfeited' ? 'ds-badge--error' :
    'ds-badge--muted'

  return (
    <table className="ds-table">
      <thead>
        <tr>
          <th>ID</th>
          <th>Amount</th>
          <th>Penalty</th>
          <th>Status</th>
          <th>Created</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.id}>
            <td className="ds-mono-num ds-muted">#{r.id}</td>
            <td className="ds-mono-num">{r.amount}</td>
            <td className="ds-mono-num">{r.penalty}</td>
            <td><span className={`ds-badge ${tone(r.status)}`}>{r.status}</span></td>
            <td className="ds-subtle">{r.created}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

type DataTableDemoRow = {
  id: string
  counterparty: `0x${string}`
  counterpartyName?: string
  amount: bigint
  yieldAmount: bigint
  status: CommitmentStatus
}

function DataTableDemo() {
  const rows: DataTableDemoRow[] = [
    { id: '0024', counterparty: '0x1f2b8c0Aa9c97D4ce9Be5C39E5F8D7C5a9d9C5b9D' as `0x${string}`, counterpartyName: 'Pellar Labs',  amount: parseEther('12.40'), yieldAmount: parseEther('0.31'), status: 'FORFEIT_PENDING' },
    { id: '0023', counterparty: '0xab07d3CcfeBF0E18bE3e5d8aC9b5cF7d4d8C9F0a3' as `0x${string}`,                                amount: parseEther('3.10'),  yieldAmount: parseEther('0.04'), status: 'ACTIVE' },
    { id: '0022', counterparty: '0x3b2C9b7D8E5fCAE0b1A2d8bF09C9D6e0E0c8F8A1B' as `0x${string}`, counterpartyName: 'Resolver Co.', amount: parseEther('0.85'),  yieldAmount: parseEther('0.00'), status: 'FORFEITED' },
    { id: '0021', counterparty: '0xCcD3a2c8F8d8B0E0e9C9D6e0E0c9b7d8E5fCAE0b' as `0x${string}`,                                amount: parseEther('8.00'),  yieldAmount: parseEther('0.21'), status: 'RELEASED' },
    { id: '0020', counterparty: '0x5F8D7C5a9d9C5b9D2b8c0Aa9c97D4ce9Be5C39E5' as `0x${string}`,                                amount: parseEther('1.20'),  yieldAmount: parseEther('0.02'), status: 'ACTIVE' },
  ]

  // Default sort mirrors lib/commitmentSort: FORFEIT_PENDING → ACTIVE → terminal,
  // then id DESC tiebreak. "What needs attention" surfaces should use the
  // canonical comparator so every commitment table ranks rows identically.
  const [sort, setSort] = useState<DataTableSort | undefined>(undefined)

  const sortedRows = [...rows].sort((a, b) => {
    if (!sort) {
      const tier = (s: CommitmentStatus): number =>
        s === 'FORFEIT_PENDING' ? 0 : s === 'ACTIVE' ? 1 : 2
      const ta = tier(a.status)
      const tb = tier(b.status)
      if (ta !== tb) return ta - tb
      return b.id.localeCompare(a.id)
    }
    const dir = sort.direction === 'asc' ? 1 : -1
    if (sort.columnId === 'id') return a.id.localeCompare(b.id) * dir
    if (sort.columnId === 'amount') return (a.amount < b.amount ? -1 : a.amount > b.amount ? 1 : 0) * dir
    return 0
  })

  const columns: DataTableColumn<DataTableDemoRow>[] = [
    { id: 'id', header: 'id', render: (r) => <span className="ds-mono-num ds-muted">#{r.id}</span>, sortable: true, width: '80px' },
    { id: 'counterparty', header: 'counterparty', render: (r) => (
      <OperatorIdentity address={r.counterparty} name={r.counterpartyName} size="sm" />
    ) },
    { id: 'amount', header: 'amount', render: (r) => <TokenAmount amount={r.amount} decimals={18} symbol="ETH" />, align: 'right', sortable: true },
    { id: 'yield', header: 'yield', render: (r) => <TokenAmount amount={r.yieldAmount} decimals={18} symbol="ETH" />, align: 'right' },
    { id: 'status', header: 'status', render: (r) => <CommitmentStatusBadge status={r.status} /> },
  ]

  return (
    <DataTable<DataTableDemoRow>
      aria-label="example commitments"
      columns={columns}
      rows={sortedRows}
      getRowKey={(r) => r.id}
      sort={sort}
      onSortChange={setSort}
      rowTone={(r) => (r.status === 'FORFEIT_PENDING' ? 'warn' : r.status === 'FORFEITED' ? 'danger' : undefined)}
      onRowClick={() => undefined}
    />
  )
}

function FilterBarDemo() {
  const [direction, setDirection] = useState('all')
  const [statuses, setStatuses] = useState<string[]>([])
  const [counterparty, setCounterparty] = useState('')
  const [amount, setAmount] = useState({ min: '', max: '' })
  const clearAll = () => {
    setDirection('all')
    setStatuses([])
    setCounterparty('')
    setAmount({ min: '', max: '' })
  }
  return (
    <FilterBar label="filter" onClearAll={clearAll}>
      <FilterBar.Select
        label="direction"
        value={direction}
        onChange={setDirection}
        options={[
          { value: 'all', label: 'all' },
          { value: 'one-way', label: '→ one-way' },
          { value: 'paired', label: '↔ paired' },
        ]}
      />
      <FilterBar.Multi
        label="status"
        value={statuses}
        onChange={setStatuses}
        options={[
          { value: 'active', label: 'active' },
          { value: 'forfeit-pending', label: 'forfeit pending' },
          { value: 'released', label: 'released' },
          { value: 'forfeited', label: 'forfeited' },
        ]}
      />
      <FilterBar.Search
        label="counterparty"
        value={counterparty}
        onChange={setCounterparty}
        placeholder="0x… or name"
      />
      <FilterBar.Range
        label="amount (ETH)"
        value={amount}
        onChange={setAmount}
      />
    </FilterBar>
  )
}

const SRC_TABLES =
  `<table className="ds-table">
  <thead><tr><th>ID</th><th>Amount</th><th>Status</th></tr></thead>
  <tbody>
    <tr>
      <td className="ds-mono-num ds-muted">{'#'}{id}</td>
      <td className="ds-mono-num">12.40 ETH</td>
      <td><span className="ds-badge ds-badge--success">active</span></td>
    </tr>
  </tbody>
</table>`

const SRC_DATA_TABLE =
  `type Row = { id: string; counterparty: \`0x\${string}\`; counterpartyName?: string; amount: bigint; status: CommitmentStatus }

// 1. Actor cells go through OperatorIdentity (avatar + name). Reference
//    addresses (vault contracts, tx counterparts) keep AddressDisplay.
// 2. Status cells go through the typed Badge primitives —
//    CommitmentStatusBadge / AgreementStatusBadge / OperatorStatusBadge.
//    Never inline ds-pill spans.
// 3. Resolve names once at the table level: const names = useOperatorNames(allAddresses).
const columns: DataTableColumn<Row>[] = [
  { id: 'id',           header: 'id',           render: (r) => <span className="ds-mono-num ds-muted">#{r.id}</span>, sortable: true },
  { id: 'counterparty', header: 'counterparty', render: (r) => (
      <OperatorIdentity address={r.counterparty} name={r.counterpartyName} size="sm" />
  ) },
  { id: 'amount',       header: 'amount',       render: (r) => <TokenAmount amount={r.amount} decimals={18} />, align: 'right', sortable: true },
  { id: 'status',       header: 'status',       render: (r) => <CommitmentStatusBadge status={r.status} /> },
]

// "What needs attention" surfaces (Dashboard preview, commitment lists)
// default to the canonical urgency sort:
//   FORFEIT_PENDING (0) → ACTIVE (1) → terminal (2), then id DESC tiebreak.
// Use sortByCommitmentUrgency from lib/commitmentSort so every surface
// — including the indexer's /commitments/urgent endpoint — ranks identically.
const sortedRows = sortByCommitmentUrgency(rows)

<DataTable
  aria-label="example commitments"
  columns={columns}
  rows={sortedRows}
  getRowKey={(r) => r.id}
  rowTone={(r) => (r.status === 'FORFEIT_PENDING' ? 'warn' : r.status === 'FORFEITED' ? 'danger' : undefined)}
  onRowClick={(r) => openDetail(r)}
/>`

const SRC_FILTER_BAR =
  `// Page owns filter state. Each slot is controlled.
const [direction, setDirection] = useState('all')
const [statuses, setStatuses] = useState<string[]>([])
const [counterparty, setCounterparty] = useState('')
const [amount, setAmount] = useState({ min: '', max: '' })

<FilterBar
  label="filter"
  onClearAll={() => { setDirection('all'); setStatuses([]); setCounterparty(''); setAmount({ min: '', max: '' }) }}
>
  <FilterBar.Select
    label="direction"
    value={direction}
    onChange={setDirection}
    options={[
      { value: 'all',     label: 'all' },
      { value: 'one-way', label: '→ one-way' },
      { value: 'paired',  label: '↔ paired' },
    ]}
  />
  <FilterBar.Multi
    label="status"
    value={statuses}
    onChange={setStatuses}
    options={[
      { value: 'active',         label: 'active' },
      { value: 'forfeit-pending',  label: 'forfeit pending' },
      { value: 'released',       label: 'released' },
      { value: 'forfeited',        label: 'forfeited' },
    ]}
  />
  <FilterBar.Search
    label="counterparty"
    value={counterparty}
    onChange={setCounterparty}
    placeholder="0x… or name"
  />
  <FilterBar.Range
    label="amount (ETH)"
    value={amount}
    onChange={setAmount}
  />
</FilterBar>`

export function TablesSection() {
  return (
    <section className="ds-stack ds-stack-6">
      <SectionHeading
        id="tables"
        title="Tables"
        lead="Header rows in tracked-uppercase. Numeric columns use tabular numerals. Hover tints the row, no zebra striping."
      />
      <TableDemo />
      <SourceBlock label="example" source={SRC_TABLES} />
    </section>
  )
}

export function DataTableSection() {
  return (
    <section className="ds-stack ds-stack-6">
      <SectionHeading
        id="data-table"
        title="Data Table"
        lead="React wrapper over `.ds-table` with sortable headers, per-row tone, clickable rows, density + size scale, and skeleton loading. Generic over row shape — column renderers receive a typed row and return ReactNode. The component never sorts or filters — pass already-prepared data."
      />
      <DataTableDemo />

      <div className="ds-stack ds-stack-3">
        <div className="ds-label">conventions</div>
        <ul className="ds-stack ds-stack-2 ds-text-sm" style={{ paddingLeft: 'var(--space-4)' }}>
          <li>
            <strong>Actor cells</strong> (depositor, counterparty, arbiter, operator) render through{' '}
            <code>OperatorIdentity</code> with batched name resolution via{' '}
            <code>useOperatorNames</code>. Reference addresses (vault contracts, tx counterparts)
            keep <code>AddressDisplay</code>.
          </li>
          <li>
            <strong>Status cells</strong> use a typed Badge primitive —{' '}
            <code>CommitmentStatusBadge</code>, <code>AgreementStatusBadge</code>, or{' '}
            <code>OperatorStatusBadge</code>. Never inline <code>ds-pill</code> spans.
          </li>
          <li>
            <strong>Default sort</strong> for "what needs attention" surfaces (dashboards,
            commitment lists) uses <code>sortByCommitmentUrgency</code> from{' '}
            <code>lib/commitmentSort</code> — the same comparator the indexer's{' '}
            <code>/commitments/urgent</code> endpoint uses, so rows rank identically across
            surfaces.
          </li>
          <li>
            <strong>Protocol-wide tables</strong> with a hardcoded row cap (e.g. Explorer's
            100-row limit) surface the cap with a follow-up <code>Notice</code> below the table
            so users aren't fooled into thinking the data ends there.
          </li>
          <li>
            <strong>Tag clusters</strong> in cells (e.g. Marketplace offer tags) render the
            first 2 chips and collapse the rest into <code>+N</code> with the full set on{' '}
            <code>title=</code>. Same shape every time.
          </li>
          <li>
            <strong>Sort headers</strong> on Etherscan-style protocol explorers should be
            wired up — at minimum on id, amount, and status. Status sorts by canonical urgency
            tier, not alphabetically.
          </li>
        </ul>
      </div>

      <SourceBlock label="example" source={SRC_DATA_TABLE} />
    </section>
  )
}

export function FilterBarSection() {
  return (
    <section className="ds-stack ds-stack-6">
      <SectionHeading
        id="filter-bar"
        title="Filter Bar"
        lead="Slot-based filter strip above a list. Use FilterBar.Select / .Multi / .Search / .Range. The bar derives an active-filter count from non-empty values and renders a `clear` button when `onClearAll` is provided. Slots are controlled-only by design — pages own filter state."
      />
      <FilterBarDemo />
      <SourceBlock label="example" source={SRC_FILTER_BAR} />
    </section>
  )
}
