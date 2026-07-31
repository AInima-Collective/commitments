import { describe, expect, it } from 'vitest'

import {
  buildClaimableEntries,
  claimableEntryKey,
  sumUsd,
  usdForAmount,
  type ClaimableBindingRow,
  type ClaimableYieldEntry,
  type TokenValuation,
} from '../claimableYield'

const COMMITTER_A_LOWER = '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' as const
const COMMITTER_A_MIXED = '0xAAAaAAaAAaaAAAAaAAAAAaaAAAAAAAAAaAaaaAAa'
const STRAT_X_LOWER = '0x1111111111111111111111111111111111111111' as const
const STRAT_X_MIXED = '0x1111111111111111111111111111111111111111'.toUpperCase().replace('0X', '0x')
const STRAT_Y_LOWER = '0x2222222222222222222222222222222222222222' as const
const VAULT_LOWER = '0x3333333333333333333333333333333333333333' as const
const TOKEN_LOWER = '0x4444444444444444444444444444444444444444' as const

function binding(overrides: Partial<ClaimableBindingRow> = {}): ClaimableBindingRow {
  return {
    commitmentId: '1',
    strategy: STRAT_X_LOWER,
    committer: COMMITTER_A_LOWER,
    token: TOKEN_LOWER,
    vault: null,
    ...overrides,
  }
}

describe('buildClaimableEntries', () => {
  it('returns [] for empty inputs', () => {
    expect(buildClaimableEntries([], [])).toEqual([])
  })

  it('zips a binding with its pending amount', () => {
    const out = buildClaimableEntries([binding({ vault: VAULT_LOWER })], [100n])
    const expected: ClaimableYieldEntry[] = [
      {
        commitmentId: 1n,
        committer: COMMITTER_A_LOWER,
        amount: 100n,
        token: TOKEN_LOWER,
        vault: VAULT_LOWER,
        strategy: STRAT_X_LOWER,
        claimData: '0x',
      },
    ]
    expect(out).toEqual(expected)
  })

  it('drops rows whose pending is zero or undefined', () => {
    const out = buildClaimableEntries(
      [binding({ commitmentId: '1' }), binding({ commitmentId: '2' }), binding({ commitmentId: '3' })],
      [0n, undefined, 200n],
    )
    expect(out).toHaveLength(1)
    expect(out[0].commitmentId).toBe(3n)
  })

  it('keeps one row per (commitment, strategy) for multi-strategy commitments', () => {
    const out = buildClaimableEntries(
      [
        binding({ commitmentId: '7', strategy: STRAT_X_LOWER }),
        binding({ commitmentId: '7', strategy: STRAT_Y_LOWER }),
      ],
      [10n, 20n],
    )
    expect(out).toHaveLength(2)
    expect(claimableEntryKey(out[0])).not.toBe(claimableEntryKey(out[1]))
  })

  it('lowercases committer, strategy, vault, and token on output', () => {
    const out = buildClaimableEntries(
      [
        binding({
          committer: COMMITTER_A_MIXED,
          strategy: STRAT_X_MIXED,
          vault: VAULT_LOWER.toUpperCase().replace('0X', '0x'),
          token: TOKEN_LOWER.toUpperCase().replace('0X', '0x'),
        }),
      ],
      [1n],
    )
    expect(out[0].committer).toBe(COMMITTER_A_LOWER)
    expect(out[0].strategy).toBe(STRAT_X_LOWER)
    expect(out[0].vault).toBe(VAULT_LOWER)
    expect(out[0].token).toBe(TOKEN_LOWER)
  })

  it('preserves precision for very large pending values', () => {
    const huge = 999999999999999999999999n
    const out = buildClaimableEntries([binding()], [huge])
    expect(out[0].amount).toBe(huge)
    expect(typeof out[0].amount).toBe('bigint')
  })

  it('returns vault: undefined when the binding omits it', () => {
    const out = buildClaimableEntries([binding({ vault: null })], [5n])
    expect(out[0].vault).toBeUndefined()
  })
})

describe('claimableEntryKey', () => {
  it('combines commitmentId and lowercased strategy', () => {
    expect(claimableEntryKey({ commitmentId: 42n, strategy: STRAT_X_LOWER })).toBe(
      `42-${STRAT_X_LOWER}`,
    )
  })
})

describe('usdForAmount', () => {
  it('prices a raw ERC-20 by its own decimals + symbol price', () => {
    // 100 USDC (6 decimals) at $1.00 → $100.000000 (6-decimal USD bigint).
    const usdc: TokenValuation = { kind: 'direct', decimals: 6, priceUsd: 1 }
    expect(usdForAmount(100_000000n, usdc)).toBe(100_000000n)
  })

  it('prices a non-$1 raw ERC-20', () => {
    // 2 WETH (18 decimals) at $2,000 → $4,000.000000.
    const weth: TokenValuation = { kind: 'direct', decimals: 18, priceUsd: 2000 }
    expect(usdForAmount(2n * 10n ** 18n, weth)).toBe(4000_000000n)
  })

  it('converts a vault share to underlying before pricing (parity)', () => {
    // 1 whole cvUSDC share (15 decimals), 1 share == 1 USDC, USDC at $1.
    const cvusdc: TokenValuation = {
      kind: 'share',
      shareDecimals: 15,
      oneShareAssets: 1_000000n, // convertToAssets(1e15) = 1 USDC (6 decimals)
      assetDecimals: 6,
      priceUsd: 1,
    }
    expect(usdForAmount(10n ** 15n, cvusdc)).toBe(1_000000n)
  })

  it('reflects share appreciation in the USD value', () => {
    // After yield: 1 share == 1.10 USDC.
    const cvusdc: TokenValuation = {
      kind: 'share',
      shareDecimals: 15,
      oneShareAssets: 1_100000n,
      assetDecimals: 6,
      priceUsd: 1,
    }
    expect(usdForAmount(10n ** 15n, cvusdc)).toBe(1_100000n)
  })

  it('returns null when the price is unavailable', () => {
    const noPrice: TokenValuation = { kind: 'direct', decimals: 6, priceUsd: null }
    expect(usdForAmount(100_000000n, noPrice)).toBeNull()
  })

  it('returns null for an unknown (undefined) valuation', () => {
    expect(usdForAmount(100n, undefined)).toBeNull()
  })
})

describe('sumUsd', () => {
  it('sums a mixed-token list in USD — the only correct common denominator', () => {
    // 100 USDC ($100) + 1 cvUSDC share worth 1.10 USDC ($1.10) = $101.10.
    const usdc: TokenValuation = { kind: 'direct', decimals: 6, priceUsd: 1 }
    const cvusdc: TokenValuation = {
      kind: 'share',
      shareDecimals: 15,
      oneShareAssets: 1_100000n,
      assetDecimals: 6,
      priceUsd: 1,
    }
    const total = sumUsd([
      usdForAmount(100_000000n, usdc),
      usdForAmount(10n ** 15n, cvusdc),
    ])
    expect(total).toBe(101_100000n)
  })

  it('degrades the whole total to null if any row is unpriced', () => {
    expect(sumUsd([100_000000n, null, 5_000000n])).toBeNull()
  })

  it('returns 0 for an empty list', () => {
    expect(sumUsd([])).toBe(0n)
  })
})
