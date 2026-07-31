import { useMemo, useState } from 'react'
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom'
import { useAccount, useChainId } from 'wagmi'
import { ProposeClaimAction } from '../components/claim/ProposeClaimAction'
import { CommitmentDetailContent } from '../components/commitment/CommitmentDetailContent'
import { ResolveCommitmentModal } from '../components/commitment/ResolveCommitmentModal'
import { CommitmentStatusBadge, CommitmentTitle, PageHeader } from '../components/protocol'
import { Notice, TokenAmount } from '../components/ui'
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

/**
 * /commitments/:id — standalone, link-shareable detail surface for a single
 * commitment. Independent of the connected wallet (anyone with the URL can
 * read it); the resolve flow falls back to a read-only state when the viewer
 * isn't a party to the commitment.
 */
export default function CommitmentDetail() {
  const { id: idParam } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const chainId = useChainId()
  const viewAddress = useViewAddress()
  const { address: connectedAddress, isConnected } = useAccount()
  const env = getContractAddresses(chainId)
  const { commitmentManager: managerAddress, commitmentsVault: vaultAddress } = env

  // Validate id param up front. BigInt() throws on non-numeric strings — bounce
  // those back to the listing rather than rendering a broken page.
  const id = useMemo<bigint | null>(() => {
    if (!idParam) return null
    try {
      return BigInt(idParam)
    } catch {
      return null
    }
  }, [idParam])

  const indexed = useIndexedCommitment(id ?? undefined, viewAddress)
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
    return <Navigate to="/app/commitments" replace />
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

  if (!indexed.indexerOnline) {
    return (
      <div className="ds-page">
        <BackLink />
        <PageHeader eyebrow="primitive" title={`Commitment #${id?.toString() ?? ''}`} />
        <Notice tone="warn" title="Details unavailable">
          Commitment details are temporarily unavailable — please retry shortly.
        </Notice>
      </div>
    )
  }

  if (indexed.notFound) {
    return (
      <div className="ds-page">
        <BackLink />
        <PageHeader eyebrow="primitive" title={`Commitment #${id?.toString() ?? ''}`} />
        <Notice tone="warn" title="Commitment not found">
          No commitment with id <code>#{id?.toString()}</code> exists in the indexer. It may be
          on a different chain, or the indexer hasn't caught up yet.
        </Notice>
      </div>
    )
  }

  if (indexed.error) {
    return (
      <div className="ds-page">
        <BackLink />
        <PageHeader eyebrow="primitive" title={`Commitment #${id?.toString() ?? ''}`} />
        <Notice
          tone="danger"
          title="Failed to load commitment"
          actions={
            <button type="button" className="ds-btn ds-btn--sm" onClick={indexed.refetch}>
              retry
            </button>
          }
        >
          {indexed.error.message}
        </Notice>
      </div>
    )
  }

  if (!row || !label) {
    // First load — render the chrome so the URL feels responsive.
    return (
      <div className="ds-page">
        <BackLink />
        <PageHeader eyebrow="primitive" title={`Commitment #${id?.toString() ?? ''}`} />
        <p className="ds-subtle">Loading commitment…</p>
      </div>
    )
  }

  const forfeitRemaining =
    row.status === 'FORFEIT_PENDING' && row.forfeitChallengeEnd !== undefined
      ? Number(row.forfeitChallengeEnd) - now
      : undefined
  const challengeWindowSecs = full?.challengeWindow ? Number(full.challengeWindow) : undefined
  const challengeElapsed =
    challengeWindowSecs !== undefined && forfeitRemaining !== undefined
      ? Math.max(0, challengeWindowSecs - Math.max(0, forfeitRemaining))
      : undefined

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
      <BackLink />
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
            <button
              type="button"
              className="ds-btn ds-btn--primary"
              onClick={() => setResolveOpen(true)}
              disabled={!full}
              title={!full ? 'Loading commitment data…' : undefined}
            >
              Open resolve flow
            </button>
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
            challengeWindowSecs={challengeWindowSecs}
            challengeElapsed={challengeElapsed}
            unbondTotalSecs={unbondTotalSecs}
            unbondElapsed={unbondElapsed}
            onSelectTag={(tag) => navigate(`/app/commitments?tag=${encodeURIComponent(tag)}`)}
            onRefetchMetadata={indexed.refetch}
          />
        </div>

        <footer className="ds-commitment-card-footer">
          <span>{createdLabel}</span>
          {expiresLabel && <span>{expiresLabel}</span>}
        </footer>
      </article>

      {full && (
        <ResolveCommitmentModal
          open={resolveOpen}
          onClose={() => setResolveOpen(false)}
          commitment={full}
          managerAddress={managerAddress}
          vaultAddress={vaultAddress}
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

function BackLink() {
  return (
    <Link to="/app/commitments" className="ds-text-sm ds-subtle" style={{ alignSelf: 'flex-start' }}>
      ← All commitments
    </Link>
  )
}
