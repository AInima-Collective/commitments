import type { ReactNode } from 'react'
import { EntityLogo } from '../ui'
import { rewriteIpfsURI } from '../../lib/ipfs'

/**
 * Curator descriptor extracted from a vault.v1 metadata payload (or any
 * similarly-shaped structure). All fields are optional except `name`; the
 * card renders gracefully when sparse.
 */
export interface VaultCurator {
  name: string
  description?: string
  logoURI?: string
  website?: string
  twitter?: string
}

export interface CuratorCardProps {
  curator: VaultCurator
  /** Eyebrow above the curator name. Defaults to "Maintained by" — the
   *  card describes who keeps the vault's metadata current, not who
   *  controls the funds. Override only when the surrounding section
   *  clarifies the role another way. */
  label?: string
  /**
   * Authority disclaimer rendered after the description. Defaults to a
   * one-liner clarifying the curator has no on-chain control. Pass `null`
   * to suppress (e.g. when the parent section already states this), or
   * a custom node to override the wording.
   */
  disclaimer?: ReactNode | null
}

const DEFAULT_DISCLAIMER: ReactNode = (
  <p className="ds-curator-card-disclaimer ds-text-xs ds-subtle">
    Maintains metadata only — no on-chain authority over deposits.
  </p>
)

/**
 * `CuratorCard` — surfaces who maintains a vault's config and risk
 * parameters. Reads from the `curator` block of the `vault.v1` metadata
 * schema. Informational only — the protocol does not grant the curator
 * on-chain authority over deposits, and the default disclaimer makes
 * that explicit to the user (the contract comment alone wasn't reaching
 * the surface).
 *
 * Designed to slot into the vault overview page next to a `StrategyCard`,
 * but the shape works anywhere a "who runs this" hero is needed.
 */
export function CuratorCard({
  curator,
  label = 'Maintained by',
  disclaimer = DEFAULT_DISCLAIMER,
}: CuratorCardProps) {
  const websiteHref = curator.website ? rewriteIpfsURI(curator.website) : null
  const twitterHref = curator.twitter ? rewriteIpfsURI(curator.twitter) : null
  const logoSrc = curator.logoURI ? rewriteIpfsURI(curator.logoURI) : null
  const hasLinks = Boolean(websiteHref || twitterHref)
  return (
    <article className="ds-card ds-curator-card">
      <header className="ds-curator-card-head">
        <EntityLogo name={curator.name} src={logoSrc ?? undefined} size="lg" />
        <div className="ds-stack ds-stack-1">
          <span className="ds-page-eyebrow">{label.toUpperCase()}</span>
          <h3 className="ds-curator-card-title">{curator.name}</h3>
        </div>
      </header>
      {curator.description && <p className="ds-curator-card-body">{curator.description}</p>}
      {disclaimer}
      {hasLinks && (
        <div className="ds-curator-card-links">
          {websiteHref && (
            <a href={websiteHref} target="_blank" rel="noopener noreferrer">
              Website
              <span className="ds-sr-only"> for {curator.name}</span>
              <span aria-hidden="true"> ↗</span>
            </a>
          )}
          {twitterHref && (
            <a href={twitterHref} target="_blank" rel="noopener noreferrer">
              Twitter
              <span className="ds-sr-only"> for {curator.name}</span>
              <span aria-hidden="true"> ↗</span>
            </a>
          )}
        </div>
      )}
    </article>
  )
}
