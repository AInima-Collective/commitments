import { type Address } from 'viem'

import type { ConfiguredArbiterProfile } from '../config/arbiters'

export const I_ARBITER_INTERFACE_ID = '0x6000eb97' as const

export const ARBITER_CAPABILITIES = [
  { bit: 0n, id: 'initiate-forfeit', label: 'Initiate forfeit' },
  { bit: 1n, id: 'cancel-forfeit', label: 'Cancel forfeit' },
  { bit: 2n, id: 'release-commitment', label: 'Release commitment' },
  { bit: 3n, id: 'forfeit-agreement', label: 'Forfeit agreement' },
  { bit: 4n, id: 'release-agreement', label: 'Release agreement' },
  { bit: 5n, id: 'settle-agreement', label: 'Settle agreement' },
  { bit: 6n, id: 'mutual-loss', label: 'Declare mutual loss' },
] as const

const KNOWN_CAPABILITY_MASK = ARBITER_CAPABILITIES.reduce(
  (mask, capability) => mask | (1n << capability.bit),
  0n,
)

export interface IndependentRead<T> {
  status: 'success' | 'error'
  value?: T
  error?: string
}

export interface ArbiterIntrospection {
  code: IndependentRead<`0x${string}` | undefined>
  interfaceSupport: IndependentRead<boolean>
  reportedManager: IndependentRead<Address>
  capabilities: IndependentRead<bigint>
  metadataURI: IndependentRead<string>
}

export interface DeclaredArbiterCapability {
  id: (typeof ARBITER_CAPABILITIES)[number]['id']
  label: string
  bit: bigint
}

export interface ArbiterProfile {
  address: Address
  addressForm: 'EOA' | 'contract' | 'unknown'
  interfaceSupport: 'supported' | 'unsupported' | 'unknown'
  reportedManager?: Address
  expectedManager?: Address
  managerMatches?: boolean
  declaredCapabilities: DeclaredArbiterCapability[]
  unknownCapabilityBits: bigint
  metadataURI?: string
  metadataTrust: 'publisher-provided' | 'absent' | 'unknown'
  mechanism: string
  mechanismVerification: 'curated deployment' | 'self-declared' | 'unrecognized'
  displayName: string
  decisionSummary: string
  contestKind: 'known-mechanism' | 'published-policy' | 'no-generic-action'
  contestSummary: string
  configured: boolean
  readFailures: string[]
}

/** Pure precedence/classification layer used by the hook and profile tests. */
export function buildArbiterProfile(input: {
  address: Address
  expectedManager?: Address
  configured?: ConfiguredArbiterProfile
  introspection: ArbiterIntrospection
}): ArbiterProfile {
  const { address, expectedManager, configured, introspection } = input
  const addressForm = configured?.expectedAddressForm ?? classifyAddressForm(introspection.code)
  const interfaceSupport =
    introspection.interfaceSupport.status === 'success'
      ? introspection.interfaceSupport.value
        ? 'supported'
        : 'unsupported'
      : addressForm === 'EOA'
        ? 'unsupported'
        : 'unknown'
  const reportedManager =
    introspection.reportedManager.status === 'success'
      ? introspection.reportedManager.value
      : undefined
  const managerMatches =
    reportedManager && expectedManager
      ? reportedManager.toLowerCase() === expectedManager.toLowerCase()
      : undefined
  const rawCapabilities =
    introspection.capabilities.status === 'success'
      ? (introspection.capabilities.value ?? 0n)
      : 0n
  const declaredCapabilities = ARBITER_CAPABILITIES.filter(
    (capability) => (rawCapabilities & (1n << capability.bit)) !== 0n,
  ).map((capability) => ({ ...capability }))
  const unknownCapabilityBits = rawCapabilities & ~KNOWN_CAPABILITY_MASK
  const metadataValue =
    introspection.metadataURI.status === 'success'
      ? introspection.metadataURI.value?.trim()
      : undefined
  const metadataTrust =
    introspection.metadataURI.status === 'error'
      ? 'unknown'
      : metadataValue
        ? 'publisher-provided'
        : 'absent'

  const defaultContest = metadataValue
    ? {
        contestKind: 'published-policy' as const,
        contestSummary:
          'Review the publisher-provided policy URI. The manager execution delay permits arbiter cancellation but exposes no generic committer challenge transaction.',
      }
    : {
        contestKind: 'no-generic-action' as const,
        contestSummary:
          'No generic on-chain contest action is exposed by the manager. Ask the arbiter about its decision process before relying on it.',
      }
  const configuredContest =
    configured?.contestKind === 'published-policy' && !metadataValue
      ? defaultContest
      : configured
        ? { contestKind: configured.contestKind, contestSummary: configured.contestSummary }
        : defaultContest

  return {
    address,
    addressForm,
    interfaceSupport,
    reportedManager,
    expectedManager,
    managerMatches,
    declaredCapabilities,
    unknownCapabilityBits,
    metadataURI: metadataValue || undefined,
    metadataTrust,
    mechanism: configured?.mechanism ?? (addressForm === 'unknown' ? 'Unknown' : 'Custom / unrecognized'),
    mechanismVerification: configured
      ? 'curated deployment'
      : interfaceSupport === 'supported'
        ? 'self-declared'
        : 'unrecognized',
    displayName: configured?.displayName ?? address,
    decisionSummary:
      configured?.decisionSummary ??
      (interfaceSupport === 'supported'
        ? 'This contract implements IArbiter and self-declares its manager authority, but its decision mechanism is not recognized by trusted chain configuration.'
        : addressForm === 'EOA'
          ? 'This externally owned account decides off chain and calls the manager directly. No contract policy can be introspected.'
          : addressForm === 'contract'
            ? 'This contract is named as arbiter, but its decision mechanism and generic IArbiter support are unrecognized.'
            : 'The arbiter address could not be classified from the current RPC response.'),
    contestKind: configuredContest.contestKind,
    contestSummary: configuredContest.contestSummary,
    configured: Boolean(configured),
    readFailures: Object.entries(introspection)
      .filter(([, result]) => result.status === 'error')
      .map(([name]) => name),
  }
}

function classifyAddressForm(
  code: IndependentRead<`0x${string}` | undefined>,
): ArbiterProfile['addressForm'] {
  if (code.status === 'error') return 'unknown'
  return !code.value || code.value === '0x' ? 'EOA' : 'contract'
}
