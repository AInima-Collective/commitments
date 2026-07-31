import { describe, expect, it } from 'vitest'
import { compareCommitmentUrgency, sortByCommitmentUrgency } from '../commitmentSort'
import type { CommitmentStatus } from '../../utils/commitments'

const row = (
  id: bigint,
  status: CommitmentStatus,
  forfeitChallengeEnd?: bigint,
) => ({ id, status, forfeitChallengeEnd })

describe('compareCommitmentUrgency', () => {
  it('puts FORFEIT_PENDING above ACTIVE above terminal tiers', () => {
    const rows = [
      row(1n, 'RELEASED'),
      row(2n, 'ACTIVE'),
      row(3n, 'FORFEIT_PENDING'),
      row(4n, 'EXPIRED'),
      row(5n, 'FORFEITED'),
    ]
    const sorted = sortByCommitmentUrgency(rows)
    expect(sorted.map((r) => r.id)).toEqual([3n, 2n, 5n, 4n, 1n])
  })

  it('within FORFEIT_PENDING, imminent deadlines float up', () => {
    const rows = [
      row(1n, 'FORFEIT_PENDING', 5_000n),
      row(2n, 'FORFEIT_PENDING', 1_000n),
      row(3n, 'FORFEIT_PENDING', 3_000n),
    ]
    const sorted = sortByCommitmentUrgency(rows)
    expect(sorted.map((r) => r.id)).toEqual([2n, 3n, 1n])
  })

  it('rows without forfeitChallengeEnd sort after rows that have one (within same tier)', () => {
    const rows = [
      row(1n, 'ACTIVE'),
      row(2n, 'ACTIVE', 500n),
      row(3n, 'ACTIVE'),
    ]
    const sorted = sortByCommitmentUrgency(rows)
    // 2 first (has deadline), then 3 and 1 by id DESC tiebreak
    expect(sorted.map((r) => r.id)).toEqual([2n, 3n, 1n])
  })

  it('final tiebreaker is id DESC (newest first)', () => {
    const rows = [row(1n, 'ACTIVE'), row(3n, 'ACTIVE'), row(2n, 'ACTIVE')]
    const sorted = sortByCommitmentUrgency(rows)
    expect(sorted.map((r) => r.id)).toEqual([3n, 2n, 1n])
  })

  it('compareCommitmentUrgency returns numeric ordering values', () => {
    expect(compareCommitmentUrgency(row(1n, 'FORFEIT_PENDING'), row(2n, 'ACTIVE'))).toBeLessThan(0)
    expect(compareCommitmentUrgency(row(1n, 'ACTIVE'), row(2n, 'FORFEIT_PENDING'))).toBeGreaterThan(0)
    expect(compareCommitmentUrgency(row(1n, 'ACTIVE'), row(1n, 'ACTIVE'))).toBe(0)
  })
})
