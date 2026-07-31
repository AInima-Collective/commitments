import {
  forwardRef,
  useCallback,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type ComponentPropsWithoutRef,
  type ElementRef,
  type KeyboardEvent,
  type ReactNode,
} from 'react'
import { createPortal } from 'react-dom'

export type TooltipTone = 'neutral' | 'info' | 'success' | 'warn' | 'danger'
export type TooltipSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl'
export type TooltipPlacement = 'top' | 'bottom' | 'left' | 'right'
/** Elements the trigger may render as. Defaults to `'button'` (most accessible). */
export type TooltipElement = 'button' | 'span' | 'a'

type TooltipOwnProps<E extends TooltipElement> = {
  /** The floating body, shown on hover / focus. Keep to 1–2 sentences;
   * reach for `Disclosure` / `Notice` for anything longer. */
  content: ReactNode
  /** Trigger content. When omitted, a default `ⓘ` info glyph is rendered. */
  children?: ReactNode
  /** Semantic color tone. Forwarded to `data-tone`. Default `'neutral'`. */
  tone?: TooltipTone
  /** Scale of the floating panel. Forwarded to `data-size`. Default `'sm'`. */
  size?: TooltipSize
  /** Side the panel opens toward. Forwarded to `data-placement`. Default `'top'`. */
  placement?: TooltipPlacement
  /** Polymorphic trigger element. Default `'button'`. */
  as?: E
  /** Controlled open state. Pair with `onOpenChange`. */
  open?: boolean
  /** Initial open state in uncontrolled mode. Default `false`. */
  defaultOpen?: boolean
  /** Notified whenever the open state should change (hover / focus / Escape). */
  onOpenChange?: (open: boolean) => void
  /** Accessible label for the trigger — required when `children` is the default
   * icon-only glyph so the affordance isn't announced as an empty button. */
  triggerLabel?: string
  /** Extra class names appended to the wrapper. */
  className?: string
}

export type TooltipProps<E extends TooltipElement = 'button'> = TooltipOwnProps<E> &
  Omit<ComponentPropsWithoutRef<E>, keyof TooltipOwnProps<E> | 'ref'>

/**
 * Inline hover / focus hint. A `ui/`-layer primitive with **no** protocol
 * knowledge — pass a term as `children` and its definition as `content`; the
 * glossary itself lives in the caller (`components/protocol/**` or a page).
 *
 * Follows the six rules in `components/ui/CONTRIBUTING.md`:
 * - composition: generic `children` (trigger) + `content` (body) slots;
 * - `size` + `tone` forwarded to `data-size` / `data-tone` (no `variant`);
 * - polymorphic `as` (default `'button'`) with the trigger ref forwarded;
 * - controlled (`open` + `onOpenChange`) **and** uncontrolled (`defaultOpen`);
 * - accessible: `role="tooltip"` body wired via `aria-describedby`, opens on
 *   hover and keyboard focus, dismisses on blur and `Escape`, works on touch
 *   (tap focuses the trigger), and honors `prefers-reduced-motion` in CSS.
 *
 * The panel is rendered into a `document.body` portal and positioned with
 * `position: fixed` anchored to the trigger's bounding box. This keeps it from
 * being clipped by scroll containers (e.g. `.ds-modal-body`'s `overflow`) and
 * lets it stack above modals/drawers. Keep the body short — placement is
 * fixed (no flip), so a very long panel can still run off a viewport edge.
 */

/** Gap between the trigger and the floating panel, in px (matches --space-2). */
const TOOLTIP_GAP = 8

interface TooltipCoords {
  top: number
  left: number
  transform: string
}

/** Compute fixed-position coordinates for the panel from the trigger rect. */
function computeCoords(rect: DOMRect, placement: TooltipPlacement): TooltipCoords {
  const cx = rect.left + rect.width / 2
  const cy = rect.top + rect.height / 2
  switch (placement) {
    case 'bottom':
      return { top: rect.bottom + TOOLTIP_GAP, left: cx, transform: 'translate(-50%, 0)' }
    case 'left':
      return { top: cy, left: rect.left - TOOLTIP_GAP, transform: 'translate(-100%, -50%)' }
    case 'right':
      return { top: cy, left: rect.right + TOOLTIP_GAP, transform: 'translate(0, -50%)' }
    case 'top':
    default:
      return { top: rect.top - TOOLTIP_GAP, left: cx, transform: 'translate(-50%, -100%)' }
  }
}
function TooltipImpl<E extends TooltipElement = 'button'>(
  {
    content,
    children,
    tone = 'neutral',
    size = 'sm',
    placement = 'top',
    as,
    open: controlledOpen,
    defaultOpen = false,
    onOpenChange,
    triggerLabel,
    className,
    ...rest
  }: TooltipProps<E>,
  ref: React.Ref<ElementRef<E>>,
) {
  const Trigger = (as ?? 'button') as TooltipElement
  const tipId = useId()

  const [uncontrolledOpen, setUncontrolledOpen] = useState(defaultOpen)
  const isControlled = controlledOpen !== undefined
  const isOpen = isControlled ? controlledOpen : uncontrolledOpen

  // The panel is portaled to document.body and positioned with `position:
  // fixed` from the trigger's bounding box, so it escapes any scroll-clipping
  // ancestor (modal body) and stacks above the modal.
  const triggerRef = useRef<HTMLElement | null>(null)
  const [coords, setCoords] = useState<TooltipCoords | null>(null)
  const setTriggerRef = useCallback(
    (node: HTMLElement | null) => {
      triggerRef.current = node
      if (typeof ref === 'function') ref(node as ElementRef<E>)
      else if (ref) (ref as React.MutableRefObject<ElementRef<E> | null>).current = node as ElementRef<E>
    },
    [ref],
  )

  // Reposition while open: once on open (layout effect, before paint) and on
  // scroll/resize so the panel stays anchored as the modal body scrolls.
  useLayoutEffect(() => {
    if (!isOpen) return
    const reposition = () => {
      const node = triggerRef.current
      if (node) setCoords(computeCoords(node.getBoundingClientRect(), placement))
    }
    reposition()
    // `true` capture catches scrolls on inner containers (e.g. .ds-modal-body).
    window.addEventListener('scroll', reposition, true)
    window.addEventListener('resize', reposition)
    return () => {
      window.removeEventListener('scroll', reposition, true)
      window.removeEventListener('resize', reposition)
    }
  }, [isOpen, placement])

  // Hover and focus are tracked independently so moving the pointer away while
  // the trigger is still keyboard-focused (or vice versa) doesn't close early.
  const hoveredRef = useRef(false)
  const focusedRef = useRef(false)

  const setOpen = useCallback(
    (next: boolean) => {
      if (!isControlled) setUncontrolledOpen(next)
      onOpenChange?.(next)
    },
    [isControlled, onOpenChange],
  )

  const sync = useCallback(() => {
    setOpen(hoveredRef.current || focusedRef.current)
  }, [setOpen])

  const handleMouseEnter = useCallback(() => {
    hoveredRef.current = true
    sync()
  }, [sync])
  const handleMouseLeave = useCallback(() => {
    hoveredRef.current = false
    sync()
  }, [sync])
  const handleFocus = useCallback(() => {
    focusedRef.current = true
    sync()
  }, [sync])
  const handleBlur = useCallback(() => {
    focusedRef.current = false
    sync()
  }, [sync])
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Escape' && (hoveredRef.current || focusedRef.current)) {
        e.stopPropagation()
        hoveredRef.current = false
        focusedRef.current = false
        setOpen(false)
      }
    },
    [setOpen],
  )

  const wrapperCls = ['ds-tooltip', className].filter(Boolean).join(' ')

  // A `<span>` trigger isn't natively focusable; opt it into the tab order and
  // announce it as a button so the hint is reachable by keyboard + AT. `<a>` is
  // already focusable when the caller supplies an href, so leave its semantics
  // alone.
  const triggerExtras: Record<string, unknown> =
    Trigger === 'button'
      ? { type: 'button' }
      : Trigger === 'span'
        ? { tabIndex: 0, role: 'button' }
        : {}

  const resolvedTrigger: ReactNode =
    children ?? (
      <span className="ds-tooltip-glyph" aria-hidden>
        {'ⓘ'}
      </span>
    )

  return (
    <span
      className={wrapperCls}
      data-open={isOpen ? 'true' : 'false'}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onKeyDown={handleKeyDown}
    >
      <Trigger
        ref={setTriggerRef as never}
        className="ds-tooltip-trigger"
        aria-describedby={tipId}
        aria-label={triggerLabel}
        onFocus={handleFocus}
        onBlur={handleBlur}
        {...triggerExtras}
        {...(rest as Record<string, unknown>)}
      >
        {resolvedTrigger}
      </Trigger>
      {createPortal(
        <span
          id={tipId}
          role="tooltip"
          className="ds-tooltip-content"
          data-tone={tone}
          data-size={size}
          data-placement={placement}
          data-portaled="true"
          data-open={isOpen ? 'true' : 'false'}
          style={
            coords
              ? { top: coords.top, left: coords.left, transform: coords.transform }
              : undefined
          }
        >
          {content}
        </span>,
        document.body,
      )}
    </span>
  )
}

export const Tooltip = forwardRef(TooltipImpl) as <E extends TooltipElement = 'button'>(
  props: TooltipProps<E> & { ref?: React.Ref<ElementRef<E>> },
) => ReturnType<typeof TooltipImpl>
