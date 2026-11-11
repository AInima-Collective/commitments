import { useState } from 'react'
import {
  SourceBlock,
  Tabs,
  ViewToggle,
} from '../../components/ui'
import { SectionHeading } from './SectionHeading'

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

const SRC_TABS =
  `const [tab, setTab] = useState('overview')
<Tabs value={tab} onValueChange={setTab}>
  <Tabs.List aria-label="Commitment views">
    <Tabs.Trigger value="overview">overview</Tabs.Trigger>
    <Tabs.Trigger value="commitments" count={3}>commitments</Tabs.Trigger>
    <Tabs.Trigger value="mesh">mesh</Tabs.Trigger>
  </Tabs.List>
  <Tabs.Panel value="overview">…</Tabs.Panel>
  <Tabs.Panel value="commitments">…</Tabs.Panel>
  <Tabs.Panel value="mesh">…</Tabs.Panel>
</Tabs>`

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

export function TabsSection() {
  return (
    <section className="ds-stack ds-stack-6">
      <SectionHeading
        id="tabs"
        title="Tabs"
        lead="Bottom-border indicator, no pill backgrounds. Inactive tabs sit muted; the active tab tracks the accent."
      />
      <TabsDemo />
      <SourceBlock label="example" source={SRC_TABS} />
    </section>
  )
}

export function ViewToggleSection() {
  return (
    <section className="ds-stack ds-stack-6">
      <SectionHeading
        id="view-toggle"
        title="View Toggle"
        lead="Segmented control for switching equivalent views of the same data — list ↔ graph, comfortable ↔ compact. Visually distinct from Tabs (which switches *content*); ViewToggle switches *representation*. Uses radiogroup semantics."
      />
      <ViewToggleDemo />
      <SourceBlock label="example" source={SRC_VIEW_TOGGLE} />
    </section>
  )
}
