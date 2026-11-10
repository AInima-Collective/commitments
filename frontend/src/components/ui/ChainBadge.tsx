import type { ReactNode, SVGProps } from 'react'
import { anvil } from '../../config/anvil'

export type ChainBadgeSize = 'sm' | 'md' | 'lg'

const SIZES: Record<ChainBadgeSize, number> = { sm: 14, md: 18, lg: 24 }

export interface ChainBadgeProps {
  chainId: number
  /** Override the resolved chain name. */
  name?: string
  size?: ChainBadgeSize
  /** Hide the trailing chain name; render the glyph alone. */
  iconOnly?: boolean
  className?: string
}

interface ChainEntry {
  name: string
  Glyph: (props: SVGProps<SVGSVGElement>) => ReactNode
}

// Branded SVG marks live close to the components that consume them. Hex
// literals here are intentional brand colors — exempt from LCK-01 the same
// way TokenIcon's ETH glyph is.
/* eslint-disable no-restricted-syntax -- branded SVG asset colors */
function EthereumGlyph(props: SVGProps<SVGSVGElement>) {
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

function SepoliaGlyph(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg" {...props}>
      <circle cx="16" cy="16" r="16" fill="#CFB5F0" />
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
/* eslint-enable no-restricted-syntax */

function AnvilGlyph(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg" {...props}>
      <circle cx="16" cy="16" r="16" fill="var(--surface-2)" />
      <circle cx="16" cy="16" r="15" fill="none" stroke="var(--border-strong)" strokeWidth="1" />
      <text
        x="16"
        y="20"
        textAnchor="middle"
        fontFamily="var(--font-mono, monospace)"
        fontSize="10"
        fontWeight="600"
        fill="var(--text-default)"
      >
        AN
      </text>
    </svg>
  )
}

const REGISTRY: Record<number, ChainEntry> = {
  1: { name: 'Ethereum', Glyph: EthereumGlyph },
  11155111: { name: 'Sepolia', Glyph: SepoliaGlyph },
  [anvil.id]: { name: 'Anvil', Glyph: AnvilGlyph },
}

/**
 * ChainBadge — small chain identity primitive. Renders a branded glyph plus
 * the chain name; falls back to a neutral monogram glyph and "Chain {id}"
 * label when the id isn't in the registry.
 *
 * Use in page headers, meta rows, and any surface where the user needs to
 * see *which network* they're on at a glance. Mirrors {@link TokenIcon}'s
 * shape so the two compose cleanly.
 */
export function ChainBadge({
  chainId,
  name,
  size = 'md',
  iconOnly = false,
  className,
}: ChainBadgeProps) {
  const entry = REGISTRY[chainId]
  const sizePx = SIZES[size]
  const resolvedName = name ?? entry?.name ?? `Chain ${chainId}`
  const Glyph = entry?.Glyph ?? AnvilGlyph
  const root = ['ds-chain-badge', className].filter(Boolean).join(' ')
  return (
    <span className={root} data-size={size} title={resolvedName}>
      <span
        className="ds-chain-badge-glyph"
        style={{ width: sizePx, height: sizePx }}
        role="img"
        aria-label={resolvedName}
      >
        <Glyph width={sizePx} height={sizePx} />
      </span>
      {!iconOnly && <span className="ds-chain-badge-name">{resolvedName}</span>}
    </span>
  )
}
