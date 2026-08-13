import { describe, expect, it } from 'vitest'

import { arbiterProfilePath, commitmentDetailPath } from '../arbitrationRoutes'

const ARBITER = '0x1000000000000000000000000000000000000001'
const MANAGER = '0x2000000000000000000000000000000000000002'

describe('arbitration routes', () => {
  it('builds the public arbiter route used by commitment detail and Explorer', () => {
    expect(arbiterProfilePath(ARBITER)).toBe(`/app/arbiters/${ARBITER}`)
  })

  it('keeps commitment links manager-scoped when an id may repeat', () => {
    expect(commitmentDetailPath(42n, MANAGER)).toBe(`/app/commitments/42?manager=${MANAGER}`)
  })
})
