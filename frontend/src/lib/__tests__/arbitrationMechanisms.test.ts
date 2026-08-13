import { describe, expect, it } from 'vitest'

import { mechanismAdapter } from '../arbitrationMechanisms'

describe('mechanism adapters', () => {
  it('requires a trusted configured mechanism id rather than capability bits', () => {
    expect(mechanismAdapter(undefined)).toBeUndefined()
    expect(mechanismAdapter('two-tier')).toEqual(expect.objectContaining({
      id: 'two-tier',
      verification: 'trusted deployment configuration',
    }))
  })

  it('describes a no-case process for every supported adapter', () => {
    for (const id of ['direct', 'manual', 'optimistic-insurance', 'optimistic-mutual', 'attestation', 'two-tier'] as const) {
      expect(mechanismAdapter(id)?.noCase.length).toBeGreaterThan(20)
    }
  })
})
