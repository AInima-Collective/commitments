import { describe, expect, it } from 'vitest'

import { toProtocolStats, type ProtocolStatsWire } from '../useProtocolStats'

// The shape GET /protocol/stats returns (indexer/src/api/protocol.ts).
const WIRE: ProtocolStatsWire = {
  commitments: { active: 3, unbonding: 1, forfeitPending: 1, forfeited: 2, released: 4, expired: 1 },
  totalForfeitable: '123456789012345678901',
  arbiterCount: 2,
  agreements: { active: 1, forfeited: 0, released: 2, partialForfeitA: 1, partialForfeitB: 0 },
  operators: { registered: 5, deregistered: 1, totalDelegatedStake: '1000' },
  meshNodes: { fanIn: 1, fanOut: 2, tokenWeighting: 0, total: 3 },
  ledger: { totalEncumbered: '90000000000000000000000', positionCount: 7 },
  updatedAt: 1_700_000_000,
}

describe('toProtocolStats', () => {
  it('maps the indexer payload, including the ledger block', () => {
    const stats = toProtocolStats(WIRE)
    expect(stats.ledger).toEqual({ totalEncumbered: 90000000000000000000000n, positionCount: 7 })
    expect(stats.totalForfeitable).toBe(123456789012345678901n)
    expect(stats.operators.totalDelegatedStake).toBe(1000n)
    expect(stats.commitments.total).toBe(12)
    expect(stats.agreements.total).toBe(4)
    expect(stats.updatedAt).toBe(1_700_000_000)
  })
})
