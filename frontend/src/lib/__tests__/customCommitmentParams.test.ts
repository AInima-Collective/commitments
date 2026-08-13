import { describe, expect, it } from 'vitest'
import { parseUnits, type Address } from 'viem'

import { buildCustomParams, type CustomCommitInput } from '../customCommitmentParams'
import { ZERO_HASH } from '../../utils/metadataForm'

const CONNECTED = '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' as Address
const ARBITER = '0x4838B106FCe9647Bdf1E7877BF73cE8B0BAD5f97' as Address
const COUNTERPARTY = '0x742d35Cc6634C0532925a3b844Bc454e4438f44e' as Address
const ZERO = '0x0000000000000000000000000000000000000000' as Address

const goodInput: CustomCommitInput = {
  connectedAddress: CONNECTED,
  arbiter: ARBITER,
  counterparty: COUNTERPARTY,
  amount: parseUnits('100', 6),
  maxPenaltyBps: 1000,
  challengeWindowSecs: 86_400,
  expiryValue: '',
  metadataURI: '',
  metadataHash: '',
}

describe('buildCustomParams', () => {
  it('rejects when wallet not connected', () => {
    expect(buildCustomParams({ ...goodInput, connectedAddress: undefined })).toEqual({
      ok: false,
      error: 'WALLET NOT CONNECTED',
    })
  })

  it('defaults an unset arbiter to the connected wallet (self-arbiter)', () => {
    const out = buildCustomParams({ ...goodInput, arbiter: undefined })
    expect(out.ok).toBe(true)
    if (!out.ok) return
    expect(out.params.arbiter).toBe(CONNECTED)
  })

  it('uses an explicit arbiter when provided', () => {
    const out = buildCustomParams(goodInput)
    expect(out.ok).toBe(true)
    if (!out.ok) return
    expect(out.params.arbiter).toBe(ARBITER)
  })

  it('treats a blank counterparty as the zero address (one-sided)', () => {
    const out = buildCustomParams({ ...goodInput, counterparty: '' })
    expect(out.ok).toBe(true)
    if (!out.ok) return
    expect(out.params.counterparty).toBe(ZERO)
  })

  it('rejects a malformed counterparty', () => {
    expect(buildCustomParams({ ...goodInput, counterparty: '0xnothex' })).toEqual({
      ok: false,
      error: 'INVALID COUNTERPARTY ADDRESS',
    })
  })

  it('rejects non-positive amount', () => {
    expect(buildCustomParams({ ...goodInput, amount: 0n })).toEqual({
      ok: false,
      error: 'AMOUNT MUST BE GREATER THAN ZERO',
    })
    expect(buildCustomParams({ ...goodInput, amount: undefined })).toEqual({
      ok: false,
      error: 'AMOUNT MUST BE GREATER THAN ZERO',
    })
  })

  it('rejects out-of-range max penalty', () => {
    expect(buildCustomParams({ ...goodInput, maxPenaltyBps: 10_001 })).toEqual({
      ok: false,
      error: 'MAX PENALTY MUST BE BETWEEN 0 AND 10000 BPS',
    })
    expect(buildCustomParams({ ...goodInput, maxPenaltyBps: -1 })).toEqual({
      ok: false,
      error: 'MAX PENALTY MUST BE BETWEEN 0 AND 10000 BPS',
    })
  })

  it('rejects a sub-24h challenge window', () => {
    expect(buildCustomParams({ ...goodInput, challengeWindowSecs: 3_600 })).toEqual({
      ok: false,
      error: 'FORFEIT EXECUTION DELAY MUST BE AT LEAST 24 HOURS',
    })
  })

  it('builds full params with defaults (no expiry, no metadata)', () => {
    const out = buildCustomParams(goodInput)
    expect(out.ok).toBe(true)
    if (!out.ok) return
    expect(out.params).toEqual({
      arbiter: ARBITER,
      counterparty: COUNTERPARTY,
      amount: parseUnits('100', 6),
      maxPenaltyBps: 1000,
      challengeWindow: 86_400n,
      expiresAt: 0n,
      metadataURI: '',
      metadataHash: ZERO_HASH,
    })
  })

  it('parses a datetime-local expiry to unix seconds', () => {
    const out = buildCustomParams({ ...goodInput, expiryValue: '2030-01-01T00:00:00' })
    expect(out.ok).toBe(true)
    if (!out.ok) return
    expect(out.params.expiresAt).toBe(
      BigInt(Math.floor(new Date('2030-01-01T00:00:00').getTime() / 1000)),
    )
  })
})
