import { describe, expect, it } from 'vitest'
import { type Address } from 'viem'
import {
  filterOperators,
  deriveServiceTags,
  isFilterActive,
  type OperatorFilterInput,
  type OperatorFilterState,
} from '../operatorFilter'

// Distinct 40-hex-char addresses so substring tests are unambiguous.
const ADDR_1 = '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' as Address
const ADDR_2 = '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb' as Address
const ADDR_3 = '0xcccccccccccccccccccccccccccccccccccccccc' as Address
const ADDR_4 = '0xdddddddddddddddddddddddddddddddddddddddd' as Address

function op(
  addr: Address,
  services?: string[],
  name?: string,
  serviceRegistered = false,
): OperatorFilterInput {
  return {
    operator: {
      address: addr,
      active: true,
      selfStakeCommitmentId: 0n,
      totalDelegatedStake: 100n,
      activeDelegationCount: 1n,
      registeredAt: 0n,
    },
    metadata:
      name !== undefined || services !== undefined ? { name, services } : null,
    serviceInfo: serviceRegistered
      ? {
          address: addr,
          registeredInService: true,
          signingKey: null,
          votingPower: 1n,
        }
      : undefined,
  }
}

const EMPTY_STATE: OperatorFilterState = {
  search: '',
  selectedTags: new Set<string>(),
  serviceOnly: false,
}

describe('filterOperators', () => {
  it('returns full list when filter state is empty', () => {
    const inputs = [op(ADDR_1), op(ADDR_2), op(ADDR_3)]
    const out = filterOperators(inputs, EMPTY_STATE)
    expect(out).toHaveLength(3)
    expect(out.map((e) => e.operator.address)).toEqual([ADDR_1, ADDR_2, ADDR_3])
  })

  it('matches by address substring (case-insensitive)', () => {
    const inputs = [op(ADDR_1), op(ADDR_2)]
    // ADDR_1 starts with 0xaa... — searching "AA" (uppercase) must hit
    const out = filterOperators(inputs, { ...EMPTY_STATE, search: 'AA' })
    expect(out).toHaveLength(1)
    expect(out[0].operator.address).toBe(ADDR_1)
  })

  it('matches by metadata.name substring (case-insensitive)', () => {
    const inputs = [
      op(ADDR_1, undefined, 'Acme Node Co.'),
      op(ADDR_2, undefined, 'Other Co.'),
    ]
    const out = filterOperators(inputs, { ...EMPTY_STATE, search: 'acme' })
    expect(out).toHaveLength(1)
    expect(out[0].metadata?.name).toBe('Acme Node Co.')
  })

  it('returns empty array when search has no match', () => {
    const inputs = [op(ADDR_1, undefined, 'Acme'), op(ADDR_2, undefined, 'Beta')]
    const out = filterOperators(inputs, {
      ...EMPTY_STATE,
      search: 'no-such-string',
    })
    expect(out).toEqual([])
  })

  it('tag filter excludes operators without metadata.services', () => {
    const inputs = [
      op(ADDR_1, ['commitments-v2']),
      op(ADDR_2, undefined, 'No Services Op'),
      op(ADDR_3, undefined),
    ]
    const out = filterOperators(inputs, {
      ...EMPTY_STATE,
      selectedTags: new Set(['commitments-v2']),
    })
    expect(out).toHaveLength(1)
    expect(out[0].operator.address).toBe(ADDR_1)
  })

  it('tag filter retains operators matching at least one selected tag (OR semantics)', () => {
    const inputs = [
      op(ADDR_1, ['commitments-v2', 'service-mainnet']),
      op(ADDR_2, ['service-mainnet']),
      op(ADDR_3, ['some-other-service']),
    ]
    const out = filterOperators(inputs, {
      ...EMPTY_STATE,
      selectedTags: new Set(['commitments-v2', 'service-mainnet']),
    })
    expect(out).toHaveLength(2)
    expect(out.map((e) => e.operator.address).sort()).toEqual(
      [ADDR_1, ADDR_2].sort(),
    )
  })

  it('service-only retains only registeredInService operators', () => {
    const inputs = [
      op(ADDR_1, undefined, undefined, true),
      op(ADDR_2, undefined, undefined, false),
      op(ADDR_3, undefined, undefined, true),
    ]
    const out = filterOperators(inputs, { ...EMPTY_STATE, serviceOnly: true })
    expect(out).toHaveLength(2)
    expect(out.map((e) => e.operator.address).sort()).toEqual(
      [ADDR_1, ADDR_3].sort(),
    )
  })

  it('combined filters intersect across all three dimensions', () => {
    const inputs = [
      // Match: address starts 0xaa, has commitments-v2, registered in service
      op(ADDR_1, ['commitments-v2'], 'Acme', true),
      // Miss: name doesn't match search "acme"
      op(ADDR_2, ['commitments-v2'], 'Beta', true),
      // Miss: no commitments-v2 tag
      op(ADDR_3, ['other-service'], 'Acme Two', true),
      // Miss: not registered in service
      op(ADDR_4, ['commitments-v2'], 'Acme Three', false),
    ]
    const out = filterOperators(inputs, {
      search: 'acme',
      selectedTags: new Set(['commitments-v2']),
      serviceOnly: true,
    })
    expect(out).toHaveLength(1)
    expect(out[0].operator.address).toBe(ADDR_1)
  })

  it('empty filter state with empty operator list returns []', () => {
    const out = filterOperators([], EMPTY_STATE)
    expect(out).toEqual([])
  })
})

describe('deriveServiceTags', () => {
  it('returns sorted dedup union', () => {
    const inputs = [
      op(ADDR_1, ['service-mainnet', 'commitments-v2']),
      op(ADDR_2, ['commitments-v2', 'arbiter-set']),
      op(ADDR_3, ['service-mainnet']),
    ]
    const tags = deriveServiceTags(inputs)
    expect(tags).toEqual(['arbiter-set', 'commitments-v2', 'service-mainnet'])
  })

  it('returns empty array when no operator has metadata', () => {
    const inputs = [op(ADDR_1), op(ADDR_2), op(ADDR_3)]
    expect(deriveServiceTags(inputs)).toEqual([])
  })
})

describe('isFilterActive', () => {
  it('returns true when search is non-empty after trim', () => {
    expect(
      isFilterActive({ ...EMPTY_STATE, search: '   acme   ' }),
    ).toBe(true)
  })

  it('returns false on default empty state', () => {
    expect(isFilterActive(EMPTY_STATE)).toBe(false)
  })

  it('returns true when at least one tag is selected', () => {
    expect(
      isFilterActive({ ...EMPTY_STATE, selectedTags: new Set(['x']) }),
    ).toBe(true)
  })

  it('returns true when serviceOnly is true', () => {
    expect(isFilterActive({ ...EMPTY_STATE, serviceOnly: true })).toBe(true)
  })
})
