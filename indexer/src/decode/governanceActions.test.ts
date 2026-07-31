/**
 * Unit tests for the governance-action decoder. Run with:
 *   node --experimental-strip-types --test src/decode/governanceActions.test.ts
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { encodeFunctionData, parseAbi } from 'viem'

import { decodeProposalAction, rollupProposalKind } from './governanceActions.ts'

const TW = parseAbi(['function updateWeight(bytes32 denom, uint256 weightBps)'])
const CM = parseAbi([
  'function initiateForfeit(uint256 commitmentId, uint16 penaltyBps)',
  'function cancelForfeit(uint256 commitmentId)',
])

const ZERO_ADDR = '0x0000000000000000000000000000000000000000' as const
const TW_ADDR = '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' as const
const CM_ADDR = '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb' as const
const TIMELOCK = '0xcccccccccccccccccccccccccccccccccccccccc' as const

test('signaling: empty calldata + zero value', () => {
  const decoded = decodeProposalAction({ target: TIMELOCK, value: 0n, calldata: '0x' })
  assert.equal(decoded.kind, 'signaling')
  assert.equal(decoded.selector, null)
  assert.equal(decoded.decoded, null)
})

test('weight_update: TokenWeighting.updateWeight', () => {
  const denom = ('0x' + 'de'.repeat(32)) as `0x${string}`
  const data = encodeFunctionData({
    abi: TW,
    functionName: 'updateWeight',
    args: [denom, 9000n],
  })
  const decoded = decodeProposalAction({ target: TW_ADDR, value: 0n, calldata: data })
  assert.equal(decoded.kind, 'weight_update')
  assert.ok(decoded.selector)
  assert.deepEqual(decoded.decoded, {
    tokenWeighting: TW_ADDR,
    denom,
    newWeightBps: '9000',
  })
})

test('forfeit_arbitration: initiateForfeit', () => {
  const data = encodeFunctionData({
    abi: CM,
    functionName: 'initiateForfeit',
    args: [42n, 2500],
  })
  const decoded = decodeProposalAction({ target: CM_ADDR, value: 0n, calldata: data })
  assert.equal(decoded.kind, 'forfeit_arbitration')
  assert.deepEqual(decoded.decoded, {
    manager: CM_ADDR,
    op: 'initiateForfeit',
    commitmentId: '42',
    penaltyBps: 2500,
  })
})

test('forfeit_arbitration: cancelForfeit', () => {
  const data = encodeFunctionData({ abi: CM, functionName: 'cancelForfeit', args: [42n] })
  const decoded = decodeProposalAction({ target: CM_ADDR, value: 0n, calldata: data })
  assert.equal(decoded.kind, 'forfeit_arbitration')
  assert.deepEqual(decoded.decoded, {
    manager: CM_ADDR,
    op: 'cancelForfeit',
    commitmentId: '42',
  })
})

test('treasury: unknown selector preserves raw calldata', () => {
  const data = '0xdeadbeef' as `0x${string}`
  const decoded = decodeProposalAction({ target: ZERO_ADDR, value: 0n, calldata: data })
  assert.equal(decoded.kind, 'treasury')
  assert.equal(decoded.selector, '0xdeadbeef')
  assert.deepEqual(decoded.decoded, { rawCalldata: data })
})

test('treasury: short calldata (<10 bytes) does not crash', () => {
  const decoded = decodeProposalAction({ target: ZERO_ADDR, value: 1n, calldata: '0x12' })
  assert.equal(decoded.kind, 'treasury')
})

test('rollup: all signaling -> signaling', () => {
  assert.equal(
    rollupProposalKind([
      { kind: 'signaling', selector: null, decoded: null },
      { kind: 'signaling', selector: null, decoded: null },
    ]),
    'signaling',
  )
})

test('rollup: mixed -> mixed', () => {
  assert.equal(
    rollupProposalKind([
      { kind: 'weight_update', selector: '0x12345678', decoded: {} },
      { kind: 'signaling', selector: null, decoded: null },
    ]),
    'mixed',
  )
})

test('rollup: empty -> signaling', () => {
  assert.equal(rollupProposalKind([]), 'signaling')
})
