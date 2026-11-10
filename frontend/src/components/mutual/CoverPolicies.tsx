import { Notice, Skeleton, TokenAmount } from '../ui'
import { OperatorIdentity } from '../protocol'
import { useDisplayNow } from '../../hooks/useDisplayNow'
import { formatDuration } from '../../lib/format'
import type { MutualCoverBinding } from '../../hooks/useMutualCover'

interface CoverPoliciesProps {
  bindings: MutualCoverBinding[]
  decimals: number
  symbol: string
  isLoading: boolean
  isError: boolean
  /** True when no indexer is configured — the binding history is unavailable. */
  unavailable: boolean
}

/**
 * CoverPolicies — the per-policyholder cover bindings sold against a mutual
 * (who bought cover, how much, the premium they paid, and when it expires).
 * Indexer-sourced via {@link useMutualCover}; degrades to a clear notice when
 * the indexer is absent rather than implying "nobody has cover".
 */
export function CoverPolicies({
  bindings,
  decimals,
  symbol,
  isLoading,
  isError,
  unavailable,
}: CoverPoliciesProps) {
  const now = useDisplayNow()

  if (unavailable) {
    return (
      <Notice tone="info" size="sm" title="Cover policies unavailable">
        Live policy data is temporarily unavailable — please check back shortly.
      </Notice>
    )
  }

  if (isError) {
    return (
      <Notice tone="warn" size="sm" title="Couldn't load cover policies">
        The indexer's premium feed failed. Aggregate cover sold is still shown above.
      </Notice>
    )
  }

  if (isLoading && bindings.length === 0) {
    return (
      <div className="ds-stack ds-stack-2" aria-busy="true" aria-label="Loading cover policies">
        {[0, 1].map((i) => (
          <Skeleton key={i} shape="block" style={{ height: 48 }} />
        ))}
      </div>
    )
  }

  if (bindings.length === 0) {
    return (
      <Notice tone="neutral" size="sm" title="No cover bought yet">
        No policyholder has bound cover against this mutual. Buy cover above to be the first.
      </Notice>
    )
  }

  return (
    <div className="ds-stack ds-stack-2" aria-label="Cover policies">
      {bindings.map((b) => {
        const remaining = Number(b.expiry) - now
        const expired = !b.active || remaining <= 0
        return (
          <div
            key={b.id}
            className="ds-row"
            style={{
              justifyContent: 'space-between',
              alignItems: 'flex-start',
              gap: 'var(--space-2)',
              padding: 'var(--space-2) 0',
              borderBottom: '1px solid var(--border)',
            }}
          >
            <span className="ds-stack ds-stack-1">
              <OperatorIdentity address={b.policyholder} size="sm" />
              <span className="ds-text-xs ds-subtle">
                premium{' '}
                <TokenAmount amount={b.premiumPaid} decimals={decimals} symbol={symbol} compact size="inline" />{' '}
                · {expired ? 'expired' : `expires in ${formatDuration(remaining)}`}
              </span>
            </span>
            <span className="ds-stack ds-stack-1" style={{ alignItems: 'flex-end', flexShrink: 0 }}>
              <TokenAmount amount={b.notional} decimals={decimals} symbol={symbol} compact />
              <span className={`ds-badge ${expired ? 'ds-badge--muted' : 'ds-badge--success'}`}>
                {expired ? 'expired' : 'active'}
              </span>
            </span>
          </div>
        )
      })}
    </div>
  )
}
