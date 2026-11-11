import { useMemo, useState, type ReactNode } from 'react'
import { Link, Navigate, useLocation, useParams, useSearchParams } from 'react-router-dom'
import { isAddress, type Address } from 'viem'
import { useAccount, useChainId } from 'wagmi'
import { ProposeClaimAction } from '../components/claim/ProposeClaimAction'
import { CommitmentDetailContent } from '../components/commitment/CommitmentDetailContent'
import { ResolveCommitmentModal } from '../components/commitment/ResolveCommitmentModal'
import { ArbitrationPanel } from '../components/arbiter/ArbitrationPanel'
import { CommitmentStatusBadge, CommitmentTitle, PageHeader } from '../components/protocol'
import { Button, Notice, TokenAmount } from '../components/ui'
import { findOptimisticInsuranceArbiter } from '../config/arbiters'
import { getContractAddresses } from '../config/contracts'
import { useCommitmentLabelContext } from '../hooks/useCommitmentLabelContext'
import { useDisplayNow } from '../hooks/useDisplayNow'
import { useFullCommitment } from '../hooks/useFullCommitment'
import { useIndexedCommitment } from '../hooks/useIndexedCommitment'
import { useTokenMeta } from '../hooks/useTokenMeta'
import { type UnifiedCommitmentRowEntry } from '../hooks/useUnifiedRows'
import { useViewAddress } from '../hooks/useViewAddress'
import { commitmentLabel } from '../lib/commitmentLabel'
import { parseIdParam } from '../lib/routeParams'

/**
 * /commitments/:id — standalone, link-shareable detail surface for a single
 * commitment. Independent of the connected wallet (anyone with the URL can
 * read it); the resolve flow falls back to a read-only state when the viewer
 * isn't a party to the commitment.
 */
export default function CommitmentDetail() {
  const { id: idParam } = useParams<{ id: string }>()
  const location = useLocation()
  const [searchParams] = useSearchParams()
  const origin = commitmentOrigin(location.state)
  const chainId = useChainId()
  const viewAddress = useViewAddress()
  const { address: connectedAddress, isConnected } = useAccount()
  const env = getContractAddresses(chainId)
  const configuredManager = env.commitmentManager
  const managerQuery = searchParams.get('manager')
  const managerAddress: Address | undefined =
    managerQuery && isAddress(managerQuery) ? (managerQuery as Address) : configuredManager

  // A malformed id bounces back to the listing below.
  const id = parseIdParam(idParam)

  const indexed = useIndexedCommitment(id ?? undefined, viewAddress, managerAddress)
  // v2: every commitment carries its own backing token. Amounts are denominated
  // in that token (raw ERC-20 or vault share), never the vault share globally.
  const { decimals, symbol } = useTokenMeta(indexed.row?.token)

  const { full, refetch: refetchFull } = useFullCommitment({
    managerAddress,
    id: id ?? undefined,
    hints: indexed.row
      ? {
          committer: indexed.row.committer,
          arbiter: indexed.row.arbiter,
          counterparty: indexed.row.counterparty,
          amount: indexed.row.amount,
        }
      : undefined,
  })

  const [resolveOpen, setResolveOpen] = useState(false)
  const now = useDisplayNow()

  // Wrap the indexer row in the UnifiedCommitmentRowEntry shape the shared
  // body component expects. Built before the early returns below because the
  // label hooks need it and hooks cannot run conditionally.
  const row = useMemo<UnifiedCommitmentRowEntry | null>(() => {
    const r = indexed.row
    if (!r) return null
    return {
      kind: 'commitment',
      id: r.id,
      status: r.status,
      direction: r.direction,
      role: r.role,
      committer: r.committer,
      counterparty: r.counterparty,
      arbiter: r.arbiter,
      token: r.token,
      amount: r.amount,
      maxPenaltyBps: r.maxPenaltyBps,
      forfeitChallengeEnd: r.forfeitChallengeEnd,
      vault: r.vault,
      manager: r.manager,
      commitment: r,
    }
  }, [indexed.row])

  const labelRows = useMemo(() => (row ? [row] : []), [row])
  const labelContext = useCommitmentLabelContext(labelRows, { metaFor: () => ({ decimals, symbol }) })
  const label = row ? commitmentLabel(row, labelContext) : null

  if (idParam && id === null) {
    return <Navigate to="/app/explorer" replace />
  }

  if (!managerAddress) {
    return (
      <div className="ds-page">
        <PageHeader eyebrow="primitive" title="Commitment" />
        <Notice tone="danger" title="Commitment manager not configured">
          Set <code>VITE_COMMITMENT_MANAGER_ADDRESS</code> in your environment to enable commitments.
        </Notice>
      </div>
    )
  }

  const placeholder = (body: ReactNode) => (
    <div className="ds-page">
      <BackLink origin={origin} />
      <PageHeader eyebrow="primitive" title={`Commitment #${id?.toString() ?? ''}`} />
      {body}
    </div>
  )

  if (!indexed.indexerOnline) {
    return placeholder(
      <Notice tone="warn" title="Details unavailable">
        Commitment details are temporarily unavailable — please retry shortly.
      </Notice>,
    )
  }

  if (indexed.notFound) {
    return placeholder(
      <Notice tone="warn" title="Commitment not found">
        No commitment with id <code>#{id?.toString()}</code> exists in the indexer. It may be
        on a different chain, or the indexer hasn't caught up yet.
      </Notice>,
    )
  }

  if (indexed.error) {
    return placeholder(
      <Notice
        tone="danger"
        title="Failed to load commitment"
        actions={
          <Button size="sm" onClick={indexed.refetch}>
            retry
          </Button>
        }
      >
        {indexed.error.message}
      </Notice>,
    )
  }

  if (!row || !label) {
    // First load — render the chrome so the URL feels responsive.
    return placeholder(<p className="ds-subtle">Loading commitment…</p>)
  }

  // Unbond countdown — derived from the indexed timestamps so anonymous
  // visitors see the same window as the connected wallet.
  const unbondInitiatedAt = row.commitment.unbondInitiatedAt
  const unbondMaturesAt = row.commitment.unbondMaturesAt
  const unbondTotalSecs =
    unbondInitiatedAt !== undefined && unbondMaturesAt !== undefined
      ? Number(unbondMaturesAt - unbondInitiatedAt)
      : undefined
  const unbondElapsed =
    unbondTotalSecs !== undefined && unbondInitiatedAt !== undefined
      ? Math.max(0, Math.min(unbondTotalSecs, now - Number(unbondInitiatedAt)))
      : undefined

  // Optimistic-claim entry point: when this commitment's arbiter is one of
  // the configured OptimisticInsuranceArbiter instances (one per bond
  // denomination — USDC, DAI, …), anyone can open a bonded claim against the
  // stake — surface the affordance next to the resolve flow. The claim flow
  // reads bondToken()/bondFloor() from the commitment's own arbiter, so
  // matching here is purely a "does this arbiter speak the claim game" gate.
  const optimisticArbiter = findOptimisticInsuranceArbiter(chainId, row.arbiter)

  const createdLabel = `created at block #${row.commitment.createdBlock.toString()}`
  const expiresLabel = full?.expiresAt
    ? `expires ${new Date(Number(full.expiresAt) * 1000).toISOString().slice(0, 10)}`
    : null
  const directionGlyph = row.direction === 'paired' ? '↔' : '→'

  return (
    <div className="ds-page">
      <BackLink origin={origin} />
      <PageHeader
        eyebrow={
          <span className="ds-row ds-row-2" style={{ alignItems: 'center' }}>
            <span>{row.direction === 'paired' ? 'paired commitment' : 'commitment'}</span>
            <span className="ds-mono-num">#{row.id.toString()}</span>
          </span>
        }
        // The name leads and the id demotes to the eyebrow beside it. `#12` is
        // still on the page, still copyable, still what support will ask for —
        // it is just no longer the answer to "what is this?".
        title={<CommitmentTitle label={label} as="span" size="lg" showAttested />}
        lead={
          row.direction === 'paired' && row.commitment.agreementId !== undefined ? (
            <span className="ds-text-sm ds-subtle">
              Paired with agreement #{row.commitment.agreementId.toString()}
              {row.commitment.agreementSide ? ` (side ${row.commitment.agreementSide})` : ''}.
            </span>
          ) : undefined
        }
        actions={
          <div className="ds-row ds-row-2" style={{ alignItems: 'center', flexWrap: 'wrap' }}>
            {optimisticArbiter && (
              <ProposeClaimAction
                arbiterAddress={optimisticArbiter.address}
                commitmentId={row.id}
                status={row.status}
                challengeWindow={full?.challengeWindow}
                maxPenaltyBps={row.maxPenaltyBps}
                amount={row.amount}
                tokenDecimals={decimals}
                tokenSymbol={symbol}
              />
            )}
            <Button
              variant="primary"
              onClick={() => setResolveOpen(true)}
              disabled={!full}
              title={!full ? 'Loading commitment data…' : undefined}
            >
              Open resolve flow
            </Button>
          </div>
        }
      />

      <article className="ds-commitment-card">
        <header className="ds-commitment-card-header">
          <span className="ds-row ds-row-3" style={{ alignItems: 'center' }}>
            <span className="ds-commitment-card-id" aria-label="commitment id">
              <span style={{ color: 'var(--text-muted)', marginRight: 6 }} aria-hidden>
                {directionGlyph}
              </span>
              commitment #{row.id.toString()}
            </span>
            <CommitmentStatusBadge status={row.commitment.status} />
          </span>
        </header>

        <div className="ds-commitment-card-body">
          <div className="ds-commitment-card-amount-row">
            <TokenAmount
              amount={row.amount}
              decimals={decimals}
              symbol={symbol}
              size="display"
              withIcon
            />
          </div>
          <hr className="ds-divider" />
          <CommitmentDetailContent
            row={row}
            label={label}
            decimals={decimals}
            unbondTotalSecs={unbondTotalSecs}
            unbondElapsed={unbondElapsed}
            onRefetchMetadata={indexed.refetch}
          />
        </div>

        <footer className="ds-commitment-card-footer">
          <span>{createdLabel}</span>
          {expiresLabel && <span>{expiresLabel}</span>}
        </footer>
      </article>

      <ArbitrationPanel
        commitmentId={row.id}
        arbiter={row.arbiter}
        manager={row.manager ?? managerAddress}
        amount={row.amount}
        committer={row.committer}
        counterparty={row.counterparty}
        challengeWindow={full?.challengeWindow}
        indexedPenaltyBps={row.commitment.forfeitPenaltyBps}
        decimals={decimals}
        symbol={symbol}
      />

      {full && (
        <ResolveCommitmentModal
          open={resolveOpen}
          onClose={() => setResolveOpen(false)}
          commitment={full}
          managerAddress={managerAddress}
          connectedAddress={connectedAddress}
          isConnected={isConnected}
          onActed={(receipt) => {
            setResolveOpen(false)
            // The chain reads refresh instantly; the indexer row (which drives
            // the status badge + timestamps on this page) lags the receipt by a
            // block or two, so poll it up to the tx's block.
            indexed.refetchUntilBlock(receipt?.blockNumber)
            refetchFull()
          }}
        />
      )}
    </div>
  )
}

type CommitmentOrigin = 'dashboard' | 'explorer'

function commitmentOrigin(state: unknown): CommitmentOrigin | undefined {
  if (!state || typeof state !== 'object' || !('commitmentOrigin' in state)) return undefined
  const origin = state.commitmentOrigin
  return origin === 'dashboard' || origin === 'explorer' ? origin : undefined
}

function BackLink({ origin }: { origin: CommitmentOrigin | undefined }) {
  const to = origin === 'dashboard' ? '/app' : '/app/explorer'
  const label = origin === 'dashboard' ? 'Dashboard' : 'Explorer'

  return (
    <Link to={to} className="ds-text-sm ds-subtle" style={{ alignSelf: 'flex-start' }}>
      ← {label}
    </Link>
  )
}
