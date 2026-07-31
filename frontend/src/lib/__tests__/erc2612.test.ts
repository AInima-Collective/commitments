import { describe, expect, it } from 'vitest'
import { buildPermitTypedData, PERMIT_TYPES } from '../erc2612'

const OWNER = '0x1111111111111111111111111111111111111111' as const
const SPENDER = '0x2222222222222222222222222222222222222222' as const

describe('buildPermitTypedData', () => {
  const domain = {
    name: 'USD Coin',
    version: '1',
    chainId: 10,
    verifyingContract: '0x3333333333333333333333333333333333333333' as const,
  }

  it('produces an EIP-2612 Permit payload with the fixed field order', () => {
    const td = buildPermitTypedData({
      domain,
      owner: OWNER,
      spender: SPENDER,
      value: 1_000_000n,
      nonce: 7n,
      deadline: 9_999n,
    })

    expect(td.primaryType).toBe('Permit')
    expect(td.types).toBe(PERMIT_TYPES)
    expect(td.types.Permit.map((f) => f.name)).toEqual([
      'owner',
      'spender',
      'value',
      'nonce',
      'deadline',
    ])
    expect(td.domain).toEqual(domain)
    expect(td.message).toEqual({
      owner: OWNER,
      spender: SPENDER,
      value: 1_000_000n,
      nonce: 7n,
      deadline: 9_999n,
    })
  })

  it('carries the resolved domain verbatim (e.g. USDC-style version "2")', () => {
    const td = buildPermitTypedData({
      domain: { ...domain, version: '2' },
      owner: OWNER,
      spender: SPENDER,
      value: 0n,
      nonce: 0n,
      deadline: 1n,
    })
    expect(td.domain.version).toBe('2')
  })
})
