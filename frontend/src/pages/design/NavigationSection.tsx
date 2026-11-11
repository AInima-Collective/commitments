import { useEffect, useState } from 'react'
import {
  BrandMark,
  Button,
  SourceBlock,
} from '../../components/ui'
import { SectionHeading } from './SectionHeading'

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
        <Button size="sm">connect</Button>
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
          <Button size="sm" onClick={() => setDrawerOpen(true)}>
            Open drawer
          </Button>
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
                <Button size="sm">connect</Button>
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

const SRC_NAV =
  `<nav className="ds-sidenav" aria-label="Sections">
  <div className="ds-sidenav-section">protocol</div>
  <button className="ds-sidenav-link" aria-current="page">
    <span>Vault</span><span className="ds-sidenav-link-meta">1.25K</span>
  </button>
</nav>`

export function NavigationSection() {
  return (
    <section className="ds-stack ds-stack-8">
      <SectionHeading
        id="navigation"
        title="Navigation"
        lead="Three patterns coexist: a sticky top bar for the brand and primary destinations, a sidebar for full vertical hierarchy, and an in-page TOC that anchors long pages. On mobile the top bar collapses to a hamburger that opens a drawer holding the same sidebar content — there's only one source of truth for the route list. Bottom-tab is offered as an alternate mobile pattern for app-style flows."
      />
      <NavigationShowcase />
      <SourceBlock label="example" source={SRC_NAV} />
    </section>
  )
}
