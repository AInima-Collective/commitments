import { forwardRef, type ComponentPropsWithoutRef, type ElementRef, type ReactNode, type SVGProps } from 'react'

export type SocialLinkSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl'
export type SocialLinkElement = 'a' | 'button'

type SocialLinkOwnProps<E extends SocialLinkElement> = {
  /** Polymorphic root element. Default `'a'`. */
  as?: E
  /** Square footprint + glyph scale. Forwarded to `data-size`. Default `'sm'`
   *  to match the visual weight of a `ds-btn--sm` (e.g. the theme toggle). */
  size?: SocialLinkSize
  /** Inline-SVG glyph to render. Compose with `GitHubMark` / `XMark` (or any
   *  icon that fills from `currentColor`). The glyph scales to the `size` via
   *  `1em` units, so the icon tracks the control footprint. */
  icon: ReactNode
  /** Accessible label. The control is icon-only, so this is required: it is
   *  set as both `aria-label` and the full-precision `title`. */
  label: string
  /** Extra class names appended to the root. */
  className?: string
}

export type SocialLinkProps<E extends SocialLinkElement = 'a'> = SocialLinkOwnProps<E> &
  Omit<ComponentPropsWithoutRef<E>, keyof SocialLinkOwnProps<E>>

/**
 * Icon-only link/button into an external surface (GitHub, X, …). No protocol
 * vocabulary — it is a generic chrome primitive. Polymorphic via `as`; defaults
 * to `<a>` for outbound links and re-targets to `<button>` for in-app actions.
 * The glyph is supplied via the `icon` slot so the primitive stays composable.
 */
function SocialLinkImpl<E extends SocialLinkElement = 'a'>(
  { as, size = 'sm', icon, label, className, ...rest }: SocialLinkProps<E>,
  ref: React.Ref<ElementRef<E>>,
) {
  const Root = (as ?? 'a') as SocialLinkElement
  const cls = ['ds-social-link', className].filter(Boolean).join(' ')

  return (
    <Root
      ref={ref as never}
      data-size={size}
      className={cls}
      aria-label={label}
      title={label}
      {...(rest as Record<string, unknown>)}
    >
      <span className="ds-social-link-glyph" aria-hidden="true">
        {icon}
      </span>
    </Root>
  )
}

export const SocialLink = forwardRef(SocialLinkImpl) as <E extends SocialLinkElement = 'a'>(
  props: SocialLinkProps<E> & { ref?: React.Ref<ElementRef<E>> },
) => ReturnType<typeof SocialLinkImpl>

type GlyphProps = Omit<SVGProps<SVGSVGElement>, 'children'>

/** GitHub mark. Fills from `currentColor` so it themes with the surrounding text. */
export function GitHubMark({ width = '1em', height = '1em', ...rest }: GlyphProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      width={width}
      height={height}
      fill="currentColor"
      focusable="false"
      aria-hidden="true"
      {...rest}
    >
      <path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.305-5.467-1.334-5.467-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12" />
    </svg>
  )
}

/** X (formerly Twitter) mark. Fills from `currentColor`. */
export function XMark({ width = '1em', height = '1em', ...rest }: GlyphProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      width={width}
      height={height}
      fill="currentColor"
      focusable="false"
      aria-hidden="true"
      {...rest}
    >
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
    </svg>
  )
}
