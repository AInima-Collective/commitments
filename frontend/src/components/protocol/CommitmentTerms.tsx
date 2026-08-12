import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Notice } from '../ui'
import { rewriteIpfsURI } from '../../lib/ipfs'
import { type MetadataTrust } from '../../lib/commitmentMetadata'
import { CommitmentTags } from './CommitmentTags'

export interface CommitmentTermsProps {
  /** Off-chain `description`. Markdown per the schema. */
  description?: string
  /** Off-chain `termsURI` — a link to the fuller terms document. */
  termsURI?: string
  /** Label for the terms link. `agreement.v1` calls its equivalent field an
   *  agreement document rather than terms. */
  termsLabel?: string
  /** Normalized tags from `metadataTags(row)`. */
  tags?: readonly string[]
  /** Off-chain `trustgraphsAttestationId`. */
  attestationId?: string
  /** Classification from `metadataTrust(row)`. Gates whether anything renders. */
  trust: MetadataTrust
  /** Makes tags clickable filters. */
  onSelectTag?: (tag: string) => void
  activeTags?: readonly string[]
  className?: string
}

/**
 * What a commitment is about: its prose description, a link to the document
 * that governs it, and its tags.
 *
 * This is the second thing a reader should meet after the amount, and until
 * now it did not exist. Two of the five documented `commitment.v1` fields
 * (`termsURI`, `tags`) were fetched, hash-verified, stored, and then rendered
 * nowhere except inside a collapsed JSON dump.
 *
 * ── Why this renders nothing for some trust levels ──────────────────────────
 *
 * `mismatch` and `unreachable` return null. A description is prose that a
 * reader will act on, and prose whose hash no longer matches is precisely the
 * payload an attacker would swap in. The provenance block handles those cases:
 * it says what went wrong, and quotes the offending text as evidence rather
 * than presenting it as terms.
 *
 * Markdown renders through react-markdown with no `rehype-raw`, so embedded
 * HTML stays inert text. Images are disallowed outright — an `<img>` in a
 * third-party description is a request the viewer's browser makes to a server
 * of the author's choosing, which leaks the reader's IP for no benefit.
 */
export function CommitmentTerms({
  description,
  termsURI,
  termsLabel = 'Full terms',
  tags,
  attestationId,
  trust,
  onSelectTag,
  activeTags,
  className,
}: CommitmentTermsProps) {
  if (trust === 'mismatch' || trust === 'unreachable' || trust === 'none') return null

  const hasTags = (tags?.length ?? 0) > 0
  if (!description && !termsURI && !hasTags && !attestationId) return null

  const termsHref = termsURI ? rewriteIpfsURI(termsURI) : null
  const cls = ['ds-terms', className].filter(Boolean).join(' ')

  return (
    <section className={cls} aria-label="terms">
      {trust === 'unattested' && (
        <Notice tone="info" size="sm">
          No content hash was posted for this commitment, so nothing on chain pins the text below.
          Whoever controls the URI can change it at any time.
        </Notice>
      )}

      {description && (
        <div className="ds-terms-prose">
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            disallowedElements={DISALLOWED}
            unwrapDisallowed
            components={{
              a: ({ href, children }) => {
                const safe = href ? rewriteIpfsURI(href) : null
                // A scheme the allowlist rejects renders as plain text: an
                // author does not get to decide what the reader's browser
                // navigates to just because they wrote a link.
                if (!safe) return <span>{children}</span>
                return (
                  <a href={safe} target="_blank" rel="noopener noreferrer nofollow">
                    {children}
                  </a>
                )
              },
            }}
          >
            {description}
          </ReactMarkdown>
        </div>
      )}

      {(termsHref || hasTags) && (
        <div className="ds-terms-meta">
          {termsHref && (
            <a
              className="ds-text-sm"
              href={termsHref}
              target="_blank"
              rel="noopener noreferrer"
              title={termsURI}
            >
              {termsLabel} ↗
            </a>
          )}
          {hasTags && (
            <CommitmentTags
              tags={tags ?? []}
              size="sm"
              onSelect={onSelectTag}
              active={activeTags}
            />
          )}
        </div>
      )}

      {termsURI && !termsHref && (
        <span className="ds-text-xs ds-subtle" title={termsURI}>
          Terms document uses a scheme this app will not open: {termsURI}
        </span>
      )}

      {attestationId && (
        <span className="ds-text-xs ds-subtle">
          Trustgraphs attestation: <code>{attestationId}</code>
        </span>
      )}
    </section>
  )
}

/** Raw HTML never renders; images never load; headings never compete with the page's own. */
const DISALLOWED = ['html', 'img', 'h1', 'h2', 'script', 'iframe']
