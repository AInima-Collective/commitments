import assert from 'node:assert/strict'
import test from 'node:test'

import {
  ArbitrationInputError,
  decodeArbitrationCursor,
  deriveIndexedProposalStatus,
  encodeArbitrationCursor,
  finalizeArbitrationPage,
  parseArbitrationRequest,
  serializeArbitrationEvent,
} from './arbitration.ts'

const MANAGER_A = '0x1111111111111111111111111111111111111111'
const MANAGER_B = '0x2222222222222222222222222222222222222222'

test('identity includes manager even when commitment ids are identical', () => {
  const a = parseArbitrationRequest({ id: '7', manager: MANAGER_A })
  const b = parseArbitrationRequest({ id: '7', manager: MANAGER_B })
  assert.equal(a.commitmentId, b.commitmentId)
  assert.notEqual(a.manager, b.manager)
})

test('raw ERC-20 commitments need no vault input', () => {
  const request = parseArbitrationRequest({ id: '12', manager: MANAGER_A })
  assert.deepEqual(Object.keys(request).sort(), ['commitmentId', 'limit', 'manager'])
})

test('cursor round-trips a deterministic block and log position', () => {
  const cursor = encodeArbitrationCursor({ blockNumber: 12345678901234567890n, logIndex: 17 })
  assert.deepEqual(decodeArbitrationCursor(cursor), {
    blockNumber: 12345678901234567890n,
    logIndex: 17,
  })
})

test('more than one page remains reachable through the lookahead cursor', () => {
  const records = Array.from({ length: 101 }, (_, logIndex) => ({ blockNumber: 10n, logIndex }))
  const first = finalizeArbitrationPage(records, 100)
  assert.equal(first.rows.length, 100)
  assert.ok(first.nextCursor)
  assert.deepEqual(decodeArbitrationCursor(first.nextCursor), { blockNumber: 10n, logIndex: 99 })
  const second = records.filter((row) => row.logIndex > 99)
  assert.equal(finalizeArbitrationPage(second, 100).rows.length, 1)
})

test('indexed proposal summary agrees with the latest terminal outcome', () => {
  assert.equal(deriveIndexedProposalStatus('forfeitPending', 'initiated'), 'pending')
  assert.equal(deriveIndexedProposalStatus('forfeited', 'executed'), 'executed')
  assert.equal(deriveIndexedProposalStatus('active', 'cancelled'), 'cancelled')
  assert.equal(deriveIndexedProposalStatus('active', 'cancelledStale'), 'cancelledStale')
})

test('repeated initiate/cancel attempts retain event timestamp and committer wire names', () => {
  const rows = [
    { kind: 'initiated', blockTimestamp: 10n, blockNumber: 2n, logIndex: 1 },
    { kind: 'cancelled', blockTimestamp: 11n, blockNumber: 3n, logIndex: 0 },
    { kind: 'initiated', blockTimestamp: 12n, blockNumber: 4n, logIndex: 2 },
  ].map((row) =>
    serializeArbitrationEvent({
      ...row,
      txHash: `0x${'a'.repeat(64)}`,
      penaltyBps: 500,
      challengeWindow: 86_400n,
      challengeEnd: row.blockTimestamp + 86_400n,
      proposalInitiatedAt: row.kind === 'initiated' ? row.blockTimestamp : 10n,
      sharesToForfeit: null,
      counterparty: null,
      committer: `0x${'b'.repeat(40)}`,
      arbiter: `0x${'c'.repeat(40)}`,
    }),
  )
  assert.deepEqual(rows.map((row) => row.kind), ['initiated', 'cancelled', 'initiated'])
  assert.deepEqual(rows.map((row) => row.timestamp), ['10', '11', '12'])
  assert.equal('committer' in rows[0], true)
  assert.equal('depositor' in rows[0], false)
})

test('invalid ids, managers, limits, and cursors fail intentionally', () => {
  const invalid = [
    { id: '-1', manager: MANAGER_A },
    { id: '1x', manager: MANAGER_A },
    { id: '1' },
    { id: '1', manager: '0x1234' },
    { id: '1', manager: MANAGER_A, limit: '0' },
    { id: '1', manager: MANAGER_A, limit: '101' },
    { id: '1', manager: MANAGER_A, cursor: '' },
    { id: '1', manager: MANAGER_A, cursor: 'broken' },
  ]
  for (const value of invalid) {
    assert.throws(() => parseArbitrationRequest(value), ArbitrationInputError)
  }
})
