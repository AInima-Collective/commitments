import { Link } from 'react-router-dom'
import { type Address } from 'viem'
import { useChainId } from 'wagmi'

import { useArbiterProfile } from '../../hooks/useArbiterProfile'
import {
  useCommitmentArbitration,
  type MechanismArbitrationEvent,
  type ManagerForfeitEvent,
  type ManagerForfeitEventKind,
} from '../../hooks/useCommitmentArbitration'
import { useForfeitProposal } from '../../hooks/useForfeitProposal'
import { useMechanismArbitration } from '../../hooks/useMechanismArbitration'
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
  committer?: Address
  counterparty?: Address
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
  committer,
  counterparty,
  challengeWindow,
  indexedPenaltyBps,
  decimals,
  symbol,
}: ArbitrationPanelProps) {
  const chainId = useChainId()
  const explorer = getBlockExplorer(chainId)
  const profile = useArbiterProfile(arbiter, manager)
  const mechanism = useMechanismArbitration({ arbiter, commitmentId, committer, counterparty })
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
  const activity = [
    ...(history.data?.events.map((event) => ({ source: 'CommitmentManager' as const, event })) ?? []),
    ...(history.data?.mechanismEvents?.map((event) => ({ source: 'arbiter mechanism' as const, event })) ?? []),
  ].sort((left, right) => {
    if (left.event.blockNumber !== right.event.blockNumber) {
      return left.event.blockNumber > right.event.blockNumber ? -1 : 1
    }
    return right.event.logIndex - left.event.logIndex
  })

  return (
    <section className="ds-card ds-stack ds-stack-4" aria-labelledby="arbitration-panel-title">
      <header className="ds-section-header">
        <div>
          <span className="ds-section-eyebrow">arbiter policy · read-only</span>
          <h2 id="arbitration-panel-title" className="ds-section-title">
            Arbiter and policy
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
      {profile.profile?.managerMatches === false && (
        <Notice tone="danger" size="sm" title="Reported manager mismatch">
          This arbiter reports a different CommitmentManager. Its declared powers may target another deployment and must not be assumed to apply here.
        </Notice>
      )}

      <div className="ds-stack ds-stack-3" aria-labelledby="mechanism-case-title">
        <header className="ds-section-header">
          <div>
            <span className="ds-section-eyebrow">arbiter mechanism</span>
            <h3 id="mechanism-case-title" className="ds-section-title">Mechanism case</h3>
          </div>
          {mechanism?.case && <span className="ds-badge ds-badge--solid">{mechanism.case.phase}</span>}
        </header>
        {!mechanism ? (
          <Notice tone="neutral" size="sm" title="No recognized mechanism adapter">
            This arbiter has no trusted mechanism classification. {profile.profile?.contestSummary ?? 'No generic on-chain contest action is implied.'}
          </Notice>
        ) : mechanism.isLoading ? (
          <Skeleton height={64} />
        ) : mechanism.error ? (
          <Notice tone="warn" size="sm" title="Mechanism state could not be verified">
            {mechanism.error.message}
          </Notice>
        ) : mechanism.case ? (
          <div className="ds-party-list">
            <PartyRow label="case">
              {mechanism.case.detailPath ? <Link to={mechanism.case.detailPath}>{mechanism.case.label}</Link> : mechanism.case.label}
            </PartyRow>
            <PartyRow label="phase">{mechanism.case.phase}</PartyRow>
            <PartyRow label="next mechanism deadline">{timestamp(mechanism.case.nextDeadline)}</PartyRow>
            {mechanism.case.deadlines.map((deadline) => (
              <PartyRow key={`${deadline.label}-${deadline.at.toString()}`} label={deadline.label}>
                {timestamp(deadline.at)}
              </PartyRow>
            ))}
            <PartyRow label="participants">{mechanism.case.participants.join(', ') || 'No generic participant list'}</PartyRow>
            <PartyRow label="available actions">
              {mechanism.case.availableActions.length > 0
                ? mechanism.case.availableActions.join(' · ')
                : 'No mechanism action currently available'}
            </PartyRow>
            {mechanism.case.outcome && <PartyRow label="ruling / outcome">{mechanism.case.outcome}</PartyRow>}
          </div>
        ) : (
          <Notice tone="neutral" size="sm" title="No mechanism case is open">
            {mechanism.noCase}
          </Notice>
        )}
        {mechanism && (
          <div className="ds-party-list">
            <PartyRow label="process">{mechanism.process}</PartyRow>
            {mechanism.terms.map((term) => (
              <PartyRow key={`${term.label}-${term.value}`} label={term.label}>{term.value}</PartyRow>
            ))}
          </div>
        )}
      </div>

      <div className="ds-stack ds-stack-3" aria-labelledby="manager-enforcement-title">
        <header className="ds-section-header">
          <div>
            <span className="ds-section-eyebrow">CommitmentManager</span>
            <h3 id="manager-enforcement-title" className="ds-section-title">Manager enforcement</h3>
          </div>
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
        <Notice tone="info" size="sm" title="Manager execution delay">
          This is a forfeit execution delay. It delays execution and permits the arbiter to cancel,
          but it does not itself grant the committer a generic challenge method. Mechanism-specific
          claims, disputes, or appeals follow the arbiter process described above.
        </Notice>
      </div>

      <div className="ds-stack ds-stack-3" aria-labelledby="arbitration-activity-title">
        <header className="ds-section-header">
          <div>
            <span className="ds-section-eyebrow">mechanism + manager provenance</span>
            <h3 id="arbitration-activity-title" className="ds-section-title">Activity</h3>
          </div>
          <span className="ds-section-eyebrow">
            {activity.length.toString()} events · complete for this manager + id
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
        ) : activity.length === 0 ? (
          <Notice tone="neutral" size="sm">
            No mechanism or manager enforcement events have occurred.
          </Notice>
        ) : (
          <ol className="ds-stack ds-stack-2" style={{ listStyle: 'none', margin: 0, padding: 0 }}>
            {activity.map((item) => item.source === 'CommitmentManager' ? (
              <HistoryRow
                key={`manager-${item.event.blockNumber}-${item.event.logIndex}`}
                event={item.event as ManagerForfeitEvent}
                explorer={explorer}
                decimals={decimals}
                symbol={symbol}
              />
            ) : (
              <MechanismHistoryRow
                key={`mechanism-${item.event.blockNumber}-${item.event.logIndex}`}
                event={item.event as MechanismArbitrationEvent}
                explorer={explorer}
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
  if (profile.fieldStatus.capabilities === 'not-applicable') {
    return <span className="ds-subtle">Not applicable to a direct-address arbiter</span>
  }
  if (['not-declared', 'unsupported'].includes(profile.fieldStatus.capabilities)) {
    return <span className="ds-subtle">Not declared by this legacy / custom contract</span>
  }
  if (['failed', 'unknown'].includes(profile.fieldStatus.capabilities)) {
    return <span className="ds-subtle">Unknown — failed to verify</span>
  }
  if (profile.declaredCapabilities.length === 0 && profile.unknownCapabilityBits === 0n) {
    return <span className="ds-subtle">No capabilities declared</span>
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
  if (!profile) return <span className="ds-subtle">Unknown</span>
  if (profile.fieldStatus.reportedManager === 'not-applicable') {
    return <span className="ds-subtle">Not applicable to a direct-address arbiter</span>
  }
  if (['not-declared', 'unsupported'].includes(profile.fieldStatus.reportedManager)) {
    return <span className="ds-subtle">Not declared by this legacy / custom contract</span>
  }
  if (!profile.reportedManager) return <span className="ds-subtle">Unknown — failed to verify</span>
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
        <span className="ds-row ds-row-2 ds-text-xs ds-subtle">
          <span className="ds-badge">source: CommitmentManager</span>
          {timestamp(event.timestamp)}
        </span>
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

function MechanismHistoryRow({
  event,
  explorer,
}: {
  event: MechanismArbitrationEvent
  explorer: string
}) {
  return (
    <li className="ds-card ds-stack ds-stack-1">
      <div className="ds-row ds-row-2" style={{ justifyContent: 'space-between', flexWrap: 'wrap' }}>
        <strong>{event.kind.replaceAll('-', ' ')}</strong>
        <span className="ds-row ds-row-2 ds-text-xs ds-subtle">
          <span className="ds-badge">source: arbiter mechanism</span>
          {timestamp(event.timestamp)}
        </span>
      </div>
      <div className="ds-row ds-row-2 ds-text-xs ds-subtle" style={{ flexWrap: 'wrap' }}>
        <span>{event.mechanism}</span>
        <span>case #{event.caseId.toString()}</span>
        <span>phase {event.phase}</span>
        {event.outcome && <span>{event.outcome}</span>}
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
