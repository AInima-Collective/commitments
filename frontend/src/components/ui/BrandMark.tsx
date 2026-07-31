import type { ReactElement, SVGProps } from 'react'
import { useMarkId, type MarkId } from './labTheme'

export type BrandMarkSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl'

const SIZES: Record<BrandMarkSize, number> = {
  xs: 12,
  sm: 16,
  md: 24,
  lg: 48,
  xl: 96,
}

/**
 * Candidate brand marks, all on a 32×32 grid with a 2-unit stroke so they
 * carry the same optical weight at any size. Everything paints from
 * `currentColor` — there is no accent fill any more, because the palette no
 * longer has a brand hue to spend on a logo.
 *
 * The floor is 12px (the topnav): geometry finer than ~3 grid units disappears
 * there, so nothing below relies on detail at that scale.
 */
const GEOMETRY: Record<MarkId, ReactElement> = {
  // ── Sigil / seal ──────────────────────────────────────────────────────────
  seal: (
    <>
      <circle cx="16" cy="16" r="13" stroke="currentColor" strokeWidth="2" />
      <path d="M16 5.5 L26.5 16 L16 26.5 L5.5 16 Z" stroke="currentColor" strokeWidth="2" />
      <circle cx="16" cy="16" r="2" fill="currentColor" />
    </>
  ),
  orbit: (
    <>
      <circle cx="16" cy="16" r="13" stroke="currentColor" strokeWidth="2" />
      <path d="M16 3 V29" stroke="currentColor" strokeWidth="2" />
      <circle cx="25.2" cy="22.5" r="2.8" fill="currentColor" />
    </>
  ),
  vesica: (
    <>
      <circle cx="11.5" cy="16" r="9" stroke="currentColor" strokeWidth="2" />
      <circle cx="20.5" cy="16" r="9" stroke="currentColor" strokeWidth="2" />
    </>
  ),
  sigil: (
    <>
      <circle cx="16" cy="16" r="13" stroke="currentColor" strokeWidth="2" />
      <path d="M16 4.5 L25.96 21.75 H6.04 Z" stroke="currentColor" strokeWidth="2" />
    </>
  ),

  // ── Locked geometry ───────────────────────────────────────────────────────
  interlock: (
    <>
      <rect x="3" y="3" width="17" height="17" stroke="currentColor" strokeWidth="2" />
      <rect x="12" y="12" width="17" height="17" stroke="currentColor" strokeWidth="2" />
      <rect x="12" y="12" width="8" height="8" fill="currentColor" />
    </>
  ),
  dovetail: (
    <>
      <rect x="3" y="3" width="26" height="26" stroke="currentColor" strokeWidth="2" />
      <path d="M3 19 H12 V11 H20 V21 H29" stroke="currentColor" strokeWidth="2" />
    </>
  ),
  bind: (
    <>
      <rect x="2.5" y="10" width="11" height="11" stroke="currentColor" strokeWidth="2" />
      <rect x="18.5" y="10" width="11" height="11" stroke="currentColor" strokeWidth="2" />
      <path d="M13.5 15.5 H18.5" stroke="currentColor" strokeWidth="2" />
    </>
  ),
  nested: (
    <>
      <rect x="3" y="3" width="26" height="26" stroke="currentColor" strokeWidth="2" />
      <rect x="10" y="10" width="12" height="12" stroke="currentColor" strokeWidth="2" />
      <rect x="14.5" y="14.5" width="3" height="3" fill="currentColor" />
    </>
  ),

  // ── Bracket / delimiter ───────────────────────────────────────────────────
  held: (
    <>
      <path d="M11 4 H5 V28 H11" stroke="currentColor" strokeWidth="2" />
      <path d="M21 4 H27 V28 H21" stroke="currentColor" strokeWidth="2" />
      <rect x="13.5" y="10" width="5" height="12" fill="currentColor" />
    </>
  ),
  tally: (
    <>
      <path d="M8 6 V26" stroke="currentColor" strokeWidth="2" />
      <path d="M16 6 V26" stroke="currentColor" strokeWidth="2" />
      <path d="M24 6 V26" stroke="currentColor" strokeWidth="2" />
      <path d="M4.5 23 L27.5 9" stroke="currentColor" strokeWidth="2" />
    </>
  ),
  double: (
    <>
      <path d="M12 4 H5 V28 H12" stroke="currentColor" strokeWidth="2" />
      <path d="M9 4 V28" stroke="currentColor" strokeWidth="2" />
      <path d="M20 4 H27 V28 H20" stroke="currentColor" strokeWidth="2" />
      <path d="M23 4 V28" stroke="currentColor" strokeWidth="2" />
    </>
  ),
  corners: (
    <>
      <path d="M3 10 V3 H10" stroke="currentColor" strokeWidth="2" />
      <path d="M22 3 H29 V10" stroke="currentColor" strokeWidth="2" />
      <path d="M29 22 V29 H22" stroke="currentColor" strokeWidth="2" />
      <path d="M10 29 H3 V22" stroke="currentColor" strokeWidth="2" />
      <circle cx="16" cy="16" r="2.5" fill="currentColor" />
    </>
  ),
}

export type BrandMarkProps = Omit<SVGProps<SVGSVGElement>, 'children'> & {
  size?: BrandMarkSize
  className?: string
  title?: string
  /**
   * Render a specific candidate instead of the active selection. Used by the
   * lab's mark sheet to show all twelve at once; app surfaces omit it so they
   * follow whatever is currently selected.
   */
  mark?: MarkId
}

export function BrandMark({
  size = 'xs',
  className,
  title,
  mark,
  ...rest
}: BrandMarkProps) {
  const active = useMarkId()
  const resolved = mark ?? active
  const px = SIZES[size]
  const labelled = Boolean(title)
  const root = ['ds-brand-mark', className].filter(Boolean).join(' ')
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 32 32"
      width={px}
      height={px}
      fill="none"
      className={root}
      role={labelled ? 'img' : undefined}
      aria-hidden={labelled ? undefined : true}
      focusable="false"
      {...rest}
    >
      {title ? <title>{title}</title> : null}
      {GEOMETRY[resolved] ?? GEOMETRY.seal}
    </svg>
  )
}
