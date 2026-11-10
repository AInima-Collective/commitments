/**
 * Unit tests for the vault snapshot math (`snapshotMath.ts`).
 *
 * Run: node --experimental-strip-types --test src/api/snapshot.test.ts
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  APY_7D_SECONDS,
  annualizedBps,
  periodicStepSeconds,
  rollingApyBps,
  sharePriceOf,
} from './snapshotMath.ts'

const DAY = 24n * 60n * 60n
const YEAR = 365n * DAY
const WEEK = 7n * DAY
const WAD = 10n ** 18n

test('annualizedBps: 4-day gap at +5% share price yields a positive bps', () => {
  const past = WAD // 1.0
  const cur = (past * 105n) / 100n // 1.05, +5% over 4 days
  const bps = annualizedBps(cur, past, 4n * DAY, WEEK)
  assert.notEqual(bps, null)
  // +5% over 4 days annualizes to a very large APY; sanity-check it's substantial.
  assert.ok((bps as number) > 10_000, `expected APY > 100%, got ${bps}`)
})

test('annualizedBps: 1-hour gap returns null (below the half-window guard)', () => {
  const past = WAD
  const cur = (past * 105n) / 100n
  assert.equal(annualizedBps(cur, past, 3_600n, WEEK), null)
})

test('annualizedBps: exactly-1%-over-a-year annualizes to ~100 bps', () => {
  const past = WAD
  const cur = (past * 101n) / 100n
  const bps = annualizedBps(cur, past, YEAR, YEAR)
  assert.notEqual(bps, null)
  assert.ok(Math.abs((bps as number) - 100) <= 1, `expected ~100 bps, got ${bps}`)
})

test('rollingApyBps: null without a reference, null under half the window, set at half', () => {
  const now = 1_700_000_000n
  const cur = (WAD * 101n) / 100n
  assert.equal(rollingApyBps(now, cur, undefined, APY_7D_SECONDS), null)
  const justUnder = { timestamp: now - BigInt(APY_7D_SECONDS / 2) + 1n, sharePrice: WAD }
  assert.equal(rollingApyBps(now, cur, justUnder, APY_7D_SECONDS), null)
  const half = { timestamp: now - BigInt(APY_7D_SECONDS / 2), sharePrice: WAD }
  assert.ok((rollingApyBps(now, cur, half, APY_7D_SECONDS) as number) > 0)
})

test('sharePriceOf: assets per 1e18 shares, 1e18 for an empty vault', () => {
  assert.equal(sharePriceOf(0n, 0n), WAD)
  // 6-decimal asset behind 18-decimal shares: 1,000 USDC over 1,000 shares.
  assert.equal(sharePriceOf(1_000n * 10n ** 6n, 1_000n * WAD), 10n ** 6n)
  assert.equal(sharePriceOf(3n * WAD, 2n * WAD), (3n * WAD) / 2n)
})

test('periodicStepSeconds: hourly up to 7 days, daily beyond (at most a few hundred points)', () => {
  assert.equal(periodicStepSeconds(1), 3_600)
  assert.equal(periodicStepSeconds(7), 3_600)
  assert.equal(periodicStepSeconds(8), 86_400)
  assert.equal(periodicStepSeconds(90), 86_400)
  for (const days of [1, 7, 8, 30, 90]) {
    assert.ok((days * 86_400) / periodicStepSeconds(days) <= 200)
  }
})
