import { type Address } from 'viem'

import { getContractAddresses } from './contracts'
import type { MarketArbiterKind } from './marketOffers'

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
  kind: MarketArbiterKind
  /** One-line, plain-language trust assumption shown under the picker. */
  trustAssumption: string
  recommended?: boolean
}

/**
 * Human label for an arbiter kind. Also the single source of truth that fixes
 * the raw-enum print on the marketplace offer detail page.
 */
export const ARBITER_KIND_LABEL: Record<MarketArbiterKind, string> = {
  self: 'Self-arbitrated',
  eoa: 'Single key',
  multisig: 'Multisig',
  committee: 'Committee',
  service: 'Operator service',
  optimistic: 'Optimistic',
  zk: 'ZK-verified',
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
 * Curated arbiter list for the connected chain. The `self` option is always
 * first and recommended; the deployed reference arbiters are appended in
 * descending trust-delegation order, dropping any whose env address is unset
 * (mirrors `getBackingOptions` in `./contracts`).
 */
export function getArbiterRegistry(chainId: number): ArbiterDescriptor[] {
  const env = getContractAddresses(chainId)
  const out: ArbiterDescriptor[] = [
    {
      id: SELF_ARBITER_ID,
      address: undefined,
      name: 'You arbitrate this yourself',
      kind: 'self',
      trustAssumption:
        'You decide the outcome. The counterparty must trust you directly — best for self-imposed or reputation-backed commitments.',
      recommended: true,
    },
  ]
  if (env.defaultArbiter) {
    out.push({
      id: env.defaultArbiter,
      address: env.defaultArbiter,
      name: 'Shared arbiter',
      kind: 'multisig',
      trustAssumption: 'A neutral third party resolves disputes between the two sides.',
    })
  }
  for (const optimistic of getOptimisticInsuranceArbiters(chainId)) {
    out.push({
      id: optimistic.address,
      address: optimistic.address,
      name: optimistic.label,
      kind: 'optimistic',
      trustAssumption:
        'Claims auto-finalize after a timeout unless someone challenges within the window.',
    })
  }
  return out
}

/** `<Select>`-shaped options for the arbiter picker. */
export function getArbiterOptions(chainId: number): { value: string; label: string }[] {
  return getArbiterRegistry(chainId).map((a) => ({
    value: a.id,
    label: a.recommended ? `${a.name} (recommended)` : `${a.name} · ${ARBITER_KIND_LABEL[a.kind]}`,
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
