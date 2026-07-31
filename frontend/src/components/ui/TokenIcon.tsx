import type { ReactNode, SVGProps } from 'react'

export type TokenIconSize = 'sm' | 'md' | 'lg' | 'xl'

const SIZES: Record<TokenIconSize, number> = {
  sm: 14,
  md: 20,
  lg: 32,
  xl: 48,
}

export type TokenIconProps = {
  symbol: string
  /** External image URL. Takes precedence over the bundled registry. */
  src?: string
  size?: TokenIconSize
  className?: string
  /** Override the hover tooltip. Defaults to the symbol. */
  title?: string
}

// ETH brand colors are intentionally NOT theme-tokenized: the official
// asset-mark colors are part of each token's brand identity and must remain
// stable across our light/dark themes. Replacing them with `var(--*)` would
// change brand recognition. These are accepted exceptions to LCK-01 hex ban.
/* eslint-disable no-restricted-syntax -- branded SVG asset colors; see TokenIcon comment above */
function EthGlyph(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg" {...props}>
      <circle cx="16" cy="16" r="16" fill="#627EEA" />
      <g fill="#FFF" fillRule="nonzero">
        <path fillOpacity={0.602} d="M16.498 4v8.87l7.497 3.35z" />
        <path d="M16.498 4 9 16.22l7.498-3.35z" />
        <path fillOpacity={0.602} d="M16.498 21.968v6.027L24 17.616z" />
        <path d="M16.498 27.995v-6.028L9 17.616z" />
        <path fillOpacity={0.2} d="m16.498 20.573 7.497-4.353-7.497-3.348z" />
        <path fillOpacity={0.602} d="m9 16.22 7.498 4.353v-7.701z" />
      </g>
    </svg>
  )
}

function TetherGlyph(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg" {...props}>
      <circle cx="16" cy="16" r="16" fill="#26A17B" />
      <path
        fill="#FFF"
        d="M17.922 17.383v-.002c-.11.008-.677.042-1.942.042-1.01 0-1.721-.03-1.971-.042v.003c-3.888-.171-6.79-.848-6.79-1.658 0-.809 2.902-1.486 6.79-1.66v2.644c.254.018.982.061 1.988.061 1.207 0 1.812-.05 1.925-.06v-2.643c3.88.173 6.775.85 6.775 1.658 0 .81-2.895 1.485-6.775 1.657m0-3.59v-2.366h5.414V7.819H8.595v3.608h5.414v2.365c-4.4.202-7.709 1.074-7.709 2.118 0 1.044 3.309 1.915 7.709 2.118v7.582h3.913v-7.584c4.393-.202 7.694-1.073 7.694-2.116 0-1.043-3.301-1.914-7.694-2.117"
      />
    </svg>
  )
}

function CommitmentGlyph(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg" {...props}>
      <circle cx="16" cy="16" r="16" fill="var(--accent)" />
      <circle cx="16" cy="16" r="9" fill="none" stroke="#FFF" strokeWidth="2" />
      <circle cx="16" cy="16" r="3" fill="#FFF" />
    </svg>
  )
}
/* eslint-enable no-restricted-syntax */

const SVG_REGISTRY: Record<string, (props: SVGProps<SVGSVGElement>) => ReactNode> = {
  ETH: EthGlyph,
  WETH: EthGlyph,
  CETH: CommitmentGlyph,
  USDT: TetherGlyph,
}

// Raster brand marks shipped from /public/assets. Takes precedence over the
// SVG registry so officially-licensed marks (USDC, ETH) render as the real
// artwork rather than a hand-drawn approximation.
const PNG_REGISTRY: Record<string, string> = {
  USDC: '/assets/usdc.png',
  ETH: '/assets/eth.png',
  WETH: '/assets/eth.png',
}

/**
 * Symbol → 1–3 letter monogram. Strips non-alphanumerics and uppercases.
 * Two letters by default; one for very-short or single-letter symbols.
 */
function monogramText(symbol: string): string {
  const cleaned = symbol.replace(/[^a-zA-Z0-9]/g, '').toUpperCase()
  if (cleaned.length <= 2) return cleaned
  // Prefer leading two chars; for camel-cased like "cETH" we already uppercase to "CETH"
  return cleaned.slice(0, 3)
}

/**
 * Token icon. Resolution order:
 * 1. `src` URL (external image)
 * 2. Bundled raster registry (USDC)
 * 3. Bundled SVG registry (ETH, WETH, cETH)
 * 4. Neutral monogram fallback
 *
 * The monogram preserves layout dimensions for unknown tokens — never breaks the row.
 */
export function TokenIcon({ symbol, src, size = 'md', className, title }: TokenIconProps) {
  const sizePx = SIZES[size]
  const root = ['ds-token-icon', className].filter(Boolean).join(' ')
  const style = { width: sizePx, height: sizePx }
  const tooltip = title ?? symbol

  const upper = symbol.toUpperCase()
  const resolvedSrc = src ?? PNG_REGISTRY[upper]
  if (resolvedSrc) {
    return (
      <img
        src={resolvedSrc}
        alt={symbol}
        title={tooltip}
        className={root}
        style={style}
        loading="lazy"
        decoding="async"
      />
    )
  }

  const Glyph = SVG_REGISTRY[upper]
  if (Glyph) {
    return (
      <span className={root} style={style} title={tooltip} role="img" aria-label={symbol}>
        <Glyph width={sizePx} height={sizePx} />
      </span>
    )
  }

  return (
    <span
      className={`${root} ds-token-icon--monogram`}
      style={style}
      title={tooltip}
      role="img"
      aria-label={symbol}
    >
      <span className="ds-token-icon-monogram-text">{monogramText(symbol)}</span>
    </span>
  )
}
