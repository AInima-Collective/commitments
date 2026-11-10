import { type Address } from 'viem'

// ─── Status Types ────────────────────────────────────────────────────────────

/**
 * All possible states for an agreement proposal.
 *
 *   PROPOSED  — proposal submitted, awaiting acceptor response
 *   ACTIVE    — proposal accepted, agreement live
 *   RESOLVED  — agreement released (both parties satisfied)
 *   FORFEITED   — agreement forfeited by arbiter
 *   CANCELLED — proposer cancelled before acceptance
 *   EXPIRED   — proposal window elapsed without acceptance
 */
export type AgreementStatus = 'PROPOSED' | 'ACTIVE' | 'RESOLVED' | 'FORFEITED' | 'CANCELLED' | 'EXPIRED'

// ─── Proposal Interface ───────────────────────────────────────────────────────

/**
 * Enriched agreement proposal for UI — combines on-chain AgreementProposal
 * struct with derived status and viewer-relative fields.
 */
export interface AgreementProposalWithStatus {
  proposalId: bigint
  proposer: Address
  acceptor: Address
  arbiter: Address
  /**
   * Headline backing token + adapter for the proposal — the proposer leg's.
   * Agreements are now per-leg (each side names its own token/adapter/penalty),
   * so `token`/`adapter` are a convenience view for the common same-token case;
   * read the explicit `proposer*`/`acceptor*` fields for the true per-leg terms.
   */
  token: Address
  adapter: Address
  proposerAmount: bigint
  acceptorAmount: bigint
  maxPenaltyBps: number
  challengeWindow: bigint
  expiresAt: bigint
  accepted: boolean
  cancelled: boolean
  status: AgreementStatus
  // ── Per-leg terms (from the AgreementProposedTerms event) ──────────────────
  /** Proposer leg backing token. */
  proposerToken?: Address
  /** Proposer leg pricing adapter. */
  proposerAdapter?: Address
  /** Acceptor leg backing token (may differ from the proposer's — cross-token). */
  acceptorToken?: Address
  /** Acceptor leg pricing adapter. */
  acceptorAdapter?: Address
  /** Acceptor leg forfeit ceiling (bps); `maxPenaltyBps` mirrors the proposer leg. */
  acceptorMaxPenaltyBps?: number
  /** Bilateral settlement cap, proposer → acceptor (0 = disabled). */
  maxFlowProposerToAcceptor?: bigint
  /** Bilateral settlement cap, acceptor → proposer (0 = disabled). */
  maxFlowAcceptorToProposer?: bigint
  /** agreementId from AgreementAccepted event — undefined until correlated */
  agreementId?: bigint
  /** commitmentIdA from AgreementAccepted event — undefined until correlated */
  commitmentIdA?: bigint
  /** commitmentIdB from AgreementAccepted event — undefined until correlated */
  commitmentIdB?: bigint
  /** Computed: true when the connected viewAddress is the proposer */
  viewerIsProposer: boolean
  /** Block number from the AgreementProposed event log */
  createdAtBlock?: bigint
}

// ─── Status Derivation ────────────────────────────────────────────────────────

/**
 * Derive agreement status from proposal struct fields and optional resolution.
 *
 * Precedence order:
 *  1. cancelled === true                      → CANCELLED
 *  2. accepted && resolvedStatus === 'FORFEITED' → FORFEITED
 *  3. accepted && resolvedStatus === 'RESOLVED'→ RESOLVED
 *  4. accepted                                → ACTIVE
 *  5. expiresAt > 0 && now > expiresAt        → EXPIRED
 *  6. Otherwise                               → PROPOSED
 */
export function deriveAgreementStatus(
  proposal: { accepted: boolean; cancelled: boolean; expiresAt: bigint },
  resolvedStatus?: 'FORFEITED' | 'RESOLVED' | undefined,
): AgreementStatus {
  if (proposal.cancelled) return 'CANCELLED'
  if (proposal.accepted && resolvedStatus === 'FORFEITED') return 'FORFEITED'
  if (proposal.accepted && resolvedStatus === 'RESOLVED') return 'RESOLVED'
  if (proposal.accepted) return 'ACTIVE'
  const nowSecs = BigInt(Math.floor(Date.now() / 1000))
  if (proposal.expiresAt > 0n && nowSecs > proposal.expiresAt) return 'EXPIRED'
  return 'PROPOSED'
}
