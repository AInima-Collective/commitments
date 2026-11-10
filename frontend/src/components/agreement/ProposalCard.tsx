import { Link } from 'react-router-dom'
import { type Address } from 'viem'
import { useAccount } from 'wagmi'
import { commitmentManagerAbi } from '../../generated'
import { type AgreementProposalWithStatus } from '../../utils/agreements'
import { AddressDisplay, Button, Notice, OperatorAvatar, TokenAmount } from '../ui'
import { CommitmentStatusBadge } from '../protocol'
import { useCountdown } from '../../hooks/useCountdown'
import { useLedgerBalance } from '../../hooks/useLedgerBalance'
import { useTokenMeta } from '../../hooks/useTokenMeta'
import { useWriteAction } from '../../hooks/useWriteAction'
import { formatDuration } from '../../lib/format'
import { formatBps } from '../../utils/commitments'

interface ProposalCardProps {
  proposal: AgreementProposalWithStatus
  managerAddress: Address
  isConnected: boolean
  onAccepted?: () => void
  onRejected?: () => void
}

export function ProposalCard({
  proposal,
  managerAddress,
  isConnected,
  onAccepted,
  onRejected,
}: ProposalCardProps) {
  // v2: both legs share one backing token; amounts are denominated in it.
  const { decimals, symbol } = useTokenMeta(proposal.token)
  const remainingMs = useCountdown(proposal.expiresAt)
  const remainingSecs = Math.max(0, Math.floor(remainingMs / 1000))
  const isExpired = remainingMs === 0 && proposal.expiresAt > 0n

  // My amount and their amount from viewer's perspective
  const myAmount = proposal.viewerIsProposer
    ? proposal.proposerAmount
    : proposal.acceptorAmount
  const theirAmount = proposal.viewerIsProposer
    ? proposal.acceptorAmount
    : proposal.proposerAmount

  const otherParty = proposal.viewerIsProposer ? proposal.acceptor : proposal.proposer

  // Free-balance pre-check for the ACCEPT path: accepting encumbers the
  // viewer's leg (`myAmount`) of the shared backing token, so a manager
  // free balance below that would revert on-chain. Only meaningful for
  // incoming proposals (the viewer is the acceptor).
  const { address: connectedAddress } = useAccount()
  const { free: freeBalance } = useLedgerBalance({
    managerAddress,
    token: proposal.token,
    user: connectedAddress,
  })
  const insufficientBacking =
    !proposal.viewerIsProposer &&
    freeBalance !== undefined &&
    myAmount > freeBalance

  // Accept tx (incoming proposals only)
  const accept = useWriteAction({ successTitle: 'AGREEMENT ACCEPTED', onSuccess: () => onAccepted?.() })
  // Cancel/reject tx (outgoing or incoming reject)
  const cancel = useWriteAction({
    successTitle: proposal.viewerIsProposer ? 'PROPOSAL CANCELLED' : 'PROPOSAL REJECTED',
    onSuccess: () => onRejected?.(),
  })

  function handleAccept() {
    if (!managerAddress) return
    accept.write({
      abi: commitmentManagerAbi,
      address: managerAddress,
      functionName: 'acceptAgreement',
      args: [proposal.proposalId],
    })
  }

  function handleCancelOrReject() {
    if (!managerAddress) return
    cancel.write({
      abi: commitmentManagerAbi,
      address: managerAddress,
      functionName: 'cancelAgreementProposal',
      args: [proposal.proposalId],
    })
  }

  const isAcceptPendingAny = accept.isPending || accept.isConfirming
  const isCancelPendingAny = cancel.isPending || cancel.isConfirming

  const expiryLabel = isExpired
    ? 'EXPIRED'
    : remainingSecs > 0
      ? `EXPIRES IN ${formatDuration(remainingSecs)}`
      : ''

  const titleLabel = proposal.viewerIsProposer
    ? 'Outgoing agreement proposal'
    : 'Incoming agreement proposal'

  return (
    <article
      className="ds-decision-row"
      aria-label={`Agreement proposal ${proposal.viewerIsProposer ? 'to' : 'from'} ${otherParty}`}
    >
      <header className="ds-decision-row-actor">
        <OperatorAvatar address={otherParty} size="sm" />
        <span className="ds-decision-row-actor-name">
          {proposal.viewerIsProposer ? 'TO: ' : 'FROM: '}
          <AddressDisplay address={otherParty} />
        </span>
        {proposal.viewerIsProposer && (
          <CommitmentStatusBadge status="PROPOSED" />
        )}
      </header>
      <div className="ds-decision-row-body">
        <span className="ds-decision-row-title" title={titleLabel}>
          {titleLabel}
        </span>
        <span className="ds-decision-row-meta">
          {expiryLabel}
          {expiryLabel && ' \u00b7 '}
          YOU:{' '}
          <TokenAmount amount={myAmount} decimals={decimals} symbol={symbol} size="inline" />
          {' \u00b7 '}
          THEM:{' '}
          <TokenAmount amount={theirAmount} decimals={decimals} symbol={symbol} size="inline" />
          {' \u00b7 '}
          MAX PENALTY {formatBps(proposal.maxPenaltyBps)}
          {' \u00b7 '}
          CHALLENGE {formatDuration(Number(proposal.challengeWindow))}
        </span>
      </div>
      {insufficientBacking && (
        <Notice
          tone="warn"
          size="sm"
          title="INSUFFICIENT BACKING"
          actions={
            <Link to="/app" className="ds-btn ds-btn--sm">
              ADD BACKING
            </Link>
          }
        >
          Accepting locks{' '}
          <TokenAmount amount={myAmount} decimals={decimals} symbol={symbol} size="inline" />{' '}
          of free backing, but your manager balance has only{' '}
          <TokenAmount amount={freeBalance ?? 0n} decimals={decimals} symbol={symbol} size="inline" />.
          Add funds to accept.
        </Notice>
      )}
      <div className="ds-decision-row-actions">
        {!proposal.viewerIsProposer ? (
          <>
            <Button
              variant="primary"
              onClick={handleAccept}
              disabled={
                !isConnected || isAcceptPendingAny || isCancelPendingAny || insufficientBacking
              }
              title={
                !isConnected
                  ? 'Connect wallet to accept'
                  : insufficientBacking
                    ? 'Insufficient backing — add funds to accept'
                    : undefined
              }
            >
              {isAcceptPendingAny ? 'ACCEPTING...' : 'ACCEPT'}
            </Button>
            <Button
              onClick={handleCancelOrReject}
              disabled={!isConnected || isAcceptPendingAny || isCancelPendingAny}
              title={!isConnected ? 'Connect wallet to reject' : undefined}
            >
              {isCancelPendingAny ? 'REJECTING...' : 'REJECT'}
            </Button>
          </>
        ) : (
          <Button
            onClick={handleCancelOrReject}
            disabled={!isConnected || isCancelPendingAny}
            title={!isConnected ? 'Connect wallet to cancel' : undefined}
          >
            {isCancelPendingAny ? 'CANCELLING...' : 'CANCEL PROPOSAL'}
          </Button>
        )}
      </div>
    </article>
  )
}
