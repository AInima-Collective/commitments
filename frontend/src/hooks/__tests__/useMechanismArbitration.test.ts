import { describe, expect, it } from 'vitest'
import type { Address } from 'viem'

import {
  normalizeOptimisticClaimCase,
  normalizeTwoTierCase,
} from '../useMechanismArbitration'

const ARBITER = '0x1000000000000000000000000000000000000001' as Address
const PARTY = '0x2000000000000000000000000000000000000002' as Address

describe('normalized mechanism cases', () => {
  it('returns an explicit empty lookup when no active id exists', () => {
    expect(normalizeOptimisticClaimCase({ activeId: 0n, arbiter: ARBITER })).toBeUndefined()
    expect(normalizeTwoTierCase({ activeId: 0n, arbiter: ARBITER })).toBeUndefined()
  })

  it('normalizes an active optimistic claim deadline independently of manager timing', () => {
    const result = normalizeOptimisticClaimCase({
      activeId: 9n,
      arbiter: ARBITER,
      timeout: 100n,
      claim: {
        commitmentId: 7n,
        winningAmtBps: 0,
        lastBondAt: 1_000n,
        state: 1,
        stack: [{ asserter: PARTY, amountBps: 2_500, bond: 10n }],
      },
    })
    expect(result).toEqual(expect.objectContaining({
      id: 9n,
      commitmentId: 7n,
      phase: 'Proposed',
      status: 'open',
      nextDeadline: 1_100n,
    }))
    expect(result?.availableActions.join(' ')).toMatch(/dispute/i)
    expect(result?.deadlines).toEqual([{ label: 'answer deadline', at: 1_100n }])
  })

  it.each([
    [4, 'Dismissed', 'Penalty dismissed on appeal'],
    [6, 'Lapsed', 'Appeal lapsed without a final ruling'],
    [7, 'Executed', '1000 bps ruling executed'],
  ])('normalizes terminal TwoTier state %s as %s', (state, phase, outcome) => {
    const result = normalizeTwoTierCase({
      activeId: 4n,
      arbiter: ARBITER,
      court: {
        commitmentId: 7n,
        primaryPenaltyBps: 1_000,
        finalPenaltyBps: 0,
        appealDeadline: 1_100n,
        humanDeadline: 1_200n,
        state,
      },
    })
    expect(result?.phase).toBe(phase)
    expect(result?.status).toBe('terminal')
    expect(result?.nextDeadline).toBeUndefined()
    expect(result?.outcome).toBe(outcome)
  })

  it('shows the exact human-response deadline and appeal controller action', () => {
    const result = normalizeTwoTierCase({
      activeId: 4n,
      arbiter: ARBITER,
      appeal: PARTY,
      court: {
        commitmentId: 7n,
        primaryPenaltyBps: 1_000,
        finalPenaltyBps: 0,
        appealDeadline: 1_100n,
        humanDeadline: 1_200n,
        state: 2,
      },
    })
    expect(result?.phase).toBe('Appealed')
    expect(result?.nextDeadline).toBe(1_200n)
    expect(result?.deadlines).toEqual([
      { label: 'appeal deadline', at: 1_100n },
      { label: 'human-response deadline', at: 1_200n },
    ])
    expect(result?.availableActions.join(' ')).toMatch(/appeal controller/i)
  })
})
