import { MetadataStatusBadge, type MetadataStatus } from './Status'

export interface MetadataSummaryProps {
  uri?: string
  contentHash?: string
  status: MetadataStatus
  updatedAt?: string
}

/**
 * Compact static metadata summary — pairs a status badge with the (uri, hash,
 * updatedAt) tuple the protocol stores on-chain. Use when the caller already
 * has the values in hand and just needs a presentational block. For data-driven
 * fetching with refetch / mismatch banner / raw JSON, use
 * `components/metadata/MetadataBlock` instead.
 */
export function MetadataSummary({ uri, contentHash, status, updatedAt }: MetadataSummaryProps) {
  return (
    <div className="ds-metadata-block">
      <div className="ds-metadata-block-header">
        <span className="ds-label">metadata</span>
        <MetadataStatusBadge status={status} />
      </div>
      {(uri || contentHash) && (
        <div className="ds-metadata-block-row">
          {uri && (
            <>
              <span className="ds-metadata-block-label">uri</span>
              <span className="ds-metadata-block-value">
                <a href={uri} target="_blank" rel="noreferrer">{uri}</a>
              </span>
            </>
          )}
          {contentHash && (
            <>
              <span className="ds-metadata-block-label">hash</span>
              <span className="ds-metadata-block-value">{contentHash}</span>
            </>
          )}
          {updatedAt && (
            <>
              <span className="ds-metadata-block-label">updated</span>
              <span className="ds-metadata-block-value">{updatedAt}</span>
            </>
          )}
        </div>
      )}
    </div>
  )
}
