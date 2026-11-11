import { parseUnits } from 'viem'
import {
  MutualStatusBadge,
  PendingLossNotice,
  SharedLossGauge,
} from '../../components/protocol'
import { SectionHeading } from './SectionHeading'

export function MutualSection() {
  return (
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
  )
}
