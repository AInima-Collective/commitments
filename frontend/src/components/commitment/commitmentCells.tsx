import { useState } from 'react'
import { type Address } from 'viem'
import { AddressDisplay, Button, TokenAmount } from '../ui'
import { CommitmentStatusBadge, CommitmentTags, CommitmentTitle } from '../protocol'
import { ResolveCommitmentModal } from './ResolveCommitmentModal'
import { type CommitmentHints } from '../../hooks/commitmentReads'
import { useDisplayNow } from '../../hooks/useDisplayNow'
import { useFullCommitment } from '../../hooks/useFullCommitment'
import { type UnifiedRow } from '../../hooks/useUnifiedRows'
import { commitmentLabel, type CommitmentLabelContext } from '../../lib/commitmentLabel'
import { metadataTags } from '../../lib/commitmentMetadata'
import { formatDuration } from '../../lib/format'

/**
 * Cells shared by the table and the card list.
 *
 * The whole cost of shipping two renderers over one row type is that they
 * drift, and the rules most likely to drift are exactly the ones that matter:
 * which statuses colour a row, when a countdown appears, and whether an
 * unverified title is allowed to act as a name. So every one of those lives
 * here once and both layouts consume it. Neither view owns a private copy of a
 * status rule.
 */

/** Minimal token-meta resolver shape — what {@link useTokenMetaMap} returns. */
export interface TokenMetaResolver {
  metaFor: (token?: Address) => { decimals: number; symbol: string }
  /** Lets the label layer hold back an amount until its symbol is real. */
  isLoading?: boolean
}

/**
 * Page-supplied context that turns on the per-row Resolve action. Omit to
 * render a read-only list (e.g. a viewer who can't act). The per-commitment
 * backing vault is read from each row (`row.vault`), so this carries only the
 * page-wide signing context.
 */
export interface CommitmentsResolveContext {
  managerAddress: Address
  connectedAddress: Address | undefined
  isConnected: boolean
  /** Refetch the page's rows after an action confirms. */
  onActed?: () => void
}

/**
 * Copyable address. Stops click propagation so copying an address doesn't also
 * trigger the row's open-detail navigation.
 */
export function CopyableAddress({ address }: { address: Address }) {
  return (
    <span style={{ display: 'inline-flex' }} onClick={(e) => e.stopPropagation()}>
      <AddressDisplay address={address} compact />
    </span>
  )
}

/**
 * Time-window detail rendered beneath the status badge. Returns null for
 * statuses with no active window (active/released/forfeited commitments).
 */
function windowDetail(
  r: UnifiedRow,
  now: number,
): { text: string; title: string; color: string } | null {
  if (r.kind === 'commitment' && r.status === 'FORFEIT_PENDING' && r.forfeitChallengeEnd !== undefined) {
    const remaining = Number(r.forfeitChallengeEnd) - now
    return {
      text: remaining > 0 ? `≥ ${formatDuration(remaining)} nominal` : 'check live readiness',
      title:
        remaining > 0
          ? `Nominal manager delay has at least ${formatDuration(remaining)} left; lifetime pause credit may extend it`
          : 'The indexer nominal delay elapsed; open the commitment for live pause-adjusted readiness',
      color: 'var(--warn)',
    }
  }
  if (r.kind === 'commitment' && r.status === 'UNBONDING' && r.commitment.unbondMaturesAt !== undefined) {
    const remaining = Number(r.commitment.unbondMaturesAt) - now
    if (remaining <= 0) {
      return {
        text: 'ready to release',
        title: 'Unbond matured — call finalizeUnbond to release',
        color: 'var(--accent)',
      }
    }
    return {
      text: `${formatDuration(remaining)} to mature`,
      title: `Unbond matures in ${formatDuration(remaining)}`,
      color: 'var(--accent)',
    }
  }
  if (r.kind === 'proposal') {
    const remaining = Number(r.expiresAt) - now
    if (remaining <= 0) {
      return { text: 'expired', title: 'Proposal expired', color: 'var(--text-muted)' }
    }
    return {
      text: `${formatDuration(remaining)} to act`,
      title: `Proposal expires in ${formatDuration(remaining)}`,
      color: 'var(--accent)',
    }
  }
  return null
}

/**
 * Status badge plus, when the row has an active time window (forfeit
 * challenge, unbonding maturity, proposal expiry), a live countdown beneath
 * it. Only rows with a window subscribe to the clock.
 */
export function StatusCell({ row }: { row: UnifiedRow }) {
  // Whether a window exists does not depend on `now`; only its text does.
  const hasWindow = windowDetail(row, 0) !== null
  return (
    <span style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'flex-start', gap: '2px' }}>
      <CommitmentStatusBadge status={row.status} />
      {hasWindow && <WindowCountdown row={row} />}
    </span>
  )
}

function WindowCountdown({ row }: { row: UnifiedRow }) {
  const detail = windowDetail(row, useDisplayNow())
  if (!detail) return null
  return (
    <span className="ds-mono-num" style={{ fontSize: 'var(--text-xs)', color: detail.color }} title={detail.title}>
      {detail.text}
    </span>
  )
}

/** The stake, denominated in the row's own backing token. */
export function AmountCell({
  row,
  tokenMeta,
  size,
}: {
  row: UnifiedRow
  tokenMeta: TokenMetaResolver
  size?: 'inline' | 'default' | 'display'
}) {
  const { decimals, symbol } = tokenMeta.metaFor(row.token)
  return <TokenAmount amount={row.amount} decimals={decimals} symbol={symbol} size={size} />
}

/**
 * The name cell. Two lines: what the commitment is, then what it is called by
 * the protocol plus its tags.
 *
 * `#12` never leaves the row. It is the only identifier that is authoritative
 * on chain, it is what a support conversation will ask for, and the name above
 * it may be a derived guess or an unverified string — so demoting the id to a
 * second line is as far as it goes.
 */
export function NameCell({
  row,
  ctx,
  size = 'md',
  maxTags = 3,
}: {
  row: UnifiedRow
  ctx: CommitmentLabelContext
  size?: 'sm' | 'md' | 'lg'
  maxTags?: number
}) {
  const label = commitmentLabel(row, ctx)
  const tags = metadataTags(row)
  // Tier 3 already renders the id as the name; repeating it below is noise.
  const showId = label.source !== 'id'

  // Which leg of an agreement this is.
  //
  // Both legs inherit the proposal's metadata by protocol design, so a bilateral
  // agreement renders as two rows with the same title — "Reciprocal uptime
  // pledge" twice, distinguished only by id. Suppressing the title in favour of
  // the derived "Agreement #4, side A" would fix that by throwing away the name,
  // which is the thing worth having. Showing the side alongside the id keeps
  // both: the name says what the deal is, the side says which end you are on.
  const paired = row.kind === 'commitment' && row.direction === 'paired' ? row.commitment : undefined
  const side = paired?.agreementSide

  return (
    <span className="ds-name-cell">
      <CommitmentTitle label={label} size={size} />
      {(showId || side || tags.length > 0) && (
        <span className="ds-name-cell-meta">
          {showId && (
            <span
              className="ds-mono-num ds-subtle"
              title={row.kind === 'proposal' ? 'Proposal id' : 'Commitment id'}
            >
              #{row.kind === 'proposal' ? 'p' : ''}
              {row.id.toString()}
            </span>
          )}
          {side && (
            <span
              className="ds-subtle"
              title={`This commitment is side ${side} of agreement #${paired?.agreementId?.toString() ?? ''}`}
            >
              side {side}
            </span>
          )}
          <CommitmentTags tags={tags} max={maxTags} />
        </span>
      )}
    </span>
  )
}

/**
 * Per-row Resolve action. The resolve modal needs the full on-chain commitment
 * (challenge window, strategies, released/forfeited flags) which the indexer
 * row doesn't carry — so we fetch it lazily, gated on the modal being open, to
 * avoid 4 reads per visible row. Indexed parties/amount seed the fetch as hints
 * so the modal can render its header before the chain reads resolve. The button
 * stops propagation so it doesn't also trigger the row's open-detail click.
 */
export function RowResolveAction({
  row,
  ctx,
}: {
  row: UnifiedRow & { kind: 'commitment' }
  ctx: CommitmentsResolveContext
}) {
  const [open, setOpen] = useState(false)
  const hints: CommitmentHints = {
    committer: row.committer,
    arbiter: row.arbiter,
    counterparty: row.counterparty,
    amount: row.amount,
  }
  const { full } = useFullCommitment({
    managerAddress: ctx.managerAddress,
    id: row.id,
    hints,
    enabled: open,
  })
  const loading = open && !full

  return (
    <>
      <Button
        size="sm"
        disabled={loading}
        aria-busy={loading || undefined}
        onClick={(e) => {
          e.stopPropagation()
          setOpen(true)
        }}
      >
        {loading ? 'Loading…' : 'Resolve'}
      </Button>
      {open && full && (
        <ResolveCommitmentModal
          open
          onClose={() => setOpen(false)}
          commitment={full}
          managerAddress={ctx.managerAddress}
          connectedAddress={ctx.connectedAddress}
          isConnected={ctx.isConnected}
          onActed={ctx.onActed}
        />
      )}
    </>
  )
}
