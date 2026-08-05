import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { parseEther, parseUnits } from 'viem'
import {
  AddressDisplay,
  AllocationBar,
  ApyMeter,
  BalanceLine,
  BrandMark,
  MARKS,
  Button,
  CapacityMeter,
  ChainBadge,
  Card,
  SectionNav,
  DataTable,
  Disclosure,
  Drawer,
  EntityCard,
  ErrorBlock,
  FilterBar,
  FormField,
  HealthGauge,
  MediaRow,
  EntityLogo,
  Modal,
  Notice,
  OperatorAvatar,
  QuorumMeter,
  SettlementBar,
  ShareRatio,
  SocialLink,
  GitHubMark,
  XMark,
  SourceBlock,
  StatBlock,
  StrategyFlow,
  Tabs,
  ThemeToggle,
  TokenAmount,
  Tooltip,
  UsdAmount,
  TokenChip,
  TokenIcon,
  VaultHeader,
  ViewToggle,
  TimeSeriesChart,
  VoteTallyBar,
  YieldSparkline,
  useTheme,
  motion,
  useReducedMotion,
  useInView,
  type DataTableColumn,
  type DataTableSort,
} from '../components/ui'
import {
  ActorSwitcher,
  CuratorCard,
  AgreementStatusBadge,
  ProposalActionRow,
  ProposalKindBadge,
  ProposalStateBadge,
  ProposalTimeline,
  RiskTierBadge,
  ServiceStakeBreakdown,
  StrategyCard,
  SupportBadge,
  MutualStatusBadge,
  TimeControls,
} from '../components/protocol'
import type { ServiceStakeDenom } from '../hooks/useServiceStakeSummary'
import { DevWalletProvider } from '../contexts/DevWalletProvider'
import { OperatorIdentity } from '../components/protocol/OperatorIdentity'
import { AgentBadge } from '../components/protocol/AgentBadge'
import {
  CommitmentStatusBadge,
  MetadataStatusBadge,
  OperatorStatusBadge,
  type CommitmentStatus,
  type MetadataStatus,
} from '../components/protocol/Status'
import { Countdown } from '../components/protocol/Countdown'
import { LifecycleStepper } from '../components/protocol/LifecycleStepper'
import { commitmentLifecycle } from '../components/protocol/lifecycleUtils'
import { MetadataSummary } from '../components/protocol/MetadataSummary'
import { SharedLossGauge } from '../components/protocol/SharedLossGauge'
import { PendingLossNotice } from '../components/protocol/PendingLossNotice'
import { MetadataEditor } from '../components/metadata/MetadataEditor'
import { CommitmentTitle } from '../components/protocol/CommitmentTitle'
import { CommitmentTags } from '../components/protocol/CommitmentTags'
import { CommitmentTerms } from '../components/protocol/CommitmentTerms'
import { MetadataProvenance } from '../components/protocol/MetadataProvenance'
import { MetadataTrustBadge } from '../components/protocol/MetadataTrustBadge'
import { DerivedLabelPreview } from '../components/protocol/DerivedLabelPreview'
import type { CommitmentLabel } from '../lib/commitmentLabel'
import type { MetadataTrust } from '../lib/commitmentMetadata'
import { PartyRow } from '../components/protocol/PartyRow'
import { RiskRow } from '../components/protocol/RiskRow'
import { formatPercent, truncateAddress as truncateAddr } from '../lib/format'

const COLOR_TOKENS: Array<{ name: string; cssVar: string; note?: string }> = [
  { name: 'bg', cssVar: '--bg', note: 'page' },
  { name: 'surface', cssVar: '--surface', note: 'card' },
  { name: 'surface-2', cssVar: '--surface-2', note: 'nested' },
  { name: 'surface-3', cssVar: '--surface-3', note: 'pressed' },
  { name: 'border', cssVar: '--border' },
  { name: 'border-strong', cssVar: '--border-strong' },
  { name: 'text', cssVar: '--text', note: 'primary' },
  { name: 'text-muted', cssVar: '--text-muted', note: 'secondary' },
  { name: 'text-subtle', cssVar: '--text-subtle', note: 'labels' },
  { name: 'accent', cssVar: '--accent', note: 'single accent' },
  { name: 'success', cssVar: '--success' },
  { name: 'warn', cssVar: '--warn' },
  { name: 'error', cssVar: '--error' },
]

const TYPE_SCALE: Array<{ token: string; cssVar: string; sample: string }> = [
  { token: '2xl', cssVar: '--text-2xl', sample: 'Commitments Protocol' },
  { token: 'xl', cssVar: '--text-xl', sample: 'Page Heading' },
  { token: 'lg', cssVar: '--text-lg', sample: 'Section Heading' },
  { token: 'base', cssVar: '--text-base', sample: 'The body text — the workhorse of the system.' },
  { token: 'sm', cssVar: '--text-sm', sample: 'Secondary metadata, table cells, helper text.' },
  { token: 'xs', cssVar: '--text-xs', sample: 'Captions, footnotes, label-uppercase.' },
]

const SPACE_SCALE: Array<{ token: string; cssVar: string; px: number }> = [
  { token: '1', cssVar: '--space-1', px: 4 },
  { token: '2', cssVar: '--space-2', px: 8 },
  { token: '3', cssVar: '--space-3', px: 12 },
  { token: '4', cssVar: '--space-4', px: 16 },
  { token: '6', cssVar: '--space-6', px: 24 },
  { token: '8', cssVar: '--space-8', px: 32 },
  { token: '12', cssVar: '--space-12', px: 48 },
  { token: '16', cssVar: '--space-16', px: 64 },
]

function SectionHeading({ id, title, lead }: { id: string; title: string; lead?: string }) {
  return (
    <header className="ds-stack ds-stack-2" id={id}>
      <h2>{title}</h2>
      {lead && <p className="ds-muted ds-text-sm" style={{ maxWidth: '60ch' }}>{lead}</p>}
    </header>
  )
}

function ColorSwatch({ name, cssVar, note, theme }: { name: string; cssVar: string; note?: string; theme: 'light' | 'dark' }) {
  const [hex, setHex] = useState('')
  useEffect(() => {
    const rs = getComputedStyle(document.documentElement)
    // eslint-disable-next-line react-hooks/set-state-in-effect -- computed-style read on theme change; DOM is the external source; see frontend/docs/eslint-disable-rationale.md §Pattern-3
    setHex(rs.getPropertyValue(cssVar).trim())
  }, [cssVar, theme])

  const isLight = theme === 'light'
  const checkerLight = name === 'bg' || name === 'surface' || name === 'surface-2' || name === 'surface-3' || name === 'border' || name === 'border-strong'

  return (
    <div className="ds-stack ds-stack-2">
      <div
        style={{
          background: `var(${cssVar})`,
          height: 64,
          border: `1px solid ${checkerLight && isLight ? 'var(--border-strong)' : 'var(--border)'}`,
        }}
      />
      <div className="ds-stack ds-stack-1">
        <div className="ds-text-sm">{name}</div>
        <div className="ds-label" style={{ textTransform: 'none', letterSpacing: 0, color: 'var(--text-subtle)' }}>{hex || cssVar}</div>
        {note && <div className="ds-text-xs ds-subtle">{note}</div>}
      </div>
    </div>
  )
}

function TabsDemo() {
  const [tab, setTab] = useState<'overview' | 'commitments' | 'mesh'>('overview')
  return (
    <div className="ds-stack ds-stack-4">
      <div className="ds-text-sm ds-subtle" style={{ maxWidth: '70ch' }}>
        Use the <code>&lt;Tabs&gt;</code> primitive (Radix-shaped composition).
        Keyboard pattern is built-in: <kbd>←</kbd>/<kbd>→</kbd> cycle,
        <kbd>Home</kbd>/<kbd>End</kbd> jump to first/last, roving tabindex
        means the active trigger is the only one in the page tab order.
      </div>
      <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)}>
        <Tabs.List aria-label="Demo tabs">
          <Tabs.Trigger value="overview">overview</Tabs.Trigger>
          <Tabs.Trigger value="commitments" count={3}>commitments</Tabs.Trigger>
          <Tabs.Trigger value="mesh">mesh</Tabs.Trigger>
        </Tabs.List>
        <Tabs.Panel value="overview">
          <div className="ds-text-sm ds-muted">Overview panel content.</div>
        </Tabs.Panel>
        <Tabs.Panel value="commitments">
          <div className="ds-text-sm ds-muted">Commitments panel content (count badge demoed in trigger).</div>
        </Tabs.Panel>
        <Tabs.Panel value="mesh">
          <div className="ds-text-sm ds-muted">Mesh panel content.</div>
        </Tabs.Panel>
      </Tabs>
    </div>
  )
}

function ViewToggleDemo() {
  const [view, setView] = useState<'table' | 'graph'>('table')
  return (
    <div className="ds-stack ds-stack-4">
      <div className="ds-row ds-row-3" style={{ flexWrap: 'wrap' }}>
        <ViewToggle
          aria-label="commitments view"
          value={view}
          onChange={(v) => setView(v as 'table' | 'graph')}
          options={[
            { id: 'table', label: 'table' },
            { id: 'graph', label: 'graph' },
          ]}
        />
        <ViewToggle
          aria-label="density"
          size="sm"
          defaultValue="comfortable"
          options={[
            { id: 'comfortable', label: 'comfortable' },
            { id: 'compact', label: 'compact' },
          ]}
        />
      </div>
      <div className="ds-text-sm ds-muted">Active view: <span style={{ color: 'var(--text)' }}>{view}</span></div>
    </div>
  )
}

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

function ButtonsRow() {
  return (
    <div className="ds-stack ds-stack-4">
      <div className="ds-row ds-row-3" style={{ flexWrap: 'wrap' }}>
        <button className="ds-btn ds-btn--primary">Deposit</button>
        <button className="ds-btn">Withdraw</button>
        <button className="ds-btn ds-btn--ghost">Cancel</button>
        <button className="ds-btn ds-btn--destructive">Forfeit</button>
        <button className="ds-btn" disabled>Disabled</button>
        <button className="ds-btn"><span className="ds-spinner" aria-hidden /><span>Pending</span></button>
      </div>
      <div className="ds-row ds-row-3" style={{ flexWrap: 'wrap' }}>
        <button className="ds-btn ds-btn--primary ds-btn--sm">Confirm</button>
        <button className="ds-btn ds-btn--sm">Reset</button>
        <button className="ds-btn ds-btn--ghost ds-btn--sm">Skip</button>
        <button className="ds-btn ds-btn--destructive ds-btn--sm">Cancel</button>
      </div>
      <div className="ds-row ds-row-3" style={{ flexWrap: 'wrap' }}>
        <button className="ds-btn ds-btn--primary ds-btn--lg">Sign Transaction</button>
        <button className="ds-btn ds-btn--lg">Connect Wallet</button>
      </div>
    </div>
  )
}

function FormFieldDemo() {
  return (
    <div className="ds-stack ds-stack-3">
      <div className="ds-text-sm ds-muted">
        FormField — canonical label / control / helper / error stack. Reach for
        this primitive in every form so the rhythm matches across the app.
      </div>
      <div className="ds-grid-3" style={{ alignItems: 'start' }}>
        <FormField label="Title" required helper="Stored on-chain alongside the proposal.">
          <input className="ds-input" placeholder="Bump vaultShares to 0.9x" />
        </FormField>
        <FormField label="Reason" helper="Markdown supported. Optional.">
          <textarea className="ds-textarea" rows={3} placeholder="Why this change?" />
        </FormField>
        <FormField
          label="Penalty"
          required
          error="Must be 1–10000"
          htmlFor="formfield-error"
        >
          <input id="formfield-error" className="ds-input" defaultValue="999999" aria-invalid />
        </FormField>
      </div>
    </div>
  )
}

function InputsRow() {
  return (
    <div className="ds-grid-3" style={{ alignItems: 'start' }}>
      <div className="ds-field">
        <label className="ds-label" htmlFor="ds-i-1">Recipient</label>
        <input id="ds-i-1" className="ds-input" placeholder="0x…" />
        <span className="ds-field-helper">Ethereum address or ENS</span>
      </div>
      <div className="ds-field">
        <label className="ds-label" htmlFor="ds-i-2">Amount</label>
        <div className="ds-input-group">
          <input id="ds-i-2" className="ds-input" placeholder="0.00" inputMode="decimal" />
          <span className="ds-input-affix">ETH</span>
        </div>
        <span className="ds-field-helper">Available: <span className="ds-mono-num">12.40</span></span>
      </div>
      <div className="ds-field">
        <label className="ds-label" htmlFor="ds-i-3">Penalty</label>
        <input id="ds-i-3" className="ds-input" defaultValue="200" aria-invalid />
        <span className="ds-field-error">Maximum penalty is 100%.</span>
      </div>
      <div className="ds-field">
        <label className="ds-label" htmlFor="ds-i-4">Reason</label>
        <textarea id="ds-i-4" className="ds-textarea" placeholder="Justification for arbiter…" />
      </div>
      <div className="ds-field">
        <label className="ds-label" htmlFor="ds-i-5">Disabled</label>
        <input id="ds-i-5" className="ds-input" disabled defaultValue="locked-value" />
        <span className="ds-field-helper">Read-only until commitment matures.</span>
      </div>
      <div className="ds-field">
        <label className="ds-label" htmlFor="ds-i-6">URL</label>
        <div className="ds-input-group">
          <span className="ds-input-affix ds-input-affix--leading">ipfs://</span>
          <input id="ds-i-6" className="ds-input" placeholder="bafy…" />
        </div>
      </div>
    </div>
  )
}

function StatsRow() {
  return (
    <div className="ds-stack ds-stack-4">
      <div className="ds-text-sm ds-subtle" style={{ maxWidth: '70ch' }}>
        Use the <code>&lt;StatBlock&gt;</code> primitive for headline metrics.
        It composes <code>.ds-stat / .ds-stat-value / .ds-stat-label</code> and
        forwards an optional meta caption + tone (<code>positive</code>,
        <code>negative</code>, <code>accent</code>). The raw markup below the
        component row is the underlying HTML for slightly richer compositions
        (e.g. delta indicators), but most pages should reach for the component.
      </div>
      <div className="ds-stat-grid">
        <StatBlock
          label="TVL"
          value={<TokenAmount amount={parseEther('1247.328573')} decimals={18} symbol="ETH" compact />}
          meta="↑ 4.2% / 7d"
          tone="positive"
        />
        <StatBlock label="Commitments" value="18" meta="3 active forfeites" />
        <StatBlock label="Operators" value="7" meta="2 in cooldown" />
        <StatBlock label="Pending Forfeites" value="2" meta="expires in 18h" tone="accent" />
      </div>
      <div className="ds-label">raw markup (richer compositions)</div>
      <div className="ds-grid-4">
        <div className="ds-stat">
          <span className="ds-stat-label">TVL</span>
          <span className="ds-stat-value">
            <TokenAmount amount={parseEther('1247.328573')} decimals={18} symbol="ETH" compact />
          </span>
          <span className="ds-stat-delta ds-stat-delta--positive">↑ 4.2% / 7d</span>
        </div>
        <div className="ds-stat">
          <span className="ds-stat-label">Commitments</span>
          <span className="ds-stat-value">18</span>
          <span className="ds-stat-meta ds-muted">3 active forfeites</span>
        </div>
        <div className="ds-stat">
          <span className="ds-stat-label">Operators</span>
          <span className="ds-stat-value">7</span>
          <span className="ds-stat-meta ds-muted">2 in cooldown</span>
        </div>
        <div className="ds-stat">
          <span className="ds-stat-label">Pending Forfeites</span>
          <span className="ds-stat-value">2</span>
          <span className="ds-stat-meta ds-tx-pending">expires in 18h</span>
        </div>
      </div>
    </div>
  )
}

type NavRoute = { id: string; label: string; glyph: string; meta?: string }

const NAV_ROUTES: NavRoute[] = [
  { id: 'dashboard', label: 'Dashboard', glyph: '◇' },
  { id: 'vault', label: 'Vault', glyph: '◈', meta: '1.25K' },
  { id: 'commitments', label: 'Commitments', glyph: '◆', meta: '12' },
  { id: 'agreements', label: 'Agreements', glyph: '⬡', meta: '4' },
  { id: 'mesh', label: 'Mesh', glyph: '⌬' },
]

function HamburgerIcon() {
  return (
    <span className="ds-mobile-trigger-bars" aria-hidden>
      <span /><span /><span />
    </span>
  )
}

function TopNavDemo({ active, onActiveChange, onOpenDrawer, alwaysShowTrigger = false }: {
  active: string
  onActiveChange: (id: string) => void
  onOpenDrawer: () => void
  alwaysShowTrigger?: boolean
}) {
  return (
    <div className="ds-topnav">
      <a className="ds-topnav-brand" href="#" onClick={(e) => e.preventDefault()}>
        <BrandMark />
        <span>commitments</span>
      </a>
      <nav className="ds-topnav-links" aria-label="Primary">
        {NAV_ROUTES.map((r) => (
          <button
            key={r.id}
            type="button"
            className="ds-topnav-link"
            aria-current={active === r.id ? 'page' : undefined}
            onClick={() => onActiveChange(r.id)}
          >
            {r.label}
          </button>
        ))}
      </nav>
      <div className="ds-topnav-actions">
        <span className="ds-text-xs ds-subtle" style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
          <span className="ds-glyph ds-glyph--ok" aria-hidden>●</span> mainnet
        </span>
        <button className="ds-btn ds-btn--sm">connect</button>
        <button
          type="button"
          className={`ds-mobile-trigger${alwaysShowTrigger ? ' ds-mobile-trigger--always' : ''}`}
          aria-label="Open menu"
          onClick={onOpenDrawer}
        >
          <HamburgerIcon />
        </button>
      </div>
    </div>
  )
}

type NavChild = { id: string; label: string; desc?: string }
type NavGroup = { id: string; label: string; children: NavChild[] }

const DOCS_GROUP: NavGroup = {
  id: 'docs',
  label: 'Docs',
  children: [
    { id: 'docs/overview', label: 'Overview', desc: 'How commitments and agreements compose' },
    { id: 'docs/standards', label: 'Standards', desc: 'Draft standards and conformance boundaries' },
    { id: 'docs/protocol', label: 'Protocol', desc: 'Current architecture and operations' },
    { id: 'docs/operators', label: 'Operator Guide', desc: 'Running a node, registering metadata' },
  ],
}

function SideNavGroup({
  group,
  active,
  onActiveChange,
  defaultOpen = true,
}: {
  group: NavGroup
  active: string
  onActiveChange: (id: string) => void
  defaultOpen?: boolean
}) {
  const hasActiveChild = group.children.some((c) => c.id === active)
  const [open, setOpen] = useState(defaultOpen || hasActiveChild)

  return (
    <div className="ds-sidenav-group" data-open={open ? 'true' : 'false'}>
      <button
        type="button"
        className="ds-sidenav-link ds-sidenav-group-toggle"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <span className="ds-row" style={{ gap: 'var(--space-2)' }}>
          <span className="ds-disclosure-caret" aria-hidden />
          <span>{group.label}</span>
        </span>
        <span className="ds-sidenav-link-meta">{group.children.length}</span>
      </button>
      <div className="ds-sidenav-group-children" role="group" aria-label={group.label}>
        {group.children.map((c) => (
          <button
            key={c.id}
            type="button"
            className="ds-sidenav-link ds-sidenav-link--child"
            aria-current={active === c.id ? 'page' : undefined}
            onClick={() => onActiveChange(c.id)}
          >
            <span>{c.label}</span>
          </button>
        ))}
      </div>
    </div>
  )
}

function NavDropdown({
  label,
  group,
  active,
  onActiveChange,
  align = 'start',
}: {
  label: string
  group: NavGroup
  active: string
  onActiveChange: (id: string) => void
  align?: 'start' | 'end'
}) {
  const [open, setOpen] = useState(false)

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    const onClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement
      if (!target.closest('.ds-dropdown')) setOpen(false)
    }
    window.addEventListener('keydown', onKey)
    window.addEventListener('mousedown', onClick)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('mousedown', onClick)
    }
  }, [open])

  const hasActiveChild = group.children.some((c) => c.id === active)

  return (
    <div className="ds-dropdown" data-open={open ? 'true' : 'false'}>
      <button
        type="button"
        className="ds-topnav-link"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-current={hasActiveChild ? 'page' : undefined}
        onClick={() => setOpen((v) => !v)}
      >
        <span>{label}</span>
        <span className="ds-dropdown-trigger-caret" aria-hidden />
      </button>
      <div
        className={`ds-dropdown-panel${align === 'end' ? ' ds-dropdown-panel--end' : ''}`}
        role="menu"
      >
        <div className="ds-dropdown-section">{group.label.toLowerCase()}</div>
        {group.children.map((c) => (
          <button
            key={c.id}
            type="button"
            role="menuitem"
            className="ds-dropdown-link"
            aria-current={active === c.id ? 'page' : undefined}
            onClick={() => {
              onActiveChange(c.id)
              setOpen(false)
            }}
          >
            <span>{c.label}</span>
            {c.desc && <span className="ds-dropdown-link-desc">{c.desc}</span>}
          </button>
        ))}
      </div>
    </div>
  )
}

function SideNavWithGroupDemo({
  active,
  onActiveChange,
}: {
  active: string
  onActiveChange: (id: string) => void
}) {
  return (
    <nav className="ds-sidenav" aria-label="Sections">
      <div className="ds-sidenav-section">protocol</div>
      {NAV_ROUTES.slice(0, 2).map((r) => (
        <button
          key={r.id}
          type="button"
          className="ds-sidenav-link"
          aria-current={active === r.id ? 'page' : undefined}
          onClick={() => onActiveChange(r.id)}
        >
          <span>{r.label}</span>
          {r.meta && <span className="ds-sidenav-link-meta">{r.meta}</span>}
        </button>
      ))}
      <div className="ds-sidenav-section">activity</div>
      {NAV_ROUTES.slice(2).map((r) => (
        <button
          key={r.id}
          type="button"
          className="ds-sidenav-link"
          aria-current={active === r.id ? 'page' : undefined}
          onClick={() => onActiveChange(r.id)}
        >
          <span>{r.label}</span>
          {r.meta && <span className="ds-sidenav-link-meta">{r.meta}</span>}
        </button>
      ))}
      <div className="ds-sidenav-section">resources</div>
      <SideNavGroup group={DOCS_GROUP} active={active} onActiveChange={onActiveChange} />
    </nav>
  )
}

function SideNavDemo({ active, onActiveChange }: { active: string; onActiveChange: (id: string) => void }) {
  return (
    <nav className="ds-sidenav" aria-label="Sections">
      <div className="ds-sidenav-section">protocol</div>
      {NAV_ROUTES.slice(0, 2).map((r) => (
        <button
          key={r.id}
          type="button"
          className="ds-sidenav-link"
          aria-current={active === r.id ? 'page' : undefined}
          onClick={() => onActiveChange(r.id)}
        >
          <span>{r.label}</span>
          {r.meta && <span className="ds-sidenav-link-meta">{r.meta}</span>}
        </button>
      ))}
      <div className="ds-sidenav-section">activity</div>
      {NAV_ROUTES.slice(2).map((r) => (
        <button
          key={r.id}
          type="button"
          className="ds-sidenav-link"
          aria-current={active === r.id ? 'page' : undefined}
          onClick={() => onActiveChange(r.id)}
        >
          <span>{r.label}</span>
          {r.meta && <span className="ds-sidenav-link-meta">{r.meta}</span>}
        </button>
      ))}
    </nav>
  )
}

function DrawerDemo({
  open,
  onClose,
  active,
  onActiveChange,
}: {
  open: boolean
  onClose: () => void
  active: string
  onActiveChange: (id: string) => void
}) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  return (
    <div className="ds-drawer" data-open={open ? 'true' : 'false'} aria-hidden={!open}>
      <button
        type="button"
        className="ds-drawer-overlay"
        aria-label="Close menu"
        tabIndex={open ? 0 : -1}
        onClick={onClose}
      />
      <aside className="ds-drawer-panel" role="dialog" aria-label="Navigation">
        <div className="ds-drawer-panel-header">
          <span className="ds-topnav-brand">
            <BrandMark />
            <span>commitments</span>
          </span>
          <button type="button" className="ds-drawer-close" aria-label="Close menu" onClick={onClose}>×</button>
        </div>
        <div className="ds-drawer-panel-body">
          <SideNavDemo
            active={active}
            onActiveChange={(id) => {
              onActiveChange(id)
              onClose()
            }}
          />
        </div>
      </aside>
    </div>
  )
}

const TOC_SAMPLE = [
  { id: 'overview', label: 'Overview' },
  { id: 'state', label: 'State machine' },
  { id: 'parties', label: 'Parties' },
  { id: 'lifecycle', label: 'Lifecycle' },
  { id: 'metadata', label: 'Metadata' },
]

function TocDemo() {
  const [active, setActive] = useState('lifecycle')
  return (
    <nav className="ds-toc" aria-label="On this page">
      <div className="ds-toc-label">on this page</div>
      {TOC_SAMPLE.map((s) => (
        <button
          key={s.id}
          type="button"
          className="ds-toc-link"
          aria-current={active === s.id ? 'true' : undefined}
          onClick={() => setActive(s.id)}
        >
          {s.label}
        </button>
      ))}
    </nav>
  )
}

function BreadcrumbsDemo() {
  return (
    <nav className="ds-breadcrumbs" aria-label="Breadcrumb">
      <button type="button" className="ds-breadcrumb">Operators</button>
      <span className="ds-breadcrumb-separator" aria-hidden>/</span>
      <button type="button" className="ds-breadcrumb">Pellar Labs</button>
      <span className="ds-breadcrumb-separator" aria-hidden>/</span>
      <span className="ds-breadcrumb" aria-current="page">Commitment #0042</span>
    </nav>
  )
}

function BottomNavDemo({ active, onActiveChange }: { active: string; onActiveChange: (id: string) => void }) {
  return (
    <nav className="ds-bottom-nav ds-bottom-nav--always" aria-label="Primary (mobile)">
      <div className="ds-bottom-nav-list">
        {NAV_ROUTES.map((r) => (
          <button
            key={r.id}
            type="button"
            className="ds-bottom-nav-link"
            aria-current={active === r.id ? 'page' : undefined}
            onClick={() => onActiveChange(r.id)}
          >
            <span className="ds-bottom-nav-glyph" aria-hidden>{r.glyph}</span>
            <span>{r.label.length > 7 ? r.label.slice(0, 6) : r.label}</span>
          </button>
        ))}
      </div>
    </nav>
  )
}

function NavigationShowcase() {
  const [active, setActive] = useState('commitments')
  const [drawerOpen, setDrawerOpen] = useState(false)

  return (
    <div className="ds-stack ds-stack-8">
      {/* Top bar */}
      <div className="ds-stack ds-stack-3">
        <div className="ds-label">top bar · brand · primary nav · actions</div>
        <TopNavDemo
          active={active}
          onActiveChange={setActive}
          onOpenDrawer={() => setDrawerOpen(true)}
        />
        <div className="ds-text-xs ds-subtle">
          Sticky to viewport top in production. Brand is a home link; primary nav lists the top-level routes; actions hold network state and the wallet button. The hamburger only renders below 640px — try resizing the browser to see it appear.
        </div>
      </div>

      {/* Sidebar */}
      <div className="ds-stack ds-stack-3">
        <div className="ds-label">sidebar · vertical nav</div>
        <div className="ds-grid-2">
          <SideNavDemo active={active} onActiveChange={setActive} />
          <div className="ds-stack ds-stack-2 ds-text-sm" style={{ color: 'var(--text-muted)' }}>
            <p>Sections group related routes. Active route is marked with a tinted background and an accent left-border, so the eye finds the current location even in a long list.</p>
            <p>Trailing meta — counts, balances — sits right-aligned in tabular nums so columns stay aligned as values change.</p>
          </div>
        </div>
      </div>

      {/* App shell — sidebar + main + TOC */}
      <div className="ds-stack ds-stack-3">
        <div className="ds-label">app shell · sidebar + main + on-page toc</div>
        <div className="ds-nav-showcase ds-nav-showcase--with-toc">
          <SideNavDemo active={active} onActiveChange={setActive} />
          <div className="ds-nav-showcase-main">
            <div className="ds-stack ds-stack-3">
              <BreadcrumbsDemo />
              <h3 style={{ color: 'var(--text)', margin: 0 }}>Commitment #0042</h3>
              <p>Page content sits between the persistent sidebar and the on-page TOC. The TOC tracks the user's scroll position and highlights the active section.</p>
            </div>
          </div>
          <TocDemo />
        </div>
        <div className="ds-text-xs ds-subtle">
          The three columns collapse to a single column below 640px: sidebar disappears (its content moves into the drawer), TOC hides entirely (the page becomes its own index when scrolled), and main flows full-width.
        </div>
      </div>

      {/* Mobile drawer — interactive, always visible for demo */}
      <div className="ds-stack ds-stack-3">
        <div className="ds-label">mobile drawer · slide-in sidebar</div>
        <div className="ds-row" style={{ gap: 'var(--space-3)', flexWrap: 'wrap' }}>
          <button
            type="button"
            className="ds-btn ds-btn--sm"
            onClick={() => setDrawerOpen(true)}
          >
            Open drawer
          </button>
          <span className="ds-text-xs ds-subtle">
            Tinted overlay + slide animation. ESC or backdrop-click closes. Selecting a route auto-closes.
          </span>
        </div>
        <DrawerDemo
          open={drawerOpen}
          onClose={() => setDrawerOpen(false)}
          active={active}
          onActiveChange={setActive}
        />
      </div>

      {/* Breadcrumbs */}
      <div className="ds-stack ds-stack-3">
        <div className="ds-label">breadcrumbs · trail</div>
        <BreadcrumbsDemo />
        <div className="ds-text-xs ds-subtle">
          Forfeit separators match the file-path mental model. Trailing crumb is non-interactive (current page); upstream crumbs are buttons that navigate up the hierarchy.
        </div>
      </div>

      {/* TOC standalone */}
      <div className="ds-stack ds-stack-3">
        <div className="ds-label">in-page toc · anchor list</div>
        <div style={{ maxWidth: 240 }}>
          <TocDemo />
        </div>
        <div className="ds-text-xs ds-subtle">
          A left-border accent marks the section currently in view. Rendered as a right-rail on desktop, hidden on mobile (the page itself becomes the index when there's no sidebar competing for horizontal space).
        </div>
      </div>

      {/* Bottom nav — alternate mobile pattern */}
      <div className="ds-stack ds-stack-3">
        <div className="ds-label">bottom nav · alternate mobile pattern</div>
        <div style={{ position: 'relative', border: 'var(--border-width) solid var(--border)', maxWidth: 420, margin: '0 auto', overflow: 'hidden' }}>
          <div style={{ padding: 'var(--space-4)', minHeight: 160, color: 'var(--text-muted)', fontSize: 'var(--text-sm)' }}>
            App content scrolls beneath the persistent bar.
          </div>
          <BottomNavDemo active={active} onActiveChange={setActive} />
        </div>
        <div className="ds-text-xs ds-subtle">
          Use when the app feels mobile-first and the top-bar drawer isn't the primary entry point. Five destinations max — beyond that, return to the drawer pattern.
        </div>
      </div>

      {/* Nested navigation — sidebar disclosure + top-bar dropdown */}
      <div className="ds-stack ds-stack-6">
        <div className="ds-label">nested · parent with child pages</div>

        <div className="ds-grid-2">
          {/* Sidebar disclosure */}
          <div className="ds-stack ds-stack-3">
            <div className="ds-text-sm">
              <strong style={{ color: 'var(--text)' }}>Sidebar disclosure</strong>
              <span className="ds-subtle"> — primary pattern</span>
            </div>
            <SideNavWithGroupDemo active={active} onActiveChange={setActive} />
            <div className="ds-text-xs ds-subtle">
              Parent is itself clickable (toggles open) and shows a child count. The caret rotates rather than swapping characters so the row stays stable. When a child is the active page, the group auto-opens on first render.
            </div>
          </div>

          {/* Top-bar dropdown */}
          <div className="ds-stack ds-stack-3">
            <div className="ds-text-sm">
              <strong style={{ color: 'var(--text)' }}>Top-bar dropdown</strong>
              <span className="ds-subtle"> — when vertical space is scarce</span>
            </div>
            <div className="ds-topnav">
              <a className="ds-topnav-brand" href="#" onClick={(e) => e.preventDefault()}>
                <BrandMark />
                <span>commitments</span>
              </a>
              <nav className="ds-topnav-links" aria-label="Primary">
                <button
                  type="button"
                  className="ds-topnav-link"
                  aria-current={active === 'commitments' ? 'page' : undefined}
                  onClick={() => setActive('commitments')}
                >
                  Commitments
                </button>
                <button
                  type="button"
                  className="ds-topnav-link"
                  aria-current={active === 'mesh' ? 'page' : undefined}
                  onClick={() => setActive('mesh')}
                >
                  Mesh
                </button>
                <NavDropdown
                  label="Docs"
                  group={DOCS_GROUP}
                  active={active}
                  onActiveChange={setActive}
                />
              </nav>
              <div className="ds-topnav-actions">
                <button className="ds-btn ds-btn--sm">connect</button>
              </div>
            </div>
            <div className="ds-text-xs ds-subtle">
              Click "Docs" — the popover lists each child with an optional one-line description. ESC, click-outside, or selecting an item closes it. Parent inherits active styling when any child is current.
            </div>
          </div>
        </div>

        <div className="ds-text-xs ds-subtle" style={{ maxWidth: '70ch' }}>
          Two levels is the maximum we support directly. Three or more levels collapse into <code>breadcrumbs + sub-tabs</code>: the second level lives in the sidebar, the third becomes a tab strip on the destination page. Going deeper than that is a sign the information architecture wants to be flatter.
        </div>
      </div>
    </div>
  )
}

/* Notifications — Notice (inline), Toast (transient overlay), ErrorBlock
 * (technical/copyable). All three share the icon · title · message · actions
 * vocabulary. */

type DemoNoticeTone = 'info' | 'success' | 'warn' | 'danger'

type ToastEntry = {
  id: number
  tone: DemoNoticeTone
  title: string
  message?: string
  action?: { label: string; onClick: () => void }
}

function useToasts() {
  const [toasts, setToasts] = useState<ToastEntry[]>([])
  // Monotonic counter — refs are mutable by design; useState would be a bug.
  const nextRef = useRef({ n: 0 })
  const push = (t: Omit<ToastEntry, 'id'>) => {
    nextRef.current.n += 1
    const id = nextRef.current.n
    setToasts((prev) => [...prev, { ...t, id }])
    if (t.tone !== 'danger') {
      window.setTimeout(() => {
        setToasts((prev) => prev.filter((x) => x.id !== id))
      }, 4000)
    }
    return id
  }
  const dismiss = (id: number) => setToasts((prev) => prev.filter((t) => t.id !== id))
  return { toasts, push, dismiss }
}

function MotionShowcase() {
  const reduce = useReducedMotion()
  const fadeRef = useRef<HTMLDivElement>(null)
  const fadeInView = useInView(fadeRef, { once: false, margin: '-10%' })
  const [stagger, setStagger] = useState(0)

  return (
    <div className="ds-stack ds-stack-6">
      {/* 1. fade-in-on-scroll */}
      <div className="ds-stack ds-stack-3">
        <div className="ds-label">1 · fade-in-on-scroll</div>
        <div
          ref={fadeRef}
          style={{
            border: '1px solid var(--border)',
            padding: 'var(--space-6)',
            background: 'var(--surface)',
            minHeight: 96,
            display: 'flex',
            alignItems: 'center',
          }}
        >
          <motion.div
            initial={reduce ? false : { opacity: 0, y: 16 }}
            animate={
              reduce
                ? { opacity: 1, y: 0 }
                : fadeInView
                  ? { opacity: 1, y: 0 }
                  : { opacity: 0, y: 16 }
            }
            transition={{ duration: 0.55, ease: [0.2, 0.7, 0.2, 1] }}
            className="ds-mono"
          >
            Element fades + rises into view as the container crosses the
            viewport threshold. Re-triggered here so you can scroll it past.
          </motion.div>
        </div>
        <div className="ds-text-xs ds-subtle">
          Production usage sets <code>once: true</code> so the motion is
          single-shot. This demo passes <code>once: false</code> for visibility.
        </div>
      </div>

      {/* 2. staggered list */}
      <div className="ds-stack ds-stack-3">
        <div className="ds-label">2 · staggered list</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-4)' }}>
          <button
            type="button"
            className="ds-btn ds-btn--sm"
            onClick={() => setStagger((n) => n + 1)}
          >
            Replay
          </button>
          <span className="ds-text-xs ds-subtle">
            Children animate with a {reduce ? '0s' : '60ms'} delay between each
          </span>
        </div>
        <motion.ul
          key={stagger}
          variants={{
            hidden: {},
            visible: {
              transition: { staggerChildren: reduce ? 0 : 0.06 },
            },
          }}
          initial="hidden"
          animate="visible"
          style={{
            listStyle: 'none',
            padding: 0,
            margin: 0,
            display: 'grid',
            gridTemplateColumns: 'repeat(4, minmax(0, 1fr))',
            gap: 'var(--space-2)',
          }}
        >
          {Array.from({ length: 8 }).map((_, i) => (
            <motion.li
              key={i}
              variants={
                reduce
                  ? { hidden: {}, visible: {} }
                  : {
                      hidden: { opacity: 0, y: 12 },
                      visible: {
                        opacity: 1,
                        y: 0,
                        transition: { duration: 0.45, ease: [0.2, 0.7, 0.2, 1] },
                      },
                    }
              }
              style={{
                border: '1px solid var(--border)',
                background: 'var(--surface)',
                padding: 'var(--space-3)',
                fontFamily: 'var(--font-mono)',
                fontSize: 'var(--text-sm)',
                color: 'var(--text-muted)',
                textAlign: 'center',
              }}
            >
              item · {String(i + 1).padStart(2, '0')}
            </motion.li>
          ))}
        </motion.ul>
      </div>

      {/* 3. ambient loop */}
      <div className="ds-stack ds-stack-3">
        <div className="ds-label">3 · ambient loop</div>
        <div
          style={{
            border: '1px solid var(--border)',
            padding: 'var(--space-6)',
            background: 'var(--surface)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            minHeight: 96,
          }}
        >
          <svg viewBox="0 0 200 60" width="240" height="60">
            <motion.rect
              x={4}
              y={20}
              width={20}
              height={20}
              fill="none"
              stroke="var(--border-strong)"
              strokeWidth={1}
              animate={reduce ? undefined : { opacity: [0.4, 1, 0.4] }}
              transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
            />
            <motion.rect
              x={36}
              y={20}
              width={20}
              height={20}
              fill="var(--accent-soft)"
              stroke="var(--accent)"
              strokeWidth={1.5}
              animate={reduce ? undefined : { opacity: [0.5, 1, 0.5] }}
              transition={{ duration: 2.4, repeat: Infinity, ease: 'easeInOut' }}
            />
            <motion.path
              d="M64 30 L120 30"
              stroke="var(--accent)"
              strokeWidth={1.5}
              strokeDasharray="4 4"
              animate={reduce ? undefined : { strokeDashoffset: [0, -16] }}
              transition={{ duration: 1.6, repeat: Infinity, ease: 'linear' }}
              fill="none"
            />
            <motion.circle
              cx={148}
              cy={30}
              r={14}
              fill="var(--surface)"
              stroke="var(--accent)"
              strokeWidth={1.5}
              animate={reduce ? undefined : { scale: [1, 1.06, 1] }}
              transition={{ duration: 2.2, repeat: Infinity, ease: 'easeInOut' }}
              style={{ transformOrigin: '148px 30px', transformBox: 'fill-box' }}
            />
          </svg>
        </div>
        <div className="ds-text-xs ds-subtle">
          Use sparingly — only on dedicated teaching surfaces (landing, onboarding). The app shell stays still.
        </div>
      </div>
    </div>
  )
}

function NotificationsShowcase() {
  const { toasts, push, dismiss } = useToasts()
  const sampleErrorDetail = `ContractFunctionRevertedError: The contract function "proposeAgreement" reverted with the following reason:
ForfeitWindowTooShort(uint256 challengeWindow, uint256 minWindow)

Contract Call:
  address:   0x9f4Ec3CA88c8bC2c5BcD7c2cD0d4f87e1Fa2dE74
  function:  proposeAgreement(AgreementProposal proposal)
  args:                       ({ amount: 5000000000000000000n, ... })
  sender:    0x0123456789abcdef0123456789abcdef01234567

Docs: https://commitments.layer.xyz/docs/errors#ForfeitWindowTooShort
Version: viem@2.21.45`

  return (
    <div className="ds-stack ds-stack-8">
      {/* Inline notices */}
      <div className="ds-stack ds-stack-3">
        <div className="ds-label">notice · inline · 4 tones</div>
        <div className="ds-stack ds-stack-3">
          <Notice tone="info" title="Indexer is catching up" onDismiss={() => {}}>
            New commitments may take up to 30 seconds to appear in this view.
          </Notice>
          <Notice
            tone="success"
            title="Commitment created"
            onDismiss={() => {}}
            actions={
              <>
                <button className="ds-btn ds-btn--sm">View on explorer</button>
                <button className="ds-btn ds-btn--sm">Copy ID</button>
              </>
            }
          >
            Commitment <code>#0042</code> is now active. The depositor's shares are locked until the forfeit window expires.
          </Notice>
          <Notice tone="warn" title="Approaching forfeit window" onDismiss={() => {}}>
            The challenge window for commitment <code>#0039</code> closes in 14 minutes. Cancel now if the off-chain condition resolved.
          </Notice>
          <Notice
            tone="danger"
            title="RPC request failed"
            onDismiss={() => {}}
            actions={
              <>
                <button className="ds-btn ds-btn--sm ds-btn--primary">Retry</button>
                <button className="ds-btn ds-btn--sm">Switch RPC</button>
              </>
            }
          >
            Couldn't reach the configured RPC endpoint. The node may be syncing or rate-limited.
          </Notice>
        </div>
        <div className="ds-text-xs ds-subtle">
          Inline notices live in flow next to the thing they describe. Persistent unless explicitly dismissed. The colored left border carries tone — fills are kept off so the notice doesn't shout louder than the content.
        </div>
      </div>

      {/* Toasts */}
      <div className="ds-stack ds-stack-3">
        <div className="ds-label">toast · transient overlay</div>
        <div className="ds-row" style={{ gap: 'var(--space-2)', flexWrap: 'wrap' }}>
          <button
            className="ds-btn ds-btn--sm"
            onClick={() => push({ tone: 'info', title: 'Refreshing balances', message: 'Reading on-chain state.' })}
          >
            Trigger info
          </button>
          <button
            className="ds-btn ds-btn--sm"
            onClick={() => push({
              tone: 'success',
              title: 'Stake released',
              message: '8.00 ETH returned to your vault balance.',
              action: { label: 'View tx', onClick: () => {} },
            })}
          >
            Trigger success
          </button>
          <button
            className="ds-btn ds-btn--sm"
            onClick={() => push({ tone: 'warn', title: 'Network changed', message: 'Switched to Sepolia. Re-check your active commitments.' })}
          >
            Trigger warn
          </button>
          <button
            className="ds-btn ds-btn--sm"
            onClick={() => push({
              tone: 'danger',
              title: 'Transaction reverted',
              message: 'ChallengeWindowTooShort — challenge window must be ≥ 1 day.',
            })}
          >
            Trigger error
          </button>
        </div>

        {/* Local region so toasts stack within the showcase frame, not the viewport */}
        <div
          style={{
            position: 'relative',
            border: 'var(--border-width) solid var(--border)',
            background: 'var(--surface-2)',
            padding: 'var(--space-3)',
            minHeight: 140,
          }}
        >
          <div className="ds-text-xs ds-subtle">Toasts stack here. Auto-dismiss after 4s for non-errors; errors are sticky until dismissed.</div>
          <div
            className="ds-toast-region ds-toast-region--local"
            style={{ marginTop: 'var(--space-3)' }}
            aria-live="polite"
          >
            {toasts.map((t) => (
              <Notice
                key={t.id}
                isToast
                tone={t.tone}
                title={t.title}
                onDismiss={() => dismiss(t.id)}
                actions={t.action && (
                  <button className="ds-btn ds-btn--sm" onClick={t.action.onClick}>{t.action.label}</button>
                )}
              >
                {t.message}
              </Notice>
            ))}
          </div>
        </div>

        <div className="ds-text-xs ds-subtle" style={{ maxWidth: '70ch' }}>
          Position: <code>top-right</code> by default for desktop, <code>bottom-center</code> by convention on mobile. Errors are <em>sticky</em> — auto-dismiss is appropriate for confirmations, not for surfaces the user needs to read and act on. <code>aria-live="polite"</code> on the region announces non-error toasts; error toasts use <code>role="alert"</code> for immediate announcement.
        </div>
      </div>

      {/* Error block — copyable */}
      <div className="ds-stack ds-stack-3">
        <div className="ds-label">error block · copyable technical detail</div>
        <ErrorBlock
          title="Transaction reverted"
          message={
            <>
              The contract rejected <code>proposeAgreement</code> with{' '}
              <code>ChallengeWindowTooShort</code>. The challenge window must be at least 1 day.
            </>
          }
          meta={[
            { label: 'tx', value: '0xa1b2…f7e3' },
            { label: 'block', value: '21,407,118' },
            { label: 'gas', value: '184,221' },
          ]}
          detail={sampleErrorDetail}
          actions={<button className="ds-btn ds-btn--sm ds-btn--primary">Retry</button>}
        />
        <div className="ds-text-xs ds-subtle" style={{ maxWidth: '70ch' }}>
          The copy button surfaces the raw error string — including the contract function, args, sender, and viem version — so users can paste a full reproduction into a bug report without manual selection. The "Show details" disclosure keeps the error block compact by default; technical readers expand on demand.
        </div>
      </div>

      {/* Inline form error reminder */}
      <div className="ds-stack ds-stack-3">
        <div className="ds-label">inline form error · existing primitive</div>
        <div className="ds-field" style={{ maxWidth: 360 }}>
          <label className="ds-label" htmlFor="ds-demo-arbiter">arbiter</label>
          <input
            id="ds-demo-arbiter"
            className="ds-input"
            defaultValue="0xnotvalid"
            aria-invalid="true"
            aria-describedby="ds-demo-arbiter-error"
          />
          <div className="ds-field-error" id="ds-demo-arbiter-error">Not a valid Ethereum address — must be 0x-prefixed and 40 hex chars.</div>
        </div>
        <div className="ds-text-xs ds-subtle">
          Inline field errors use the existing <code>.ds-field-error</code> + <code>aria-invalid</code> + <code>aria-describedby</code> trio. They're the right shape for input validation; reach for <code>Notice</code> or <code>ErrorBlock</code> only when the error spans a panel or carries technical detail worth copying.
        </div>
      </div>

      {/* Decision matrix */}
      <div className="ds-stack ds-stack-3">
        <div className="ds-label">when to use which</div>
        <div className="ds-card">
          <table className="ds-table">
            <thead>
              <tr>
                <th>surface</th>
                <th>use when</th>
                <th>persistence</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td><code>field-error</code></td>
                <td>input validation, scoped to one field</td>
                <td>until the field is corrected</td>
              </tr>
              <tr>
                <td><code>Notice</code></td>
                <td>state of a panel or section</td>
                <td>until dismissed</td>
              </tr>
              <tr>
                <td><code>Toast</code></td>
                <td>confirmation of a one-shot action</td>
                <td>~4s · errors sticky</td>
              </tr>
              <tr>
                <td><code>ErrorBlock</code></td>
                <td>technical errors worth copying</td>
                <td>until resolved</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

function DisclosureDemo() {
  return (
    <div className="ds-stack ds-stack-4">
      <div className="ds-stack ds-stack-3">
        <div className="ds-label">collapsed by default · uncontrolled</div>
        <div className="ds-card">
          <div className="ds-stack ds-stack-3">
            <div className="ds-row" style={{ justifyContent: 'space-between' }}>
              <span className="ds-text-sm">Net APY</span>
              <span className="ds-mono-num ds-text-base">12.40%</span>
            </div>
            <Disclosure label="How is APY calculated?">
              <table className="ds-table ds-text-sm">
                <tbody>
                  <tr><td>Base yield</td><td className="ds-mono-num">+ 14.20%</td></tr>
                  <tr><td>Rewards</td><td className="ds-mono-num">+ 0.00%</td></tr>
                  <tr><td>Performance fee</td><td className="ds-mono-num">− 1.80%</td></tr>
                  <tr><td><strong>Net APY</strong></td><td className="ds-mono-num"><strong>12.40%</strong></td></tr>
                </tbody>
              </table>
            </Disclosure>
          </div>
        </div>
      </div>
      <div className="ds-stack ds-stack-3">
        <div className="ds-label">open by default · uncontrolled</div>
        <div className="ds-card">
          <Disclosure label="Risk parameters" defaultOpen>
            <div className="ds-stack ds-stack-2 ds-text-sm">
              <div className="ds-row" style={{ justifyContent: 'space-between' }}><span>Max forfeiture exposure</span><span className="ds-mono-num">25%</span></div>
              <div className="ds-row" style={{ justifyContent: 'space-between' }}><span>Longest unbonding</span><span className="ds-mono-num">14d</span></div>
              <div className="ds-row" style={{ justifyContent: 'space-between' }}><span>Last monitored</span><span className="ds-subtle">3m ago</span></div>
            </div>
          </Disclosure>
        </div>
      </div>
    </div>
  )
}

function TooltipDemo() {
  const [open, setOpen] = useState(false)
  return (
    <div className="ds-stack ds-stack-4">
      <div className="ds-stack ds-stack-3">
        <div className="ds-label">inline term · default icon trigger · hover or focus</div>
        <p className="ds-text-sm ds-muted" style={{ maxWidth: 520 }}>
          Your stake stays{' '}
          <Tooltip
            tone="info"
            content="Encumbered balance is custodied stake that's pledged to an active commitment — it can't be moved or withdrawn until the commitment is released."
          >
            encumbered
          </Tooltip>{' '}
          while the commitment is live, and the backing keeps earning yield in the meantime{' '}
          <Tooltip
            tone="info"
            triggerLabel="What is yield backing?"
            content="The manager custodies your vault shares; the underlying assets keep earning, so the same capital secures the commitment and accrues yield."
          />
          .
        </p>
      </div>
      <div className="ds-stack ds-stack-3">
        <div className="ds-label">tones · placements</div>
        <div className="ds-row ds-row-2" style={{ flexWrap: 'wrap', gap: 'var(--space-4)' }}>
          <Tooltip tone="neutral" placement="bottom" content="Neutral, opens below.">neutral</Tooltip>
          <Tooltip tone="success" placement="top" content="Success tone, opens above.">success</Tooltip>
          <Tooltip tone="warn" placement="right" content="Warn tone, opens to the right.">warn</Tooltip>
          <Tooltip tone="danger" placement="left" size="lg" content="Danger tone, larger panel, opens to the left.">danger</Tooltip>
        </div>
      </div>
      <div className="ds-stack ds-stack-3">
        <div className="ds-label">controlled · open + onOpenChange</div>
        <div className="ds-row ds-row-2" style={{ alignItems: 'center' }}>
          <Tooltip
            tone="info"
            open={open}
            onOpenChange={setOpen}
            content="This panel's visibility is owned by the page via open + onOpenChange."
          >
            controlled hint
          </Tooltip>
          <span className="ds-text-xs ds-subtle">open: {String(open)}</span>
        </div>
      </div>
    </div>
  )
}

function OverlaysDemo() {
  const [modalOpen, setModalOpen] = useState(false)
  const [drawerOpen, setDrawerOpen] = useState(false)
  return (
    <div className="ds-stack ds-stack-4">
      <div className="ds-row ds-row-2" style={{ flexWrap: 'wrap' }}>
        <button type="button" className="ds-btn ds-btn--primary" onClick={() => setModalOpen(true)}>
          Open Modal
        </button>
        <button type="button" className="ds-btn" onClick={() => setDrawerOpen(true)}>
          Open Drawer (right)
        </button>
      </div>
      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title="Confirm action"
        description="Centered dialog. Best for one-shot confirmations and short forms."
        size="md"
        footer={
          <div className="ds-row ds-row-2" style={{ justifyContent: 'flex-end' }}>
            <button type="button" className="ds-btn ds-btn--ghost" onClick={() => setModalOpen(false)}>Cancel</button>
            <button type="button" className="ds-btn ds-btn--primary" onClick={() => setModalOpen(false)}>Confirm</button>
          </div>
        }
      >
        <p className="ds-text-sm ds-muted">
          Modal renders into a portal under <code>&lt;body&gt;</code>, traps focus, and dismisses on Escape or
          backdrop click. Use it for confirmations, short forms, and acknowledgements.
        </p>
      </Modal>
      <Drawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        side="right"
        size="md"
        title="Propose agreement"
        description="Right-anchored panel. Best for multi-screen flows that need the page as reference."
      >
        <div className="ds-stack ds-stack-4">
          <p className="ds-text-sm ds-muted">
            Drawer mirrors the Modal API but slides in from the right (or bottom on narrow viewports).
            Reserve it for multi-screen flows that reference the page behind them (the agreement
            proposal builder) and for the mobile nav. Single-screen transactional flows — deposit,
            withdraw, underwrite, buy cover — use Modal: that&rsquo;s the app-wide house style.
          </p>
          <div className="ds-stack ds-stack-2">
            <div className="ds-label">Counterparty</div>
            <input className="ds-input" placeholder="0x…" inputMode="text" />
            <div className="ds-text-xs ds-subtle">Step 1 of 3 · terms and legs follow</div>
          </div>
          <div className="ds-row ds-row-2" style={{ justifyContent: 'flex-end' }}>
            <button type="button" className="ds-btn" onClick={() => setDrawerOpen(false)}>Cancel</button>
            <button type="button" className="ds-btn ds-btn--primary" onClick={() => setDrawerOpen(false)}>Continue</button>
          </div>
        </div>
      </Drawer>
    </div>
  )
}

// ─── TOC Index (Phase 28-03) ──────────────────────────────────────────────
// Each entry mirrors the `id=` on a SectionHeading below. Source of truth for
// the desktop sticky sidebar + the mobile <details> accordion.
const TOC_SECTIONS: Array<{ id: string; label: string }> = [
  { id: 'color', label: 'Color' },
  { id: 'typography', label: 'Typography' },
  { id: 'social-link', label: 'Social Link' },
  { id: 'spacing', label: 'Spacing' },
  { id: 'stats', label: 'Stat Blocks' },
  { id: 'assets', label: 'Assets' },
  { id: 'defi-vaults', label: 'DeFi Vaults' },
  { id: 'vault-metadata', label: 'Vault Metadata' },
  { id: 'service-stake', label: 'Service Stake' },
  { id: 'vault-header', label: 'Vault Header' },
  { id: 'entity-cards', label: 'Entity Cards' },
  { id: 'buttons', label: 'Buttons' },
  { id: 'inputs', label: 'Inputs' },
  { id: 'surfaces', label: 'Surfaces' },
  { id: 'card', label: 'Card' },
  { id: 'media-row', label: 'Media Row' },
  { id: 'tables', label: 'Tables' },
  { id: 'data-table', label: 'Data Table' },
  { id: 'filter-bar', label: 'Filter Bar' },
  { id: 'badges', label: 'Status Badges' },
  { id: 'agent-badge', label: 'Agent Badge' },
  { id: 'tx', label: 'Transaction State' },
  { id: 'glyphs', label: 'Glyphs' },
  { id: 'address', label: 'Address Display' },
  { id: 'tabs', label: 'Tabs' },
  { id: 'view-toggle', label: 'View Toggle' },
  { id: 'navigation', label: 'Navigation' },
  { id: 'entity-logo', label: 'Entity Logo' },
  { id: 'operators', label: 'Operators' },
  { id: 'commitments', label: 'Commitments' },
  { id: 'mutual', label: 'Mutuals / Shared Loss' },
  { id: 'commitment-naming', label: 'Commitment Naming' },
  { id: 'metadata-editor', label: 'Metadata Editor' },
  { id: 'loading', label: 'Loading & Placeholders' },
  { id: 'motion', label: 'Motion' },
  { id: 'notifications', label: 'Notifications' },
  { id: 'disclosure', label: 'Disclosure' },
  { id: 'tooltip', label: 'Tooltip' },
  { id: 'overlays', label: 'Overlays' },
  { id: 'empty', label: 'Empty States' },
  { id: 'governance', label: 'Governance' },
  { id: 'dev-tools', label: 'Dev Tools' },
]

// Static demo controller so /design renders without an actual anvil node.
const STUB_TIME_CONTROLLER = {
  now: BigInt(Math.floor(Date.UTC(2026, 3, 29, 14, 32) / 1000)),
  blockNumber: 12_345n,
  isLoading: false,
  refresh: async () => {},
  advance: async () => {},
  mine: async () => {},
  warpTo: async () => {},
  setAutomine: async () => {},
}

/**
 * The naming vocabulary, tier by tier and trust level by trust level.
 *
 * Labels are constructed literally here rather than derived from fixture rows:
 * the point of the section is the RENDERING contract, and hand-writing the
 * `source` / `trust` combinations makes the ones a real corpus rarely produces
 * (a mismatch, an unreachable URI) as visible as the common case.
 */
function CommitmentNamingDemo() {
  const label = (
    text: string,
    source: CommitmentLabel['source'],
    trust: MetadataTrust,
    extra: Partial<CommitmentLabel> = {},
  ): CommitmentLabel => ({ text, full: text, source, trust, ...extra })

  const tiers: Array<{ tier: string; when: string; label: CommitmentLabel }> = [
    {
      tier: '1 · metadata',
      when: 'title fetched and its hash matched',
      label: label('Weekly market-data delivery', 'metadata', 'attested'),
    },
    {
      tier: '1 · metadata',
      when: 'title fetched, but no hash was ever posted',
      label: label('Oracle uptime bond', 'metadata', 'unattested'),
    },
    {
      tier: '2 · derived',
      when: 'one leg of a bilateral agreement',
      label: label('Agreement #4, side A', 'derived', 'none'),
    },
    {
      tier: '2 · derived',
      when: 'counterparty is a registered operator',
      label: label('Delegation to Acme Node Co.', 'derived', 'none'),
    },
    {
      tier: '2 · derived',
      when: 'counterparty is a known protocol contract',
      label: label('Vault depositors (restitution)', 'derived', 'none'),
    },
    {
      tier: '2 · derived',
      when: 'nothing but the shape of the stake',
      label: label('1,204 cvUSDC held against 0x2222…22ab', 'derived', 'none'),
    },
    {
      tier: '3 · id',
      when: 'no counterparty resolved at all',
      label: label('#12', 'id', 'none'),
    },
  ]

  const gated: Array<{ label: CommitmentLabel; note: string }> = [
    {
      label: label('Nightly backup attestation', 'derived', 'mismatch', {
        text: '1,204 cvUSDC held against 0x2222…22ab',
        full: '1,204 cvUSDC held against 0x2222…22ab',
        withheldTitle: 'Nightly backup attestation',
      }),
      note: 'The off-chain title is refused and the row falls back to its derived label. The refused text survives on `withheldTitle` for the warning block to quote.',
    },
    {
      label: label('1,204 cvUSDC held against 0x2222…22ab', 'derived', 'unreachable'),
      note: 'Nothing could be fetched, so there is no title to consider. The badge says why the row has no name of its own.',
    },
  ]

  return (
    <div className="ds-stack ds-stack-6">
      {/* Tiers */}
      <div className="ds-stack ds-stack-3">
        <div className="ds-label">commitmentLabel · tiers</div>
        <table className="ds-table ds-table--sm">
          <thead>
            <tr>
              <th style={{ width: '140px' }}>tier</th>
              <th>rendered</th>
              <th>when</th>
            </tr>
          </thead>
          <tbody>
            {tiers.map((t, i) => (
              <tr key={i}>
                <td className="ds-subtle">{t.tier}</td>
                <td>
                  <CommitmentTitle label={t.label} showAttested />
                </td>
                <td className="ds-subtle ds-text-xs">{t.when}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="ds-text-xs ds-subtle">
          Derived labels render italic and muted so a structural guess never reads as something a
          person typed. The id stays on the row's second line in every tier but the last, where it
          is already the name.
        </p>
      </div>

      {/* The security rule */}
      <div className="ds-stack ds-stack-3">
        <div className="ds-label">unverified text never gets a heading</div>
        {gated.map((g, i) => (
          <div key={i} className="ds-stack ds-stack-2">
            <CommitmentTitle label={g.label} />
            <p className="ds-text-xs ds-subtle">{g.note}</p>
          </div>
        ))}
      </div>

      {/* Trust badges */}
      <div className="ds-stack ds-stack-3">
        <div className="ds-label">MetadataTrustBadge · five levels</div>
        <div className="ds-row ds-row-4" style={{ flexWrap: 'wrap', alignItems: 'center' }}>
          {(['attested', 'unattested', 'mismatch', 'unreachable', 'none'] as MetadataTrust[]).map(
            (trust) => (
              <span key={trust} className="ds-row ds-row-2" style={{ alignItems: 'center' }}>
                <span className="ds-text-xs ds-subtle" style={{ minWidth: 88 }}>
                  {trust}
                </span>
                <MetadataTrustBadge trust={trust} showAttested size="sm" />
                {trust === 'none' && <span className="ds-text-xs ds-subtle">(renders nothing)</span>}
              </span>
            ),
          )}
        </div>
        <p className="ds-text-xs ds-subtle">
          Distinct from <code>MetadataStatusBadge</code>, which collapses "the hash does not match"
          and "nothing could be fetched" into one <code>invalid</code>. Those ask the reader for
          different reactions, so they keep different tone and different words. In lists the good
          case is silent by default: a badge on every row trains people to ignore the badge on the
          row that matters.
        </p>
      </div>

      {/* Tags */}
      <div className="ds-stack ds-stack-3">
        <div className="ds-label">CommitmentTags</div>
        <div className="ds-stack ds-stack-2">
          <CommitmentTags tags={['oracle', 'sla', 'uptime']} />
          <CommitmentTags
            tags={['oracle', 'sla', 'uptime', 'weth', 'relay', 'custody']}
            max={3}
            active={['sla']}
            onSelect={() => {}}
          />
        </div>
        <p className="ds-text-xs ds-subtle">
          Inert by default; pass <code>onSelect</code> to make them filters. Clicks are stopped
          before they bubble, so the same markup works inside a click-to-open table row and inside a{' '}
          <code>MediaRow</code> overlay. <code>max</code> collapses the rest into a <code>+N</code>{' '}
          whose tooltip lists them.
        </p>
      </div>

      {/* Terms + provenance */}
      <div className="ds-stack ds-stack-3">
        <div className="ds-label">CommitmentTerms · leads the detail page</div>
        <CommitmentTerms
          trust="attested"
          description={
            'Backs a weekly OHLCV feed for the desk. Index appreciation on the locked shares pays the buyer a premium for the week it stays live.\n\nMissed deliveries are arbitrated against the published schedule.'
          }
          termsURI="ipfs://bafybeigdyrztterms/terms.pdf"
          tags={['data-feed', 'premium', 'sla']}
        />
        <p className="ds-text-xs ds-subtle">
          Renders nothing for <code>mismatch</code>, <code>unreachable</code>, or <code>none</code>.
          Markdown goes through the docs viewer's configuration with no <code>rehype-raw</code>;
          images are disallowed outright, and a link whose scheme is not on the allowlist renders as
          plain text.
        </p>
      </div>

      <div className="ds-stack ds-stack-3">
        <div className="ds-label">MetadataProvenance · collapses below it</div>
        <MetadataProvenance
          trust="attested"
          uri="ipfs://bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi"
          hash="0xab7f1e4c2d5b6a9081726354ffee11223344556677889900aabbccddeeff0011"
          content={{
            schemaVersion: 'commitment.v1',
            title: 'Weekly market-data delivery',
            tags: ['data-feed', 'premium', 'sla'],
          }}
          onRefetch={() => {}}
        />
        <MetadataProvenance
          trust="mismatch"
          uri="ipfs://bafybeimismatchexampleuh7y26nf3efuylqabf3oclgtqy55fbzdi"
          hash="0x0011223344556677889900aabbccddeeff1e4c2d5b6a908172635476ab7f1e4c"
          withheldTitle="Nightly backup attestation"
        />
        <p className="ds-text-xs ds-subtle">
          Schema-agnostic, so vault, operator, and service surfaces can reuse it. Failures render
          outside the disclosure: nobody should have to expand a panel to learn that the text above
          them failed verification.
        </p>
      </div>

      {/* Authoring preview */}
      <div className="ds-stack ds-stack-3">
        <div className="ds-label">DerivedLabelPreview · in create forms</div>
        <DerivedLabelPreview
          counterparty={'0x22222222222222222222222222222222222222ab'}
          token={'0x4444444444444444444444444444444444444444'}
          amount={1_204_000_000n}
          decimals={6}
          symbol="cvUSDC"
        />
        <p className="ds-text-xs ds-subtle">
          Naming is a nudge, not a gate. Rather than nagging, the form shows what leaving the title
          blank actually produces, and lets the author decide whether that is good enough. Runs the
          same tiers as a live row via <code>pendingCommitmentLabel</code>.
        </p>
      </div>
    </div>
  )
}

function GovernanceDemo() {
  const proposalStates = [
    'pending',
    'active',
    'succeeded',
    'queued',
    'executed',
    'defeated',
    'canceled',
    'expired',
  ] as const
  const proposalKinds = ['weight_update', 'forfeit_arbitration', 'treasury', 'signaling', 'mixed'] as const
  return (
    <div className="ds-stack ds-stack-6">
      <div className="ds-stack ds-stack-2">
        <div className="ds-text-sm ds-muted">ProposalStateBadge — eight lifecycle states</div>
        <div className="ds-row" style={{ flexWrap: 'wrap', gap: 8 }}>
          {proposalStates.map((s) => (
            <ProposalStateBadge key={s} state={s} />
          ))}
        </div>
      </div>

      <div className="ds-stack ds-stack-2">
        <div className="ds-text-sm ds-muted">ProposalKindBadge — five action shapes</div>
        <div className="ds-row" style={{ flexWrap: 'wrap', gap: 8 }}>
          {proposalKinds.map((k) => (
            <ProposalKindBadge key={k} kind={k} />
          ))}
        </div>
      </div>

      <div className="ds-stack ds-stack-2">
        <div className="ds-text-sm ds-muted">SupportBadge — for / against / abstain</div>
        <div className="ds-row" style={{ flexWrap: 'wrap', gap: 8 }}>
          <SupportBadge support={1} />
          <SupportBadge support={0} />
          <SupportBadge support={2} />
        </div>
      </div>

      <div className="ds-stack ds-stack-2">
        <div className="ds-text-sm ds-muted">VoteTallyBar — for/against/abstain over voting power</div>
        <Card>
          <VoteTallyBar
            forVotes={parseEther('600')}
            againstVotes={parseEther('200')}
            abstainVotes={parseEther('100')}
          />
        </Card>
        <Card>
          <VoteTallyBar forVotes={0n} againstVotes={0n} abstainVotes={0n} />
        </Card>
      </div>

      <div className="ds-stack ds-stack-2">
        <div className="ds-text-sm ds-muted">QuorumMeter — progress to quorum</div>
        <Card>
          <QuorumMeter progress={parseEther('700')} target={parseEther('400')} />
        </Card>
      </div>

      <div className="ds-stack ds-stack-2">
        <div className="ds-text-sm ds-muted">ProposalTimeline — five-step lifecycle</div>
        <div className="ds-stack ds-stack-3">
          <Card>
            <ProposalTimeline state="active" />
          </Card>
          <Card>
            <ProposalTimeline state="executed" />
          </Card>
          <Card>
            <ProposalTimeline state="defeated" />
          </Card>
        </div>
      </div>

      <div className="ds-stack ds-stack-2">
        <div className="ds-text-sm ds-muted">ProposalActionRow — per-kind action card</div>
        <div className="ds-stack ds-stack-3">
          <Card>
            <ProposalActionRow
              index={0}
              target="0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
              value={0n}
              calldata="0x0000000000000000000000000000000000000000000000000000000000000000"
              kind="weight_update"
              decoded={{
                tokenWeighting: '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
                denom: '0xdededededededededededededededededededededededededededededededede',
                newWeightBps: '9000',
              }}
            />
          </Card>
          <Card>
            <ProposalActionRow
              index={0}
              target="0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
              value={0n}
              calldata="0x00000000"
              kind="forfeit_arbitration"
              decoded={{
                manager: '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
                op: 'initiateForfeit',
                commitmentId: '42',
                penaltyBps: 2500,
              }}
            />
          </Card>
          <Card>
            <ProposalActionRow
              index={0}
              target="0xcccccccccccccccccccccccccccccccccccccccc"
              value={0n}
              calldata="0x"
              kind="signaling"
              decoded={null}
            />
          </Card>
        </div>
      </div>
    </div>
  )
}

function DevToolsDemo() {
  return (
    <DevWalletProvider>
      <div className="ds-stack ds-stack-4">
        <div className="ds-stack ds-stack-2">
          <div className="ds-text-sm ds-muted">Actor switcher</div>
          <ActorSwitcher />
        </div>
        <div className="ds-stack ds-stack-2">
          <div className="ds-text-sm ds-muted">Time controls (stubbed)</div>
          <TimeControls controller={STUB_TIME_CONTROLLER} />
        </div>
        <div className="ds-text-xs ds-subtle">
          These primitives only function on chainId 31337 inside the /admin tree —
          this preview uses a stub controller and the standard Anvil mnemonic.
        </div>
      </div>
    </DevWalletProvider>
  )
}

function DocsToc() {
  return (
    <>
      {/* Desktop sticky sidebar — visible at >=1024px via .ds-docs-toc media rule */}
      <aside className="ds-docs-toc" aria-label="Design system sections">
        <div className="ds-docs-toc-label">on this page</div>
        {TOC_SECTIONS.map((s) => (
          <a key={s.id} href={`#${s.id}`}>{s.label}</a>
        ))}
        <div className="ds-docs-toc-label" style={{ marginTop: 'var(--space-4)' }}>more</div>
        <Link to="/app/design/recipes" style={{ color: 'var(--accent)' }}>→ Recipes</Link>
      </aside>
    </>
  )
}

function DocsTocMobile() {
  return (
    <details className="ds-docs-toc-mobile">
      <summary>on this page · {TOC_SECTIONS.length} sections</summary>
      <div className="ds-stack ds-stack-1">
        {TOC_SECTIONS.map((s) => (
          <a key={s.id} href={`#${s.id}`}>{s.label}</a>
        ))}
        <Link to="/app/design/recipes" style={{ color: 'var(--accent)' }}>→ Recipes</Link>
      </div>
    </details>
  )
}

// ─── Synthetic yield series for the YieldSparkline demos ──────────────────
// A 30-sample mean-reverting walk in [3.8, 6.2] — visually interesting but
// not noisy. Generated once at module load so re-renders stay deterministic.
const YIELD_SERIES_30D: number[] = (() => {
  const out: number[] = []
  let v = 5.0
  for (let i = 0; i < 30; i += 1) {
    // Deterministic pseudo-random in [-0.45, 0.55] biased toward mean reversion.
    const drift = Math.sin(i * 0.8) * 0.35 + Math.cos(i * 1.7) * 0.18
    const pull = (5.0 - v) * 0.18
    v = Math.max(3.6, Math.min(6.4, v + drift + pull))
    out.push(v / 100)
  }
  return out
})()

const YIELD_SERIES_DOWN: number[] = (() => {
  const out: number[] = []
  for (let i = 0; i < 24; i += 1) {
    const v = 6.4 - i * 0.07 + Math.sin(i * 1.3) * 0.12
    out.push(v / 100)
  }
  return out
})()

// ─── Synthetic time-series for the TimeSeriesChart demos ──────────────────
// 5-min buckets across ~30 days, anchored to "now" so the range selector
// (1D/1W/1M/ALL) finds samples in every bucket.
const TVL_SERIES_DEMO: { t: number; v: number }[] = (() => {
  const out: { t: number; v: number }[] = []
  const now = Date.now()
  const stepMs = 60 * 60 * 1000 // 1h granularity is plenty for a demo
  const samples = 24 * 30
  let v = 23_000_000
  for (let i = samples; i >= 0; i -= 1) {
    const drift = Math.sin(i * 0.18) * 120_000 + Math.cos(i * 0.07) * 80_000
    const trend = i * -2_500
    v = Math.max(18_000_000, v + drift + trend * 0.05)
    out.push({ t: now - i * stepMs, v })
  }
  return out
})()

const APY_7D_SERIES_DEMO: { t: number; v: number }[] = (() => {
  const out: { t: number; v: number }[] = []
  const now = Date.now()
  const stepMs = 6 * 60 * 60 * 1000
  for (let i = 28 * 4; i >= 0; i -= 1) {
    const v = 480 + Math.sin(i * 0.4) * 60 + Math.cos(i * 0.13) * 40
    out.push({ t: now - i * stepMs, v: Math.max(0, v) })
  }
  return out
})()

const APY_30D_SERIES_DEMO: { t: number; v: number }[] = (() => {
  const out: { t: number; v: number }[] = []
  const now = Date.now()
  const stepMs = 6 * 60 * 60 * 1000
  for (let i = 28 * 4; i >= 0; i -= 1) {
    const v = 510 + Math.sin(i * 0.18) * 30
    out.push({ t: now - i * stepMs, v: Math.max(0, v) })
  }
  return out
})()

// Free/encumbered split of one portfolio, for the stacked-mode demo. The two
// series are additive by construction — that is the only case `stacked` is for.
const LEDGER_FREE_DEMO: { t: number; v: number }[] = (() => {
  const out: { t: number; v: number }[] = []
  const now = Date.now()
  const stepMs = 6 * 60 * 60 * 1000
  for (let i = 28 * 4; i >= 0; i -= 1) {
    // Steps down as capital gets committed, back up as commitments release.
    const v = 42_000 + Math.sin(i * 0.09) * 16_000 - i * 60
    out.push({ t: now - i * stepMs, v: Math.max(2_000, v) })
  }
  return out
})()

const LEDGER_ENCUMBERED_DEMO: { t: number; v: number }[] = (() => {
  const out: { t: number; v: number }[] = []
  const now = Date.now()
  const stepMs = 6 * 60 * 60 * 1000
  for (let i = 28 * 4; i >= 0; i -= 1) {
    const v = 58_000 - Math.sin(i * 0.09) * 16_000 + i * 40
    out.push({ t: now - i * stepMs, v: Math.max(2_000, v) })
  }
  return out
})()

// ─── Inline JSX-source snippets shown next to each rendered example ───────
// Authored as inline strings per CONTEXT.md: explicit, no Vite plugin. Stays
// in sync only if the author keeps it so — acceptable for a docs page.
const SRC_COLOR =
  `<ColorSwatch name="bg" cssVar="--bg" note="page" theme={theme} />`

const SRC_DEFI_VAULTS =
  `<ApyMeter
  total={0.0512}
  sources={[
    { label: 'Aave supply',  apy: 0.0312, tone: 'info' },
    { label: 'Boost (veCRV)', apy: 0.0168, tone: 'success' },
    { label: 'Incentives',   apy: 0.0032, tone: 'neutral' },
  ]}
  delta={0.0034}
  period="30d"
/>

<HealthGauge
  value={1.84}
  min={1.0}
  max={3.0}
  zones={[
    { to: 1.10, tone: 'danger', label: 'liquidate' },
    { to: 1.40, tone: 'warn',   label: 'guardrail' },
    { to: 3.00, tone: 'success' },
  ]}
  target={2.0}
  label="health factor"
  caption="Below 1.10 the vault auto-deleverages; below 1.00 the position is liquidated."
/>

<CapacityMeter
  filled={parseUnits('23400000', 6)}
  cap={parseUnits('30000000', 6)}
  softCap={parseUnits('25000000', 6)}
  decimals={6}
  symbol="USDC"
/>

<YieldSparkline values={apy30d} showRange tone="accent" />

<StrategyFlow
  source={{ label: 'Vault deposits', sub: '23.4M USDC' }}
  allocations={[
    { label: 'Aave wstETH supply', bps: 6000, tone: 'info',    detail: '4.32% APY · single market' },
    { label: 'Compound USDC',      bps: 2500, tone: 'success', detail: '3.18% APY' },
    { label: 'Uniswap v3 LP',      bps: 1500, tone: 'warn',    detail: 'volatile · 50/50 ETH-USDC' },
  ]}
/>`

const SRC_VAULT_HEADER =
  `<VaultHeader
  icon={<TokenIcon symbol="USDC" size="xl" />}
  eyebrow="Delta-neutral · Base"
  title="USDC Carry Trade"
  subtitle="Aerodrome USDC-ETH LP, hedged with an Avantis perpetual short. keeper cron deleverages on health-factor breach."
  meta={<>
    <TokenChip symbol="USDC" />
    <span>Base · ChainID 8453</span>
    <AddressDisplay address="0x4f12…ae90" title="0x4f12cf…0aae90" />
  </>}
  badges={<>
    <span className="ds-badge ds-badge--success">audited · Hashlock</span>
    <span className="ds-badge ds-badge--muted">v2.1</span>
  </>}
  actions={<>
    <Button variant="primary">Deposit</Button>
    <Button variant="default">Withdraw</Button>
  </>}
  stats={[
    { label: 'TVL', value: '$23.4M', meta: '78% of cap' },
    { label: 'APY', value: '5.12%', meta: '+0.34pp / 30d', tone: 'success', emphasis: true },
    { label: 'Health', value: '1.84', meta: 'guardrail at 1.40', tone: 'success' },
    { label: 'Curator', value: '0xc1ab…42de' },
  ]}
  aside={<CapacityMeter
    filled={parseUnits('23400000', 6)}
    cap={parseUnits('30000000', 6)}
    softCap={parseUnits('25000000', 6)}
    decimals={6}
    symbol="USDC"
  />}
/>`

const SRC_TYPOGRAPHY =
  `<div style={{ fontSize: 'var(--text-2xl)' }}>Commitments Protocol</div>
<div style={{ fontSize: 'var(--text-base)' }}>Body text — workhorse</div>`

const SRC_SPACING =
  `<div style={{ height: 12, width: 'var(--space-4)', background: 'var(--accent)' }} />`

const SRC_STATS =
  `<div className="ds-stat">
  <span className="ds-stat-label">TVL</span>
  <span className="ds-stat-value">
    <TokenAmount amount={parseEther('1247.32')} decimals={18} symbol="ETH" compact />
  </span>
  <span className="ds-stat-delta ds-stat-delta--positive">↑ 4.2% / 7d</span>
</div>`

const SRC_ASSETS =
  `<TokenAmount amount={parseEther('12.4057')} decimals={18} symbol="ETH" />
<TokenAmount amount={parseEther('1247.328573')} decimals={18} symbol="ETH" size="display" />
<TokenAmount amount={parseEther('4221000')} decimals={18} symbol="USDC" compact />`

const SRC_BUTTONS =
  `<button className="ds-btn ds-btn--primary">Deposit</button>
<button className="ds-btn">Withdraw</button>
<button className="ds-btn ds-btn--ghost">Cancel</button>
<button className="ds-btn ds-btn--destructive">Forfeit</button>`

const SRC_INPUTS =
  `<div className="ds-field">
  <label className="ds-label" htmlFor="addr">Recipient</label>
  <input id="addr" className="ds-input" placeholder="0x…" />
  <span className="ds-field-helper">Ethereum address or ENS</span>
</div>`

const SRC_SURFACES =
  `<div className="ds-card">…</div>
<div className="ds-surface" style={{ padding: 'var(--space-4)' }}>…</div>
<div className="ds-surface-2" style={{ padding: 'var(--space-3)' }}>…</div>`

const SRC_CARD =
  `<Card>Standard panel — neutral surface with default padding.</Card>
<Card tone="info" selected>Selected card — accent border + focus ring.</Card>
<Card tone="warn">Warn-toned card — yellow border for attention.</Card>
<Card tone="danger" density="compact">Compact danger card — tight padding.</Card>
<Card as="a" href="/app/vaults/0xabc">Anchor card — hovers, focuses as a link.</Card>
<Card as="button" onClick={…}>Button card — full-width, native click semantics.</Card>`

const SRC_MEDIA_ROW =
  `<ul className="ds-stack ds-stack-0">
  <MediaRow
    as="li"
    leading={<span className="ds-glyph">↓</span>}
    title="Deposit confirmed"
    meta="2m ago · 0xabcd…1234"
    trailing={<TokenAmount amount={parseEther('1.5')} decimals={18} symbol="ETH" />}
  />
  <MediaRow
    as="li"
    tone="warn"
    leading={<span className="ds-glyph">!</span>}
    title="Forfeit window open"
    meta="closes in 3h · arbiter 0xdead…beef"
    trailing={<button className="ds-btn ds-btn--sm">Review</button>}
  />
  <MediaRow
    as="li"
    tone="danger"
    density="compact"
    leading={<span className="ds-glyph">✗</span>}
    title="Position forfeited"
    meta="block 21,401,228"
    trailing="−0.42 ETH"
  />
</ul>`

const SRC_MEDIA_ROW_ACTION =
  `<MediaRow
  as="li"
  tone="warn"
  leading={<span className="ds-glyph">!</span>}
  title="Forfeit proposed on commitment #28"
  meta={<span>with <AddressDisplay address={counterparty} /></span>}
  trailing={<span className="ds-text-xs ds-subtle">Review →</span>}
  action={{ label: 'Review commitment #28', onClick: () => open(28) }}
/>

// href instead of onClick renders the overlay as an anchor:
<MediaRow as="li" title="USDC Vault" action={{ label: 'Open USDC Vault', href: '/app/vaults/0xabc' }} />`

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

const SRC_BADGES =
  `<span className="ds-badge ds-badge--success">active</span>
<span className="ds-badge ds-badge--warn">forfeit-pending</span>
<span className="ds-badge ds-badge--error">forfeited</span>
<span className="ds-badge ds-badge--accent">proposed</span>
<span className="ds-badge ds-badge--solid">YOU</span>`

const SRC_AGENT_BADGE =
  `// One bulk lookup per page — never per row.
const agents = useAgentIdentities(addresses)
const a = agents.get(row.committer)
<OperatorIdentity
  address={row.committer}
  badge={a?.isAgent ? <AgentBadge agentId={a.agentId} /> : undefined}
/>`

const SRC_TX =
  `<div className="ds-tx-pending"><span className="ds-spinner" aria-hidden /> pending — broadcasting tx</div>
<div className="ds-tx-success"><span className="ds-glyph ds-glyph--ok">✓</span> success — block 2,143,927</div>`

const SRC_GLYPHS =
  `<span className="ds-glyph ds-glyph--ok">✓</span>
<span className="ds-glyph ds-glyph--warn">⚠</span>
<span className="ds-glyph ds-glyph--error">✗</span>
<span className="ds-glyph ds-glyph--accent">↗</span>`

const SRC_ADDRESS =
  `<AddressDisplay address="0x742d35Cc6634C0532925a3b844Bc454e4438f44e" />
<AddressDisplay address="0xab5801…aec9b" ens="vault.eth" explorerUrl="https://…" />`

const SRC_TABS =
  `<div role="tablist" className="ds-tabs">
  <button role="tab" aria-selected className="ds-tab">overview</button>
  <button role="tab" className="ds-tab">commitments</button>
  <button role="tab" className="ds-tab">mesh</button>
</div>`

const SRC_VIEW_TOGGLE =
  `// Controlled — page owns the state.
const [view, setView] = useState<'table' | 'graph'>('table')
<ViewToggle
  aria-label="commitments view"
  value={view}
  onChange={(v) => setView(v as 'table' | 'graph')}
  options={[
    { id: 'table', label: 'table' },
    { id: 'graph', label: 'graph' },
  ]}
/>

// Uncontrolled — first option wins by default.
<ViewToggle
  aria-label="density"
  size="sm"
  defaultValue="comfortable"
  options={[
    { id: 'comfortable', label: 'comfortable' },
    { id: 'compact',     label: 'compact' },
  ]}
/>`

const SRC_NAV =
  `<nav className="ds-sidenav" aria-label="Sections">
  <div className="ds-sidenav-section">protocol</div>
  <button className="ds-sidenav-link" aria-current="page">
    <span>Vault</span><span className="ds-sidenav-link-meta">1.25K</span>
  </button>
</nav>`

const SRC_OPERATORS =
  `<OperatorAvatar address={addr} name="Pellar Labs" size="md" />
<OperatorIdentity address={addr} name="Pellar Labs" size="sm" hideAddress />
<OperatorStatusBadge status="ACTIVE" />`

const SRC_COMMITMENTS =
  `<CommitmentStatusBadge status="FORFEIT_PENDING" />
<LifecycleStepper steps={commitmentLifecycle('FORFEIT_PENDING')} />
<Countdown label="challenge window" elapsed={3600 * 4} total={3600 * 24} tone="warn" />`

const SRC_COMMITMENT_NAMING =
  `// One call resolves the tier AND the security rule. Never read
// metadataContent.title directly at a render site.
const label = commitmentLabel(row, labelContext)   // hooks/useCommitmentLabelContext
<CommitmentTitle label={label} size="md" />

// Tags filter the list; chips stop propagation so they work inside a
// click-to-open row.
<CommitmentTags tags={metadataTags(row)} max={3} onSelect={toggleTag} active={tags} />

// Terms lead the detail page; provenance collapses below it.
<CommitmentTerms
  trust={metadataTrust(row)}
  description={metadataDescription(row)}
  termsURI={metadataTermsURI(row)}
  tags={metadataTags(row)}
/>
<Disclosure label="metadata provenance">
  <MetadataProvenance trust={trust} uri={uri} hash={hash} content={content} />
</Disclosure>`

const SRC_METADATA_EDITOR =
  `// Schema is a prop — same component serves both flows.
<MetadataEditor
  schema="commitment.v1"
  onChange={(v) => setMetadata(v) /* { metadataURI, metadataHash } | null */}
/>

// On pin: serialize fields -> POST /metadata/pin -> authoritative hash.
// Advanced disclosure preserves the raw URI + hash paste path.`

const SRC_LOADING =
  `<span className="ds-skeleton ds-skeleton--text" style={{ width: 180 }} />
<span className="ds-skeleton ds-skeleton--circle" style={{ width: 32, height: 32 }} />
<span className="ds-spinner ds-spinner--md" />`

const SRC_MOTION =
  `import { motion, useReducedMotion, useInView } from '../components/ui'

// 1. fade-in-on-scroll
const reduce = useReducedMotion()
const ref = useRef<HTMLDivElement>(null)
const inView = useInView(ref, { once: true, margin: '-15%' })
<motion.div
  ref={ref}
  initial={reduce ? false : { opacity: 0, y: 16 }}
  animate={inView ? { opacity: 1, y: 0 } : undefined}
  transition={{ duration: 0.55, ease: [0.2, 0.7, 0.2, 1] }}
/>

// 2. staggered list — parent variants drive child variants
<motion.ul variants={{ visible: { transition: { staggerChildren: 0.06 } } }}
           initial="hidden" animate="visible">
  {items.map(i => <motion.li key={i} variants={item} />)}
</motion.ul>

// 3. ambient loop
<motion.rect animate={{ opacity: [0.5, 1, 0.5] }}
             transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }} />`

const SRC_NOTIFICATIONS =
  `<Notice tone="warn" title="Approaching forfeit window" onDismiss={dismiss}>
  Challenge window closing in 14 minutes.
</Notice>
push({ tone: 'success', title: 'Stake released', message: '8.00 ETH returned.' })`

const SRC_EMPTY =
  `<div className="ds-empty">
  <span className="ds-empty-icon" aria-hidden>◌</span>
  <h3>No commitments yet</h3>
  <p className="ds-text-sm">When you create or accept an agreement, it will appear here.</p>
  <button className="ds-btn ds-btn--sm ds-btn--primary">Create commitment</button>
</div>`

const SRC_DISCLOSURE =
  `<Disclosure label="How is APY calculated?">
  <table className="ds-table">…breakdown rows…</table>
</Disclosure>

<Disclosure label="Risk parameters" defaultOpen>
  …always-visible-on-load detail…
</Disclosure>`

const SRC_TOOLTIP =
  `// Inline term hint — children is the trigger, content is the body.
<Tooltip tone="info" content="Custodied stake pledged to an active commitment.">
  encumbered
</Tooltip>

// Icon-only affordance (default ⓘ glyph) — pass triggerLabel for AT.
<Tooltip tone="info" triggerLabel="What is yield backing?" content="…" />

// Controlled — the page owns open via open + onOpenChange.
<Tooltip open={open} onOpenChange={setOpen} content="…">controlled hint</Tooltip>`

const SRC_OVERLAYS =
  `<Modal open={open} onClose={close} title="Confirm action" size="md">
  …confirmation body…
</Modal>

<Drawer open={open} onClose={close} side="right" size="md" title="Propose agreement">
  …multi-step flow body…
</Drawer>`

export default function Design() {
  const { theme } = useTheme()
  return (
    <div className="ds-root" style={{ minHeight: '100vh', padding: 'var(--space-8) var(--space-8) var(--space-16)' }}>
      <div style={{ maxWidth: 1280, margin: '0 auto' }} className="ds-stack ds-stack-8">

        {/* Header */}
        <header className="ds-stack ds-stack-4" style={{ maxWidth: 960 }}>
          <div className="ds-row" style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div className="ds-stack ds-stack-2">
              <div className="ds-label">commitments / design</div>
              <h1>Design System</h1>
              <p className="ds-muted ds-text-base" style={{ maxWidth: '60ch' }}>
                Tokens, primitives, and patterns for a modern-minimal monospace interface.
                Spare colors, generous whitespace, hard edges where they sharpen hierarchy.
              </p>
              <p className="ds-text-sm">
                <Link to="/app/design/recipes" style={{ color: 'var(--accent)' }}>→ See protocol recipes</Link>
                <span className="ds-subtle"> — protocol-shaped compositions of these primitives.</span>
              </p>
            </div>
            <ThemeToggle />
          </div>
          <hr className="ds-divider" />
          <div className="ds-row ds-row-4 ds-text-xs ds-muted" style={{ flexWrap: 'wrap' }}>
            <span>v0.1 · iterative</span>
            <span>·</span>
            <span>theme: <span style={{ color: 'var(--text)' }}>{theme}</span></span>
            <span>·</span>
            <span>font: Geist Mono</span>
            <span>·</span>
            <span>radius: square</span>
          </div>
        </header>

        {/* Mobile TOC accordion — hidden at >=1024px */}
        <DocsTocMobile />

        {/* Two-column shell: content + sticky TOC sidebar at >=1024px */}
        <div className="ds-docs-shell">
          <div className="ds-stack ds-stack-16" style={{ minWidth: 0 }}>

        {/* Color */}
        <section className="ds-stack ds-stack-6">
          <SectionHeading
            id="color"
            title="Color"
            lead="Grayscale carries the structure. A single accent calls action. Three muted semantic hues handle transaction state — never decoration."
          />
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 'var(--space-4)' }}>
            {COLOR_TOKENS.map((t) => (
              <ColorSwatch key={t.cssVar} name={t.name} cssVar={t.cssVar} note={t.note} theme={theme} />
            ))}
          </div>
          <SourceBlock label="example" source={SRC_COLOR} />
        </section>

        {/* Typography */}
        <section className="ds-stack ds-stack-6">
          <SectionHeading
            id="typography"
            title="Typography"
            lead="Geist Mono throughout. Tight tracking for headings, slight wide-tracking for uppercase labels. Tabular numerals on numeric data so columns align."
          />
          <div className="ds-stack ds-stack-6">
            {TYPE_SCALE.map((t) => (
              <div key={t.token} className="ds-row" style={{ alignItems: 'baseline', gap: 'var(--space-6)' }}>
                <div className="ds-label" style={{ minWidth: 64 }}>{t.token}</div>
                <div style={{ fontSize: `var(${t.cssVar})`, lineHeight: 'var(--leading-tight)' }}>{t.sample}</div>
              </div>
            ))}
            <div className="ds-row" style={{ alignItems: 'baseline', gap: 'var(--space-6)' }}>
              <div className="ds-label" style={{ minWidth: 64 }}>label</div>
              <div className="ds-label">UPPERCASE · TRACKED · LABEL</div>
            </div>
            <div className="ds-row" style={{ alignItems: 'baseline', gap: 'var(--space-6)' }}>
              <div className="ds-label" style={{ minWidth: 64 }}>numeric</div>
              <div className="ds-mono-num ds-text-lg">1,247.328573 / 0.0042 / 12.40</div>
            </div>
          </div>
          <SourceBlock label="example" source={SRC_TYPOGRAPHY} />
        </section>

        {/* Brand */}
        <section className="ds-stack ds-stack-6">
          <SectionHeading
            id="brand"
            title="Brand"
            lead="The mark paints entirely from currentColor — the palette has no brand hue to spend on a logo, so it is ink on paper and inherits the surrounding text colour. Renders whichever candidate is currently selected; pass mark to pin a specific one. Candidates and the live picker live on /app/lab."
          />
          <div className="ds-row ds-row-6" style={{ alignItems: 'flex-end', flexWrap: 'wrap' }}>
            <span className="ds-stack ds-stack-2" style={{ alignItems: 'center' }}>
              <BrandMark size="xs" />
              <span className="ds-text-xs ds-subtle">xs · 12</span>
            </span>
            <span className="ds-stack ds-stack-2" style={{ alignItems: 'center' }}>
              <BrandMark size="sm" />
              <span className="ds-text-xs ds-subtle">sm · 16</span>
            </span>
            <span className="ds-stack ds-stack-2" style={{ alignItems: 'center' }}>
              <BrandMark size="md" />
              <span className="ds-text-xs ds-subtle">md · 24</span>
            </span>
            <span className="ds-stack ds-stack-2" style={{ alignItems: 'center' }}>
              <BrandMark size="lg" />
              <span className="ds-text-xs ds-subtle">lg · 48</span>
            </span>
            <span className="ds-stack ds-stack-2" style={{ alignItems: 'center' }}>
              <BrandMark size="xl" />
              <span className="ds-text-xs ds-subtle">xl · 96</span>
            </span>
          </div>

          <div className="ds-stack ds-stack-3">
            <div className="ds-label">candidates</div>
            <div className="ds-row ds-row-6" style={{ alignItems: 'flex-end', flexWrap: 'wrap' }}>
              {MARKS.map((m) => (
                <span key={m.id} className="ds-stack ds-stack-2" style={{ alignItems: 'center' }}>
                  <BrandMark size="lg" mark={m.id} />
                  <span className="ds-text-xs ds-subtle">{m.id}</span>
                </span>
              ))}
            </div>
          </div>
        </section>

        {/* Social links */}
        <section className="ds-stack ds-stack-6">
          <SectionHeading
            id="social-link"
            title="Social Link"
            lead="Icon-only link/button into an external surface. Square footprint scales with size; the glyph fills from currentColor so it themes automatically. Defaults to an anchor; pass as=button for in-app actions. Always set label (becomes aria-label + title). Use the bundled GitHubMark / XMark glyphs or any currentColor icon."
          />
          <div className="ds-row ds-row-6" style={{ alignItems: 'flex-end', flexWrap: 'wrap' }}>
            <span className="ds-stack ds-stack-2" style={{ alignItems: 'center' }}>
              <SocialLink
                href="https://github.com/AInima-Collective/commitments"
                label="GitHub"
                target="_blank"
                rel="noreferrer noopener"
                icon={<GitHubMark />}
              />
              <span className="ds-text-xs ds-subtle">github · sm</span>
            </span>
            <span className="ds-stack ds-stack-2" style={{ alignItems: 'center' }}>
              <SocialLink
                href="https://x.com/jakehartnell"
                label="X (Twitter)"
                target="_blank"
                rel="noreferrer noopener"
                icon={<XMark />}
              />
              <span className="ds-text-xs ds-subtle">x · sm</span>
            </span>
            <span className="ds-stack ds-stack-2" style={{ alignItems: 'center' }}>
              <SocialLink href="https://x.com/jakehartnell" label="X · md" size="md" target="_blank" rel="noreferrer noopener" icon={<XMark />} />
              <span className="ds-text-xs ds-subtle">md</span>
            </span>
            <span className="ds-stack ds-stack-2" style={{ alignItems: 'center' }}>
              <SocialLink href="https://x.com/jakehartnell" label="X · lg" size="lg" target="_blank" rel="noreferrer noopener" icon={<XMark />} />
              <span className="ds-text-xs ds-subtle">lg</span>
            </span>
          </div>
        </section>

        {/* Spacing */}
        <section className="ds-stack ds-stack-6">
          <SectionHeading
            id="spacing"
            title="Spacing"
            lead="Four-pixel base. Eight is the default rhythm; four is for tight clusters; sixteen and up open the grid."
          />
          <div className="ds-stack ds-stack-2">
            {SPACE_SCALE.map((s) => (
              <div key={s.token} className="ds-row" style={{ gap: 'var(--space-4)' }}>
                <div className="ds-label" style={{ minWidth: 48 }}>{s.token}</div>
                <div style={{ height: 12, width: s.px, background: 'var(--accent)' }} />
                <div className="ds-text-xs ds-subtle ds-mono-num">{s.px}px</div>
              </div>
            ))}
          </div>
          <SourceBlock label="example" source={SRC_SPACING} />
          <div className="ds-stack ds-stack-3">
            <div className="ds-label">grid utilities</div>
            <div className="ds-text-sm ds-subtle" style={{ maxWidth: '70ch' }}>
              <code>.ds-grid-2 / -3 / -4</code> are fixed N-column grids;
              <code> .ds-grid-auto-fit</code> is the responsive
              <code> repeat(auto-fit, minmax(300px, 1fr))</code> pattern that
              survives a 360px viewport without horizontal scroll. Use it for
              card-spread sections (curator + strategy, TVL + APY chart pair).
            </div>
            <div className="ds-grid-auto-fit">
              <div className="ds-card">
                <div className="ds-label">card a</div>
                <div className="ds-text-sm ds-muted">.ds-grid-auto-fit child</div>
              </div>
              <div className="ds-card">
                <div className="ds-label">card b</div>
                <div className="ds-text-sm ds-muted">300px min, 1fr max</div>
              </div>
              <div className="ds-card">
                <div className="ds-label">card c</div>
                <div className="ds-text-sm ds-muted">--space-4 gap</div>
              </div>
            </div>
          </div>
        </section>

        {/* Stats */}
        <section className="ds-stack ds-stack-6">
          <SectionHeading
            id="stats"
            title="Stat Blocks"
            lead="Numbers on monospace, label uppercase-tracked, optional meta line below for delta or qualifier."
          />
          <StatsRow />
          <SourceBlock label="example" source={SRC_STATS} />
        </section>

        {/* Assets */}
        <section className="ds-stack ds-stack-8">
          <SectionHeading
            id="assets"
            title="Assets"
            lead="The canonical vocabulary for tokens, vault shares, balances, and yield. Hover any amount to see full precision in the tooltip — even when truncated or compacted."
          />

          {/* Token icon */}
          <div className="ds-stack ds-stack-3">
            <div className="ds-label">token icon · sizes</div>
            <div className="ds-row ds-row-4" style={{ alignItems: 'center', flexWrap: 'wrap' }}>
              <span className="ds-row ds-row-2"><TokenIcon symbol="ETH" size="sm" /><span className="ds-text-xs ds-subtle">sm · 14</span></span>
              <span className="ds-row ds-row-2"><TokenIcon symbol="ETH" size="md" /><span className="ds-text-xs ds-subtle">md · 20</span></span>
              <span className="ds-row ds-row-2"><TokenIcon symbol="ETH" size="lg" /><span className="ds-text-xs ds-subtle">lg · 32</span></span>
              <span className="ds-row ds-row-2"><TokenIcon symbol="ETH" size="xl" /><span className="ds-text-xs ds-subtle">xl · 48</span></span>
            </div>
            <div className="ds-stack ds-stack-2">
              <div className="ds-label">token icon · resolution</div>
              <div className="ds-row ds-row-4" style={{ alignItems: 'center', flexWrap: 'wrap' }}>
                <span className="ds-row ds-row-2"><TokenIcon symbol="ETH"  size="md" /><span className="ds-text-sm">ETH</span><span className="ds-text-xs ds-subtle">bundled</span></span>
                <span className="ds-row ds-row-2"><TokenIcon symbol="USDC" size="md" /><span className="ds-text-sm">USDC</span><span className="ds-text-xs ds-subtle">bundled</span></span>
                <span className="ds-row ds-row-2"><TokenIcon symbol="cETH" size="md" /><span className="ds-text-sm">cETH</span><span className="ds-text-xs ds-subtle">bundled</span></span>
                <span className="ds-row ds-row-2"><TokenIcon symbol="DAI"  size="md" /><span className="ds-text-sm">DAI</span><span className="ds-text-xs ds-subtle">monogram fallback</span></span>
                <span className="ds-row ds-row-2"><TokenIcon symbol="rETH" size="md" /><span className="ds-text-sm">rETH</span><span className="ds-text-xs ds-subtle">monogram fallback</span></span>
                <span className="ds-row ds-row-2">
                  <TokenIcon symbol="WBTC" src="https://cryptologos.cc/logos/wrapped-bitcoin-wbtc-logo.png" size="md" />
                  <span className="ds-text-sm">WBTC</span>
                  <span className="ds-text-xs ds-subtle">via src= URL</span>
                </span>
              </div>
            </div>
          </div>

          {/* Token chip */}
          <div className="ds-stack ds-stack-3">
            <div className="ds-label">token chip</div>
            <div className="ds-row ds-row-2" style={{ flexWrap: 'wrap' }}>
              <TokenChip symbol="ETH" />
              <TokenChip symbol="WETH" />
              <TokenChip symbol="cETH" />
              <TokenChip symbol="USDC" />
              <TokenChip symbol="DAI" />
              <TokenChip symbol="rETH" />
            </div>
          </div>

          {/* Chain badge — chain identity in headers / meta rows */}
          <div className="ds-stack ds-stack-3">
            <div className="ds-label">chain badge · sizes</div>
            <div className="ds-row ds-row-4" style={{ alignItems: 'center', flexWrap: 'wrap' }}>
              <ChainBadge chainId={1} size="sm" />
              <ChainBadge chainId={1} size="md" />
              <ChainBadge chainId={1} size="lg" />
            </div>
            <div className="ds-stack ds-stack-2">
              <div className="ds-label">chain badge · resolution</div>
              <div className="ds-row ds-row-4" style={{ alignItems: 'center', flexWrap: 'wrap' }}>
                <ChainBadge chainId={1} />
                <ChainBadge chainId={11155111} />
                <ChainBadge chainId={31337} />
                <ChainBadge chainId={999999} />
                <ChainBadge chainId={1} iconOnly />
              </div>
            </div>
          </div>

          {/* Section nav — scroll-spy nav for long pages */}
          <div className="ds-stack ds-stack-3">
            <div className="ds-label">section nav · scroll-spy</div>
            <div className="ds-stack ds-stack-2 ds-text-sm">
              <div className="ds-subtle">
                Tab-styled anchor list. Click to smooth-scroll to <code>#id</code>;
                IntersectionObserver tracks the in-view section. Use for long pages
                with multiple stacked sections (dashboard, vault detail).
              </div>
              <SectionNav
                sticky={false}
                items={[
                  { id: 'sn-demo-1', label: 'overview' },
                  { id: 'sn-demo-2', label: 'positions', count: 3 },
                  { id: 'sn-demo-3', label: 'history' },
                  { id: 'sn-demo-4', label: 'settings' },
                ]}
              />
            </div>
          </div>

          {/* Asset row — canonical icon + amount pattern for balance lists & tables */}
          <div className="ds-stack ds-stack-3">
            <div className="ds-label">asset row · balance list</div>
            <div className="ds-surface" style={{ padding: 0 }}>
              <div className="ds-stack" style={{ padding: 'var(--space-2) 0' }}>
                {[
                  { symbol: 'ETH',  amount: parseEther('12.4057'),     bps: 0 },
                  { symbol: 'cETH', amount: parseEther('1247.3286'),   bps: 1000 },
                  { symbol: 'USDC', amount: parseEther('4221000'),     bps: 0,  decimals: 18 },
                  { symbol: 'DAI',  amount: parseEther('850.42'),      bps: 0 },
                ].map((row) => (
                  <div
                    key={row.symbol}
                    className="ds-row"
                    style={{ padding: 'var(--space-2) var(--space-4)', justifyContent: 'space-between', gap: 'var(--space-4)' }}
                  >
                    <span className="ds-row ds-row-3">
                      <TokenIcon symbol={row.symbol} size="md" />
                      <span className="ds-stack ds-stack-1">
                        <span className="ds-text-sm">{row.symbol}</span>
                        {row.bps > 0 && <span className="ds-text-xs ds-subtle">yield share {formatPercent(row.bps)}</span>}
                      </span>
                    </span>
                    <TokenAmount
                      amount={row.amount}
                      decimals={row.decimals ?? 18}
                      symbol={row.symbol}
                      compact
                    />
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Amount sizes */}
          <div className="ds-stack ds-stack-3">
            <div className="ds-label">amount · sizes</div>
            <div className="ds-stack ds-stack-3">
              <div className="ds-row" style={{ alignItems: 'baseline', gap: 'var(--space-6)' }}>
                <div className="ds-label" style={{ minWidth: 64 }}>inline</div>
                <span className="ds-text-sm">
                  Position: <TokenAmount amount={parseEther('12.4057')} decimals={18} symbol="ETH" size="inline" />
                  &nbsp;·&nbsp;Free: <TokenAmount amount={parseEther('8.2')} decimals={18} symbol="ETH" size="inline" />
                </span>
              </div>
              <div className="ds-row" style={{ alignItems: 'baseline', gap: 'var(--space-6)' }}>
                <div className="ds-label" style={{ minWidth: 64 }}>default</div>
                <TokenAmount amount={parseEther('12.4057')} decimals={18} symbol="ETH" />
              </div>
              <div className="ds-row" style={{ alignItems: 'baseline', gap: 'var(--space-6)' }}>
                <div className="ds-label" style={{ minWidth: 64 }}>display</div>
                <TokenAmount amount={parseEther('1247.328573')} decimals={18} symbol="ETH" size="display" />
              </div>
            </div>
          </div>

          {/* Compact */}
          <div className="ds-stack ds-stack-3">
            <div className="ds-label">amount · compact (k/m/b)</div>
            <div className="ds-stack ds-stack-2 ds-text-sm">
              <div className="ds-row" style={{ gap: 'var(--space-6)' }}>
                <div className="ds-label" style={{ minWidth: 80 }}>1.25K</div>
                <TokenAmount amount={parseEther('1247.328573')} decimals={18} symbol="ETH" compact />
                <span className="ds-subtle">— hover for full precision</span>
              </div>
              <div className="ds-row" style={{ gap: 'var(--space-6)' }}>
                <div className="ds-label" style={{ minWidth: 80 }}>4.22M</div>
                <TokenAmount amount={parseEther('4221000')} decimals={18} symbol="USDC" compact />
              </div>
              <div className="ds-row" style={{ gap: 'var(--space-6)' }}>
                <div className="ds-label" style={{ minWidth: 80 }}>fallback</div>
                <TokenAmount amount={parseEther('12.4057')} decimals={18} symbol="ETH" compact />
                <span className="ds-subtle">— under 10K threshold, renders full</span>
              </div>
            </div>
          </div>

          {/* Precision & truncation */}
          <div className="ds-stack ds-stack-3">
            <div className="ds-label">precision · trailing decimals</div>
            <div className="ds-stack ds-stack-2 ds-text-sm">
              <div className="ds-row" style={{ gap: 'var(--space-6)' }}>
                <div className="ds-label" style={{ minWidth: 80 }}>default</div>
                <TokenAmount amount={parseEther('1.328573291847562')} decimals={18} symbol="ETH" />
                <span className="ds-subtle">— precision=4, trailing zeros stripped</span>
              </div>
              <div className="ds-row" style={{ gap: 'var(--space-6)' }}>
                <div className="ds-label" style={{ minWidth: 80 }}>display</div>
                <TokenAmount amount={parseEther('1.328573291847562')} decimals={18} symbol="ETH" size="display" />
                <span className="ds-subtle">— fraction dimmed</span>
              </div>
              <div className="ds-row" style={{ gap: 'var(--space-6)' }}>
                <div className="ds-label" style={{ minWidth: 80 }}>round</div>
                <TokenAmount amount={parseEther('1.0')} decimals={18} symbol="ETH" />
                <span className="ds-subtle">— no fraction emitted for whole values</span>
              </div>
            </div>
          </div>

          {/* USD amount — primitive parallel to TokenAmount, used by the
              dashboard hero, claim modals, and any USD-denominated stat. */}
          <div className="ds-stack ds-stack-3">
            <div className="ds-label">usd · UsdAmount primitive</div>
            <div className="ds-stack ds-stack-2 ds-text-sm">
              <div className="ds-row" style={{ gap: 'var(--space-6)' }}>
                <div className="ds-label" style={{ minWidth: 64 }}>inline</div>
                <UsdAmount amount={1234_560000n} size="inline" />
                <span className="ds-subtle">— stat tile / row trailing</span>
              </div>
              <div className="ds-row" style={{ gap: 'var(--space-6)' }}>
                <div className="ds-label" style={{ minWidth: 64 }}>default</div>
                <UsdAmount amount={48531_420000n} />
              </div>
              <div className="ds-row" style={{ gap: 'var(--space-6)' }}>
                <div className="ds-label" style={{ minWidth: 64 }}>display</div>
                <UsdAmount amount={48531_420000n} size="display" />
                <span className="ds-subtle">— hero headline</span>
              </div>
              <div className="ds-row" style={{ gap: 'var(--space-6)' }}>
                <div className="ds-label" style={{ minWidth: 64 }}>compact</div>
                <UsdAmount amount={4_221_000_000_000n} compact />
                <span className="ds-subtle">— hover for full precision</span>
              </div>
              <div className="ds-row" style={{ gap: 'var(--space-6)' }}>
                <div className="ds-label" style={{ minWidth: 64 }}>missing</div>
                <UsdAmount amount={null} />
                <span className="ds-subtle">— price unavailable</span>
              </div>
            </div>
          </div>

          {/* BPS / percentage */}
          <div className="ds-stack ds-stack-3">
            <div className="ds-label">bps · percentage</div>
            <div className="ds-stack ds-stack-2 ds-text-sm">
              <div className="ds-row" style={{ gap: 'var(--space-6)' }}>
                <div className="ds-label" style={{ minWidth: 96 }}>maxPenaltyBps</div>
                <span className="ds-mono-num">{formatPercent(2500)}</span>
                <span className="ds-subtle">· 2500</span>
              </div>
              <div className="ds-row" style={{ gap: 'var(--space-6)' }}>
                <div className="ds-label" style={{ minWidth: 96 }}>yieldShareBps</div>
                <span className="ds-mono-num">{formatPercent(1000)}</span>
                <span className="ds-subtle">· 1000</span>
              </div>
              <div className="ds-row" style={{ gap: 'var(--space-6)' }}>
                <div className="ds-label" style={{ minWidth: 96 }}>full forfeit</div>
                <span className="ds-mono-num">{formatPercent(10000)}</span>
                <span className="ds-subtle">· 10000</span>
              </div>
            </div>
          </div>

          {/* Risk dot */}
          <div className="ds-stack ds-stack-3">
            <div className="ds-label">penalty · risk threshold</div>
            <div className="ds-stack ds-stack-2">
              <RiskRow bps={2500} label="maxPenaltyBps" />
              <RiskRow bps={5000} label="maxPenaltyBps" />
              <RiskRow bps={10000} label="maxPenaltyBps" />
            </div>
          </div>

          {/* Balance line */}
          <div className="ds-stack ds-stack-3">
            <div className="ds-label">balance line</div>
            <div className="ds-stack ds-stack-2">
              <BalanceLine
                amount={parseEther('12.4057')}
                decimals={18}
                symbol="ETH"
                label="Balance"
                onMax={() => undefined}
              />
              <BalanceLine
                amount={parseEther('0')}
                decimals={18}
                symbol="ETH"
                label="Available"
                onMax={() => undefined}
                maxDisabled
              />
            </div>
          </div>

          {/* Share / asset ratio */}
          <div className="ds-stack ds-stack-3">
            <div className="ds-label">share · asset ratio</div>
            <div className="ds-stack ds-stack-2 ds-text-sm">
              <ShareRatio
                shares={parseEther('1')}
                assets={parseEther('1.023456')}
                shareSymbol="cETH"
                assetSymbol="ETH"
                decimals={18}
              />
              <ShareRatio
                shares={parseEther('100')}
                assets={parseEther('102.3456')}
                shareSymbol="cETH"
                assetSymbol="ETH"
                decimals={18}
              />
              <span className="ds-subtle ds-text-xs">erc-4626 conversion · share supply × pricePerShare</span>
            </div>
          </div>

          {/* Allocation bar */}
          <div className="ds-stack ds-stack-3">
            <div className="ds-label">allocation bar · vault encumbrance</div>
            <AllocationBar
              total={parseEther('100')}
              decimals={18}
              symbol="ETH"
              segments={[
                { label: 'encumbered', value: parseEther('62.5'), tone: 'warn' },
                { label: 'free', value: parseEther('37.5'), tone: 'success' },
              ]}
            />
          </div>

          {/* Settlement bar — v2.5 bilateral agreement flow */}
          <div className="ds-stack ds-stack-3">
            <div className="ds-label">settlement bar · agreement bilateral flow (v2.5)</div>
            <SettlementBar
              decimals={18}
              symbol="ETH"
              tone="info"
              directions={[
                { label: 'proposer → acceptor', cap: parseEther('100'), cumulative: parseEther('40') },
                { label: 'acceptor → proposer', cap: parseEther('80'), cumulative: parseEther('5') },
              ]}
            />
            <span className="ds-subtle ds-text-xs">
              cumulative-vs-cap per direction · disabled track shown when cap == 0
            </span>
            <SettlementBar
              decimals={18}
              symbol="ETH"
              tone="info"
              directions={[
                { label: 'junior → senior (coupon)', cap: parseEther('50'), cumulative: parseEther('30') },
                { label: 'senior → junior', cap: 0n, cumulative: 0n },
              ]}
            />
          </div>

          {/* Stat tones */}
          <div className="ds-stack ds-stack-3">
            <div className="ds-label">stat · tone variants</div>
            <div className="ds-grid-4">
              <div className="ds-stat ds-stat--positive">
                <span className="ds-stat-label">Yield (7d)</span>
                <span className="ds-stat-value">
                  <TokenAmount amount={parseEther('0.4232')} decimals={18} symbol="ETH" />
                </span>
                <span className="ds-stat-delta ds-stat-delta--positive">↑ 4.21% APY</span>
              </div>
              <div className="ds-stat ds-stat--negative">
                <span className="ds-stat-label">Forfeited</span>
                <span className="ds-stat-value">
                  <TokenAmount amount={parseEther('1.85')} decimals={18} symbol="ETH" />
                </span>
                <span className="ds-stat-delta ds-stat-delta--negative">↓ 0.92 / 24h</span>
              </div>
              <div className="ds-stat ds-stat--accent">
                <span className="ds-stat-label">Pending Reward</span>
                <span className="ds-stat-value">
                  <TokenAmount amount={parseEther('0.0421')} decimals={18} symbol="ETH" />
                </span>
                <span className="ds-stat-meta ds-muted">claim available</span>
              </div>
              <div className="ds-stat">
                <span className="ds-stat-label">Encumbered</span>
                <span className="ds-stat-value">
                  <TokenAmount amount={parseEther('62.5')} decimals={18} symbol="ETH" compact />
                </span>
                <span className="ds-stat-meta ds-muted">62.5% of vault</span>
              </div>
            </div>
          </div>

          {/* Token pair */}
          <div className="ds-stack ds-stack-3">
            <div className="ds-label">token pair · proposer / acceptor</div>
            <div className="ds-surface" style={{ padding: 'var(--space-4)' }}>
              <div className="ds-row" style={{ gap: 'var(--space-6)', alignItems: 'stretch' }}>
                <div className="ds-stack ds-stack-2" style={{ flex: 1 }}>
                  <span className="ds-label">proposer commits</span>
                  <TokenAmount amount={parseEther('5')} decimals={18} symbol="ETH" size="display" withIcon />
                  <span className="ds-text-xs ds-subtle">max penalty {formatPercent(5000)}</span>
                </div>
                <div className="ds-row" style={{ alignItems: 'center' }}>
                  <span className="ds-glyph ds-glyph--muted" style={{ fontSize: 'var(--text-xl)' }}>↔</span>
                </div>
                <div className="ds-stack ds-stack-2" style={{ flex: 1, alignItems: 'flex-end' }}>
                  <span className="ds-label">acceptor commits</span>
                  <TokenAmount amount={parseEther('2500')} decimals={18} symbol="USDC" size="display" withIcon />
                  <span className="ds-text-xs ds-subtle">max penalty {formatPercent(2500)}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Empty / loading */}
          <div className="ds-stack ds-stack-3">
            <div className="ds-label">empty · loading</div>
            <div className="ds-stack ds-stack-2 ds-text-sm">
              <div className="ds-row" style={{ gap: 'var(--space-6)' }}>
                <div className="ds-label" style={{ minWidth: 80 }}>zero</div>
                <TokenAmount amount={0n} decimals={18} symbol="ETH" />
                <span className="ds-subtle">— dimmed em-dash, never `0.0000 ETH`</span>
              </div>
              <div className="ds-row" style={{ gap: 'var(--space-6)' }}>
                <div className="ds-label" style={{ minWidth: 80 }}>loading</div>
                <span className="ds-skeleton" style={{ width: 96, height: 16 }}>&nbsp;</span>
                <span className="ds-subtle">— reserves width while async reads settle</span>
              </div>
            </div>
          </div>
          <SourceBlock label="example" source={SRC_ASSETS} />
        </section>

        {/* DeFi Vaults */}
        <section className="ds-stack ds-stack-8">
          <SectionHeading
            id="defi-vaults"
            title="DeFi Vaults"
            lead="Five primitives for the surfaces every vault page reaches for: a yield read-out, a safety gauge, a capacity meter, a sparkline, and a routing diagram. None of them know what a commitment is — they're shaped for any DeFi vault. Compose them in feature folders; reach for them through the barrel."
          />

          {/* APY Meter */}
          <div className="ds-stack ds-stack-3">
            <div className="ds-label">apy meter · headline yield with source decomposition</div>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
                gap: 'var(--space-4)',
              }}
            >
              <ApyMeter
                size="lg"
                total={0.0512}
                sources={[
                  { label: 'Aave supply', apy: 0.0312, tone: 'info', detail: 'wstETH market' },
                  { label: 'Boost · veCRV', apy: 0.0168, tone: 'success' },
                  { label: 'Incentives', apy: 0.0032, tone: 'neutral' },
                ]}
                delta={0.0034}
                period="30d"
                caption="Net of 2% management fee · before performance fee on profit."
              />
              <ApyMeter
                size="md"
                total={0.0289}
                sources={[
                  { label: 'Aerodrome LP fees', apy: 0.0214, tone: 'info' },
                  { label: 'AERO emissions', apy: 0.0075, tone: 'neutral' },
                ]}
                delta={-0.0048}
                period="30d"
              />
            </div>
            <div className="ds-text-xs ds-subtle">
              The headline carries six-decimal precision in <code>title</code>; the bar paints
              source contributions proportional to their share of total APY. Delta tag is optional
              and tone-driven by sign.
            </div>
          </div>

          {/* Health Gauge */}
          <div className="ds-stack ds-stack-3">
            <div className="ds-label">health gauge · threshold-zone safety read-out</div>
            <div
              className="ds-card ds-stack ds-stack-4"
              style={{ padding: 'var(--space-6)' }}
            >
              <HealthGauge
                size="lg"
                value={1.84}
                min={1.0}
                max={3.0}
                zones={[
                  { to: 1.1, tone: 'danger', label: 'liquidate' },
                  { to: 1.4, tone: 'warn', label: 'guardrail' },
                  { to: 3.0, tone: 'success' },
                ]}
                target={2.0}
                label="health factor"
                caption="Below 1.10 the vault auto-deleverages via keeper cron; below 1.00 the position is liquidated by Aave."
              />
            </div>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
                gap: 'var(--space-4)',
              }}
            >
              <div className="ds-card ds-stack ds-stack-3">
                <HealthGauge
                  size="md"
                  value={0.62}
                  min={0}
                  max={1}
                  zones={[
                    { to: 0.5, tone: 'success' },
                    { to: 0.8, tone: 'warn', label: 'cap' },
                    { to: 1.0, tone: 'danger' },
                  ]}
                  format={(n) => `${(n * 100).toFixed(1)}%`}
                  label="ltv"
                />
                <span className="ds-text-xs ds-subtle">
                  In the warning band — adding leverage soon trips the cap.
                </span>
              </div>
              <div className="ds-card ds-stack ds-stack-3">
                <HealthGauge
                  size="md"
                  value={1.04}
                  min={1.0}
                  max={3.0}
                  zones={[
                    { to: 1.1, tone: 'danger', label: 'liquidate' },
                    { to: 1.4, tone: 'warn' },
                    { to: 3.0, tone: 'success' },
                  ]}
                  label="health factor"
                />
                <span className="ds-text-xs ds-subtle">
                  Critical zone — indicator paints in <code>--error</code> automatically.
                </span>
              </div>
              <div className="ds-card ds-stack ds-stack-3">
                <HealthGauge
                  size="md"
                  value={2.6}
                  min={1.0}
                  max={3.0}
                  zones={[
                    { to: 1.1, tone: 'danger' },
                    { to: 1.4, tone: 'warn' },
                    { to: 3.0, tone: 'success' },
                  ]}
                  label="health factor"
                />
                <span className="ds-text-xs ds-subtle">
                  Comfortable — but capital-inefficient. Dial up borrow.
                </span>
              </div>
            </div>
          </div>

          {/* Capacity Meter */}
          <div className="ds-stack ds-stack-3">
            <div className="ds-label">capacity meter · stepped utilization with soft-cap tick</div>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
                gap: 'var(--space-4)',
              }}
            >
              <div className="ds-card ds-stack ds-stack-3">
                <CapacityMeter
                  filled={parseUnits('23400000', 6)}
                  cap={parseUnits('30000000', 6)}
                  softCap={parseUnits('25000000', 6)}
                  decimals={6}
                  symbol="USDC"
                />
                <span className="ds-text-xs ds-subtle">
                  78% — auto-tone says <code>warn</code>. Soft cap at 83% paints a hairline tick.
                </span>
              </div>
              <div className="ds-card ds-stack ds-stack-3">
                <CapacityMeter
                  filled={parseUnits('29200000', 6)}
                  cap={parseUnits('30000000', 6)}
                  softCap={parseUnits('25000000', 6)}
                  decimals={6}
                  symbol="USDC"
                />
                <span className="ds-text-xs ds-subtle">
                  97% — auto-tone shifts to <code>danger</code>. Free tier dwindles.
                </span>
              </div>
              <div className="ds-card ds-stack ds-stack-3">
                <CapacityMeter
                  filled={parseEther('142.6')}
                  cap={parseEther('500')}
                  decimals={18}
                  symbol="WETH"
                  label="deposits"
                  size="lg"
                />
                <span className="ds-text-xs ds-subtle">
                  Large variant fills more visual surface; same data shape.
                </span>
              </div>
            </div>
          </div>

          {/* Yield Sparkline */}
          <div className="ds-stack ds-stack-3">
            <div className="ds-label">yield sparkline · inline time-series</div>
            <div className="ds-card ds-stack ds-stack-4">
              <div className="ds-row" style={{ flexWrap: 'wrap', gap: 'var(--space-6)', alignItems: 'center' }}>
                <span className="ds-row" style={{ gap: 'var(--space-2)', alignItems: 'center' }}>
                  <span className="ds-label" style={{ minWidth: 36 }}>sm</span>
                  <YieldSparkline size="sm" values={YIELD_SERIES_30D} />
                </span>
                <span className="ds-row" style={{ gap: 'var(--space-2)', alignItems: 'center' }}>
                  <span className="ds-label" style={{ minWidth: 36 }}>md</span>
                  <YieldSparkline values={YIELD_SERIES_30D} />
                </span>
                <span className="ds-row" style={{ gap: 'var(--space-2)', alignItems: 'center' }}>
                  <span className="ds-label" style={{ minWidth: 36 }}>lg</span>
                  <YieldSparkline
                    size="lg"
                    values={YIELD_SERIES_30D}
                    showRange
                    showArea
                    format={(n) => `${(n * 100).toFixed(2)}%`}
                  />
                </span>
              </div>
              <hr className="ds-divider" />
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
                  gap: 'var(--space-4)',
                }}
              >
                <div className="ds-stack ds-stack-2">
                  <span className="ds-label">trending up · accent</span>
                  <span className="ds-row ds-row-3" style={{ alignItems: 'center' }}>
                    <span className="ds-mono-num ds-text-lg">5.12%</span>
                    <YieldSparkline values={YIELD_SERIES_30D} tone="accent" />
                    <span className="ds-text-xs ds-subtle">30d</span>
                  </span>
                </div>
                <div className="ds-stack ds-stack-2">
                  <span className="ds-label">trending down · danger</span>
                  <span className="ds-row ds-row-3" style={{ alignItems: 'center' }}>
                    <span className="ds-mono-num ds-text-lg">2.89%</span>
                    <YieldSparkline values={YIELD_SERIES_DOWN} tone="danger" />
                    <span className="ds-text-xs ds-subtle">24d</span>
                  </span>
                </div>
                <div className="ds-stack ds-stack-2">
                  <span className="ds-label">filled · success</span>
                  <YieldSparkline
                    values={YIELD_SERIES_30D}
                    tone="success"
                    showArea
                    showRange
                    format={(n) => `${(n * 100).toFixed(2)}%`}
                  />
                </div>
                <div className="ds-stack ds-stack-2">
                  <span className="ds-label">empty · single point</span>
                  <YieldSparkline values={[0.05]} />
                </div>
              </div>
            </div>
            <div className="ds-text-xs ds-subtle">
              Pure SVG · no chart library · no JS animation. Endpoint dot anchors attention on the
              latest sample.
            </div>
          </div>

          {/* Time-Series Chart */}
          <div className="ds-stack ds-stack-3">
            <div className="ds-label">time-series chart · full-axis line chart</div>
            <div className="ds-card ds-stack ds-stack-4">
              <TimeSeriesChart
                series={[
                  { label: 'TVL', data: TVL_SERIES_DEMO, tone: 'accent' },
                ]}
                tUnit="ms"
                unit="USDC"
                ariaLabel="Sample TVL over the last month"
              />
              <hr className="ds-divider" />
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
                  gap: 'var(--space-4)',
                }}
              >
                <div className="ds-stack ds-stack-2">
                  <span className="ds-label">two-series · success vs muted</span>
                  <TimeSeriesChart
                    size="sm"
                    hideRangeSelector
                    series={[
                      { label: 'APY 7d', data: APY_7D_SERIES_DEMO, tone: 'success' },
                      { label: 'APY 30d', data: APY_30D_SERIES_DEMO, tone: 'muted' },
                    ]}
                    tUnit="ms"
                    unit="bps"
                  />
                </div>
                <div className="ds-stack ds-stack-2">
                  <span className="ds-label">empty state · ALL with no points in range</span>
                  <TimeSeriesChart
                    size="sm"
                    hideRangeSelector
                    series={[{ label: 'TVL', data: [], tone: 'accent' }]}
                    unit="USDC"
                  />
                </div>
              </div>
              <hr className="ds-divider" />
              <div className="ds-stack ds-stack-2">
                <span className="ds-label">
                  stacked · additive bands, tooltip gains a total footer
                </span>
                <TimeSeriesChart
                  stacked
                  size="sm"
                  hideRangeSelector
                  series={[
                    { label: 'free', data: LEDGER_FREE_DEMO, tone: 'success' },
                    { label: 'encumbered', data: LEDGER_ENCUMBERED_DEMO, tone: 'warn' },
                  ]}
                  tUnit="ms"
                  unit="USD"
                />
              </div>
            </div>
            <div className="ds-text-xs ds-subtle">
              chart.js + react-chartjs-2 wrapped in a tone/range vocabulary. Use for tab/panel
              views — for inline at-a-glance series, prefer YieldSparkline. Reach for{' '}
              <code>stacked</code> only when the series are parts of one whole: the top edge
              then reads as a real total. Stacking unrelated series invents a total that means
              nothing.
            </div>
          </div>

          {/* Strategy Flow */}
          <div className="ds-stack ds-stack-3">
            <div className="ds-label">strategy flow · capital routing diagram</div>
            <StrategyFlow
              source={{ label: 'Vault deposits', sub: '23.4M USDC' }}
              allocations={[
                {
                  label: 'Aave wstETH supply',
                  bps: 6000,
                  tone: 'info',
                  detail: '4.32% APY · single market',
                },
                {
                  label: 'Compound USDC',
                  bps: 2500,
                  tone: 'success',
                  detail: '3.18% APY · 2 markets',
                },
                {
                  label: 'Uniswap v3 LP',
                  bps: 1500,
                  tone: 'warn',
                  detail: 'volatile · 50/50 ETH-USDC',
                },
              ]}
              caption="Connector thickness scales with allocation weight. Hover any row for full bps."
            />
            <StrategyFlow
              source={{ label: 'Treasury', sub: '142.6 WETH' }}
              allocations={[
                { label: 'Lido stake', bps: 7000, tone: 'success', detail: '3.4% APY' },
                { label: 'Rocket pool', bps: 2000, tone: 'info', detail: '3.6% APY' },
                { label: 'Idle (queued unbond)', bps: 1000, tone: 'neutral' },
              ]}
            />
          </div>

          <SourceBlock label="example" source={SRC_DEFI_VAULTS} />
        </section>

        {/* Vault Metadata */}
        <section className="ds-stack ds-stack-8">
          <SectionHeading
            id="vault-metadata"
            title="Vault Metadata"
            lead="Two protocol-layer cards that surface the off-chain `vault.v1` payload — who maintains the vault and what it does with capital. Both read directly from `metadata.content.curator` / `metadata.content.strategy`. Use side-by-side under the vault header."
          />
          <div
            className="ds-stack ds-stack-3"
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
              gap: 'var(--space-4)',
            }}
          >
            <CuratorCard
              curator={{
                name: 'Demo Labs',
                description: 'Maintainer of the Commitments protocol.',
                logoURI: 'https://example.com/logo.png',
                website: 'https://example.com/',
                twitter: 'https://twitter.com/example_service',
              }}
            />
            <StrategyCard
              strategy={{
                name: 'Idle USDC Reserve',
                summary: 'Holds USDC, forwards yield to depositors. No external lending or external venue exposure.',
                riskTier: 'conservative',
              }}
            />
          </div>
          <div
            className="ds-stack ds-stack-3"
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
              gap: 'var(--space-4)',
            }}
          >
            <CuratorCard
              curator={{
                name: 'Acme Risk Co.',
                description: 'Curated mainnet allocator since 2025.',
                website: 'https://acme.example',
                twitter: 'https://twitter.com/acmerisk',
              }}
            />
            <StrategyCard
              strategy={{
                name: 'Cross-Vault Underwriting',
                summary: 'Receives forfeited assets via AgentVaultBeneficiary; depositor NAV lifts when claims pay out.',
                riskTier: 'agent',
                venues: ['CommitmentsVault', 'OptimisticMutualArbiter'],
                documentationURI: 'https://example.com/docs/cross-vault',
              }}
            />
          </div>
        </section>

        {/* Service Stake */}
        <section className="ds-stack ds-stack-8">
          <SectionHeading
            id="service-stake"
            title="Service Stake"
            lead="Per-vault committed-stake breakdown for one service. Pure presentation — pages compose with `useServiceStakeSummary` for the data and `useAssetPrices` for the optional USD column. Multi-vault native: one row per backing vault."
          />
          <ServiceStakeBreakdown
            denoms={
              [
                {
                  vault: '0x0000000000000000000000000000000000000001',
                  // 12,600 shares at 15 decimals (cvUSDC; matches the live
                  // ERC-4626 share offset on the USDC vault).
                  totalShares: parseUnits('12600', 15),
                  // 13,229.99 USDC at 6 decimals — vault accrued ~5% yield.
                  totalAssets: parseUnits('13229.99', 6),
                  asset: '0x0000000000000000000000000000000000000aaa',
                  name: 'Commitments USDC Vault',
                  symbol: 'cvUSDC',
                  decimals: 15,
                  assetSymbol: 'USDC',
                  assetDecimals: 6,
                  logoURI: '/assets/usdc.png',
                },
                {
                  vault: '0x0000000000000000000000000000000000000002',
                  totalShares: parseEther('3.247'),
                  totalAssets: parseEther('3.247'),
                  asset: '0x0000000000000000000000000000000000000bbb',
                  name: 'Commitments WETH Vault',
                  symbol: 'cvWETH',
                  decimals: 18,
                  assetSymbol: 'WETH',
                  assetDecimals: 18,
                  logoURI: '/assets/eth.png',
                },
              ] satisfies ServiceStakeDenom[]
            }
            usdAmountFor={(denom) => {
              if (denom.assetSymbol === 'USDC') return parseUnits('13229.99', 6)
              if (denom.assetSymbol === 'WETH') return parseUnits('11234.50', 6)
              return null
            }}
          />
        </section>

        {/* Vault Header */}
        <section className="ds-stack ds-stack-8">
          <SectionHeading
            id="vault-header"
            title="Vault Header"
            lead="Page hero for any DeFi vault surface. Lays out identity (icon · title · meta), badges, primary CTAs, a stats grid, and an optional aside slot for a capacity meter or sparkline. The top hairline carries the vault's status accent — orange for healthy, amber for paused, red for emergency. Caller fills every slot with a ReactNode, so vault-specific concepts (chain, curator, audit) compose without leaking into the primitive."
          />

          {/* Hero variant — full kit */}
          <div className="ds-stack ds-stack-3">
            <div className="ds-label">hero · full kit</div>
            <VaultHeader
              icon={<TokenIcon symbol="USDC" size="xl" />}
              eyebrow="Delta-neutral · Base"
              title="USDC Carry Trade"
              subtitle="Aerodrome USDC-ETH LP hedged by an Avantis perpetual short. A keeper cron deleverages the position on health-factor breach."
              meta={
                <>
                  <span className="ds-row" style={{ gap: 'var(--space-1)', alignItems: 'center' }}>
                    <span className="ds-token-chip-dot" data-tone="success" />
                    <span>Base · 8453</span>
                  </span>
                  <span>·</span>
                  <span className="ds-row" style={{ gap: 'var(--space-1)', alignItems: 'center' }}>
                    <span className="ds-subtle">contract</span>
                    <AddressDisplay address={'0x4f12cf3a9b2e1d8c47f0a6e13b5d29ba0aae9012' as `0x${string}`} />
                  </span>
                  <span>·</span>
                  <span className="ds-row" style={{ gap: 'var(--space-1)', alignItems: 'center' }}>
                    <span className="ds-subtle">curator</span>
                    <AddressDisplay address={'0xc1ab4d09e80a30bb15d9e2abc3df41a82de42de9' as `0x${string}`} />
                  </span>
                </>
              }
              badges={
                <>
                  <span className="ds-badge ds-badge--success">audited · Hashlock</span>
                  <span className="ds-badge ds-badge--muted">v2.1</span>
                </>
              }
              actions={
                <>
                  <Button variant="primary">Deposit</Button>
                  <Button variant="default">Withdraw</Button>
                </>
              }
              stats={[
                {
                  label: 'TVL',
                  value: <TokenAmount amount={parseUnits('23400000', 6)} decimals={6} symbol="USDC" compact size="inline" />,
                  meta: '78% of cap',
                },
                {
                  label: 'APY · trailing 30d',
                  value: '5.12%',
                  meta: '+0.34pp · 30d',
                  tone: 'success',
                  emphasis: true,
                },
                {
                  label: 'Health factor',
                  value: '1.84',
                  meta: 'guardrail at 1.40',
                  tone: 'success',
                },
                {
                  label: 'Last harvest',
                  value: '6h ago',
                  meta: 'cron · every 4h',
                },
              ]}
              aside={
                <CapacityMeter
                  filled={parseUnits('23400000', 6)}
                  cap={parseUnits('30000000', 6)}
                  softCap={parseUnits('25000000', 6)}
                  decimals={6}
                  symbol="USDC"
                  label="deposit cap"
                />
              }
            />
            <div className="ds-text-xs ds-subtle">
              The emphasised stat (APY) bumps to display size and inherits the accent stripe on its
              left rule — a quiet way to point the eye at the headline number without painting the
              whole row.
            </div>
          </div>

          {/* Compact variant — no icon, no aside */}
          <div className="ds-stack ds-stack-3">
            <div className="ds-label">compact · stats only</div>
            <VaultHeader
              eyebrow="Lending · Ethereum"
              title="WETH Restaked Yield"
              subtitle="Eigenlayer-restaked stETH pooled across three operator sets. Forfeiture is bounded by per-set caps."
              meta={
                <>
                  <span>Ethereum · 1</span>
                  <span>·</span>
                  <AddressDisplay address={'0xa31bdc0901456f1cc8a92ebf7e89f0301d1b2af3' as `0x${string}`} />
                </>
              }
              actions={
                <>
                  <Button variant="primary">Deposit</Button>
                  <Button variant="ghost">Details</Button>
                </>
              }
              stats={[
                {
                  label: 'TVL',
                  value: <TokenAmount amount={parseEther('14260')} decimals={18} symbol="WETH" compact size="inline" />,
                },
                {
                  label: 'APY',
                  value: '6.81%',
                  meta: 'base 3.4 + restake 3.41',
                  tone: 'success',
                  emphasis: true,
                },
                {
                  label: 'Operators',
                  value: '24',
                  meta: '3 sets',
                },
              ]}
            />
          </div>

          {/* Paused / warn variant */}
          <div className="ds-stack ds-stack-3">
            <div className="ds-label">paused · accent="warn" · deposits disabled</div>
            <VaultHeader
              accent="warn"
              icon={<TokenIcon symbol="DAI" size="xl" />}
              eyebrow="MakerDAO PSM · Deprecated"
              title="DAI Stability Vault"
              subtitle="Deposits paused 2026-04-22 pending sky-protocol migration. Existing positions accrue at the legacy rate; withdrawals remain open."
              meta={
                <>
                  <span>Ethereum · 1</span>
                  <span>·</span>
                  <span className="ds-subtle">migration:</span>
                  <Link to="#" style={{ color: 'var(--accent)' }}>sky-vault-v2</Link>
                </>
              }
              badges={
                <>
                  <span className="ds-badge ds-badge--warn">deposits paused</span>
                  <span className="ds-badge ds-badge--muted">audited · OpenZeppelin</span>
                </>
              }
              actions={
                <>
                  <Button variant="primary" disabled>Deposit</Button>
                  <Button variant="default">Withdraw</Button>
                </>
              }
              stats={[
                {
                  label: 'TVL',
                  value: <TokenAmount amount={parseEther('4220000')} decimals={18} symbol="DAI" compact size="inline" />,
                  meta: 'down 12% / 30d',
                  tone: 'warn',
                },
                {
                  label: 'Last APY',
                  value: '3.20%',
                  meta: 'frozen since pause',
                  tone: 'warn',
                  emphasis: true,
                },
                {
                  label: 'Open positions',
                  value: '1,284',
                  meta: 'unwinding · 7d half-life',
                },
              ]}
            />
            <div className="ds-text-xs ds-subtle">
              Status accent paints the top hairline + the emphasised stat's rule in
              <code> --warn</code>. Tone-driven values inherit the same hue without painting the
              whole header.
            </div>
          </div>

          <SourceBlock label="example" source={SRC_VAULT_HEADER} />
        </section>

        {/* Entity Cards */}
        <section className="ds-stack ds-stack-8">
          <SectionHeading
            id="entity-cards"
            title="Entity Cards"
            lead="A labelled card that pairs a name with a description and a row of addresses, IDs, or attestations. Used for smart contracts, role holders, and auditors — surfaces where the relationship between a label and a set of identifiers is the whole point. The left rule picks up a tone; the body slot is freeform so the caller renders any mix of <AddressDisplay>, links, or text."
          />

          {/* Smart contracts */}
          <div className="ds-stack ds-stack-3">
            <div className="ds-label">smart contracts · single address</div>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
                gap: 'var(--space-3)',
              }}
            >
              <EntityCard
                tone="info"
                label="Vault"
                description="ERC-1967 proxy · UUPS upgradable · ERC-4626 share token"
              >
                <AddressDisplay
                  address={'0x4f12cf3a9b2e1d8c47f0a6e13b5d29ba0aae9012' as `0x${string}`}
                  compact
                  explorerUrl="https://etherscan.io/address/0x4f12cf3a9b2e1d8c47f0a6e13b5d29ba0aae9012"
                />
              </EntityCard>
              <EntityCard
                tone="info"
                label="Commitment manager"
                description="UUPS proxy · two-phase forfeit · agreement settlement"
                meta="v2.5"
              >
                <AddressDisplay
                  address={'0x3a4f12cd9e2b1f8a47b06e3c5d9b2af0a8e91234' as `0x${string}`}
                  compact
                  explorerUrl="https://etherscan.io/address/0x3a4f12cd9e2b1f8a47b06e3c5d9b2af0a8e91234"
                />
              </EntityCard>
              <EntityCard
                tone="warn"
                label="Mesh factory"
                description="EIP-1167 minimal-clone factory for mesh topology nodes"
                meta="paused"
              >
                <AddressDisplay
                  address={'0x9c1ab7d8e2a3f5b6c4d8e1f0a3b2c4d5e6f78901' as `0x${string}`}
                  compact
                  explorerUrl="https://etherscan.io/address/0x9c1ab7d8e2a3f5b6c4d8e1f0a3b2c4d5e6f78901"
                />
              </EntityCard>
            </div>
          </div>

          {/* Role holders */}
          <div className="ds-stack ds-stack-3">
            <div className="ds-label">roles · multiple holders</div>
            <div className="ds-stack ds-stack-2">
              <EntityCard
                tone="info"
                label="Vault admin"
                description="Pauses deposits and withdrawals; authorises UUPS upgrades."
                meta="2 holders"
              >
                <AddressDisplay
                  address={'0xc1ab4d09e80a30bb15d9e2abc3df41a82de42de9' as `0x${string}`}
                  compact
                  explorerUrl="https://etherscan.io/address/0xc1ab4d09e80a30bb15d9e2abc3df41a82de42de9"
                />
                <AddressDisplay
                  address={'0xe7d391bc04ab09f8e43c2f1d09bcde3a29a82de1' as `0x${string}`}
                  compact
                  explorerUrl="https://etherscan.io/address/0xe7d391bc04ab09f8e43c2f1d09bcde3a29a82de1"
                />
              </EntityCard>
              <EntityCard
                tone="warn"
                label="Manager keeper"
                description="Triggers permissioned harvests and yield distributions."
                meta={
                  <span title="Scan window bounded by RPC budget">recent grants only</span>
                }
              >
                <AddressDisplay
                  address={'0x8f2e91a4d3c5b7a9f1e2c8b6d4e5f6a7b8c9d0e1' as `0x${string}`}
                  compact
                  explorerUrl="https://etherscan.io/address/0x8f2e91a4d3c5b7a9f1e2c8b6d4e5f6a7b8c9d0e1"
                />
              </EntityCard>
              <EntityCard
                tone="neutral"
                label="Registry admin"
                description="Manages operator registry policy parameters."
              >
                <span className="ds-subtle ds-text-sm">No active holders found.</span>
              </EntityCard>
            </div>
          </div>

          {/* Auditors */}
          <div className="ds-stack ds-stack-3">
            <div className="ds-label">auditors · with optional report link</div>
            <div className="ds-stack ds-stack-2">
              <EntityCard
                tone="success"
                label="Hashlock"
                description="POA middleware v1.0.1 · September 2025"
                action={
                  <a
                    href="#"
                    onClick={(e) => e.preventDefault()}
                    style={{ color: 'var(--accent)' }}
                  >
                    View report ↗
                  </a>
                }
              />
              <EntityCard
                tone="success"
                label="Pashov Audit Group"
                description="Multi-agent audit of v1.2 / v2.0 — full report in audits/"
                meta="9 highs"
                action={
                  <a
                    href="#"
                    onClick={(e) => e.preventDefault()}
                    style={{ color: 'var(--accent)' }}
                  >
                    View report ↗
                  </a>
                }
              />
              <EntityCard
                tone="neutral"
                label="Internal v2.5 review"
                description="May 2026 · 9-agent parallel audit · 7 highs landed and verified"
              />
            </div>
            <div className="ds-text-xs ds-subtle">
              Tone drives the left rule only — `success` for completed audits, `warn` for paused
              contracts, `danger` for emergency states. Body is freeform; pass any combination of
              addresses, lists, or text.
            </div>
          </div>
        </section>

        {/* Buttons */}
        <section className="ds-stack ds-stack-6">
          <SectionHeading
            id="buttons"
            title="Buttons"
            lead="Primary fills with the accent. Secondary outlines. Ghost has no chrome. Destructive uses the error tone. Small, base, large heights."
          />
          <ButtonsRow />
          <SourceBlock label="example" source={SRC_BUTTONS} />
        </section>

        {/* Inputs */}
        <section className="ds-stack ds-stack-6">
          <SectionHeading
            id="inputs"
            title="Inputs"
            lead="Borders only, no fills. Focus uses the accent ring. Affixes for units (ETH, ipfs://). Errors flash the border red and surface a helper line. Reach for `<FormField>` for the canonical label / control / helper / error stack — every governance and commitment form should compose this primitive instead of hand-rolling the field shape."
          />
          <InputsRow />
          <FormFieldDemo />
          <SourceBlock label="example" source={SRC_INPUTS} />
        </section>

        {/* Surfaces */}
        <section className="ds-stack ds-stack-6">
          <SectionHeading
            id="surfaces"
            title="Surfaces"
            lead="One surface, one nested surface, one card. Cards fence content; nested surfaces signal expansion."
          />
          <div className="ds-grid-3">
            <div className="ds-card ds-stack ds-stack-2">
              <div className="ds-label">card</div>
              <div className="ds-text-base">Standard panel</div>
              <div className="ds-text-sm ds-muted">Use for distinct content blocks.</div>
            </div>
            <div className="ds-surface" style={{ padding: 'var(--space-4)' }}>
              <div className="ds-stack ds-stack-2">
                <div className="ds-label">surface</div>
                <div className="ds-text-base">Plain bordered surface</div>
                <hr className="ds-divider" />
                <div className="ds-surface-2" style={{ padding: 'var(--space-3)' }}>
                  <div className="ds-text-sm ds-muted">nested surface — for detail expansion or hover state</div>
                </div>
              </div>
            </div>
            <div className="ds-surface" style={{ padding: 0 }}>
              <div style={{ padding: 'var(--space-3) var(--space-4)', borderBottom: '1px solid var(--border)' }}>
                <div className="ds-label">card · header</div>
              </div>
              <div style={{ padding: 'var(--space-4)' }}>
                <div className="ds-text-sm">Body content lives here.</div>
              </div>
              <div style={{ padding: 'var(--space-3) var(--space-4)', borderTop: '1px solid var(--border)' }} className="ds-row" >
                <button className="ds-btn ds-btn--sm ds-btn--ghost" style={{ marginLeft: 'auto' }}>Action</button>
              </div>
            </div>
          </div>
          <SourceBlock label="example" source={SRC_SURFACES} />
        </section>

        {/* Card */}
        <section className="ds-stack ds-stack-6">
          <SectionHeading
            id="card"
            title="Card"
            lead="React wrapper over `.ds-card`. Adds tone, density, and `as` polymorphism so the same surface renders as a div, anchor, or button without rewriting layout."
          />
          <div className="ds-grid-3">
            <Card>
              <div className="ds-stack ds-stack-2">
                <div className="ds-label">neutral</div>
                <div className="ds-text-base">Default surface</div>
                <div className="ds-text-sm ds-muted">No tone, regular density.</div>
              </div>
            </Card>
            <Card tone="info" selected>
              <div className="ds-stack ds-stack-2">
                <div className="ds-label">info · selected</div>
                <div className="ds-text-base">Accent border + focus ring</div>
                <div className="ds-text-sm ds-muted">Use for the active / matched item in a list.</div>
              </div>
            </Card>
            <Card tone="warn">
              <div className="ds-stack ds-stack-2">
                <div className="ds-label">warn</div>
                <div className="ds-text-base">Attention surface</div>
                <div className="ds-text-sm ds-muted">Forfeit-pending, action required, etc.</div>
              </div>
            </Card>
            <Card tone="danger" density="compact">
              <div className="ds-stack ds-stack-2">
                <div className="ds-label">danger · compact</div>
                <div className="ds-text-base">Tight error surface</div>
                <div className="ds-text-sm ds-muted">Forfeited positions, blocking errors.</div>
              </div>
            </Card>
            <Card as="a" href="#card">
              <div className="ds-stack ds-stack-2">
                <div className="ds-label">as="a"</div>
                <div className="ds-text-base">Anchor card →</div>
                <div className="ds-text-sm ds-muted">Hover + focus-visible affordances; navigates on click.</div>
              </div>
            </Card>
            <Card as="button" onClick={() => undefined}>
              <div className="ds-stack ds-stack-2">
                <div className="ds-label">as="button"</div>
                <div className="ds-text-base">Button card</div>
                <div className="ds-text-sm ds-muted">Full-width, native click semantics, keyboard activation.</div>
              </div>
            </Card>
          </div>
          <SourceBlock label="example" source={SRC_CARD} />
        </section>

        {/* Media Row */}
        <section className="ds-stack ds-stack-6">
          <SectionHeading
            id="media-row"
            title="Media Row"
            lead="Generic list-item primitive — leading slot, title, meta line, trailing slot. Use it as the rendering surface for activity feeds, proposal lists, and operator lists. No protocol vocabulary inside."
          />
          <ul className="ds-stack ds-stack-0" style={{ border: 'var(--border-width) solid var(--border)', listStyle: 'none', padding: 0, margin: 0 }}>
            <MediaRow
              as="li"
              leading={<span className="ds-glyph">↓</span>}
              title="Deposit confirmed"
              meta="2m ago · 0xabcd…1234"
              trailing={<TokenAmount amount={parseEther('1.5')} decimals={18} symbol="ETH" />}
            />
            <MediaRow
              as="li"
              tone="info"
              leading={<span className="ds-glyph">i</span>}
              title="Withdrawal queued"
              meta="unbond ready in 7d"
              trailing={<TokenAmount amount={parseEther('0.4')} decimals={18} symbol="ETH" />}
            />
            <MediaRow
              as="li"
              tone="warn"
              leading={<span className="ds-glyph">!</span>}
              title="Forfeit window open"
              meta="closes in 3h · arbiter 0xdead…beef"
              trailing={<button className="ds-btn ds-btn--sm">Review</button>}
            />
            <MediaRow
              as="li"
              tone="success"
              leading={<span className="ds-glyph">✓</span>}
              title="Yield distributed"
              meta="block 21,401,201"
              trailing={<TokenAmount amount={parseEther('0.012')} decimals={18} symbol="ETH" />}
            />
            <MediaRow
              as="li"
              tone="danger"
              density="compact"
              leading={<span className="ds-glyph">✗</span>}
              title="Position forfeited"
              meta="block 21,401,228"
              trailing="−0.42 ETH"
            />
          </ul>
          <SourceBlock label="example" source={SRC_MEDIA_ROW} />

          <div className="ds-stack ds-stack-3">
            <h3 className="ds-section-title">Rows that activate</h3>
            <p className="ds-text-sm ds-subtle" style={{ maxWidth: '64ch', margin: 0 }}>
              Pass <code>action</code> to make the whole row clickable. The root
              element stays a <code>div</code> or <code>li</code> and the action
              becomes an invisible overlay filling the row, so a row whose slots
              carry their own controls — the copy button inside an address, a
              badge that links out — is still valid HTML and still reachable by
              keyboard. Never reach for <code>as=&quot;button&quot;</code>; it is
              gone for exactly that reason.
            </p>
            <Notice tone="info" size="sm" title="label is not optional">
              The overlay has no text of its own, so <code>action.label</code> is
              the only accessible name the row action gets. Write the sentence a
              screen-reader user needs (&ldquo;Review commitment #28&rdquo;), not
              a bare verb.
            </Notice>
            <ul className="ds-stack ds-stack-0" style={{ border: 'var(--border-width) solid var(--border)', listStyle: 'none', padding: 0, margin: 0 }}>
              <MediaRow
                as="li"
                tone="warn"
                leading={<span className="ds-glyph">!</span>}
                title="Forfeit proposed on commitment #28"
                meta={
                  <span>
                    with <AddressDisplay address="0x15d34aaf54267db7d7c367839aaf71a00a2c6a65" />
                  </span>
                }
                trailing={<span className="ds-text-xs ds-subtle">Review →</span>}
                action={{ label: 'Review commitment #28' }}
              />
              <MediaRow
                as="li"
                leading={<span className="ds-glyph">↓</span>}
                title="Deposit confirmed"
                meta="2m ago"
                trailing={<TokenAmount amount={parseEther('1.5')} decimals={18} symbol="ETH" />}
                action={{ label: 'Open deposit from 2 minutes ago' }}
              />
            </ul>
            <p className="ds-text-xs ds-subtle" style={{ maxWidth: '64ch', margin: 0 }}>
              The copy button on that address is clickable, and tabbing through
              reaches the row action first and the copy button second. Text
              inside an actionable row cannot be selected with the mouse, which
              is the accepted cost of the pattern.
            </p>
            <SourceBlock label="example" source={SRC_MEDIA_ROW_ACTION} />
          </div>
        </section>

        {/* Tables */}
        <section className="ds-stack ds-stack-6">
          <SectionHeading
            id="tables"
            title="Tables"
            lead="Header rows in tracked-uppercase. Numeric columns use tabular numerals. Hover tints the row, no zebra striping."
          />
          <TableDemo />
          <SourceBlock label="example" source={SRC_TABLES} />
        </section>

        {/* Data Table */}
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

        {/* Filter Bar */}
        <section className="ds-stack ds-stack-6">
          <SectionHeading
            id="filter-bar"
            title="Filter Bar"
            lead="Slot-based filter strip above a list. Use FilterBar.Select / .Multi / .Search / .Range. The bar derives an active-filter count from non-empty values and renders a `clear` button when `onClearAll` is provided. Slots are controlled-only by design — pages own filter state."
          />
          <FilterBarDemo />
          <SourceBlock label="example" source={SRC_FILTER_BAR} />
        </section>

        {/* Badges */}
        <section className="ds-stack ds-stack-6">
          <SectionHeading
            id="badges"
            title="Status Badges"
            lead="Borders carry the meaning; fills are reserved for the solid variant. Status semantics mirror the protocol's existing vocabulary."
          />
          <div className="ds-row ds-row-2" style={{ flexWrap: 'wrap' }}>
            <span className="ds-badge ds-badge--success">active</span>
            <span className="ds-badge ds-badge--warn">forfeit-pending</span>
            <span className="ds-badge ds-badge--error">forfeited</span>
            <span className="ds-badge ds-badge--muted">released</span>
            <span className="ds-badge ds-badge--muted">expired</span>
            <span className="ds-badge ds-badge--accent">proposed</span>
            <span className="ds-badge ds-badge--muted">resolved</span>
            <span className="ds-badge">pending</span>
            <span className="ds-badge ds-badge--solid">YOU</span>
          </div>
          <SourceBlock label="example" source={SRC_BADGES} />
        </section>

        {/* Agent badge */}
        <section className="ds-stack ds-stack-6">
          <SectionHeading
            id="agent-badge"
            title="Agent Badge"
            lead="ERC-8004 identity marker — the address owns an agent in the Trustless Agents registry, so the party behind it is a registered autonomous agent. Resolve identities once per page via useAgentIdentities(addresses) and pass the badge through OperatorIdentity's badge slot. Full-precision rule: the canonical agentId travels in title= (agentId 0 is valid — ids start at 0)."
          />
          <div className="ds-stack ds-stack-3">
            <div className="ds-label">standalone</div>
            <div className="ds-row ds-row-2" style={{ flexWrap: 'wrap' }}>
              <AgentBadge agentId={0n} />
              <AgentBadge agentId={42n} />
              <AgentBadge />
            </div>
            <div className="ds-text-xs ds-subtle" style={{ maxWidth: '60ch' }}>
              Hover for the canonical agentId. The id-less variant is the chain-fallback path
              (<code>balanceOf(owner) &gt; 0</code>) where only the is-agent bit is known.
            </div>
          </div>
          <div className="ds-stack ds-stack-3">
            <div className="ds-label">composed · OperatorIdentity badge slot</div>
            <div className="ds-stack ds-stack-3">
              <OperatorIdentity
                address="0x742d35Cc6634C0532925a3b844Bc454e4438f44e"
                name="Sentinel Agent"
                badge={<AgentBadge agentId={0n} />}
              />
              <OperatorIdentity
                address="0xab5801a7d398351b8be11c439e05c5b3259aec9b"
                size="sm"
                hideAddress
                badge={<AgentBadge agentId={7n} />}
              />
            </div>
          </div>
          <SourceBlock label="example" source={SRC_AGENT_BADGE} />
        </section>

        {/* Tx state */}
        <section className="ds-stack ds-stack-6">
          <SectionHeading
            id="tx"
            title="Transaction State"
            lead="Tone signals what's happening; glyph reinforces. Idle is silent — color is earned by activity."
          />
          <div className="ds-stack ds-stack-2 ds-text-sm">
            <div className="ds-tx-idle">· idle — awaiting input</div>
            <div className="ds-tx-pending"><span className="ds-spinner" aria-hidden /> pending — broadcasting tx</div>
            <div className="ds-tx-success"><span className="ds-glyph ds-glyph--ok">✓</span> success — block 2,143,927</div>
            <div className="ds-tx-error"><span className="ds-glyph ds-glyph--error">✗</span> reverted — execution failed</div>
          </div>
          <SourceBlock label="example" source={SRC_TX} />
        </section>

        {/* Glyphs */}
        <section className="ds-stack ds-stack-6">
          <SectionHeading
            id="glyphs"
            title="Glyphs"
            lead="Unicode-only. They survive font fallback, scale on zoom, and copy-paste cleanly into terminals and chats."
          />
          <div className="ds-row ds-row-4" style={{ flexWrap: 'wrap', fontSize: 'var(--text-xl)' }}>
            <span className="ds-glyph ds-glyph--muted" title="empty / pending">·</span>
            <span className="ds-glyph ds-glyph--ok" title="ok">✓</span>
            <span className="ds-glyph ds-glyph--warn" title="warn">⚠</span>
            <span className="ds-glyph ds-glyph--error" title="error">✗</span>
            <span className="ds-glyph ds-glyph--accent" title="collapsed">▶</span>
            <span className="ds-glyph ds-glyph--accent" title="expanded">▼</span>
            <span className="ds-glyph ds-glyph--muted" title="copy">⎘</span>
            <span className="ds-glyph ds-glyph--accent" title="link">↗</span>
          </div>
          <SourceBlock label="example" source={SRC_GLYPHS} />
        </section>

        {/* Address + copy */}
        <section className="ds-stack ds-stack-6">
          <SectionHeading
            id="address"
            title="Address Display"
            lead="Full hex on desktop, middle-truncated under 640px. The whole row is a click-to-copy hit area; the explorer link is a separate target. Resize the window to see the truncation switch."
          />
          <div className="ds-stack ds-stack-4">
            <div className="ds-stack ds-stack-2">
              <div className="ds-label">plain</div>
              <AddressDisplay address="0xC4f7000000000000000000000000000000003Ab9" />
            </div>
            <div className="ds-stack ds-stack-2">
              <div className="ds-label">with explorer link</div>
              <AddressDisplay
                address="0x742d35Cc6634C0532925a3b844Bc454e4438f44e"
                explorerUrl="https://etherscan.io/address/0x742d35Cc6634C0532925a3b844Bc454e4438f44e"
              />
            </div>
            <div className="ds-stack ds-stack-2">
              <div className="ds-label">resolved ens</div>
              <span className="ds-row ds-row-2">
                <AddressDisplay
                  address="0xab5801a7d398351b8be11c439e05c5b3259aec9b"
                  ens="vault.eth"
                  explorerUrl="https://etherscan.io/name/vault.eth"
                />
                <span className="ds-badge ds-badge--accent">ENS</span>
              </span>
            </div>
            <div className="ds-stack ds-stack-2">
              <div className="ds-label">inline · self</div>
              <span className="ds-row ds-row-2">
                <AddressDisplay address="0x4838B106FCe9647Bdf1E7877BF73cE8B0BAD5f97" />
                <span className="ds-badge ds-badge--solid">YOU</span>
              </span>
            </div>
          </div>
          <SourceBlock label="example" source={SRC_ADDRESS} />
        </section>

        {/* Tabs */}
        <section className="ds-stack ds-stack-6">
          <SectionHeading
            id="tabs"
            title="Tabs"
            lead="Bottom-border indicator, no pill backgrounds. Inactive tabs sit muted; the active tab tracks the accent."
          />
          <TabsDemo />
          <SourceBlock label="example" source={SRC_TABS} />
        </section>

        {/* View Toggle */}
        <section className="ds-stack ds-stack-6">
          <SectionHeading
            id="view-toggle"
            title="View Toggle"
            lead="Segmented control for switching equivalent views of the same data — list ↔ graph, comfortable ↔ compact. Visually distinct from Tabs (which switches *content*); ViewToggle switches *representation*. Uses radiogroup semantics."
          />
          <ViewToggleDemo />
          <SourceBlock label="example" source={SRC_VIEW_TOGGLE} />
        </section>

        {/* Navigation */}
        <section className="ds-stack ds-stack-8">
          <SectionHeading
            id="navigation"
            title="Navigation"
            lead="Three patterns coexist: a sticky top bar for the brand and primary destinations, a sidebar for full vertical hierarchy, and an in-page TOC that anchors long pages. On mobile the top bar collapses to a hamburger that opens a drawer holding the same sidebar content — there's only one source of truth for the route list. Bottom-tab is offered as an alternate mobile pattern for app-style flows."
          />
          <NavigationShowcase />
          <SourceBlock label="example" source={SRC_NAV} />
        </section>

        {/* Entity Logo */}
        <section className="ds-stack ds-stack-8">
          <SectionHeading
            id="entity-logo"
            title="Entity Logo"
            lead="Square logo tile for branded entities — services, vaults, curators. Inherits the design system's sharp geometry (`--radius: 0`) and surface palette so the placeholder reads as a chip rather than a portrait. Distinct from OperatorAvatar (round, address-seeded) — reach for EntityLogo whenever the surface is `this is the brand`, not `this is an actor`."
          />
          <div className="ds-stack ds-stack-3">
            <div className="ds-label">size · sm 32 · md 48 · lg 64 · xl 96</div>
            <div className="ds-row ds-row-4" style={{ alignItems: 'flex-end', flexWrap: 'wrap' }}>
              <span className="ds-stack ds-stack-1" style={{ alignItems: 'center' }}>
                <EntityLogo name="Service" src="/assets/usdc.png" size="sm" />
                <span className="ds-text-xs ds-subtle">sm</span>
              </span>
              <span className="ds-stack ds-stack-1" style={{ alignItems: 'center' }}>
                <EntityLogo name="Service" src="/assets/usdc.png" size="md" />
                <span className="ds-text-xs ds-subtle">md</span>
              </span>
              <span className="ds-stack ds-stack-1" style={{ alignItems: 'center' }}>
                <EntityLogo name="Service" src="/assets/usdc.png" size="lg" />
                <span className="ds-text-xs ds-subtle">lg</span>
              </span>
              <span className="ds-stack ds-stack-1" style={{ alignItems: 'center' }}>
                <EntityLogo name="Service" src="/assets/usdc.png" size="xl" />
                <span className="ds-text-xs ds-subtle">xl</span>
              </span>
            </div>
          </div>
          <div className="ds-stack ds-stack-3">
            <div className="ds-label">resolution</div>
            <div className="ds-row ds-row-4" style={{ alignItems: 'center', flexWrap: 'wrap' }}>
              <span className="ds-row ds-row-2">
                <EntityLogo name="USDC Vault" src="/assets/usdc.png" size="md" />
                <span className="ds-text-sm">via src= URL</span>
              </span>
              <span className="ds-row ds-row-2">
                <EntityLogo name="Demo Labs" size="md" />
                <span className="ds-text-sm">name → initials</span>
              </span>
              <span className="ds-row ds-row-2">
                <EntityLogo size="md" />
                <span className="ds-text-sm">no name → ?</span>
              </span>
            </div>
          </div>
          <div className="ds-stack ds-stack-3">
            <div className="ds-label">shape · default square; circle escape hatch</div>
            <div className="ds-row ds-row-4" style={{ alignItems: 'center', flexWrap: 'wrap' }}>
              <span className="ds-row ds-row-2">
                <EntityLogo name="Service" src="/assets/usdc.png" size="lg" shape="square" />
                <span className="ds-text-sm">square (default)</span>
              </span>
              <span className="ds-row ds-row-2">
                <EntityLogo name="Service" src="/assets/usdc.png" size="lg" shape="circle" />
                <span className="ds-text-sm">circle</span>
              </span>
            </div>
          </div>
        </section>

        {/* Operators */}
        <section className="ds-stack ds-stack-8">
          <SectionHeading
            id="operators"
            title="Operators"
            lead="Validator-style identity primitives for mesh operators. The on-chain registry stores an address, stake, and a metadata pointer; the off-chain JSON (operator.v1) carries name, logo, services, and contact. The design treats unnamed and unverified operators as first-class — never break the row."
          />

          {/* Operator avatar */}
          <div className="ds-stack ds-stack-3">
            <div className="ds-label">avatar · sizes</div>
            <div className="ds-row ds-row-4" style={{ alignItems: 'center', flexWrap: 'wrap' }}>
              <span className="ds-row ds-row-2">
                <OperatorAvatar address="0xC4f7000000000000000000000000000000003Ab9" name="Pellar Labs" size="sm" />
                <span className="ds-text-xs ds-subtle">sm · 20</span>
              </span>
              <span className="ds-row ds-row-2">
                <OperatorAvatar address="0xC4f7000000000000000000000000000000003Ab9" name="Pellar Labs" size="md" />
                <span className="ds-text-xs ds-subtle">md · 32</span>
              </span>
              <span className="ds-row ds-row-2">
                <OperatorAvatar address="0xC4f7000000000000000000000000000000003Ab9" name="Pellar Labs" size="lg" />
                <span className="ds-text-xs ds-subtle">lg · 48</span>
              </span>
              <span className="ds-row ds-row-2">
                <OperatorAvatar address="0xC4f7000000000000000000000000000000003Ab9" name="Pellar Labs" size="xl" />
                <span className="ds-text-xs ds-subtle">xl · 72</span>
              </span>
            </div>
            <div className="ds-stack ds-stack-2">
              <div className="ds-label">avatar · resolution</div>
              <div className="ds-row ds-row-4" style={{ alignItems: 'center', flexWrap: 'wrap' }}>
                <span className="ds-row ds-row-2">
                  <OperatorAvatar src="https://avatars.githubusercontent.com/u/4153810?s=200" name="Service" size="md" />
                  <span className="ds-text-sm">via src= URL</span>
                </span>
                <span className="ds-row ds-row-2">
                  <OperatorAvatar address="0xC4f7000000000000000000000000000000003Ab9" name="Pellar Labs" size="md" />
                  <span className="ds-text-sm">name → initials</span>
                </span>
                <span className="ds-row ds-row-2">
                  <OperatorAvatar address="0x742d35Cc6634C0532925a3b844Bc454e4438f44e" size="md" />
                  <span className="ds-text-sm">unnamed → addr seed</span>
                </span>
                <span className="ds-row ds-row-2">
                  <OperatorAvatar address="0xab5801a7d398351b8be11c439e05c5b3259aec9b" size="md" />
                  <span className="ds-text-sm">stable per-address gradient</span>
                </span>
                <span className="ds-row ds-row-2">
                  <OperatorAvatar address="0x4838B106FCe9647Bdf1E7877BF73cE8B0BAD5f97" size="md" />
                  <span className="ds-text-sm">low saturation, mono palette</span>
                </span>
              </div>
            </div>
          </div>

          {/* Operator status */}
          <div className="ds-stack ds-stack-3">
            <div className="ds-label">status</div>
            <div className="ds-row ds-row-3" style={{ flexWrap: 'wrap' }}>
              <OperatorStatusBadge status="ACTIVE" />
              <OperatorStatusBadge status="BELOW_MIN_STAKE" />
              <OperatorStatusBadge status="COOLDOWN" />
              <OperatorStatusBadge status="INACTIVE" />
            </div>
            <div className="ds-text-xs ds-subtle" style={{ maxWidth: '60ch' }}>
              Status precedence in the registry: INACTIVE (deregistered) wins, then BELOW_MIN_STAKE
              (registered but under floor), else ACTIVE. COOLDOWN is the operator-driven pause flag.
            </div>
          </div>

          {/* Agreement status */}
          <div className="ds-stack ds-stack-3">
            <div className="ds-label">agreement state</div>
            <div className="ds-row ds-row-3" style={{ flexWrap: 'wrap' }}>
              <AgreementStatusBadge status="active" />
              <AgreementStatusBadge status="released" />
              <AgreementStatusBadge status="forfeited" />
              <AgreementStatusBadge status="partialForfeitA" />
              <AgreementStatusBadge status="partialForfeitB" />
              <AgreementStatusBadge status="expired" />
              <AgreementStatusBadge status="cancelled" />
            </div>
            <div className="ds-text-xs ds-subtle" style={{ maxWidth: '60ch' }}>
              Bilateral state machine: <code>active</code> (both sides bound) →
              terminal (<code>released</code>, <code>forfeited</code>, <code>expired</code>,
              <code>cancelled</code>). Partial-forfeit variants surface asymmetric resolution
              when one side has been adversely resolved while the other has not.
            </div>
          </div>

          {/* Risk tier */}
          <div className="ds-stack ds-stack-3">
            <div className="ds-label">risk tier · aggregate forfeiture exposure</div>
            <div className="ds-row ds-row-3" style={{ flexWrap: 'wrap' }}>
              <RiskTierBadge tier="success" />
              <RiskTierBadge tier="warn" />
              <RiskTierBadge tier="error" />
              <RiskTierBadge tier="unknown" />
            </div>
            <div className="ds-text-xs ds-subtle" style={{ maxWidth: '60ch' }}>
              Derived via <code>riskTier(maxPenaltyBps)</code>: ≤25% → low, ≤75% → medium, &gt;75% → high.
              <code>unknown</code> is the no-actives case (no current exposure to score).
            </div>
          </div>

          {/* Operator identity */}
          <div className="ds-stack ds-stack-3">
            <div className="ds-label">identity · sizes</div>
            <div className="ds-stack ds-stack-3">
              <div className="ds-row" style={{ alignItems: 'center', gap: 'var(--space-6)' }}>
                <div className="ds-label" style={{ minWidth: 64 }}>sm</div>
                <OperatorIdentity
                  address="0xC4f7000000000000000000000000000000003Ab9"
                  name="Pellar Labs"
                  size="sm"
                  hideAddress
                />
              </div>
              <div className="ds-row" style={{ alignItems: 'center', gap: 'var(--space-6)' }}>
                <div className="ds-label" style={{ minWidth: 64 }}>md</div>
                <OperatorIdentity
                  address="0xC4f7000000000000000000000000000000003Ab9"
                  name="Pellar Labs"
                  size="md"
                />
              </div>
              <div className="ds-row" style={{ alignItems: 'center', gap: 'var(--space-6)' }}>
                <div className="ds-label" style={{ minWidth: 64 }}>lg</div>
                <OperatorIdentity
                  address="0xC4f7000000000000000000000000000000003Ab9"
                  name="Pellar Labs"
                  size="lg"
                />
              </div>
            </div>
            <div className="ds-stack ds-stack-2" style={{ paddingTop: 'var(--space-2)' }}>
              <div className="ds-label">identity · variants</div>
              <div className="ds-stack ds-stack-3">
                <OperatorIdentity
                  address="0x742d35Cc6634C0532925a3b844Bc454e4438f44e"
                  name="Pinax"
                  badge={<span className="ds-badge ds-badge--accent">verified</span>}
                  explorerUrl="https://etherscan.io/address/0x742d35Cc6634C0532925a3b844Bc454e4438f44e"
                />
                <OperatorIdentity
                  address="0x4838B106FCe9647Bdf1E7877BF73cE8B0BAD5f97"
                  name="Operator A"
                  badge={<span className="ds-badge ds-badge--solid">YOU</span>}
                />
                <OperatorIdentity address="0xab5801a7d398351b8be11c439e05c5b3259aec9b" />
                <OperatorIdentity
                  address="0xab5801a7d398351b8be11c439e05c5b3259aec9b"
                  size="lg"
                />
              </div>
            </div>
          </div>

          {/* Stake breakdown */}
          <div className="ds-stack ds-stack-3">
            <div className="ds-label">stake breakdown · stat tiles</div>
            <div className="ds-grid-4">
              <div className="ds-stat">
                <span className="ds-stat-label">Self Stake</span>
                <span className="ds-stat-value">
                  <TokenAmount amount={parseEther('32')} decimals={18} symbol="ETH" />
                </span>
                <span className="ds-stat-meta ds-muted">commitment #0042</span>
              </div>
              <div className="ds-stat">
                <span className="ds-stat-label">Total Delegated</span>
                <span className="ds-stat-value">
                  <TokenAmount amount={parseEther('1247.328')} decimals={18} symbol="ETH" compact />
                </span>
                <span className="ds-stat-delta ds-stat-delta--positive">↑ 12 deleg / 7d</span>
              </div>
              <div className="ds-stat">
                <span className="ds-stat-label">Active Delegations</span>
                <span className="ds-stat-value">87</span>
                <span className="ds-stat-meta ds-muted">across 3 services</span>
              </div>
              <div className="ds-stat ds-stat--accent">
                <span className="ds-stat-label">Voting Power</span>
                <span className="ds-stat-value">
                  <TokenAmount amount={parseEther('1279.328')} decimals={18} symbol="ETH" compact />
                </span>
                <span className="ds-stat-meta ds-muted">3.2% of mesh</span>
              </div>
            </div>
          </div>

          {/* Operator profile card */}
          <div className="ds-stack ds-stack-3">
            <div className="ds-label">operator profile card</div>
            <div className="ds-operator-card">
              <div className="ds-operator-card-header">
                <OperatorIdentity
                  address="0xC4f7000000000000000000000000000000003Ab9"
                  name="Pellar Labs"
                  size="lg"
                  badge={<OperatorStatusBadge status="ACTIVE" />}
                  explorerUrl="https://etherscan.io/address/0xC4f7000000000000000000000000000000003Ab9"
                />
                <div className="ds-operator-card-header-actions">
                  <button className="ds-btn ds-btn--sm ds-btn--ghost">Undelegate</button>
                  <button className="ds-btn ds-btn--sm ds-btn--primary">Delegate</button>
                </div>
              </div>
              <p className="ds-operator-card-description">
                Veteran AVS operator running production operator services since mainnet beta.
                Bare-metal infrastructure across two regions, 99.97% lifetime uptime, and a
                public post-mortem policy. Specializes in price feed and randomness AVSs.
              </p>
              <div className="ds-operator-card-services">
                <span className="ds-service-tag">price-oracle</span>
                <span className="ds-service-tag">randomness</span>
                <span className="ds-service-tag">attestation</span>
                <span className="ds-service-tag">forfeiture-arbiter</span>
              </div>
              <div className="ds-operator-card-meta">
                <span className="ds-operator-card-meta-label">self stake</span>
                <span className="ds-operator-card-meta-value">
                  <TokenAmount amount={parseEther('32')} decimals={18} symbol="ETH" size="inline" />
                </span>
                <span className="ds-operator-card-meta-label">total delegated</span>
                <span className="ds-operator-card-meta-value">
                  <TokenAmount amount={parseEther('1247.328')} decimals={18} symbol="ETH" compact size="inline" />
                </span>
                <span className="ds-operator-card-meta-label">delegations</span>
                <span className="ds-operator-card-meta-value">87 active</span>
                <span className="ds-operator-card-meta-label">p2p endpoint</span>
                <span className="ds-operator-card-meta-value">
                  /dns/ops.pellar.io/tcp/26656
                </span>
                <span className="ds-operator-card-meta-label">registered</span>
                <span className="ds-operator-card-meta-value">2026-02-14</span>
              </div>
              <div className="ds-operator-card-social">
                <a href="https://pellar.io" target="_blank" rel="noreferrer">
                  <span aria-hidden>↗</span> pellar.io
                </a>
                <a href="https://twitter.com/pellarlabs" target="_blank" rel="noreferrer">
                  <span aria-hidden>↗</span> @pellarlabs
                </a>
                <a href="https://github.com/pellarlabs" target="_blank" rel="noreferrer">
                  <span aria-hidden>↗</span> github.com/pellarlabs
                </a>
              </div>
              <MetadataSummary
                uri="ipfs://bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi"
                contentHash="0x9f3e2b71c8d4a51b8e7c3f0291a5d1f8c4b2e6a91f3d8e7c5b2a91f3d8e7c5b2"
                status="ok"
                updatedAt="2026-04-21"
              />
            </div>
          </div>

          {/* Operator list row */}
          <div className="ds-stack ds-stack-3">
            <div className="ds-label">operator list · table</div>
            <table className="ds-table">
              <thead>
                <tr>
                  <th>Operator</th>
                  <th>Status</th>
                  <th style={{ textAlign: 'right' }}>Self Stake</th>
                  <th style={{ textAlign: 'right' }}>Total Delegated</th>
                  <th style={{ textAlign: 'right' }}>Delegations</th>
                  <th>Metadata</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>
                    <OperatorIdentity
                      address="0xC4f7000000000000000000000000000000003Ab9"
                      name="Pellar Labs"
                      size="sm"
                      hideAddress
                    />
                  </td>
                  <td><OperatorStatusBadge status="ACTIVE" /></td>
                  <td style={{ textAlign: 'right' }}>
                    <TokenAmount amount={parseEther('32')} decimals={18} symbol="ETH" size="inline" />
                  </td>
                  <td style={{ textAlign: 'right' }}>
                    <TokenAmount amount={parseEther('1247.328')} decimals={18} symbol="ETH" compact size="inline" />
                  </td>
                  <td style={{ textAlign: 'right' }} className="ds-mono-num">87</td>
                  <td><MetadataStatusBadge status="ok" /></td>
                </tr>
                <tr>
                  <td>
                    <OperatorIdentity
                      address="0x742d35Cc6634C0532925a3b844Bc454e4438f44e"
                      name="Pinax"
                      size="sm"
                      hideAddress
                    />
                  </td>
                  <td><OperatorStatusBadge status="ACTIVE" /></td>
                  <td style={{ textAlign: 'right' }}>
                    <TokenAmount amount={parseEther('48')} decimals={18} symbol="ETH" size="inline" />
                  </td>
                  <td style={{ textAlign: 'right' }}>
                    <TokenAmount amount={parseEther('820.4')} decimals={18} symbol="ETH" size="inline" />
                  </td>
                  <td style={{ textAlign: 'right' }} className="ds-mono-num">42</td>
                  <td><MetadataStatusBadge status="ok" /></td>
                </tr>
                <tr>
                  <td>
                    <OperatorIdentity
                      address="0x4838B106FCe9647Bdf1E7877BF73cE8B0BAD5f97"
                      name="Operator A"
                      size="sm"
                      hideAddress
                    />
                  </td>
                  <td><OperatorStatusBadge status="BELOW_MIN_STAKE" /></td>
                  <td style={{ textAlign: 'right' }}>
                    <TokenAmount amount={parseEther('4.2')} decimals={18} symbol="ETH" size="inline" />
                  </td>
                  <td style={{ textAlign: 'right' }}>
                    <TokenAmount amount={0n} decimals={18} symbol="ETH" size="inline" />
                  </td>
                  <td style={{ textAlign: 'right' }} className="ds-mono-num">0</td>
                  <td><MetadataStatusBadge status="invalid" /></td>
                </tr>
                <tr>
                  <td>
                    <OperatorIdentity
                      address="0xab5801a7d398351b8be11c439e05c5b3259aec9b"
                      size="sm"
                      hideAddress
                    />
                  </td>
                  <td><OperatorStatusBadge status="INACTIVE" /></td>
                  <td style={{ textAlign: 'right' }}>
                    <TokenAmount amount={0n} decimals={18} symbol="ETH" size="inline" />
                  </td>
                  <td style={{ textAlign: 'right' }}>
                    <TokenAmount amount={0n} decimals={18} symbol="ETH" size="inline" />
                  </td>
                  <td style={{ textAlign: 'right' }} className="ds-mono-num">0</td>
                  <td><MetadataStatusBadge status="missing" /></td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* Metadata health inline */}
          <div className="ds-stack ds-stack-3">
            <div className="ds-label">metadata · integrity states</div>
            <div className="ds-stack ds-stack-2">
              {(['ok', 'checking', 'missing', 'invalid'] as MetadataStatus[]).map((s) => (
                <div key={s} className="ds-row" style={{ gap: 'var(--space-6)', alignItems: 'center' }}>
                  <div className="ds-label" style={{ minWidth: 96 }}>{s}</div>
                  <MetadataStatusBadge status={s} />
                  <span className="ds-text-xs ds-subtle">
                    {s === 'ok' && '— fetched JSON hashes back to the on-chain contentHash'}
                    {s === 'checking' && '— hash verification in flight'}
                    {s === 'missing' && '— no uri set; falls back to address-only identity'}
                    {s === 'invalid' && '— hash mismatch; UI surfaces this prominently'}
                  </span>
                </div>
              ))}
            </div>
          </div>
          <SourceBlock label="example" source={SRC_OPERATORS} />
        </section>

        {/* Commitments */}
        <section className="ds-stack ds-stack-8">
          <SectionHeading
            id="commitments"
            title="Commitments"
            lead="The protocol's core primitive: a depositor pre-locks vault shares, names an arbiter, and enters a two-phase forfeit window. The UI must answer at-a-glance: who's bound, what's at stake, what penalty range, where in the lifecycle, and how long until the next state transition."
          />

          {/* Status badges */}
          <div className="ds-stack ds-stack-3">
            <div className="ds-label">status · vocabulary</div>
            <div className="ds-row ds-row-3" style={{ flexWrap: 'wrap' }}>
              {(['PROPOSED', 'ACTIVE', 'FORFEIT_PENDING', 'FORFEITED', 'RELEASED', 'EXPIRED'] as CommitmentStatus[]).map((s) => (
                <CommitmentStatusBadge key={s} status={s} />
              ))}
            </div>
            <div className="ds-text-xs ds-subtle" style={{ maxWidth: '60ch' }}>
              PROPOSED applies to agreements pre-acceptance; simple commitments enter ACTIVE on
              creation. FORFEIT_PENDING is the challenge-window intermediate. RELEASED, FORFEITED, and
              EXPIRED are terminal. Precedence: forfeited → released → forfeit-pending → expired → active.
            </div>
          </div>

          {/* Lifecycle stepper */}
          <div className="ds-stack ds-stack-3">
            <div className="ds-label">lifecycle · stepper</div>
            <div className="ds-stack ds-stack-6">
              <div className="ds-stack ds-stack-2">
                <div className="ds-row ds-row-3"><span className="ds-text-sm ds-muted">happy path · active</span><CommitmentStatusBadge status="ACTIVE" /></div>
                <LifecycleStepper steps={commitmentLifecycle('ACTIVE')} />
              </div>
              <div className="ds-stack ds-stack-2">
                <div className="ds-row ds-row-3"><span className="ds-text-sm ds-muted">arbiter proposed forfeit</span><CommitmentStatusBadge status="FORFEIT_PENDING" /></div>
                <LifecycleStepper steps={commitmentLifecycle('FORFEIT_PENDING')} />
              </div>
              <div className="ds-stack ds-stack-2">
                <div className="ds-row ds-row-3"><span className="ds-text-sm ds-muted">forfeit executed</span><CommitmentStatusBadge status="FORFEITED" /></div>
                <LifecycleStepper steps={commitmentLifecycle('FORFEITED')} />
              </div>
              <div className="ds-stack ds-stack-2">
                <div className="ds-row ds-row-3"><span className="ds-text-sm ds-muted">released by arbiter</span><CommitmentStatusBadge status="RELEASED" /></div>
                <LifecycleStepper steps={commitmentLifecycle('RELEASED')} />
              </div>
              <div className="ds-stack ds-stack-2">
                <div className="ds-row ds-row-3"><span className="ds-text-sm ds-muted">depositor self-released after expiry</span><CommitmentStatusBadge status="EXPIRED" /></div>
                <LifecycleStepper steps={commitmentLifecycle('EXPIRED')} />
              </div>
            </div>
          </div>

          {/* Countdown */}
          <div className="ds-stack ds-stack-3">
            <div className="ds-label">window · countdown</div>
            <div className="ds-stack ds-stack-4">
              <Countdown label="challenge window" elapsed={3600 * 4} total={3600 * 24} tone="warn" />
              <Countdown label="challenge window · final hour" elapsed={3600 * 23} total={3600 * 24} tone="danger" />
              <Countdown label="expires in" elapsed={86400 * 14} total={86400 * 30} tone="info" />
              <Countdown label="self-release available" elapsed={86400 * 30} total={86400 * 30} tone="success" />
            </div>
          </div>

          {/* Party list */}
          <div className="ds-stack ds-stack-3">
            <div className="ds-label">parties · roles</div>
            <div className="ds-surface" style={{ padding: 'var(--space-4)' }}>
              <div className="ds-party-list">
                <PartyRow label="depositor">
                  <OperatorIdentity
                    address="0xC4f7000000000000000000000000000000003Ab9"
                    name="Pellar Labs"
                    size="sm"
                    hideAddress
                  />
                  <span className="ds-text-xs ds-subtle">{truncateAddr('0xC4f7000000000000000000000000000000003Ab9')}</span>
                  <span className="ds-badge ds-badge--solid">YOU</span>
                </PartyRow>
                <PartyRow label="counterparty">
                  <OperatorIdentity
                    address="0x742d35Cc6634C0532925a3b844Bc454e4438f44e"
                    name="Pinax"
                    size="sm"
                    hideAddress
                  />
                  <span className="ds-text-xs ds-subtle">{truncateAddr('0x742d35Cc6634C0532925a3b844Bc454e4438f44e')}</span>
                </PartyRow>
                <PartyRow label="arbiter">
                  <OperatorIdentity
                    address="0xab5801a7d398351b8be11c439e05c5b3259aec9b"
                    name="Operator Service"
                    size="sm"
                    hideAddress
                  />
                  <span className="ds-text-xs ds-subtle">{truncateAddr('0xab5801a7d398351b8be11c439e05c5b3259aec9b')}</span>
                  <span className="ds-badge ds-badge--accent">avs</span>
                </PartyRow>
              </div>
            </div>
          </div>

          {/* Metadata block */}
          <div className="ds-stack ds-stack-3">
            <div className="ds-label">commitment metadata</div>
            <MetadataSummary
              uri="ipfs://bafkreigh2akiscaildc3xwmamkdkzsxwt4kp4kk4f7klqpd4ufnfbazlta"
              contentHash="0x47c8a4b1f3e9d2b5a8c6f0e1d3b7a9f2e8c4d6b1a5f9c3e7b2d4a6f8c1e9b3d5"
              status="ok"
              updatedAt="2026-04-19"
            />
          </div>

          {/* Commitment card · composite */}
          <div className="ds-stack ds-stack-3">
            <div className="ds-label">commitment card · composite</div>
            <div className="ds-commitment-card">
              <div className="ds-commitment-card-header">
                <span className="ds-row ds-row-3">
                  <span className="ds-commitment-card-id">commitment #0042</span>
                  <CommitmentStatusBadge status="FORFEIT_PENDING" />
                </span>
                <span className="ds-row ds-row-2">
                  <button className="ds-btn ds-btn--sm ds-btn--ghost">Challenge</button>
                  <button className="ds-btn ds-btn--sm ds-btn--destructive">Execute Forfeit</button>
                </span>
              </div>
              <div className="ds-commitment-card-body">
                <div className="ds-commitment-card-amount-row">
                  <TokenAmount
                    amount={parseEther('12.4057')}
                    decimals={18}
                    symbol="ETH"
                    size="display"
                    withIcon
                  />
                  <div className="ds-stack ds-stack-1" style={{ alignItems: 'flex-end' }}>
                    <span className="ds-label">max penalty</span>
                    <RiskRow bps={5000} label="of stake" />
                  </div>
                </div>
                <hr className="ds-divider" />
                <div className="ds-party-list">
                  <PartyRow label="depositor">
                    <OperatorIdentity
                      address="0xC4f7000000000000000000000000000000003Ab9"
                      name="Pellar Labs"
                      size="sm"
                      hideAddress
                    />
                    <span className="ds-badge ds-badge--solid">YOU</span>
                  </PartyRow>
                  <PartyRow label="counterparty">
                    <OperatorIdentity
                      address="0x742d35Cc6634C0532925a3b844Bc454e4438f44e"
                      name="Pinax"
                      size="sm"
                      hideAddress
                    />
                  </PartyRow>
                  <PartyRow label="arbiter">
                    <OperatorIdentity
                      address="0xab5801a7d398351b8be11c439e05c5b3259aec9b"
                      name="Operator Service"
                      size="sm"
                      hideAddress
                    />
                    <span className="ds-badge ds-badge--accent">avs</span>
                  </PartyRow>
                  <PartyRow label="yield share">
                    <span className="ds-mono-num">{formatPercent(1000)}</span>
                    <span className="ds-text-xs ds-subtle">to counterparty</span>
                  </PartyRow>
                </div>
                <hr className="ds-divider" />
                <LifecycleStepper steps={commitmentLifecycle('FORFEIT_PENDING')} />
                <Countdown label="challenge window" elapsed={3600 * 18} total={3600 * 24} tone="warn" />
                <MetadataSummary
                  uri="ipfs://bafkreigh2akiscaildc3xwmamkdkzsxwt4kp4kk4f7klqpd4ufnfbazlta"
                  contentHash="0x47c8a4b1f3e9d2b5a8c6f0e1d3b7a9f2e8c4d6b1a5f9c3e7b2d4a6f8c1e9b3d5"
                  status="ok"
                  updatedAt="2026-04-19"
                />
              </div>
              <div className="ds-commitment-card-footer">
                <span>created 2026-04-12 · expires 2026-05-12</span>
                <span>vault yield · price 1.0234 ETH/cETH</span>
              </div>
            </div>
          </div>

          {/* Commitment list row */}
          <div className="ds-stack ds-stack-3">
            <div className="ds-label">commitment list · table</div>
            <table className="ds-table">
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Counterparty</th>
                  <th>Arbiter</th>
                  <th style={{ textAlign: 'right' }}>Amount</th>
                  <th style={{ textAlign: 'right' }}>Max Penalty</th>
                  <th>Status</th>
                  <th>Window</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td className="ds-mono-num ds-muted">#0042</td>
                  <td>
                    <OperatorIdentity address="0x742d35Cc6634C0532925a3b844Bc454e4438f44e" name="Pinax" size="sm" hideAddress />
                  </td>
                  <td>
                    <OperatorIdentity address="0xab5801a7d398351b8be11c439e05c5b3259aec9b" name="Service" size="sm" hideAddress />
                  </td>
                  <td style={{ textAlign: 'right' }}>
                    <TokenAmount amount={parseEther('12.4057')} decimals={18} symbol="ETH" size="inline" />
                  </td>
                  <td style={{ textAlign: 'right' }} className="ds-mono-num">{formatPercent(5000)}</td>
                  <td><CommitmentStatusBadge status="FORFEIT_PENDING" /></td>
                  <td className="ds-text-xs ds-subtle">6h remaining</td>
                </tr>
                <tr>
                  <td className="ds-mono-num ds-muted">#0041</td>
                  <td>
                    <OperatorIdentity address="0x742d35Cc6634C0532925a3b844Bc454e4438f44e" name="Pinax" size="sm" hideAddress />
                  </td>
                  <td>
                    <OperatorIdentity address="0xab5801a7d398351b8be11c439e05c5b3259aec9b" name="Service" size="sm" hideAddress />
                  </td>
                  <td style={{ textAlign: 'right' }}>
                    <TokenAmount amount={parseEther('3.10')} decimals={18} symbol="ETH" size="inline" />
                  </td>
                  <td style={{ textAlign: 'right' }} className="ds-mono-num">{formatPercent(2500)}</td>
                  <td><CommitmentStatusBadge status="ACTIVE" /></td>
                  <td className="ds-text-xs ds-subtle">expires in 18d</td>
                </tr>
                <tr>
                  <td className="ds-mono-num ds-muted">#0038</td>
                  <td>
                    <OperatorIdentity address="0xab5801a7d398351b8be11c439e05c5b3259aec9b" size="sm" hideAddress />
                  </td>
                  <td>
                    <OperatorIdentity address="0x4838B106FCe9647Bdf1E7877BF73cE8B0BAD5f97" name="Service" size="sm" hideAddress />
                  </td>
                  <td style={{ textAlign: 'right' }}>
                    <TokenAmount amount={parseEther('0.85')} decimals={18} symbol="ETH" size="inline" />
                  </td>
                  <td style={{ textAlign: 'right' }} className="ds-mono-num">{formatPercent(10000)}</td>
                  <td><CommitmentStatusBadge status="FORFEITED" /></td>
                  <td className="ds-text-xs ds-subtle">2d ago</td>
                </tr>
                <tr>
                  <td className="ds-mono-num ds-muted">#0027</td>
                  <td>
                    <OperatorIdentity address="0x742d35Cc6634C0532925a3b844Bc454e4438f44e" name="Pinax" size="sm" hideAddress />
                  </td>
                  <td>
                    <OperatorIdentity address="0xab5801a7d398351b8be11c439e05c5b3259aec9b" name="Service" size="sm" hideAddress />
                  </td>
                  <td style={{ textAlign: 'right' }}>
                    <TokenAmount amount={parseEther('8.00')} decimals={18} symbol="ETH" size="inline" />
                  </td>
                  <td style={{ textAlign: 'right' }} className="ds-mono-num">{formatPercent(5000)}</td>
                  <td><CommitmentStatusBadge status="RELEASED" /></td>
                  <td className="ds-text-xs ds-subtle">21d ago</td>
                </tr>
              </tbody>
            </table>
          </div>
          <SourceBlock label="example" source={SRC_COMMITMENTS} />
        </section>

        {/* Mutuals / shared loss */}
        <section className="ds-stack ds-stack-8">
          <SectionHeading
            id="mutual"
            title="Mutuals / Shared Loss"
            lead="Mutual primitives for pooled, shared-loss underwriting. A mutual accrues a cumulative loss fraction Λ (1e18-scaled, monotonic, capped at 100%); each member owes E_i × (Λ − snapshot) / 1e18, settled lazily. The UI must make worst-case exposure, the live loss share, and the capital-freeze mechanics legible before anyone consents to join."
          />

          {/* Lifecycle status */}
          <div className="ds-stack ds-stack-3">
            <div className="ds-label">mutual lifecycle status</div>
            <div className="ds-row ds-row-3" style={{ flexWrap: 'wrap', gap: 'var(--space-2)' }}>
              <MutualStatusBadge status="pending" />
              <MutualStatusBadge status="active" />
              <MutualStatusBadge status="loss-pending" />
              <MutualStatusBadge status="terminated" />
            </div>
            <div className="ds-text-xs ds-subtle" style={{ maxWidth: '64ch' }}>
              Driven by the mutual header's <code>active</code> / <code>terminal</code> flags plus the
              live derived state (a bonded loss under challenge → <code>loss-pending</code>). A mutual
              whose members still owe their loss share after an executed loss stays <code>active</code> — the
              pool keeps covering — with the owed-loss footnote carrying that nuance.
            </div>
          </div>

          {/* Shared-loss gauge */}
          <div className="ds-stack ds-stack-3">
            <div className="ds-label">shared-loss gauge · cumulative loss share (Λ)</div>
            <div className="ds-grid" style={{ gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 'var(--space-6)' }}>
              <SharedLossGauge cumulativeLoss={0n} />
              <SharedLossGauge cumulativeLoss={372_500_000_000_000_000n} memberSnapshot={120_000_000_000_000_000n} />
            </div>
            <div className="ds-text-xs ds-subtle" style={{ maxWidth: '64ch' }}>
              Left: a fresh mutual at 0% cumulative loss. Right: Λ at 37.25% with a member snapshot tick at
              12% — the member owes only the 25.25% accrued since they joined. The headline
              percentage carries the canonical full-precision Λ in its title.
            </div>
          </div>

          {/* Pending loss-share notice */}
          <div className="ds-stack ds-stack-3">
            <div className="ds-label">pending loss share · exit gating</div>
            <div className="ds-stack ds-stack-3">
              <PendingLossNotice owedUnits={parseUnits('1240.55', 6)} decimals={6} symbol="USDC" />
              <PendingLossNotice
                owedUnits={parseUnits('1240.55', 6)}
                decimals={6}
                symbol="USDC"
                exitRequested
                slashableElapsed={3600 * 30}
                slashableWindow={3600 * 72}
              />
              <PendingLossNotice owedUnits={0n} decimals={6} symbol="USDC" />
            </div>
          </div>
        </section>

        {/* Commitment naming */}
        <section className="ds-stack ds-stack-8">
          <SectionHeading
            id="commitment-naming"
            title="Commitment Naming"
            lead="A commitment's name is derived, not read. `commitmentLabel(row, ctx)` in lib/ resolves three tiers — a verified off-chain title, a label derived from the row's own structure, then the bare id — and returns the trust level alongside the text. Every surface that names a commitment goes through it, which is what keeps the table, the cards, and the detail header from drifting apart. The components below render its output; none of them decide what is safe to show."
          />
          <CommitmentNamingDemo />
          <SourceBlock label="example" source={SRC_COMMITMENT_NAMING} />
        </section>

        {/* Metadata editor */}
        <section className="ds-stack ds-stack-8">
          <SectionHeading
            id="metadata-editor"
            title="Metadata Editor"
            lead="Reusable, flow-agnostic authoring shell for protocol metadata. Structured fields are the inline default (driven by a schema prop — commitment.v1 or agreement.v1); the legacy raw URI + hash paste lives in an Advanced disclosure. Pinning POSTs the exact bytes to the indexer and surfaces the authoritative { metadataURI, metadataHash } to the parent form. Consumed by the create-commitment and propose-agreement flows."
          />
          <div className="ds-grid" style={{ gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 'var(--space-6)' }}>
            <div className="ds-stack ds-stack-3">
              <div className="ds-label">schema · commitment.v1</div>
              <div className="ds-surface" style={{ padding: 'var(--space-4)' }}>
                <MetadataEditor schema="commitment.v1" />
              </div>
            </div>
            <div className="ds-stack ds-stack-3">
              <div className="ds-label">schema · agreement.v1</div>
              <div className="ds-surface" style={{ padding: 'var(--space-4)' }}>
                <MetadataEditor schema="agreement.v1" />
              </div>
            </div>
          </div>
          <SourceBlock label="example" source={SRC_METADATA_EDITOR} />
        </section>

        {/* Loading & placeholders */}
        <section className="ds-stack ds-stack-8">
          <SectionHeading
            id="loading"
            title="Loading & Placeholders"
            lead="Skeletons reserve space so async reads don't shift the page. Spinners and dots cover the inline cases. Overlays let an existing panel refresh without wiping its values. Match the placeholder to the eventual content's shape — a skeleton operator row should look like an operator row, not a generic gray bar."
          />

          {/* Skeleton shapes */}
          <div className="ds-stack ds-stack-3">
            <div className="ds-label">skeleton · shapes</div>
            <div className="ds-stack ds-stack-2 ds-text-sm">
              <div className="ds-row" style={{ gap: 'var(--space-6)', alignItems: 'center' }}>
                <div className="ds-label" style={{ minWidth: 80 }}>text</div>
                <span className="ds-skeleton ds-skeleton--text" style={{ width: 180 }} />
                <span className="ds-subtle">— line height ~0.85em, paired with body copy</span>
              </div>
              <div className="ds-row" style={{ gap: 'var(--space-6)', alignItems: 'center' }}>
                <div className="ds-label" style={{ minWidth: 80 }}>title</div>
                <span className="ds-skeleton ds-skeleton--title" style={{ width: 240 }} />
                <span className="ds-subtle">— heading height, ~1.4em</span>
              </div>
              <div className="ds-row" style={{ gap: 'var(--space-6)', alignItems: 'center' }}>
                <div className="ds-label" style={{ minWidth: 80 }}>circle</div>
                <span className="ds-skeleton ds-skeleton--circle" style={{ width: 32, height: 32 }} />
                <span className="ds-skeleton ds-skeleton--circle" style={{ width: 48, height: 48 }} />
                <span className="ds-subtle">— stand-in for avatars and token icons</span>
              </div>
              <div className="ds-row" style={{ gap: 'var(--space-6)', alignItems: 'center' }}>
                <div className="ds-label" style={{ minWidth: 80 }}>block</div>
                <span className="ds-skeleton ds-skeleton--block" style={{ width: 120, height: 60 }} />
                <span className="ds-subtle">— charts, panels, cards</span>
              </div>
              <div className="ds-row" style={{ gap: 'var(--space-6)', alignItems: 'center' }}>
                <div className="ds-label" style={{ minWidth: 80 }}>button</div>
                <span className="ds-skeleton ds-skeleton--button" />
                <span className="ds-skeleton ds-skeleton--button" style={{ minWidth: 120 }} />
                <span className="ds-subtle">— action surfaces while permissions resolve</span>
              </div>
            </div>
          </div>

          {/* Skeleton paragraph and animation variants */}
          <div className="ds-grid-2">
            <div className="ds-stack ds-stack-3">
              <div className="ds-label">skeleton · paragraph</div>
              <div className="ds-skeleton-paragraph">
                <span className="ds-skeleton ds-skeleton--text" />
                <span className="ds-skeleton ds-skeleton--text" />
                <span className="ds-skeleton ds-skeleton--text" />
                <span className="ds-skeleton ds-skeleton--text" />
              </div>
              <div className="ds-text-xs ds-subtle">Last line auto-shortens to evoke prose flow without committing to any specific copy length.</div>
            </div>
            <div className="ds-stack ds-stack-3">
              <div className="ds-label">skeleton · animation</div>
              <div className="ds-stack ds-stack-2 ds-text-sm">
                <div className="ds-row" style={{ gap: 'var(--space-4)', alignItems: 'center' }}>
                  <div className="ds-label" style={{ minWidth: 72 }}>pulse</div>
                  <span className="ds-skeleton ds-skeleton--text" style={{ width: 200 }} />
                </div>
                <div className="ds-row" style={{ gap: 'var(--space-4)', alignItems: 'center' }}>
                  <div className="ds-label" style={{ minWidth: 72 }}>shimmer</div>
                  <span className="ds-skeleton ds-skeleton--shimmer ds-skeleton--text" style={{ width: 200 }} />
                </div>
                <div className="ds-row" style={{ gap: 'var(--space-4)', alignItems: 'center' }}>
                  <div className="ds-label" style={{ minWidth: 72 }}>still</div>
                  <span className="ds-skeleton ds-skeleton--still ds-skeleton--text" style={{ width: 200 }} />
                </div>
              </div>
              <div className="ds-text-xs ds-subtle">
                Pulse reads on any surface; shimmer suits richer panels; still hints at structure without animation (good for nested skeletons).
              </div>
            </div>
          </div>

          {/* Skeleton compositions */}
          <div className="ds-stack ds-stack-3">
            <div className="ds-label">skeleton · compositions</div>
            <div className="ds-grid-3">
              {/* Operator row */}
              <div className="ds-card ds-stack ds-stack-3">
                <div className="ds-label">operator row</div>
                <div className="ds-row" style={{ gap: 'var(--space-3)', alignItems: 'center' }}>
                  <span className="ds-skeleton ds-skeleton--circle" style={{ width: 32, height: 32 }} />
                  <div className="ds-stack ds-stack-1" style={{ flex: 1 }}>
                    <span className="ds-skeleton ds-skeleton--text" style={{ width: '70%' }} />
                    <span className="ds-skeleton ds-skeleton--text" style={{ width: '45%' }} />
                  </div>
                  <span className="ds-skeleton ds-skeleton--still" style={{ width: 56, height: 16, borderRadius: 999 }} />
                </div>
                <div className="ds-row" style={{ gap: 'var(--space-3)', alignItems: 'center' }}>
                  <span className="ds-skeleton ds-skeleton--circle" style={{ width: 32, height: 32 }} />
                  <div className="ds-stack ds-stack-1" style={{ flex: 1 }}>
                    <span className="ds-skeleton ds-skeleton--text" style={{ width: '60%' }} />
                    <span className="ds-skeleton ds-skeleton--text" style={{ width: '40%' }} />
                  </div>
                  <span className="ds-skeleton ds-skeleton--still" style={{ width: 56, height: 16, borderRadius: 999 }} />
                </div>
              </div>

              {/* Stat tile */}
              <div className="ds-card ds-stack ds-stack-3">
                <div className="ds-label">stat tile</div>
                <div className="ds-stack ds-stack-2">
                  <span className="ds-skeleton ds-skeleton--text" style={{ width: 100 }} />
                  <span className="ds-skeleton ds-skeleton--title" style={{ width: 140, height: 32 }} />
                  <span className="ds-skeleton ds-skeleton--text" style={{ width: 80 }} />
                </div>
              </div>

              {/* Commitment card */}
              <div className="ds-card ds-stack ds-stack-3">
                <div className="ds-label">commitment card</div>
                <div className="ds-row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
                  <span className="ds-skeleton ds-skeleton--text" style={{ width: 80 }} />
                  <span className="ds-skeleton ds-skeleton--still" style={{ width: 56, height: 16, borderRadius: 999 }} />
                </div>
                <div className="ds-row" style={{ gap: 'var(--space-3)', alignItems: 'center' }}>
                  <span className="ds-skeleton ds-skeleton--circle" style={{ width: 24, height: 24 }} />
                  <span className="ds-skeleton ds-skeleton--title" style={{ flex: 1, height: 24 }} />
                </div>
                <div className="ds-row" style={{ gap: 'var(--space-2)' }}>
                  {[0, 1, 2, 3].map((i) => (
                    <span key={i} className="ds-skeleton ds-skeleton--circle ds-skeleton--still" style={{ width: 8, height: 8 }} />
                  ))}
                  <span className="ds-skeleton ds-skeleton--text" style={{ flex: 1, marginLeft: 'var(--space-2)' }} />
                </div>
              </div>
            </div>
            <div className="ds-text-xs ds-subtle">
              Compositions match the eventual content's shape so swapping in real data doesn't shift the layout. Inert decorations (e.g. lifecycle dots) use <code>--still</code> to keep one focal point of motion per row.
            </div>
          </div>

          {/* Skeleton table */}
          <div className="ds-stack ds-stack-3">
            <div className="ds-label">skeleton · table</div>
            <table className="ds-table">
              <thead>
                <tr>
                  <th>operator</th>
                  <th style={{ textAlign: 'right' }}>stake</th>
                  <th style={{ textAlign: 'right' }}>commission</th>
                  <th>status</th>
                </tr>
              </thead>
              <tbody>
                {[0, 1, 2].map((i) => (
                  <tr key={i}>
                    <td>
                      <div className="ds-row" style={{ gap: 'var(--space-2)', alignItems: 'center' }}>
                        <span className="ds-skeleton ds-skeleton--circle" style={{ width: 20, height: 20 }} />
                        <span className="ds-skeleton ds-skeleton--text" style={{ width: 140 }} />
                      </div>
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <span className="ds-skeleton ds-skeleton--text" style={{ width: 80, marginLeft: 'auto' }} />
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <span className="ds-skeleton ds-skeleton--text" style={{ width: 48, marginLeft: 'auto' }} />
                    </td>
                    <td>
                      <span className="ds-skeleton ds-skeleton--still" style={{ width: 56, height: 16, borderRadius: 999 }} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Spinners */}
          <div className="ds-stack ds-stack-3">
            <div className="ds-label">spinner · sizes</div>
            <div className="ds-row" style={{ gap: 'var(--space-6)', alignItems: 'center' }}>
              <div className="ds-row" style={{ gap: 'var(--space-2)', alignItems: 'center' }}>
                <span className="ds-spinner ds-spinner--xs" />
                <span className="ds-text-xs ds-subtle">xs</span>
              </div>
              <div className="ds-row" style={{ gap: 'var(--space-2)', alignItems: 'center' }}>
                <span className="ds-spinner ds-spinner--sm" />
                <span className="ds-text-xs ds-subtle">sm · default</span>
              </div>
              <div className="ds-row" style={{ gap: 'var(--space-2)', alignItems: 'center' }}>
                <span className="ds-spinner ds-spinner--md" />
                <span className="ds-text-xs ds-subtle">md</span>
              </div>
              <div className="ds-row" style={{ gap: 'var(--space-2)', alignItems: 'center' }}>
                <span className="ds-spinner ds-spinner--lg" />
                <span className="ds-text-xs ds-subtle">lg</span>
              </div>
              <div className="ds-row" style={{ gap: 'var(--space-2)', alignItems: 'center' }}>
                <span className="ds-spinner ds-spinner--xl" />
                <span className="ds-text-xs ds-subtle">xl</span>
              </div>
              <div className="ds-row" style={{ gap: 'var(--space-2)', alignItems: 'center' }}>
                <span className="ds-spinner ds-spinner--md ds-spinner--muted" />
                <span className="ds-text-xs ds-subtle">muted</span>
              </div>
            </div>
            <div className="ds-text-xs ds-subtle">
              Inline transactional copy uses <code>sm</code>; full-card or page loads use <code>lg</code>/<code>xl</code>. The muted tone reads as ambient background work, not a foreground action.
            </div>
          </div>

          {/* Loading dots */}
          <div className="ds-stack ds-stack-3">
            <div className="ds-label">loading dots · inline</div>
            <div className="ds-stack ds-stack-2 ds-text-sm">
              <div>
                Resolving operator metadata
                <span className="ds-loading-dots" style={{ marginLeft: 4 }}>
                  <span /><span /><span />
                </span>
              </div>
              <div className="ds-subtle">
                Verifying content hash
                <span className="ds-loading-dots" style={{ marginLeft: 4 }}>
                  <span /><span /><span />
                </span>
              </div>
              <div className="ds-text-xs ds-subtle">
                Use when a spinner would over-promise progress — for tasks where you can't predict completion.
              </div>
            </div>
          </div>

          {/* Loading overlay */}
          <div className="ds-stack ds-stack-3">
            <div className="ds-label">loading overlay · refresh and first-load</div>
            <div className="ds-grid-2">
              <div className="ds-card ds-stack ds-stack-3 ds-loading-overlay-host">
                <div className="ds-row" style={{ justifyContent: 'space-between', alignItems: 'baseline' }}>
                  <div className="ds-label">total assets</div>
                  <span className="ds-text-xs ds-subtle">refreshing</span>
                </div>
                <div className="ds-stat-value">
                  <TokenAmount amount={parseEther('1247.32')} decimals={18} symbol="ETH" />
                </div>
                <div className="ds-stat-delta ds-stat-delta--positive ds-text-xs">+0.42% · 24h</div>
                <div className="ds-loading-overlay">
                  <span className="ds-spinner ds-spinner--md ds-spinner--muted" />
                  <span>refreshing…</span>
                </div>
              </div>
              <div className="ds-card ds-stack ds-stack-3 ds-loading-overlay-host" style={{ minHeight: 140 }}>
                <div className="ds-label">operators</div>
                <div className="ds-loading-overlay ds-loading-overlay--solid">
                  <span className="ds-spinner ds-spinner--md" />
                  <span>loading operators</span>
                </div>
              </div>
            </div>
            <div className="ds-text-xs ds-subtle">
              Refresh-style overlay tints the panel so the previous value is still partially legible — important for figures that update frequently (TVL, share price). The solid variant fully masks the panel for first-load cases where there's no prior value worth preserving.
            </div>
          </div>

          {/* Indeterminate progress */}
          <div className="ds-stack ds-stack-3">
            <div className="ds-label">indeterminate progress · top sliver</div>
            <div className="ds-card ds-stack ds-stack-3" style={{ padding: 0, overflow: 'hidden' }}>
              <div className="ds-progress">
                <div className="ds-progress-bar ds-progress-bar--indeterminate" />
              </div>
              <div className="ds-stack ds-stack-2" style={{ padding: 'var(--space-4)' }}>
                <div className="ds-label">commitments</div>
                <div className="ds-text-sm ds-subtle">syncing latest events from chain…</div>
              </div>
            </div>
            <div className="ds-card ds-stack ds-stack-3" style={{ padding: 0, overflow: 'hidden' }}>
              <div className="ds-progress">
                <div className="ds-progress-bar" style={{ width: '62%' }} />
              </div>
              <div className="ds-stack ds-stack-2" style={{ padding: 'var(--space-4)' }}>
                <div className="ds-label">deploying service manager</div>
                <div className="ds-text-sm ds-subtle">step 5 of 8 · waiting for confirmations</div>
              </div>
            </div>
            <div className="ds-text-xs ds-subtle">
              Indeterminate animates left-to-right when total work is unknown. Determinate uses an inline width for known progress (multi-step deploys, batched indexing).
            </div>
          </div>
          <SourceBlock label="example" source={SRC_LOADING} />
        </section>

        {/* Motion */}
        <section className="ds-stack ds-stack-8">
          <SectionHeading
            id="motion"
            title="Motion"
            lead="The system is mostly static — fast (120ms) feedback on interaction, no decorative motion in the app shell. Pages that need to teach (the landing route at /, future onboarding) reach for framer-motion through the components/ui barrel. Three patterns cover everything we ship: fade-in-on-scroll, staggered list, ambient loop. All three respect useReducedMotion."
          />

          <MotionShowcase />

          <div className="ds-stack ds-stack-3">
            <div className="ds-label">contract</div>
            <ul className="ds-text-sm ds-stack ds-stack-2" style={{ paddingLeft: 'var(--space-4)' }}>
              <li>
                Import <code>motion</code>, <code>useReducedMotion</code>, <code>useInView</code> from
                <code> ../components/ui</code> — never deep-import from
                <code> framer-motion</code> directly.
              </li>
              <li>
                Always read <code>useReducedMotion()</code>. When true, omit <code>animate</code>/<code>transition</code> props or set them to <code>false</code> — never paper over with shorter durations.
              </li>
              <li>
                Use <code>useInView(ref, &#123; once: true, margin: '-15%' &#125;)</code> for scroll triggers so motion is single-shot, not retriggered on re-entry.
              </li>
              <li>
                Default ease <code>[0.2, 0.7, 0.2, 1]</code> at 0.45–0.65s for entrances. Looped ambients use <code>'easeInOut'</code> at 1.6–2.4s.
              </li>
            </ul>
          </div>

          <div className="ds-text-xs ds-subtle">
            See <Link to="/">the landing page</Link> for the live composition — hero entrance, two scroll-revealed concept sections, staggered application grid, and the ambient share-field behind the headline.
          </div>

          <SourceBlock label="example" source={SRC_MOTION} />
        </section>

        {/* Notifications */}
        <section className="ds-stack ds-stack-8">
          <SectionHeading
            id="notifications"
            title="Notifications & Errors"
            lead="Four surfaces for surfacing state changes, ordered by weight: inline field errors for input validation, Notice for panel-level state, Toast for transient confirmations, ErrorBlock for technical errors that deserve a copy button. They share the same icon · title · message · actions vocabulary so the brain learns one shape regardless of which surface raises."
          />
          <NotificationsShowcase />
          <SourceBlock label="example" source={SRC_NOTIFICATIONS} />
        </section>

        {/* Empty */}
        <section className="ds-stack ds-stack-8">
          <SectionHeading
            id="empty"
            title="Empty States"
            lead="A blank surface is a question — what should I see, and why don't I see it? Each variant answers it: no data yet, filtered out, failed to load, not connected. Always pair with a single primary action that resolves the state."
          />

          <div className="ds-grid-2">
            {/* Default — no data yet */}
            <div className="ds-empty">
              <span className="ds-empty-icon" aria-hidden>◌</span>
              <h3>No commitments yet</h3>
              <p className="ds-text-sm">When you create or accept an agreement, it will appear here.</p>
              <button className="ds-btn ds-btn--sm ds-btn--primary" style={{ marginTop: 'var(--space-2)' }}>Create commitment</button>
            </div>

            {/* Filtered — search/filter returned nothing */}
            <div className="ds-empty">
              <span className="ds-empty-icon" aria-hidden>⌕</span>
              <h3>No matches</h3>
              <p className="ds-text-sm">No operators match the active filter. Try widening the stake range or clearing the status filter.</p>
              <button className="ds-btn ds-btn--sm" style={{ marginTop: 'var(--space-2)' }}>Clear filters</button>
            </div>

            {/* Error — load failed */}
            <div className="ds-empty ds-empty--error">
              <span className="ds-empty-icon" aria-hidden>!</span>
              <h3>Couldn't load operators</h3>
              <p className="ds-text-sm">RPC request failed. The node may be syncing or rate-limited.</p>
              <div className="ds-row" style={{ gap: 'var(--space-2)', marginTop: 'var(--space-2)' }}>
                <button className="ds-btn ds-btn--sm ds-btn--primary">Retry</button>
                <button className="ds-btn ds-btn--sm">Switch RPC</button>
              </div>
            </div>

            {/* Disconnected — wallet/account required */}
            <div className="ds-empty ds-empty--info">
              <span className="ds-empty-icon" aria-hidden>⌒</span>
              <h3>Connect to view your stake</h3>
              <p className="ds-text-sm">Your commitments and operator delegations are scoped to the connected address.</p>
              <button className="ds-btn ds-btn--sm ds-btn--primary" style={{ marginTop: 'var(--space-2)' }}>Connect wallet</button>
            </div>
          </div>

          {/* Inline empty — fits inside an existing card */}
          <div className="ds-stack ds-stack-3">
            <div className="ds-label">inline · within a card</div>
            <div className="ds-card ds-stack ds-stack-3">
              <div className="ds-row" style={{ justifyContent: 'space-between', alignItems: 'baseline' }}>
                <div className="ds-label">recent activity</div>
                <span className="ds-text-xs ds-subtle">last 24h</span>
              </div>
              <div className="ds-empty ds-empty--inline ds-empty--compact">
                <h3 className="ds-text-base">Nothing in the last 24 hours</h3>
                <p className="ds-text-sm">New commitments, forfeites, and releases will surface here.</p>
              </div>
            </div>
            <div className="ds-text-xs ds-subtle">
              The inline variant tightens padding and switches to a solid border so the empty state nests inside an existing surface without competing with the parent card's chrome.
            </div>
          </div>
          <SourceBlock label="example" source={SRC_EMPTY} />
        </section>

        {/* Disclosure */}
        <section className="ds-stack ds-stack-6">
          <SectionHeading
            id="disclosure"
            title="Disclosure"
            lead="A minimal text trigger that toggles a child block. Use for secondary detail that would crowd the surface if always visible — APY breakdowns, advanced parameters, fine-print fee schedules."
          />
          <DisclosureDemo />
          <SourceBlock label="example" source={SRC_DISCLOSURE} />
        </section>

        {/* Tooltip */}
        <section className="ds-stack ds-stack-6">
          <SectionHeading
            id="tooltip"
            title="Tooltip"
            lead="Inline hover/focus hint for defining a term in place. Children is the trigger, content is the 1–2 sentence body — reach for Disclosure or Notice for anything longer. Opens on hover and keyboard focus, dismisses on blur or Escape, works on touch, and honors prefers-reduced-motion. No protocol knowledge lives inside it; the glossary is passed in by the caller."
          />
          <TooltipDemo />
          <SourceBlock label="example" source={SRC_TOOLTIP} />
        </section>

        {/* Overlays */}
        <section className="ds-stack ds-stack-6">
          <SectionHeading
            id="overlays"
            title="Overlays"
            lead="Modal for centered confirmations; Drawer for multi-screen flows that should keep the underlying page in context. Both portal under <body>, trap focus, dismiss on Escape, and lock page scroll while open."
          />
          <OverlaysDemo />
          <SourceBlock label="example" source={SRC_OVERLAYS} />
        </section>

        {/* Governance */}
        <section className="ds-stack ds-stack-6">
          <SectionHeading
            id="governance"
            title="Governance"
            lead="DAO proposal lifecycle primitives. ProposalStateBadge mirrors OZ Governor's eight-state machine; ProposalKindBadge distinguishes the four powers (weight update, forfeit arbitration, treasury, signaling). VoteTallyBar composes AllocationBar; QuorumMeter composes CapacityMeter. ProposalTimeline composes LifecycleStepper."
          />
          <GovernanceDemo />
        </section>

        {/* Dev Tools */}
        <section className="ds-stack ds-stack-6">
          <SectionHeading
            id="dev-tools"
            title="Dev Tools"
            lead="Anvil-only primitives that drive the /admin page — actor switcher (presets from the standard test mnemonic) and time controls (1d / 14d / 90d windows plus free-form advance, mine, and warp-to). These compose into a sticky header on /admin so a developer can take the protocol through every state without leaving the browser."
          />
          <DevToolsDemo />
        </section>

        {/* Footer */}
        <footer className="ds-stack ds-stack-2" style={{ paddingTop: 'var(--space-6)', borderTop: '1px solid var(--border)' }}>
          <div className="ds-text-xs ds-subtle">
            Iterating on /design. Tokens live in <code>src/styles/tokens.css</code>; this page lives in <code>src/pages/Design.tsx</code>.
          </div>
        </footer>

          </div>
          {/* Sticky TOC at >=1024px (display rule lives in tokens.css media query) */}
          <DocsToc />
        </div>

      </div>
    </div>
  )
}
