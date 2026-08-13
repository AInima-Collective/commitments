import { describe, expect, it } from 'vitest'
import { type Address } from 'viem'

import { buildArbiterProfile, type ArbiterIntrospection } from '../arbiterProfile'

const ADDRESS = '0x1111111111111111111111111111111111111111' as Address
const MANAGER = '0x2222222222222222222222222222222222222222' as Address
const ok = <T,>(value: T) => ({ status: 'success' as const, value })
const failed = () => ({ status: 'failed' as const, error: 'rpc unavailable' })
const notApplicable = () => ({ status: 'not-applicable' as const })
const notDeclared = () => ({ status: 'not-declared' as const })
const reads = (overrides: Partial<ArbiterIntrospection> = {}): ArbiterIntrospection => ({
  code: ok('0x6000' as `0x${string}`),
  interfaceSupport: ok(true),
  reportedManager: ok(MANAGER),
  capabilities: ok(3n),
  metadataURI: ok('ipfs://policy'),
  ...overrides,
})

describe('buildArbiterProfile', () => {
  it('classifies an EOA without pretending it supports IArbiter', () => {
    const profile = buildArbiterProfile({
      address: ADDRESS,
      expectedManager: MANAGER,
      introspection: reads({
        code: ok(undefined),
        interfaceSupport: notApplicable(),
        reportedManager: notApplicable(),
        capabilities: notApplicable(),
        metadataURI: notApplicable(),
      }),
    })
    expect(profile.addressForm).toBe('EOA')
    expect(profile.interfaceSupport).toBe('unsupported')
    expect(profile.mechanism).toBe('Direct-address arbitration')
    expect(profile.readFailures).toEqual([])
  })

  it('uses trusted configuration before live mechanism guesses', () => {
    const profile = buildArbiterProfile({
      address: ADDRESS,
      expectedManager: MANAGER,
      configured: {
        address: ADDRESS,
        displayName: 'Configured court',
        mechanism: 'Two-tier court',
        mechanismId: 'manual',
        decisionSummary: 'Configured summary',
        contestKind: 'known-mechanism',
        contestSummary: 'Configured appeal',
        expectedAddressForm: 'contract',
      },
      introspection: reads(),
    })
    expect(profile.mechanism).toBe('Two-tier court')
    expect(profile.mechanismVerification).toBe('curated deployment')
  })

  it('retains matching manager data and initiate/cancel declarations for a configured optimistic arbiter', () => {
    const profile = buildArbiterProfile({
      address: ADDRESS,
      expectedManager: MANAGER,
      configured: {
        address: ADDRESS,
        displayName: 'Optimistic insurance',
        mechanism: 'Optimistic bonded claim game',
        mechanismId: 'optimistic-insurance',
        decisionSummary: 'Bonded assertions resolve optimistically.',
        contestKind: 'known-mechanism',
        contestSummary: 'Dispute through the bonded claim process.',
        expectedAddressForm: 'contract',
      },
      introspection: reads({ capabilities: ok(3n) }),
    })

    expect(profile.managerMatches).toBe(true)
    expect(profile.mechanismId).toBe('optimistic-insurance')
    expect(profile.declaredCapabilities.map((capability) => capability.id)).toEqual([
      'initiate-forfeit',
      'cancel-forfeit',
    ])
  })

  it('warns when a trusted contract deployment does not expose its expected interface', () => {
    const profile = buildArbiterProfile({
      address: ADDRESS,
      expectedManager: MANAGER,
      configured: {
        address: ADDRESS,
        displayName: 'Configured court',
        mechanism: 'Two-tier court',
        mechanismId: 'two-tier',
        decisionSummary: 'Configured summary',
        contestKind: 'known-mechanism',
        contestSummary: 'Configured appeal',
        expectedAddressForm: 'contract',
      },
      introspection: reads({
        interfaceSupport: notDeclared(),
        reportedManager: notDeclared(),
        capabilities: notDeclared(),
        metadataURI: notDeclared(),
      }),
    })
    expect(profile.readFailures).toContain('IArbiter interface declaration (expected by trusted configuration)')
  })

  it('keeps a compliant but unrecognized arbiter custom', () => {
    const profile = buildArbiterProfile({ address: ADDRESS, expectedManager: MANAGER, introspection: reads() })
    expect(profile.interfaceSupport).toBe('supported')
    expect(profile.mechanism).toBe('Custom / unrecognized')
    expect(profile.mechanismVerification).toBe('self-declared')
  })

  it('degrades a legacy contract to a useful unrecognized profile', () => {
    const profile = buildArbiterProfile({
      address: ADDRESS,
      expectedManager: MANAGER,
      introspection: reads({
        interfaceSupport: ok(false),
        reportedManager: notDeclared(),
        capabilities: notDeclared(),
        metadataURI: notDeclared(),
      }),
    })
    expect(profile.addressForm).toBe('contract')
    expect(profile.interfaceSupport).toBe('unsupported')
    expect(profile.mechanism).toBe('Legacy / custom contract')
    expect(profile.readFailures).toEqual([])
  })

  it('lets every introspection call fail independently', () => {
    const profile = buildArbiterProfile({
      address: ADDRESS,
      expectedManager: MANAGER,
      introspection: {
        code: failed(),
        interfaceSupport: failed(),
        reportedManager: failed(),
        capabilities: failed(),
        metadataURI: failed(),
      },
    })
    expect(profile.addressForm).toBe('unknown')
    expect(profile.readFailures).toHaveLength(5)
  })

  it('surfaces a reported-manager mismatch', () => {
    const profile = buildArbiterProfile({
      address: ADDRESS,
      expectedManager: MANAGER,
      introspection: reads({ reportedManager: ok(ADDRESS) }),
    })
    expect(profile.managerMatches).toBe(false)
  })

  it('treats an empty metadata URI as an explicit absence', () => {
    const profile = buildArbiterProfile({
      address: ADDRESS,
      expectedManager: MANAGER,
      introspection: reads({ metadataURI: ok('') }),
    })
    expect(profile.metadataURI).toBeUndefined()
    expect(profile.metadataTrust).toBe('absent')
  })

  it('retains unknown future capability bits', () => {
    const futureBit = 1n << 200n
    const profile = buildArbiterProfile({
      address: ADDRESS,
      expectedManager: MANAGER,
      introspection: reads({ capabilities: ok(1n | futureBit) }),
    })
    expect(profile.declaredCapabilities.map((capability) => capability.id)).toEqual(['initiate-forfeit'])
    expect(profile.unknownCapabilityBits).toBe(futureBit)
  })
})
