import type { ReactNode } from 'react'

export interface PageHeaderProps {
  /** Small uppercase route label rendered above the heading (e.g. "vault").
   *  Accepts rich content (links, badges) as well as a plain string. */
  eyebrow?: ReactNode
  /** Primary heading. Rich content is allowed so a page whose name carries a
   *  provenance marker (see `CommitmentTitle`) can render it inside the `h1`
   *  rather than bolting it on beside the header. */
  title: ReactNode
  /** Optional one-paragraph lead, sentence case. */
  lead?: ReactNode
  /** Optional right-aligned slot for actions (buttons, toggles, etc.). */
  actions?: ReactNode
}

/**
 * Standard page header — eyebrow + title + (optional) lead + (optional) actions.
 * Pages compose this at the top of their `.ds-page` shell so all top-of-page
 * chrome looks the same.
 */
export function PageHeader({ eyebrow, title, lead, actions }: PageHeaderProps) {
  return (
    <header className="ds-page-header">
      <div className="ds-stack ds-stack-2">
        {eyebrow && <span className="ds-page-eyebrow">{eyebrow}</span>}
        <h1 className="ds-page-title">{title}</h1>
        {lead && <p className="ds-page-lead">{lead}</p>}
      </div>
      {actions && <div className="ds-page-header-actions">{actions}</div>}
    </header>
  )
}
