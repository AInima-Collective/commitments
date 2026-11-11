import { parseEther } from 'viem'
import {
  SourceBlock,
  StatBlock,
  TokenAmount,
} from '../../components/ui'
import { SectionHeading } from './SectionHeading'

function StatsRow() {
  return (
    <div className="ds-stack ds-stack-4">
      <div className="ds-text-sm ds-subtle" style={{ maxWidth: '70ch' }}>
        Use the <code>&lt;StatBlock&gt;</code> primitive for headline metrics.
        It composes <code>.ds-stat / .ds-stat-value / .ds-stat-label</code> and
        forwards an optional meta caption + tone (<code>success</code>,
        <code>danger</code>, <code>accent</code>). The raw markup below the
        component row is the underlying HTML for slightly richer compositions
        (e.g. delta indicators), but most pages should reach for the component.
      </div>
      <div className="ds-stat-grid">
        <StatBlock
          label="TVL"
          value={<TokenAmount amount={parseEther('1247.328573')} decimals={18} symbol="ETH" compact />}
          meta="↑ 4.2% / 7d"
          tone="success"
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
          <span className="ds-stat-delta ds-stat-delta--success">↑ 4.2% / 7d</span>
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

const SRC_STATS =
  `<StatBlock
  label="TVL"
  value={<TokenAmount amount={parseEther('1247.32')} decimals={18} symbol="ETH" compact />}
  meta="↑ 4.2% / 7d"
  tone="success"
/>`

export function StatsSection() {
  return (
    <section className="ds-stack ds-stack-6">
      <SectionHeading
        id="stats"
        title="Stat Blocks"
        lead="Numbers on monospace, label uppercase-tracked, optional meta line below for delta or qualifier."
      />
      <StatsRow />
      <SourceBlock label="example" source={SRC_STATS} />
    </section>
  )
}
