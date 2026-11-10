import { Fragment, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { ThemeToggle, useTheme } from '../components/ui'
import { ActivityFeedSection } from './design/ActivityFeedSection'
import { AddressSection } from './design/AddressSection'
import { AssetsSection } from './design/AssetsSection'
import { CommitmentNamingSection } from './design/CommitmentNamingSection'
import { CommitmentsSection } from './design/CommitmentsSection'
import { ButtonsSection, InputsSection } from './design/Controls'
import { DefiVaultsSection } from './design/DefiVaultsSection'
import { DevToolsSection } from './design/DevToolsSection'
import { EmptySection } from './design/EmptySection'
import { EntityCardsSection } from './design/EntityCardsSection'
import { EntityLogoSection } from './design/EntityLogoSection'
import {
  BrandSection,
  ColorSection,
  SocialLinkSection,
  SpacingSection,
  TypographySection,
} from './design/Foundations'
import { GovernanceSection } from './design/GovernanceSection'
import { LoadingSection } from './design/LoadingSection'
import { AgentBadgeSection, BadgesSection, GlyphsSection, TxSection } from './design/Marks'
import { MediaRowSection } from './design/MediaRowSection'
import { MetadataEditorSection } from './design/MetadataEditorSection'
import { MotionSection } from './design/MotionSection'
import { MutualSection } from './design/MutualSection'
import { NavigationSection } from './design/NavigationSection'
import { NotificationsSection } from './design/NotificationsSection'
import { OperatorsSection } from './design/OperatorsSection'
import { DisclosureSection, OverlaysSection, TooltipSection } from './design/Overlays'
import { PageHeaderSection } from './design/PageHeaderSection'
import { StatsSection } from './design/StatsSection'
import { CardSection, SurfacesSection } from './design/Surfaces'
import { TabsSection, ViewToggleSection } from './design/Switchers'
import { DataTableSection, FilterBarSection, PaginationSection, TablesSection } from './design/Tables'
import { ServiceStakeSection, VaultHeaderSection, VaultMetadataSection } from './design/Vaults'

/**
 * /app/design — the spec for the UI vocabulary. Each section lives in its own
 * file under ./design with the demo helpers and source snippets it uses; this
 * file owns the page shell and the order of the sections.
 *
 * Snippets are hand-written strings shown beside each example (no Vite
 * plugin), so they stay in step with the demo only if the author keeps them so.
 */

type DesignSection = {
  /** Mirrors the `id=` on the section's SectionHeading; the TOC anchors to it. */
  id: string
  /** TOC label. */
  label: string
  section: ReactNode
}

function sections(theme: 'light' | 'dark'): DesignSection[] {
  return [
    { id: 'color', label: 'Color', section: <ColorSection theme={theme} /> },
    { id: 'typography', label: 'Typography', section: <TypographySection /> },
    { id: 'brand', label: 'Brand', section: <BrandSection /> },
    { id: 'social-link', label: 'Social Link', section: <SocialLinkSection /> },
    { id: 'spacing', label: 'Spacing', section: <SpacingSection /> },
    { id: 'stats', label: 'Stat Blocks', section: <StatsSection /> },
    { id: 'assets', label: 'Assets', section: <AssetsSection /> },
    { id: 'defi-vaults', label: 'DeFi Vaults', section: <DefiVaultsSection /> },
    { id: 'vault-metadata', label: 'Vault Metadata', section: <VaultMetadataSection /> },
    { id: 'service-stake', label: 'Service Stake', section: <ServiceStakeSection /> },
    { id: 'vault-header', label: 'Vault Header', section: <VaultHeaderSection /> },
    { id: 'entity-cards', label: 'Entity Cards', section: <EntityCardsSection /> },
    { id: 'buttons', label: 'Buttons', section: <ButtonsSection /> },
    { id: 'inputs', label: 'Inputs', section: <InputsSection /> },
    { id: 'surfaces', label: 'Surfaces', section: <SurfacesSection /> },
    { id: 'card', label: 'Card', section: <CardSection /> },
    { id: 'media-row', label: 'Media Row', section: <MediaRowSection /> },
    { id: 'activity-feed', label: 'Activity Feed', section: <ActivityFeedSection /> },
    { id: 'tables', label: 'Tables', section: <TablesSection /> },
    { id: 'data-table', label: 'Data Table', section: <DataTableSection /> },
    { id: 'pagination', label: 'Pagination', section: <PaginationSection /> },
    { id: 'filter-bar', label: 'Filter Bar', section: <FilterBarSection /> },
    { id: 'badges', label: 'Status Badges', section: <BadgesSection /> },
    { id: 'agent-badge', label: 'Agent Badge', section: <AgentBadgeSection /> },
    { id: 'tx', label: 'Transaction State', section: <TxSection /> },
    { id: 'glyphs', label: 'Glyphs', section: <GlyphsSection /> },
    { id: 'address', label: 'Address Display', section: <AddressSection /> },
    { id: 'tabs', label: 'Tabs', section: <TabsSection /> },
    { id: 'view-toggle', label: 'View Toggle', section: <ViewToggleSection /> },
    { id: 'navigation', label: 'Navigation', section: <NavigationSection /> },
    { id: 'page-header', label: 'Page Header', section: <PageHeaderSection /> },
    { id: 'entity-logo', label: 'Entity Logo', section: <EntityLogoSection /> },
    { id: 'operators', label: 'Operators', section: <OperatorsSection /> },
    { id: 'commitments', label: 'Commitments', section: <CommitmentsSection /> },
    { id: 'mutual', label: 'Mutuals / Shared Loss', section: <MutualSection /> },
    { id: 'commitment-naming', label: 'Commitment Naming', section: <CommitmentNamingSection /> },
    { id: 'metadata-editor', label: 'Metadata Editor', section: <MetadataEditorSection /> },
    { id: 'loading', label: 'Loading & Placeholders', section: <LoadingSection /> },
    { id: 'motion', label: 'Motion', section: <MotionSection /> },
    { id: 'notifications', label: 'Notifications', section: <NotificationsSection /> },
    { id: 'empty', label: 'Empty States', section: <EmptySection /> },
    { id: 'disclosure', label: 'Disclosure', section: <DisclosureSection /> },
    { id: 'tooltip', label: 'Tooltip', section: <TooltipSection /> },
    { id: 'overlays', label: 'Overlays', section: <OverlaysSection /> },
    { id: 'governance', label: 'Governance', section: <GovernanceSection /> },
    { id: 'dev-tools', label: 'Dev Tools', section: <DevToolsSection /> },
  ]
}

function DocsToc({ items }: { items: DesignSection[] }) {
  return (
    <>
      {/* Desktop sticky sidebar — visible at >=1024px via .ds-docs-toc media rule */}
      <aside className="ds-docs-toc" aria-label="Design system sections">
        <div className="ds-docs-toc-label">on this page</div>
        {items.map((s) => (
          <a key={s.id} href={`#${s.id}`}>{s.label}</a>
        ))}
        <div className="ds-docs-toc-label" style={{ marginTop: 'var(--space-4)' }}>more</div>
        <Link to="/app/design/recipes" style={{ color: 'var(--accent)' }}>→ Recipes</Link>
      </aside>
    </>
  )
}

function DocsTocMobile({ items }: { items: DesignSection[] }) {
  return (
    <details className="ds-docs-toc-mobile">
      <summary>on this page · {items.length} sections</summary>
      <div className="ds-stack ds-stack-1">
        {items.map((s) => (
          <a key={s.id} href={`#${s.id}`}>{s.label}</a>
        ))}
        <Link to="/app/design/recipes" style={{ color: 'var(--accent)' }}>→ Recipes</Link>
      </div>
    </details>
  )
}

export default function Design() {
  const { theme } = useTheme()
  const all = sections(theme)
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
        <DocsTocMobile items={all} />

        {/* Two-column shell: content + sticky TOC sidebar at >=1024px */}
        <div className="ds-docs-shell">
          <div className="ds-stack ds-stack-16" style={{ minWidth: 0 }}>

            {all.map((s) => (
              <Fragment key={s.id}>{s.section}</Fragment>
            ))}

            {/* Footer */}
            <footer className="ds-stack ds-stack-2" style={{ paddingTop: 'var(--space-6)', borderTop: '1px solid var(--border)' }}>
              <div className="ds-text-xs ds-subtle">
                Iterating on /design. Tokens live in <code>src/styles/tokens.css</code>; this page lives in <code>src/pages/Design.tsx</code> and <code>src/pages/design/</code>.
              </div>
            </footer>

          </div>
          {/* Sticky TOC at >=1024px (display rule lives in tokens.css media query) */}
          <DocsToc items={all} />
        </div>

      </div>
    </div>
  )
}
