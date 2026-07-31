import {
  useCallback,
  useEffect,
  useId,
  useRef,
  type ReactNode,
} from 'react'
import { createPortal } from 'react-dom'

export type DrawerSize = 'sm' | 'md' | 'lg'
export type DrawerSide = 'left' | 'right'

export interface DrawerProps {
  open: boolean
  onClose: () => void
  title?: ReactNode
  description?: ReactNode
  /** Anchor edge. Right is the deposit/flow default; left matches the legacy
   *  mobile-nav pattern. Default 'right'. */
  side?: DrawerSide
  /** Panel width on desktop. Mobile collapses to a bottom sheet regardless. */
  size?: DrawerSize
  /** When false, clicking the backdrop does not close the drawer. Default true. */
  dismissOnBackdrop?: boolean
  children?: ReactNode
  /** Optional sticky footer area for actions. */
  footer?: ReactNode
}

/**
 * Slide-in panel primitive. Mirrors the Modal API so callers can swap between
 * the two without re-plumbing focus/escape/scroll-lock behavior. Composes from
 * .ds-drawer CSS in tokens.css.
 */
export function Drawer({
  open,
  onClose,
  title,
  description,
  side = 'right',
  size = 'md',
  dismissOnBackdrop = true,
  children,
  footer,
}: DrawerProps) {
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
      // Skip the close button so initial focus lands on the first real control.
      const focusable = panel.querySelector<HTMLElement>(
        'input, select, textarea, [href], button:not(.ds-drawer-close), [tabindex]:not([tabindex="-1"])',
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

  const drawer = (
    <div
      className="ds-drawer"
      data-open="true"
      data-side={side}
      role="dialog"
      aria-modal="true"
      aria-labelledby={title ? titleId : undefined}
      aria-describedby={description ? descId : undefined}
    >
      <div
        className="ds-drawer-overlay"
        onClick={dismissOnBackdrop ? onClose : undefined}
      />
      <div
        className="ds-drawer-panel"
        data-size={size}
        ref={panelRef}
        tabIndex={-1}
      >
        <header className="ds-drawer-panel-header">
          <div className="ds-stack ds-stack-1">
            {title && (
              <h2 id={titleId} className="ds-drawer-panel-title">
                {title}
              </h2>
            )}
            {description && (
              <p id={descId} className="ds-drawer-panel-description">
                {description}
              </p>
            )}
          </div>
          <button
            type="button"
            className="ds-drawer-close"
            onClick={onClose}
            aria-label="Close drawer"
          >
            ×
          </button>
        </header>
        <div className="ds-drawer-panel-body">{children}</div>
        {footer && <footer className="ds-modal-footer">{footer}</footer>}
      </div>
    </div>
  )

  return createPortal(drawer, document.body)
}
