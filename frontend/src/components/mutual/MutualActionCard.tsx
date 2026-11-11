import { type ReactNode } from 'react'

import { Button, Card, StatBlock } from '../ui'

interface MutualActionCardProps {
  /** Heading — the role this card opens ("Underwrite this risk" / "Buy cover"). */
  title: string
  /** One-line description of what the action does. */
  lead: string
  /** Optional headline metric (e.g. premium APR on the underwrite card). */
  stat?: {
    label: string
    value: ReactNode
    tone?: 'neutral' | 'success' | 'danger' | 'accent'
    meta?: string
  }
  /** Optional paired-risk / pricing note rendered above the CTA. */
  note?: ReactNode
  ctaLabel: string
  onCta: () => void
  disabled?: boolean
  /** Shown in place of the CTA-enabled state when disabled (e.g. "loss pending"). */
  disabledReason?: string
}

/**
 * MutualActionCard — one of the two equal-weight entry points on the mutual page
 * (Underwrite / Buy cover). Each owns exactly one primary CTA that opens a
 * focused drawer with the full flow, keeping the overview scannable. The card
 * states reward and its paired risk together (design rule: never show an APR
 * without the loss mechanism beside it).
 */
export function MutualActionCard({
  title,
  lead,
  stat,
  note,
  ctaLabel,
  onCta,
  disabled = false,
  disabledReason,
}: MutualActionCardProps) {
  return (
    <Card className="ds-stack ds-stack-3">
      <div className="ds-stack ds-stack-1">
        <span className="ds-text-sm" style={{ fontWeight: 600 }}>
          {title}
        </span>
        <p className="ds-text-sm ds-subtle" style={{ margin: 0 }}>
          {lead}
        </p>
      </div>

      {stat && (
        <StatBlock label={stat.label} value={stat.value} tone={stat.tone} meta={stat.meta} />
      )}

      {note && <div className="ds-text-xs ds-subtle">{note}</div>}

      <div className="ds-stack ds-stack-1">
        <Button variant="primary" fullWidth onClick={onCta} disabled={disabled}>
          {ctaLabel}
        </Button>
        {disabled && disabledReason && (
          <span className="ds-text-xs ds-subtle" style={{ textAlign: 'center' }}>
            {disabledReason}
          </span>
        )}
      </div>
    </Card>
  )
}
