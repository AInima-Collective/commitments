export const DEFAULT_FORFEIT_PROPOSAL_TTL = 14n * 86_400n

export interface ForfeitProposalSnapshot {
  penaltyBps: number
  initiatedAt: bigint
  executed: boolean
  cancelled: boolean
  cumulativePausedAtStart: bigint
}

export interface ManagerPauseSnapshot {
  paused: boolean
  pausedAt: bigint
  cumulativePaused: bigint
  maxPauseDuration: bigint
  /** Lifetime pause credit already clamped by the manager. */
  creditable: bigint
}

export type ForfeitEnforcementState =
  | 'NONE'
  | 'PENDING'
  | 'EXECUTABLE'
  | 'PAUSED'
  | 'STALE'
  | 'EXECUTED'
  | 'CANCELLED'
  | 'INCONSISTENT'
  | 'UNAVAILABLE'

export interface ForfeitEnforcement {
  state: ForfeitEnforcementState
  proposal?: ForfeitProposalSnapshot
  pauseOverlap?: bigint
  effectiveExecutionAt?: bigint
  staleCancelAt?: bigint
  executionAvailable: boolean
  staleCancellationAvailable: boolean
  managerPaused: boolean | undefined
}

/**
 * Canonical frontend mirror of CommitmentManager's pause-aware proposal clock.
 * All values stay bigint; a corrupt/non-monotone pause snapshot is surfaced as
 * inconsistent instead of underflowing or fabricating a deadline.
 */
export function calculateForfeitEnforcement(input: {
  proposal?: ForfeitProposalSnapshot
  challengeWindow: bigint
  pauseState?: ManagerPauseSnapshot
  proposalTtl?: bigint
  now: bigint
}): ForfeitEnforcement {
  const { proposal, challengeWindow, pauseState, proposalTtl, now } = input
  if (!proposal || proposal.initiatedAt === 0n) {
    return {
      state: 'NONE',
      executionAvailable: false,
      staleCancellationAvailable: false,
      managerPaused: pauseState?.paused,
    }
  }
  if (proposal.executed) {
    return {
      state: 'EXECUTED',
      proposal,
      executionAvailable: false,
      staleCancellationAvailable: false,
      managerPaused: pauseState?.paused,
    }
  }
  if (proposal.cancelled) {
    return {
      state: 'CANCELLED',
      proposal,
      executionAvailable: false,
      staleCancellationAvailable: false,
      managerPaused: pauseState?.paused,
    }
  }
  if (!pauseState || proposalTtl === undefined) {
    return {
      state: 'UNAVAILABLE',
      proposal,
      executionAvailable: false,
      staleCancellationAvailable: false,
      managerPaused: pauseState?.paused,
    }
  }
  if (pauseState.creditable < proposal.cumulativePausedAtStart) {
    return {
      state: 'INCONSISTENT',
      proposal,
      executionAvailable: false,
      staleCancellationAvailable: false,
      managerPaused: pauseState.paused,
    }
  }

  const pauseOverlap = pauseState.creditable - proposal.cumulativePausedAtStart
  const effectiveExecutionAt = proposal.initiatedAt + challengeWindow + pauseOverlap
  const staleCancelAt = effectiveExecutionAt + proposalTtl
  const mature = now >= effectiveExecutionAt
  const staleCancellationAvailable = now >= staleCancelAt
  const executionAvailable = mature && !pauseState.paused

  let state: ForfeitEnforcementState
  if (staleCancellationAvailable) state = 'STALE'
  else if (!mature) state = 'PENDING'
  else if (pauseState.paused) state = 'PAUSED'
  else state = 'EXECUTABLE'

  return {
    state,
    proposal,
    pauseOverlap,
    effectiveExecutionAt,
    staleCancelAt,
    executionAvailable,
    staleCancellationAvailable,
    managerPaused: pauseState.paused,
  }
}
export const FORFEIT_STATE_LABEL: Record<ForfeitEnforcementState, string> = {
  NONE: 'No active arbitration or forfeit proposal',
  PENDING: 'Execution delay in progress',
  EXECUTABLE: 'Ready to execute',
  PAUSED: 'Execution paused by the manager',
  STALE: 'Stale cancellation available',
  EXECUTED: 'Executed',
  CANCELLED: 'Cancelled',
  INCONSISTENT: 'Timing data is inconsistent',
  UNAVAILABLE: 'Execution timing unavailable',
}

export function nextForfeitEvent(enforcement: ForfeitEnforcement): string {
  switch (enforcement.state) {
    case 'NONE':
      return 'Nothing is pending. The arbiter may still initiate a future forfeit while the commitment is active.'
    case 'PENDING':
      return 'After the pause-adjusted execution delay, anyone may execute unless the arbiter cancels first.'
    case 'EXECUTABLE':
      return 'Anyone may execute the proposed penalty now; the arbiter may still cancel before execution.'
    case 'PAUSED':
      return 'Execution is blocked until the manager resumes forfeiture; cancellation remains available to the arbiter.'
    case 'STALE':
      return enforcement.executionAvailable
        ? 'Anyone may execute or stale-cancel the proposal now.'
        : 'Anyone may stale-cancel the proposal now, even though ordinary execution is paused.'
    case 'EXECUTED':
      return 'The manager has moved the forfeited units to the counterparty balance.'
    case 'CANCELLED':
      return 'This proposal ended without moving stake. A later proposal may appear in history.'
    case 'INCONSISTENT':
      return 'The manager returned a pause snapshot older than the proposal snapshot; no deadline is shown.'
    case 'UNAVAILABLE':
      return 'Current manager pause data could not be read, so execution readiness cannot be verified.'
  }
}
