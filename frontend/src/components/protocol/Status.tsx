/**
 * Status badge primitives.
 *
 * The protocol defines its state vocabulary at the contract level; this file
 * is the canonical mapping from those state strings to design-system tone.
 * Pages must not invent ad-hoc status colors.
 */
import type { RiskTier } from '../../utils/risk'

export type CommitmentStatus =
  | 'PROPOSED'
  | 'ACTIVE'
  // UNBONDING — depositor has called requestUnbond() but not finalizeUnbond().
  // Funds are still encumbered; finalizes to RELEASED once unbondMaturesAt
  // elapses. Cancellable via cancelUnbond() back to ACTIVE.
  | 'UNBONDING'
  | 'FORFEIT_PENDING'
  | 'FORFEITED'
  | 'RELEASED'
  | 'EXPIRED'
  // Agreement-only terminal states. Both render as muted (neutral)
  // tones — the underlying state machine is still bilateral, but the
  // visual treatment matches RELEASED/EXPIRED (terminal, non-error).
  | 'RESOLVED'
  | 'CANCELLED'

/**
 * Status the unified `/commitments` table renders for agreement
 * proposal rows that haven't been accepted yet. Distinct from the
 * contract-level `PROPOSED` (which is a state on a commitment) — this is
 * the pre-acceptance proposal envelope. Kept on this badge's vocabulary
 * so consumers don't have to ad-hoc render proposal rows differently.
 */
export type UnifiedRowStatus = CommitmentStatus | 'PENDING'

const COMMITMENT_TONE: Record<UnifiedRowStatus, string> = {
  PROPOSED: 'ds-badge--accent',
  PENDING: 'ds-badge--accent',
  ACTIVE: 'ds-badge--success',
  UNBONDING: 'ds-badge--accent',
  FORFEIT_PENDING: 'ds-badge--warn',
  FORFEITED: 'ds-badge--error',
  RELEASED: 'ds-badge--muted',
  EXPIRED: 'ds-badge--muted',
  RESOLVED: 'ds-badge--muted',
  CANCELLED: 'ds-badge--muted',
}

const COMMITMENT_LABEL: Record<UnifiedRowStatus, string> = {
  PROPOSED: 'proposed',
  PENDING: 'pending',
  ACTIVE: 'active',
  UNBONDING: 'unbonding',
  FORFEIT_PENDING: 'forfeit-pending',
  FORFEITED: 'forfeited',
  RELEASED: 'released',
  EXPIRED: 'expired',
  RESOLVED: 'resolved',
  CANCELLED: 'cancelled',
}

export function CommitmentStatusBadge({
  status,
  className,
}: {
  status: UnifiedRowStatus
  className?: string
}) {
  const root = ['ds-badge', COMMITMENT_TONE[status], className].filter(Boolean).join(' ')
  return <span className={root}>{COMMITMENT_LABEL[status]}</span>
}

/**
 * Agreement state — the bilateral state machine has its own vocabulary
 * (lowercase, matching the indexer wire format). Partial-forfeit variants
 * (one side resolved adversely while the other hasn't yet) get an explicit
 * label so the cell carries the asymmetry information at-a-glance.
 *
 * Unknown values are tolerated and render muted — the indexer is the source
 * of truth and may evolve before this enum catches up.
 */
export type AgreementStatus =
  | 'active'
  | 'released'
  | 'forfeited'
  | 'partialForfeitA'
  | 'partialForfeitB'
  | 'expired'
  | 'cancelled'

const AGREEMENT_TONE: Record<AgreementStatus, string> = {
  active: 'ds-badge--success',
  released: 'ds-badge--muted',
  forfeited: 'ds-badge--error',
  partialForfeitA: 'ds-badge--error',
  partialForfeitB: 'ds-badge--error',
  expired: 'ds-badge--muted',
  cancelled: 'ds-badge--muted',
}

const AGREEMENT_LABEL: Record<AgreementStatus, string> = {
  active: 'active',
  released: 'released',
  forfeited: 'forfeited',
  partialForfeitA: 'partial forfeit · A',
  partialForfeitB: 'partial forfeit · B',
  expired: 'expired',
  cancelled: 'cancelled',
}

export function AgreementStatusBadge({
  status,
  className,
}: {
  status: AgreementStatus | string
  className?: string
}) {
  const known = (AGREEMENT_TONE as Record<string, string | undefined>)[status]
  const tone = known ?? 'ds-badge--muted'
  const label = known ? AGREEMENT_LABEL[status as AgreementStatus] : status
  const root = ['ds-badge', tone, className].filter(Boolean).join(' ')
  return <span className={root}>{label}</span>
}

export type OperatorStatus = 'ACTIVE' | 'INACTIVE' | 'BELOW_MIN_STAKE' | 'COOLDOWN'

const OPERATOR_TONE: Record<OperatorStatus, string> = {
  ACTIVE: 'ds-badge--success',
  INACTIVE: 'ds-badge--muted',
  BELOW_MIN_STAKE: 'ds-badge--warn',
  COOLDOWN: 'ds-badge--warn',
}

const OPERATOR_LABEL: Record<OperatorStatus, string> = {
  ACTIVE: 'active',
  INACTIVE: 'inactive',
  BELOW_MIN_STAKE: 'below min',
  COOLDOWN: 'cooldown',
}

export function OperatorStatusBadge({
  status,
  className,
}: {
  status: OperatorStatus
  className?: string
}) {
  const root = ['ds-badge', OPERATOR_TONE[status], className].filter(Boolean).join(' ')
  return <span className={root}>{OPERATOR_LABEL[status]}</span>
}

/**
 * Aggregate forfeiture risk, derived via {@link riskTier} from a max-penalty bps.
 * Composes with the badge tone family (success / warn / error) and `'unrated'`
 * for the unknown case. Use as a hero-level vault summary; for per-row risk,
 * prefer {@link RiskRow} (dot + bps + text).
 */
export type RiskTierBadgeTier = RiskTier | 'unknown'

const RISK_TIER_TONE: Record<RiskTierBadgeTier, string> = {
  success: 'ds-badge--success',
  warn: 'ds-badge--warn',
  error: 'ds-badge--error',
  unknown: 'ds-badge--muted',
}

const RISK_TIER_LABEL: Record<RiskTierBadgeTier, string> = {
  success: 'low risk',
  warn: 'medium risk',
  error: 'high risk',
  unknown: 'unrated',
}

export function RiskTierBadge({ tier, className }: { tier: RiskTierBadgeTier; className?: string }) {
  const root = ['ds-badge', RISK_TIER_TONE[tier], className].filter(Boolean).join(' ')
  return (
    <span className={root} title={`Aggregate forfeiture risk: ${RISK_TIER_LABEL[tier]}`}>
      {RISK_TIER_LABEL[tier]}
    </span>
  )
}

/**
 * Mutual lifecycle. Driven by the mutual header's `active` / `terminal` flags
 * plus the live derived state (a bonded loss under challenge, or members still
 * owing markdown after execution). Pages must not invent ad-hoc colors for
 * these states.
 *
 * - `pending`     — registered but not yet activated.
 * - `active`      — open and covering. Members still settling owed markdown
 *                   after an executed loss stay `active` (the pool keeps
 *                   covering); the owed-markdown footnote carries that nuance
 *                   rather than a distinct badge.
 * - `loss-pending`— a bonded loss is in its challenge window; capacity frozen.
 * - `terminated`  — terminal; no new losses can be initiated.
 */
export type MutualLifecycle =
  | 'pending'
  | 'active'
  | 'loss-pending'
  | 'terminated'

const MUTUAL_TONE: Record<MutualLifecycle, string> = {
  pending: 'ds-badge--accent',
  active: 'ds-badge--success',
  'loss-pending': 'ds-badge--warn',
  terminated: 'ds-badge--muted',
}

const MUTUAL_LABEL: Record<MutualLifecycle, string> = {
  pending: 'pending activation',
  active: 'active',
  'loss-pending': 'loss pending',
  terminated: 'terminated',
}

export function MutualStatusBadge({
  status,
  className,
}: {
  status: MutualLifecycle
  className?: string
}) {
  const root = ['ds-badge', MUTUAL_TONE[status], className].filter(Boolean).join(' ')
  return <span className={root}>{MUTUAL_LABEL[status]}</span>
}

/**
 * Off-chain metadata integrity. Mirrors the on-chain `(uri, contentHash)` pair —
 * `ok` means the fetched JSON hashes back to `contentHash`, `invalid` means it
 * doesn't, `missing` means no URI was set, `checking` means the hash hasn't
 * been verified yet.
 */
export type MetadataStatus = 'ok' | 'missing' | 'invalid' | 'checking'

const METADATA_GLYPH: Record<MetadataStatus, string> = {
  ok: '✓',
  missing: '·',
  invalid: '✗',
  checking: '⋯',
}

const METADATA_LABEL: Record<MetadataStatus, string> = {
  ok: 'verified',
  missing: 'no metadata',
  invalid: 'hash mismatch',
  checking: 'verifying',
}

export function MetadataStatusBadge({
  status,
  label,
}: {
  status: MetadataStatus
  /** Override the default label when the surface already implies "metadata". */
  label?: string
}) {
  return (
    <span className={`ds-metadata-status ds-metadata-status--${status}`}>
      <span className="ds-metadata-status-glyph" aria-hidden>
        {METADATA_GLYPH[status]}
      </span>
      <span>{label ?? METADATA_LABEL[status]}</span>
    </span>
  )
}

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

const PROPOSAL_STATE_TONE: Record<ProposalState, string> = {
  pending: 'ds-badge--muted',
  active: 'ds-badge--accent',
  canceled: 'ds-badge--muted',
  defeated: 'ds-badge--warn',
  succeeded: 'ds-badge--success',
  queued: 'ds-badge--accent',
  expired: 'ds-badge--muted',
  executed: 'ds-badge--success',
}

const PROPOSAL_STATE_LABEL: Record<ProposalState, string> = {
  pending: 'pending',
  active: 'active',
  canceled: 'canceled',
  defeated: 'defeated',
  succeeded: 'succeeded',
  queued: 'queued',
  expired: 'expired',
  executed: 'executed',
}

export function ProposalStateBadge({
  state,
  className,
}: {
  state: ProposalState | string
  className?: string
}) {
  const known = (PROPOSAL_STATE_TONE as Record<string, string | undefined>)[state]
  const tone = known ?? 'ds-badge--muted'
  const label = known ? PROPOSAL_STATE_LABEL[state as ProposalState] : state
  const root = ['ds-badge', tone, className].filter(Boolean).join(' ')
  return <span className={root}>{label}</span>
}

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

const PROPOSAL_KIND_TONE: Record<ProposalKind, string> = {
  weight_update: 'ds-badge--accent',
  forfeit_arbitration: 'ds-badge--error',
  treasury: 'ds-badge--warn',
  signaling: 'ds-badge--muted',
  mixed: 'ds-badge--muted',
}

const PROPOSAL_KIND_LABEL: Record<ProposalKind, string> = {
  weight_update: 'weight',
  forfeit_arbitration: 'forfeit',
  treasury: 'treasury',
  signaling: 'signal',
  mixed: 'mixed',
}

export function ProposalKindBadge({
  kind,
  className,
}: {
  kind: ProposalKind | string
  className?: string
}) {
  const known = (PROPOSAL_KIND_TONE as Record<string, string | undefined>)[kind]
  const tone = known ?? 'ds-badge--muted'
  const label = known ? PROPOSAL_KIND_LABEL[kind as ProposalKind] : kind
  const root = ['ds-badge', tone, className].filter(Boolean).join(' ')
  return <span className={root}>{label}</span>
}

/**
 * Vote support — for / against / abstain. Numeric `support` (0/1/2) mirrors
 * the OZ Governor convention.
 */
export type VoteSupport = 0 | 1 | 2

const SUPPORT_TONE: Record<VoteSupport, string> = {
  0: 'ds-badge--error',
  1: 'ds-badge--success',
  2: 'ds-badge--muted',
}

const SUPPORT_LABEL: Record<VoteSupport, string> = {
  0: 'against',
  1: 'for',
  2: 'abstain',
}

export function SupportBadge({ support, className }: { support: VoteSupport; className?: string }) {
  const root = ['ds-badge', SUPPORT_TONE[support], className].filter(Boolean).join(' ')
  return <span className={root}>{SUPPORT_LABEL[support]}</span>
}
