import type { ReactNode } from 'react'

export type EntityCardTone = 'neutral' | 'info' | 'success' | 'warn' | 'danger'

export interface EntityCardProps {
  /** Entity name / role label. Renders uppercase, tracked. */
  label: ReactNode
  /** Optional one-or-two-line description. Secondary color, capped at ~70ch. */
  description?: ReactNode
  /** Right-aligned slot in the header — version chip, status pill, count. */
  meta?: ReactNode
  /** Right-aligned action slot — typically a link ("View report ↗"). */
  action?: ReactNode
  /** Body — typically a row of `<AddressDisplay>` chips, but free-form. */
  children?: ReactNode
  /** Tone of the left rule. `neutral` paints `--border-strong`; semantic
   * tones use the matching var (info → accent, success/warn/danger → respective). */
  tone?: EntityCardTone
}

/**
 * EntityCard — a labelled card for surfaces that pair a name with a list of
 * addresses, IDs, or attestations. Used by the vault's Smart-contracts,
 * Roles, and Audits surfaces, but the shape is intentionally generic: any
 * "label + description + addresses" surface can compose it.
 *
 * Pure presentation primitive. The caller renders address links via
 * `<AddressDisplay>` (or any other content) inside `children`.
 */
export function EntityCard({
  label,
  description,
  meta,
  action,
  children,
  tone = 'neutral',
}: EntityCardProps) {
  const hasSide = Boolean(meta) || Boolean(action)
  return (
    <div className="ds-entity-card" data-tone={tone}>
      <div className="ds-entity-card-rule" aria-hidden="true" />
      <div className="ds-entity-card-body">
        <div className="ds-entity-card-head">
          <div className="ds-entity-card-titles">
            <span className="ds-entity-card-label">{label}</span>
            {description && (
              <span className="ds-entity-card-description">{description}</span>
            )}
          </div>
          {hasSide && (
            <div className="ds-entity-card-side">
              {meta && <span className="ds-entity-card-meta">{meta}</span>}
              {action && <span className="ds-entity-card-action">{action}</span>}
            </div>
          )}
        </div>
        {children && <div className="ds-entity-card-content">{children}</div>}
      </div>
    </div>
  )
}
