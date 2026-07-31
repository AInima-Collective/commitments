import { describe, expect, it } from 'vitest'
import { MARKET_OFFERS, type MarketOffer } from '../../config/marketOffers'
import {
  buildOfferCommitParams,
  isNegotiable,
  isSingleCommitOffer,
  lockedOfferTerms,
} from '../offerCommitmentParams'
import { isAgreementOffer } from '../offerProposeParams'
import { buildDataJsonUri, computeHashFromJsonText } from '../../utils/metadataForm'
import {
  inlineJsonBytes,
  offerMetadata,
  offerMetadataFitsInline,
  offerMetadataJson,
} from '../offerMetadata'

/**
 * The load-bearing test. `OfferMode` inlines this payload as a `data:` URI
 * client-side, so an offer whose prose grows past the budget produces a form
 * that pins "successfully" and then reverts during gas estimation. Failing here
 * is how that stays impossible.
 */
describe('every shipped offer fits the inline budget', () => {
  it.each(MARKET_OFFERS.map((o) => [o.id, o] as const))('%s', (_id, offer) => {
    expect(offerMetadataFitsInline(offer)).toBe(true)
  })

  it('leaves the tightest offer some headroom to be edited into', () => {
    // The acceptor edits this before signing. Zero headroom would mean the
    // very first character they type trips the cap.
    const widest = Math.max(...MARKET_OFFERS.map(inlineJsonBytes))
    expect(widest).toBeLessThanOrEqual(360)
    expect(360 - widest).toBeGreaterThanOrEqual(20)
  })
})

describe('offerMetadata — schema', () => {
  it('declares the schema that matches the offer shape', () => {
    // A single-commit offer becomes one commitment; an agreement offer becomes
    // a proposal with two legs. Emitting the wrong schemaVersion would publish
    // a document that lies about what it describes, and `rendersSchema` would
    // drop the reader into a raw JSON dump.
    for (const offer of MARKET_OFFERS) {
      const expected = isAgreementOffer(offer) ? 'agreement.v1' : 'commitment.v1'
      expect(offerMetadata(offer).schemaVersion).toBe(expected)
    }
  })

  it('never puts termsURI on an agreement payload, which does not document it', () => {
    for (const offer of MARKET_OFFERS.filter(isAgreementOffer)) {
      expect(offerMetadata(offer)).not.toHaveProperty('termsURI')
    }
  })

  it('titles the commitment after the offer', () => {
    const offer = MARKET_OFFERS[0]
    expect(offerMetadata(offer).title).toBe(offer.name)
  })

  it('serializes once, and the JSON round-trips to the same object', () => {
    const offer = MARKET_OFFERS[0]
    expect(JSON.parse(offerMetadataJson(offer))).toEqual(offerMetadata(offer))
  })

  it('omits termsURI when the publisher linked none', () => {
    const offer = MARKET_OFFERS.find((o) => !o.termsUrl)!
    expect(offerMetadata(offer)).not.toHaveProperty('termsURI')
  })
})

describe('offerMetadata — attribution', () => {
  it('quotes the offer rather than asserting in the acceptor’s voice', () => {
    // The acceptor hashes and attests these bytes. They are vouching that this
    // is the deal they took, not that the publisher's claims are true.
    for (const offer of MARKET_OFFERS) {
      const { description } = offerMetadata(offer)
      expect(description).toContain('against the published offer')
      expect(description).toContain(offer.name)
    }
  })
})

describe('offerMetadata — tags', () => {
  it('carries the pattern and risk tier alongside the offer’s own tags', () => {
    const offer = MARKET_OFFERS.find((o) => (o.tags?.length ?? 0) > 0)!
    const { tags } = offerMetadata(offer)
    expect(tags).toContain(offer.pattern)
    expect(tags).toContain(`risk-${offer.riskTier}`)
    for (const t of offer.tags ?? []) expect(tags).toContain(t.toLowerCase())
  })

  it('normalizes and de-duplicates the way metadataTags does on read', () => {
    const offer = {
      ...MARKET_OFFERS[0],
      tags: ['SLA', ' sla ', 'Oracle'],
    } as MarketOffer
    const { tags } = offerMetadata(offer)
    expect(tags.filter((t) => t === 'sla')).toHaveLength(1)
    expect(tags).toContain('oracle')
    expect(tags.every((t) => t === t.trim().toLowerCase())).toBe(true)
  })
})

describe('offerMetadata — pattern substance', () => {
  it('carries the covered event for a coverage offer', () => {
    const offer = MARKET_OFFERS.find((o) => o.pattern === 'direct-coverage')
    if (!offer) return
    expect(offerMetadata(offer).description).toContain(offer.coveredEvent)
  })

  it('carries the beneficiary mission for a donation offer', () => {
    const offer = MARKET_OFFERS.find((o) => o.pattern === 'yield-donation')
    if (!offer) return
    expect(offerMetadata(offer).description).toContain(offer.beneficiaryMission)
  })

  it('carries the covered events for a mutual-aid offer', () => {
    const offer = MARKET_OFFERS.find((o) => o.pattern === 'mutual-aid')
    if (!offer) return
    for (const event of offer.coveredEvents) {
      expect(offerMetadata(offer).description).toContain(event)
    }
  })
})

/**
 * End-to-end wiring: committing to an offer must produce a populated,
 * on-chain-valid commitment with no typing at all. This is the whole point of
 * the module, and it spans three files (`marketOffers` attaches the template,
 * `OfferMode` derives URI+hash from it, `buildOfferCommitParams` forwards
 * them), so it is asserted here rather than trusted.
 */
describe('offer → commitment, with the user typing nothing', () => {
  it('every single-commit offer is metadata-negotiable and ships a template', () => {
    for (const offer of MARKET_OFFERS.filter(isSingleCommitOffer)) {
      // Without both of these, OfferMode renders the raw paste path instead
      // and the offer's content is dropped on the floor — the original bug.
      expect(isNegotiable(lockedOfferTerms(offer), 'metadata')).toBe(true)
      expect(offer.metadataTemplateJson).toBeTruthy()
    }
  })

  it('agreement offers carry no template, because nothing there reads one', () => {
    for (const offer of MARKET_OFFERS.filter(isAgreementOffer)) {
      expect(offer.metadataTemplateJson).toBeUndefined()
    }
  })

  it("the shipped template is exactly the module's output", () => {
    for (const offer of MARKET_OFFERS.filter(isSingleCommitOffer)) {
      // Hand-maintained templates drift until the metadata describes a deal
      // the offer no longer makes.
      expect(offer.metadataTemplateJson).toBe(offerMetadataJson(offer))
    }
  })

  it('produces params the contract accepts, carrying the offer’s substance', () => {
    for (const offer of MARKET_OFFERS.filter(isSingleCommitOffer)) {
      const json = offer.metadataTemplateJson!
      const built = buildOfferCommitParams(offer, {
        connectedAddress: '0x1111111111111111111111111111111111111111',
        amount: offer.minAmount,
        challengeWindowSecs: 86_400,
        expiryValue: '',
        // Exactly what OfferMode derives from the template on mount.
        metadataURI: buildDataJsonUri(json),
        metadataHash: computeHashFromJsonText(json),
      })
      expect(built.ok).toBe(true)
      if (!built.ok) return

      // Fits the on-chain cap, so createCommitment will not revert.
      const uriBytes = new TextEncoder().encode(built.params.metadataURI).length
      expect(uriBytes).toBeLessThanOrEqual(512)

      // The hash attests the exact bytes the URI decodes to.
      expect(built.params.metadataHash).toBe(computeHashFromJsonText(json))

      // And the content is genuinely the offer's, not a placeholder.
      const decoded = JSON.parse(json)
      expect(decoded.title).toBe(offer.name)
      expect(decoded.tags).toContain(offer.pattern)
    }
  })
})
