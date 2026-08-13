import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { parseEther } from 'viem'
import {
  AddressDisplay,
  Button,
  DataTable,
  Disclosure,
  FilterBar,
  OperatorAvatar,
  SourceBlock,
  StatBlock,
  ThemeToggle,
  TokenAmount,
  ViewToggle,
  type DataTableColumn,
  type DataTableSort,
} from '../components/ui'
import {
  CommitmentStatusBadge,
  OperatorIdentity,
  OperatorStatusBadge,
  PortfolioHero,
} from '../components/protocol'
import { formatDuration, formatPercent } from '../lib/format'

/**
 * /design/recipes — Phase 28-03 (LCK-03).
 *
 * Four protocol-shaped compositions of the design-system primitives, each
 * rendered alongside its JSX source via {@link SourceBlock}. The page is the
 * canonical "copy this to bootstrap a new feature" reference; it does NOT
 * mount the wagmi-aware row components (e.g. `CommitmentRow`, `ProposalCard`)
 * because those embed write-tx hooks and indexer fetches that would
 * misbehave in a static documentation surface. Instead, recipes compose the
 * underlying primitives in the same shape — the contract surface a developer
 * would assemble themselves.
 *
 * Layout: a two-column .ds-docs-grid puts the rendered example on the left
 * and the source on the right at >=1024px; stacks vertically on mobile.
 */

// ─── Mock domain data ─────────────────────────────────────────────────────
const MOCK_DEPOSITOR = '0xC4f7000000000000000000000000000000003Ab9' as const
const MOCK_COUNTERPARTY = '0x742d35Cc6634C0532925a3b844Bc454e4438f44e' as const
const MOCK_ARBITER = '0xab5801a7d398351b8be11c439e05c5b3259aec9b' as const
const MOCK_OPERATOR_A = '0x4838B106FCe9647Bdf1E7877BF73cE8B0BAD5f97' as const

const MOCK_COMMITMENT = {
  id: 42n,
  amount: parseEther('12.4057'),
  maxPenaltyBps: 5000,
  yieldShareBps: 1000,
  status: 'FORFEIT_PENDING' as const,
  createdAtIso: '2026-04-12',
  challengeWindowSecondsRemaining: 3600 * 6 + 1280, // ~6h 21m
}

const MOCK_PROPOSAL = {
  proposerAmount: parseEther('5'),
  acceptorAmount: parseEther('2500'),
  maxPenaltyBps: 5000,
  challengeWindow: 3600 * 24, // 1 day
  expiresInSecs: 3600 * 18, // 18h until proposal-window expiry
}

// ─── Inline source snippets ───────────────────────────────────────────────
const SRC_RECIPE_COMMITMENT_ROW =
  `<div className="commitment-row" role="button" aria-expanded={isExpanded}>
  <div className="commitment-col-id">#{commitment.id.toString()}</div>
  <div className="commitment-col">
    <AddressDisplay address={commitment.arbiter} />
  </div>
  <div className="commitment-col">
    <AddressDisplay address={commitment.counterparty} />
  </div>
  <div className="commitment-col-amount">
    <TokenAmount amount={commitment.amount} decimals={18} symbol="shares" />
  </div>
  <div className="commitment-col-penalty">{formatPercent(commitment.maxPenaltyBps)}</div>
  <div className="commitment-col-status">
    <CommitmentStatusBadge status={commitment.status} />
  </div>
  <div className="commitment-col-created">{createdDate}</div>
</div>`

const SRC_RECIPE_OPERATOR_CARD =
  `<div className="ds-operator-card">
  <div className="ds-operator-card-header">
    <OperatorIdentity
      address={op.address}
      name={profileName}
      size="lg"
      badge={<OperatorStatusBadge status={op.status} />}
    />
  </div>
  <div className="ds-grid-3" style={{ marginTop: 'var(--space-3)' }}>
    <StatBlock label="SELF STAKE" value={
      <TokenAmount amount={op.selfStake} decimals={18} symbol="ETH" size="inline" />
    } />
    <StatBlock label="DELEGATED" value={
      <TokenAmount amount={op.totalDelegatedStake} decimals={18} symbol="ETH" compact size="inline" />
    } />
    <StatBlock label="DELEGATIONS" value={op.activeDelegationCount.toString()} />
  </div>
</div>`

const SRC_RECIPE_FORFEIT_PREVIEW =
  `<div className="ds-card">
  <div className="ds-stat-grid">
    <StatBlock label="STATE" value={<CommitmentStatusBadge status="FORFEIT_PENDING" />} />
    <StatBlock label="FORFEIT EXECUTION DELAY" value={formatDuration(remainingSecs)} />
    <StatBlock label="PROPOSER" value={<AddressDisplay address={proposer} />} />
    <StatBlock label="SUBJECT" value={<AddressDisplay address={subject} />} />
  </div>
  <div className="ds-stat-grid" style={{ marginTop: 'var(--space-3)' }}>
    <StatBlock label="PENALTY" value={formatPercent(penaltyBps)} />
    <StatBlock label="INITIATED" value={initiatedAt} />
  </div>
</div>`

const SRC_RECIPE_PROPOSAL_CARD =
  `<article className="ds-decision-row" aria-label={\`Agreement proposal from \${otherParty}\`}>
  <header className="ds-decision-row-actor">
    <OperatorAvatar address={otherParty} size="sm" />
    <span className="ds-decision-row-actor-name">
      FROM: <AddressDisplay address={otherParty} />
    </span>
    <CommitmentStatusBadge status="PROPOSED" />
  </header>
  <div className="ds-decision-row-body">
    <span className="ds-decision-row-title">Incoming agreement proposal</span>
    <span className="ds-decision-row-meta">
      EXPIRES IN {formatDuration(remainingSecs)} ·
      YOU: <TokenAmount amount={myAmount} decimals={18} symbol="shares" size="inline" /> ·
      THEM: <TokenAmount amount={theirAmount} decimals={18} symbol="shares" size="inline" /> ·
      MAX PENALTY {formatPercent(proposal.maxPenaltyBps)} ·
      CHALLENGE {formatDuration(Number(proposal.challengeWindow))}
    </span>
  </div>
  <div className="ds-decision-row-actions">
    <button type="button" className="ds-btn ds-btn--primary">ACCEPT</button>
    <button type="button" className="ds-btn">REJECT</button>
  </div>
</article>`

const SRC_RECIPE_UNIFIED_LIST =
  `// Page state. View, filters, and sort are all controlled here so the
// graph view (when toggled) reads the same filter state.
const [view, setView] = useState<'table' | 'graph'>('table')
const [direction, setDirection] = useState('all')
const [statuses, setStatuses] = useState<string[]>([])
const [counterparty, setCounterparty] = useState('')
const [sort, setSort] = useState<DataTableSort>({ columnId: 'id', direction: 'desc' })

// Pre-filter and pre-sort the rows. The table never mutates input data.
const filtered = useMemo(() => applyFilters(rows, { direction, statuses, counterparty }), [rows, direction, statuses, counterparty])
const sorted   = useMemo(() => applySort(filtered, sort), [filtered, sort])

return (
  <div className="ds-stack ds-stack-4">
    <div className="ds-row" style={{ justifyContent: 'space-between' }}>
      <h2>Commitments</h2>
      <ViewToggle
        aria-label="commitments view"
        value={view}
        onChange={(v) => setView(v as 'table' | 'graph')}
        options={[{ id: 'table', label: 'table' }, { id: 'graph', label: 'graph' }]}
      />
    </div>

    <FilterBar
      label="filter"
      onClearAll={() => { setDirection('all'); setStatuses([]); setCounterparty('') }}
    >
      <FilterBar.Select label="direction" value={direction} onChange={setDirection} options={…} />
      <FilterBar.Multi  label="status"    value={statuses}  onChange={setStatuses}  options={…} />
      <FilterBar.Search label="counterparty" value={counterparty} onChange={setCounterparty} placeholder="0x… or name" />
    </FilterBar>

    {view === 'table' ? (
      <DataTable
        aria-label="commitments"
        columns={commitmentColumns}
        rows={sorted}
        getRowKey={(r) => r.id}
        sort={sort}
        onSortChange={setSort}
        rowTone={(r) => (r.status === 'forfeit-pending' ? 'warn' : r.status === 'forfeited' ? 'danger' : undefined)}
        onRowClick={(r) => openDetail(r)}
      />
    ) : (
      <CommitmentsGraph payload={sorted} />
    )}
  </div>
)`

// ─── TOC ──────────────────────────────────────────────────────────────────
const TOC_RECIPES: Array<{ id: string; label: string }> = [
  { id: 'recipe-portfolio-hero', label: 'Portfolio hero' },
  { id: 'recipe-claimable-yield', label: 'Claimable yield table' },
  { id: 'recipe-commitment-row', label: 'Commitment row' },
  { id: 'recipe-operator-card', label: 'Operator card' },
  { id: 'recipe-forfeit-preview', label: 'Forfeit preview' },
  { id: 'recipe-proposal-card', label: 'Agreement proposal' },
  { id: 'recipe-unified-list', label: 'Unified list (toggle + filter + table)' },
]

function RecipesToc() {
  return (
    <aside className="ds-docs-toc" aria-label="Recipes">
      <div className="ds-docs-toc-label">recipes</div>
      {TOC_RECIPES.map((s) => (
        <a key={s.id} href={`#${s.id}`}>{s.label}</a>
      ))}
      <div className="ds-docs-toc-label" style={{ marginTop: 'var(--space-4)' }}>more</div>
      <Link to="/app/design" style={{ color: 'var(--accent)' }}>← Primitives</Link>
    </aside>
  )
}

function RecipesTocMobile() {
  return (
    <details className="ds-docs-toc-mobile">
      <summary>recipes · {TOC_RECIPES.length} compositions</summary>
      <div className="ds-stack ds-stack-1">
        {TOC_RECIPES.map((s) => (
          <a key={s.id} href={`#${s.id}`}>{s.label}</a>
        ))}
        <Link to="/app/design" style={{ color: 'var(--accent)' }}>← Primitives</Link>
      </div>
    </details>
  )
}

// ─── Recipe — Portfolio hero ──────────────────────────────────────────────
const SRC_RECIPE_PORTFOLIO_HERO =
  `<PortfolioHero
  eyebrow="your portfolio"
  totalUsd={portfolioUsd.total}        // bigint (6 decimals) | null
  freeUsd={portfolioUsd.free}
  encumberedUsd={portfolioUsd.encumbered}
  claimableUsd={claimableUsd}          // strategy yield + underwriting premium
  lossesUsd={lossesUsd}                // accrued mutual markdown
  primaryAction={<Link to="/app/vaults" className="ds-btn ds-btn--sm">Deposit →</Link>}
  claimAllAction={{
    label: 'Claim yield',
    onClick: () => runClaimAllQueue(claimableEntries),
    progress: queueProgress, // null when idle, { current, total } when running
  }}
/>`

function parseUnitsMock(integer: string, decimals: number): bigint {
  // Lightweight static helper for the recipe — full impl lives in viem/utils.
  const [int, frac = ''] = integer.split('.')
  const padded = (frac + '0'.repeat(decimals)).slice(0, decimals)
  return BigInt(int + padded)
}

function RecipePortfolioHero() {
  return (
    <PortfolioHero
      eyebrow="your portfolio"
      totalUsd={parseUnitsMock('48531.42', 6)}
      freeUsd={parseUnitsMock('12203.18', 6)}
      encumberedUsd={parseUnitsMock('36328.24', 6)}
      claimableUsd={parseUnitsMock('318.59', 6)}
      lossesUsd={parseUnitsMock('72.10', 6)}
      primaryAction={
        <button type="button" className="ds-btn ds-btn--sm" onClick={() => undefined}>
          Deposit →
        </button>
      }
      claimAllAction={{
        label: 'Claim yield',
        onClick: () => undefined,
        progress: null,
      }}
    />
  )
}

// ─── Recipe — Claimable yield table ───────────────────────────────────────
type MockYieldRow = { commitmentId: bigint; depositor: `0x${string}`; amount: bigint }
const MOCK_YIELD_ROWS: MockYieldRow[] = [
  { commitmentId: 42n, depositor: MOCK_DEPOSITOR, amount: parseUnitsMock('128.41', 6) },
  { commitmentId: 39n, depositor: MOCK_COUNTERPARTY, amount: parseUnitsMock('57.18', 6) },
  { commitmentId: 24n, depositor: MOCK_OPERATOR_A, amount: parseUnitsMock('18.93', 6) },
]

const SRC_RECIPE_CLAIMABLE_YIELD =
  `<Disclosure
  defaultOpen
  label={
    <>Claimable yield <span className="ds-subtle">· {entries.length} rows · </span>
      <TokenAmount amount={total} decimals={18} symbol="shares" size="inline" compact />
    </>
  }
>
  <DataTable
    aria-label="Claimable yield"
    columns={[
      { id: 'depositor',  header: 'depositor',
        render: (r) => <AddressDisplay address={r.depositor} compact /> },
      { id: 'commitment', header: 'commitment', width: '108px',
        render: (r) => <Link to={\`/app/commitments/\${r.commitmentId}\`} className="ds-mono-num">
          #{r.commitmentId.toString()}
        </Link> },
      { id: 'claimable',  header: 'claimable', align: 'right', sortable: true,
        render: (r) => <TokenAmount amount={r.amount} decimals={18} symbol="shares" /> },
      { id: 'action',     header: '', align: 'right', width: '120px',
        render: (r) => <ClaimYieldButton commitmentId={r.commitmentId} … /> },
    ]}
    rows={entries}
    getRowKey={(r) => r.commitmentId.toString()}
    defaultSort={{ columnId: 'claimable', direction: 'desc' }}
  />
</Disclosure>`

function RecipeClaimableYield() {
  const total = MOCK_YIELD_ROWS.reduce((acc, r) => acc + r.amount, 0n)
  const columns: DataTableColumn<MockYieldRow>[] = [
    {
      id: 'depositor',
      header: 'depositor',
      render: (r) => <AddressDisplay address={r.depositor} compact />,
    },
    {
      id: 'commitment',
      header: 'commitment',
      width: '108px',
      render: (r) => (
        <span className="ds-mono-num" style={{ color: 'var(--text-muted)' }}>
          #{r.commitmentId.toString()}
        </span>
      ),
    },
    {
      id: 'claimable',
      header: 'claimable',
      align: 'right',
      sortable: true,
      render: (r) => <TokenAmount amount={r.amount} decimals={6} symbol="USDC" />,
    },
    {
      id: 'action',
      header: '',
      align: 'right',
      width: '120px',
      render: () => (
        <Button size="sm" variant="primary" onClick={() => undefined}>
          CLAIM
        </Button>
      ),
    },
  ]
  return (
    <Disclosure
      defaultOpen
      label={
        <span>
          Claimable yield{' '}
          <span className="ds-subtle">
            · {MOCK_YIELD_ROWS.length} rows ·{' '}
          </span>
          <TokenAmount amount={total} decimals={6} symbol="USDC" size="inline" compact />
        </span>
      }
    >
      <DataTable
        aria-label="Claimable yield"
        columns={columns}
        rows={MOCK_YIELD_ROWS}
        getRowKey={(r) => r.commitmentId.toString()}
        defaultSort={{ columnId: 'claimable', direction: 'desc' }}
      />
    </Disclosure>
  )
}

// ─── Recipe 1 — canonical commitment row ──────────────────────────────────
function RecipeCommitmentRow() {
  const c = MOCK_COMMITMENT
  return (
    <div
      className="ds-card"
      style={{ display: 'grid', gridTemplateColumns: 'auto 1fr 1fr auto auto auto auto', gap: 'var(--space-3)', alignItems: 'center' }}
    >
      <span className="ds-mono-num ds-muted">#{c.id.toString()}</span>
      <span className="ds-stack ds-stack-1">
        <span className="ds-text-xs ds-subtle">arbiter</span>
        <AddressDisplay address={MOCK_ARBITER} />
      </span>
      <span className="ds-stack ds-stack-1">
        <span className="ds-text-xs ds-subtle">counterparty</span>
        <AddressDisplay address={MOCK_COUNTERPARTY} />
      </span>
      <TokenAmount amount={c.amount} decimals={18} symbol="shares" size="inline" />
      <span className="ds-mono-num">{formatPercent(c.maxPenaltyBps)}</span>
      <CommitmentStatusBadge status={c.status} />
      <span className="ds-text-xs ds-subtle">{c.createdAtIso}</span>
    </div>
  )
}

// ─── Recipe 2 — operator card ─────────────────────────────────────────────
function RecipeOperatorCard() {
  return (
    <div className="ds-operator-card">
      <div className="ds-operator-card-header">
        <OperatorIdentity
          address={MOCK_DEPOSITOR}
          name="Pellar Labs"
          size="lg"
          badge={<OperatorStatusBadge status="ACTIVE" />}
        />
      </div>
      <div className="ds-grid-3" style={{ marginTop: 'var(--space-3)' }}>
        <StatBlock
          label="SELF STAKE"
          value={<TokenAmount amount={parseEther('32')} decimals={18} symbol="ETH" size="inline" />}
        />
        <StatBlock
          label="DELEGATED"
          value={<TokenAmount amount={parseEther('1247.328')} decimals={18} symbol="ETH" compact size="inline" />}
        />
        <StatBlock label="DELEGATIONS" value="87" />
      </div>
    </div>
  )
}

// ─── Recipe 3 — forfeit preview ─────────────────────────────────────────────
function RecipeForfeitPreview() {
  const remainingSecs = MOCK_COMMITMENT.challengeWindowSecondsRemaining
  return (
    <div className="ds-card">
      <div className="ds-stat-grid">
        <StatBlock label="STATE" value={<CommitmentStatusBadge status="FORFEIT_PENDING" />} />
        <StatBlock label="FORFEIT EXECUTION DELAY" value={formatDuration(remainingSecs)} />
        <StatBlock label="PROPOSER" value={<AddressDisplay address={MOCK_ARBITER} />} />
        <StatBlock label="SUBJECT" value={<AddressDisplay address={MOCK_DEPOSITOR} />} />
      </div>
      <div className="ds-stat-grid" style={{ marginTop: 'var(--space-3)' }}>
        <StatBlock label="PENALTY" value={formatPercent(MOCK_COMMITMENT.maxPenaltyBps)} />
        <StatBlock label="INITIATED" value="2026-04-26 14:08" />
      </div>
    </div>
  )
}

// ─── Recipe 4 — agreement proposal card ────────────────────────────────
function RecipeProposalCard() {
  const p = MOCK_PROPOSAL
  return (
    <article
      className="ds-decision-row"
      aria-label={`Agreement proposal from ${MOCK_OPERATOR_A}`}
    >
      <header className="ds-decision-row-actor">
        <OperatorAvatar address={MOCK_OPERATOR_A} size="sm" />
        <span className="ds-decision-row-actor-name">
          {'FROM: '}
          <AddressDisplay address={MOCK_OPERATOR_A} />
        </span>
        <CommitmentStatusBadge status="PROPOSED" />
      </header>
      <div className="ds-decision-row-body">
        <span className="ds-decision-row-title">Incoming agreement proposal</span>
        <span className="ds-decision-row-meta">
          EXPIRES IN {formatDuration(p.expiresInSecs)}
          {' \u00b7 '}
          YOU:{' '}
          <TokenAmount amount={p.acceptorAmount} decimals={18} symbol="shares" size="inline" />
          {' \u00b7 '}
          THEM:{' '}
          <TokenAmount amount={p.proposerAmount} decimals={18} symbol="shares" size="inline" />
          {' \u00b7 '}
          MAX PENALTY {formatPercent(p.maxPenaltyBps)}
          {' \u00b7 '}
          CHALLENGE {formatDuration(p.challengeWindow)}
        </span>
      </div>
      <div className="ds-decision-row-actions">
        <button type="button" className="ds-btn ds-btn--primary">ACCEPT</button>
        <button type="button" className="ds-btn">REJECT</button>
      </div>
    </article>
  )
}

// ─── Recipe 5 — unified list (ViewToggle + FilterBar + DataTable) ─────────
type UnifiedRow = {
  id: string
  direction: '→' | '↔'
  counterparty: `0x${string}`
  amount: bigint
  status: 'active' | 'forfeit-pending' | 'released' | 'forfeited'
}

const UNIFIED_ROWS: UnifiedRow[] = [
  { id: '0042', direction: '↔', counterparty: MOCK_COUNTERPARTY,                                                      amount: parseEther('12.40'), status: 'forfeit-pending' },
  { id: '0041', direction: '→', counterparty: MOCK_OPERATOR_A,                                                        amount: parseEther('3.10'),  status: 'active' },
  { id: '0040', direction: '→', counterparty: MOCK_ARBITER,                                                           amount: parseEther('0.85'),  status: 'forfeited' },
  { id: '0039', direction: '↔', counterparty: '0x5F8D7C5a9d9C5b9D2b8c0Aa9c97D4ce9Be5C39E5' as `0x${string}`,            amount: parseEther('8.00'),  status: 'released' },
  { id: '0038', direction: '→', counterparty: '0x3b2C9b7D8E5fCAE0b1A2d8bF09C9D6e0E0c8F8A1B' as `0x${string}`,            amount: parseEther('1.20'),  status: 'active' },
]

function RecipeUnifiedList() {
  const [view, setView] = useState<'table' | 'graph'>('table')
  const [direction, setDirection] = useState('all')
  const [statuses, setStatuses] = useState<string[]>([])
  const [counterparty, setCounterparty] = useState('')
  const [sort, setSort] = useState<DataTableSort>({ columnId: 'id', direction: 'desc' })

  const filtered = useMemo(() => {
    return UNIFIED_ROWS.filter((r) => {
      if (direction !== 'all') {
        const wantPaired = direction === 'paired'
        if (wantPaired ? r.direction !== '↔' : r.direction !== '→') return false
      }
      if (statuses.length > 0 && !statuses.includes(r.status)) return false
      if (counterparty && !r.counterparty.toLowerCase().includes(counterparty.toLowerCase())) return false
      return true
    })
  }, [direction, statuses, counterparty])

  const sorted = useMemo(() => {
    const copy = [...filtered]
    copy.sort((a, b) => {
      const dir = sort.direction === 'asc' ? 1 : -1
      if (sort.columnId === 'id') return a.id.localeCompare(b.id) * dir
      if (sort.columnId === 'amount') return (a.amount < b.amount ? -1 : a.amount > b.amount ? 1 : 0) * dir
      return 0
    })
    return copy
  }, [filtered, sort])

  const columns: DataTableColumn<UnifiedRow>[] = [
    { id: 'direction', header: 'dir', render: (r) => <span style={{ color: 'var(--text-muted)' }}>{r.direction}</span>, width: '52px' },
    { id: 'id', header: 'id', render: (r) => <span className="ds-mono-num ds-muted">#{r.id}</span>, sortable: true, width: '80px' },
    { id: 'counterparty', header: 'counterparty', render: (r) => <AddressDisplay address={r.counterparty} /> },
    { id: 'amount', header: 'amount', render: (r) => <TokenAmount amount={r.amount} decimals={18} symbol="ETH" />, align: 'right', sortable: true },
    { id: 'status', header: 'status', render: (r) => <CommitmentStatusBadge status={
      r.status === 'active' ? 'ACTIVE'
      : r.status === 'forfeit-pending' ? 'FORFEIT_PENDING'
      : r.status === 'forfeited' ? 'FORFEITED'
      : 'RELEASED'
    } /> },
  ]

  return (
    <div className="ds-stack ds-stack-3">
      <div className="ds-row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
        <span className="ds-text-sm ds-muted">{filtered.length} of {UNIFIED_ROWS.length} commitments</span>
        <ViewToggle
          aria-label="commitments view"
          size="sm"
          value={view}
          onChange={(v) => setView(v as 'table' | 'graph')}
          options={[
            { id: 'table', label: 'table' },
            { id: 'graph', label: 'graph' },
          ]}
        />
      </div>
      <FilterBar
        size="sm"
        onClearAll={() => {
          setDirection('all')
          setStatuses([])
          setCounterparty('')
        }}
      >
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
      </FilterBar>
      {view === 'table' ? (
        <DataTable<UnifiedRow>
          aria-label="example commitments"
          columns={columns}
          rows={sorted}
          getRowKey={(r) => r.id}
          sort={sort}
          onSortChange={setSort}
          rowTone={(r) => (r.status === 'forfeit-pending' ? 'warn' : r.status === 'forfeited' ? 'danger' : undefined)}
          onRowClick={() => undefined}
        />
      ) : (
        <div className="ds-card" style={{ minHeight: 240, display: 'grid', placeItems: 'center', color: 'var(--text-subtle)' }}>
          graph view — would render <code>CommitmentsGraph</code> over the same filtered rows
        </div>
      )}
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────
export default function DesignRecipes() {
  return (
    <div className="ds-root" style={{ minHeight: '100vh', padding: 'var(--space-8) var(--space-8) var(--space-16)' }}>
      <div style={{ maxWidth: 1280, margin: '0 auto' }} className="ds-stack ds-stack-8">

        {/* Header */}
        <header className="ds-stack ds-stack-4" style={{ maxWidth: 960 }}>
          <div className="ds-row" style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div className="ds-stack ds-stack-2">
              <div className="ds-label">commitments / design / recipes</div>
              <h1>Design Recipes</h1>
              <p className="ds-muted ds-text-base" style={{ maxWidth: '60ch' }}>
                Protocol-shaped compositions of the design system primitives. Copy any
                recipe to bootstrap a new feature — the rendered output and the JSX
                source sit side-by-side at desktop widths.
              </p>
              <p className="ds-text-sm">
                <Link to="/app/design" style={{ color: 'var(--accent)' }}>← Back to primitives</Link>
              </p>
            </div>
            <ThemeToggle />
          </div>
          <hr className="ds-divider" />
        </header>

        {/* Mobile TOC */}
        <RecipesTocMobile />

        {/* Two-column shell: recipes + sticky TOC at >=1024px */}
        <div className="ds-docs-shell">
          <div className="ds-stack ds-stack-12" style={{ minWidth: 0 }}>

            {/* Recipe — Portfolio hero */}
            <section id="recipe-portfolio-hero" className="ds-stack ds-stack-4">
              <header className="ds-stack ds-stack-2">
                <h2>Portfolio hero</h2>
                <p className="ds-muted ds-text-sm" style={{ maxWidth: '70ch' }}>
                  Anchors the Dashboard. Display-sized total in the underlying asset
                  (USDC), four <code>StatBlock</code> tiles below for free /
                  encumbered / committed / claimable, and a right-aligned action
                  cluster — Deposit + Claim all (with sequential progress label
                  when running). Pages own aggregation; the hero is presentational.
                </p>
              </header>
              <RecipePortfolioHero />
              <SourceBlock label="source · jsx" source={SRC_RECIPE_PORTFOLIO_HERO} defaultExpanded />
              <div className="ds-text-xs ds-subtle">
                Uses primitives: <code>TokenAmount</code>, <code>StatBlock</code>,{' '}
                <code>Button</code>, <code>useClaimAllQueue</code>.
              </div>
            </section>

            {/* Recipe — Claimable yield table */}
            <section id="recipe-claimable-yield" className="ds-stack ds-stack-4">
              <header className="ds-stack ds-stack-2">
                <h2>Claimable yield table</h2>
                <p className="ds-muted ds-text-sm" style={{ maxWidth: '70ch' }}>
                  The Dashboard's yield-claim surface. <code>Disclosure</code>{' '}
                  wraps a <code>DataTable</code> so the section collapses when
                  there's nothing to do. Default sort is amount-desc; per-row
                  CLAIM opens a confirmation <code>Modal</code> (omitted here —
                  the recipe shows the row shape only).
                </p>
              </header>
              <RecipeClaimableYield />
              <SourceBlock label="source · jsx" source={SRC_RECIPE_CLAIMABLE_YIELD} defaultExpanded />
              <div className="ds-text-xs ds-subtle">
                Uses primitives: <code>Disclosure</code>, <code>DataTable</code>,{' '}
                <code>AddressDisplay</code>, <code>TokenAmount</code>, <code>Button</code>.
              </div>
            </section>

            {/* Recipe 1 — Commitment row */}
            <section id="recipe-commitment-row" className="ds-stack ds-stack-4">
              <header className="ds-stack ds-stack-2">
                <h2>Canonical commitment row</h2>
                <p className="ds-muted ds-text-sm" style={{ maxWidth: '70ch' }}>
                  The row shape used by commitment surfaces. Combines{' '}
                  <code>AddressDisplay</code>, <code>TokenAmount</code>, and{' '}
                  <code>CommitmentStatusBadge</code> in a single flex/grid line. ID
                  column is monospace-muted so eye finds the protocol primitive
                  status badge first.
                </p>
              </header>
              <div className="ds-docs-grid">
                <RecipeCommitmentRow />
                <SourceBlock label="source · jsx" source={SRC_RECIPE_COMMITMENT_ROW} defaultExpanded />
              </div>
              <div className="ds-text-xs ds-subtle">
                Uses primitives: <code>AddressDisplay</code>, <code>TokenAmount</code>,{' '}
                <code>CommitmentStatusBadge</code>, <code>formatPercent</code>.
              </div>
            </section>

            {/* Recipe 2 — Operator card */}
            <section id="recipe-operator-card" className="ds-stack ds-stack-4">
              <header className="ds-stack ds-stack-2">
                <h2>Operator card</h2>
                <p className="ds-muted ds-text-sm" style={{ maxWidth: '70ch' }}>
                  A self-contained operator summary for the Mesh page. Header is the
                  identity primitive plus the status badge; body is a 3-tile{' '}
                  <code>StatBlock</code> grid for self-stake / delegated / delegations.
                </p>
              </header>
              <div className="ds-docs-grid">
                <RecipeOperatorCard />
                <SourceBlock label="source · jsx" source={SRC_RECIPE_OPERATOR_CARD} defaultExpanded />
              </div>
              <div className="ds-text-xs ds-subtle">
                Uses primitives: <code>OperatorIdentity</code>, <code>OperatorStatusBadge</code>,{' '}
                <code>StatBlock</code>, <code>TokenAmount</code>.
              </div>
            </section>

            {/* Recipe 3 — Forfeit preview */}
            <section id="recipe-forfeit-preview" className="ds-stack ds-stack-4">
              <header className="ds-stack ds-stack-2">
                <h2>Forfeit preview</h2>
                <p className="ds-muted ds-text-sm" style={{ maxWidth: '70ch' }}>
                  The 4-tile + 2-tile <code>StatBlock</code> grid used inside{' '}
                  <code>ForfeitDetail</code>. State / forfeit-execution-delay countdown /
                  proposer / subject in the primary grid; penalty + initiated
                  timestamp below as supporting metadata.
                </p>
              </header>
              <div className="ds-docs-grid">
                <RecipeForfeitPreview />
                <SourceBlock label="source · jsx" source={SRC_RECIPE_FORFEIT_PREVIEW} defaultExpanded />
              </div>
              <div className="ds-text-xs ds-subtle">
                Uses primitives: <code>StatBlock</code>, <code>CommitmentStatusBadge</code>,{' '}
                <code>AddressDisplay</code>, <code>formatDuration</code>,{' '}
                <code>formatPercent</code>.
              </div>
            </section>

            {/* Recipe 4 — Agreement proposal card */}
            <section id="recipe-proposal-card" className="ds-stack ds-stack-4">
              <header className="ds-stack ds-stack-2">
                <h2>Agreement proposal card</h2>
                <p className="ds-muted ds-text-sm" style={{ maxWidth: '70ch' }}>
                  The decision-row shape for accept/reject flows on the Agreements
                  page. Actor + status header, three-line meta body with both-sides
                  amounts and policy values, primary/secondary action pair on the right.
                </p>
              </header>
              <div className="ds-docs-grid">
                <RecipeProposalCard />
                <SourceBlock label="source · jsx" source={SRC_RECIPE_PROPOSAL_CARD} defaultExpanded />
              </div>
              <div className="ds-text-xs ds-subtle">
                Uses primitives: <code>OperatorAvatar</code>, <code>AddressDisplay</code>,{' '}
                <code>CommitmentStatusBadge</code>, <code>TokenAmount</code>,{' '}
                <code>formatDuration</code>, <code>formatPercent</code>.
              </div>
            </section>

            {/* Recipe 5 — Unified list */}
            <section id="recipe-unified-list" className="ds-stack ds-stack-4">
              <header className="ds-stack ds-stack-2">
                <h2>Unified list — toggle + filter + table</h2>
                <p className="ds-muted ds-text-sm" style={{ maxWidth: '70ch' }}>
                  The canonical shape of a unified commitment list (§ 2 of the
                  restructure plan). The surface owns three pieces of state — view,
                  filters, sort — and each primitive consumes them in a controlled
                  fashion. Toggle to <code>graph</code> swaps the rendering surface
                  while filter + sort persist, so both views narrow to the same
                  rows. Row tone tints forfeit-pending warn / forfeited danger.
                </p>
              </header>
              <RecipeUnifiedList />
              <SourceBlock label="source · jsx" source={SRC_RECIPE_UNIFIED_LIST} defaultExpanded />
              <div className="ds-text-xs ds-subtle">
                Uses primitives: <code>ViewToggle</code>, <code>FilterBar</code>{' '}
                (with <code>.Select</code>, <code>.Multi</code>, <code>.Search</code>),{' '}
                <code>DataTable</code>, <code>CommitmentStatusBadge</code>,{' '}
                <code>AddressDisplay</code>, <code>TokenAmount</code>.
              </div>
            </section>

          </div>
          <RecipesToc />
        </div>

      </div>
    </div>
  )
}
