import {
  forwardRef,
  type ComponentPropsWithoutRef,
  type ElementType,
  type ReactNode,
  type Ref,
} from 'react'

export type ButtonVariant = 'default' | 'primary' | 'ghost' | 'destructive'
export type ButtonSize = 'sm' | 'md' | 'lg'

type ButtonOwnProps<E extends ElementType> = {
  /** Polymorphic root element. Default `'button'`. Pass a component (e.g.
   *  react-router-dom's `Link`) to render an anchor with button styling
   *  while keeping client-side routing. */
  as?: E
  /** Semantic variant — maps to `.ds-btn--primary` / `--ghost` / `--destructive`. */
  variant?: ButtonVariant
  /** Compact / default / spacious sizing — maps to `.ds-btn--sm` / `--lg`. */
  size?: ButtonSize
  /** Stretch to fill the parent container (`.ds-btn--full`). */
  fullWidth?: boolean
  /** Optional leading icon (rendered before children). */
  leadingIcon?: ReactNode
  /** Optional trailing icon (rendered after children). */
  trailingIcon?: ReactNode
  /** Body content. */
  children?: ReactNode
  /** Extra class names appended to the root. */
  className?: string
}

export type ButtonProps<E extends ElementType = 'button'> = ButtonOwnProps<E> &
  Omit<ComponentPropsWithoutRef<E>, keyof ButtonOwnProps<E>>

/**
 * `.ds-btn`-styled element. Defaults to `<button type="button">`; pass `as`
 * to render a polymorphic root (e.g. `as={Link}` for client-side navigation)
 * per the design contract rule #3.
 *
 * Variants are documented in components/ui/CONTRIBUTING.md §3 (variants).
 * Composes via the {@link ButtonVariant} + {@link ButtonSize} vocabulary.
 */
function ButtonImpl<E extends ElementType = 'button'>(
  {
    as,
    variant = 'default',
    size = 'md',
    fullWidth = false,
    leadingIcon,
    trailingIcon,
    className,
    children,
    ...rest
  }: ButtonProps<E>,
  ref: Ref<Element>,
) {
  const Root = (as ?? 'button') as ElementType
  const cls = [
    'ds-btn',
    variant !== 'default' ? `ds-btn--${variant}` : '',
    size !== 'md' ? `ds-btn--${size}` : '',
    fullWidth ? 'ds-btn--full' : '',
    className,
  ]
    .filter(Boolean)
    .join(' ')
  const native = as === undefined || as === 'button'
  return (
    <Root
      ref={ref as never}
      {...(native ? { type: (rest as { type?: string }).type ?? 'button' } : {})}
      className={cls}
      {...(rest as Record<string, unknown>)}
    >
      {leadingIcon !== undefined && leadingIcon}
      {children}
      {trailingIcon !== undefined && trailingIcon}
    </Root>
  )
}

export const Button = forwardRef(ButtonImpl) as <E extends ElementType = 'button'>(
  props: ButtonProps<E> & { ref?: Ref<Element> },
) => ReturnType<typeof ButtonImpl>
