import { describe, expect, it } from 'vitest'
import { parseUnits, type Address } from 'viem'

import {
  buildOfferProposeParams,
  isAgreementOffer,
  lockedAgreementTerms,
} from '../offerProposeParams'
import type {
  MarketOffer,
  MutualAidOffer,
  ReciprocalMutualOffer,
} from '../../config/marketOffers'

const ARBITER = '0x4838B106FCe9647Bdf1E7877BF73cE8B0BAD5f97' as const
const COUNTERPARTY = '0x742d35Cc6634C0532925a3b844Bc454e4438f44e' as const
const CONNECTED = '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' as Address

const reciprocal: ReciprocalMutualOffer = {
  id: 'rec-1',
  pattern: 'reciprocal-mutual',
  name: 'Reciprocal',
  description: 'desc',
  whitepaperRef: '§5.1',
  counterparty: COUNTERPARTY,
  arbiter: ARBITER,
  arbiterKind: 'multisig',
  minAmount: parseUnits('500', 6),
  maxAmount: parseUnits('5000', 6),
  yourAmount: parseUnits('1000', 6),
  theirAmount: parseUnits('1500', 6),
  coveredEvent: 'mutual ops',
  maxPenaltyBps: 4000,
  riskTier: 'mid',
}

const mutualAid: MutualAidOffer = {
  id: 'aid-1',
  pattern: 'mutual-aid',
  name: 'Aid',
  description: 'desc',
  whitepaperRef: '§6.2',
  counterparty: COUNTERPARTY,
  arbiter: ARBITER,
  arbiterKind: 'multisig',
  minAmount: parseUnits('100', 6),
  maxAmount: parseUnits('5000', 6),
  yourAmount: parseUnits('500', 6),
  theirAmount: parseUnits('500', 6),
  settlementCapEachWay: parseUnits('250', 6),
  coveredEvents: ['x'],
  maxPenaltyBps: 2000,
  riskTier: 'low',
}

describe('isAgreementOffer', () => {
  it('reciprocal-mutual + mutual-aid are agreement-shape', () => {
    expect(isAgreementOffer(reciprocal)).toBe(true)
    expect(isAgreementOffer(mutualAid)).toBe(true)
  })
  it('avs-stake is not', () => {
    const o = { ...reciprocal, pattern: 'avs-stake' } as unknown as MarketOffer
    expect(isAgreementOffer(o)).toBe(false)
  })
})

describe('lockedAgreementTerms', () => {
  it('reciprocal-mutual disables bilateral settlement', () => {
    const t = lockedAgreementTerms(reciprocal)
    expect(t.maxFlowProposerToAcceptor).toBe(0n)
    expect(t.maxFlowAcceptorToProposer).toBe(0n)
    expect(t.maxPenaltyBps).toBe(4000)
    expect(t.acceptorAmount).toBe(parseUnits('1500', 6))
  })

  it('mutual-aid mirrors settlementCapEachWay onto both directions', () => {
    const t = lockedAgreementTerms(mutualAid)
    expect(t.maxFlowProposerToAcceptor).toBe(parseUnits('250', 6))
    expect(t.maxFlowAcceptorToProposer).toBe(parseUnits('250', 6))
  })

  it('throws for non-agreement patterns', () => {
    const o = { ...reciprocal, pattern: 'avs-stake' } as unknown as MarketOffer
    expect(() => lockedAgreementTerms(o)).toThrow()
  })
})

describe('buildOfferProposeParams', () => {
  const goodInput = {
    connectedAddress: CONNECTED,
    proposerAmount: parseUnits('1000', 6),
    challengeWindowSecs: 86_400,
    yieldShareBps: 0,
    proposalDurationSecs: 86_400 * 7,
    metadataURI: '',
    metadataHash: '',
  }

  it('rejects non-agreement pattern up front', () => {
    const o = { ...reciprocal, pattern: 'avs-stake' } as unknown as MarketOffer
    expect(buildOfferProposeParams(o, goodInput)).toEqual({
      ok: false,
      error: "OFFER PATTERN 'avs-stake' NOT AGREEMENT SHAPE",
    })
  })

  it('rejects zero proposer amount', () => {
    expect(
      buildOfferProposeParams(reciprocal, { ...goodInput, proposerAmount: 0n }),
    ).toEqual({ ok: false, error: 'YOUR STAKE MUST BE GREATER THAN ZERO' })
  })

  it('rejects sub-24h challenge window only when negotiable', () => {
    expect(
      buildOfferProposeParams(
        { ...reciprocal, negotiableFields: ['amount', 'challengeWindow'] },
        { ...goodInput, challengeWindowSecs: 3_600 },
      ),
    ).toEqual({ ok: false, error: 'FORFEIT EXECUTION DELAY MUST BE AT LEAST 24 HOURS' })
  })

  it('ignores input challenge window / proposal duration when not negotiable (fixed deal)', () => {
    const out = buildOfferProposeParams(reciprocal, {
      ...goodInput,
      challengeWindowSecs: 3_600, // ignored
      proposalDurationSecs: 1, // ignored
    })
    expect(out.ok).toBe(true)
    if (!out.ok) return
    expect(out.params.challengeWindow).toBe(86_400n) // offer default
    expect(out.params.proposalDuration).toBe(604_800n) // 7-day default
  })

  it('sources an offer-set challenge window when not negotiable', () => {
    const out = buildOfferProposeParams(
      { ...reciprocal, challengeWindowSecs: 172_800 },
      { ...goodInput, challengeWindowSecs: 999 },
    )
    expect(out.ok).toBe(true)
    if (!out.ok) return
    expect(out.params.challengeWindow).toBe(172_800n)
  })

  it('honours proposal duration when expiry is negotiable', () => {
    const out = buildOfferProposeParams(
      { ...reciprocal, negotiableFields: ['amount', 'expiry'] },
      { ...goodInput, proposalDurationSecs: 86_400 * 3 },
    )
    expect(out.ok).toBe(true)
    if (!out.ok) return
    expect(out.params.proposalDuration).toBe(BigInt(86_400 * 3))
  })

  it('produces locked params for reciprocal-mutual', () => {
    const out = buildOfferProposeParams(reciprocal, goodInput)
    expect(out.ok).toBe(true)
    if (!out.ok) return
    expect(out.params.arbiter).toBe(ARBITER)
    expect(out.params.acceptor).toBe(COUNTERPARTY)
    expect(out.params.acceptorAmount).toBe(parseUnits('1500', 6))
    expect(out.params.maxPenaltyBps).toBe(4000)
    expect(out.params.maxFlowProposerToAcceptor).toBe(0n)
    expect(out.params.maxFlowAcceptorToProposer).toBe(0n)
  })

  it('produces locked params for mutual-aid with settlement caps', () => {
    const out = buildOfferProposeParams(mutualAid, goodInput)
    expect(out.ok).toBe(true)
    if (!out.ok) return
    expect(out.params.maxFlowProposerToAcceptor).toBe(parseUnits('250', 6))
    expect(out.params.maxFlowAcceptorToProposer).toBe(parseUnits('250', 6))
  })
})
