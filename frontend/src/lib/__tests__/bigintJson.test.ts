import { describe, expect, it } from 'vitest'
import { installBigIntJsonSerialization } from '../bigintJson'

// vitest.setup.ts already installs the patch globally; these assertions verify
// the observable contract and that the installer is idempotent.
describe('installBigIntJsonSerialization', () => {
  it('makes JSON.stringify emit bigints as decimal strings', () => {
    expect(JSON.stringify({ amount: 42n })).toBe('{"amount":"42"}')
    expect(JSON.stringify([1n, 2n])).toBe('["1","2"]')
  })

  it('is idempotent — a second install does not throw or change behavior', () => {
    installBigIntJsonSerialization()
    installBigIntJsonSerialization()
    expect(JSON.stringify(7n)).toBe('"7"')
  })
})
