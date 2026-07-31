import { type Address, isAddress } from 'viem'

import type { MarketOffer, NegotiableField } from '../config/marketOffers'
import { ZERO_HASH, resolveMetadataArgs } from '../utils/metadataForm'

/** Default challenge window (24h, the contract floor) when an offer omits it. */
const DEFAULT_CHALLENGE_WINDOW_SECS = 86_400
/** An offer is a fixed deal: only the stake amount is editable by default. */
const DEFAULT_NEGOTIABLE: ReadonlyArray<NegotiableField> = ['amount']

/**
 * Patterns whose commitment can be created with a single
 * `manager.createCommitment` call from the depositor. Other patterns
 * either need a router (linked-premium), an agreement proposal flow
 * (reciprocal-mutual / mutual-aid), or a sequenced mesh-stake step
 * (mesh-pool, governance-weight) and are handled elsewhere.
 */
export type SingleCommitPattern =
  | 'avs-stake'
  | 'direct-coverage'
  | 'agent-underwriting'
  | 'agent-sla-bond'
  | 'yield-donation'

const SINGLE_COMMIT_PATTERNS: readonly SingleCommitPattern[] = [
  'avs-stake',
  'direct-coverage',
  'agent-underwriting',
  'agent-sla-bond',
  'yield-donation',
]

export function isSingleCommitOffer(offer: MarketOffer): boolean {
  return (SINGLE_COMMIT_PATTERNS as readonly string[]).includes(offer.pattern)
}

/**
 * UI shape of the offer's locked commitment terms — the subset the
 * depositor cannot edit because changing them would break the offer's
 * semantics.
 */
export interface LockedOfferTerms {
  arbiter: Address
  arbiterName?: string
  counterparty: Address
  counterpartyName?: string
  maxPenaltyBps: number
  yieldShareBps: number
  /** Default duration (seconds) — applied to expiry on submit when set. */
  durationSecs?: number
  /** Fixed challenge window (seconds) for the offer; default 86_400. */
  challengeWindowSecs: number
  /** Fields the acceptor may edit; default `['amount']`. */
  negotiableFields: ReadonlyArray<NegotiableField>
  /** Inclusive amount bounds applied during validation. */
  minAmount: bigint
  maxAmount: bigint
}

/** Whether the acceptor may edit a given standard term on this offer. */
export function isNegotiable(terms: LockedOfferTerms, field: NegotiableField): boolean {
  return terms.negotiableFields.includes(field)
}

/**
 * Translate a single-commit offer into its locked commitment terms.
 *
 * Per-pattern routing is captured here once so the form, the helper, and
 * unit tests share one mapping:
 *
 *  - **avs-stake** — depositor commits to an AVS operator. Premium yield
 *    is paid out-of-band (epoch rebates), so the commitment-level
 *    `yieldShareBps` is 0.
 *  - **direct-coverage** — underwriter posts forfeitable cover; premium is
 *    settled out-of-band by the policyholder. `yieldShareBps = 0`.
 *  - **agent-underwriting** — full-forfeit exposure on a sustained drawdown
 *    (`maxPenaltyBps = 10_000`). Profit share routes via the
 *    `IPerformancePremiumPayer`, not the commitment-level yield split, so
 *    `yieldShareBps = 0`.
 *  - **yield-donation** — non-forfeitable (`maxPenaltyBps = 0`); yield is
 *    routed to the beneficiary at the offer's suggested rate.
 */
export function lockedOfferTerms(offer: MarketOffer): LockedOfferTerms {
  const base = {
    arbiter: offer.arbiter,
    arbiterName: offer.arbiterName,
    counterparty: offer.counterparty,
    counterpartyName: offer.counterpartyName,
    durationSecs: offer.durationSecs,
    challengeWindowSecs: offer.challengeWindowSecs ?? DEFAULT_CHALLENGE_WINDOW_SECS,
    negotiableFields: offer.negotiableFields ?? DEFAULT_NEGOTIABLE,
    minAmount: offer.minAmount,
    maxAmount: offer.maxAmount,
  }
  switch (offer.pattern) {
    case 'avs-stake':
      return { ...base, maxPenaltyBps: offer.maxPenaltyBps, yieldShareBps: 0 }
    case 'direct-coverage':
      return { ...base, maxPenaltyBps: offer.maxPenaltyBps, yieldShareBps: 0 }
    case 'agent-underwriting':
      // Sustained-drawdown loss is full-forfeit on the underwriter side; the
      // protective ceiling is the contract-level `maxPenaltyBps` cap.
      return { ...base, maxPenaltyBps: 10_000, yieldShareBps: 0 }
    case 'agent-sla-bond':
      // The agent posts the bond behind its own SLA; the slashable share is
      // published on the offer (conventionally the full bond). The bond keeps
      // earning vault yield to the committer — no commitment-level split.
      return { ...base, maxPenaltyBps: offer.maxPenaltyBps, yieldShareBps: 0 }
    case 'yield-donation':
      return { ...base, maxPenaltyBps: 0, yieldShareBps: offer.suggestedYieldShareBps }
    default:
      throw new Error(`offer pattern '${offer.pattern}' is not single-commit`)
  }
}

/** Raw form input collected from the OfferMode component. */
export interface OfferCommitInput {
  connectedAddress: Address | undefined
  amount: bigint | undefined
  /** Free-form challenge window in seconds (form default: 86400). */
  challengeWindowSecs: number
  expiryValue: string
  metadataURI: string
  metadataHash: string
}

/**
 * Domain subset of `commitmentManager.createCommitment` params. v2 backing
 * fields (`token`, `adapter`, `strategies`) are injected at the call site from
 * config; there is no per-commitment `yieldShareBps` (the offer's suggested
 * yield share survives on `LockedOfferTerms` for display only).
 */
export interface OfferCommitParams {
  arbiter: Address
  counterparty: Address
  amount: bigint
  maxPenaltyBps: number
  challengeWindow: bigint
  expiresAt: bigint
  metadataURI: string
  metadataHash: `0x${string}`
}

export type BuildOfferCommitResult =
  | { ok: true; params: OfferCommitParams }
  | { ok: false; error: string }

/**
 * Build createCommitment args from a single-commit market offer + the
 * depositor's form input.
 *
 * Validation order mirrors `buildDonateParams` so error surfaces stay
 * consistent across the three commit-shaped flows. The helper enforces
 * the offer's amount bounds (min/max) and the manager's challenge-window
 * floor (≥ 86_400s).
 */
export function buildOfferCommitParams(
  offer: MarketOffer,
  input: OfferCommitInput,
): BuildOfferCommitResult {
  if (!isSingleCommitOffer(offer)) {
    return { ok: false, error: `OFFER PATTERN '${offer.pattern}' NOT SUPPORTED YET` }
  }
  if (!input.connectedAddress) {
    return { ok: false, error: 'WALLET NOT CONNECTED' }
  }
  // `isAddress` defaults to strict EIP-55 checksum validation; offer
  // addresses come from various publishers and may be lowercased or
  // partially-cased without a valid checksum. We only need a length/format
  // check here — viem normalises before encoding the tx.
  if (
    !isAddress(offer.arbiter, { strict: false }) ||
    !isAddress(offer.counterparty, { strict: false })
  ) {
    return { ok: false, error: 'OFFER MISSING ARBITER OR COUNTERPARTY' }
  }
  if (input.amount === undefined || input.amount <= 0n) {
    return { ok: false, error: 'AMOUNT MUST BE GREATER THAN ZERO' }
  }
  if (input.amount < offer.minAmount) {
    return { ok: false, error: 'AMOUNT BELOW OFFER MINIMUM' }
  }
  if (input.amount > offer.maxAmount) {
    return { ok: false, error: 'AMOUNT ABOVE OFFER MAXIMUM' }
  }

  const terms = lockedOfferTerms(offer)

  // Challenge window: editable only when the offer opts it into negotiation;
  // otherwise the offer's fixed window applies. The ≥ 86_400 floor is enforced
  // on the user-supplied value (offer-supplied values are trusted defaults).
  let challengeWindowSecs = terms.challengeWindowSecs
  if (isNegotiable(terms, 'challengeWindow')) {
    if (input.challengeWindowSecs < 86_400) {
      return { ok: false, error: 'CHALLENGE WINDOW MUST BE AT LEAST 24 HOURS' }
    }
    challengeWindowSecs = input.challengeWindowSecs
  }

  // Expiry: a negotiable offer honours the user's entry (blank ⇒ open-ended);
  // a fixed offer always uses createdAt + offer.durationSecs.
  const defaultExpiry = terms.durationSecs
    ? BigInt(Math.floor(Date.now() / 1000) + terms.durationSecs)
    : 0n
  let expiresAt = defaultExpiry
  if (isNegotiable(terms, 'expiry')) {
    expiresAt = input.expiryValue
      ? BigInt(Math.floor(new Date(input.expiryValue).getTime() / 1000))
      : defaultExpiry
  }

  // Metadata: only attach user metadata when the offer makes it negotiable.
  const { uri, hash } = isNegotiable(terms, 'metadata')
    ? resolveMetadataArgs(input.metadataURI, input.metadataHash)
    : resolveMetadataArgs('', '')

  return {
    ok: true,
    params: {
      arbiter: terms.arbiter,
      counterparty: terms.counterparty,
      amount: input.amount,
      maxPenaltyBps: terms.maxPenaltyBps,
      challengeWindow: BigInt(challengeWindowSecs),
      expiresAt,
      metadataURI: uri,
      metadataHash: hash,
    },
  }
}

export { ZERO_HASH }
