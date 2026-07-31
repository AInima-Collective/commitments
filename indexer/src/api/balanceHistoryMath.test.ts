/**
 * Unit tests for the balance-history fold.
 *
 * Run: node --experimental-strip-types --test src/api/balanceHistoryMath.test.ts
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { foldFlows, type FlowRow } from './balanceHistoryMath.ts'

const WETH = '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2'
const USDC = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48'
const TX = '0xabc'

function flow(over: Partial<FlowRow> & { blockTimestamp: bigint }): FlowRow {
  return {
    token: WETH,
    freeDelta: 0n,
    encumberedDelta: 0n,
    kind: 'deposit',
    commitmentId: null,
    txHash: TX,
    ...over,
  }
}

test('deposit then encumber conserves the total and moves the split', () => {
  const [t] = foldFlows(
    [
      flow({ blockTimestamp: 100n, kind: 'deposit', freeDelta: 1000n }),
      flow({ blockTimestamp: 200n, kind: 'encumber', freeDelta: -400n, encumberedDelta: 400n }),
    ],
    0n,
  )
  assert.equal(t.points.length, 2)
  assert.deepEqual(t.points[0], {
    t: '100',
    free: '1000',
    encumbered: '0',
    kind: 'deposit',
    commitmentId: null,
    txHash: TX,
  })
  assert.equal(t.points[1].free, '600')
  assert.equal(t.points[1].encumbered, '400')
  // free + encumbered is unchanged across the encumber step.
  assert.equal(BigInt(t.points[1].free) + BigInt(t.points[1].encumbered), 1000n)
  assert.deepEqual(t.latest, { free: '600', encumbered: '400' })
})

test('release returns encumbered to free', () => {
  const [t] = foldFlows(
    [
      flow({ blockTimestamp: 100n, freeDelta: 1000n }),
      flow({ blockTimestamp: 200n, kind: 'encumber', freeDelta: -400n, encumberedDelta: 400n }),
      flow({
        blockTimestamp: 300n,
        kind: 'release',
        freeDelta: 400n,
        encumberedDelta: -400n,
        commitmentId: 7n,
      }),
    ],
    0n,
  )
  assert.deepEqual(t.latest, { free: '1000', encumbered: '0' })
  assert.equal(t.points[2].commitmentId, '7')
})

test('forfeit drops the total — encumbered leaves without a matching free credit', () => {
  const [t] = foldFlows(
    [
      flow({ blockTimestamp: 100n, freeDelta: 1000n }),
      flow({ blockTimestamp: 200n, kind: 'encumber', freeDelta: -1000n, encumberedDelta: 1000n }),
      flow({ blockTimestamp: 300n, kind: 'forfeitOut', encumberedDelta: -250n, commitmentId: 3n }),
    ],
    0n,
  )
  assert.deepEqual(t.latest, { free: '0', encumbered: '750' })
})

test('tokens are folded independently', () => {
  const tokens = foldFlows(
    [
      flow({ blockTimestamp: 100n, token: WETH, freeDelta: 5n }),
      flow({ blockTimestamp: 150n, token: USDC, freeDelta: 900n }),
      flow({ blockTimestamp: 200n, token: WETH, freeDelta: 5n }),
    ],
    0n,
  )
  assert.equal(tokens.length, 2)
  const weth = tokens.find((t) => t.token === WETH.toLowerCase())!
  const usdc = tokens.find((t) => t.token === USDC.toLowerCase())!
  assert.equal(weth.latest.free, '10')
  assert.equal(usdc.latest.free, '900')
})

test('pre-window flows collapse into one opening point at the cutoff', () => {
  const [t] = foldFlows(
    [
      flow({ blockTimestamp: 100n, freeDelta: 1000n }),
      flow({ blockTimestamp: 200n, freeDelta: 500n }),
      flow({ blockTimestamp: 900n, freeDelta: 7n }),
    ],
    500n,
  )
  // Two pre-cutoff rows became one point, stamped at the cutoff and carrying
  // their accumulated balance — not dropped, and not restarted from zero.
  assert.equal(t.points.length, 2)
  assert.equal(t.points[0].t, '500')
  assert.equal(t.points[0].free, '1500')
  assert.equal(t.points[1].t, '900')
  assert.equal(t.points[1].free, '1507')
  // `latest` always reflects every row, in or out of the window.
  assert.equal(t.latest.free, '1507')
})

test('an account entirely inside the window gets no synthetic opening point', () => {
  const [t] = foldFlows([flow({ blockTimestamp: 900n, freeDelta: 1n })], 500n)
  assert.equal(t.points.length, 1)
  assert.equal(t.points[0].t, '900')
})

test('an account entirely before the window still reports its balance', () => {
  const [t] = foldFlows([flow({ blockTimestamp: 100n, freeDelta: 42n })], 500n)
  assert.equal(t.points.length, 1)
  assert.equal(t.points[0].t, '500')
  assert.equal(t.points[0].free, '42')
})

test('no rows yields no tokens', () => {
  assert.deepEqual(foldFlows([], 0n), [])
})

test('same-timestamp rows fold correctly when given in chain order', () => {
  // Regression. Seeded anvil put a deposit and the encumbrance it funds in one
  // block, so both rows carry the same blockTimestamp and only the query's
  // tiebreak separates them. Sorted by (blockTimestamp, id) the encumber landed
  // first and free went to -8.55e18 for the rest of the series. The endpoint
  // now sorts by (blockNumber, logIndex); this pins what that ordering has to
  // deliver to the fold.
  const [t] = foldFlows(
    [
      flow({ blockTimestamp: 100n, kind: 'deposit', freeDelta: 1000n }),
      flow({ blockTimestamp: 100n, kind: 'encumber', freeDelta: -1000n, encumberedDelta: 1000n }),
    ],
    0n,
  )
  assert.deepEqual(
    t.points.map((p) => p.free),
    ['1000', '0'],
  )
  assert.ok(
    t.points.every((p) => BigInt(p.free) >= 0n),
    'free must never dip negative on a deposit-then-encumber pair',
  )
})

test('annotation rows carry the balance forward unchanged', () => {
  const [t] = foldFlows(
    [
      flow({ blockTimestamp: 100n, freeDelta: 1000n }),
      // DistributionPaid is logged with zero deltas — it must appear in the
      // series without moving the balance. See the ledgerFlow schema comment.
      flow({ blockTimestamp: 200n, kind: 'distribution', commitmentId: 5n }),
    ],
    0n,
  )
  assert.equal(t.points.length, 2)
  assert.equal(t.points[1].kind, 'distribution')
  assert.equal(t.points[1].free, '1000')
  assert.equal(t.latest.free, '1000')
})
