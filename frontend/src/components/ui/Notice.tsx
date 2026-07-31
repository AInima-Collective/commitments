import type { ReactNode } from 'react'

/**
 * Canonical tone vocabulary — matches the design-system spec in
 * components/ui/CONTRIBUTING.md (`neutral | info | success | warn | danger`)
 * and the sibling {@link import('./Toast').ToastTone}.
 */
export type NoticeTone = 'neutral' | 'info' | 'success' | 'warn' | 'danger'

export type NoticeSize = 'sm' | 'md' | 'lg'

export type NoticeProps = {
  /** Semantic color tone. */
  tone?: NoticeTone
  /** Compact / default / spacious padding. */
  size?: NoticeSize
  /** Polymorphic root element — `'div'` (default) or `'section'`. */
  as?: 'div' | 'section'
  /** Custom leading icon. When omitted, a default glyph is rendered for tones
   * that have one (info/success/warn/error). Pass `null` to suppress entirely. */
  icon?: ReactNode | null
  /** Notice title — supports a node so callers can mix in inline formatting. */
  title?: ReactNode
  /** Body / message content. */
  children?: ReactNode
  /** Action slot (typically buttons or links). */
  actions?: ReactNode
  /** Render the dismiss × button when provided. */
  onDismiss?: () => void
  /** Render with `.ds-toast` class so toast-only style rules apply. */
  isToast?: boolean
  /** Extra class names appended to the root element. */
  className?: string
}

const DEFAULT_GLYPH: Record<Exclude<NoticeTone, 'neutral'>, string> = {
  info: 'i',
  success: '✓',
  warn: '!',
  danger: '✗',
}

/**
 * In-flow announcement banner. Composes via the {@link NoticeTone} +
 * {@link NoticeSize} vocabulary documented in components/ui/CONTRIBUTING.md.
 *
 * Role mapping:
 * - `tone="danger"` / `tone="warn"` → `role="alert"`
 * - all other tones → `role="status"`
 */
export function Notice({
  tone = 'neutral',
  size = 'md',
  as,
  icon,
  title,
  children,
  actions,
  onDismiss,
  isToast,
  className,
}: NoticeProps) {
  const Root = (as ?? 'div') as 'div' | 'section'

  const role = tone === 'danger' || tone === 'warn' ? 'alert' : 'status'

  const rootClass = [
    'ds-notice',
    `ds-notice--${tone}`,
    isToast ? 'ds-toast' : '',
    className,
  ]
    .filter(Boolean)
    .join(' ')

  const resolvedIcon =
    icon === null
      ? null
      : icon !== undefined
      ? icon
      : tone !== 'neutral'
      ? DEFAULT_GLYPH[tone]
      : null

  return (
    <Root role={role} data-size={size} className={rootClass}>
      {resolvedIcon !== null && (
        <span className="ds-notice-icon" aria-hidden>
          {resolvedIcon}
        </span>
      )}
      <div className="ds-notice-body">
        {title ? <div className="ds-notice-title">{title}</div> : null}
        {children ? <div className="ds-notice-message">{children}</div> : null}
        {actions ? <div className="ds-notice-actions">{actions}</div> : null}
      </div>
      {onDismiss && (
        <button
          type="button"
          className="ds-notice-dismiss"
          aria-label="Dismiss"
          onClick={onDismiss}
        >
          ×
        </button>
      )}
    </Root>
  )
}
