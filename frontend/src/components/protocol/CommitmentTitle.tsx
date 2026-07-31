import { type ElementType } from 'react'
import { type CommitmentLabel } from '../../lib/commitmentLabel'
import { MetadataTrustBadge } from './MetadataTrustBadge'

export type CommitmentTitleSize = 'sm' | 'md' | 'lg'
export type CommitmentTitleElement = 'span' | 'div' | 'h1' | 'h2' | 'h3'

export interface CommitmentTitleProps {
  /** Result of `commitmentLabel(row, ctx)` — already tier-resolved and clamped. */
  label: CommitmentLabel
  size?: CommitmentTitleSize
  as?: CommitmentTitleElement
  /**
   * Show the trust badge for attested metadata as well. Default false; see
   * {@link MetadataTrustBadge} for why the good case is normally silent.
   */
  showAttested?: boolean
  /** Drop the trust badge entirely, for surfaces that report trust elsewhere. */
  hideTrust?: boolean
  className?: string
}

/**
 * A commitment's name, plus the reason to believe it.
 *
 * The text arrives pre-resolved from `commitmentLabel`, which is where the
 * tier logic and the security rule live: a title whose on-chain hash no longer
 * matches never reaches this component, because the label falls back to the
 * derived tier before rendering. So there is nothing here that decides whether
 * text is safe to promote — by the time it gets here, that is settled.
 *
 * Rendered as plain text under every condition. `commitment.v1` documents
 * `description` as markdown-allowed and says nothing of the sort about
 * `title`, and a name that can carry markup is a name that can carry a link.
 */
export function CommitmentTitle({
  label,
  size = 'md',
  as = 'span',
  showAttested = false,
  hideTrust = false,
  className,
}: CommitmentTitleProps) {
  const Root = as as ElementType
  const cls = ['ds-commitment-title', className].filter(Boolean).join(' ')
  // Only worth a tooltip when the visible text is not the whole text.
  const titleAttr = label.full !== label.text ? label.full : undefined

  return (
    <Root className={cls} data-size={size} data-source={label.source}>
      <span className="ds-commitment-title-text" title={titleAttr}>
        {label.text}
      </span>
      {!hideTrust && (
        <MetadataTrustBadge trust={label.trust} size="xs" showAttested={showAttested} compact />
      )}
    </Root>
  )
}
