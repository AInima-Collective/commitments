import { type CommitmentStatus } from '../../utils/commitments'

/**
 * Typed view over an ERC-8004 registration file (the agent's `agentURI`
 * JSON, mirrored by the indexer into `agent.metadataContent`). All fields
 * are optional — the registry accepts any bytes, so parse defensively.
 */
export interface AgentRegistration {
  name?: string
  description?: string
  services: Array<{ name: string; endpoint?: string }>
  supportedTrust: string[]
  x402Support?: boolean
  active?: boolean
}

export function parseRegistration(content: Record<string, unknown> | null | undefined): AgentRegistration {
  const out: AgentRegistration = { services: [], supportedTrust: [] }
  if (!content || typeof content !== 'object') return out
  if (typeof content.name === 'string') out.name = content.name
  if (typeof content.description === 'string') out.description = content.description
  if (typeof content.x402Support === 'boolean') out.x402Support = content.x402Support
  if (typeof content.active === 'boolean') out.active = content.active
  if (Array.isArray(content.services)) {
    for (const s of content.services) {
      if (s && typeof s === 'object' && typeof (s as { name?: unknown }).name === 'string') {
        const entry = s as { name: string; endpoint?: unknown }
        out.services.push({
          name: entry.name,
          endpoint: typeof entry.endpoint === 'string' ? entry.endpoint : undefined,
        })
      }
    }
  }
  if (Array.isArray(content.supportedTrust)) {
    for (const t of content.supportedTrust) {
      if (typeof t === 'string') out.supportedTrust.push(t)
    }
  }
  return out
}

/** Display name for an agent: registration `name`, else `agent #<id>`. */
export function agentDisplayName(reg: AgentRegistration, agentId: bigint): string {
  return reg.name ?? `agent #${agentId.toString()}`
}

/**
 * Indexer wire status → the badge vocabulary (`CommitmentStatusBadge` takes
 * the UPPERCASE domain enum). Mirrors `STATUS_WIRE_TO_DOMAIN` in
 * useIndexedCommitment; unknown values fall back to EXPIRED-muted semantics.
 */
export function bondStatusToDomain(wire: string): CommitmentStatus {
  switch (wire) {
    case 'active':
      return 'ACTIVE'
    case 'unbonding':
      return 'UNBONDING'
    case 'forfeitPending':
      return 'FORFEIT_PENDING'
    case 'forfeited':
      return 'FORFEITED'
    case 'released':
      return 'RELEASED'
    default:
      return 'EXPIRED'
  }
}
