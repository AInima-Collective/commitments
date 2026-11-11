import { useState } from 'react'
import { Link, Navigate, useParams } from 'react-router-dom'
import { isAddress, zeroAddress, type Address } from 'viem'
import { useChainId } from 'wagmi'

import { getContractAddresses } from '../config/contracts'
import { useArbiterOverview } from '../hooks/useArbiterOverview'
import { useArbiterProfile } from '../hooks/useArbiterProfile'
import { useTokenMetaMap } from '../hooks/useTokenMeta'
import { getBlockExplorer } from '../lib/blockExplorer'
import { commitmentDetailPath } from '../lib/arbitrationRoutes'
import { AddressDisplay, EmptyState, Notice, Pagination, Skeleton, TokenAmount } from '../components/ui'
import { PageHeader, PartyRow } from '../components/protocol'
import { mechanismAdapter } from '../lib/arbitrationMechanisms'
import { useMechanismArbitration } from '../hooks/useMechanismArbitration'
import { useProtocolCasesList } from '../hooks/useProtocolEntityList'

type CommitmentStatusFilter =
  | 'all'
  | 'active'
  | 'unbonding'
  | 'forfeitPending'
  | 'forfeited'
  | 'released'
  | 'expired'

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
  const [commitmentOffset, setCommitmentOffset] = useState(0)
  const [commitmentStatus, setCommitmentStatus] = useState<CommitmentStatusFilter>('all')
  const [caseOffset, setCaseOffset] = useState(0)
  const commitmentLimit = 25
  const profile = useArbiterProfile(address, expectedManager)
  const overview = useArbiterOverview(address, {
    limit: commitmentLimit,
    offset: commitmentOffset,
    status: commitmentStatus === 'all' ? undefined : commitmentStatus,
  })
  const mechanism = useMechanismArbitration({
    arbiter: address ?? zeroAddress,
    commitmentId: 0n,
  })
  const cases = useProtocolCasesList({
    arbiter: address,
    limit: 25,
    offset: caseOffset,
    enabled: Boolean(address),
    openOnly: true,
  })
  const tokenMeta = useTokenMetaMap(overview.commitments.map((commitment) => commitment.token))
  const explorer = getBlockExplorer(chainId)
  const adapter = mechanismAdapter(profile.profile?.mechanismId)
  const groups = (() => {
    const byToken = new Map<string, typeof overview.commitments>()
    for (const commitment of overview.commitments) {
      const key = commitment.token.toLowerCase()
      byToken.set(key, [...(byToken.get(key) ?? []), commitment])
    }
    return [...byToken.entries()]
  })()
  const arbitrationActivity = [
    ...overview.activity.map((event) => ({ source: 'CommitmentManager' as const, event })),
    ...(overview.mechanismActivity ?? []).map((event) => ({ source: 'arbiter mechanism' as const, event })),
  ].sort((left, right) => {
    if (left.event.blockNumber !== right.event.blockNumber) {
      return left.event.blockNumber > right.event.blockNumber ? -1 : 1
    }
    return right.event.logIndex - left.event.logIndex
  })

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
              {profile.profile.addressForm} · ERC-165 IArbiter{' '}
              {profile.profile.fieldStatus.interfaceSupport === 'not-applicable'
                ? 'not applicable'
                : profile.profile.interfaceSupport}
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
                <span className="ds-subtle">
                  {profile.profile.fieldStatus.reportedManager === 'not-applicable'
                    ? 'Not applicable to a direct-address arbiter'
                    : ['not-declared', 'unsupported'].includes(profile.profile.fieldStatus.reportedManager)
                      ? 'Not declared by this legacy / custom contract'
                      : 'Unknown — failed to verify'}
                </span>
              )}
            </PartyRow>
            <PartyRow label="declared capabilities">
              <span className="ds-row ds-row-1" style={{ flexWrap: 'wrap' }}>
                {profile.profile.fieldStatus.capabilities === 'not-applicable' ? (
                  <span className="ds-subtle">Not applicable; authority comes from commitments naming this address</span>
                ) : ['not-declared', 'unsupported'].includes(profile.profile.fieldStatus.capabilities) ? (
                  <span className="ds-subtle">Not declared by this legacy / custom contract</span>
                ) : profile.profile.declaredCapabilities.length === 0 &&
                profile.profile.unknownCapabilityBits === 0n ? (
                  <span className="ds-subtle">No capabilities declared</span>
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
                <span className="ds-subtle">
                  {profile.profile.fieldStatus.metadataURI === 'not-applicable'
                    ? 'Not applicable to a direct-address arbiter'
                    : ['not-declared', 'unsupported'].includes(profile.profile.fieldStatus.metadataURI)
                      ? 'Not declared by this legacy / custom contract'
                      : `No metadata published (${profile.profile.metadataTrust})`}
                </span>
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

      {profile.profile && (
        <section className="ds-card ds-stack ds-stack-3" aria-labelledby="challenge-process">
          <header className="ds-section-header">
            <h2 id="challenge-process" className="ds-section-title">Challenge or appeal process</h2>
            <span className="ds-badge">{profile.profile.contestKind.replaceAll('-', ' ')}</span>
          </header>
          <p className="ds-text-sm">{profile.profile.contestSummary}</p>
          {adapter && (
            <div className="ds-party-list">
              <PartyRow label="recognized adapter">{adapter.name} · {adapter.verification}</PartyRow>
              <PartyRow label="process">{mechanism?.process ?? adapter.process}</PartyRow>
              {(mechanism?.terms ?? adapter.staticTerms).map((term) => (
                <PartyRow key={term.label} label={term.label}>{term.value}</PartyRow>
              ))}
            </div>
          )}
          {mechanism?.isLoading && <Skeleton height={48} />}
          {mechanism?.error && (
            <Notice tone="warn" size="sm" title="Mechanism terms could not be fully verified">
              {mechanism.error.message}
            </Notice>
          )}
        </section>
      )}

      <section className="ds-stack ds-stack-3" aria-labelledby="arbiter-cases">
        <header className="ds-section-header">
          <h2 id="arbiter-cases" className="ds-section-title">Active cases and pending manager proposals</h2>
          <span className="ds-section-eyebrow">mechanism and enforcement phases remain separate</span>
        </header>
        {cases.isLoading ? (
          <Skeleton height={72} />
        ) : cases.error ? (
          <Notice tone="danger" title="Case activity unavailable">{String(cases.error)}</Notice>
        ) : cases.rows.length === 0 ? (
          <Notice tone="neutral">No mechanism case or manager forfeit proposal is indexed for this arbiter.</Notice>
        ) : (
          <div className="ds-stack ds-stack-2">
            {cases.rows.map((row) => (
              <div
                key={`${row.source}-${row.caseId ?? row.commitmentId}-${row.updatedAt}`}
                className="ds-card ds-row ds-row-3"
                style={{ justifyContent: 'space-between', flexWrap: 'wrap' }}
              >
                <span className="ds-stack ds-stack-1">
                  <strong>{row.caseId ? `Case #${row.caseId}` : 'Manager proposal'}</strong>
                  <span className="ds-text-xs ds-subtle">{row.mechanism ?? 'unrecognized mechanism'}</span>
                </span>
                {row.commitmentId !== null && row.manager ? (
                  <Link to={commitmentDetailPath(row.commitmentId, row.manager)}>
                    commitment #{row.commitmentId.toString()}
                  </Link>
                ) : (
                  <span className="ds-subtle">mechanism-scoped case</span>
                )}
                <span className="ds-stack ds-stack-1">
                  <span>{row.mechanismPhase}</span>
                  {row.mechanismSource && <span className="ds-badge">source: {row.mechanismSource}</span>}
                </span>
                <span className="ds-stack ds-stack-1">
                  <span>{row.managerPhase}</span>
                  <span className="ds-badge">source: {row.managerSource}</span>
                </span>
                <span className="ds-text-xs ds-subtle">
                  {row.terminalOutcome ?? (row.nextDeadline
                    ? `next deadline ${new Date(Number(row.nextDeadline) * 1_000).toLocaleString()}`
                    : 'no indexed deadline')}
                </span>
              </div>
            ))}
            <Pagination
              aria-label="Arbiter cases pages"
              offset={caseOffset}
              limit={25}
              count={cases.rows.length}
              total={cases.page.total}
              loading={cases.isLoading}
              onOffsetChange={setCaseOffset}
            />
          </div>
        )}
      </section>

      <section className="ds-stack ds-stack-3" aria-labelledby="arbiter-commitments">
        <header className="ds-section-header">
          <div>
            <h2 id="arbiter-commitments" className="ds-section-title">Commitments using this arbiter</h2>
            <span className="ds-section-eyebrow">grouped by backing token · never summed across tokens</span>
          </div>
          <label className="ds-stack ds-stack-1 ds-text-xs">
            <span className="ds-subtle">status filter</span>
            <select
              value={commitmentStatus}
              onChange={(event) => {
                setCommitmentStatus(event.target.value as CommitmentStatusFilter)
                setCommitmentOffset(0)
              }}
            >
              <option value="all">All statuses</option>
              <option value="active">Active</option>
              <option value="unbonding">Unbonding</option>
              <option value="forfeitPending">Forfeit pending</option>
              <option value="forfeited">Forfeited</option>
              <option value="released">Released</option>
              <option value="expired">Expired</option>
            </select>
          </label>
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
                      <ArbiterMechanismCase
                        arbiter={address}
                        commitmentId={commitment.id}
                        committer={commitment.committer}
                        counterparty={commitment.counterparty}
                      />
                    </div>
                  ))}
                </div>
              )
            })}
          </div>
        )}
        {overview.counts.total > 0 && (
          <Pagination
            aria-label="Arbiter commitments pages"
            offset={commitmentOffset}
            limit={commitmentLimit}
            count={overview.commitments.length}
            total={overview.counts.total}
            loading={overview.isLoading}
            onOffsetChange={setCommitmentOffset}
          />
        )}
      </section>

      <section className="ds-stack ds-stack-3" aria-labelledby="arbiter-activity">
        <header className="ds-section-header">
          <h2 id="arbiter-activity" className="ds-section-title">Recent arbitration activity</h2>
          <span className="ds-section-eyebrow">explicit sources · actual event timestamps</span>
        </header>
        {!overview.indexerOnline || overview.error ? null : overview.isLoading ? (
          <Skeleton height={72} />
        ) : arbitrationActivity.length === 0 ? (
          <Notice tone="neutral">No mechanism or manager activity is indexed for this arbiter.</Notice>
        ) : (
          <ol className="ds-stack ds-stack-2" style={{ listStyle: 'none', margin: 0, padding: 0 }}>
            {arbitrationActivity.map((item) => item.source === 'arbiter mechanism' ? (
              <li key={`mechanism-${item.event.blockNumber}-${item.event.logIndex}`} className="ds-card ds-row ds-row-3" style={{ justifyContent: 'space-between', flexWrap: 'wrap' }}>
                <span>{item.event.kind.replaceAll('-', ' ')}</span>
                <span className="ds-badge">source: arbiter mechanism</span>
                {item.event.commitmentId !== null && item.event.manager ? (
                  <Link to={commitmentDetailPath(item.event.commitmentId, item.event.manager)}>
                    commitment #{item.event.commitmentId.toString()}
                  </Link>
                ) : <span>case #{item.event.caseId.toString()}</span>}
                <span className="ds-text-xs ds-subtle">
                  {new Date(Number(item.event.timestamp) * 1_000).toLocaleString()}
                </span>
              </li>
            ) : (
              <li key={`${item.event.manager}-${item.event.blockNumber}-${item.event.logIndex}`} className="ds-card ds-row ds-row-3" style={{ justifyContent: 'space-between', flexWrap: 'wrap' }}>
                <span>{ACTIVITY_LABEL[item.event.kind]}</span>
                <span className="ds-badge">source: CommitmentManager</span>
                <Link to={commitmentDetailPath(item.event.commitmentId, item.event.manager)}>
                  commitment #{item.event.commitmentId.toString()}
                </Link>
                <span className="ds-text-xs ds-subtle">
                  {new Date(Number(item.event.timestamp) * 1_000).toLocaleString()}
                </span>
              </li>
            ))}
          </ol>
        )}
      </section>
    </div>
  )
}

function ArbiterMechanismCase({
  arbiter,
  commitmentId,
  committer,
  counterparty,
}: {
  arbiter: Address
  commitmentId: bigint
  committer: Address
  counterparty: Address
}) {
  const mechanism = useMechanismArbitration({ arbiter, commitmentId, committer, counterparty })
  if (!mechanism?.case) return null
  return mechanism.case.detailPath ? (
    <Link to={mechanism.case.detailPath} className="ds-badge">
      {mechanism.case.label} · {mechanism.case.phase}
    </Link>
  ) : (
    <span className="ds-badge">{mechanism.case.label} · {mechanism.case.phase}</span>
  )
}
