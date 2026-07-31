import { AgentBadge, OperatorIdentity } from '../protocol'
import { Card, Notice, TokenAmount } from '../ui'
import { type IndexedAgent } from '../../hooks/useAgentsIndexed'
import { type TokenMeta } from '../../hooks/useTokenMeta'
import { agentDisplayName, parseRegistration } from './registration'

export interface AgentCardProps {
  agent: IndexedAgent
  /** Page-level token-meta resolver (one multicall for all cards). */
  metaFor: (token?: `0x${string}`) => TokenMeta
}

/**
 * ERC-8004 agent identity card for the /agents grid: registration-file
 * identity (name, description, services, trust models) + the agent's bond
 * rollup (active bonds and total backing per token). Click-through to
 * /app/agents/:agentId.
 */
export function AgentCard({ agent, metaFor }: AgentCardProps) {
  const reg = parseRegistration(agent.metadataContent)
  const name = agentDisplayName(reg, agent.agentId)
  const unresolvable = agent.metadataStatus !== 'ok'
  const backingTotals = Array.from(agent.bonds.totalActiveByToken.values())

  return (
    <Card
      as="a"
      href={`/app/agents/${agent.agentId.toString()}`}
      className="ds-stack ds-stack-3"
      aria-label={`Agent ${name}`}
    >
      <div
        className="ds-row"
        style={{ justifyContent: 'space-between', alignItems: 'flex-start', gap: 'var(--space-2)' }}
      >
        <span className="ds-stack" style={{ gap: 'var(--space-1)' }}>
          <span className="ds-text-xs ds-subtle" style={{ letterSpacing: '0.04em' }}>
            ERC-8004 AGENT
          </span>
          <span className="ds-text-sm" style={{ fontWeight: 600 }}>
            {name}
          </span>
        </span>
        <AgentBadge agentId={agent.agentId} />
      </div>

      {unresolvable ? (
        <Notice tone="warn" size="sm">
          Registration file {agent.metadataStatus === 'unreachable' ? 'unreachable' : 'not resolved'} — showing
          on-chain identity only.
        </Notice>
      ) : (
        <p className="ds-text-sm ds-subtle" style={{ margin: 0, minHeight: '2.4em' }}>
          {reg.description ?? 'No description in the registration file.'}
        </p>
      )}

      {(reg.services.length > 0 || reg.supportedTrust.length > 0 || reg.x402Support) && (
        <div className="ds-row ds-row-2" style={{ flexWrap: 'wrap' }}>
          {reg.services.map((s) => (
            <span key={s.name} className="ds-badge ds-badge--accent" title={s.endpoint ?? undefined}>
              {s.name}
            </span>
          ))}
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

      <OperatorIdentity address={agent.owner} size="sm" />

      <div className="ds-row ds-text-xs ds-subtle" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
        <span className="ds-mono-num">
          {agent.bonds.activeCount} active bond{agent.bonds.activeCount === 1 ? '' : 's'}
        </span>
        <span className="ds-row ds-row-2" style={{ alignItems: 'center', flexWrap: 'wrap' }}>
          {backingTotals.length === 0 ? (
            <span>no backing</span>
          ) : (
            backingTotals.map(({ token, total }) => {
              const meta = metaFor(token)
              return (
                <span key={token} style={{ whiteSpace: 'nowrap' }}>
                  <TokenAmount
                    amount={total}
                    decimals={meta.decimals}
                    symbol={meta.symbol}
                    size="inline"
                    compact
                    precision={2}
                  />
                </span>
              )
            })
          )}
        </span>
      </div>
    </Card>
  )
}
