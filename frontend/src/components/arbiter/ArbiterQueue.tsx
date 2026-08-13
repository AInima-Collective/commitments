import { useMemo, useState } from 'react'
import { type Address } from 'viem'
import {
  useReadCommitmentManagerForfeitProposalTtl,
  useReadCommitmentManagerPauseState,
} from '../../generated'

import { useArbiterCommitments, type ArbiterCommitment } from '../../hooks/useArbiterCommitments'
import { useDisplayNow } from '../../hooks/useDisplayNow'
import { useTokenMeta } from '../../hooks/useTokenMeta'
import { compareCommitmentUrgency } from '../../lib/commitmentSort'
import {
  Disclosure,
  EmptyState,
  Notice,
  Skeleton,
  StatBlock,
  TokenAmount,
} from '../ui'
import { CommitmentStatusBadge, CommitmentTags, CommitmentTitle, Countdown, OperatorIdentity, PageHeader } from '../protocol'
import { useCommitmentLabelContext } from '../../hooks/useCommitmentLabelContext'
import { type UnifiedCommitmentRowEntry } from '../../hooks/useUnifiedRows'
import { commitmentLabel } from '../../lib/commitmentLabel'
import { metadataTags } from '../../lib/commitmentMetadata'
import {
  calculateForfeitEnforcement,
  type ManagerPauseSnapshot,
} from '../../lib/forfeitEnforcement'
import {
  bucketForArbiterInbox,
  type ArbiterQueueBucket,
} from '../../lib/arbiterInbox'
import { ResolveCommitmentButton } from '../commitment/ResolveCommitmentButton'
import { ForfeitDetail } from '../commitment/ForfeitDetail'
import { ForfeitTimeline } from './ForfeitTimeline'

interface ArbiterQueueProps {
  managerAddress: Address | undefined
  connectedAddress: Address | undefined
  isConnected: boolean
}

interface BucketMeta {
  title: string
  description: string
  tone: 'danger' | 'warn' | 'info' | 'neutral'
}

const BUCKET_META: Record<ArbiterQueueBucket, BucketMeta> = {
  executable: {
    title: 'Permissionless manager actions',
    description:
      'Live manager state says mature execution or the stale-cancel backstop is available to anyone; these are not arbiter-only decisions.',
    tone: 'danger',
  },
  pending: {
    title: 'Forfeit execution delay',
    description:
      'A proposal is live but its pause-adjusted manager execution state is not ready. The arbiter can still cancel it.',
    tone: 'warn',
  },
  active: {
    title: 'Active commitments',
    description:
      'No case or manager proposal is open. Authority exists, but availability of a decision does not by itself mean attention is required.',
    tone: 'info',
  },
  other: {
    title: 'Closed / other commitments',
    description: 'Unbonding or already-closed commitments you arbitrate.',
    tone: 'neutral',
  },
}

const BUCKET_ORDER: ArbiterQueueBucket[] = ['executable', 'pending', 'active', 'other']

/**
 * ArbiterQueue — arbiter-centric triage surface. Lists every commitment where
 * the connected wallet is the `arbiter`, bucketed by actionability and ordered
 * by the canonical urgency comparator within each bucket. Each row opens the
 * existing arbiter-aware resolve modal; no forfeiture write logic is
 * reimplemented here.
 */
export function ArbiterQueue({ managerAddress, connectedAddress, isConnected }: ArbiterQueueProps) {
  const paginationScope = `${connectedAddress?.toLowerCase() ?? ''}-${managerAddress?.toLowerCase() ?? ''}`
  const [pagination, setPagination] = useState({ scope: paginationScope, page: 0 })
  const page = pagination.scope === paginationScope ? pagination.page : 0
  const setPage = (update: (value: number) => number) => {
    setPagination((current) => ({
      scope: paginationScope,
      page: update(current.scope === paginationScope ? current.page : 0),
    }))
  }
  const pageSize = 50
  const { commitments, counts, page: pageInfo, isLoading, error, indexerOnline, refetch } = useArbiterCommitments({
    managerAddress,
    viewAddress: connectedAddress,
    limit: pageSize,
    offset: page * pageSize,
  })
  const nowSec = BigInt(useDisplayNow())
  const { data: pauseRaw } = useReadCommitmentManagerPauseState({
    address: managerAddress,
    query: { enabled: Boolean(managerAddress), refetchInterval: 15_000 },
  })
  const { data: ttl } = useReadCommitmentManagerForfeitProposalTtl({
    address: managerAddress,
    query: { enabled: Boolean(managerAddress) },
  })
  const pauseState = useMemo<ManagerPauseSnapshot | undefined>(
    () =>
      pauseRaw
        ? {
            paused: pauseRaw[0],
            pausedAt: pauseRaw[1],
            cumulativePaused: pauseRaw[2],
            maxPauseDuration: pauseRaw[3],
            creditable: pauseRaw[4],
          }
        : undefined,
    [pauseRaw],
  )

  const buckets = useMemo(() => {
    const grouped: Record<ArbiterQueueBucket, ArbiterCommitment[]> = {
      executable: [],
      pending: [],
      active: [],
      other: [],
    }
    for (const c of commitments) grouped[bucketForArbiterInbox(c, nowSec, pauseState, ttl)].push(c)
    for (const key of BUCKET_ORDER) grouped[key].sort(compareCommitmentUrgency)
    return grouped
  }, [commitments, nowSec, pauseState, ttl])

  const needsAttention = counts.needsAction

  const header = (
    <PageHeader
      eyebrow="role"
      title="Arbiter inbox"
      lead="Your arbitration queue: commitments that name this wallet as arbiter. Proposal review is separated from permissionless manager execution and from commitments that are merely active."
    />
  )

  if (!isConnected || !connectedAddress) {
    return (
      <div className="ds-page">
        {header}
        <Notice tone="info" title="Connect a wallet">
          Connect the wallet that arbitrates commitments to see your queue. This view is
          arbiter-scoped — it lists only commitments whose arbiter matches the connected address.
        </Notice>
      </div>
    )
  }

  if (!managerAddress) {
    return (
      <div className="ds-page">
        {header}
        <Notice tone="danger" title="Commitment manager not configured">
          Set <code>VITE_COMMITMENT_MANAGER_ADDRESS</code> to enable arbitration.
        </Notice>
      </div>
    )
  }

  if (!indexerOnline) {
    return (
      <div className="ds-page">
        {header}
        <Notice tone="warn" title="Arbiter queue unavailable">
          The arbiter queue is temporarily unavailable — please check back shortly.
        </Notice>
      </div>
    )
  }

  return (
    <div className="ds-page">
      {header}

      <section className="ds-stat-grid" aria-label="Arbitration summary">
        <StatBlock value={needsAttention.toString()} label="Needs action" tone={needsAttention > 0 ? 'accent' : 'neutral'} />
        <StatBlock value={counts.openProposals.toString()} label="Open proposals" />
        <StatBlock value={counts.active.toString()} label="Active commitments" />
        <StatBlock value={counts.other.toString()} label="Closed / other" />
      </section>

      {error && (
        <Notice
          tone="danger"
          title="Failed to load arbiter queue"
          actions={
            <button type="button" className="ds-btn ds-btn--sm" onClick={refetch}>
              retry
            </button>
          }
        >
          {error.message}
        </Notice>
      )}

      {isLoading && commitments.length === 0 ? (
        <Skeleton height={120} />
      ) : commitments.length === 0 ? (
        <EmptyState
          title="Nothing to arbitrate"
          description="This wallet isn't the arbiter on any commitments. When a commitment names you as arbiter, it will appear here."
        />
      ) : (
        <div className="ds-stack ds-stack-5">
          {BUCKET_ORDER.map((key) => {
            const rows = buckets[key]
            if (rows.length === 0) return null
            const meta = BUCKET_META[key]
            return (
              <section key={key} aria-label={meta.title} className="ds-stack ds-stack-3">
                <header className="ds-section-header">
                  <h2 className="ds-section-title">{meta.title}</h2>
                  <span className="ds-section-eyebrow">{rows.length}</span>
                </header>
                <Notice tone={meta.tone} size="sm">
                  {meta.description}
                </Notice>
                <div className="ds-stack ds-stack-3">
                  {rows.map((c) => (
                    <ArbiterQueueRow
                      key={c.id.toString()}
                      commitment={c}
                      bucket={key}
                      managerAddress={managerAddress}
                      connectedAddress={connectedAddress}
                      isConnected={isConnected}
                      nowSec={nowSec}
                      pauseState={pauseState}
                      ttl={ttl}
                      onActed={refetch}
                    />
                  ))}
                </div>
              </section>
            )
          })}
          <nav className="ds-row ds-row-2" aria-label="Arbiter commitment pages" style={{ justifyContent: 'space-between' }}>
            <button
              type="button"
              className="ds-btn ds-btn--sm"
              disabled={page === 0 || isLoading}
              onClick={() => setPage((value) => Math.max(0, value - 1))}
            >
              Previous
            </button>
            <span className="ds-text-xs ds-subtle">
              {counts.total === 0
                ? 'No commitments'
                : `${pageInfo.offset + 1}–${pageInfo.offset + commitments.length} of ${counts.total}`}
            </span>
            <button
              type="button"
              className="ds-btn ds-btn--sm"
              disabled={pageInfo.nextOffset === null || isLoading}
              onClick={() => setPage((value) => value + 1)}
            >
              Next
            </button>
          </nav>
        </div>
      )}
    </div>
  )
}

interface ArbiterQueueRowProps {
  commitment: ArbiterCommitment
  bucket: ArbiterQueueBucket
  managerAddress: Address
  connectedAddress: Address
  isConnected: boolean
  nowSec: bigint
  pauseState: ManagerPauseSnapshot | undefined
  ttl: bigint | undefined
  onActed: () => void
}

function ArbiterQueueRow({
  commitment,
  bucket,
  managerAddress,
  connectedAddress,
  isConnected,
  nowSec,
  pauseState,
  ttl,
  onActed,
}: ArbiterQueueRowProps) {
  const { decimals, symbol } = useTokenMeta(commitment.token)
  // An arbiter deciding whether a forfeit is justified needs to know what the
  // commitment promised. The queue used to list bare integers.
  const unified = useMemo(() => asUnifiedRow(commitment), [commitment])
  const rowsForLabels = useMemo(() => [unified], [unified])
  const labelContext = useCommitmentLabelContext(rowsForLabels, {
    metaFor: () => ({ decimals, symbol }),
  })
  const label = commitmentLabel(unified, labelContext)

  const enforcement = calculateForfeitEnforcement({
    proposal: commitment.forfeitProposal,
    challengeWindow: commitment.challengeWindow,
    pauseState,
    proposalTtl: ttl,
    now: nowSec,
  })
  const showCountdown = bucket === 'pending' && enforcement.state === 'PENDING'
  const totalSecs =
    commitment.forfeitProposal && enforcement.effectiveExecutionAt
      ? Number(enforcement.effectiveExecutionAt - commitment.forfeitProposal.initiatedAt)
      : Number(commitment.challengeWindow)
  const remainingSecs = showCountdown && enforcement.effectiveExecutionAt
    ? Math.max(0, Number(enforcement.effectiveExecutionAt - nowSec))
    : 0
  const elapsedSecs = Math.max(0, totalSecs - remainingSecs)

  return (
    <div className="ds-card ds-stack ds-stack-3" data-bucket={bucket}>
      <div className="ds-row ds-row-3" style={{ justifyContent: 'space-between', flexWrap: 'wrap' }}>
        <div className="ds-stack ds-stack-1">
          <div className="ds-row ds-row-2" style={{ alignItems: 'center', gap: 'var(--space-2)' }}>
            <CommitmentTitle label={label} />
            <CommitmentStatusBadge status={commitment.status} />
          </div>
          <div className="ds-row ds-row-2" style={{ alignItems: 'center', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
            <span className="ds-mono-num ds-subtle">#{commitment.id.toString()}</span>
            <CommitmentTags tags={metadataTags(unified)} max={3} />
          </div>
          <div className="ds-row ds-row-2" style={{ alignItems: 'center', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
            <OperatorIdentity address={commitment.committer} size="sm" />
            <span className="ds-muted" aria-hidden>→</span>
            <OperatorIdentity address={commitment.counterparty} size="sm" />
          </div>
        </div>
        <div className="ds-row ds-row-3" style={{ alignItems: 'center', gap: 'var(--space-3)' }}>
          <TokenAmount amount={commitment.amount} decimals={decimals} symbol={symbol} />
          <ResolveCommitmentButton
            commitment={commitment}
            managerAddress={managerAddress}
            vaultAddress={commitment.vault}
            connectedAddress={connectedAddress}
            isConnected={isConnected}
            onActed={onActed}
          />
        </div>
      </div>

      {showCountdown && (
        <Countdown label="forfeit execution delay" elapsed={elapsedSecs} total={totalSecs} tone="warn" />
      )}

      <Disclosure label="Forfeiture detail & timeline">
        <div className="ds-stack ds-stack-3">
          <ForfeitDetail commitment={commitment} managerAddress={managerAddress} />
          <ForfeitTimeline managerAddress={managerAddress} commitmentId={commitment.id} />
        </div>
      </Disclosure>
    </div>
  )
}

/**
 * Adapt an arbiter-queue row into the row shape the naming layer speaks.
 *
 * The queue's rows are chain reads enriched with the indexer's metadata, not
 * the unified list rows the rest of the app passes around. Rather than teach
 * `commitmentLabel` a second input shape — which is how two surfaces end up
 * with two subtly different sets of naming rules — the shape is adapted here.
 *
 * `role: 'committer'` is a small lie with a deliberate effect: the viewer is
 * the arbiter, party to neither side, and pointing the label at the
 * counterparty is what makes "Delegation to Acme Node Co." read correctly from
 * the outside.
 */
function asUnifiedRow(c: ArbiterCommitment): UnifiedCommitmentRowEntry {
  const commitment = {
    id: c.id,
    committer: c.committer,
    arbiter: c.arbiter,
    counterparty: c.counterparty,
    token: c.token,
    adapter: c.adapter,
    amount: c.amount,
    maxPenaltyBps: c.maxPenaltyBps,
    status: c.status,
    forfeitPenaltyBps: undefined,
    forfeitChallengeEnd: c.forfeitChallengeEnd,
    forfeitSharesExecuted: undefined,
    forfeitCounterparty: undefined,
    unbondInitiatedAt: c.unbondInitiatedAt,
    unbondMaturesAt: undefined,
    createdBlock: 0n,
    createdAt: c.createdAt,
    metadataURI: c.metadataURI,
    metadataHash: c.metadataHash,
    metadataStatus: c.metadataStatus,
    metadataContent: c.metadataContent,
    metadataContentRaw: undefined,
    acceptsContributions: false,
    vault: c.vault,
    manager: undefined,
    role: 'committer' as const,
    direction: 'one-way' as const,
    agreementId: undefined,
    agreementSide: undefined,
    agreementStatus: undefined,
  }
  return {
    kind: 'commitment',
    id: c.id,
    status: c.status,
    direction: 'one-way',
    role: 'committer',
    committer: c.committer,
    counterparty: c.counterparty,
    arbiter: c.arbiter,
    token: c.token,
    amount: c.amount,
    maxPenaltyBps: c.maxPenaltyBps,
    forfeitChallengeEnd: c.forfeitChallengeEnd,
    vault: c.vault,
    manager: undefined,
    commitment,
  }
}
