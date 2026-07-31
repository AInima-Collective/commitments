import { type Address } from 'viem'
import { AddressDisplay } from '../ui'
import { rewriteIpfsURI } from '../../lib/ipfs'

export interface OperatorProfileCardProps {
  /** Parsed operator.v1 JSON (or any similar shape). Missing fields fall back gracefully. */
  profile: Record<string, unknown> | null
  /** When true, labels the card as a preview (used inside the editor). */
  preview?: boolean
  /** Optional empty-state hint when profile is null AND viewer is the operator. */
  emptyHint?: string
  /** On-chain service signing key, rendered as a row under P2P (not metadata). */
  signingKey?: Address
}

function asString(v: unknown): string | null {
  return typeof v === 'string' && v.length > 0 ? v : null
}

/**
 * `OperatorProfileCard` — Phase 26-02 v2.4 design-system presentation card
 * for an operator's off-chain metadata (operator.v1 JSON shape).
 *
 * Outer chrome: `<article className="ds-card">` so the card composes into the
 * design system. Internal class family `.operator-profile-*` (defined in
 * theme.css) is preserved as a structural skeleton — Phase 28 LCK-01 owns
 * its final cleanup once the page is fully untokenized. No inline color
 * tokens or hex literals survive.
 */
export function OperatorProfileCard({ profile, preview = false, emptyHint, signingKey }: OperatorProfileCardProps) {
  const signingKeyRow = signingKey ? (
    <div className="operator-profile-row">
      <span className="ds-muted">SIGNING KEY</span>{' '}
      <AddressDisplay address={signingKey} />
    </div>
  ) : null

  if (profile === null) {
    if (emptyHint || signingKeyRow) {
      return (
        <article className="ds-card">
          {emptyHint && <p className="ds-muted">{emptyHint}</p>}
          {signingKeyRow}
        </article>
      )
    }
    return null
  }

  const name = asString(profile.name) ?? '(unnamed operator)'
  const description = asString(profile.description)
  const logoURI = asString(profile.logoURI)
  const website = asString(profile.website)
  const p2p = asString(profile.p2pEndpoint)
  const social = (profile.social as Record<string, unknown> | undefined) ?? {}
  const twitter = asString(social.twitter)
  const github = asString(social.github)
  const email = asString(social.email)

  const logoSrc = logoURI ? rewriteIpfsURI(logoURI) : null
  const websiteHref = website ? rewriteIpfsURI(website) : null
  const twitterHref = twitter ? rewriteIpfsURI(twitter) : null
  const githubHref = github ? rewriteIpfsURI(github) : null

  return (
    <article className="ds-card">
      <header
        style={{
          display: 'flex',
          gap: 'var(--space-3)',
          alignItems: 'center',
          marginBottom: 'var(--space-3)',
        }}
      >
        {logoSrc ? (
          <img
            src={logoSrc}
            alt={`${name} logo`}
            style={{ width: 48, height: 48, objectFit: 'cover' }}
          />
        ) : (
          <div
            aria-hidden
            style={{
              width: 48,
              height: 48,
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              border: '1px solid var(--border)',
              fontFamily: 'var(--font-mono)',
            }}
          >
            {name.slice(0, 1).toUpperCase()}
          </div>
        )}
        <h3 style={{ margin: 0 }}>{preview ? `PREVIEW: ${name}` : name}</h3>
      </header>

      {description && <p>{description}</p>}

      {websiteHref && (
        <div className="operator-profile-row">
          <span className="ds-muted">WEBSITE</span>{' '}
          <a href={websiteHref} target="_blank" rel="noopener noreferrer">
            {website}
          </a>
        </div>
      )}

      {p2p && (
        <div className="operator-profile-row">
          <span className="ds-muted">P2P</span> <span>{p2p}</span>
        </div>
      )}

      {signingKeyRow}

      {(twitter || github || email) && (
        <div className="operator-profile-row">
          <span className="ds-muted">SOCIAL</span>{' '}
          <span style={{ display: 'inline-flex', gap: 8, flexWrap: 'wrap' }}>
            {twitter && (twitterHref ? (
              <a href={twitterHref} target="_blank" rel="noopener noreferrer">
                twitter
              </a>
            ) : (
              // rewriteIpfsURI rejected the scheme (e.g. bare "twitter.com/handle") — render raw
              // string as plain text so the operator sees the value was rejected rather than silently dropped.
              <span title="unsupported scheme — URI rejected">twitter: {twitter}</span>
            ))}
            {github && (githubHref ? (
              <a href={githubHref} target="_blank" rel="noopener noreferrer">
                github
              </a>
            ) : (
              <span title="unsupported scheme — URI rejected">github: {github}</span>
            ))}
            {email && (
              <a href={`mailto:${email}`} rel="noopener noreferrer">{email}</a>
            )}
          </span>
        </div>
      )}
    </article>
  )
}
