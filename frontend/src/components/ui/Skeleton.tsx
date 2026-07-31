import type { CSSProperties } from 'react'

export type SkeletonShape = 'text' | 'title' | 'circle' | 'block' | 'button'
export type SkeletonAnimation = 'pulse' | 'still' | 'shimmer'

export interface SkeletonProps {
  /** Visual shape — maps to the `.ds-skeleton--*` modifier classes in tokens.css. */
  shape?: SkeletonShape
  /** Animation behavior. `'pulse'` is the default base, `'still'` freezes it,
   *  `'shimmer'` swaps in the gradient sweep for richer panels. */
  animation?: SkeletonAnimation
  /** Convenience numeric/string width forwarded into the inline style. */
  width?: number | string
  /** Convenience numeric/string height forwarded into the inline style. */
  height?: number | string
  /** Extra class names appended to the root element. */
  className?: string
  /** Escape hatch for one-off layout adjustments. */
  style?: CSSProperties
}

/**
 * Loading placeholder. Wraps the existing `.ds-skeleton` token-driven styling
 * in a single component so callers don't need to memorize the modifier names
 * or hand-roll inline styles. `aria-hidden` is set automatically since
 * skeletons are decorative — the surrounding container should communicate
 * the loading state to assistive tech (e.g. `aria-busy="true"`).
 */
export function Skeleton({
  shape = 'text',
  animation = 'pulse',
  width,
  height,
  className,
  style,
}: SkeletonProps) {
  const cls = [
    'ds-skeleton',
    `ds-skeleton--${shape}`,
    animation !== 'pulse' ? `ds-skeleton--${animation}` : '',
    className,
  ]
    .filter(Boolean)
    .join(' ')
  const mergedStyle: CSSProperties = { ...style }
  if (width !== undefined) mergedStyle.width = width
  if (height !== undefined) mergedStyle.height = height
  return <span aria-hidden className={cls} style={mergedStyle} />
}
