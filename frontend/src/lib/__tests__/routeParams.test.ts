import { describe, expect, it } from 'vitest'

import { parseIdParam } from '../routeParams'

describe('parseIdParam', () => {
  it('reads a decimal id and rejects anything else', () => {
    expect(parseIdParam('0')).toBe(0n)
    expect(parseIdParam('42')).toBe(42n)
    for (const raw of [undefined, '', '007', '-1', '0x10', ' 1', 'abc']) expect(parseIdParam(raw)).toBeNull()
  })
})
