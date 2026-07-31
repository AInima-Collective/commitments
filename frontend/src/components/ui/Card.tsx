import { forwardRef, type ComponentPropsWithoutRef, type ElementRef, type ReactNode } from 'react'

export type CardTone = 'neutral' | 'info' | 'success' | 'warn' | 'danger'
export type CardDensity = 'compact' | 'regular'
export type CardElement = 'div' | 'a' | 'button' | 'li' | 'article' | 'section'

type CardOwnProps<E extends CardElement> = {
  /** Polymorphic root element. Default `'div'`. */
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

export type CardProps<E extends CardElement = 'div'> = CardOwnProps<E> &
  Omit<ComponentPropsWithoutRef<E>, keyof CardOwnProps<E>>

/**
 * Minimal surface wrapper over `.ds-card` CSS. No protocol vocabulary —
 * pages compose `Card` with domain content. Polymorphic via `as`; renders
 * as `<a>` / `<button>` when the surface is interactive.
 */
function CardImpl<E extends CardElement = 'div'>(
  { as, tone = 'neutral', density = 'regular', selected, className, children, ...rest }: CardProps<E>,
  ref: React.Ref<ElementRef<E>>,
) {
  const Root = (as ?? 'div') as CardElement

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

export const Card = forwardRef(CardImpl) as <E extends CardElement = 'div'>(
  props: CardProps<E> & { ref?: React.Ref<ElementRef<E>> },
) => ReturnType<typeof CardImpl>
