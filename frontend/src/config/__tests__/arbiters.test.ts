import { afterEach, describe, expect, it, vi } from 'vitest'
import { type Address } from 'viem'

import {
  SELF_ARBITER_ID,
  findOptimisticInsuranceArbiter,
  getArbiterDescriptor,
  getArbiterOptions,
  getArbiterRegistry,
  getConfiguredArbiterProfiles,
  getOptimisticInsuranceArbiters,
  resolveArbiterAddress,
} from '../arbiters'
import { anvil } from '../anvil'

const CHAIN = anvil.id
const CONNECTED = '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' as Address

describe('getArbiterRegistry', () => {
  const reg = getArbiterRegistry(CHAIN)

  it('always offers self first, recommended, with no address', () => {
    expect(reg[0].id).toBe(SELF_ARBITER_ID)
    expect(reg[0].recommended).toBe(true)
    expect(reg[0].address).toBeUndefined()
  })

  it('every entry carries a name and a non-empty trust assumption', () => {
    for (const a of reg) {
      expect(a.name.length).toBeGreaterThan(0)
      expect(a.trustAssumption.length).toBeGreaterThan(0)
    }
  })

  it('drops unconfigured env arbiters (only self when env is empty)', () => {
    // In the test env the VITE_*_ARBITER addresses are unset, so the registry
    // collapses to the self entry. Configured deployments append the rest.
    expect(reg.every((a) => a.id === SELF_ARBITER_ID || !!a.address)).toBe(true)
  })
})

describe('getArbiterOptions', () => {
  it('labels the recommended self option', () => {
    const opts = getArbiterOptions(CHAIN)
    expect(opts[0].value).toBe(SELF_ARBITER_ID)
    expect(opts[0].label).toMatch(/recommended/i)
  })
})

describe('resolveArbiterAddress', () => {
  it('resolves the self sentinel to the connected wallet', () => {
    expect(resolveArbiterAddress(CHAIN, SELF_ARBITER_ID, CONNECTED)).toBe(CONNECTED)
  })

  it('returns undefined for an unknown id', () => {
    expect(resolveArbiterAddress(CHAIN, '0xdeadbeef', CONNECTED)).toBeUndefined()
  })
})

describe('getArbiterDescriptor', () => {
  it('finds the self descriptor', () => {
    expect(getArbiterDescriptor(CHAIN, SELF_ARBITER_ID)?.recommended).toBe(true)
  })
})

describe('getOptimisticInsuranceArbiters', () => {
  const USDC_ARBITER = '0xCACE1B78160AE76398F486c8a18044da0d66d86D' as Address
  const DAI_ARBITER = '0xD5ac451B0c50B9476107823Af206eD814a2e2580' as Address

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('is empty when no optimistic arbiter env is configured', () => {
    // The vitest env inherits .env.local — stub to empty to model "unset".
    vi.stubEnv('VITE_OPTIMISTIC_INSURANCE_ARBITER_ADDRESS', '')
    vi.stubEnv('VITE_DAI_OPTIMISTIC_ARBITER_ADDRESS', '')
    expect(getOptimisticInsuranceArbiters(CHAIN)).toEqual([])
    expect(findOptimisticInsuranceArbiter(CHAIN, USDC_ARBITER)).toBeUndefined()
  })

  it('lists every configured instance, canonical (USDC) first', () => {
    vi.stubEnv('VITE_OPTIMISTIC_INSURANCE_ARBITER_ADDRESS', USDC_ARBITER)
    vi.stubEnv('VITE_DAI_OPTIMISTIC_ARBITER_ADDRESS', DAI_ARBITER)
    const list = getOptimisticInsuranceArbiters(CHAIN)
    expect(list.map((a) => a.address)).toEqual([USDC_ARBITER, DAI_ARBITER])
    expect(list.every((a) => a.label.length > 0)).toBe(true)
  })

  it('matches a commitment arbiter case-insensitively', () => {
    vi.stubEnv('VITE_OPTIMISTIC_INSURANCE_ARBITER_ADDRESS', USDC_ARBITER)
    vi.stubEnv('VITE_DAI_OPTIMISTIC_ARBITER_ADDRESS', DAI_ARBITER)
    // Indexer rows carry lowercase addresses — the gate must still match.
    expect(findOptimisticInsuranceArbiter(CHAIN, DAI_ARBITER.toLowerCase())?.address).toBe(DAI_ARBITER)
    expect(findOptimisticInsuranceArbiter(CHAIN, undefined)).toBeUndefined()
    expect(findOptimisticInsuranceArbiter(CHAIN, '0x0000000000000000000000000000000000000001')).toBeUndefined()
  })

  it('appends each instance to the create-flow arbiter registry', () => {
    vi.stubEnv('VITE_OPTIMISTIC_INSURANCE_ARBITER_ADDRESS', USDC_ARBITER)
    vi.stubEnv('VITE_DAI_OPTIMISTIC_ARBITER_ADDRESS', DAI_ARBITER)
    const optimistic = getArbiterRegistry(CHAIN).filter((a) => a.mechanism === 'Optimistic bonded claim game')
    expect(optimistic.map((a) => a.address)).toEqual([USDC_ARBITER, DAI_ARBITER])
  })
})

describe('trusted arbiter mechanism profiles', () => {
  const ANVIL_ACCOUNT_1 = '0x70997970C51812dc3A010C7d01b50e0d17dc79C8' as Address
  const MANUAL_ARBITER = '0x1111111111111111111111111111111111111111' as Address
  const OPTIMISTIC_ARBITER = '0x2222222222222222222222222222222222222222' as Address

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('keeps the Anvil demo EOA distinct from deployed Manual and optimistic mechanisms', () => {
    vi.stubEnv('VITE_DEFAULT_ARBITER_ADDRESS', ANVIL_ACCOUNT_1)
    vi.stubEnv('VITE_MANUAL_ARBITER_ADDRESS', MANUAL_ARBITER)
    vi.stubEnv('VITE_OPTIMISTIC_INSURANCE_ARBITER_ADDRESS', OPTIMISTIC_ARBITER)

    const profiles = getConfiguredArbiterProfiles(CHAIN)
    expect(profiles.find((entry) => entry.address === ANVIL_ACCOUNT_1)).toEqual(
      expect.objectContaining({ mechanismId: 'direct', expectedAddressForm: 'EOA' }),
    )
    expect(profiles.find((entry) => entry.address === MANUAL_ARBITER)).toEqual(
      expect.objectContaining({ mechanismId: 'manual', expectedAddressForm: 'contract' }),
    )
    expect(profiles.find((entry) => entry.address === OPTIMISTIC_ARBITER)).toEqual(
      expect.objectContaining({ mechanismId: 'optimistic-insurance', expectedAddressForm: 'contract' }),
    )
  })

  it('feeds the create-form picker from the same profiles, without mutual arbiters', () => {
    const MUTUAL_ARBITER = '0x3333333333333333333333333333333333333333' as Address
    vi.stubEnv('VITE_DEFAULT_ARBITER_ADDRESS', ANVIL_ACCOUNT_1)
    vi.stubEnv('VITE_MANUAL_ARBITER_ADDRESS', MANUAL_ARBITER)
    vi.stubEnv('VITE_OPTIMISTIC_MUTUAL_ARBITER_ADDRESS', MUTUAL_ARBITER)

    const demo = getConfiguredArbiterProfiles(CHAIN).find((entry) => entry.address === ANVIL_ACCOUNT_1)
    expect(getArbiterDescriptor(CHAIN, ANVIL_ACCOUNT_1)).toEqual(
      expect.objectContaining({ name: demo?.displayName, trustAssumption: demo?.decisionSummary }),
    )
    expect(resolveArbiterAddress(CHAIN, MANUAL_ARBITER, CONNECTED)).toBe(MANUAL_ARBITER)
    expect(getArbiterDescriptor(CHAIN, MUTUAL_ARBITER)).toBeUndefined()
  })
})
