import { type Address } from 'viem'
import {
  AddressDisplay,
  Drawer,
  Notice,
  StatBlock,
  TokenAmount,
} from '../ui'
import { CommitmentStatusBadge } from '../protocol'
import { useDisplayNow } from '../../hooks/useDisplayNow'
import { useTokenMeta } from '../../hooks/useTokenMeta'
import { type UnifiedProposalRowEntry } from '../../hooks/useUnifiedRows'
import { formatBps } from '../../lib/commitments'
import { formatDuration } from '../../lib/format'
import { ProposalCard } from './ProposalCard'

interface AgreementProposalDrawerProps {
  open: boolean
  onClose: () => void
  /** Pending agreement proposal (pre-acceptance). Null = drawer closed. */
  row: UnifiedProposalRowEntry | null
  managerAddress: Address
  isConnected: boolean
  /** Refetch parent data when an action mutates state. */
  onActed?: () => void
}

/**
 * Right-side drawer for pending agreement proposals — accept, reject,
 * or proposer-side cancel. Commitment rows have their own detail page
 * (`/commitments/:id`); only proposals route through this drawer.
 */
export function AgreementProposalDrawer({
  open,
  onClose,
  row,
  managerAddress,
  isConnected,
  onActed,
}: AgreementProposalDrawerProps) {
  const now = useDisplayNow()
  // v2: amounts are denominated in the proposal's backing token (both legs
  // share one). Hook runs unconditionally; falls back gracefully when row null.
  const { decimals, symbol } = useTokenMeta(row?.token)

  if (!row) {
    return <Drawer open={open} onClose={onClose} title="Proposal" size="lg" />
  }

  const remaining = Number(row.expiresAt) - now
  const isExpired = remaining <= 0

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title={
        <span className="ds-row ds-row-2" style={{ alignItems: 'center' }}>
          <span style={{ color: 'var(--text-muted)' }}>↔</span>
          <span>Proposal #{row.id.toString()}</span>
          <CommitmentStatusBadge status="ACTIVE" />
        </span>
      }
      description={
        row.role === 'proposer'
          ? 'Outgoing agreement proposal — cancel below if no longer wanted.'
          : 'Incoming agreement proposal — accept to lock both sides into a paired commitment, or reject.'
      }
      size="lg"
    >
      <div className="ds-stack ds-stack-6">
        <Notice
          tone={isExpired ? 'warn' : 'info'}
          size="sm"
          title={isExpired ? 'Expired' : 'Time to act'}
        >
          {isExpired
            ? 'This proposal has passed its expiry window and can no longer be accepted.'
            : `This proposal expires in ${formatDuration(remaining)}.`}
        </Notice>

        <section className="ds-stat-grid" aria-label="Parties">
          <StatBlock label="Proposer" value={<AddressDisplay address={row.committer} />} />
          <StatBlock label="Acceptor" value={<AddressDisplay address={row.counterparty} />} />
          <StatBlock label="Arbiter" value={<AddressDisplay address={row.arbiter} />} />
        </section>

        <section className="ds-stat-grid" aria-label="Stake">
          <StatBlock
            label={row.role === 'proposer' ? 'Your stake' : "Acceptor's stake"}
            value={
              <TokenAmount
                amount={row.role === 'proposer' ? row.proposal.proposerAmount : row.proposal.acceptorAmount}
                decimals={decimals}
                symbol={symbol}
              />
            }
          />
          <StatBlock
            label={row.role === 'proposer' ? "Acceptor's stake" : 'Your stake'}
            value={
              <TokenAmount
                amount={row.role === 'proposer' ? row.proposal.acceptorAmount : row.proposal.proposerAmount}
                decimals={decimals}
                symbol={symbol}
              />
            }
          />
          <StatBlock label="Max penalty" value={formatBps(row.maxPenaltyBps)} />
        </section>

        <ProposalCard
          proposal={row.proposal}
          managerAddress={managerAddress}
          isConnected={isConnected}
          onAccepted={() => {
            onActed?.()
            onClose()
          }}
          onRejected={() => {
            onActed?.()
            onClose()
          }}
        />
      </div>
    </Drawer>
  )
}
