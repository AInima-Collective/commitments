import { type OperatorInfo, type OperatorStatus, type ServiceOperatorInfo } from '../../utils/mesh'
import { TokenAmount } from '../ui'
import { AgentBadge, OperatorIdentity, OperatorStatusBadge } from '../protocol'
import { OperatorDetail } from './OperatorDetail'
import { type AgentIdentity } from '../../hooks/useAgentIdentities'
import { type CommitmentWithStatus } from '../../utils/commitments'

interface OperatorWithStatus extends OperatorInfo {
  status: OperatorStatus
  /** Verified profile metadata, carried on the indexed operator list. */
  metadata?: { name?: string } | null
}

interface OperatorRowProps {
  operator: OperatorWithStatus
  /** ERC-8004 agent identity resolved at the table level — one bulk
   *  `useAgentIdentities` query per page, never per row. */
  agent?: AgentIdentity
  expanded: boolean
  onToggle: () => void
  serviceInfo?: ServiceOperatorInfo
  decimals?: number
  /** Number of body cells in the parent table — used for the expansion row's colSpan. */
  columnCount: number
  /** True when the connected account has an active delegation to this operator. */
  hasDelegated?: boolean
  /** The connected account's active delegation commitments to this operator. */
  myDelegations?: CommitmentWithStatus[]
  /** Called after an undelegate/unbond action so parent state can refetch. */
  onDelegationActed?: () => void
}

export function OperatorRow({
  operator,
  agent,
  expanded,
  onToggle,
  serviceInfo,
  decimals = 18,
  columnCount,
  hasDelegated = false,
  myDelegations,
  onDelegationActed,
}: OperatorRowProps) {
  const profileName = operator.metadata?.name

  return (
    <>
      <tr
        onClick={onToggle}
        aria-expanded={expanded}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            onToggle()
          }
        }}
        style={{ cursor: 'pointer' }}
      >
        <td>
          <span className="ds-row ds-row-2" style={{ alignItems: 'center' }}>
            <OperatorIdentity
              address={operator.address}
              name={profileName}
              size="sm"
              hideAddress
              badge={agent?.isAgent ? <AgentBadge agentId={agent.agentId} /> : undefined}
            />
            {hasDelegated && (
              <span className="ds-token-chip" title="You have an active delegation to this operator">
                DELEGATED
              </span>
            )}
          </span>
        </td>
        <td><OperatorStatusBadge status={operator.status} /></td>
        <td style={{ textAlign: 'right' }}>
          {operator.selfStake !== undefined ? (
            <TokenAmount
              amount={operator.selfStake}
              decimals={decimals}
              compact
              size="inline"
            />
          ) : (
            <span
              className="ds-muted"
              title="Self-stake unavailable — start the indexer to populate this column."
            >
              —
            </span>
          )}
        </td>
        <td style={{ textAlign: 'right' }}>
          <TokenAmount
            amount={operator.totalDelegatedStake}
            decimals={decimals}
            compact
            size="inline"
          />
        </td>
        <td style={{ textAlign: 'right' }} className="ds-mono-num">
          {operator.activeDelegationCount.toString()}
        </td>
      </tr>
      {expanded && (
        <tr>
          <td colSpan={columnCount} style={{ padding: 'var(--space-4)' }}>
            <OperatorDetail
              operator={operator}
              serviceInfo={serviceInfo}
              decimals={decimals}
              myDelegations={myDelegations}
              onDelegationActed={onDelegationActed}
            />
          </td>
        </tr>
      )}
    </>
  )
}
