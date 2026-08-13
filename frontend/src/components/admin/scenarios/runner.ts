import { useCallback, useMemo, useState } from 'react'
import { createWalletClient, http, type WalletClient } from 'viem'
import { useChainId, usePublicClient } from 'wagmi'
import { useDevWallet } from '../../../contexts/devWallet'
import type { DevActor, DevActorId } from '../../../contexts/devWallet'
import { getContractAddresses } from '../../../config/contracts'
import { useAnvilTime } from '../../../hooks/useAnvilTime'
import type { Scenario, ScenarioContext, ScenarioStep, StepResult } from './types'

const ANVIL_RPC_URL =
  (import.meta.env.VITE_RPC_URL_ANVIL as string | undefined) ?? 'http://127.0.0.1:8545'

const ANVIL_CHAIN = {
  id: 31337,
  name: 'Anvil',
  nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  rpcUrls: { default: { http: [ANVIL_RPC_URL] } },
} as const

function buildWalletFor(actor: DevActor): WalletClient {
  return createWalletClient({
    account: actor.account,
    chain: ANVIL_CHAIN,
    transport: http(ANVIL_RPC_URL),
  })
}

export interface ScenarioRunState {
  /** The scenario currently selected (or last run). */
  scenarioId: string | null
  /** Resolved steps (after `build(inputs)`). */
  steps: ScenarioStep[]
  /** Per-step status map keyed by step index. */
  results: StepResult[]
  /** True while the runner is mid-scenario. */
  isRunning: boolean
  /** Captured variables (post-step `capture()` outputs). */
  vars: Record<string, unknown>
  /** Index of the currently-running step, or null. */
  activeIndex: number | null
}

export interface ScenarioRunner {
  state: ScenarioRunState
  preview: (scenario: Scenario, inputs: Record<string, string>) => void
  run: (scenario: Scenario, inputs: Record<string, string>) => Promise<void>
  reset: () => void
}

const INITIAL: ScenarioRunState = {
  scenarioId: null,
  steps: [],
  results: [],
  isRunning: false,
  vars: {},
  activeIndex: null,
}

export function useScenarioRunner(): ScenarioRunner {
  const chainId = useChainId()
  const publicClient = usePublicClient({ chainId })
  const wallet = useDevWallet()
  const time = useAnvilTime()
  const { manager, manualArbiter, twoTierArbiter, vault, adapter, registry } = useMemo(() => {
    const a = getContractAddresses(chainId)
    return {
      manager: a.commitmentManager,
      manualArbiter: a.manualArbiter,
      twoTierArbiter: a.twoTierArbiter,
      vault: a.commitmentsVault,
      adapter: a.erc4626Adapter,
      registry: a.operatorRegistry,
    }
  }, [chainId])

  const [state, setState] = useState<ScenarioRunState>(INITIAL)

  const reset = useCallback(() => setState(INITIAL), [])

  const preview = useCallback(
    (scenario: Scenario, inputs: Record<string, string>) => {
      const steps = scenario.build(inputs)
      setState({
        scenarioId: scenario.id,
        steps,
        results: steps.map(() => ({ status: 'pending' })),
        isRunning: false,
        vars: {},
        activeIndex: null,
      })
    },
    [],
  )

  const run = useCallback(
    async (scenario: Scenario, inputs: Record<string, string>) => {
      console.info('[scenario] run', scenario.id, {
        inputs,
        manager,
        manualArbiter,
        twoTierArbiter,
        vault,
        registry,
        chainId,
        hasPublicClient: !!publicClient,
        actorCount: wallet.actors.length,
      })
      if (!publicClient) {
        const err = new Error(
          `No public client for chainId ${chainId}. Is wagmi configured? Are you connected to Anvil (31337)?`,
        )
        console.error('[scenario] aborted — no public client', err)
        setState((s) => ({
          ...s,
          isRunning: false,
          results: (s.steps.length > 0 ? s.steps : [null]).map(() => ({
            status: 'error' as const,
            error: err,
          })),
        }))
        return
      }
      if (!manager || !manualArbiter || !vault) {
        const err = new Error(
          `Contract addresses missing (manager=${manager ?? 'unset'}, manualArbiter=${manualArbiter ?? 'unset'}, vault=${vault ?? 'unset'}). Run \`just dev-up\` to deploy + write frontend/.env.local, then restart the dev server.`,
        )
        console.error('[scenario] aborted — missing addresses', err)
        setState((s) => ({
          ...s,
          isRunning: false,
          results: (s.steps.length > 0 ? s.steps : [null]).map(() => ({
            status: 'error' as const,
            error: err,
          })),
        }))
        return
      }

      const steps = scenario.build(inputs)
      const results: StepResult[] = steps.map(() => ({ status: 'pending' }))
      const vars: Record<string, unknown> = {}

      setState({
        scenarioId: scenario.id,
        steps,
        results,
        isRunning: true,
        vars,
        activeIndex: 0,
      })

      const ctx: ScenarioContext = {
        vars,
        publicClient,
        walletFor: (id: DevActorId) => {
          const a = wallet.actors.find((x) => x.id === id)
          if (!a) throw new Error(`Unknown actor ${id}`)
          return buildWalletFor(a)
        },
        actors: wallet.actors,
        actor: (id: DevActorId) => {
          const a = wallet.actors.find((x) => x.id === id)
          if (!a) throw new Error(`Unknown actor ${id}`)
          return a
        },
        manager,
        manualArbiter,
        twoTierArbiter,
        vault,
        adapter,
        registry,
      }

      for (let i = 0; i < steps.length; i++) {
        const step = steps[i]!
        results[i] = { status: 'running', startedAt: Date.now() }
        setState((s) => ({ ...s, results: [...results], activeIndex: i, vars: { ...vars } }))

        try {
          if (step.kind === 'switch') {
            // Switch is purely UI sugar — wallet selection in DevWallet for any
            // subsequent manual interaction. The runner uses walletFor(actor)
            // per tx step regardless of the active wallet.
            wallet.selectActor(step.actor)
            results[i] = { status: 'success', startedAt: results[i]!.startedAt, endedAt: Date.now() }
          } else if (step.kind === 'time') {
            if (step.advance && step.advance > 0) await time.advance(step.advance)
            if (step.mine && step.mine > 0) await time.mine(step.mine)
            results[i] = { status: 'success', startedAt: results[i]!.startedAt, endedAt: Date.now() }
          } else {
            const hash = await step.run(ctx)
            const receipt = await publicClient.waitForTransactionReceipt({ hash })
            if (receipt.status === 'reverted') {
              throw new Error('Transaction reverted')
            }
            await step.capture?.(receipt, ctx)
            results[i] = {
              status: 'success',
              hash,
              receipt,
              startedAt: results[i]!.startedAt,
              endedAt: Date.now(),
            }
          }
        } catch (e) {
          const err = e instanceof Error ? e : new Error(String(e))
          results[i] = {
            status: 'error',
            error: err,
            startedAt: results[i]!.startedAt,
            endedAt: Date.now(),
          }
          // Mark remaining steps as skipped.
          for (let j = i + 1; j < steps.length; j++) {
            results[j] = { status: 'skipped' }
          }
          setState((s) => ({
            ...s,
            isRunning: false,
            results: [...results],
            activeIndex: i,
            vars: { ...vars },
          }))
          return
        }

        setState((s) => ({ ...s, results: [...results], vars: { ...vars } }))
      }

      setState((s) => ({ ...s, isRunning: false, activeIndex: null, vars: { ...vars } }))
    },
    [publicClient, wallet, time, manager, manualArbiter, twoTierArbiter, vault, adapter, registry, chainId],
  )

  return { state, preview, run, reset }
}
