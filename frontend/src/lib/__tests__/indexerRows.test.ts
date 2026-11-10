import { describe, expect, it } from 'vitest'

import {
  commitmentStatusFromWire,
  parseCommitmentRow,
  toBigInt,
  type CommitmentRowWire,
} from '../indexerRows'

const ROW: CommitmentRowWire = {
  id: '7',
  committer: '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
  arbiter: '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
  counterparty: '0xcccccccccccccccccccccccccccccccccccccccc',
  token: '0xdddddddddddddddddddddddddddddddddddddddd',
  adapter: '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee',
  amount: '1000000000000000000000',
  maxPenaltyBps: 500,
  status: 'forfeitPending',
  forfeitPenaltyBps: 250,
  forfeitChallengeEnd: '1700000000',
  forfeitSharesExecuted: null,
  forfeitCounterparty: null,
  unbondInitiatedAt: null,
  unbondMaturesAt: '',
  createdBlock: '12',
  createdAt: null,
  updatedBlock: '40',
  metadataURI: 'ipfs://x',
  metadataHash: null,
  metadataStatus: 'ok',
  metadataContent: { title: 't' },
}

describe('parseCommitmentRow', () => {
  it('maps a full row', () => {
    const r = parseCommitmentRow(ROW)
    expect(r.id).toBe(7n)
    expect(r.amount).toBe(10n ** 21n)
    expect(r.status).toBe('FORFEIT_PENDING')
    expect(r.forfeitPenaltyBps).toBe(250)
    expect(r.forfeitChallengeEnd).toBe(1_700_000_000n)
    expect(r.metadataContent).toEqual({ title: 't' })
  })

  it('reads null, empty and absent columns as undefined', () => {
    const r = parseCommitmentRow(ROW)
    expect(r.forfeitSharesExecuted).toBeUndefined()
    expect(r.unbondMaturesAt).toBeUndefined()
    expect(r.createdAt).toBeUndefined()
    expect(r.metadataHash).toBeUndefined()
    expect(r.vault).toBeUndefined()
    expect(r.manager).toBeUndefined()
    expect(r.acceptsContributions).toBe(false)
  })
})

describe('commitmentStatusFromWire', () => {
  it('maps every wire status', () => {
    expect(commitmentStatusFromWire('active')).toBe('ACTIVE')
    expect(commitmentStatusFromWire('unbonding')).toBe('UNBONDING')
    expect(commitmentStatusFromWire('forfeited')).toBe('FORFEITED')
    expect(commitmentStatusFromWire('released')).toBe('RELEASED')
    expect(commitmentStatusFromWire('expired')).toBe('EXPIRED')
    expect(commitmentStatusFromWire('nonsense')).toBe('ACTIVE')
  })
})

describe('toBigInt', () => {
  it('rejects malformed input without throwing', () => {
    expect(toBigInt('abc')).toBeUndefined()
    expect(toBigInt('5')).toBe(5n)
  })
})
