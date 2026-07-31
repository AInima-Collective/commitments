import { useCallback, useId, useState, type ReactNode } from 'react'

export interface DisclosureProps {
  /** Trigger label. Rendered uppercase per .ds-disclosure-trigger. */
  label: ReactNode
  /** Body content shown when open. */
  children: ReactNode
  /** Initial open state in uncontrolled mode. Default false. */
  defaultOpen?: boolean
  /** Controlled open state. Pair with `onOpenChange`. */
  open?: boolean
  /** Notified on open/close. Required when `open` is provided. */
  onOpenChange?: (open: boolean) => void
  /** Extra class names appended to the root. */
  className?: string
}

/**
 * Show/hide block with a minimal text trigger and rotating caret. Composes from
 * .ds-disclosure / .ds-disclosure-trigger CSS in tokens.css. Uncontrolled by
 * default; pass `open` + `onOpenChange` to drive externally.
 */
export function Disclosure({
  label,
  children,
  defaultOpen = false,
  open: controlledOpen,
  onOpenChange,
  className,
}: DisclosureProps) {
  const [uncontrolledOpen, setUncontrolledOpen] = useState(defaultOpen)
  const isControlled = controlledOpen !== undefined
  const isOpen = isControlled ? controlledOpen : uncontrolledOpen
  const bodyId = useId()

  const toggle = useCallback(() => {
    const next = !isOpen
    if (!isControlled) setUncontrolledOpen(next)
    onOpenChange?.(next)
  }, [isOpen, isControlled, onOpenChange])

  const cls = ['ds-disclosure', className].filter(Boolean).join(' ')

  return (
    <div className={cls} data-open={isOpen ? 'true' : 'false'}>
      <button
        type="button"
        className="ds-disclosure-trigger"
        aria-expanded={isOpen}
        aria-controls={bodyId}
        onClick={toggle}
      >
        <span className="ds-disclosure-trigger-caret" aria-hidden />
        {label}
      </button>
      {isOpen && (
        <div id={bodyId} className="ds-disclosure-body">
          {children}
        </div>
      )}
    </div>
  )
}
