import { type Address } from 'viem'
import { useForfeitLedger, type ForfeitEvent, type ForfeitEventKind } from '../../hooks/useForfeitLedger'
import { AddressDisplay, Notice, Skeleton } from '../ui'
import { formatBps } from '../../utils/commitments'

interface ForfeitTimelineProps {
  vaultAddress: Address | undefined
  commitmentId: bigint
}

const KIND_LABEL: Record<ForfeitEventKind, string> = {
  initiated: 'Forfeit initiated',
  executed: 'Forfeit executed',
  cancelled: 'Forfeit cancelled',
  cancelledStale: 'Stale forfeit cancelled',
}

function formatTimestamp(ts: bigint): string {
  return new Date(Number(ts) * 1000).toISOString().slice(0, 16).replace('T', ' ')
}

/**
 * Per-commitment forfeiture lifecycle timeline. Reads the vault-scoped
 * `/vaults/:vault/forfeit-ledger` feed and filters down to forfeit events for
 * this commitment, newest first.
 */
export function ForfeitTimeline({ vaultAddress, commitmentId }: ForfeitTimelineProps) {
  const { data, isLoading, error } = useForfeitLedger({ vaultAddress })

  if (!vaultAddress) {
    return (
      <Notice tone="neutral" size="sm">
        No backing vault recorded for this commitment — timeline unavailable.
      </Notice>
    )
  }

  if (isLoading) {
    return <Skeleton height={48} />
  }

  if (error) {
    return (
      <Notice tone="danger" size="sm" title="Failed to load timeline">
        {error instanceof Error ? error.message : 'Indexer request failed.'}
      </Notice>
    )
  }

  const events = (data?.events ?? []).filter(
    (e): e is ForfeitEvent => e.kind === 'forfeit' && e.commitmentId === commitmentId,
  )

  if (events.length === 0) {
    return (
      <Notice tone="neutral" size="sm">
        No forfeiture events recorded yet for this commitment.
      </Notice>
    )
  }

  return (
    <ol className="ds-stack ds-stack-2" style={{ listStyle: 'none', margin: 0, padding: 0 }}>
      {events.map((e) => (
        <li key={`${e.txHash}-${e.forfeitKind}`} className="ds-card ds-stack ds-stack-1">
          <div className="ds-row ds-row-2" style={{ justifyContent: 'space-between' }}>
            <span className="ds-text-base" style={{ fontWeight: 500 }}>
              {KIND_LABEL[e.forfeitKind]}
            </span>
            <span className="ds-text-xs ds-muted ds-mono-num">{formatTimestamp(e.timestamp)}</span>
          </div>
          <div className="ds-row ds-row-2" style={{ flexWrap: 'wrap', gap: 'var(--space-2)' }}>
            {e.penaltyBps !== null && (
              <span className="ds-text-xs ds-subtle">penalty {formatBps(e.penaltyBps)}</span>
            )}
            {e.challengeEnd !== null && e.forfeitKind === 'initiated' && (
              <span className="ds-text-xs ds-subtle">
                window closes {formatTimestamp(e.challengeEnd)}
              </span>
            )}
            <span className="ds-text-xs ds-subtle ds-row" style={{ gap: 'var(--space-1)' }}>
              arbiter <AddressDisplay address={e.arbiter} />
            </span>
          </div>
        </li>
      ))}
    </ol>
  )
}
