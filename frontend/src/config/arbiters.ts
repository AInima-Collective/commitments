import { type Address } from 'viem'

import { getContractAddresses } from './contracts'
import { anvil } from './anvil'

/** Sentinel id for the "you arbitrate this yourself" option. */
export const SELF_ARBITER_ID = 'self'

/**
 * A selectable arbiter in the create-commitment flow. The protocol lets any
 * address sit at `commitment.arbiter`; this curates the deployed reference
 * arbiters into a short, explained list so the choice carries a plain-language
 * trust assumption instead of a bare address.
 */
export interface ArbiterDescriptor {
  /** Stable id used as the `<Select>` option value. `'self'` is the sentinel. */
  id: string
  /** On-chain address. `undefined` for the self entry — resolved to the
   *  connected wallet at the call site (config can't see the wallet). */
  address: Address | undefined
  name: string
  /** Mechanism name from the profile; absent for the self entry. */
  mechanism?: string
  /** One-line, plain-language trust assumption shown under the picker. */
  trustAssumption: string
  recommended?: boolean
}

export type ConfiguredArbiterMechanism =
  | 'direct'
  | 'manual'
  | 'optimistic-insurance'
  | 'optimistic-mutual'
  | 'attestation'
  | 'two-tier'

/** Trusted chain-configuration classification; live capability bits never set this. */
export interface ConfiguredArbiterProfile {
  address: Address
  displayName: string
  mechanism: string
  mechanismId: ConfiguredArbiterMechanism
  decisionSummary: string
  contestKind: 'known-mechanism' | 'published-policy' | 'no-generic-action'
  contestSummary: string
  expectedAddressForm?: 'EOA' | 'contract'
}

/** Curated `(chainId, address)` profile registry used before live introspection. */
export function getConfiguredArbiterProfiles(chainId: number): ConfiguredArbiterProfile[] {
  const env = getContractAddresses(chainId)
  const profiles: ConfiguredArbiterProfile[] = []
  const add = (entry: ConfiguredArbiterProfile | undefined) => {
    if (!entry) return
    if (!profiles.some((p) => p.address.toLowerCase() === entry.address.toLowerCase())) {
      profiles.push(entry)
    }
  }

  add(
    env.manualArbiter
      ? {
          address: env.manualArbiter,
          displayName: 'Manual arbiter',
          mechanism: 'Owner-controlled manual arbitration',
          mechanismId: 'manual',
          decisionSummary:
            'The configured contract owner reviews evidence and dispatches manager actions manually.',
          contestKind: 'published-policy',
          contestSummary:
            'Follow the arbiter’s publisher-provided policy when present. The manager delay itself exposes no generic committer challenge method.',
          expectedAddressForm: 'contract',
        }
      : undefined,
  )
  add(
    env.defaultArbiter
      ? {
          address: env.defaultArbiter,
          displayName: chainId === anvil.id ? 'Demo arbiter' : 'Shared arbiter',
          mechanism: chainId === anvil.id ? 'Single-key manual arbitration' : 'Configured manual arbitration',
          mechanismId: chainId === anvil.id ? 'direct' : 'manual',
          decisionSummary:
            chainId === anvil.id
              ? 'A configured development account decides and calls the manager directly.'
              : 'A configured controller reviews evidence and dispatches manager actions.',
          contestKind: 'no-generic-action',
          contestSummary:
            'Contact the configured arbiter under its published policy. The manager execution delay does not create a generic on-chain challenge transaction.',
          expectedAddressForm: chainId === anvil.id ? 'EOA' : undefined,
        }
      : undefined,
  )
  for (const optimistic of getOptimisticInsuranceArbiters(chainId)) {
    add({
      address: optimistic.address,
      displayName: optimistic.label,
      mechanism: 'Optimistic bonded claim game',
      mechanismId: 'optimistic-insurance',
      decisionSummary:
        'A bonded claim proposes a penalty; counter-assertions re-price the outcome until the optimistic answer period finalizes.',
      contestKind: 'known-mechanism',
      contestSummary:
        'Contest through the arbiter’s on-chain bonded claim process. The claim deadline is mechanism-specific and distinct from the manager execution delay.',
      expectedAddressForm: 'contract',
    })
  }
  const mutuals = [env.optimisticMutualArbiter, env.agentMutualArbiter]
  for (const address of mutuals) {
    add(
      address
        ? {
            address,
            displayName: 'Optimistic mutual arbiter',
            mechanism: 'Optimistic mutual-loss declaration',
            mechanismId: 'optimistic-mutual',
            decisionSummary:
              'A bonded loss declaration waits through the mutual’s mechanism-specific contest period before activation.',
            contestKind: 'known-mechanism',
            contestSummary:
              'Use the mutual loss process shown on the relevant coverage page; it is separate from a commitment forfeit execution delay.',
            expectedAddressForm: 'contract',
          }
        : undefined,
    )
  }
  add(
    env.attestationArbiter
      ? {
          address: env.attestationArbiter,
          displayName: 'Attestation arbiter',
          mechanism: 'Operator-service attestations',
          mechanismId: 'attestation',
          decisionSummary:
            'Anyone may relay an ordered action envelope after the configured operator-service quorum signs it.',
          contestKind: 'known-mechanism',
          contestSummary:
            'Challenge the evidence and requested action under the operator service’s signing policy before quorum signs; the contract exposes no separate generic appeal transaction.',
          expectedAddressForm: 'contract',
        }
      : undefined,
  )
  add(
    env.twoTierArbiter
      ? {
          address: env.twoTierArbiter,
          displayName: 'Two-tier arbitration court',
          mechanism: 'Primary ruling with human appeal',
          mechanismId: 'two-tier',
          decisionSummary:
            'A primary controller opens a ruling; an authorized party may appeal to the final controller before the appeal deadline.',
          contestKind: 'known-mechanism',
          contestSummary:
            'The committer or counterparty may appeal a primary ruling during the on-chain appeal window. The appeal controller must answer before the separate human-response deadline.',
          expectedAddressForm: 'contract',
        }
      : undefined,
  )
  return profiles
}

export function findConfiguredArbiterProfile(
  chainId: number,
  address: string | undefined,
): ConfiguredArbiterProfile | undefined {
  if (!address) return undefined
  const lower = address.toLowerCase()
  return getConfiguredArbiterProfiles(chainId).find((profile) => profile.address.toLowerCase() === lower)
}

/**
 * One deployed OptimisticInsuranceArbiter instance. Claim bonds must be
 * denominated in the market's payout asset, so each bond denomination gets
 * its own arbiter instance — never reuse a USDC-bonded arbiter for a DAI
 * market. The `label` names the bond denomination for pickers and claim
 * surfaces; `bondToken()` / `bondFloor()` are always read from the instance
 * itself, never assumed from config.
 */
export interface OptimisticInsuranceArbiterEntry {
  address: Address
  label: string
}

/**
 * Every configured OptimisticInsuranceArbiter instance on the connected
 * chain. The canonical (USDC-bonded) instance leads; per-denomination
 * instances follow. Claim gates (propose-claim affordance, /app/claims/:id)
 * must accept ANY entry here — a commitment's arbiter is matched against
 * this list, not against a single env address.
 */
export function getOptimisticInsuranceArbiters(chainId: number): OptimisticInsuranceArbiterEntry[] {
  const env = getContractAddresses(chainId)
  const out: OptimisticInsuranceArbiterEntry[] = []
  if (env.optimisticInsuranceArbiter) {
    out.push({ address: env.optimisticInsuranceArbiter, label: 'Optimistic insurance (USDC bonds)' })
  }
  if (env.daiOptimisticArbiter) {
    out.push({ address: env.daiOptimisticArbiter, label: 'Optimistic insurance (DAI bonds)' })
  }
  return out
}

/** Case-insensitive lookup into {@link getOptimisticInsuranceArbiters}. */
export function findOptimisticInsuranceArbiter(
  chainId: number,
  address: string | undefined,
): OptimisticInsuranceArbiterEntry | undefined {
  if (!address) return undefined
  const lower = address.toLowerCase()
  return getOptimisticInsuranceArbiters(chainId).find((a) => a.address.toLowerCase() === lower)
}

/**
 * Arbiter list for the create-commitment picker: the `self` option first and
 * recommended, then every configured profile from
 * {@link getConfiguredArbiterProfiles}, so the picker and the profile pages
 * describe an address the same way. Mutual arbiters are left out: a commitment
 * reaches one by joining a mutual, not by naming it here.
 */
export function getArbiterRegistry(chainId: number): ArbiterDescriptor[] {
  const self: ArbiterDescriptor = {
    id: SELF_ARBITER_ID,
    address: undefined,
    name: 'You arbitrate this yourself',
    trustAssumption:
      'You decide the outcome. The counterparty must trust you directly — best for self-imposed or reputation-backed commitments.',
    recommended: true,
  }
  const configured = getConfiguredArbiterProfiles(chainId)
    .filter((profile) => profile.mechanismId !== 'optimistic-mutual')
    .map((profile) => ({
      id: profile.address,
      address: profile.address,
      name: profile.displayName,
      mechanism: profile.mechanism,
      trustAssumption: profile.decisionSummary,
    }))
  return [self, ...configured]
}

/** `<Select>`-shaped options for the arbiter picker. */
export function getArbiterOptions(chainId: number): { value: string; label: string }[] {
  return getArbiterRegistry(chainId).map((a) => ({
    value: a.id,
    label: a.recommended ? `${a.name} (recommended)` : `${a.name} · ${a.mechanism}`,
  }))
}

/** Look up a descriptor by id (for rendering the selected trust assumption). */
export function getArbiterDescriptor(chainId: number, id: string): ArbiterDescriptor | undefined {
  return getArbiterRegistry(chainId).find((a) => a.id === id)
}

/**
 * Resolve a picked arbiter id to its on-chain address. The `self` sentinel
 * resolves to the connected wallet; an unknown id resolves to `undefined`.
 */
export function resolveArbiterAddress(
  chainId: number,
  id: string,
  connectedAddress: Address | undefined,
): Address | undefined {
  if (id === SELF_ARBITER_ID) return connectedAddress
  return getArbiterRegistry(chainId).find((a) => a.id === id)?.address
}
