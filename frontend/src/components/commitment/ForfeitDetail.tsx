import { type Address } from 'viem'
import { useForfeitProposal } from '../../hooks/useForfeitProposal'
import { FORFEIT_STATE_LABEL } from '../../lib/forfeitEnforcement'
import { formatBps, type CommitmentWithStatus } from '../../utils/commitments'
import {
  AddressDisplay,
  Notice,
  StatBlock,
} from '../ui'
import { CommitmentStatusBadge } from '../protocol'

interface ForfeitDetailProps {
  commitment: CommitmentWithStatus
  managerAddress: Address
}

function formatTimestamp(ts: bigint): string {
  if (ts === 0n) return '--'
  return new Date(Number(ts) * 1000).toISOString().slice(0, 16).replace('T', ' ')
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
  const { proposal, state, enforcement } = useForfeitProposal({
    managerAddress,
    commitmentId: commitment.id,
    challengeWindowSecs: commitment.challengeWindow,
    enabled: true,
  })

  const stateValue = <CommitmentStatusBadge status={commitment.status} />

  const executionValue = FORFEIT_STATE_LABEL[state]

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
        <StatBlock label="MANAGER ENFORCEMENT" value={executionValue} />
        <StatBlock label="PROPOSER" value={proposerValue} />
        <StatBlock label="SUBJECT" value={subjectValue} />
      </div>

      {proposal && (
        <div className="ds-stat-grid" style={{ marginTop: 12 }}>
          <StatBlock label="PENALTY" value={formatBps(proposal.penaltyBps)} />
          <StatBlock label="INITIATED" value={formatTimestamp(proposal.initiatedAt)} />
          <StatBlock
            label="EFFECTIVE EXECUTION"
            value={
              enforcement.effectiveExecutionAt
                ? formatTimestamp(enforcement.effectiveExecutionAt)
                : '--'
            }
          />
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
