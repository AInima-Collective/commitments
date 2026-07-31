import { type Address, isAddress } from 'viem'

import { ZERO_HASH, resolveMetadataArgs } from '../utils/metadataForm'

const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000' as Address

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
 *   3. counterparty valid or blank (blank ⇒ zero address)
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
  // Counterparty optional: blank ⇒ zero address (one-sided commitment).
  const counterparty =
    input.counterparty && input.counterparty.length > 0 ? input.counterparty : ZERO_ADDRESS
  if (counterparty !== ZERO_ADDRESS && !isAddress(counterparty, { strict: false })) {
    return { ok: false, error: 'INVALID COUNTERPARTY ADDRESS' }
  }
  if (input.amount === undefined || input.amount <= 0n) {
    return { ok: false, error: 'AMOUNT MUST BE GREATER THAN ZERO' }
  }
  if (input.maxPenaltyBps < 0 || input.maxPenaltyBps > 10_000) {
    return { ok: false, error: 'MAX PENALTY MUST BE BETWEEN 0 AND 10000 BPS' }
  }
  if (input.challengeWindowSecs < 86_400) {
    return { ok: false, error: 'CHALLENGE WINDOW MUST BE AT LEAST 24 HOURS' }
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

export { ZERO_HASH }
