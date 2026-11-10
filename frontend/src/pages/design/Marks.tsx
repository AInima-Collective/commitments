import {
  SourceBlock,
} from '../../components/ui'
import {
  AgentBadge,
  OperatorIdentity,
} from '../../components/protocol'
import { SectionHeading } from './SectionHeading'

const SRC_BADGES =
  `<span className="ds-badge ds-badge--success">active</span>
<span className="ds-badge ds-badge--warn">forfeit-pending</span>
<span className="ds-badge ds-badge--error">forfeited</span>
<span className="ds-badge ds-badge--accent">proposed</span>
<span className="ds-badge ds-badge--solid">YOU</span>`

const SRC_AGENT_BADGE =
  `// One bulk lookup per page — never per row.
const agents = useAgentIdentities(addresses)
const a = agents.get(row.committer)
<OperatorIdentity
  address={row.committer}
  badge={a?.isAgent ? <AgentBadge agentId={a.agentId} /> : undefined}
/>`

const SRC_TX =
  `<div className="ds-tx-pending"><span className="ds-spinner" aria-hidden /> pending — broadcasting tx</div>
<div className="ds-tx-success"><span className="ds-glyph ds-glyph--ok">✓</span> success — block 2,143,927</div>`

const SRC_GLYPHS =
  `<span className="ds-glyph ds-glyph--ok">✓</span>
<span className="ds-glyph ds-glyph--warn">⚠</span>
<span className="ds-glyph ds-glyph--error">✗</span>
<span className="ds-glyph ds-glyph--accent">↗</span>`

export function BadgesSection() {
  return (
    <section className="ds-stack ds-stack-6">
      <SectionHeading
        id="badges"
        title="Status Badges"
        lead="Borders carry the meaning; fills are reserved for the solid variant. Status semantics mirror the protocol's existing vocabulary."
      />
      <div className="ds-row ds-row-2" style={{ flexWrap: 'wrap' }}>
        <span className="ds-badge ds-badge--success">active</span>
        <span className="ds-badge ds-badge--warn">forfeit-pending</span>
        <span className="ds-badge ds-badge--error">forfeited</span>
        <span className="ds-badge ds-badge--muted">released</span>
        <span className="ds-badge ds-badge--muted">expired</span>
        <span className="ds-badge ds-badge--accent">proposed</span>
        <span className="ds-badge ds-badge--muted">resolved</span>
        <span className="ds-badge">pending</span>
        <span className="ds-badge ds-badge--solid">YOU</span>
      </div>
      <SourceBlock label="example" source={SRC_BADGES} />
    </section>
  )
}

export function AgentBadgeSection() {
  return (
    <section className="ds-stack ds-stack-6">
      <SectionHeading
        id="agent-badge"
        title="Agent Badge"
        lead="ERC-8004 identity marker — the address owns an agent in the Trustless Agents registry, so the party behind it is a registered autonomous agent. Resolve identities once per page via useAgentIdentities(addresses) and pass the badge through OperatorIdentity's badge slot. Full-precision rule: the canonical agentId travels in title= (agentId 0 is valid — ids start at 0)."
      />
      <div className="ds-stack ds-stack-3">
        <div className="ds-label">standalone</div>
        <div className="ds-row ds-row-2" style={{ flexWrap: 'wrap' }}>
          <AgentBadge agentId={0n} />
          <AgentBadge agentId={42n} />
          <AgentBadge />
        </div>
        <div className="ds-text-xs ds-subtle" style={{ maxWidth: '60ch' }}>
          Hover for the canonical agentId. The id-less variant is the chain-fallback path
          (<code>balanceOf(owner) &gt; 0</code>) where only the is-agent bit is known.
        </div>
      </div>
      <div className="ds-stack ds-stack-3">
        <div className="ds-label">composed · OperatorIdentity badge slot</div>
        <div className="ds-stack ds-stack-3">
          <OperatorIdentity
            address="0x742d35Cc6634C0532925a3b844Bc454e4438f44e"
            name="Sentinel Agent"
            badge={<AgentBadge agentId={0n} />}
          />
          <OperatorIdentity
            address="0xab5801a7d398351b8be11c439e05c5b3259aec9b"
            size="sm"
            hideAddress
            badge={<AgentBadge agentId={7n} />}
          />
        </div>
      </div>
      <SourceBlock label="example" source={SRC_AGENT_BADGE} />
    </section>
  )
}

export function TxSection() {
  return (
    <section className="ds-stack ds-stack-6">
      <SectionHeading
        id="tx"
        title="Transaction State"
        lead="Tone signals what's happening; glyph reinforces. Idle is silent — color is earned by activity."
      />
      <div className="ds-stack ds-stack-2 ds-text-sm">
        <div className="ds-tx-idle">· idle — awaiting input</div>
        <div className="ds-tx-pending"><span className="ds-spinner" aria-hidden /> pending — broadcasting tx</div>
        <div className="ds-tx-success"><span className="ds-glyph ds-glyph--ok">✓</span> success — block 2,143,927</div>
        <div className="ds-tx-error"><span className="ds-glyph ds-glyph--error">✗</span> reverted — execution failed</div>
      </div>
      <SourceBlock label="example" source={SRC_TX} />
    </section>
  )
}

export function GlyphsSection() {
  return (
    <section className="ds-stack ds-stack-6">
      <SectionHeading
        id="glyphs"
        title="Glyphs"
        lead="Unicode-only. They survive font fallback, scale on zoom, and copy-paste cleanly into terminals and chats."
      />
      <div className="ds-row ds-row-4" style={{ flexWrap: 'wrap', fontSize: 'var(--text-xl)' }}>
        <span className="ds-glyph ds-glyph--muted" title="empty / pending">·</span>
        <span className="ds-glyph ds-glyph--ok" title="ok">✓</span>
        <span className="ds-glyph ds-glyph--warn" title="warn">⚠</span>
        <span className="ds-glyph ds-glyph--error" title="error">✗</span>
        <span className="ds-glyph ds-glyph--accent" title="collapsed">▶</span>
        <span className="ds-glyph ds-glyph--accent" title="expanded">▼</span>
        <span className="ds-glyph ds-glyph--muted" title="copy">⎘</span>
        <span className="ds-glyph ds-glyph--accent" title="link">↗</span>
      </div>
      <SourceBlock label="example" source={SRC_GLYPHS} />
    </section>
  )
}
