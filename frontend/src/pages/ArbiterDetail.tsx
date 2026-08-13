import { Link, Navigate, useParams } from 'react-router-dom'
import { isAddress, type Address } from 'viem'
import { useChainId } from 'wagmi'

import { getContractAddresses } from '../config/contracts'
import { useArbiterOverview } from '../hooks/useArbiterOverview'
import { useArbiterProfile } from '../hooks/useArbiterProfile'
import { useTokenMetaMap } from '../hooks/useTokenMeta'
import { getBlockExplorer } from '../lib/blockExplorer'
import { commitmentDetailPath } from '../lib/arbitrationRoutes'
import { AddressDisplay, EmptyState, Notice, Skeleton, TokenAmount } from '../components/ui'
import { PageHeader, PartyRow } from '../components/protocol'

const ACTIVITY_LABEL = {
  initiated: 'Forfeit initiated',
  executed: 'Executed',
  cancelled: 'Cancelled',
  cancelledStale: 'Stale-cancelled',
} as const

/** `/app/arbiters/:address` — public, wallet-independent arbiter profile. */
export default function ArbiterDetail() {
  const { address: rawAddress } = useParams<{ address: string }>()
  const chainId = useChainId()
  const expectedManager = getContractAddresses(chainId).commitmentManager
  const address = rawAddress && isAddress(rawAddress) ? (rawAddress as Address) : undefined
  const profile = useArbiterProfile(address, expectedManager)
  const overview = useArbiterOverview(address)
  const tokenMeta = useTokenMetaMap(overview.commitments.map((commitment) => commitment.token))
  const explorer = getBlockExplorer(chainId)
  const groups = (() => {
    const byToken = new Map<string, typeof overview.commitments>()
    for (const commitment of overview.commitments) {
      const key = commitment.token.toLowerCase()
      byToken.set(key, [...(byToken.get(key) ?? []), commitment])
    }
    return [...byToken.entries()]
  })()

  if (!address) return <Navigate to="/app/explorer" replace />

  return (
    <div className="ds-page">
      <Link to="/app/explorer" className="ds-text-sm ds-subtle">
        ← Explorer
      </Link>
      <PageHeader
        eyebrow="public arbiter profile"
        title={profile.profile?.displayName ?? 'Arbiter'}
        lead="Read-only authority, provenance, commitment exposure, and manager-side forfeit activity. No wallet connection is required."
      />

      {profile.isLoading ? (
        <Skeleton height={160} />
      ) : profile.error && !profile.profile ? (
        <Notice tone="danger" title="Arbiter profile RPC failure">
          {profile.error.message}
        </Notice>
      ) : profile.profile ? (
        <section className="ds-card ds-stack ds-stack-4" aria-label="Arbiter profile">
          <div className="ds-party-list">
            <PartyRow label="address">
              <span className="ds-row ds-row-2" style={{ alignItems: 'center', flexWrap: 'wrap' }}>
                <AddressDisplay address={address} />
                {explorer && (
                  <a href={`${explorer}/address/${address}`} target="_blank" rel="noreferrer">
                    block explorer ↗
                  </a>
                )}
              </span>
            </PartyRow>
            <PartyRow label="recognized mechanism">
              {profile.profile.mechanism}{' '}
              <span className="ds-badge">{profile.profile.mechanismVerification}</span>
            </PartyRow>
            <PartyRow label="address / interface">
              {profile.profile.addressForm} · ERC-165 IArbiter {profile.profile.interfaceSupport}
            </PartyRow>
            <PartyRow label="reported manager">
              {profile.profile.reportedManager ? (
                <span className="ds-row ds-row-2" style={{ alignItems: 'center', flexWrap: 'wrap' }}>
                  <AddressDisplay address={profile.profile.reportedManager} compact />
                  <span
                    className={`ds-badge ${
                      profile.profile.managerMatches === undefined
                        ? ''
                        : profile.profile.managerMatches
                          ? 'ds-badge--success'
                          : 'ds-badge--error'
                    }`}
                  >
                    {profile.profile.managerMatches === undefined
                      ? 'expected manager unavailable'
                      : profile.profile.managerMatches
                        ? 'matches expected manager'
                        : 'does not match expected manager'}
                  </span>
                </span>
              ) : (
                <span className="ds-subtle">Not reported / unavailable</span>
              )}
            </PartyRow>
            <PartyRow label="declared capabilities">
              <span className="ds-row ds-row-1" style={{ flexWrap: 'wrap' }}>
                {profile.profile.declaredCapabilities.length === 0 &&
                profile.profile.unknownCapabilityBits === 0n ? (
                  <span className="ds-subtle">None reported</span>
                ) : (
                  profile.profile.declaredCapabilities.map((capability) => (
                    <span key={capability.id} className="ds-badge">
                      {capability.label} · declared
                    </span>
                  ))
                )}
                {profile.profile.unknownCapabilityBits !== 0n && (
                  <span className="ds-badge">
                    Unknown bits 0x{profile.profile.unknownCapabilityBits.toString(16)} · declared
                  </span>
                )}
              </span>
            </PartyRow>
            <PartyRow label="metadata URI">
              {profile.profile.metadataURI ? (
                <span>
                  <a href={profile.profile.metadataURI} target="_blank" rel="noreferrer">
                    {profile.profile.metadataURI}
                  </a>{' '}
                  <span className="ds-badge">publisher-provided</span>
                </span>
              ) : (
                <span className="ds-subtle">No metadata published ({profile.profile.metadataTrust})</span>
              )}
            </PartyRow>
            <PartyRow label="how decisions are made">{profile.profile.decisionSummary}</PartyRow>
          </div>

          {profile.profile.managerMatches === false && (
            <Notice tone="danger" title="Reported manager mismatch">
              This arbiter reports a different CommitmentManager than this deployment expects. Its declared powers may not apply here.
            </Notice>
          )}
          {profile.profile.readFailures.length > 0 && (
            <Notice tone="warn" title="Partial introspection">
              These calls failed independently: {profile.profile.readFailures.join(', ')}. Unknown values are not inferred.
            </Notice>
          )}
        </section>
      ) : null}

      <section className="ds-stack ds-stack-3" aria-labelledby="arbiter-commitments">
        <header className="ds-section-header">
          <h2 id="arbiter-commitments" className="ds-section-title">Commitments using this arbiter</h2>
          <span className="ds-section-eyebrow">grouped by backing token · never summed across tokens</span>
        </header>
        {!overview.indexerOnline ? (
          <Notice tone="warn">The indexer is not configured, so commitment exposure and activity are unavailable.</Notice>
        ) : overview.isLoading ? (
          <Skeleton height={100} />
        ) : overview.error ? (
          <Notice tone="danger" title="Indexer failure">{overview.error.message}</Notice>
        ) : groups.length === 0 ? (
          <EmptyState title="NO COMMITMENTS" description="No indexed commitments currently name this arbiter." />
        ) : (
          <div className="ds-stack ds-stack-3">
            {groups.map(([token, commitments]) => {
              const meta = tokenMeta.metaFor(token as Address)
              return (
                <div key={token} className="ds-card ds-stack ds-stack-2">
                  <header className="ds-section-header">
                    <h3 className="ds-section-title">{meta.symbol} backing</h3>
                    <AddressDisplay address={token as Address} compact />
                  </header>
                  {commitments.map((commitment) => (
                    <div key={`${commitment.manager}-${commitment.id}`} className="ds-row ds-row-3" style={{ justifyContent: 'space-between', flexWrap: 'wrap' }}>
                      <Link to={commitmentDetailPath(commitment.id, commitment.manager)}>
                        Commitment #{commitment.id.toString()}
                      </Link>
                      <TokenAmount amount={commitment.amount} decimals={meta.decimals} symbol={meta.symbol} />
                      <span className="ds-badge">{commitment.status}</span>
                    </div>
                  ))}
                </div>
              )
            })}
          </div>
        )}
      </section>

      <section className="ds-stack ds-stack-3" aria-labelledby="arbiter-activity">
        <header className="ds-section-header">
          <h2 id="arbiter-activity" className="ds-section-title">Recent manager-side forfeit activity</h2>
          <span className="ds-section-eyebrow">actual event timestamps</span>
        </header>
        {!overview.indexerOnline || overview.error ? null : overview.isLoading ? (
          <Skeleton height={72} />
        ) : overview.activity.length === 0 ? (
          <Notice tone="neutral">No manager-side forfeit activity is indexed for these commitments.</Notice>
        ) : (
          <ol className="ds-stack ds-stack-2" style={{ listStyle: 'none', margin: 0, padding: 0 }}>
            {overview.activity.map((event) => (
              <li key={`${event.manager}-${event.blockNumber}-${event.logIndex}`} className="ds-card ds-row ds-row-3" style={{ justifyContent: 'space-between', flexWrap: 'wrap' }}>
                <span>{ACTIVITY_LABEL[event.kind]}</span>
                <Link to={commitmentDetailPath(event.commitmentId, event.manager)}>
                  commitment #{event.commitmentId.toString()}
                </Link>
                <span className="ds-text-xs ds-subtle">
                  {new Date(Number(event.timestamp) * 1_000).toLocaleString()}
                </span>
              </li>
            ))}
          </ol>
        )}
      </section>
    </div>
  )
}
