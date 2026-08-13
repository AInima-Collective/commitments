import { describe, expect, it, vi } from 'vitest'
import type { Address } from 'viem'

import { SCENARIOS } from '../library'
import type { ScenarioContext } from '../types'

const MANAGER = '0x1000000000000000000000000000000000000001' as Address
const MANUAL = '0x2000000000000000000000000000000000000002' as Address
const TWO_TIER = '0x3000000000000000000000000000000000000003' as Address
const VAULT = '0x4000000000000000000000000000000000000004' as Address
const ADAPTER = '0x5000000000000000000000000000000000000005' as Address
const COUNTERPARTY = '0x6000000000000000000000000000000000000006' as Address
const TX_HASH = `0x${'a'.repeat(64)}` as const

function context() {
  const writeContract = vi.fn().mockResolvedValue(TX_HASH)
  const ctx = {
    vars: { shares0: 10_000n, twoTierShares: 10_000n },
    manager: MANAGER,
    manualArbiter: MANUAL,
    twoTierArbiter: TWO_TIER,
    vault: VAULT,
    adapter: ADAPTER,
    registry: undefined,
    actor: () => ({ address: COUNTERPARTY }),
    walletFor: () => ({ writeContract, chain: undefined, account: { address: COUNTERPARTY } }),
  } as unknown as ScenarioContext
  return { ctx, writeContract }
}

function scenario(id: string) {
  const found = SCENARIOS.find((entry) => entry.id === id)
  if (!found) throw new Error(`Missing scenario ${id}`)
  return found
}

function txStep(id: string, label: RegExp) {
  const step = scenario(id).build({}).find((candidate) => candidate.kind === 'tx' && label.test(candidate.label))
  if (!step || step.kind !== 'tx') throw new Error(`Missing transaction step ${String(label)}`)
  return step
}

describe('arbitration development scenarios', () => {
  it('creates and resolves the ordinary release flow through ManualArbiter', async () => {
    const { ctx, writeContract } = context()
    await txStep('happy-path-release', /createCommitment/).run(ctx)
    expect(writeContract.mock.calls[0][0].args[0].arbiter).toBe(MANUAL)

    ctx.vars.commitmentId = 7n
    await txStep('happy-path-release', /ManualArbiter owner: release/).run(ctx)
    expect(writeContract.mock.calls[1][0]).toEqual(expect.objectContaining({
      address: MANUAL,
      functionName: 'release',
      args: [7n],
    }))
  })

  it.each(['two-tier-unappealed', 'two-tier-appealed'])('names TwoTierArbiter in %s', async (id) => {
    const { ctx, writeContract } = context()
    await txStep(id, /createCommitment/).run(ctx)
    expect(writeContract.mock.calls[0][0].args[0].arbiter).toBe(TWO_TIER)
    expect(writeContract.mock.calls[0][0].args[0].challengeWindow).toBe(172_800n)
  })

  it('retains the handoff as an intentional EOA/minimal-profile case', async () => {
    const { ctx, writeContract } = context()
    const handoff = scenario('arbitration-handoff')
    expect(handoff.title).toMatch(/Direct-address \/ EOA/)
    await txStep('arbitration-handoff', /createCommitment/).run(ctx)
    expect(writeContract.mock.calls[0][0].args[0].arbiter).toBe(
      '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC',
    )
  })
})
