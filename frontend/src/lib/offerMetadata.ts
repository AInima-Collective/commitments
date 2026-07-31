// Turning a marketplace offer into the metadata its commitment should carry.
//
// The marketplace already holds a full description of every offer — covered
// event, forfeit conditions, premium, sum insured, arbiter shape, risk tier —
// and until now threw all of it away at the moment of commitment. Someone would
// read "Smart-contract cover · optimistic … Loss of funds caused by a
// documented exploit on the protected contract", click commit, and land an
// anonymous row. The content was one screen away the whole time.
//
// Pure and synchronous: one switch over `MarketPattern`, no React, no fetch.
//
// ── Two constraints shape everything here ──────────────────────────────────
//
// 1. **Byte budget.** `OfferMode` derives the URI client-side, per keystroke,
//    as an inline `data:` URI — so unlike the seed (which pins), this payload
//    has to fit the contract's 512-byte cap by itself: about 360 bytes of JSON.
//    `offerMetadataFitsInline` exists so a test can hold that line, because the
//    failure mode otherwise is a form that reports success and then reverts.
//
// 2. **Who is attesting.** The offer's prose is written by the PUBLISHER; the
//    commitment's metadata is hashed and attested by the ACCEPTOR. So the
//    payload quotes the offer rather than asserting its claims in the
//    acceptor's voice — "Committed against the published offer X, which states
//    Y" rather than "I will do Y". The acceptor is vouching that this is the
//    deal they took, not that the publisher's description is true.

import { type MarketOffer } from '../config/marketOffers'
import { isAgreementOffer } from './offerProposeParams'

/**
 * The payload derived from an offer.
 *
 * The schema follows the offer's SHAPE, not a preference. Single-commit
 * patterns become one commitment and take `commitment.v1`; agreement-shaped
 * patterns (`reciprocal-mutual`, `mutual-aid`) become a proposal with two legs
 * and take `agreement.v1`. Emitting the wrong one would publish a document
 * whose `schemaVersion` lies about what it describes — and the reader would
 * fall back to a raw JSON dump, because `rendersSchema` keys off exactly that.
 */
export interface OfferMetadata {
  schemaVersion: 'commitment.v1' | 'agreement.v1'
  title: string
  description: string
  tags: string[]
  /** `commitment.v1` only. Present when the publisher linked terms. */
  termsURI?: string
}

/**
 * Largest JSON that survives the inline `data:` encoding under the on-chain
 * 512-byte URI cap: floor((512 - 29) / 4) * 3. Mirrors
 * `MAX_INLINE_JSON_BYTES` in `utils/metadataForm`; duplicated as a plain
 * constant so this module stays dependency-free and testable in isolation.
 */
const INLINE_BUDGET_BYTES = 360

/**
 * What the commitment is about, in the acceptor's voice, quoting the offer.
 *
 * Deliberately one or two sentences: this is a starting point the acceptor
 * edits before signing, the offer's full prose is still on the card behind
 * them, and every character here competes with the byte budget above.
 */
function patternDetail(offer: MarketOffer): string {
  switch (offer.pattern) {
    case 'avs-stake':
      return `Forfeitable on: ${offer.forfeitConditions}`
    case 'direct-coverage':
      return `Covers: ${offer.coveredEvent}`
    case 'mesh-pool':
      return `Pooled cover for: ${offer.coveredEvents.join('; ')}`
    case 'reciprocal-mutual':
      return `Each side covers: ${offer.coveredEvent}`
    case 'agent-underwriting':
      return `Underwrites ${offer.agentStrategy}; forfeits on a drawdown below the high-water mark.`
    case 'agent-sla-bond':
      return offer.slaSummary
    case 'yield-donation':
      return `Yield routes to: ${offer.beneficiaryMission}`
    case 'mutual-aid':
      return `Covers: ${offer.coveredEvents.join('; ')}`
    case 'governance-weight':
      return `Voting weight for ${offer.daoName} under ${offer.weightCategory}.`
  }
}

/**
 * Tags: the offer's own, plus its pattern and risk tier so the list can be
 * filtered by either. Normalized the same way `metadataTags` normalizes on
 * read, so what gets written is what gets matched.
 */
function offerTags(offer: MarketOffer): string[] {
  const raw = [...(offer.tags ?? []), offer.pattern, `risk-${offer.riskTier}`]
  const seen = new Set<string>()
  const out: string[] = []
  for (const tag of raw) {
    const normalized = tag.trim().toLowerCase()
    if (normalized.length === 0 || seen.has(normalized)) continue
    seen.add(normalized)
    out.push(normalized)
  }
  return out
}

/**
 * Derive the `commitment.v1` payload for an offer.
 *
 * Prefilled, never locked: `OfferMode` seeds its editor with this and the
 * acceptor edits before committing. An unnamed commitment stays valid, and
 * someone who disagrees with the publisher's framing gets to say so.
 */
export function offerMetadata(offer: MarketOffer): OfferMetadata {
  const agreement = isAgreementOffer(offer)
  const payload: OfferMetadata = {
    schemaVersion: agreement ? 'agreement.v1' : 'commitment.v1',
    title: offer.name,
    description: `${agreement ? 'Agreed' : 'Committed'} against the published offer “${offer.name}”. ${patternDetail(offer)}`,
    tags: offerTags(offer),
  }
  // Only when the publisher actually linked one, and only on the schema that
  // documents the field. A `termsURI` pointing nowhere is worse than none: it
  // invites a click and wastes it.
  if (!agreement && offer.termsUrl) payload.termsURI = offer.termsUrl
  return payload
}

/**
 * The exact bytes to hash and inline.
 *
 * `JSON.stringify` once, and that result is both what `OfferMode` seeds its
 * editor with and what gets hashed. A second serialization anywhere would
 * change the bytes and therefore the hash.
 *
 * **Compact, not pretty-printed.** Indentation reads better in the textarea
 * and costs 40 bytes, which is the difference between the reciprocal-mutual
 * offer fitting (336 B) and reverting on chain (376 B against a 360 B budget).
 * The textarea wraps, so the loss is smaller than the gain.
 */
export function offerMetadataJson(offer: MarketOffer): string {
  return JSON.stringify(offerMetadata(offer))
}

/**
 * Whether an offer's derived payload survives the inline `data:` encoding.
 *
 * Not a runtime guard — it exists so a unit test can fail when someone writes a
 * `coveredEvent` long enough to push the commit form past the on-chain cap. The
 * form would otherwise pin "successfully" and then revert during gas
 * estimation, which is the exact failure this codebase already fixed once.
 */
export function offerMetadataFitsInline(offer: MarketOffer): boolean {
  return inlineJsonBytes(offer) <= INLINE_BUDGET_BYTES
}

/** Byte length of the derived payload, for tests and diagnostics. */
export function inlineJsonBytes(offer: MarketOffer): number {
  return new TextEncoder().encode(offerMetadataJson(offer)).length
}
