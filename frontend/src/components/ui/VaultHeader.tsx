import type { ReactNode } from 'react'

export type VaultHeaderAccent = 'neutral' | 'accent' | 'success' | 'warn' | 'danger'
export type VaultHeaderStatTone = 'neutral' | 'success' | 'warn' | 'danger' | 'accent'

export interface VaultHeaderStat {
  label: string
  value: ReactNode
  /** Optional sub-line (delta tag, breakdown, qualifier). */
  meta?: ReactNode
  /** Tone applied to the value. */
  tone?: VaultHeaderStatTone
  /** Mark this stat as the headline — paints the rule in `--accent` and bumps
   * the value to display size. Use sparingly (typically APY or TVL). */
  emphasis?: boolean
}

export interface VaultHeaderProps {
  /** Primary identity glyph — typically a `<TokenIcon size="xl" />`. */
  icon?: ReactNode
  /** Small, uppercase strap above the title (e.g. "Delta-neutral · Base"). */
  eyebrow?: ReactNode
  /** Vault headline. Required. */
  title: ReactNode
  /** Short strategy summary (1–2 lines). Renders under the title. */
  subtitle?: ReactNode
  /** Secondary identity row — chain badge, contract address, curator, etc.
   * Caller-rendered so `<AddressDisplay>`, `<TokenChip>`, links, and copy
   * buttons can compose freely. */
  meta?: ReactNode
  /** Status badge cluster (audited / paused / capacity-full). */
  badges?: ReactNode
  /** Headline stats row. Grid auto-fits at minmax(180px, 1fr). */
  stats?: VaultHeaderStat[]
  /** Primary CTAs — typically Deposit / Withdraw `<Button>`s. */
  actions?: ReactNode
  /** Optional aside slot below stats — capacity meter, sparkline, health gauge. */
  aside?: ReactNode
  /** Tone of the top stripe. Defaults to `accent`. */
  accent?: VaultHeaderAccent
}

/**
 * VaultHeader — page hero for any DeFi vault surface.
 *
 * Lays out three regions: identity (icon + title + meta), actions/badges
 * (right rail at md+), and a stats row beneath. An optional `aside` slot
 * lets callers drop in a {@link CapacityMeter}, {@link YieldSparkline}, or
 * {@link HealthGauge} below the stats without escaping the bordered card.
 *
 * Composition: every slot is a `ReactNode`, so callers wire identity strings,
 * `<TokenIcon>`, `<AddressDisplay>`, `<Button>`, and any other primitive
 * directly. `stats` is the single structured prop because it gets typographic
 * alignment for free — caller still supplies value `ReactNode`s. The
 * component never names a protocol concept (commitments, restaking, RWA);
 * caller-supplied content carries the meaning.
 */
export function VaultHeader({
  icon,
  eyebrow,
  title,
  subtitle,
  meta,
  badges,
  stats,
  actions,
  aside,
  accent = 'accent',
}: VaultHeaderProps) {
  const hasSide = Boolean(badges) || Boolean(actions)
  const hasStats = !!stats && stats.length > 0
  return (
    <header className="ds-vault-header" data-accent={accent}>
      <div className="ds-vault-header-stripe" aria-hidden="true" />
      <div className="ds-vault-header-top">
        {icon && <div className="ds-vault-header-icon">{icon}</div>}
        <div className="ds-vault-header-identity">
          {eyebrow && <span className="ds-vault-header-eyebrow">{eyebrow}</span>}
          <h1 className="ds-vault-header-title">{title}</h1>
          {subtitle && <p className="ds-vault-header-subtitle">{subtitle}</p>}
          {meta && <div className="ds-vault-header-meta">{meta}</div>}
        </div>
        {hasSide && (
          <div className="ds-vault-header-side">
            {badges && <div className="ds-vault-header-badges">{badges}</div>}
            {actions && <div className="ds-vault-header-actions">{actions}</div>}
          </div>
        )}
      </div>
      {hasStats && (
        <ul className="ds-vault-header-stats">
          {stats.map((s, i) => (
            <li
              key={`${i}-${s.label}`}
              className="ds-vault-header-stat"
              data-emphasis={s.emphasis ? 'true' : 'false'}
            >
              <span className="ds-vault-header-stat-label">{s.label}</span>
              <span
                className="ds-vault-header-stat-value"
                data-tone={s.tone ?? 'neutral'}
              >
                {s.value}
              </span>
              {s.meta && <span className="ds-vault-header-stat-meta">{s.meta}</span>}
            </li>
          ))}
        </ul>
      )}
      {aside && <div className="ds-vault-header-aside">{aside}</div>}
    </header>
  )
}
