import { describe, expect, it } from 'vitest'

import type { ArbiterCommitment } from '../../../hooks/useArbiterCommitments'
import { bucketForArbiterInbox } from '../../../lib/arbiterInbox'

function commitment(overrides: Partial<ArbiterCommitment>): ArbiterCommitment {
  return {
    status: 'ACTIVE',
    challengeWindow: 100n,
    forfeitProposal: undefined,
    ...overrides,
  } as ArbiterCommitment
}

describe('arbiter inbox bucketing', () => {
  it('does not count a merely active commitment as needing action', () => {
    expect(bucketForArbiterInbox(commitment({ status: 'ACTIVE' }), 1_000n, undefined, 1_000n)).toBe('active')
  })

  it('separates pending proposals from permissionless mature execution', () => {
    const proposal = {
      initiatedAt: 1_000n,
      penaltyBps: 1_000,
      executed: false,
      cancelled: false,
      cumulativePausedAtStart: 0n,
    }
    const row = commitment({ status: 'FORFEIT_PENDING', forfeitProposal: proposal })
    const pause = {
      paused: false,
      pausedAt: 0n,
      cumulativePaused: 0n,
      maxPauseDuration: 1_000n,
      creditable: 0n,
    }
    expect(bucketForArbiterInbox(row, 1_050n, pause, 10_000n)).toBe('pending')
    expect(bucketForArbiterInbox(row, 1_101n, pause, 10_000n)).toBe('executable')
  })

  it('keeps unbonding and terminal commitments reachable as closed/other', () => {
    expect(bucketForArbiterInbox(commitment({ status: 'UNBONDING' }), 1_000n, undefined, 1_000n)).toBe('other')
    expect(bucketForArbiterInbox(commitment({ status: 'RELEASED' }), 1_000n, undefined, 1_000n)).toBe('other')
  })
})
