import { afterEach, describe, expect, it, vi } from 'vitest'
import { type Address } from 'viem'

import { findKnownAddress, getKnownAddresses } from '../contracts'
import { anvil } from '../anvil'

const CHAIN = anvil.id
const BENEFICIARY = '0x70e0bA845a1A0F2DA3359C97E0285013525FFC49' as Address
const AGENT_VAULT = '0x0DB1D0Cfcba97F7Dc5AF76CFEc1a646C33Cd9297' as Address
const CONDUIT = '0x927B167526bAbB9be047421db732C663a0b77B11' as Address

describe('getKnownAddresses', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('is empty when the periphery envs are unset', () => {
    // The vitest env inherits .env.local — stub to empty to model "unset".
    vi.stubEnv('VITE_AGENT_VAULT_BENEFICIARY_ADDRESS', '')
    vi.stubEnv('VITE_VAULT_COVER_CONDUIT_ADDRESS', '')
    expect(getKnownAddresses(CHAIN)).toEqual([])
    expect(findKnownAddress(CHAIN, BENEFICIARY)).toBeUndefined()
  })

  it('labels the cover conduit and links to the covered vault', () => {
    vi.stubEnv('VITE_AGENT_VAULT_BENEFICIARY_ADDRESS', '')
    vi.stubEnv('VITE_VAULT_COVER_CONDUIT_ADDRESS', CONDUIT)
    vi.stubEnv('VITE_AGENT_VAULT_ADDRESS', AGENT_VAULT)
    const known = findKnownAddress(CHAIN, CONDUIT.toLowerCase())
    expect(known?.label).toBe('Vault cover conduit (automatic)')
    expect(known?.href).toBe(`/app/vaults/${AGENT_VAULT}`)
    expect(known?.description).toMatch(/VaultCoverConduit/)
  })

  it('labels the restitution beneficiary and links to the protected vault', () => {
    vi.stubEnv('VITE_AGENT_VAULT_BENEFICIARY_ADDRESS', BENEFICIARY)
    vi.stubEnv('VITE_AGENT_VAULT_ADDRESS', AGENT_VAULT)
    const known = findKnownAddress(CHAIN, BENEFICIARY.toLowerCase())
    expect(known?.label).toBe('Vault depositors (restitution)')
    expect(known?.href).toBe(`/app/vaults/${AGENT_VAULT}`)
    expect(known?.description).toMatch(/ForfeitDonationBeneficiary/)
  })

  it('omits the vault link when only the beneficiary is configured', () => {
    vi.stubEnv('VITE_AGENT_VAULT_BENEFICIARY_ADDRESS', BENEFICIARY)
    vi.stubEnv('VITE_AGENT_VAULT_ADDRESS', '')
    const known = findKnownAddress(CHAIN, BENEFICIARY)
    expect(known?.label).toBe('Vault depositors (restitution)')
    expect(known?.href).toBeUndefined()
  })

  it('returns undefined for unknown or missing addresses', () => {
    vi.stubEnv('VITE_AGENT_VAULT_BENEFICIARY_ADDRESS', BENEFICIARY)
    expect(findKnownAddress(CHAIN, undefined)).toBeUndefined()
    expect(findKnownAddress(CHAIN, '0x0000000000000000000000000000000000000001')).toBeUndefined()
  })
})
