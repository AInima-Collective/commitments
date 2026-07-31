export interface AgentBadgeProps {
  /** ERC-8004 agentId (tokenId). 0n is a valid id — render it when provided.
   *  Undefined when only the isAgent bit is known (chain-fallback path). */
  agentId?: bigint
  className?: string
}

/**
 * ERC-8004 agent identity marker. Rendered next to a name/address (typically
 * through `OperatorIdentity`'s `badge` slot) when the account owns an agent
 * in the ERC-8004 identity registry — i.e. the party behind this address is
 * a registered autonomous agent, not (necessarily) a human.
 *
 * Full-precision rule: the canonical agentId is surfaced via `title=` — the
 * chip itself stays a fixed-width "AGENT" so table rows don't jitter.
 */
export function AgentBadge({ agentId, className }: AgentBadgeProps) {
  const title =
    agentId !== undefined
      ? `ERC-8004 registered agent · agentId ${agentId.toString()}`
      : 'ERC-8004 registered agent'
  const root = ['ds-badge', 'ds-badge--accent', className].filter(Boolean).join(' ')
  return (
    <span className={root} title={title}>
      agent
    </span>
  )
}
