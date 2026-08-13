import { describe, expect, it } from 'vitest'

import { parseManagerForfeitEvent } from '../useCommitmentArbitration'

describe('manager forfeit history wire format', () => {
  it('uses event timestamps, committer, and units from the commitment-scoped API', () => {
    const event = parseManagerForfeitEvent({
      kind: 'executed',
      timestamp: '1700000123',
      blockNumber: '42',
      logIndex: 7,
      transactionHash: `0x${'1'.repeat(64)}`,
      penaltyBps: 2500,
      challengeWindow: '86400',
      nominalExecutionAt: '1700086400',
      proposalInitiatedAt: '1700000000',
      unitsForfeited: '123456',
      counterparty: `0x${'2'.repeat(40)}`,
      committer: `0x${'3'.repeat(40)}`,
      arbiter: `0x${'4'.repeat(40)}`,
    })
    expect(event.timestamp).toBe(1700000123n)
    expect(event.committer).toBe(`0x${'3'.repeat(40)}`)
    expect(event.unitsForfeited).toBe(123456n)
  })

  it('retains the stale-cancelled terminal outcome', () => {
    const event = parseManagerForfeitEvent({
      kind: 'cancelledStale',
      timestamp: '2',
      blockNumber: '3',
      logIndex: 4,
      transactionHash: `0x${'1'.repeat(64)}`,
      penaltyBps: 100,
      challengeWindow: '10',
      nominalExecutionAt: '11',
      proposalInitiatedAt: '1',
      unitsForfeited: null,
      counterparty: null,
      committer: `0x${'3'.repeat(40)}`,
      arbiter: `0x${'4'.repeat(40)}`,
    })
    expect(event.kind).toBe('cancelledStale')
  })
})
