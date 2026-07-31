import { describe, expect, it } from 'vitest'

import { getCommitmentIntent, getCommitmentIntents } from '../commitmentIntents'

describe('getCommitmentIntents', () => {
  const intents = getCommitmentIntents()

  it('exposes the four create-flow intents', () => {
    expect(intents.map((i) => i.id)).toEqual([
      'delegate-stake',
      'donate-yield',
      'mutual-cover',
      'custom',
    ])
  })

  it('every intent has a label, blurb, and whitepaper ref', () => {
    for (const i of intents) {
      expect(i.label.length).toBeGreaterThan(0)
      expect(i.blurb.length).toBeGreaterThan(0)
      expect(i.whitepaperRef).toMatch(/^§/)
    }
  })

  it('redirect intents carry a destination; mode intents do not', () => {
    for (const i of intents) {
      if (i.mode === 'redirect') {
        expect(i.redirectTo).toBeTruthy()
      } else {
        expect(['delegate', 'donate', 'custom']).toContain(i.mode)
      }
    }
  })

  it('delegate-stake seeds sane defaults', () => {
    const delegate = getCommitmentIntent('delegate-stake')
    expect(delegate?.defaults?.challengeWindowSecs).toBe(86_400)
    expect(delegate?.defaults?.maxPenaltyBps).toBeGreaterThan(0)
  })

  it('getCommitmentIntent looks up by id and returns undefined for unknown', () => {
    expect(getCommitmentIntent('custom')?.mode).toBe('custom')
    // @ts-expect-error — exercising the unknown-id branch
    expect(getCommitmentIntent('nope')).toBeUndefined()
  })
})
