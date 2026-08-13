import { Link } from 'react-router-dom'
import { type Address } from 'viem'
import { useChainId } from 'wagmi'

import { useArbiterProfile } from '../../hooks/useArbiterProfile'
import {
  useCommitmentArbitration,
  type ManagerForfeitEvent,
  type ManagerForfeitEventKind,
} from '../../hooks/useCommitmentArbitration'
import { useForfeitProposal } from '../../hooks/useForfeitProposal'
import { getBlockExplorer } from '../../lib/blockExplorer'
import { arbiterProfilePath } from '../../lib/arbitrationRoutes'
import {
  FORFEIT_STATE_LABEL,
  nextForfeitEvent,
  type ForfeitEnforcement,
} from '../../lib/forfeitEnforcement'
import { formatBps } from '../../utils/commitments'
import { AddressDisplay, Notice, Skeleton, TokenAmount } from '../ui'
import { PartyRow } from '../protocol'

interface ArbitrationPanelProps {
  commitmentId: bigint
  arbiter: Address
  manager: Address
  amount: bigint
  challengeWindow?: bigint
  indexedPenaltyBps?: number
  decimals: number
  symbol: string
}

const HISTORY_LABEL: Record<ManagerForfeitEventKind, string> = {
  initiated: 'Forfeit initiated',
  executed: 'Executed',
  cancelled: 'Cancelled',
  cancelledStale: 'Stale-cancelled',
}

function timestamp(value: bigint | undefined | null): string {
  return value === undefined || value === null
    ? 'Unavailable'
    : new Date(Number(value) * 1_000).toLocaleString()
}

/** Always-visible, read-only manager enforcement and arbiter visibility layer. */
export function ArbitrationPanel({
  commitmentId,
  arbiter,
  manager,
  amount,
  challengeWindow,
  indexedPenaltyBps,
  decimals,
  symbol,
}: ArbitrationPanelProps) {
  const chainId = useChainId()
  const explorer = getBlockExplorer(chainId)
  const profile = useArbiterProfile(arbiter, manager)
  const forfeit = useForfeitProposal({
    managerAddress: manager,
    commitmentId,
    challengeWindowSecs: challengeWindow ?? 0n,
    enabled: challengeWindow !== undefined,
  })
  const history = useCommitmentArbitration(commitmentId, manager)
  const enforcement: ForfeitEnforcement =
    challengeWindow === undefined
      ? {
          state: 'UNAVAILABLE',
          executionAvailable: false,
          staleCancellationAvailable: false,
          managerPaused: undefined,
        }
      : forfeit.enforcement
  const proposedPenalty = forfeit.proposal?.penaltyBps ?? indexedPenaltyBps
  const proposalCanStillMoveStake = !['NONE', 'EXECUTED', 'CANCELLED'].includes(
    enforcement.state,
  )
  const unitsAtRisk =
    proposedPenalty === undefined || !proposalCanStillMoveStake
      ? undefined
      : (amount * BigInt(proposedPenalty)) / 10_000n

  return (
    <section className="ds-card ds-stack ds-stack-4" aria-labelledby="arbitration-panel-title">
      <header className="ds-section-header">
        <div>
          <span className="ds-section-eyebrow">manager enforcement · read-only</span>
          <h2 id="arbitration-panel-title" className="ds-section-title">
            Arbitration and forfeiture
          </h2>
        </div>
        <Link className="ds-btn ds-btn--sm" to={arbiterProfilePath(arbiter)}>
          View public arbiter page
        </Link>
      </header>

      <div className="ds-party-list">
        <PartyRow label="arbiter">
          <span className="ds-row ds-row-2" style={{ alignItems: 'center', flexWrap: 'wrap' }}>
            <Link to={arbiterProfilePath(arbiter)}>
              {profile.profile?.displayName ?? <AddressDisplay address={arbiter} compact />}
            </Link>
            {profile.profile?.displayName !== arbiter && <AddressDisplay address={arbiter} compact />}
          </span>
        </PartyRow>
        <PartyRow label="address form">
          {profile.isLoading ? 'Loading…' : profile.profile?.addressForm ?? 'unknown'}
        </PartyRow>
        <PartyRow label="recognized mechanism">
          {profile.profile?.mechanism ?? (profile.isLoading ? 'Loading…' : 'Unknown')}
          {profile.profile && (
            <span className="ds-subtle ds-text-xs"> · {profile.profile.mechanismVerification}</span>
          )}
        </PartyRow>
        <PartyRow label="declared capabilities">
          <CapabilityList profile={profile.profile} loading={profile.isLoading} />
        </PartyRow>
        <PartyRow label="reported manager">
          <ManagerMatch profile={profile.profile} loading={profile.isLoading} />
        </PartyRow>
        <PartyRow label="arbiter metadata">
          {profile.profile?.metadataURI ? (
            <span>
              <a href={profile.profile.metadataURI} target="_blank" rel="noreferrer">
                {profile.profile.metadataURI}
              </a>{' '}
              <span className="ds-badge">publisher-provided</span>
            </span>
          ) : profile.isLoading ? (
            'Loading…'
          ) : (
            <span className="ds-subtle">
              No metadata published ({profile.profile?.metadataTrust ?? 'unknown'})
            </span>
          )}
        </PartyRow>
      </div>

      {(profile.error || (profile.profile?.readFailures.length ?? 0) > 0) && (
        <Notice tone="warn" size="sm" title="Some arbiter introspection is unavailable">
          The fallback profile remains usable. Failed reads:{' '}
          {profile.profile?.readFailures.join(', ') || profile.error?.message}.
        </Notice>
      )}

      <div className="ds-stack ds-stack-3">
        <header className="ds-section-header">
          <h3 className="ds-section-title">Current manager proposal</h3>
          <span className="ds-badge ds-badge--solid">{FORFEIT_STATE_LABEL[enforcement.state]}</span>
        </header>
        {forfeit.error && (
          <Notice tone="warn" size="sm" title="Some manager state is unavailable">
            Live proposal or pause-adjusted timing could not be fully verified: {forfeit.error.message}
          </Notice>
        )}
        {forfeit.isLoading && challengeWindow !== undefined ? (
          <Skeleton height={52} />
        ) : (
          <div className="ds-party-list">
            <PartyRow label="proposed penalty">
              {proposedPenalty === undefined ? 'No active proposal' : formatBps(proposedPenalty)}
            </PartyRow>
            <PartyRow label="estimated units at risk">
              {unitsAtRisk === undefined ? (
                'No units currently proposed for forfeit'
              ) : (
                <TokenAmount amount={unitsAtRisk} decimals={decimals} symbol={symbol} />
              )}
            </PartyRow>
            <PartyRow label="initiated">{timestamp(forfeit.proposal?.initiatedAt)}</PartyRow>
            <PartyRow label="effective execution time">
              {timestamp(enforcement.effectiveExecutionAt)}
            </PartyRow>
            <PartyRow label="stale-cancel time">{timestamp(enforcement.staleCancelAt)}</PartyRow>
            <PartyRow label="what happens next">{nextForfeitEvent(enforcement)}</PartyRow>
            <PartyRow label="How to contest">
              {profile.profile ? (
                <span>
                  <span className="ds-badge">{contestKindLabel(profile.profile.contestKind)}</span>{' '}
                  {profile.profile.contestSummary}
                </span>
              ) : (
                'No generic on-chain contest action is implied by the manager execution delay.'
              )}
            </PartyRow>
          </div>
        )}
        <Notice tone="info" size="sm" title="Manager challenge window">
          This is a forfeit execution delay. It delays execution and permits the arbiter to cancel,
          but it does not itself grant the committer a generic challenge method. Mechanism-specific
          claims, disputes, or appeals follow the arbiter process described above.
        </Notice>
      </div>

      <div className="ds-stack ds-stack-3">
        <header className="ds-section-header">
          <h3 className="ds-section-title">Manager-side forfeit history</h3>
          <span className="ds-section-eyebrow">
            {(history.data?.events.length ?? 0).toString()} events · complete for this manager + id
          </span>
        </header>
        {!history.indexerOnline ? (
          <Notice tone="warn" size="sm">
            History is unavailable because the indexer is not configured. Live manager state above remains visible.
          </Notice>
        ) : history.isLoading ? (
          <Skeleton height={72} />
        ) : history.error ? (
          <Notice tone="danger" size="sm" title="Forfeit history unavailable">
            {history.error.message}
          </Notice>
        ) : (history.data?.events.length ?? 0) === 0 ? (
          <Notice tone="neutral" size="sm">
            No manager-side forfeit attempts have occurred.
          </Notice>
        ) : (
          <ol className="ds-stack ds-stack-2" style={{ listStyle: 'none', margin: 0, padding: 0 }}>
            {history.data!.events.map((event) => (
              <HistoryRow
                key={`${event.blockNumber}-${event.logIndex}`}
                event={event}
                explorer={explorer}
                decimals={decimals}
                symbol={symbol}
              />
            ))}
          </ol>
        )}
      </div>
    </section>
  )
}

function CapabilityList({
  profile,
  loading,
}: {
  profile: ReturnType<typeof useArbiterProfile>['profile']
  loading: boolean
}) {
  if (loading) return <>Loading…</>
  if (!profile) return <>Unavailable</>
  if (profile.declaredCapabilities.length === 0 && profile.unknownCapabilityBits === 0n) {
    return <span className="ds-subtle">None reported</span>
  }
  return (
    <span className="ds-row ds-row-1" style={{ flexWrap: 'wrap' }}>
      {profile.declaredCapabilities.map((capability) => (
        <span key={capability.id} className="ds-badge" title="Self-declared authority scope">
          {capability.label} · declared
        </span>
      ))}
      {profile.unknownCapabilityBits !== 0n && (
        <span className="ds-badge ds-badge--warn">
          Unknown bits 0x{profile.unknownCapabilityBits.toString(16)} · declared
        </span>
      )}
    </span>
  )
}

function ManagerMatch({
  profile,
  loading,
}: {
  profile: ReturnType<typeof useArbiterProfile>['profile']
  loading: boolean
}) {
  if (loading) return <>Loading…</>
  if (!profile?.reportedManager) return <span className="ds-subtle">Not reported / unavailable</span>
  const matchKnown = profile.managerMatches !== undefined
  return (
    <span className="ds-row ds-row-2" style={{ alignItems: 'center', flexWrap: 'wrap' }}>
      <AddressDisplay address={profile.reportedManager} compact />
      <span
        className={`ds-badge ${
          matchKnown
            ? profile.managerMatches
              ? 'ds-badge--success'
              : 'ds-badge--error'
            : ''
        }`}
      >
        {matchKnown
          ? profile.managerMatches
            ? 'matches expected manager'
            : 'manager mismatch'
          : 'expected manager unavailable'}
      </span>
    </span>
  )
}

function contestKindLabel(kind: 'known-mechanism' | 'published-policy' | 'no-generic-action') {
  if (kind === 'known-mechanism') return 'Known on-chain mechanism'
  if (kind === 'published-policy') return 'Published off-chain policy'
  return 'No generic on-chain action'
}

function HistoryRow({
  event,
  explorer,
  decimals,
  symbol,
}: {
  event: ManagerForfeitEvent
  explorer: string
  decimals: number
  symbol: string
}) {
  return (
    <li className="ds-card ds-stack ds-stack-1">
      <div className="ds-row ds-row-2" style={{ justifyContent: 'space-between', flexWrap: 'wrap' }}>
        <strong>{HISTORY_LABEL[event.kind]}</strong>
        <span className="ds-text-xs ds-subtle">{timestamp(event.timestamp)}</span>
      </div>
      <div className="ds-row ds-row-2 ds-text-xs ds-subtle" style={{ flexWrap: 'wrap' }}>
        {event.penaltyBps !== null && <span>penalty {formatBps(event.penaltyBps)}</span>}
        {event.unitsForfeited !== null && (
          <span>
            moved <TokenAmount amount={event.unitsForfeited} decimals={decimals} symbol={symbol} compact />
          </span>
        )}
        <span>block {event.blockNumber.toString()}</span>
        {explorer ? (
          <a href={`${explorer}/tx/${event.transactionHash}`} target="_blank" rel="noreferrer">
            transaction
          </a>
        ) : (
          <span className="ds-mono-num">{event.transactionHash.slice(0, 10)}…</span>
        )}
      </div>
    </li>
  )
}
