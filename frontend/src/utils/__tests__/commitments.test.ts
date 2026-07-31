import { describe, expect, it } from 'vitest'
import {
  deriveStatus,
  getForfeitState,
  formatBps,
  STATUS_CONFIG,
  type CommitmentStatus,
} from '../commitments'

/** Seconds since epoch, matching the bigint clock deriveStatus/getForfeitState read. */
const nowSecs = (): bigint => BigInt(Math.floor(Date.now() / 1000))

type CommitmentInput = Parameters<typeof deriveStatus>[0]
type ForfeitInput = Parameters<typeof deriveStatus>[1]

const base = (over: Partial<CommitmentInput> = {}): CommitmentInput => ({
  released: false,
  forfeited: false,
  expiresAt: 0n,
  unbondInitiatedAt: undefined,
  ...over,
})

const activeForfeit: NonNullable<ForfeitInput> = {
  initiatedAt: 1_000n,
  executed: false,
  cancelled: false,
}

describe('deriveStatus', () => {
  it('returns FORFEITED first — it outranks every other flag', () => {
    expect(
      deriveStatus(
        base({ forfeited: true, released: true, unbondInitiatedAt: 5n }),
        activeForfeit,
      ),
    ).toBe('FORFEITED')
  })

  it('returns RELEASED when released and not forfeited', () => {
    expect(deriveStatus(base({ released: true, unbondInitiatedAt: 5n }), activeForfeit)).toBe(
      'RELEASED',
    )
  })

  it('returns FORFEIT_PENDING for a live proposal, outranking unbonding', () => {
    expect(deriveStatus(base({ unbondInitiatedAt: 5n }), activeForfeit)).toBe('FORFEIT_PENDING')
  })

  it('treats an executed or cancelled proposal as not pending', () => {
    expect(deriveStatus(base(), { ...activeForfeit, executed: true })).toBe('ACTIVE')
    expect(deriveStatus(base(), { ...activeForfeit, cancelled: true })).toBe('ACTIVE')
  })

  it('treats a zero-initiatedAt proposal struct as no proposal', () => {
    expect(deriveStatus(base(), { initiatedAt: 0n, executed: false, cancelled: false })).toBe(
      'ACTIVE',
    )
  })

  it('returns UNBONDING when an unbond is requested and no proposal is live', () => {
    expect(deriveStatus(base({ unbondInitiatedAt: 5n }), undefined)).toBe('UNBONDING')
  })

  it('returns EXPIRED when past expiry with no other state', () => {
    expect(deriveStatus(base({ expiresAt: nowSecs() - 1_000n }), undefined)).toBe('EXPIRED')
  })

  it('returns ACTIVE for an unexpired commitment (future or no expiry)', () => {
    expect(deriveStatus(base({ expiresAt: nowSecs() + 10_000n }), undefined)).toBe('ACTIVE')
    expect(deriveStatus(base({ expiresAt: 0n }), undefined)).toBe('ACTIVE')
  })

  it('does not treat unbondInitiatedAt === 0n as unbonding', () => {
    expect(deriveStatus(base({ unbondInitiatedAt: 0n }), undefined)).toBe('ACTIVE')
  })

  it('every derivable status has a STATUS_CONFIG entry', () => {
    const statuses: CommitmentStatus[] = [
      'ACTIVE',
      'UNBONDING',
      'RELEASED',
      'FORFEITED',
      'FORFEIT_PENDING',
      'EXPIRED',
    ]
    for (const s of statuses) {
      expect(STATUS_CONFIG[s]).toBeDefined()
      expect(STATUS_CONFIG[s].className).toBeTruthy()
      expect(STATUS_CONFIG[s].ariaLabel).toBeTruthy()
    }
  })
})

describe('getForfeitState', () => {
  it('returns NONE for a missing proposal or a zero-initiatedAt struct', () => {
    expect(getForfeitState(undefined, 86_400n)).toBe('NONE')
    expect(getForfeitState({ initiatedAt: 0n, executed: false, cancelled: false }, 86_400n)).toBe(
      'NONE',
    )
  })

  it('returns EXECUTED / CANCELLED ahead of the window check', () => {
    expect(
      getForfeitState({ initiatedAt: 1_000n, executed: true, cancelled: false }, 86_400n),
    ).toBe('EXECUTED')
    expect(
      getForfeitState({ initiatedAt: 1_000n, executed: false, cancelled: true }, 86_400n),
    ).toBe('CANCELLED')
  })

  it('returns PENDING while inside the challenge window', () => {
    const proposal = { initiatedAt: nowSecs(), executed: false, cancelled: false }
    expect(getForfeitState(proposal, 86_400n)).toBe('PENDING')
  })

  it('returns EXECUTABLE once the challenge window has elapsed', () => {
    const proposal = { initiatedAt: nowSecs() - 100_000n, executed: false, cancelled: false }
    expect(getForfeitState(proposal, 86_400n)).toBe('EXECUTABLE')
  })
})

describe('formatBps', () => {
  it('formats basis points as a fixed 2-decimal percentage', () => {
    expect(formatBps(5_000)).toBe('50.00%')
    expect(formatBps(10_000)).toBe('100.00%')
    expect(formatBps(1_234)).toBe('12.34%')
    expect(formatBps(0)).toBe('0.00%')
  })

  it('accepts bigint input', () => {
    expect(formatBps(2_500n)).toBe('25.00%')
  })
})
