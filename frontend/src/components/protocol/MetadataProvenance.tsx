import { CopyButton, Disclosure, Notice, SourceBlock } from '../ui'
import { rewriteIpfsURI } from '../../lib/ipfs'
import { type MetadataTrust } from '../../lib/commitmentMetadata'
import { MetadataTrustBadge } from './MetadataTrustBadge'

export interface MetadataProvenanceProps {
  /** On-chain `metadataURI`. */
  uri?: string
  /** On-chain `metadataHash` / `contentHash`. Omit when zero or absent. */
  hash?: string
  /** Classification from `metadataTrust(row)`. */
  trust: MetadataTrust
  /** Parsed payload, for the raw dump. */
  content?: Record<string, unknown> | null
  /** Fetched bytes that failed `JSON.parse`. */
  contentRaw?: string | null
  /**
   * Open the raw dump on mount. True exactly when the payload's schema is one
   * this app does not render field by field — there the dump IS the content,
   * not a debugging affordance.
   */
  defaultRawOpen?: boolean
  /**
   * Re-read the record from the indexer. Note what this does NOT do: the
   * fetch-and-verify runs indexer-side when the record is indexed, so this
   * pulls whatever the indexer currently holds rather than re-checking the
   * URI. The label says so. Omit to hide the control.
   */
  onRefetch?: () => void
  /**
   * An off-chain title that was refused promotion, from
   * `commitmentLabel(...).withheldTitle`. Quoted inside the mismatch warning,
   * where it reads as evidence rather than as a name.
   */
  withheldTitle?: string
  className?: string
}

/**
 * Where a record's metadata came from and whether to believe it: URI, content
 * hash, verification outcome, raw payload.
 *
 * This is the debugging surface, and it belongs below the fold. It used to be
 * the most prominent metadata element on the commitment page, with a
 * pretty-printed JSON dump open by default while the fields that describe what
 * the commitment is about went unrendered.
 *
 * Schema-agnostic on purpose. Commitments, agreement proposals, operators,
 * vaults, and services all carry the same `(uri, hash, status)` triple and all
 * have the same problem, so nothing here knows what a commitment is.
 */
export function MetadataProvenance({
  uri,
  hash,
  trust,
  content,
  contentRaw,
  defaultRawOpen = false,
  onRefetch,
  withheldTitle,
  className,
}: MetadataProvenanceProps) {
  if (trust === 'none' && !uri) return null

  const followable = uri ? rewriteIpfsURI(uri) : null
  const cls = ['ds-provenance', className].filter(Boolean).join(' ')

  return (
    <div className={cls}>
      {trust === 'mismatch' && (
        <Notice tone="danger" size="sm" title="Content does not match its attested hash">
          <div className="ds-stack ds-stack-2">
            <span>
              The document at this URI has changed since the commitment was created, or was never
              the document that was attested. The on-chain hash is authoritative; nothing below is
              verified.
            </span>
            {withheldTitle && (
              <span className="ds-text-xs">
                It currently calls itself <q>{withheldTitle}</q>. That name is not being used
                anywhere else in the app.
              </span>
            )}
          </div>
        </Notice>
      )}

      {trust === 'unreachable' && (
        <Notice tone="warn" size="sm" title="Metadata could not be fetched">
          Nothing was readable at this URI, so this commitment has no description beyond what its
          on-chain terms say. The URI is below if you want to try it yourself.
        </Notice>
      )}

      <dl className="ds-provenance-grid">
        <dt>verification</dt>
        <dd>
          {trust === 'none' ? (
            // A URI with no classification means the indexer has not resolved
            // it yet, which is a different fact from "nothing was attached".
            <span className="ds-subtle">{uri ? 'not checked yet' : 'no metadata attached'}</span>
          ) : (
            <MetadataTrustBadge trust={trust} showAttested size="sm" />
          )}
        </dd>

        {uri && (
          <>
            <dt>uri</dt>
            <dd>
              <span className="ds-provenance-value" title={uri}>
                {uri}
              </span>
              <span className="ds-provenance-actions">
                <CopyButton value={uri} label="Copy metadata URI" inline />
                {followable && (
                  <a
                    href={followable}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="ds-text-xs"
                  >
                    open
                  </a>
                )}
              </span>
            </dd>
          </>
        )}

        {hash && (
          <>
            <dt>content hash</dt>
            <dd>
              <span className="ds-provenance-value ds-mono-num" title={hash}>
                {`${hash.slice(0, 10)}…${hash.slice(-6)}`}
              </span>
              <span className="ds-provenance-actions">
                <CopyButton value={hash} label="Copy content hash" inline />
              </span>
            </dd>
          </>
        )}
      </dl>

      {content && (
        <Disclosure label="raw payload" defaultOpen={defaultRawOpen}>
          <SourceBlock
            label="metadata payload"
            language="json"
            source={JSON.stringify(content, null, 2)}
            defaultExpanded
          />
        </Disclosure>
      )}

      {!content && contentRaw && (
        <Disclosure label="raw payload (not valid json)" defaultOpen={defaultRawOpen}>
          <SourceBlock label="fetched bytes" source={contentRaw} defaultExpanded />
        </Disclosure>
      )}

      {onRefetch && (
        <button
          type="button"
          className="ds-btn ds-btn--sm"
          onClick={onRefetch}
          title="Re-reads what the indexer holds. The fetch and hash check run indexer-side when the record is indexed, so this will not re-check the URI itself."
        >
          reload
        </button>
      )}
    </div>
  )
}
