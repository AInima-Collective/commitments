import { type Address, isAddress } from 'viem'

import type {
  MarketOffer,
  MutualAidOffer,
  NegotiableField,
  ReciprocalMutualOffer,
} from '../config/marketOffers'
import { ZERO_HASH, resolveMetadataArgs } from '../utils/metadataForm'

const DEFAULT_CHALLENGE_WINDOW_SECS = 86_400
/** Default time a proposal stays open (7 days) when not negotiable. */
const DEFAULT_PROPOSAL_DURATION_SECS = 604_800
/** Fixed deal by default — the proposer only sets their own stake. */
const DEFAULT_NEGOTIABLE: ReadonlyArray<NegotiableField> = ['amount']

/** Patterns whose CTA opens proposeAgreement (paired commitment). */
export type AgreementPattern = 'reciprocal-mutual' | 'mutual-aid'

const AGREEMENT_PATTERNS: readonly AgreementPattern[] = [
  'reciprocal-mutual',
  'mutual-aid',
]

export function isAgreementOffer(offer: MarketOffer): boolean {
  return (AGREEMENT_PATTERNS as readonly string[]).includes(offer.pattern)
}

export type AgreementOffer = ReciprocalMutualOffer | MutualAidOffer

export function asAgreementOffer(offer: MarketOffer): AgreementOffer | null {
  return isAgreementOffer(offer) ? (offer as AgreementOffer) : null
}

export interface LockedAgreementTerms {
  /** Locked by offer — the published counterparty becomes the acceptor. */
  acceptor: Address
  acceptorName?: string
  /** Locked by offer — the offer's published arbiter is the shared arbiter. */
  arbiter: Address
  arbiterName?: string
  /** Locked by offer — forfeit ceiling published in the marketplace. */
  maxPenaltyBps: number
  /** Editable from a sane prefill — the proposer's stake on this leg. */
  defaultProposerAmount: bigint
  /** Locked by offer — the published acceptor stake. */
  acceptorAmount: bigint
  /** Pattern-aware bilateral settlement caps (mutual-aid). */
  maxFlowProposerToAcceptor: bigint
  maxFlowAcceptorToProposer: bigint
  /** Fixed challenge window (seconds); default 86_400. */
  challengeWindowSecs: number
  /** Fixed proposal-open duration (seconds); default 604_800 (7 days). */
  proposalDurationSecs: number
  /**
   * Fields the proposer may edit. `'amount'` (their stake) is always editable;
   * `'challengeWindow'`, `'metadata'`, and `'expiry'` (≡ proposal duration here)
   * are locked unless the offer opts them in. Default `['amount']`.
   */
  negotiableFields: ReadonlyArray<NegotiableField>
}

/** Whether the proposer may edit a given term on this agreement offer. */
export function isAgreementNegotiable(
  terms: LockedAgreementTerms,
  field: NegotiableField,
): boolean {
  return terms.negotiableFields.includes(field)
}

/**
 * Translate an agreement-shape offer into the params it locks for the
 * proposal. The proposer (visitor) is committing on `yourAmount`; the
 * acceptor (offer publisher) on `theirAmount`. The published `arbiter`
 * is the shared arbiter — agreement uses one for both legs.
 *
 * `mutual-aid` carries a per-direction settlement cap; `reciprocal-mutual`
 * disables bilateral settlement (caps = 0) per the v2.5 contract.
 */
export function lockedAgreementTerms(offer: MarketOffer): LockedAgreementTerms {
  const eo = asAgreementOffer(offer)
  if (!eo) {
    throw new Error(`offer pattern '${offer.pattern}' is not an agreement shape`)
  }
  const base = {
    acceptor: eo.counterparty,
    acceptorName: eo.counterpartyName,
    arbiter: eo.arbiter,
    arbiterName: eo.arbiterName,
    maxPenaltyBps: eo.maxPenaltyBps,
    defaultProposerAmount: eo.yourAmount,
    acceptorAmount: eo.theirAmount,
    challengeWindowSecs: eo.challengeWindowSecs ?? DEFAULT_CHALLENGE_WINDOW_SECS,
    proposalDurationSecs: DEFAULT_PROPOSAL_DURATION_SECS,
    negotiableFields: eo.negotiableFields ?? DEFAULT_NEGOTIABLE,
  }
  if (eo.pattern === 'mutual-aid') {
    return {
      ...base,
      maxFlowProposerToAcceptor: eo.settlementCapEachWay,
      maxFlowAcceptorToProposer: eo.settlementCapEachWay,
    }
  }
  return { ...base, maxFlowProposerToAcceptor: 0n, maxFlowAcceptorToProposer: 0n }
}

export interface OfferProposeInput {
  connectedAddress: Address | undefined
  proposerAmount: bigint | undefined
  challengeWindowSecs: number
  proposalDurationSecs: number
  metadataURI: string
  metadataHash: string
}

/**
 * Domain subset of `proposeAgreement` params. v2 backing fields (`token`,
 * `adapter`, `strategies`) are injected at the call site from config; there is
 * no per-agreement `yieldShareBps`.
 */
export interface OfferProposeParams {
  arbiter: Address
  acceptor: Address
  proposerAmount: bigint
  acceptorAmount: bigint
  maxPenaltyBps: number
  challengeWindow: bigint
  proposalDuration: bigint
  metadataURI: string
  metadataHash: `0x${string}`
  maxFlowProposerToAcceptor: bigint
  maxFlowAcceptorToProposer: bigint
}

export type BuildOfferProposeResult =
  | { ok: true; params: OfferProposeParams }
  | { ok: false; error: string }

/**
 * Build proposeAgreement args from an agreement-shape offer + form
 * input. Locks acceptor / acceptorAmount / arbiter / maxPenaltyBps /
 * settlement caps per `lockedAgreementTerms`; the proposer adjusts
 * their own amount, challenge window, yield share, proposal duration, and
 * metadata.
 *
 * Mirrors `buildOfferCommitParams` so error surfaces stay consistent
 * across the offer-driven flows.
 */
export function buildOfferProposeParams(
  offer: MarketOffer,
  input: OfferProposeInput,
): BuildOfferProposeResult {
  if (!isAgreementOffer(offer)) {
    return { ok: false, error: `OFFER PATTERN '${offer.pattern}' NOT AGREEMENT SHAPE` }
  }
  if (!input.connectedAddress) {
    return { ok: false, error: 'WALLET NOT CONNECTED' }
  }
  // Non-strict — offer addresses may not carry a valid EIP-55 checksum.
  // See `offerCommitmentParams.ts` for the full rationale.
  if (
    !isAddress(offer.arbiter, { strict: false }) ||
    !isAddress(offer.counterparty, { strict: false })
  ) {
    return { ok: false, error: 'OFFER MISSING ARBITER OR COUNTERPARTY' }
  }
  if (input.proposerAmount === undefined || input.proposerAmount <= 0n) {
    return { ok: false, error: 'YOUR STAKE MUST BE GREATER THAN ZERO' }
  }

  const terms = lockedAgreementTerms(offer)

  // Challenge window: offer-fixed unless opted into negotiation.
  let challengeWindowSecs = terms.challengeWindowSecs
  if (isAgreementNegotiable(terms, 'challengeWindow')) {
    if (input.challengeWindowSecs < 86_400) {
      return { ok: false, error: 'CHALLENGE WINDOW MUST BE AT LEAST 24 HOURS' }
    }
    challengeWindowSecs = input.challengeWindowSecs
  }

  // Proposal duration (how long the proposal stays open) reuses the 'expiry'
  // negotiable flag; otherwise the offer's fixed default applies.
  let proposalDurationSecs = terms.proposalDurationSecs
  if (isAgreementNegotiable(terms, 'expiry')) {
    if (input.proposalDurationSecs <= 0) {
      return { ok: false, error: 'PROPOSAL DURATION MUST BE GREATER THAN ZERO' }
    }
    proposalDurationSecs = input.proposalDurationSecs
  }

  const { uri, hash } = isAgreementNegotiable(terms, 'metadata')
    ? resolveMetadataArgs(input.metadataURI, input.metadataHash)
    : resolveMetadataArgs('', '')

  return {
    ok: true,
    params: {
      arbiter: terms.arbiter,
      acceptor: terms.acceptor,
      proposerAmount: input.proposerAmount,
      acceptorAmount: terms.acceptorAmount,
      maxPenaltyBps: terms.maxPenaltyBps,
      challengeWindow: BigInt(challengeWindowSecs),
      proposalDuration: BigInt(proposalDurationSecs),
      metadataURI: uri,
      metadataHash: hash,
      maxFlowProposerToAcceptor: terms.maxFlowProposerToAcceptor,
      maxFlowAcceptorToProposer: terms.maxFlowAcceptorToProposer,
    },
  }
}

export { ZERO_HASH }
