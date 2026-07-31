import {
  useCallback,
  useEffect,
  useId,
  useRef,
  type ReactNode,
} from 'react'
import { createPortal } from 'react-dom'

export type ModalSize = 'sm' | 'md' | 'lg'

export interface ModalProps {
  open: boolean
  onClose: () => void
  title?: ReactNode
  description?: ReactNode
  size?: ModalSize
  /** When false, clicking the backdrop does not close the modal. Default true. */
  dismissOnBackdrop?: boolean
  children?: ReactNode
  /** Optional sticky footer area for actions. */
  footer?: ReactNode
}

/**
 * Centered dialog primitive. Renders into `document.body` via portal, traps
 * focus, restores focus on close, dismisses on Escape, and locks page scroll
 * while open. Composes from .ds-modal CSS in tokens.css.
 */
export function Modal({
  open,
  onClose,
  title,
  description,
  size = 'md',
  dismissOnBackdrop = true,
  children,
  footer,
}: ModalProps) {
  const titleId = useId()
  const descId = useId()
  const panelRef = useRef<HTMLDivElement | null>(null)
  const previousFocusRef = useRef<Element | null>(null)

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        onClose()
      }
    },
    [onClose],
  )

  // Focus management + scroll lock. Keyed on `open` ALONE so it runs once per
  // open/close transition — not on every parent re-render. Folding
  // handleKeyDown in here (its identity changes whenever the caller passes a
  // fresh onClose, which is every keystroke for a controlled form) would re-run
  // this on each render and yank focus out of the field back to the panel.
  useEffect(() => {
    if (!open) return
    previousFocusRef.current = document.activeElement
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    const panel = panelRef.current
    if (panel) {
      // Skip the close button AND any Tooltip trigger so initial focus lands on
      // the first real control. Focusing a tooltip trigger fires its onFocus and
      // pops the hint open the instant the modal mounts — see the
      // `.ds-tooltip-trigger` exclusions below.
      const focusable = panel.querySelector<HTMLElement>(
        [
          'input:not(.ds-tooltip-trigger)',
          'select:not(.ds-tooltip-trigger)',
          'textarea:not(.ds-tooltip-trigger)',
          '[href]:not(.ds-tooltip-trigger)',
          'button:not(.ds-modal-close):not(.ds-tooltip-trigger)',
          '[tabindex]:not([tabindex="-1"]):not(.ds-tooltip-trigger)',
        ].join(', '),
      )
      ;(focusable ?? panel).focus()
    }

    return () => {
      document.body.style.overflow = previousOverflow
      if (previousFocusRef.current instanceof HTMLElement) {
        previousFocusRef.current.focus()
      }
    }
  }, [open])

  // Escape-to-close listener. Re-subscribes if the handler identity changes,
  // but never disturbs focus.
  useEffect(() => {
    if (!open) return
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [open, handleKeyDown])

  if (!open) return null

  const modal = (
    <div
      className="ds-modal"
      data-open="true"
      role="dialog"
      aria-modal="true"
      aria-labelledby={title ? titleId : undefined}
      aria-describedby={description ? descId : undefined}
    >
      <div
        className="ds-modal-overlay"
        onClick={dismissOnBackdrop ? onClose : undefined}
      />
      <div
        className="ds-modal-panel"
        data-size={size}
        ref={panelRef}
        tabIndex={-1}
      >
        <header className="ds-modal-header">
            <div className="ds-stack ds-stack-1">
              {title && (
                <h2 id={titleId} className="ds-modal-title">
                  {title}
                </h2>
              )}
              {description && (
                <p id={descId} className="ds-modal-description">
                  {description}
                </p>
              )}
            </div>
            <button
              type="button"
              className="ds-modal-close"
              onClick={onClose}
              aria-label="Close dialog"
            >
              ×
            </button>
          </header>
        <div className="ds-modal-body">{children}</div>
        {footer && <footer className="ds-modal-footer">{footer}</footer>}
      </div>
    </div>
  )

  return createPortal(modal, document.body)
}
