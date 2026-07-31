import { type Address } from 'viem'
import { useCountdown } from '../../hooks/useCountdown'
import { useForfeitProposal } from '../../hooks/useForfeitProposal'
import { formatDuration } from '../../lib/format'
import { formatBps, type CommitmentWithStatus } from '../../utils/commitments'
import {
  AddressDisplay,
  Notice,
  StatBlock,
} from '../ui'
import { CommitmentStatusBadge, type CommitmentStatus } from '../protocol'
import type { ForfeitProposalState } from '../../utils/commitments'

interface ForfeitDetailProps {
  commitment: CommitmentWithStatus
  managerAddress: Address
}

function formatTimestamp(ts: bigint): string {
  if (ts === 0n) return '--'
  return new Date(Number(ts) * 1000).toISOString().slice(0, 16).replace('T', ' ')
}

function forfeitStateToBadgeStatus(state: ForfeitProposalState): CommitmentStatus | null {
  switch (state) {
    case 'PENDING':
      return 'FORFEIT_PENDING'
    case 'EXECUTABLE':
      return 'FORFEIT_PENDING'
    case 'EXECUTED':
      return 'FORFEITED'
    case 'CANCELLED':
      return 'RELEASED'
    case 'NONE':
      return null
  }
}

/**
 * Read-only forfeit visualization. Mounted in the row expansion as situational
 * awareness; the actual forfeit actions (initiate / execute / cancel) live in
 * the resolve modal triggered from the row's `Resolve` button.
 */
export function ForfeitDetail({
  commitment,
  managerAddress,
}: ForfeitDetailProps) {
  const { proposal, state, deadline } = useForfeitProposal({
    managerAddress,
    commitmentId: commitment.id,
    challengeWindowSecs: commitment.challengeWindow,
    enabled: true,
  })

  const remainingMs = useCountdown(deadline)

  const badgeStatus = forfeitStateToBadgeStatus(state)
  const stateValue = badgeStatus ? (
    <CommitmentStatusBadge status={badgeStatus} />
  ) : (
    <Notice tone="neutral" size="sm">NO FORFEIT PROPOSAL</Notice>
  )

  const remainingSecs = Math.max(0, Math.floor(remainingMs / 1000))
  let challengeWindowValue: React.ReactNode
  if (state === 'PENDING') {
    challengeWindowValue =
      remainingSecs > 0 ? formatDuration(remainingSecs) : 'CHALLENGE WINDOW CLOSING…'
  } else if (state === 'EXECUTABLE') {
    challengeWindowValue = <Notice tone="success" size="sm">CHALLENGE WINDOW CLOSED</Notice>
  } else if (state === 'EXECUTED') {
    challengeWindowValue = 'EXECUTED'
  } else if (state === 'CANCELLED') {
    challengeWindowValue = 'CANCELLED'
  } else {
    challengeWindowValue = '--'
  }

  const proposerValue = proposal
    ? <AddressDisplay address={commitment.arbiter} />
    : '--'
  const subjectValue = <AddressDisplay address={commitment.committer} />

  return (
    <div
      className="ds-card forfeit-detail"
      role="region"
      aria-label={`Forfeit details for commitment #${commitment.id.toString()}`}
    >
      <div className="ds-stat-grid">
        <StatBlock label="STATE" value={stateValue} />
        <StatBlock label="CHALLENGE WINDOW" value={challengeWindowValue} />
        <StatBlock label="PROPOSER" value={proposerValue} />
        <StatBlock label="SUBJECT" value={subjectValue} />
      </div>

      {proposal && (
        <div className="ds-stat-grid" style={{ marginTop: 12 }}>
          <StatBlock label="PENALTY" value={formatBps(proposal.penaltyBps)} />
          <StatBlock label="INITIATED" value={formatTimestamp(proposal.initiatedAt)} />
        </div>
      )}

      {state !== 'NONE' && (
        <Notice tone="info" size="sm" title="Read-only">
          Forfeit actions for this commitment live in the Resolve modal — open it from the action column on this row.
        </Notice>
      )}
    </div>
  )
}
