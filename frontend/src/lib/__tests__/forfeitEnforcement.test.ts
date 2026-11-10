import { describe, expect, it } from 'vitest'

import {
  calculateForfeitEnforcement,
  FORFEIT_STATE_LABEL,
  type ForfeitProposalSnapshot,
  type ManagerPauseSnapshot,
} from '../forfeitEnforcement'

const PROPOSAL_TTL = 14n * 86_400n

const proposal = (overrides: Partial<ForfeitProposalSnapshot> = {}): ForfeitProposalSnapshot => ({
  penaltyBps: 2_500,
  initiatedAt: 1_000n,
  executed: false,
  cancelled: false,
  cumulativePausedAtStart: 0n,
  ...overrides,
})
const pause = (overrides: Partial<ManagerPauseSnapshot> = {}): ManagerPauseSnapshot => ({
  paused: false,
  pausedAt: 0n,
  cumulativePaused: 0n,
  maxPauseDuration: 1_000n,
  creditable: 0n,
  ...overrides,
})
const calculate = (overrides: Partial<Parameters<typeof calculateForfeitEnforcement>[0]> = {}) =>
  calculateForfeitEnforcement({
    proposal: proposal(),
    challengeWindow: 100n,
    pauseState: pause(),
    proposalTtl: PROPOSAL_TTL,
    now: 1_050n,
    ...overrides,
  })

describe('calculateForfeitEnforcement', () => {
  it('handles the zero-value/no proposal sentinel', () => {
    expect(calculate({ proposal: undefined }).state).toBe('NONE')
    expect(calculate({ proposal: proposal({ initiatedAt: 0n }) }).state).toBe('NONE')
    expect(FORFEIT_STATE_LABEL.NONE).toBe('No active arbitration or forfeit proposal')
  })

  it('reports an active proposal before effective maturity', () => {
    expect(calculate().state).toBe('PENDING')
  })

  it('matures at the exact boundary', () => {
    const result = calculate({ now: 1_100n })
    expect(result.state).toBe('EXECUTABLE')
    expect(result.executionAvailable).toBe(true)
  })

  it('moves maturity while a pause that began before maturity accrues', () => {
    const result = calculate({
      now: 1_100n,
      pauseState: pause({ paused: true, pausedAt: 1_050n, creditable: 50n }),
    })
    expect(result.effectiveExecutionAt).toBe(1_150n)
    expect(result.state).toBe('PENDING')
  })

  it('does not call an active pause executable after nominal maturity', () => {
    const result = calculate({
      now: 1_200n,
      pauseState: pause({ paused: true, pausedAt: 1_050n, creditable: 150n }),
    })
    expect(result.state).toBe('PENDING')
    expect(result.executionAvailable).toBe(false)
  })

  it('keeps the credited extension after resume', () => {
    const result = calculate({
      now: 1_149n,
      pauseState: pause({ cumulativePaused: 50n, creditable: 50n }),
    })
    expect(result.effectiveExecutionAt).toBe(1_150n)
    expect(result.state).toBe('PENDING')
  })

  it('uses the manager-clamped lifetime pause credit', () => {
    const result = calculate({
      now: 1_199n,
      pauseState: pause({ paused: true, cumulativePaused: 100n, maxPauseDuration: 100n, creditable: 100n }),
    })
    expect(result.effectiveExecutionAt).toBe(1_200n)
    expect(result.pauseOverlap).toBe(100n)
  })

  it('subtracts pauses credited before this proposal began', () => {
    const result = calculate({
      proposal: proposal({ cumulativePausedAtStart: 80n }),
      pauseState: pause({ cumulativePaused: 110n, creditable: 110n }),
      now: 1_129n,
    })
    expect(result.pauseOverlap).toBe(30n)
    expect(result.effectiveExecutionAt).toBe(1_130n)
  })

  it('reports an executable proposal', () => {
    expect(calculate({ now: 1_101n }).state).toBe('EXECUTABLE')
  })

  it('can be executable and stale-cancellable at the same time', () => {
    const staleAt = 1_100n + PROPOSAL_TTL
    const result = calculate({ now: staleAt })
    expect(result.state).toBe('STALE')
    expect(result.executionAvailable).toBe(true)
    expect(result.staleCancellationAvailable).toBe(true)
  })

  it('surfaces a mature proposal blocked by the manager pause', () => {
    const result = calculate({
      now: 1_101n,
      pauseState: pause({ paused: true, pausedAt: 1_101n }),
    })
    expect(result.state).toBe('PAUSED')
    expect(result.executionAvailable).toBe(false)
  })

  it('handles executed and normally cancelled terminal flags', () => {
    expect(calculate({ proposal: proposal({ executed: true }) }).state).toBe('EXECUTED')
    expect(calculate({ proposal: proposal({ cancelled: true }) }).state).toBe('CANCELLED')
  })

  it('refuses an invalid negative pause difference', () => {
    const result = calculate({
      proposal: proposal({ cumulativePausedAtStart: 51n }),
      pauseState: pause({ creditable: 50n }),
    })
    expect(result.state).toBe('INCONSISTENT')
    expect(result.effectiveExecutionAt).toBeUndefined()
  })
})
