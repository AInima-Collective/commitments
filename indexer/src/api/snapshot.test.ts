/**
 * Unit tests for the snapshot clock + APY math.
 *
 * `takeSnapshot` itself imports `ponder:api` / `ponder:schema` (virtual modules
 * only resolvable inside the ponder runtime + a live pglite DB), so it can't be
 * loaded under plain `node --test`. The load-bearing logic — which clock "now"
 * anchors to, and the annualized-APY guard — is extracted into `snapshotMath.ts`
 * with no ponder deps, and exercised directly here.
 *
 * The core regression this guards: "now" must default to the on-chain block
 * timestamp (not wall clock) so an anvil `evm_increaseTime` warp — which moves
 * the share price but not the wall clock — produces real APY.
 *
 * Run: node --experimental-strip-types --test src/api/snapshot.test.ts
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { annualizedBps, resolveNowSeconds } from './snapshotMath.ts'

const DAY = 24n * 60n * 60n
const YEAR = 365n * DAY
const WEEK = 7n * DAY

test('resolveNowSeconds: explicit nowSeconds override wins over the chain clock', async () => {
  const now = await resolveNowSeconds({
    nowSeconds: 1_000n,
    publicClient: { getBlock: async () => ({ timestamp: 9_999n }) },
  })
  assert.equal(now, 1_000n)
})

test('resolveNowSeconds: defaults to the on-chain block timestamp', async () => {
  // No nowSeconds → read the chain clock. This is what lets an evm_increaseTime
  // warp drive the elapsed-time window that APY divides by.
  const now = await resolveNowSeconds({
    publicClient: { getBlock: async () => ({ timestamp: 1_700_000_000n }) },
  })
  assert.equal(now, 1_700_000_000n)
})

test('resolveNowSeconds: silently falls back to wall clock when getBlock throws', async () => {
  const before = BigInt(Math.floor(Date.now() / 1000))
  const now = await resolveNowSeconds({
    publicClient: {
      getBlock: async () => {
        throw new Error('flaky RPC')
      },
    },
  })
  const after = BigInt(Math.floor(Date.now() / 1000))
  assert.ok(now >= before && now <= after, `wall-clock fallback ${now} not in [${before}, ${after}]`)
})

test('annualizedBps: 4-day gap at +5% share price yields a positive bps', () => {
  const past = 10n ** 18n // 1.0
  const cur = (past * 105n) / 100n // 1.05, +5% over 4 days
  const bps = annualizedBps(cur, past, 4n * DAY, WEEK)
  assert.notEqual(bps, null)
  assert.ok((bps as number) > 0, `expected positive bps, got ${bps}`)
  // +5% over 4 days annualizes to a very large APY; sanity-check it's substantial.
  assert.ok((bps as number) > 10_000, `expected APY > 100%, got ${bps}`)
})

test('annualizedBps: 1-hour gap returns null (below the half-window guard)', () => {
  const past = 10n ** 18n
  const cur = (past * 105n) / 100n
  const bps = annualizedBps(cur, past, 3_600n, WEEK)
  assert.equal(bps, null)
})

test('annualizedBps: exactly-1%-over-a-year annualizes to ~100 bps', () => {
  const past = 10n ** 18n
  const cur = (past * 101n) / 100n
  const bps = annualizedBps(cur, past, YEAR, YEAR)
  assert.notEqual(bps, null)
  assert.ok(Math.abs((bps as number) - 100) <= 1, `expected ~100 bps, got ${bps}`)
})
