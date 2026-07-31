import { type MetadataTrust } from '../../lib/commitmentMetadata'

export type MetadataTrustBadgeSize = 'xs' | 'sm'

export interface MetadataTrustBadgeProps {
  /** Classification from `metadataTrust(row)`. */
  trust: MetadataTrust
  size?: MetadataTrustBadgeSize
  /**
   * Render a badge for `attested` too. Default false: on a populated list a
   * verified hash is the norm, and a badge on every row is noise that trains
   * people to ignore the badge on the row that matters. Detail surfaces, where
   * provenance is the subject, pass `true`.
   */
  showAttested?: boolean
  /** Glyph only, with the label moved to `title=`. For dense list rows. */
  compact?: boolean
  className?: string
}

/**
 * Why a row's off-chain text is, or is not, being trusted.
 *
 * Distinct from `MetadataStatusBadge`, which collapses "the hash does not
 * match" and "nothing could be fetched" into a single `invalid`. Those are
 * different situations: one is a document that changed after being attested,
 * the other is a document nobody can see. They warrant different tone and
 * different words, so this badge keeps all five levels apart.
 *
 * `none` renders nothing — a commitment that was never named is ordinary, not
 * a problem, and its derived label already says so.
 */
export function MetadataTrustBadge({
  trust,
  size = 'xs',
  showAttested = false,
  compact = false,
  className,
}: MetadataTrustBadgeProps) {
  if (trust === 'none') return null
  if (trust === 'attested' && !showAttested) return null

  const { glyph, label, hint, tone } = TRUST_PRESENTATION[trust]
  const cls = ['ds-trust-badge', className].filter(Boolean).join(' ')

  return (
    <span className={cls} data-tone={tone} data-size={size} title={hint}>
      <span className="ds-trust-badge-glyph" aria-hidden>
        {glyph}
      </span>
      {compact ? <span className="ds-sr-only">{label}</span> : <span>{label}</span>}
    </span>
  )
}

const TRUST_PRESENTATION: Record<
  Exclude<MetadataTrust, 'none'>,
  { glyph: string; label: string; hint: string; tone: string }
> = {
  attested: {
    glyph: '✓',
    label: 'attested',
    hint: 'The content at this URI hashes to the value posted on chain when the commitment was created.',
    tone: 'success',
  },
  unattested: {
    glyph: '·',
    label: 'unattested',
    hint: 'No content hash was posted on chain, so nothing verifies this text. Whoever controls the URI can change it at any time.',
    tone: 'neutral',
  },
  mismatch: {
    glyph: '✗',
    label: 'hash mismatch',
    hint: 'The content at this URI no longer hashes to the value attested on chain. The on-chain hash is authoritative; treat the displayed text as unverified.',
    tone: 'danger',
  },
  unreachable: {
    glyph: '?',
    label: 'unreachable',
    hint: 'The metadata URI could not be fetched, so nothing about this commitment could be read off chain.',
    tone: 'warn',
  },
}
