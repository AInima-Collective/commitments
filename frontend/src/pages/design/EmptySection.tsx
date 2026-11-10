import {
  Button,
  EmptyState,
  SourceBlock,
} from '../../components/ui'
import { SectionHeading } from './SectionHeading'

const SRC_EMPTY =
  `<EmptyState
  glyph="⬡"
  title="No proposals"
  description="Agreements proposed to you or by you collect here until they are accepted or withdrawn."
  action={<Button variant="primary" size="sm">Propose agreement</Button>}
/>`

export function EmptySection() {
  return (
    <section className="ds-stack ds-stack-8">
      <SectionHeading
        id="empty"
        title="Empty States"
        lead="A blank surface is a question — what should I see, and why don't I see it? Each variant answers it: no data yet, filtered out, failed to load, not connected. Always pair with a single primary action that resolves the state."
      />

      <div className="ds-stack ds-stack-3">
        <div className="ds-label">EmptyState · lists and panels</div>
        <div className="ds-grid-2">
          <EmptyState
            glyph="⬡"
            title="No proposals"
            description="Agreements proposed to you or by you collect here until they are accepted or withdrawn."
            action={<Button variant="primary" size="sm">Propose agreement</Button>}
          />
          <EmptyState title="Nothing to claim" description="Yield accrues to your free balance as the vault earns." />
        </div>
      </div>

      {/* Raw .ds-empty markup: EmptyState has no tone or inline variant yet */}
      <div className="ds-stack ds-stack-3">
        <div className="ds-label">raw markup · tone and inline variants</div>
        <div className="ds-grid-2">
          {/* Default — no data yet */}
          <div className="ds-empty">
            <span className="ds-empty-icon" aria-hidden>◌</span>
            <h3>No commitments yet</h3>
            <p className="ds-text-sm">When you create or accept an agreement, it will appear here.</p>
            <Button variant="primary" size="sm" style={{ marginTop: 'var(--space-2)' }}>Create commitment</Button>
          </div>

          {/* Filtered — search/filter returned nothing */}
          <div className="ds-empty">
            <span className="ds-empty-icon" aria-hidden>⌕</span>
            <h3>No matches</h3>
            <p className="ds-text-sm">No operators match the active filter. Try widening the stake range or clearing the status filter.</p>
            <Button size="sm" style={{ marginTop: 'var(--space-2)' }}>Clear filters</Button>
          </div>

          {/* Error — load failed */}
          <div className="ds-empty ds-empty--error">
            <span className="ds-empty-icon" aria-hidden>!</span>
            <h3>Couldn't load operators</h3>
            <p className="ds-text-sm">RPC request failed. The node may be syncing or rate-limited.</p>
            <div className="ds-row" style={{ gap: 'var(--space-2)', marginTop: 'var(--space-2)' }}>
              <Button variant="primary" size="sm">Retry</Button>
              <Button size="sm">Switch RPC</Button>
            </div>
          </div>

          {/* Disconnected — wallet/account required */}
          <div className="ds-empty ds-empty--info">
            <span className="ds-empty-icon" aria-hidden>⌒</span>
            <h3>Connect to view your stake</h3>
            <p className="ds-text-sm">Your commitments and operator delegations are scoped to the connected address.</p>
            <Button variant="primary" size="sm" style={{ marginTop: 'var(--space-2)' }}>Connect wallet</Button>
          </div>
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
  )
}
