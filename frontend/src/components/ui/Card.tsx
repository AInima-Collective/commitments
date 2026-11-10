import { forwardRef, type ComponentPropsWithoutRef, type ElementType, type ReactNode, type Ref } from 'react'

export type CardTone = 'neutral' | 'info' | 'success' | 'warn' | 'danger'
export type CardDensity = 'compact' | 'regular'

type CardOwnProps<E extends ElementType> = {
  /** Polymorphic root element. Default `'div'`. Pass a component (e.g.
   *  react-router-dom's `Link`) for a card that navigates client-side. */
  as?: E
  /** Semantic color tone. Forwarded to `data-tone`. */
  tone?: CardTone
  /** Padding density. Default `'regular'`. */
  density?: CardDensity
  /** Render with `.ds-card--selected` accent border. */
  selected?: boolean
  /** Body content. */
  children?: ReactNode
  /** Extra class names appended to the root. */
  className?: string
}

export type CardProps<E extends ElementType = 'div'> = CardOwnProps<E> &
  Omit<ComponentPropsWithoutRef<E>, keyof CardOwnProps<E>>

/**
 * Minimal surface wrapper over `.ds-card` CSS. No protocol vocabulary —
 * pages compose `Card` with domain content. Polymorphic via `as`; renders
 * as `<a>` / `<button>` when the surface is interactive.
 */
function CardImpl<E extends ElementType = 'div'>(
  { as, tone = 'neutral', density = 'regular', selected, className, children, ...rest }: CardProps<E>,
  ref: Ref<Element>,
) {
  const Root = (as ?? 'div') as ElementType

  const cls = [
    'ds-card',
    selected ? 'ds-card--selected' : '',
    className,
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <Root
      ref={ref as never}
      data-tone={tone}
      data-density={density}
      className={cls}
      {...(rest as Record<string, unknown>)}
    >
      {children}
    </Root>
  )
}

export const Card = forwardRef(CardImpl) as <E extends ElementType = 'div'>(
  props: CardProps<E> & { ref?: Ref<Element> },
) => ReturnType<typeof CardImpl>
