import type { ReactNode } from 'react'

export type ToastTone = 'neutral' | 'info' | 'success' | 'warn' | 'danger'

export type ToastProps = {
  /** Semantic color tone, applied via `data-tone` attribute on the root. */
  tone?: ToastTone
  /** Leading icon slot. */
  icon?: ReactNode
  /** Toast title — short, declarative, fits on a single line. */
  title?: ReactNode
  /** Body / message content. */
  children?: ReactNode
  /** Optional action slot (e.g. an undo / view button). */
  actions?: ReactNode
  /** Dismiss callback; the page owns lifecycle, primitive only signals intent. */
  onDismiss?: () => void
  /** Extra class names appended to the root element. */
  className?: string
}

/**
 * Transient out-of-flow notification primitive. Pages own the toast list via
 * {@link useToasts}; the {@link ToastProvider} renders the live region.
 *
 * Role mapping mirrors {@link Notice}:
 * - `tone="danger"` -> `role="alert"` (assertive)
 * - all other tones -> `role="status"` (polite)
 *
 * Background, border, animation, and region positioning all live in
 * `tokens.css` so light/dark theme switching is automatic.
 */
export function Toast({
  tone = 'neutral',
  icon,
  title,
  children,
  actions,
  onDismiss,
  className,
}: ToastProps) {
  const role = tone === 'danger' ? 'alert' : 'status'
  const rootClass = ['ds-toast', className].filter(Boolean).join(' ')
  return (
    <div role={role} data-tone={tone} className={rootClass}>
      {icon ? <span className="toast-icon">{icon}</span> : null}
      <div className="toast-body">
        {title ? <div className="toast-title">{title}</div> : null}
        {children ? <div className="toast-message">{children}</div> : null}
      </div>
      {actions ? <div className="toast-actions">{actions}</div> : null}
      {onDismiss ? (
        <button
          type="button"
          className="toast-dismiss"
          onClick={onDismiss}
          aria-label="Dismiss"
        >
          {'\u00d7'}
        </button>
      ) : null}
    </div>
  )
}
