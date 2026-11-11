import {
  Button,
  SourceBlock,
} from '../../components/ui'
import { PageHeader, ProposalStateBadge } from '../../components/protocol'
import { SectionHeading } from './SectionHeading'

const SRC_PAGE_HEADER =
  `<div className="ds-page">
  <PageHeader
    eyebrow="role"
    title="Arbiter inbox"
    lead="Your arbitration queue: commitments that name this wallet as arbiter."
    actions={<Button variant="primary">Review next</Button>}
  />
  …
</div>`

export function PageHeaderSection() {
  return (
    <section className="ds-stack ds-stack-6">
      <SectionHeading
        id="page-header"
        title="Page Header"
        lead="The first thing inside every page's .ds-page shell: an eyebrow naming the area, the page's h1, an optional lead, and a right-aligned actions slot. Eyebrow, title, and lead take rich content, so a page whose name carries a badge or a provenance marker renders it inside the header rather than beside it."
      />
      <div className="ds-stack ds-stack-3">
        <div className="ds-label">eyebrow · title · lead · actions</div>
        <div className="ds-surface" style={{ padding: 'var(--space-4)' }}>
          <PageHeader
            eyebrow="role"
            title="Arbiter inbox"
            lead="Your arbitration queue: commitments that name this wallet as arbiter. Proposal review is separated from permissionless manager execution and from commitments that are merely active."
            actions={
              <>
                <Button>Export</Button>
                <Button variant="primary">Review next</Button>
              </>
            }
          />
        </div>
      </div>
      <div className="ds-grid-2" style={{ alignItems: 'start' }}>
        <div className="ds-stack ds-stack-3">
          <div className="ds-label">eyebrow · title</div>
          <div className="ds-surface" style={{ padding: 'var(--space-4)' }}>
            <PageHeader eyebrow="overview" title="Dashboard" />
          </div>
        </div>
        <div className="ds-stack ds-stack-3">
          <div className="ds-label">rich eyebrow · badge as lead</div>
          <div className="ds-surface" style={{ padding: 'var(--space-4)' }}>
            <PageHeader
              eyebrow={
                <span className="ds-row" style={{ gap: 8, alignItems: 'baseline' }}>
                  <span>governor</span>
                  <span>·</span>
                  <span>#12</span>
                </span>
              }
              title="Raise the vault weight to 0.9x"
              lead={<ProposalStateBadge state="active" />}
            />
          </div>
        </div>
      </div>
      <SourceBlock label="example" source={SRC_PAGE_HEADER} />
    </section>
  )
}
