import { useState } from 'react'
import {
  Button,
  Disclosure,
  Drawer,
  Input,
  Modal,
  SourceBlock,
  Tooltip,
} from '../../components/ui'
import { SectionHeading } from './SectionHeading'

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
        <Button variant="primary" onClick={() => setModalOpen(true)}>
          Open Modal
        </Button>
        <Button onClick={() => setDrawerOpen(true)}>
          Open Drawer (right)
        </Button>
      </div>
      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title="Confirm action"
        description="Centered dialog. Best for one-shot confirmations and short forms."
        size="md"
        footer={
          <div className="ds-row ds-row-2" style={{ justifyContent: 'flex-end' }}>
            <Button variant="ghost" onClick={() => setModalOpen(false)}>Cancel</Button>
            <Button variant="primary" onClick={() => setModalOpen(false)}>Confirm</Button>
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
        title="Agreement proposal"
        description="Right-anchored panel. Best for detail and decisions that need the page as reference."
      >
        <div className="ds-stack ds-stack-4">
          <p className="ds-text-sm ds-muted">
            Drawer mirrors the Modal API but slides in from the right (or bottom on narrow viewports).
            Reserve it for detail that references the page behind it (an agreement proposal opened
            from the dashboard) and for the mobile nav. Single-screen transactional flows — deposit,
            withdraw, underwrite, buy cover — use Modal: that&rsquo;s the app-wide house style.
          </p>
          <div className="ds-stack ds-stack-2">
            <div className="ds-label">Counterparty</div>
            <Input placeholder="0x…" inputMode="text" />
            <div className="ds-text-xs ds-subtle">Both legs and the arbiter follow below</div>
          </div>
          <div className="ds-row ds-row-2" style={{ justifyContent: 'flex-end' }}>
            <Button onClick={() => setDrawerOpen(false)}>Reject</Button>
            <Button variant="primary" onClick={() => setDrawerOpen(false)}>Accept</Button>
          </div>
        </div>
      </Drawer>
    </div>
  )
}

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

<Drawer open={open} onClose={close} side="right" size="md" title="Agreement proposal">
  …proposal detail and actions…
</Drawer>`

export function DisclosureSection() {
  return (
    <section className="ds-stack ds-stack-6">
      <SectionHeading
        id="disclosure"
        title="Disclosure"
        lead="A minimal text trigger that toggles a child block. Use for secondary detail that would crowd the surface if always visible — APY breakdowns, advanced parameters, fine-print fee schedules."
      />
      <DisclosureDemo />
      <SourceBlock label="example" source={SRC_DISCLOSURE} />
    </section>
  )
}

export function TooltipSection() {
  return (
    <section className="ds-stack ds-stack-6">
      <SectionHeading
        id="tooltip"
        title="Tooltip"
        lead="Inline hover/focus hint for defining a term in place. Children is the trigger, content is the 1–2 sentence body — reach for Disclosure or Notice for anything longer. Opens on hover and keyboard focus, dismisses on blur or Escape, works on touch, and honors prefers-reduced-motion. No protocol knowledge lives inside it; the glossary is passed in by the caller."
      />
      <TooltipDemo />
      <SourceBlock label="example" source={SRC_TOOLTIP} />
    </section>
  )
}

export function OverlaysSection() {
  return (
    <section className="ds-stack ds-stack-6">
      <SectionHeading
        id="overlays"
        title="Overlays"
        lead="Modal for centered confirmations; Drawer for multi-screen flows that should keep the underlying page in context. Both portal under <body>, trap focus, dismiss on Escape, and lock page scroll while open."
      />
      <OverlaysDemo />
      <SourceBlock label="example" source={SRC_OVERLAYS} />
    </section>
  )
}
