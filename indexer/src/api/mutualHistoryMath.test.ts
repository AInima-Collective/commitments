/**
 * Unit tests for the mutual history fold.
 *
 * Run: node --experimental-strip-types --test src/api/mutualHistoryMath.test.ts
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { DAY, foldMutualHistory, type BindingRow, type StateRow } from './mutualHistoryMath.ts'

const E18 = 10n ** 18n
// Day 10 at noon; a 3-day window covers days 8, 9 and 10.
const NOW = 10n * DAY + 43_200n
const day = (d: bigint, s = 0n) => d * DAY + s

function state(over: Partial<StateRow> & { blockTimestamp: bigint }): StateRow {
  return {
    totalShares: 1_000n * E18,
    activeCover: 1_000n * E18,
    cumulativeLoss: 0n,
    rewardRate: 0n,
    periodFinish: 0n,
    ...over,
  }
}

test('an empty mutual is null every day', () => {
  const points = foldMutualHistory([], [], NOW, 3)
  assert.equal(points.length, 3)
  assert.deepEqual(points.map((p) => p.date), ['1970-01-09', '1970-01-10', '1970-01-11'])
  for (const p of points) {
    assert.equal(p.premiumAprBps, null)
    assert.equal(p.capital, null)
    assert.equal(p.coverSold, null)
  }
  // Past days sample their last second; today samples now.
  assert.equal(points[0].t, (day(9n) - 1n).toString())
  assert.equal(points[2].t, NOW.toString())
})

test('a gap before the first row stays null, then the row carries forward', () => {
  const points = foldMutualHistory([state({ blockTimestamp: day(9n, 100n) })], [], NOW, 3)
  assert.equal(points[0].capital, null)
  assert.equal(points[1].capital, (1_000n * E18).toString())
  assert.equal(points[2].capital, (1_000n * E18).toString())
})

test('the last row before the window fills the first day', () => {
  const points = foldMutualHistory([state({ blockTimestamp: day(2n) })], [], NOW, 3)
  assert.equal(points[0].capital, (1_000n * E18).toString())
})

test('a stream that expires mid-window drops APR to 0 with no new row', () => {
  // 1e18 per second over 1000e18 cover: 31_536_000 × 1e4 / 1000 = 315_360_000 bps.
  const row = state({ blockTimestamp: day(7n), rewardRate: E18, periodFinish: day(9n, 500n) })
  const points = foldMutualHistory([row], [], NOW, 3)
  assert.equal(points[0].premiumAprBps, '315360000')
  assert.equal(points[1].premiumAprBps, '0')
  assert.equal(points[2].premiumAprBps, '0')
})

test('APR is null while active cover is 0', () => {
  const row = state({ blockTimestamp: day(8n), activeCover: 0n, rewardRate: E18, periodFinish: day(20n) })
  assert.equal(foldMutualHistory([row], [], NOW, 1)[0].premiumAprBps, null)
})

test('a loss mid-window cuts capital from that day on', () => {
  const rows = [
    state({ blockTimestamp: day(7n) }),
    state({ blockTimestamp: day(9n, 3_600n), cumulativeLoss: E18 / 4n }),
  ]
  const points = foldMutualHistory(rows, [], NOW, 3)
  assert.deepEqual(
    points.map((p) => p.capital),
    [(1_000n * E18).toString(), (750n * E18).toString(), (750n * E18).toString()],
  )
})

test('several rows in one day: the last at or before the sample wins', () => {
  const rows = [
    state({ blockTimestamp: day(10n, 100n), totalShares: 1n * E18 }),
    state({ blockTimestamp: day(10n, 200n), totalShares: 2n * E18 }),
    // After now: not yet visible.
    state({ blockTimestamp: NOW + 1n, totalShares: 3n * E18 }),
  ]
  const [p] = foldMutualHistory(rows, [], NOW, 1)
  assert.equal(p.capital, (2n * E18).toString())
})

test('cover sold counts bindings in force at the sample instant', () => {
  const bindings: BindingRow[] = [
    // In force days 8–10.
    { notional: 100n, createdAt: day(8n), expiry: day(20n), expiredAt: null },
    // Expires during day 9: counted day 8 only.
    { notional: 10n, createdAt: day(8n), expiry: day(9n, 10n), expiredAt: null },
    // Bound on day 9.
    { notional: 1n, createdAt: day(9n, 5n), expiry: day(20n), expiredAt: null },
  ]
  const points = foldMutualHistory([state({ blockTimestamp: day(1n) })], bindings, NOW, 3)
  assert.deepEqual(points.map((p) => p.coverSold), ['110', '101', '101'])
})
