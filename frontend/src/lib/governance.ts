/**
 * Pure derivation helpers for governance state.
 *
 * Mirrors lib/agreements.ts in shape — small functions that turn raw
 * indexer rows into UI-ready labels, never reaching for chain reads. Used
 * by the proposal-detail and proposal-list components.
 */

/**
 * Governance proposal lifecycle. Mirrors OZ Governor's `state()` enum plus
 * the indexer's lower-cased wire format. Composes with the same badge tone
 * family used by agreement / commitment statuses.
 */
export type ProposalState =
  | 'pending'
  | 'active'
  | 'canceled'
  | 'defeated'
  | 'succeeded'
  | 'queued'
  | 'expired'
  | 'executed'

/**
 * Proposal kind — decoded from the action set at index time. Renders the
 * "shape" of the proposal (weight update, forfeit arbitration, treasury,
 * signaling, mixed) so the proposal-detail page picks the right action card.
 */
export type ProposalKind =
  | 'weight_update'
  | 'forfeit_arbitration'
  | 'treasury'
  | 'signaling'
  | 'mixed'

/**
 * Title is the first non-empty line of the description, capped at 80
 * characters. Bracketed kind prefixes ("[Weight]", "[Forfeit]", "[Signal]")
 * are stripped — they're shown via the ProposalKindBadge instead.
 */
export function proposalTitle(description: string): string {
  const firstLine = description.split('\n').map((l) => l.trim()).find(Boolean) ?? ''
  const stripped = firstLine.replace(/^\[\s*[a-zA-Z_/-]+\s*\]\s*/, '')
  return stripped.length > 80 ? stripped.slice(0, 77) + '…' : stripped
}

/**
 * Order proposals for display:
 *   active first, then pending, then queued, then succeeded, then everything
 *   else, secondary sort by createdBlock DESC.
 */
const STATE_PRIORITY: Record<string, number> = {
  active: 0,
  pending: 1,
  queued: 2,
  succeeded: 3,
  executed: 4,
  defeated: 5,
  canceled: 6,
  expired: 7,
}

export function compareProposalsForDisplay(
  a: { state: string; createdBlock: string },
  b: { state: string; createdBlock: string },
): number {
  const pa = STATE_PRIORITY[a.state] ?? 99
  const pb = STATE_PRIORITY[b.state] ?? 99
  if (pa !== pb) return pa - pb
  // createdBlock is BigInt-as-string; numeric compare via BigInt for safety.
  const ba = BigInt(a.createdBlock)
  const bb = BigInt(b.createdBlock)
  if (ba > bb) return -1
  if (ba < bb) return 1
  return 0
}
