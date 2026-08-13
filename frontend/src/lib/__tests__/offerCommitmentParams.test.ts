import { describe, expect, it } from 'vitest'
import { parseEther, parseUnits, type Address } from 'viem'

import {
  buildOfferCommitParams,
  isNegotiable,
  isSingleCommitOffer,
  lockedOfferTerms,
} from '../offerCommitmentParams'
import type {
  AgentSlaBondOffer,
  AgentUnderwritingOffer,
  AvsStakeOffer,
  DirectCoverageOffer,
  MarketOffer,
  YieldDonationOffer,
} from '../../config/marketOffers'
import { ZERO_HASH } from '../../utils/metadataForm'

const ARBITER = '0x4838B106FCe9647Bdf1E7877BF73cE8B0BAD5f97' as const
const COUNTERPARTY = '0x742d35Cc6634C0532925a3b844Bc454e4438f44e' as const
const CONNECTED = '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' as Address

const baseAvs: AvsStakeOffer = {
  id: 'avs-1',
  pattern: 'avs-stake',
  name: 'AVS',
  description: 'desc',
  whitepaperRef: '§4',
  counterparty: COUNTERPARTY,
  arbiter: ARBITER,
  arbiterKind: 'service',
  minAmount: parseEther('100'),
  maxAmount: parseEther('1000'),
  yieldBps: 850,
  cadence: 'epoch',
  maxPenaltyBps: 5000,
  forfeitConditions: 'x',
  riskTier: 'mid',
}

const baseDirect: DirectCoverageOffer = {
  id: 'direct-1',
  pattern: 'direct-coverage',
  name: 'Direct',
  description: 'desc',
  whitepaperRef: '§5.2',
  counterparty: COUNTERPARTY,
  arbiter: ARBITER,
  arbiterKind: 'optimistic',
  minAmount: parseUnits('1000', 6),
  maxAmount: parseUnits('50000', 6),
  sumInsured: parseUnits('25000', 6),
  premiumRate: { kind: 'apr', bps: 600 },
  coveredEvent: 'exploit',
  maxPenaltyBps: 5000,
  riskTier: 'mid',
}

const baseAgent: AgentUnderwritingOffer = {
  id: 'agent-1',
  pattern: 'agent-underwriting',
  name: 'Agent',
  description: 'desc',
  whitepaperRef: '§5.4',
  counterparty: COUNTERPARTY,
  arbiter: ARBITER,
  arbiterKind: 'service',
  minAmount: parseUnits('500', 6),
  maxAmount: parseUnits('25000', 6),
  agentVault: COUNTERPARTY,
  profitShareBps: 2000,
  hwmEnabled: true,
  agentStrategy: 'x',
  sumInsured: parseUnits('12500', 6),
  lossThresholdBps: 1500,
  riskTier: 'high',
}

const baseDonation: YieldDonationOffer = {
  id: 'don-1',
  pattern: 'yield-donation',
  name: 'Donate',
  description: 'desc',
  whitepaperRef: '§6.1',
  counterparty: COUNTERPARTY,
  arbiter: ARBITER,
  arbiterKind: 'self',
  minAmount: parseEther('25'),
  maxAmount: parseEther('100000'),
  suggestedYieldShareBps: 500,
  beneficiaryMission: 'x',
  riskTier: 'low',
}

const baseSlaBond: AgentSlaBondOffer = {
  id: 'sla-bond-1',
  pattern: 'agent-sla-bond',
  name: 'SLA bond',
  description: 'desc',
  whitepaperRef: '§5.4',
  counterparty: COUNTERPARTY,
  arbiter: ARBITER,
  arbiterKind: 'optimistic',
  minAmount: parseUnits('1', 15),
  maxAmount: parseUnits('100000', 15),
  challengeWindowSecs: 86_400,
  negotiableFields: ['amount', 'challengeWindow', 'expiry', 'metadata'],
  maxPenaltyBps: 10_000,
  slaSummary: 'x',
  metadataTemplateJson: '{"type":"agent-sla.v1","service":"<your-service>"}',
  riskTier: 'high',
}

describe('isSingleCommitOffer', () => {
  it('returns true for the five supported single-commit patterns', () => {
    for (const o of [baseAvs, baseDirect, baseAgent, baseSlaBond, baseDonation]) {
      expect(isSingleCommitOffer(o)).toBe(true)
    }
  })

  it('returns false for other patterns', () => {
    const meshPool = {
      ...baseDirect,
      pattern: 'mesh-pool',
    } as unknown as MarketOffer
    expect(isSingleCommitOffer(meshPool)).toBe(false)
  })
})

describe('lockedOfferTerms', () => {
  it('avs-stake → maxPenaltyBps from offer, yieldShareBps=0', () => {
    const t = lockedOfferTerms(baseAvs)
    expect(t.maxPenaltyBps).toBe(5000)
    expect(t.yieldShareBps).toBe(0)
  })

  it('direct-coverage → maxPenaltyBps from offer, yieldShareBps=0', () => {
    const t = lockedOfferTerms(baseDirect)
    expect(t.maxPenaltyBps).toBe(5000)
    expect(t.yieldShareBps).toBe(0)
  })

  it('agent-underwriting → maxPenaltyBps=10000 (full forfeit), yieldShareBps=0', () => {
    const t = lockedOfferTerms(baseAgent)
    expect(t.maxPenaltyBps).toBe(10_000)
    expect(t.yieldShareBps).toBe(0)
  })

  it('agent-sla-bond → maxPenaltyBps from offer, yieldShareBps=0', () => {
    const t = lockedOfferTerms(baseSlaBond)
    expect(t.maxPenaltyBps).toBe(10_000)
    expect(t.yieldShareBps).toBe(0)
    // The pattern ships metadata-negotiable so the SLA template is editable.
    expect(isNegotiable(t, 'metadata')).toBe(true)
    expect(isNegotiable(t, 'challengeWindow')).toBe(true)
  })

  it('yield-donation → maxPenaltyBps=0, yieldShareBps=suggestedYieldShareBps', () => {
    const t = lockedOfferTerms(baseDonation)
    expect(t.maxPenaltyBps).toBe(0)
    expect(t.yieldShareBps).toBe(500)
  })

  it('defaults to a fixed deal — challenge window 86_400 and amount-only negotiable', () => {
    const t = lockedOfferTerms(baseDirect)
    expect(t.challengeWindowSecs).toBe(86_400)
    expect(t.negotiableFields).toEqual(['amount'])
    expect(isNegotiable(t, 'amount')).toBe(true)
    expect(isNegotiable(t, 'challengeWindow')).toBe(false)
    expect(isNegotiable(t, 'expiry')).toBe(false)
    expect(isNegotiable(t, 'metadata')).toBe(false)
  })

  it('passes through an offer-set challenge window and negotiable fields', () => {
    const t = lockedOfferTerms({
      ...baseDirect,
      challengeWindowSecs: 259_200,
      negotiableFields: ['amount', 'metadata'],
    })
    expect(t.challengeWindowSecs).toBe(259_200)
    expect(isNegotiable(t, 'metadata')).toBe(true)
  })
})

describe('buildOfferCommitParams', () => {
  const goodInput = {
    connectedAddress: CONNECTED,
    amount: parseUnits('1500', 6),
    challengeWindowSecs: 86_400,
    expiryValue: '',
    metadataURI: '',
    metadataHash: '',
  }

  it('rejects amount below offer minimum', () => {
    const out = buildOfferCommitParams(baseDirect, {
      ...goodInput,
      amount: parseUnits('500', 6), // below 1000 min
    })
    expect(out).toEqual({ ok: false, error: 'AMOUNT BELOW OFFER MINIMUM' })
  })

  it('rejects amount above offer maximum', () => {
    const out = buildOfferCommitParams(baseDirect, {
      ...goodInput,
      amount: parseUnits('100000', 6), // above 50_000 max
    })
    expect(out).toEqual({ ok: false, error: 'AMOUNT ABOVE OFFER MAXIMUM' })
  })

  it('rejects sub-24h challenge window only when the offer makes it negotiable', () => {
    const out = buildOfferCommitParams(
      { ...baseDirect, negotiableFields: ['amount', 'challengeWindow'] },
      { ...goodInput, challengeWindowSecs: 3_600 },
    )
    expect(out).toEqual({ ok: false, error: 'FORFEIT EXECUTION DELAY MUST BE AT LEAST 24 HOURS' })
  })

  it('ignores a sub-24h input challenge window when not negotiable (fixed deal)', () => {
    // Default negotiableFields = ['amount'] ⇒ the offer's window is used and the
    // bad input is never validated.
    const out = buildOfferCommitParams(baseDirect, { ...goodInput, challengeWindowSecs: 3_600 })
    expect(out.ok).toBe(true)
    if (!out.ok) return
    expect(out.params.challengeWindow).toBe(86_400n)
  })

  it('sources a non-negotiable challenge window from the offer', () => {
    const out = buildOfferCommitParams(
      { ...baseDirect, challengeWindowSecs: 172_800 },
      { ...goodInput, challengeWindowSecs: 999_999 }, // input ignored
    )
    expect(out.ok).toBe(true)
    if (!out.ok) return
    expect(out.params.challengeWindow).toBe(172_800n)
  })

  it('rejects unsupported pattern up front', () => {
    const meshPool = {
      ...baseDirect,
      pattern: 'mesh-pool',
    } as unknown as MarketOffer
    const out = buildOfferCommitParams(meshPool, goodInput)
    expect(out).toEqual({
      ok: false,
      error: "OFFER PATTERN 'mesh-pool' NOT SUPPORTED YET",
    })
  })

  it('rejects when wallet not connected', () => {
    const out = buildOfferCommitParams(baseDirect, {
      ...goodInput,
      connectedAddress: undefined,
    })
    expect(out).toEqual({ ok: false, error: 'WALLET NOT CONNECTED' })
  })

  it('produces locked params for direct-coverage', () => {
    const out = buildOfferCommitParams(baseDirect, goodInput)
    expect(out.ok).toBe(true)
    if (!out.ok) return
    expect(out.params.arbiter).toBe(ARBITER)
    expect(out.params.counterparty).toBe(COUNTERPARTY)
    expect(out.params.amount).toBe(parseUnits('1500', 6))
    expect(out.params.maxPenaltyBps).toBe(5000)
    expect(out.params.challengeWindow).toBe(86_400n)
    expect(out.params.metadataURI).toBe('')
    expect(out.params.metadataHash).toBe(ZERO_HASH)
    expect(out.params.expiresAt).toBe(0n) // baseDirect has no durationSecs ⇒ open-ended
  })

  it('respects user-supplied expiry only when the offer makes expiry negotiable', () => {
    // 2030-01-01 — well past any test-runner clock skew.
    const out = buildOfferCommitParams(
      { ...baseDirect, negotiableFields: ['amount', 'expiry'] },
      { ...goodInput, expiryValue: '2030-01-01T00:00:00' },
    )
    expect(out.ok).toBe(true)
    if (!out.ok) return
    const expectedSec = BigInt(Math.floor(new Date('2030-01-01T00:00:00').getTime() / 1000))
    expect(out.params.expiresAt).toBe(expectedSec)
  })

  it('ignores user expiry when not negotiable (fixed deal uses offer duration)', () => {
    const out = buildOfferCommitParams(
      { ...baseDirect, durationSecs: 1_000 },
      { ...goodInput, expiryValue: '2030-01-01T00:00:00' },
    )
    expect(out.ok).toBe(true)
    if (!out.ok) return
    // Sourced from now + durationSecs, NOT the 2030 user value.
    expect(out.params.expiresAt).toBeLessThan(BigInt(Math.floor(new Date('2030-01-01T00:00:00').getTime() / 1000)))
    expect(out.params.expiresAt).toBeGreaterThan(0n)
  })

  it('drops user metadata when metadata is not negotiable', () => {
    const out = buildOfferCommitParams(baseDirect, {
      ...goodInput,
      metadataURI: 'ipfs://should-be-ignored',
    })
    expect(out.ok).toBe(true)
    if (!out.ok) return
    expect(out.params.metadataURI).toBe('')
    expect(out.params.metadataHash).toBe(ZERO_HASH)
  })

  it('keeps user metadata when metadata is negotiable', () => {
    const out = buildOfferCommitParams(
      { ...baseDirect, negotiableFields: ['amount', 'metadata'] },
      { ...goodInput, metadataURI: 'ipfs://kept' },
    )
    expect(out.ok).toBe(true)
    if (!out.ok) return
    expect(out.params.metadataURI).toBe('ipfs://kept')
  })

  it('yield-donation routes suggestedYieldShareBps onto yieldShareBps', () => {
    const out = buildOfferCommitParams(baseDonation, {
      ...goodInput,
      amount: parseEther('100'),
    })
    expect(out.ok).toBe(true)
    if (!out.ok) return
    expect(out.params.maxPenaltyBps).toBe(0)
  })

  it('agent-sla-bond keeps the derived data: URI + hash as commitment metadata', () => {
    const json = baseSlaBond.metadataTemplateJson!
    const out = buildOfferCommitParams(baseSlaBond, {
      ...goodInput,
      amount: parseUnits('10', 15),
      metadataURI: `data:application/json;base64,${btoa(json)}`,
      metadataHash: '0x' + 'a'.repeat(64),
    })
    expect(out.ok).toBe(true)
    if (!out.ok) return
    expect(out.params.maxPenaltyBps).toBe(10_000)
    expect(out.params.metadataURI.startsWith('data:application/json;base64,')).toBe(true)
    expect(out.params.metadataHash).toBe('0x' + 'a'.repeat(64))
  })

  it('agent-underwriting locks maxPenaltyBps to 10_000', () => {
    const out = buildOfferCommitParams(baseAgent, {
      ...goodInput,
      amount: parseUnits('1000', 6),
    })
    expect(out.ok).toBe(true)
    if (!out.ok) return
    expect(out.params.maxPenaltyBps).toBe(10_000)
  })
})
