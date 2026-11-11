import {
  Button,
  Card,
  SourceBlock,
} from '../../components/ui'
import { SectionHeading } from './SectionHeading'

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

export function SurfacesSection() {
  return (
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
            <Button variant="ghost" size="sm" style={{ marginLeft: 'auto' }}>Action</Button>
          </div>
        </div>
      </div>
      <SourceBlock label="example" source={SRC_SURFACES} />
    </section>
  )
}

export function CardSection() {
  return (
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
  )
}
