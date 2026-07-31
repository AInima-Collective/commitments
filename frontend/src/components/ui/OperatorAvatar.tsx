export type OperatorAvatarSize = 'sm' | 'md' | 'lg' | 'xl'

const SIZES: Record<OperatorAvatarSize, number> = {
  sm: 20,
  md: 32,
  lg: 48,
  xl: 72,
}

export type OperatorAvatarProps = {
  /** Display name. First-letter pair becomes the monogram when no logo is set. */
  name?: string
  /** Operator address. Seeds a deterministic placeholder gradient. */
  address?: string
  /** Logo URL (off-chain metadata.logoURI). Wins over the placeholder. */
  src?: string
  size?: OperatorAvatarSize
  className?: string
  title?: string
}

function initials(name?: string, address?: string): string {
  if (name) {
    const cleaned = name.trim().replace(/[^a-zA-Z0-9 ]+/g, '')
    if (cleaned) {
      const tokens = cleaned.split(/\s+/).filter(Boolean)
      if (tokens.length >= 2) return (tokens[0][0] + tokens[1][0]).toUpperCase()
      return cleaned.slice(0, 2).toUpperCase()
    }
  }
  if (address && address.length >= 4) return address.slice(2, 4).toUpperCase()
  return '?'
}

/**
 * Hash an address into two stable hues. Saturation kept low so the placeholder
 * reads as a weathered metal token, not a colored sticker — preserves the
 * monochrome design language while still giving each operator visual identity.
 */
function placeholderGradient(address?: string): string {
  if (!address) {
    return 'linear-gradient(135deg, var(--surface-3), var(--surface-2))'
  }
  let h1 = 0
  let h2 = 0
  for (let i = 2; i < Math.min(address.length, 11); i++) h1 = (h1 * 31 + address.charCodeAt(i)) >>> 0
  for (let i = 11; i < Math.min(address.length, 22); i++) h2 = (h2 * 31 + address.charCodeAt(i)) >>> 0
  return `linear-gradient(135deg, hsl(${h1 % 360}, 22%, 34%), hsl(${h2 % 360}, 18%, 18%))`
}

/**
 * Operator avatar. Resolution order:
 * 1. `src` URL (off-chain logo)
 * 2. Address-seeded gradient placeholder + initials monogram
 *
 * Always preserves layout dimensions so async logo loads don't shift the row.
 */
export function OperatorAvatar({
  name,
  address,
  src,
  size = 'md',
  className,
  title,
}: OperatorAvatarProps) {
  const sizePx = SIZES[size]
  const root = ['ds-operator-avatar', className].filter(Boolean).join(' ')
  const tooltip = title ?? name ?? address ?? 'operator'
  const style = { width: sizePx, height: sizePx }

  if (src) {
    return (
      <img
        src={src}
        alt={name ?? address ?? 'operator'}
        title={tooltip}
        className={root}
        style={style}
        loading="lazy"
        decoding="async"
      />
    )
  }

  const text = initials(name, address)
  const bg = placeholderGradient(address)

  return (
    <span
      className={`${root} ds-operator-avatar--placeholder`}
      style={{ ...style, background: bg }}
      title={tooltip}
      role="img"
      aria-label={name ?? address ?? 'operator'}
    >
      <span className="ds-operator-avatar-text" style={{ fontSize: Math.max(10, sizePx * 0.4) }}>
        {text}
      </span>
    </span>
  )
}
