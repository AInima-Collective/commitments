import { type Address, isAddress, zeroAddress } from 'viem'

import { resolveMetadataArgs } from './metadataForm'


/**
 * Raw form input from the Custom (and refactored Delegate) create modes.
 * Validation + transformation live here so unit tests cover the run-time path
 * and the component never inlines locked literals (mirrors `buildDonateParams`
 * / `buildOfferCommitParams`).
 */
export interface CustomCommitInput {
  connectedAddress: Address | undefined
  /** Resolved arbiter address. `undefined` ≡ self → falls back to the wallet. */
  arbiter: Address | undefined
  /** Counterparty address; `''` ≡ none (zero address, one-sided commitment). */
  counterparty: string
  amount: bigint | undefined
  maxPenaltyBps: number
  challengeWindowSecs: number
  /** datetime-local ISO string or `''` (open-ended). */
  expiryValue: string
  metadataURI: string
  metadataHash: string
}

/**
 * Domain subset of `commitmentManager.createCommitment` params. The v2 backing
 * fields (`token`, `adapter`, `strategies`) are injected at the call site from
 * config / the strategy picker.
 */
export interface CustomCommitParams {
  arbiter: Address
  counterparty: Address
  amount: bigint
  maxPenaltyBps: number
  challengeWindow: bigint
  expiresAt: bigint
  metadataURI: string
  metadataHash: `0x${string}`
}

export type BuildCustomResult =
  | { ok: true; params: CustomCommitParams }
  | { ok: false; error: string }

/**
 * Build createCommitment args for the Custom / Delegate modes.
 *
 * Validation order mirrors `buildOfferCommitParams` so error strings stay
 * consistent across the commit-shaped flows:
 *   1. wallet connected
 *   2. arbiter resolves to a valid address (self ⇒ connected wallet)
 *   3. counterparty present and valid (the manager rejects the zero address)
 *   4. amount > 0
 *   5. maxPenaltyBps in 0..10_000
 *   6. challengeWindow ≥ 86_400 (contract floor)
 */
export function buildCustomParams(input: CustomCommitInput): BuildCustomResult {
  if (!input.connectedAddress) {
    return { ok: false, error: 'WALLET NOT CONNECTED' }
  }
  // Self-arbiter default: an unset arbiter resolves to the connected wallet.
  const arbiter = input.arbiter ?? input.connectedAddress
  if (!isAddress(arbiter, { strict: false })) {
    return { ok: false, error: 'INVALID ARBITER ADDRESS' }
  }
  const counterparty = input.counterparty ?? ''
  if (counterparty === '') return { ok: false, error: 'COUNTERPARTY ADDRESS REQUIRED' }
  if (!isAddress(counterparty, { strict: false }) || counterparty.toLowerCase() === zeroAddress) {
    return { ok: false, error: 'INVALID COUNTERPARTY ADDRESS' }
  }
  if (input.amount === undefined || input.amount <= 0n) {
    return { ok: false, error: 'AMOUNT MUST BE GREATER THAN ZERO' }
  }
  if (input.maxPenaltyBps < 0 || input.maxPenaltyBps > 10_000) {
    return { ok: false, error: 'MAX PENALTY MUST BE BETWEEN 0 AND 10000 BPS' }
  }
  if (input.challengeWindowSecs < 86_400) {
    return { ok: false, error: 'FORFEIT EXECUTION DELAY MUST BE AT LEAST 24 HOURS' }
  }

  const expiresAt = input.expiryValue
    ? BigInt(Math.floor(new Date(input.expiryValue).getTime() / 1000))
    : 0n

  const { uri, hash } = resolveMetadataArgs(input.metadataURI, input.metadataHash)

  return {
    ok: true,
    params: {
      arbiter: arbiter as Address,
      counterparty: counterparty as Address,
      amount: input.amount,
      maxPenaltyBps: input.maxPenaltyBps,
      challengeWindow: BigInt(input.challengeWindowSecs),
      expiresAt,
      metadataURI: uri,
      metadataHash: hash,
    },
  }
}

