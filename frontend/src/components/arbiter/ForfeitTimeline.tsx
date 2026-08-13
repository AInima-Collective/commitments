import { type Address } from 'viem'
import {
  useCommitmentArbitration,
  type ManagerForfeitEventKind,
} from '../../hooks/useCommitmentArbitration'
import { AddressDisplay, Notice, Skeleton } from '../ui'
import { formatBps } from '../../utils/commitments'

interface ForfeitTimelineProps {
  managerAddress: Address
  commitmentId: bigint
}

const KIND_LABEL: Record<ManagerForfeitEventKind, string> = {
  initiated: 'Forfeit initiated',
  executed: 'Forfeit executed',
  cancelled: 'Forfeit cancelled',
  cancelledStale: 'Stale forfeit cancelled',
}

function formatTimestamp(ts: bigint): string {
  return new Date(Number(ts) * 1000).toISOString().slice(0, 16).replace('T', ' ')
}

/**
 * Per-commitment timeline from the manager+id scoped API. It works for raw
 * ERC-20 backing and cannot be truncated by unrelated vault activity.
 */
export function ForfeitTimeline({ managerAddress, commitmentId }: ForfeitTimelineProps) {
  const { data, isLoading, error, indexerOnline } = useCommitmentArbitration(
    commitmentId,
    managerAddress,
  )

  if (!indexerOnline) return <Notice tone="warn" size="sm">Forfeit history indexer unavailable.</Notice>

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

  const events = data?.events ?? []

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
        <li key={`${e.transactionHash}-${e.kind}`} className="ds-card ds-stack ds-stack-1">
          <div className="ds-row ds-row-2" style={{ justifyContent: 'space-between' }}>
            <span className="ds-text-base" style={{ fontWeight: 500 }}>
              {KIND_LABEL[e.kind]}
            </span>
            <span className="ds-text-xs ds-muted ds-mono-num">{formatTimestamp(e.timestamp)}</span>
          </div>
          <div className="ds-row ds-row-2" style={{ flexWrap: 'wrap', gap: 'var(--space-2)' }}>
            {e.penaltyBps !== null && (
              <span className="ds-text-xs ds-subtle">penalty {formatBps(e.penaltyBps)}</span>
            )}
            {e.nominalExecutionAt !== null && e.kind === 'initiated' && (
              <span className="ds-text-xs ds-subtle">
                nominal event-time delay end {formatTimestamp(e.nominalExecutionAt)}
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
