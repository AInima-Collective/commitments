import { forwardRef, type ComponentPropsWithoutRef, type ElementRef, type ReactNode } from 'react'

export type MediaRowTone = 'neutral' | 'info' | 'success' | 'warn' | 'danger'
export type MediaRowDensity = 'compact' | 'regular'
export type MediaRowElement = 'div' | 'li'

/**
 * The row's primary action.
 *
 * `label` is required and has to be a plain string: it is the ONLY accessible
 * name the action has. The overlay carries no text of its own, so without it
 * the row announces as an unlabelled button.
 */
export interface MediaRowAction {
  /** Accessible name, e.g. `Review commitment #28`. Never rendered visibly. */
  label: string
  onClick?: () => void
  /** Renders the action as a link instead of a button. */
  href?: string
}

type MediaRowOwnProps<E extends MediaRowElement> = {
  /** Polymorphic root element. Default `'div'`. */
  as?: E
  /** Leading slot — icon, avatar, status dot. */
  leading?: ReactNode
  /** Primary text. Required. */
  title: ReactNode
  /** Secondary text below the title — timestamp, sublabel, address. */
  meta?: ReactNode
  /** Trailing slot — value, action button, badge. */
  trailing?: ReactNode
  /** Makes the whole row activate. See {@link MediaRowAction}. */
  action?: MediaRowAction
  /** Semantic color tone. Forwarded to `data-tone`. */
  tone?: MediaRowTone
  /** Density. Default `'regular'`. */
  density?: MediaRowDensity
  /** Extra class names appended to the root. */
  className?: string
}

export type MediaRowProps<E extends MediaRowElement = 'div'> = MediaRowOwnProps<E> &
  Omit<ComponentPropsWithoutRef<E>, keyof MediaRowOwnProps<E>>

/**
 * Generic list-item primitive: leading slot, primary text, meta line,
 * trailing slot. No protocol vocabulary inside; use it as the rendering
 * surface for activity feeds, proposal lists, operator lists, etc.
 *
 * ── Why the root is never a button ──────────────────────────────────────────
 *
 * A clickable row used to be `as="button"`, and the slots routinely carry
 * their own controls — an `AddressDisplay` copy button, a badge that links
 * out. That nests a button inside a button: invalid HTML, which browsers
 * recover from by relocating the inner control out of the outer one, and
 * unusable with a keyboard or a screen reader because the inner control is
 * unreachable. The dashboard alone was shipping seventeen of them.
 *
 * So the root element is always non-interactive (`div` or `li`) and `action`
 * renders a "stretched link": an absolutely positioned, visually empty button
 * (or anchor) covering the row, sitting BELOW the slots. The slots are
 * pointer-transparent so a click on the row's dead space falls through to it,
 * while genuinely interactive descendants take their clicks back — see
 * `.ds-media-row[data-actionable]` in tokens.css, which is where that
 * behaviour lives and where it must stay in sync with this component.
 *
 * The trade-off is text selection: a pointer-transparent row cannot be
 * selected with the mouse. That was already true of the `as="button"` version,
 * so nothing regresses, and it is the accepted cost of the pattern.
 */
function MediaRowImpl<E extends MediaRowElement = 'div'>(
  {
    as,
    leading,
    title,
    meta,
    trailing,
    action,
    tone = 'neutral',
    density = 'regular',
    className,
    ...rest
  }: MediaRowProps<E>,
  ref: React.Ref<ElementRef<E>>,
) {
  const Root = (as ?? 'div') as MediaRowElement
  const cls = ['ds-media-row', className].filter(Boolean).join(' ')

  return (
    <Root
      ref={ref as never}
      data-tone={tone}
      data-density={density}
      data-actionable={action ? 'true' : undefined}
      className={cls}
      {...(rest as Record<string, unknown>)}
    >
      {/* First in DOM order so it sits under the slots without needing a
        * z-index on every one of them, and so keyboard focus reaches the row's
        * own action before the controls inside it. */}
      {action &&
        (action.href ? (
          <a className="ds-media-row-action" href={action.href}>
            <span className="ds-sr-only">{action.label}</span>
          </a>
        ) : (
          <button type="button" className="ds-media-row-action" onClick={action.onClick}>
            <span className="ds-sr-only">{action.label}</span>
          </button>
        ))}
      {leading !== undefined && (
        <span className="ds-media-row-leading" aria-hidden={typeof leading !== 'string'}>
          {leading}
        </span>
      )}
      <span className="ds-media-row-body">
        <span className="ds-media-row-title">{title}</span>
        {meta !== undefined && <span className="ds-media-row-meta">{meta}</span>}
      </span>
      {trailing !== undefined && <span className="ds-media-row-trailing">{trailing}</span>}
    </Root>
  )
}

export const MediaRow = forwardRef(MediaRowImpl) as <E extends MediaRowElement = 'div'>(
  props: MediaRowProps<E> & { ref?: React.Ref<ElementRef<E>> },
) => ReturnType<typeof MediaRowImpl>
