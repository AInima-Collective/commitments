import { describe, expect, it } from 'vitest'
import { type Address } from 'viem'

import { buildJoinMutualParams, mutualLifecycle } from '../mutual'
import { ZERO_HASH } from '../../utils/metadataForm'

describe('mutualLifecycle', () => {
  it('ranks terminated over a pending loss over active', () => {
    expect(mutualLifecycle({ terminal: true, active: true, hasPendingLoss: true })).toBe('terminated')
    expect(mutualLifecycle({ terminal: false, active: true, hasPendingLoss: true })).toBe('loss-pending')
    expect(mutualLifecycle({ terminal: false, active: true })).toBe('active')
    expect(mutualLifecycle({ terminal: false, active: false })).toBe('pending')
  })
})

describe('buildJoinMutualParams', () => {
  it('posts the amount fully forfeitable to the beneficiary until the term end', () => {
    const arbiter = '0x1111111111111111111111111111111111111111' as Address
    const beneficiary = '0x2222222222222222222222222222222222222222' as Address
    const numeraire = '0x3333333333333333333333333333333333333333' as Address
    const adapter = '0x4444444444444444444444444444444444444444' as Address
    const mutual = { arbiter, beneficiary, challengeWindow: 86_400n }
    expect(buildJoinMutualParams({ mutual, numeraire, adapter, amount: 5n, termEnd: 9n })).toEqual({
      arbiter,
      counterparty: beneficiary,
      token: numeraire,
      adapter,
      amount: 5n,
      maxPenaltyBps: 10_000,
      challengeWindow: 86_400n,
      expiresAt: 9n,
      strategies: [],
      metadataURI: '',
      metadataHash: ZERO_HASH,
    })
    expect(buildJoinMutualParams({ mutual, numeraire, adapter, amount: 5n, termEnd: undefined }).expiresAt).toBe(0n)
  })
})
