import { describe, expect, it } from 'vitest'
import { type Address } from 'viem'
import {
  deriveViewerRole,
  getAvailableActions,
  type AvailableActionsInput,
  type ResolveActionKind,
  FORFEIT_PROPOSAL_TTL_SECONDS,
} from '../resolveActions'
import { type CommitmentWithStatus } from '../commitments'

const COMMITTER = '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' as Address
const COUNTERPARTY = '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb' as Address
const ARBITER = '0xcccccccccccccccccccccccccccccccccccccccc' as Address
const STRANGER = '0xdddddddddddddddddddddddddddddddddddddddd' as Address
const TOKEN = '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee' as Address
const ADAPTER = '0xffffffffffffffffffffffffffffffffffffffff' as Address
const STRATEGY = '0x1111111111111111111111111111111111111111' as Address

const NOW = 1_700_000_000n

function commitment(overrides: Partial<CommitmentWithStatus> = {}): CommitmentWithStatus {
  return {
    id: 1n,
    committer: COMMITTER,
    counterparty: COUNTERPARTY,
    arbiter: ARBITER,
    token: TOKEN,
    adapter: ADAPTER,
    amount: 100n * 10n ** 18n,
    maxPenaltyBps: 5000,
    challengeWindow: 86_400n,
    createdAt: NOW - 7n * 86_400n,
    expiresAt: 0n,
    released: false,
    forfeited: false,
    status: 'ACTIVE',
    ...overrides,
  }
}

function input(overrides: Partial<AvailableActionsInput>): AvailableActionsInput {
  return {
    commitment: commitment(),
    forfeit: { state: 'NONE', initiatedAt: 0n, deadline: 0n },
    unbond: { unbondInitiatedAt: 0n, unbondingPeriod: 7n * 86_400n },
    pendingYield: 0n,
    viewerRole: 'spectator',
    isConnected: true,
    nowSec: NOW,
    ...overrides,
  }
}

function kinds(actions: { kind: ResolveActionKind }[]): ResolveActionKind[] {
  return actions.map((a) => a.kind)
}

describe('deriveViewerRole', () => {
  const c = commitment()
  it('treats undefined viewer as spectator', () => {
    expect(deriveViewerRole(c, undefined)).toBe('spectator')
  })
  it('matches arbiter', () => {
    expect(deriveViewerRole(c, ARBITER)).toBe('arbiter')
  })
  it('matches committer', () => {
    expect(deriveViewerRole(c, COMMITTER)).toBe('committer')
  })
  it('matches counterparty', () => {
    expect(deriveViewerRole(c, COUNTERPARTY)).toBe('counterparty')
  })
  it('returns spectator when address matches none of the parties', () => {
    expect(deriveViewerRole(c, STRANGER)).toBe('spectator')
  })
  it('is case-insensitive on hex address comparison', () => {
    const upper = ARBITER.toUpperCase() as Address
    expect(deriveViewerRole(c, upper)).toBe('arbiter')
  })
  it('arbiter wins when arbiter == committer (self-arbitration)', () => {
    const c2 = commitment({ committer: ARBITER })
    expect(deriveViewerRole(c2, ARBITER)).toBe('arbiter')
  })
})

describe('getAvailableActions — ACTIVE state', () => {
  it('arbiter sees release + initiate-forfeit', () => {
    const result = getAvailableActions(input({ viewerRole: 'arbiter' }))
    expect(kinds(result)).toEqual(['release', 'initiate-forfeit'])
    expect(result.every((a) => a.enabled)).toBe(true)
  })

  it('committer sees request-unbond when no expiry', () => {
    const result = getAvailableActions(input({ viewerRole: 'committer' }))
    expect(kinds(result)).toEqual(['request-unbond'])
    expect(result[0].enabled).toBe(true)
  })

  describe('mutual member lifecycle', () => {
    const member = (overrides: Partial<NonNullable<AvailableActionsInput['mutual']>> = {}) => ({
      isMember: true,
      lossPending: false,
      unsettled: false,
      owedUnits: 0n,
      exitRequestedAt: 0n,
      deallocationWindow: 3n * 86_400n,
      ...overrides,
    })

    it('replaces request-unbond with request-mutual-exit for member capital', () => {
      const result = getAvailableActions(input({ viewerRole: 'committer', mutual: member() }))
      const k = kinds(result)
      expect(k).not.toContain('request-unbond')
      expect(k).toContain('request-mutual-exit')
      const exit = result.find((a) => a.kind === 'request-mutual-exit')!
      expect(exit.enabled).toBe(true)
    })

    it('only the committer sees request-mutual-exit', () => {
      const result = getAvailableActions(input({ viewerRole: 'counterparty', mutual: member() }))
      expect(kinds(result)).not.toContain('request-mutual-exit')
    })

    it('a pending loss declaration disables exit with a reason', () => {
      const result = getAvailableActions(
        input({ viewerRole: 'committer', mutual: member({ lossPending: true }) }),
      )
      const exit = result.find((a) => a.kind === 'request-mutual-exit')!
      expect(exit.enabled).toBe(false)
      expect(exit.reason).toMatch(/loss declaration/i)
    })

    it('offers settle-mutual-loss to any connected wallet when unsettled', () => {
      const result = getAvailableActions(
        input({ viewerRole: 'spectator', mutual: member({ unsettled: true, owedUnits: 5n }) }),
      )
      const settle = result.find((a) => a.kind === 'settle-mutual-loss')!
      expect(settle.enabled).toBe(true)
    })

    it('release is disabled with a countdown reason inside the deallocation window', () => {
      const result = getAvailableActions(
        input({
          viewerRole: 'committer',
          mutual: member({ exitRequestedAt: NOW - 86_400n }),
        }),
      )
      const k = kinds(result)
      expect(k).not.toContain('request-mutual-exit')
      const release = result.find((a) => a.kind === 'release-mutual-member')!
      expect(release.enabled).toBe(false)
      expect(release.reason).toMatch(/elapses in/i)
    })

    it('release is enabled once the window elapsed and the member is settled', () => {
      const result = getAvailableActions(
        input({
          viewerRole: 'committer',
          mutual: member({ exitRequestedAt: NOW - 4n * 86_400n }),
        }),
      )
      const release = result.find((a) => a.kind === 'release-mutual-member')!
      expect(release.enabled).toBe(true)
    })

    it('release stays disabled past the window while a loss share is unsettled', () => {
      const result = getAvailableActions(
        input({
          viewerRole: 'committer',
          mutual: member({ exitRequestedAt: NOW - 4n * 86_400n, unsettled: true }),
        }),
      )
      const release = result.find((a) => a.kind === 'release-mutual-member')!
      expect(release.enabled).toBe(false)
      expect(release.reason).toMatch(/settle/i)
      expect(kinds(result)).toContain('settle-mutual-loss')
    })
  })

  it('committer sees expire (disabled) + request-unbond when not yet past expiresAt', () => {
    const result = getAvailableActions(
      input({
        viewerRole: 'committer',
        commitment: commitment({ expiresAt: NOW + 100n }),
      }),
    )
    const map = Object.fromEntries(result.map((a) => [a.kind, a]))
    expect(map.expire).toBeDefined()
    expect(map.expire.enabled).toBe(false)
    expect(map['request-unbond'].enabled).toBe(true)
  })

  it('committer sees expire (enabled) when past expiresAt', () => {
    const result = getAvailableActions(
      input({
        viewerRole: 'committer',
        commitment: commitment({ expiresAt: NOW - 100n }),
      }),
    )
    const map = Object.fromEntries(result.map((a) => [a.kind, a]))
    expect(map.expire.enabled).toBe(true)
  })

  it('counterparty sees claim-yield when yield is accrued', () => {
    const result = getAvailableActions(
      input({
        viewerRole: 'counterparty',
        pendingYield: 10n ** 18n,
      }),
    )
    expect(kinds(result)).toContain('claim-yield')
  })

  it('counterparty sees distribute-yield when a strategy is bound', () => {
    const result = getAvailableActions(
      input({
        viewerRole: 'counterparty',
        commitment: commitment({ strategies: [STRATEGY] }),
      }),
    )
    expect(kinds(result)).toContain('distribute-yield')
  })

  it('spectator sees no actions on ACTIVE commitment', () => {
    const result = getAvailableActions(input({ viewerRole: 'spectator' }))
    expect(result).toEqual([])
  })

  it('disabled-with-reason when wallet not connected', () => {
    const result = getAvailableActions(
      input({ viewerRole: 'arbiter', isConnected: false }),
    )
    expect(result.length).toBeGreaterThan(0)
    expect(result.every((a) => !a.enabled)).toBe(true)
    expect(result[0].reason).toBe('Connect a wallet to act')
  })
})

describe('getAvailableActions — FORFEIT_PENDING state', () => {
  it('within challenge window: arbiter can cancel; execute disabled', () => {
    const result = getAvailableActions(
      input({
        viewerRole: 'arbiter',
        commitment: commitment({ status: 'FORFEIT_PENDING' }),
        forfeit: { state: 'PENDING', initiatedAt: NOW - 100n, deadline: NOW + 1000n },
      }),
    )
    const map = Object.fromEntries(result.map((a) => [a.kind, a]))
    expect(map['cancel-forfeit']?.enabled).toBe(true)
    expect(map['execute-forfeit']?.enabled).toBe(false)
  })

  it('past challenge window: anyone can execute', () => {
    const result = getAvailableActions(
      input({
        viewerRole: 'spectator',
        isConnected: true,
        commitment: commitment({ status: 'FORFEIT_PENDING' }),
        forfeit: { state: 'EXECUTABLE', initiatedAt: NOW - 100_000n, deadline: NOW - 1n },
      }),
    )
    const map = Object.fromEntries(result.map((a) => [a.kind, a]))
    expect(map['execute-forfeit']?.enabled).toBe(true)
  })

  it('past TTL: anyone can cancel-stale-forfeit', () => {
    const deadline = NOW - FORFEIT_PROPOSAL_TTL_SECONDS - 100n
    const result = getAvailableActions(
      input({
        viewerRole: 'spectator',
        isConnected: true,
        commitment: commitment({ status: 'FORFEIT_PENDING' }),
        forfeit: { state: 'EXECUTABLE', initiatedAt: deadline - 86_400n, deadline },
      }),
    )
    const map = Object.fromEntries(result.map((a) => [a.kind, a]))
    expect(map['cancel-stale-forfeit']?.enabled).toBe(true)
  })

  it('within TTL: cancel-stale-forfeit disabled with countdown reason', () => {
    const result = getAvailableActions(
      input({
        viewerRole: 'spectator',
        isConnected: true,
        commitment: commitment({ status: 'FORFEIT_PENDING' }),
        forfeit: { state: 'EXECUTABLE', initiatedAt: NOW - 100n, deadline: NOW - 1n },
      }),
    )
    const map = Object.fromEntries(result.map((a) => [a.kind, a]))
    expect(map['cancel-stale-forfeit']?.enabled).toBe(false)
    expect(map['cancel-stale-forfeit']?.reason).toMatch(/Stale-cancel available in/)
  })
})

describe('getAvailableActions — UNBONDING flow', () => {
  it('committer mid-unbond: finalize disabled until mature, cancel always enabled', () => {
    const result = getAvailableActions(
      input({
        viewerRole: 'committer',
        commitment: commitment({ status: 'UNBONDING' }),
        unbond: { unbondInitiatedAt: NOW - 100n, unbondingPeriod: 7n * 86_400n },
      }),
    )
    const map = Object.fromEntries(result.map((a) => [a.kind, a]))
    expect(map['finalize-unbond']?.enabled).toBe(false)
    expect(map['finalize-unbond']?.reason).toMatch(/Matures in/)
    expect(map['cancel-unbond']?.enabled).toBe(true)
  })

  it('mature unbond: finalize enabled', () => {
    const result = getAvailableActions(
      input({
        viewerRole: 'committer',
        commitment: commitment({ status: 'UNBONDING' }),
        unbond: {
          unbondInitiatedAt: NOW - 8n * 86_400n,
          unbondingPeriod: 7n * 86_400n,
        },
      }),
    )
    const map = Object.fromEntries(result.map((a) => [a.kind, a]))
    expect(map['finalize-unbond']?.enabled).toBe(true)
  })

  it('committer cannot start a second unbond while one is pending', () => {
    const result = getAvailableActions(
      input({
        viewerRole: 'committer',
        commitment: commitment({ status: 'UNBONDING' }),
        unbond: { unbondInitiatedAt: NOW - 100n, unbondingPeriod: 7n * 86_400n },
      }),
    )
    expect(kinds(result)).not.toContain('request-unbond')
  })

  it('forfeit-blocked unbond: finalize stays disabled', () => {
    const result = getAvailableActions(
      input({
        viewerRole: 'committer',
        commitment: commitment({ status: 'FORFEIT_PENDING' }),
        unbond: {
          unbondInitiatedAt: NOW - 8n * 86_400n,
          unbondingPeriod: 7n * 86_400n,
        },
        forfeit: { state: 'PENDING', initiatedAt: NOW - 100n, deadline: NOW + 1000n },
      }),
    )
    const map = Object.fromEntries(result.map((a) => [a.kind, a]))
    expect(map['finalize-unbond']?.enabled).toBe(false)
  })
})

describe('getAvailableActions — terminal states', () => {
  it('committer on RELEASED: only reclaim-yield surfaces', () => {
    const result = getAvailableActions(
      input({
        viewerRole: 'committer',
        commitment: commitment({ released: true, status: 'RELEASED' }),
      }),
    )
    expect(kinds(result)).toEqual(['reclaim-yield'])
  })

  it('counterparty on FORFEITED with pending yield: claim-yield surfaces', () => {
    const result = getAvailableActions(
      input({
        viewerRole: 'counterparty',
        pendingYield: 10n ** 18n,
        commitment: commitment({ forfeited: true, status: 'FORFEITED' }),
      }),
    )
    expect(kinds(result)).toContain('claim-yield')
  })

  it('actions sorted by primary descending', () => {
    const result = getAvailableActions(input({ viewerRole: 'arbiter' }))
    for (let i = 1; i < result.length; i++) {
      expect(result[i - 1].primary).toBeGreaterThanOrEqual(result[i].primary)
    }
  })
})
