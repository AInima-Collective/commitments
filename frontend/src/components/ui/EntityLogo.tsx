export type EntityLogoSize = 'sm' | 'md' | 'lg' | 'xl'

const SIZES: Record<EntityLogoSize, number> = {
  sm: 32,
  md: 48,
  lg: 64,
  xl: 96,
}

export interface EntityLogoProps {
  /** Entity display name. First letter pair becomes the monogram fallback. */
  name?: string
  /** Logo URL — typically vault.v1 / service.v1 metadata `logoURI`. */
  src?: string
  size?: EntityLogoSize
  /**
   * Visual shape. Defaults to `square` to match the design system's
   * `--radius: 0` sharp geometry — services, vaults, and brand logos read
   * as tiles, not portraits. `circle` is available for the operator-style
   * avatar shape.
   */
  shape?: 'square' | 'circle'
  className?: string
  /** Tooltip override; falls back to `name`. */
  title?: string
}

function initials(name?: string): string {
  if (!name) return '?'
  const cleaned = name.trim().replace(/[^a-zA-Z0-9 ]+/g, '')
  if (!cleaned) return '?'
  const tokens = cleaned.split(/\s+/).filter(Boolean)
  if (tokens.length >= 2) return (tokens[0][0] + tokens[1][0]).toUpperCase()
  return cleaned.slice(0, 2).toUpperCase()
}

/**
 * `EntityLogo` — square logo tile for branded entities (services, vaults,
 * curators). Reads the off-chain metadata `logoURI` when available and
 * falls back to a monogram on a flat surface tile that picks up the
 * design system's surface + border tokens — no saturated gradients,
 * no theme-bypassing colors.
 *
 * Distinct from {@link OperatorAvatar}, which is round and seeded by
 * address for deterministic placeholders. Use this primitive whenever
 * the surface is "this is the brand" rather than "this is an actor."
 */
export function EntityLogo({
  name,
  src,
  size = 'md',
  shape = 'square',
  className,
  title,
}: EntityLogoProps) {
  const sizePx = SIZES[size]
  const tooltip = title ?? name ?? 'entity'
  const root = [
    'ds-entity-logo',
    `ds-entity-logo--${size}`,
    `ds-entity-logo--${shape}`,
    className,
  ]
    .filter(Boolean)
    .join(' ')
  const style = { width: sizePx, height: sizePx }

  if (src) {
    return (
      <img
        src={src}
        alt={name ?? 'logo'}
        title={tooltip}
        className={root}
        style={style}
        loading="lazy"
        decoding="async"
      />
    )
  }

  return (
    <span
      className={`${root} ds-entity-logo--placeholder`}
      style={style}
      title={tooltip}
      role="img"
      aria-label={name ?? 'entity'}
    >
      <span className="ds-entity-logo-text" style={{ fontSize: Math.max(11, sizePx * 0.34) }}>
        {initials(name)}
      </span>
    </span>
  )
}
