import type { Address, Hash, PublicClient, TransactionReceipt, WalletClient } from 'viem'
import type { DevActor, DevActorId } from '../../../contexts/devWallet'

/**
 * Scenarios are pre-canned multi-step scripts that simulate a protocol
 * lifecycle on local Anvil. Each step is one of three kinds, declared as a
 * static value so the UI can preview the scenario before running.
 *
 * The runner walks the steps in order, swapping the active wallet for
 * `tx`/`switch` steps and calling Anvil RPC for `time` steps. `tx` steps may
 * `capture` values from the receipt (e.g. the new commitmentId from logs)
 * which become available to later steps via `ctx.vars`.
 */

export interface ScenarioContext {
  vars: Record<string, unknown>
  publicClient: PublicClient
  walletFor: (actor: DevActorId) => WalletClient
  /** All seven preset Anvil actors. */
  actors: DevActor[]
  /** Resolve an actor by id; convenience for steps. */
  actor: (id: DevActorId) => DevActor
  /** Deployed contract addresses (when configured in env). */
  manager: Address | undefined
  vault: Address | undefined
  /** ERC-4626 pricing adapter for the vault share (v2 backing). */
  adapter: Address | undefined
  registry: Address | undefined
}

export type ScenarioStep =
  | {
      kind: 'switch'
      label: string
      description?: string
      actor: DevActorId
    }
  | {
      kind: 'time'
      label: string
      description?: string
      advance?: number
      mine?: number
    }
  | {
      kind: 'tx'
      label: string
      description?: string
      actor: DevActorId
      run: (ctx: ScenarioContext) => Promise<Hash>
      /**
       * Mutate `ctx.vars` from the confirmed receipt (decode logs, read post-tx
       * state via `ctx.publicClient`, etc). May be async.
       */
      capture?: (
        receipt: TransactionReceipt,
        ctx: ScenarioContext,
      ) => void | Promise<void>
    }

/** Per-step state surfaced by the runner. */
export type StepStatus = 'pending' | 'running' | 'success' | 'error' | 'skipped'

export interface StepResult {
  status: StepStatus
  hash?: Hash
  receipt?: TransactionReceipt
  error?: Error
  startedAt?: number
  endedAt?: number
}

export interface ScenarioInput {
  key: string
  label: string
  defaultValue: string
  placeholder?: string
  hint?: string
}

/**
 * Top-level grouping shown in the scenario picker. Order in the sidebar
 * follows the order of {@link SCENARIO_CATEGORIES} below.
 */
export type ScenarioCategory =
  | 'lifecycle'
  | 'forfeiture'
  | 'agreements'
  | 'yield'

export interface ScenarioCategoryMeta {
  id: ScenarioCategory
  label: string
  description: string
}

export const SCENARIO_CATEGORIES: ScenarioCategoryMeta[] = [
  {
    id: 'lifecycle',
    label: 'Lifecycle',
    description: 'Deposit → commit → exit. Release and self-unbond paths.',
  },
  {
    id: 'forfeiture',
    label: 'Forfeiture',
    description: 'Two-phase forfeit flows: initiate, challenge, execute, cancel.',
  },
  {
    id: 'agreements',
    label: 'Agreements',
    description: 'Bilateral commitments — propose, accept, atomic resolution.',
  },
  {
    id: 'yield',
    label: 'Yield',
    description: 'NAV growth routing: donate, distribute, claim.',
  },
]

export interface Scenario {
  id: string
  title: string
  description: string
  /** Picker grouping. */
  category: ScenarioCategory
  /** User-editable defaults — passed back to `build` when the scenario is run. */
  inputs?: ScenarioInput[]
  build: (inputs: Record<string, string>) => ScenarioStep[]
}
