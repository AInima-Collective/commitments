import { type Address, type TransactionReceipt } from 'viem'
import { Link } from 'react-router-dom'
import {
  Countdown,
  LifecycleStepper,
  commitmentLifecycle,
} from '../protocol'
import { useCommitmentYield } from '../../hooks/useCommitmentYield'
import { useDisplayNow } from '../../hooks/useDisplayNow'
import { useForfeitProposal } from '../../hooks/useForfeitProposal'
import { useMutualMembership } from '../../hooks/useMutualMembership'
import { useTokenMeta } from '../../hooks/useTokenMeta'
import { useUnbondStatus } from '../../hooks/useUnbondStatus'
import {
  type CommitmentWithStatus,
} from '../../lib/commitments'
import {
  deriveViewerRole,
  getAvailableActions,
  type ViewerRole,
} from '../../lib/resolveActions'
import { EmptyState, Modal, Notice, StatBlock, TokenAmount, Tooltip } from '../ui'
import { ResolveActionRow } from './actions/ResolveActionRow'

interface ResolveCommitmentModalProps {
  open: boolean
  onClose: () => void
  commitment: CommitmentWithStatus
  managerAddress: Address
  connectedAddress: Address | undefined
  isConnected: boolean
  /** Refetch parent data on success. Receives the confirming tx receipt when
   *  available so callers can poll the indexer past `receipt.blockNumber`. */
  onActed?: (receipt?: TransactionReceipt) => void
}

export function ResolveCommitmentModal({
  open,
  onClose,
  commitment,
  managerAddress,
  connectedAddress,
  isConnected,
  onActed,
}: ResolveCommitmentModalProps) {
  // v2: amounts (stake + pending yield) are denominated in the commitment's own
  // backing token, not the vault share.
  const { decimals, symbol } = useTokenMeta(commitment.token)
  const forfeit = useForfeitProposal({
    managerAddress,
    commitmentId: commitment.id,
    challengeWindowSecs: commitment.challengeWindow,
    enabled: open,
  })

  const unbond = useUnbondStatus({
    managerAddress,
    commitmentId: open ? commitment.id : undefined,
  })

  // Mutual member capital can't use the normal unbond (the contract reverts
  // `CommitmentInMutual`) — the member lifecycle (settle → exit → release)
  // replaces it in the action list below.
  const membership = useMutualMembership({
    managerAddress,
    commitmentId: open ? commitment.id : undefined,
  })

  // v2: yield is paid per-(commitment, strategy); there is no aggregate
  // pending-yield read, so useCommitmentYield resolves strategiesOf(id) and sums
  // pending(id, strategy, 0x) across the bound strategies. `totalPending` gates
  // the claim-yield action; `entries` drives the per-strategy claim buttons.
  const yieldInfo = useCommitmentYield({
    managerAddress,
    commitmentId: open ? commitment.id : undefined,
  })
  const pendingYield = yieldInfo.totalPending

  const viewerRole: ViewerRole = deriveViewerRole(commitment, connectedAddress)
  // Chain time on anvil, as the Mutual page uses, so a warp moves both alike.
  const nowSec = BigInt(useDisplayNow())

  const actions = getAvailableActions({
    commitment,
    forfeit: {
      state: forfeit.state,
      initiatedAt: forfeit.proposal?.initiatedAt ?? 0n,
      deadline: forfeit.deadline,
      executionAvailable: forfeit.enforcement.executionAvailable,
      staleCancellationAvailable: forfeit.enforcement.staleCancellationAvailable,
      staleCancelAt: forfeit.enforcement.staleCancelAt,
    },
    unbond: {
      unbondInitiatedAt: unbond.unbondInitiatedAt,
      unbondingPeriod: unbond.unbondingPeriod,
    },
    pendingYield,
    viewerRole,
    isConnected,
    nowSec,
    mutual: {
      isMember: membership.isMember,
      lossPending: membership.lossPending,
      unsettled: membership.unsettled,
      owedUnits: membership.owedUnits,
      exitRequestedAt: membership.exitRequestedAt,
      deallocationWindow: membership.deallocationWindow,
    },
  })

  function handleActed(receipt?: TransactionReceipt) {
    // Close on any successful action so the modal behaves the same everywhere
    // it's mounted (the detail page already closed; the Commitments/Dashboard
    // list views previously left it open). The action card has already pushed a
    // success toast, and the parent's onActed refetches the underlying list, so
    // dismissing is the consistent, least-surprising outcome. Membership state
    // (exit window, owed loss) is chain-read with a 15s poll — refetch now so a
    // reopened modal reflects the action immediately.
    membership.refetch()
    onActed?.(receipt)
    onClose()
  }

  const executionDelayTotalSecs =
    forfeit.proposal && forfeit.enforcement.effectiveExecutionAt
      ? Number(forfeit.enforcement.effectiveExecutionAt - forfeit.proposal.initiatedAt)
      : Number(commitment.challengeWindow)
  const executionDelayElapsed = forfeit.proposal
    ? Math.max(0, Math.min(executionDelayTotalSecs, Number(nowSec - forfeit.proposal.initiatedAt)))
    : 0

  // Deallocation-window countdown state (mutual member exit). A request lapses
  // at twice the window and then reads as no request, as in `getAvailableActions`.
  const exitRequested =
    membership.exitRequestedAt > 0n &&
    nowSec < membership.exitRequestedAt + 2n * membership.deallocationWindow
  const exitTotalSecs = Number(membership.deallocationWindow)
  const exitElapsed = exitRequested
    ? Math.max(0, Math.min(exitTotalSecs, Number(nowSec - membership.exitRequestedAt)))
    : 0
  const exitMature = exitRequested && exitTotalSecs > 0 && exitElapsed >= exitTotalSecs

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`Resolve commitment #${commitment.id.toString()}`}
      description="Every action your wallet can take on this commitment, in one place."
      size="lg"
    >
      <div className="ds-stack ds-stack-4">
        {/* Status header — the lifecycle stepper below already conveys status,
            so we don't repeat it as a stat. The Pending yield stat is dropped
            when there's none to claim, leaving Amount + Your role in a 2-column
            grid so a large amount has room to render without wrapping. */}
        <div className="ds-stat-grid" data-cols={pendingYield === 0n ? '2' : '3'}>
          <StatBlock
            label="Amount"
            value={
              <TokenAmount
                amount={commitment.amount}
                decimals={decimals}
                symbol={symbol}
                size="inline"
                compact
              />
            }
          />
          <StatBlock
            label="Your role"
            value={<RoleLabel role={viewerRole} />}
          />
          {pendingYield > 0n && (
            <StatBlock
              label="Pending yield"
              value={
                <TokenAmount
                  amount={pendingYield}
                  decimals={decimals}
                  symbol={symbol}
                  size="inline"
                  compact
                />
              }
            />
          )}
        </div>

        <LifecycleStepper steps={commitmentLifecycle(commitment.status)} />

        {commitment.status === 'FORFEIT_PENDING' && executionDelayTotalSecs > 0 && (
          <>
            <Notice tone="warn" size="sm" title="Forfeit initiated">
              The arbiter has started a two-phase forfeit. It can't execute until
              the{' '}
              <Tooltip
                tone="warn"
                size="md"
                content="The manager's pause-adjusted delay before execution. It permits the arbiter to cancel, but does not itself create a generic committer challenge transaction."
              >
                forfeit execution delay
              </Tooltip>{' '}
              below elapses. The arbiter may cancel any time before execution.
            </Notice>
            {forfeit.state === 'PENDING' && (
              <Countdown
                label="forfeit execution delay"
                elapsed={executionDelayElapsed}
                total={executionDelayTotalSecs}
                tone="warn"
              />
            )}
            {forfeit.state === 'PAUSED' && (
              <Notice tone="warn" size="sm" title="Execution paused by the manager">
                The effective delay has elapsed, but executeForfeit remains unavailable until the manager resumes forfeiture.
              </Notice>
            )}
          </>
        )}

        {membership.isMember && membership.mutualId !== undefined && (
          <>
            <Notice tone="info" size="sm" title="Mutual member capital">
              This commitment backs mutual #{membership.mutualId.toString()} —
              it exits via the mutual’s deallocation window instead of a normal
              unbond. See{' '}
              <Link to={`/app/marketplace/${membership.mutualId.toString()}`}>
                the mutual’s page
              </Link>{' '}
              for cover, roster, and premium detail.
            </Notice>
            {membership.lossPending && (
              <Notice tone="warn" size="sm" title="Loss declaration pending">
                The mutual’s arbiter has declared a loss. Exits and releases are
                frozen until the declaration executes or is cancelled.
              </Notice>
            )}
            {membership.unsettled && membership.owedUnits > 0n && (
              <Notice tone="warn" size="sm" title="Unsettled loss share">
                <TokenAmount
                  amount={membership.owedUnits}
                  decimals={decimals}
                  symbol={symbol}
                  size="inline"
                />{' '}
                of this stake is owed to the mutual’s beneficiary and will be
                deducted when settled.
              </Notice>
            )}
            {exitRequested && !exitMature && exitTotalSecs > 0 && (
              <Countdown
                label="deallocation window"
                elapsed={exitElapsed}
                total={exitTotalSecs}
                tone="info"
              />
            )}
            {exitRequested && exitMature && (
              <Notice tone="success" size="sm" title="Deallocation window elapsed">
                {membership.unsettled
                  ? 'Settle the outstanding loss share, then anyone can release this member.'
                  : 'Anyone can release this member now — the remaining stake returns to the committer’s free balance.'}
              </Notice>
            )}
          </>
        )}

        {unbond.isUnbonding && (
          <Notice
            tone={unbond.isMature ? 'success' : 'info'}
            size="sm"
            title={unbond.isMature ? 'Unbond matured' : 'Unbonding'}
          >
            {unbond.isMature
              ? 'Anyone can finalize and close this commitment now.'
              : `Matures at ${new Date(Number(unbond.maturesAt) * 1000).toLocaleString()}`}
          </Notice>
        )}

        {!isConnected && (
          <Notice tone="info" size="sm" title="Read-only mode">
            Connect a wallet to act on this commitment.
          </Notice>
        )}

        {actions.length === 0 ? (
          <EmptyState
            title="No actions available"
            description="This commitment is locked-in for your wallet right now. Check back when its status or your role changes."
          />
        ) : (
          <div className="ds-stack ds-stack-3">
            {actions.map((action) => (
              <ResolveActionRow
                key={action.kind}
                action={action}
                commitment={commitment}
                managerAddress={managerAddress}
                decimals={decimals}
                symbol={symbol}
                yieldEntries={yieldInfo.entries}
                owedLossUnits={membership.owedUnits}
                onActed={handleActed}
              />
            ))}
          </div>
        )}
      </div>
    </Modal>
  )
}

function RoleLabel({ role }: { role: ViewerRole }) {
  if (role === 'spectator') return <span className="ds-muted">spectator</span>
  return <span className="ds-mono-num">{role}</span>
}
