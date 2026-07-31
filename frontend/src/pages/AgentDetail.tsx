import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom'
import { type Address } from 'viem'
import { useChainId } from 'wagmi'

import { agentDisplayName, bondStatusToDomain, parseRegistration } from '../components/agent/registration'
import { AgentBadge, CommitmentStatusBadge, OperatorIdentity, PageHeader, PartyRow, RiskRow } from '../components/protocol'
import { AddressDisplay, Card, EmptyState, Notice, Skeleton, StatBlock, TokenAmount } from '../components/ui'
import { getContractAddresses, getVaultDescriptor } from '../config/contracts'
import { hasIndexer, indexerFetch } from '../config/indexer'
import { useAgentsIndexed, type AgentBondRow } from '../hooks/useAgentsIndexed'
import { useMutuals, type MutualIndexed } from '../hooks/useMutuals'
import { useTokenMetaMap } from '../hooks/useTokenMeta'

/**
 * /agents/:agentId — deep-linkable dossier for one ERC-8004 agent: the full
 * registration file (identity, services, endpoints, trust models), the
 * controlling accounts, and the agent's bonds. Each bond row links to the
 * commitment detail page, where the attested SLA renders and the
 * "Propose claim" flow lives.
 */
export default function AgentDetail() {
  const { agentId: idParam } = useParams<{ agentId: string }>()
  const id = useMemo<bigint | null>(() => {
    if (idParam === undefined) return null
    try {
      return BigInt(idParam)
    } catch {
      return null
    }
  }, [idParam])

  const { agents, isLoading, isReady, refetch } = useAgentsIndexed()
  const agent = id !== null ? agents.find((a) => a.agentId === id) : undefined

  const tokens = useMemo<Array<Address | undefined>>(
    () => (agent ? agent.bonds.bonds.map((b) => b.token) : []),
    [agent],
  )
  const { metaFor } = useTokenMetaMap(tokens)

  const chainId = useChainId()
  const env = getContractAddresses(chainId)
  const agentVault = env.agentVault
  const { mutuals, byId: mutualsById } = useMutuals()

  // Does THIS agent underwrite the agent-managed vault? True when one of its
  // bonds is a membership in the mutual whose `coveredVault` is env.agentVault.
  // That membership is what earns the vault-manager role (and its operator
  // fee), so it gates the "operator fees earned" stat below.
  const coveringMutual = useMemo(
    () =>
      agentVault
        ? mutuals.find((m) => m.coveredVault?.toLowerCase() === agentVault.toLowerCase())
        : undefined,
    [mutuals, agentVault],
  )
  const underwritesAgentVault = Boolean(
    agent && coveringMutual && agent.bonds.bonds.some((b) => b.mutualId === coveringMutual.mutualId),
  )

  // Aggregated operator-fee total from the coverage endpoint (underlying-asset
  // denominated — 18-dec DAI for the seeded vault). Focused fetch: the full
  // useVaultCoverage surface is vault-page-shaped; the dossier only needs one
  // number.
  const operatorFeeQuery = useQuery<bigint | null>({
    queryKey: ['agent-vault-operator-fee', chainId, agentVault?.toLowerCase()],
    enabled: hasIndexer && underwritesAgentVault && Boolean(agentVault),
    staleTime: 30_000,
    queryFn: async () => {
      const res = await indexerFetch(`/vaults/${agentVault!.toLowerCase()}/coverage`)
      if (!res.ok) throw new Error(`Indexer error: ${res.status}`)
      const wire = (await res.json()) as { totals?: { operatorFee: string } }
      return wire.totals ? BigInt(wire.totals.operatorFee) : null
    },
  })

  if (idParam !== undefined && id === null) {
    return <Navigate to="/app/agents" replace />
  }

  if (!hasIndexer) {
    return (
      <div className="ds-page">
        <BackLink />
        <PageHeader eyebrow="erc-8004" title={`Agent #${id?.toString() ?? ''}`} />
        <Notice tone="info" title="Indexer required">
          Agent dossiers need the indexer's registry mirror. Set <code>VITE_INDEXER_URL</code> and run the
          indexer.
        </Notice>
      </div>
    )
  }

  if (isLoading && !agent) {
    return (
      <div className="ds-page">
        <BackLink />
        <PageHeader eyebrow="erc-8004" title={`Agent #${id?.toString() ?? ''}`} />
        <Skeleton shape="block" style={{ height: 280 }} />
      </div>
    )
  }

  if (!isReady) {
    return (
      <div className="ds-page">
        <BackLink />
        <PageHeader eyebrow="erc-8004" title={`Agent #${id?.toString() ?? ''}`} />
        <Notice
          tone="warn"
          title="Agent unavailable"
          actions={
            <button type="button" className="ds-btn ds-btn--sm" onClick={refetch}>
              retry
            </button>
          }
        >
          Live agent data is temporarily unavailable — please retry shortly.
        </Notice>
      </div>
    )
  }

  if (!agent) {
    return (
      <div className="ds-page">
        <BackLink />
        <PageHeader eyebrow="erc-8004" title={`Agent #${id?.toString() ?? ''}`} />
        <Notice tone="warn" title="Agent not found">
          No agent with id <code>#{id?.toString()}</code> in the identity registry. It may be on a different
          chain, or the indexer hasn't caught up yet.
        </Notice>
      </div>
    )
  }

  const reg = parseRegistration(agent.metadataContent)
  const name = agentDisplayName(reg, agent.agentId)
  const registeredLabel = new Date(Number(agent.registeredAt) * 1000).toISOString().slice(0, 10)

  return (
    <div className="ds-page">
      <BackLink />
      <PageHeader
        eyebrow="erc-8004 · trustless agents"
        title={name}
        lead={reg.description}
        actions={<AgentBadge agentId={agent.agentId} />}
      />

      <section className="ds-stat-grid" aria-label="Agent summary">
        <StatBlock value={`#${agent.agentId.toString()}`} label="Agent ID" />
        <StatBlock value={String(agent.bonds.activeCount)} label="Active bonds" />
        <StatBlock value={String(agent.bonds.totalCount)} label="Total bonds" />
        <StatBlock value={registeredLabel} label="Registered" />
        {underwritesAgentVault && operatorFeeQuery.data != null && (
          <StatBlock
            value={
              <TokenAmount
                amount={operatorFeeQuery.data}
                decimals={18}
                symbol={getVaultDescriptor(chainId, agentVault)?.assetSymbol ?? 'DAI'}
                size="inline"
              />
            }
            label="Operator fees earned"
            meta="fixed fee on realized vault gains"
          />
        )}
      </section>

      {agent.metadataStatus !== 'ok' && (
        <Notice tone="warn" title="Registration file not resolved">
          The agent's <code>agentURI</code> is{' '}
          {agent.metadataStatus === 'unreachable' ? 'unreachable' : 'empty or unresolved'} — identity fields
          below are limited to the on-chain record.
        </Notice>
      )}

      <section aria-labelledby="agent-identity-heading" className="ds-stack ds-stack-3">
        <header className="ds-section-header">
          <h2 id="agent-identity-heading" className="ds-section-title">
            Identity
          </h2>
          <span className="ds-section-eyebrow">registration file + on-chain record</span>
        </header>
        <Card className="ds-stack ds-stack-3">
          <div className="ds-party-list">
            <PartyRow label="owner">
              <OperatorIdentity address={agent.owner} size="sm" badge={<AgentBadge agentId={agent.agentId} />} />
            </PartyRow>
            <PartyRow label="agent wallet">
              {agent.agentWallet ? (
                <AddressDisplay address={agent.agentWallet} compact />
              ) : (
                <span className="ds-text-sm ds-subtle">unset (cleared on transfer)</span>
              )}
            </PartyRow>
            <PartyRow label="registry">
              <AddressDisplay address={agent.registry} compact />
            </PartyRow>
            <PartyRow label="agent URI">
              <span className="ds-text-xs ds-subtle" style={{ wordBreak: 'break-all' }} title={agent.agentURI}>
                {agent.agentURI.length > 96 ? `${agent.agentURI.slice(0, 96)}…` : agent.agentURI || '—'}
              </span>
            </PartyRow>
          </div>

          {reg.services.length > 0 && (
            <div className="ds-stack ds-stack-2">
              <span className="ds-label">services</span>
              {reg.services.map((s) => (
                <div key={s.name} className="ds-row ds-row-2" style={{ alignItems: 'center', flexWrap: 'wrap' }}>
                  <span className="ds-badge ds-badge--accent">{s.name}</span>
                  {s.endpoint && (
                    <span className="ds-text-xs ds-subtle" style={{ wordBreak: 'break-all' }}>
                      {s.endpoint}
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}

          {(reg.supportedTrust.length > 0 || reg.x402Support !== undefined) && (
            <div className="ds-row ds-row-2" style={{ flexWrap: 'wrap' }}>
              {reg.supportedTrust.map((t) => (
                <span key={t} className="ds-badge ds-badge--muted" title="Trust model from the registration file">
                  {t}
                </span>
              ))}
              {reg.x402Support && (
                <span className="ds-badge ds-badge--muted" title="Accepts x402 payments">
                  x402
                </span>
              )}
            </div>
          )}

          {agent.metadataContent && (
            <details className="metadata-raw-details">
              <summary>RAW REGISTRATION JSON</summary>
              <pre className="metadata-raw-code">{JSON.stringify(agent.metadataContent, null, 2)}</pre>
            </details>
          )}
        </Card>
      </section>

      <section aria-labelledby="agent-bonds-heading" className="ds-stack ds-stack-3">
        <header className="ds-section-header">
          <h2 id="agent-bonds-heading" className="ds-section-title">
            Bonds
          </h2>
          <span className="ds-section-eyebrow">slashable stake behind this agent's promises</span>
        </header>

        <Notice tone="info" size="sm" title="How to challenge">
          Think this agent breached its SLA? Open its bond below — the attested SLA JSON and a "Propose claim"
          action live on the commitment page. Claims are resolved optimistically: undisputed claims finalize by
          timeout, disputes escalate by bond-doubling.{' '}
          <Link to="/app/docs/protocol/use-cases/agent-bonds">Read the agent-bonds guide →</Link>
        </Notice>

        {agent.bonds.bonds.length === 0 ? (
          <EmptyState
            title="NO BONDS"
            description="This agent's owner has not posted any commitments yet — nothing backs its SLA."
          />
        ) : (
          <div className="ds-stack ds-stack-2">
            {agent.bonds.bonds.map((bond) => (
              <BondRow
                key={`${bond.manager}-${bond.id.toString()}`}
                bond={bond}
                metaFor={metaFor}
                mutualsById={mutualsById}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  )
}

function BondRow({
  bond,
  metaFor,
  mutualsById,
}: {
  bond: AgentBondRow
  metaFor: ReturnType<typeof useTokenMetaMap>['metaFor']
  mutualsById: Map<bigint, MutualIndexed>
}) {
  const chainId = useChainId()
  const navigate = useNavigate()
  const meta = metaFor(bond.token)
  const hasSla = !!bond.metadataURI && bond.metadataURI.length > 0
  // Mutual membership (created via manager.joinMutual): the stake underwrites
  // a coverage pool. When that pool ambient-covers a vault (`coveredVault`),
  // name the vault; otherwise fall back to the pool id. Chip links to the
  // marketplace pool page either way.
  const isMembership = bond.mutualId !== undefined
  const coveredVault = isMembership ? (mutualsById.get(bond.mutualId!)?.coveredVault ?? undefined) : undefined
  const underwritesLabel = isMembership
    ? coveredVault
      ? `underwrites ${
          getVaultDescriptor(chainId, coveredVault)?.name ??
          `vault ${coveredVault.slice(0, 6)}…${coveredVault.slice(-4)}`
        }`
      : `underwrites pool #${bond.mutualId!.toString()}`
    : undefined
  return (
    <Card
      className="ds-row"
      role="link"
      tabIndex={0}
      onClick={() => navigate(`/app/commitments/${bond.id.toString()}`)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') navigate(`/app/commitments/${bond.id.toString()}`)
      }}
      aria-label={`Bond commitment #${bond.id.toString()}`}
      style={{
        justifyContent: 'space-between',
        alignItems: 'center',
        gap: 'var(--space-3)',
        flexWrap: 'wrap',
        cursor: 'pointer',
      }}
    >
      <span className="ds-row ds-row-3" style={{ alignItems: 'center', flexWrap: 'wrap' }}>
        <span className="ds-mono-num">#{bond.id.toString()}</span>
        <CommitmentStatusBadge status={bondStatusToDomain(bond.status)} />
        {hasSla ? (
          <span
            className="ds-badge ds-badge--accent"
            title={bond.metadataStatus === 'ok' ? 'SLA metadata resolved and hash-verified' : 'SLA metadata attached'}
          >
            SLA attached
          </span>
        ) : isMembership ? (
          <span
            className="ds-badge ds-badge--muted"
            title="Mutual membership — terms live at the pool level (peril document), not as a per-commitment SLA"
          >
            mutual membership
          </span>
        ) : (
          <span className="ds-badge ds-badge--muted">no SLA</span>
        )}
        {underwritesLabel && (
          <Link
            to={`/app/marketplace/${bond.mutualId!.toString()}`}
            className="ds-badge ds-badge--accent"
            title="Mutual membership — this stake backs the pool's coverage; a proven loss marks it down"
            onClick={(e) => e.stopPropagation()}
          >
            {underwritesLabel}
          </Link>
        )}
      </span>
      <span className="ds-row ds-row-3" style={{ alignItems: 'center' }}>
        <RiskRow bps={bond.maxPenaltyBps} label="slashable" />
        <span style={{ whiteSpace: 'nowrap' }}>
          <TokenAmount amount={bond.amount} decimals={meta.decimals} symbol={meta.symbol} size="inline" />
        </span>
      </span>
    </Card>
  )
}

function BackLink() {
  return (
    <Link to="/app/agents" className="ds-text-sm ds-subtle" style={{ alignSelf: 'flex-start' }}>
      ← All agents
    </Link>
  )
}
