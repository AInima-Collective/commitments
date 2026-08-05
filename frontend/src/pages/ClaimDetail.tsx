import { useMemo } from 'react'
import { Link, Navigate, useParams, useSearchParams } from 'react-router-dom'
import { useAccount, useChainId } from 'wagmi'

import { BondStackList } from '../components/claim/BondStackList'
import { ClaimActions } from '../components/claim/ClaimActions'
import { PageHeader } from '../components/protocol'
import {
  AddressDisplay,
  ErrorPanel,
  Notice,
  StatBlock,
  TokenAmount,
} from '../components/ui'
import { findOptimisticInsuranceArbiter, getOptimisticInsuranceArbiters } from '../config/arbiters'
import { useDisplayNow } from '../hooks/useDisplayNow'
import { useOptimisticClaim } from '../hooks/useOptimisticClaim'
import { formatBps } from '../utils/commitments'

/**
 * /claims/:id — read-shareable detail surface for an optimistic-insurance
 * claim. Claim ids are PER-ARBITER counters, and each bond denomination has
 * its own `OptimisticInsuranceArbiter` instance, so the route carries the
 * instance in an `?arbiter=0x…` search param (matched case-insensitively
 * against the configured list in `config/arbiters`). Links without the param
 * — bookmarks predating the second instance — fall back to the canonical
 * USDC-bonded arbiter. Independent of the connected wallet for read; action
 * gating uses the connected wallet.
 *
 * The seeded demo opens a single live claim against
 * direct-coverage-optimistic-seed; navigating to /claims/1 surfaces it.
 */
export default function ClaimDetail() {
  const { id: idParam } = useParams<{ id: string }>()
  const [searchParams] = useSearchParams()
  const chainId = useChainId()
  const { address: connectedAddress } = useAccount()
  const arbiterParam = searchParams.get('arbiter') ?? undefined
  const arbiterAddress = (
    findOptimisticInsuranceArbiter(chainId, arbiterParam) ??
    getOptimisticInsuranceArbiters(chainId)[0]
  )?.address

  const claimId = useMemo<bigint | null>(() => {
    if (!idParam) return null
    try {
      return BigInt(idParam)
    } catch {
      return null
    }
  }, [idParam])

  const { claim, config, isLoading, error, refetch } = useOptimisticClaim(
    arbiterAddress,
    claimId !== null && claimId > 0n ? claimId : undefined,
  )
  const now = useDisplayNow()

  if (idParam && claimId === null) {
    return <Navigate to="/app" replace />
  }

  if (!arbiterAddress) {
    return (
      <div className="ds-page">
        <PageHeader eyebrow="optimistic-insurance" title="Claim" />
        <Notice tone="warn" title="Claims unavailable">
          Claim state is temporarily unavailable — please check back shortly.
        </Notice>
      </div>
    )
  }

  if (error) {
    return (
      <div className="ds-page">
        <BackLink />
        <PageHeader eyebrow="optimistic-insurance" title={`Claim #${claimId?.toString() ?? ''}`} />
        <Notice
          tone="danger"
          title="Failed to load claim"
          actions={
            <button type="button" className="ds-btn ds-btn--sm" onClick={refetch}>
              retry
            </button>
          }
        >
          {error.message}
        </Notice>
      </div>
    )
  }

  if (isLoading || !claim || !config) {
    return (
      <div className="ds-page">
        <BackLink />
        <PageHeader eyebrow="optimistic-insurance" title={`Claim #${claimId?.toString() ?? ''}`} />
        <Notice tone="info" title="Loading claim…">
          Reading claim state from the OptimisticInsuranceArbiter.
        </Notice>
      </div>
    )
  }

  if (claim.state === 'None') {
    return (
      <div className="ds-page">
        <BackLink />
        <PageHeader eyebrow="optimistic-insurance" title={`Claim #${claimId?.toString() ?? ''}`} />
        <Notice tone="warn" title="Claim not found">
          No claim with id <code>#{claimId?.toString()}</code> exists on this
          arbiter.
        </Notice>
      </div>
    )
  }

  return (
    <div className="ds-page">
      <BackLink />
      <PageHeader
        eyebrow={`optimistic-insurance · ${claim.state.toLowerCase()}`}
        title={`Claim #${claim.claimId.toString()}`}
        lead={
          <span>
            Against commitment{' '}
            <Link to={`/app/commitments/${claim.commitmentId.toString()}`}>
              <code>#{claim.commitmentId.toString()}</code>
            </Link>
            . Bond stack escalates ≥ 2× per dispute up to
            {' '}{config.maxBondDoublings}{' '}doublings; once the answer window
            elapses without a new bond, the top-of-stack assertion finalizes by
            timeout.
          </span>
        }
      />

      <section className="ds-stat-grid" aria-label="Claim summary">
        <StatBlock value={claim.state} label="State" />
        <StatBlock
          value={
            claim.top ? (
              <TokenAmount
                amount={claim.top.bond}
                decimals={config.bondDecimals ?? 18}
                symbol={config.bondSymbol ?? ''}
                size="inline"
                compact
              />
            ) : (
              '—'
            )
          }
          label="Top bond"
        />
        <StatBlock
          value={claim.top ? formatBps(claim.top.amountBps) : '—'}
          label="Top assertion"
        />
        <StatBlock
          value={
            claim.state === 'Proposed' ? (
              <Countdown deadline={claim.answerDeadline} now={now} />
            ) : claim.state === 'Resolved' ? (
              `winning ${formatBps(claim.winningAmtBps)}`
            ) : (
              '—'
            )
          }
          label={
            claim.state === 'Proposed'
              ? 'Answer window'
              : claim.state === 'Resolved'
                ? 'Ruling'
                : 'Status'
          }
        />
      </section>

      <section className="ds-stack ds-stack-3" aria-labelledby="claim-bonds">
        <header className="ds-section-header">
          <h2 id="claim-bonds" className="ds-section-title">Bond stack</h2>
          <span className="ds-section-eyebrow">
            {claim.stack.length} of {config.maxBondDoublings} doublings used
          </span>
        </header>
        <ErrorPanel panelName="Bond stack">
          <BondStackList
            stack={claim.stack}
            bondSymbol={config.bondSymbol}
            bondDecimals={config.bondDecimals}
            viewerAddress={connectedAddress}
          />
        </ErrorPanel>
      </section>

      <ErrorPanel panelName="Claim actions">
        <ClaimActions
          arbiterAddress={arbiterAddress}
          claim={claim}
          config={config}
          viewer={connectedAddress}
          onActed={refetch}
        />
      </ErrorPanel>

      <section className="ds-stack ds-stack-2" aria-label="Arbiter config">
        <h3 className="ds-section-eyebrow">Arbiter configuration</h3>
        <div className="ds-text-xs ds-subtle">
          Arbiter: <AddressDisplay address={arbiterAddress} />
        </div>
        <div className="ds-text-xs ds-subtle">
          Bond token (
          <code>{config.bondSymbol ?? '—'}</code>): <AddressDisplay address={config.bondToken} />
        </div>
        <div className="ds-text-xs ds-subtle">
          Manager: <AddressDisplay address={config.manager} />
        </div>
        <div className="ds-text-xs ds-subtle">
          Fallback:{' '}
          {config.fallbackEnabled ? (
            <AddressDisplay address={config.fallbackArbitrator} />
          ) : (
            <span>none — bond exhaustion is terminal</span>
          )}
        </div>
        <div className="ds-text-xs ds-subtle">
          Treasury: <AddressDisplay address={config.treasury} /> · winnerShareBps:{' '}
          {formatBps(config.winnerShareBps)}
        </div>
        <div className="ds-text-xs ds-subtle">
          Min bond:{' '}
          <TokenAmount
            amount={config.minBond}
            decimals={config.bondDecimals ?? 18}
            symbol={config.bondSymbol ?? ''}
            size="inline"
          />
          {' · '}answer timeout:{' '}
          {humanSeconds(config.answerTimeout)}
          {' · '}stale TTL:{' '}
          {humanSeconds(config.staleTtl)}
        </div>
      </section>
    </div>
  )
}

function BackLink() {
  return (
    <div className="ds-text-xs ds-subtle">
      <Link to="/app/explorer">← back to explorer</Link>
    </div>
  )
}

function Countdown({ deadline, now }: { deadline: bigint; now: number }) {
  const remaining = Number(deadline) - now
  if (remaining <= 0) return <span>ready to finalize</span>
  return <span>{humanSeconds(BigInt(remaining))}</span>
}

function humanSeconds(secs: bigint): string {
  const n = Number(secs)
  if (n < 60) return `${n}s`
  if (n < 3_600) return `${Math.round(n / 60)}m`
  if (n < 86_400) return `${Math.round(n / 3_600)}h`
  return `${Math.round(n / 86_400)}d`
}
