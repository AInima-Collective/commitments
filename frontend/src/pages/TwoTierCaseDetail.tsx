import { Link, Navigate, useParams, useSearchParams } from 'react-router-dom'
import { isAddress, type Address } from 'viem'
import { useChainId } from 'wagmi'

import { getContractAddresses } from '../config/contracts'
import { useMechanismArbitration } from '../hooks/useMechanismArbitration'
import { arbiterProfilePath, commitmentDetailPath } from '../lib/arbitrationRoutes'
import { AddressDisplay, Notice, Skeleton } from '../components/ui'
import { PageHeader, PartyRow } from '../components/protocol'

/** Shareable, read-only view of one configured TwoTierArbiter case. */
export default function TwoTierCaseDetail() {
  const { id } = useParams<{ id: string }>()
  const chainId = useChainId()
  const manager = getContractAddresses(chainId).commitmentManager
  const [search] = useSearchParams()
  const rawArbiter = search.get('arbiter')
  const caseId = id && /^(0|[1-9]\d*)$/.test(id) ? BigInt(id) : undefined
  const arbiter = rawArbiter && isAddress(rawArbiter) ? rawArbiter as Address : undefined
  const mechanism = useMechanismArbitration({
    arbiter: arbiter ?? '0x0000000000000000000000000000000000000000',
    caseId,
  })

  if (!arbiter || caseId === undefined || caseId === 0n) {
    return <Navigate to="/app/explorer" replace />
  }

  return (
    <div className="ds-page">
      <Link to={arbiterProfilePath(arbiter)} className="ds-text-sm ds-subtle">← Arbiter profile</Link>
      <PageHeader
        eyebrow="two-tier arbitration"
        title={`Court case #${caseId.toString()}`}
        lead="Primary ruling, appeal, human-response, and manager enforcement are separate phases with separate clocks."
      />

      {!mechanism ? (
        <Notice tone="warn" title="Unrecognized TwoTier deployment">
          This address is not identified as a TwoTierArbiter by trusted deployment configuration.
        </Notice>
      ) : mechanism.isLoading ? (
        <Skeleton height={160} />
      ) : mechanism.error ? (
        <Notice tone="danger" title="Case state unavailable">{mechanism.error.message}</Notice>
      ) : !mechanism.case ? (
        <Notice tone="neutral" title="Case not found">
          No readable case #{caseId.toString()} exists at this configured arbiter.
        </Notice>
      ) : (
        <section className="ds-card ds-stack ds-stack-4" aria-label="Two-tier case state">
          <div className="ds-party-list">
            <PartyRow label="arbiter">
              <Link to={arbiterProfilePath(arbiter)}><AddressDisplay address={arbiter} compact /></Link>
            </PartyRow>
            <PartyRow label="mechanism">{mechanism.name} · trusted deployment configuration</PartyRow>
            <PartyRow label="phase">{mechanism.case.phase}</PartyRow>
            <PartyRow label="next court deadline">
              {mechanism.case.nextDeadline
                ? new Date(Number(mechanism.case.nextDeadline) * 1_000).toLocaleString()
                : 'No court deadline in the current phase'}
            </PartyRow>
            {mechanism.case.deadlines.map((deadline) => (
              <PartyRow key={`${deadline.label}-${deadline.at.toString()}`} label={deadline.label}>
                {new Date(Number(deadline.at) * 1_000).toLocaleString()}
              </PartyRow>
            ))}
            <PartyRow label="participants">
              {mechanism.case.participants.join(', ') || 'No participants reported'}
            </PartyRow>
            <PartyRow label="available actions">
              {mechanism.case.availableActions.join(' · ') || 'No court action currently available'}
            </PartyRow>
            {mechanism.case.outcome && <PartyRow label="ruling / outcome">{mechanism.case.outcome}</PartyRow>}
            {mechanism.case.commitmentId !== undefined && (
              <PartyRow label="commitment">
                <Link to={commitmentDetailPath(mechanism.case.commitmentId, manager)}>
                  Commitment #{mechanism.case.commitmentId.toString()}
                </Link>
              </PartyRow>
            )}
          </div>

          <Notice tone="info" title="Manager enforcement is independent">
            A court ruling may create or replace a CommitmentManager proposal. Its pause-adjusted execution and stale-cancel timing are shown on the commitment page, not inferred from the court deadline.
          </Notice>

          <div className="ds-party-list">
            <PartyRow label="process">{mechanism.process}</PartyRow>
            {mechanism.terms.map((term) => (
              <PartyRow key={`${term.label}-${term.value}`} label={term.label}>{term.value}</PartyRow>
            ))}
          </div>
        </section>
      )}
    </div>
  )
}
