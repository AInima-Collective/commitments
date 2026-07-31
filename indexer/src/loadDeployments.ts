import { readFileSync, existsSync, readdirSync } from 'node:fs'
import { resolve, join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Hex } from 'viem'

const __dirname = dirname(fileURLToPath(import.meta.url))

/**
 * Resolves deployed contract addresses for the commitments protocol.
 *
 * Strategy:
 *   1. If `DEPLOYMENTS_JSON` env var is set, read from that file.
 *   2. Otherwise parse the latest Foundry broadcast run under
 *      `../broadcast/<script>.s.sol/<chainId>/run-latest.json` — looking for
 *      `CREATE` transactions that deployed the contracts we care about.
 *
 * This lets the indexer start fresh after `anvil` + `forge script Simulate.s.sol`
 * without manual address wiring.
 *
 * Multi-instance note: `commitmentManagers` and `operatorRegistries` are arrays
 * to keep the per-row `event.log.address` attribution forward-compatible with a
 * multi-stack deployment. The v2 Simulate seed deploys exactly ONE manager and
 * ONE registry (the manager is token-agnostic — it custodies every backing
 * token), so each array carries a single entry today.
 *
 * Vaults are no longer a single fixed address: the manager custodies vault
 * *shares* as ordinary backing tokens, and the seed deploys multiple vaults
 * (USDC + WETH) through `VaultFactory`. The indexer discovers them at runtime
 * from `VaultFactory.VaultDeployed` (Ponder `factory()` helper), so we only
 * resolve the factory address here.
 */
export type CommitmentsDeployments = {
  commitmentManagers: Hex[]
  vaultFactory: Hex
  operatorRegistries: Hex[]
  stakeRegistry: Hex
  meshFactory: Hex
  // Known TokenWeighting sinks (optional — factory children also tracked via NodeDeployed).
  tokenWeighting?: Hex
  // Governance — the GovernorFactory address. Governor instances are factory-spawned
  // via GovernorDeployed events and discovered by Ponder dynamically.
  governorFactory?: Hex
  // Synthetic Mutual (Mutual) market. Optional — undefined until the
  // seed deploys them (may be absent in PROD until launch). `mutualRegistry`
  // wraps manager Mutuals as insurance mutuals; `optimisticMutualArbiter`
  // is the optimistic loss arbiter a mutual's mutual dispatches to.
  mutualRegistry?: Hex
  optimisticMutualArbiter?: Hex
  // `linkedMutualPolicy` is the cover/standby premium router that funds a
  // mutual's §G premium stream; optional — undefined until the seed deploys it.
  linkedMutualPolicy?: Hex
  // Underwritten agent vault (agent-bonds use case): the fee-skimming yield
  // strategy (operator fee + premium routing events) and the keyless
  // VaultCoverConduit that funds the coverage mutual's premium stream on the
  // vault's behalf. Optional — undefined until the seed deploys them.
  skimmingStrategy?: Hex
  vaultCoverConduit?: Hex
  // Self-custody distribution strategies (FlatFeeAtCreate, ERC §D.7). Bound by
  // DEPLOYMENT address, not via CommitmentBoundToStrategy discovery: their
  // `Prefunded` event can fire BEFORE the first bind (prefund-then-create), and
  // Ponder's factory() only watches a child from its discovery block onward, so
  // a bind-discovered binding would drop pre-bind prefunds. Empty when the seed
  // deploys none. (Prod forward-compat for strategies deployed after indexer
  // start would want an on-chain registration event — out of scope here.)
  flatFeeStrategies: Hex[]
  // ERC-8004 agent identity registries (issue #33). Dev chains deploy the
  // vendored canonical implementation as `ERC8004IdentityRegistryDev` behind an
  // ERC1967Proxy (recovered here exactly like the manager/registry proxies);
  // production binds the canonical 0x8004A169… address in ponder.config.ts
  // instead of reading the broadcast. Array-shaped like the managers/registries
  // for forward-compat; empty when the seed predates the agent-bond milestone.
  agentIdentityRegistries: Hex[]
  // Block from which to start indexing. Defaults to 0 locally.
  startBlock: number
}

type DeploymentsKey =
  | 'vaultFactory'
  | 'stakeRegistry'
  | 'meshFactory'
  | 'tokenWeighting'
  | 'governorFactory'
  | 'mutualRegistry'
  | 'optimisticMutualArbiter'
  | 'linkedMutualPolicy'
  | 'skimmingStrategy'
  | 'vaultCoverConduit'

/// Single-instance contract names (addresses stored as Hex).
///
/// NOTE: `CommitmentsVault` is intentionally absent — the only top-level
/// `CommitmentsVault` CREATE in the broadcast is the implementation the factory
/// clones, not a usable vault. Real vaults are discovered from VaultFactory's
/// `VaultDeployed` events at index time.
const SINGLE_NAME_MAP: Record<string, DeploymentsKey> = {
  VaultFactory: 'vaultFactory',
  OperatorServiceRegistry: 'stakeRegistry',
  MeshFactory: 'meshFactory',
  TokenWeighting: 'tokenWeighting',
  GovernorFactory: 'governorFactory',
  MutualRegistry: 'mutualRegistry',
  OptimisticMutualArbiter: 'optimisticMutualArbiter',
  LinkedMutualPolicy: 'linkedMutualPolicy',
  SkimmingMockStrategy: 'skimmingStrategy',
  VaultCoverConduit: 'vaultCoverConduit',
}

/// Multi-instance contract names (addresses stored as Hex[]). One Solidity
/// contract, multiple deployments — the parser collects all of them in
/// broadcast-discovery order.
const MULTI_NAME_MAP = {
  CommitmentManager: 'commitmentManagers',
  OperatorRegistry: 'operatorRegistries',
  FlatFeeAtCreate: 'flatFeeStrategies',
  ERC8004IdentityRegistryDev: 'agentIdentityRegistries',
} as const

type MultiKey = (typeof MULTI_NAME_MAP)[keyof typeof MULTI_NAME_MAP]

type BroadcastTx = {
  transactionType: string
  contractName: string | null
  contractAddress: Hex | null
  arguments?: string[] | null
}

type BroadcastFile = {
  transactions: BroadcastTx[]
  receipts: Array<{ blockNumber: string | number }>
}

/**
 * Strip a trailing compiler-profile qualifier from a broadcast `contractName`.
 *
 * Foundry qualifies a CREATE's `contractName` with the active profile name
 * (e.g. `ERC1967Proxy.default`, `OperatorRegistry.manager-size`) whenever a
 * contract has artifacts under more than one profile — a real hazard once any
 * `additional_compiler_profiles` / `compilation_restrictions` is in play (the
 * `manager-size` profile that keeps CommitmentManager under EIP-170 does exactly
 * this), or when stale profile artifacts linger in `out/`. Solidity identifiers
 * never contain a `.`, so the trailing `.<profile>` segment is unambiguous to
 * strip. Profile names can contain hyphens (`manager-size`), so the segment
 * class must allow `-` — otherwise the strip silently no-ops and every match
 * fails: proxied singletons (the manager included) resolve to their
 * IMPLEMENTATION address (no state, no events) and name-mapped contracts like
 * OperatorRegistry drop out of resolution entirely.
 */
export function baseName(name: string): string {
  return name.replace(/\.[A-Za-z0-9_-]+$/, '')
}

function parseBroadcast(chainId: number): CommitmentsDeployments {
  const broadcastDir = resolve(__dirname, '../../broadcast')
  if (!existsSync(broadcastDir)) {
    throw new Error(`Broadcast dir not found at ${broadcastDir} — did you run forge script?`)
  }

  const scripts = readdirSync(broadcastDir).filter((d) => d.endsWith('.s.sol'))

  // (impl address, ordered) — preserves CREATE order so multi-instance contracts
  // (CommitmentManager, OperatorRegistry) are paired with proxies in order.
  const singleImpls: Map<DeploymentsKey, Hex> = new Map()
  const multiImpls: Map<MultiKey, Hex[]> = new Map([
    ['commitmentManagers', []],
    ['operatorRegistries', []],
    ['flatFeeStrategies', []],
    ['agentIdentityRegistries', []],
  ])
  const implToProxy = new Map<string, Hex>()
  // Fallback discovery for the ERC-8004 dev registry: foundry sometimes emits
  // its impl CREATE with `contractName: null` (stale-artifact name ambiguity),
  // which makes name-keyed resolution miss it entirely. The proxy's init
  // calldata is unambiguous instead: `initializeDev(address)` == 0xc2b377ed
  // exists only on ERC8004IdentityRegistryDev in this deployment.
  const INITIALIZE_DEV_SELECTOR = '0xc2b377ed'
  const agentRegistriesByInitData: Hex[] = []

  for (const script of scripts) {
    const runPath = join(broadcastDir, script, String(chainId), 'run-latest.json')
    if (!existsSync(runPath)) continue
    const doc = JSON.parse(readFileSync(runPath, 'utf-8')) as BroadcastFile
    for (const tx of doc.transactions ?? []) {
      if (tx.transactionType !== 'CREATE' || !tx.contractName || !tx.contractAddress) continue
      const name = baseName(tx.contractName)
      if (name === 'ERC1967Proxy') {
        const implArg = tx.arguments?.[0]
        if (implArg) implToProxy.set(implArg.toLowerCase(), tx.contractAddress)
        if (tx.arguments?.[1]?.toLowerCase().startsWith(INITIALIZE_DEV_SELECTOR)) {
          agentRegistriesByInitData.push(tx.contractAddress)
        }
        continue
      }
      const singleKey = SINGLE_NAME_MAP[name]
      if (singleKey) {
        if (!singleImpls.has(singleKey)) singleImpls.set(singleKey, tx.contractAddress)
        continue
      }
      const multiKey = MULTI_NAME_MAP[name as keyof typeof MULTI_NAME_MAP]
      if (multiKey) {
        multiImpls.get(multiKey)!.push(tx.contractAddress)
      }
    }
  }

  // For each impl, prefer the matching proxy (events emit under the proxy's address).
  const resolveProxy = (impl: Hex): Hex => implToProxy.get(impl.toLowerCase()) ?? impl

  const found: Partial<CommitmentsDeployments> = { startBlock: 0 }
  for (const [key, impl] of singleImpls.entries()) {
    ;(found as Record<string, unknown>)[key] = resolveProxy(impl)
  }
  found.commitmentManagers = (multiImpls.get('commitmentManagers') ?? []).map(resolveProxy)
  found.operatorRegistries = (multiImpls.get('operatorRegistries') ?? []).map(resolveProxy)
  // FlatFeeAtCreate is deployed directly (no proxy); resolveProxy passes it through.
  found.flatFeeStrategies = (multiImpls.get('flatFeeStrategies') ?? []).map(resolveProxy)
  // ERC-8004 dev registry is deployed behind an ERC1967Proxy — events emit under
  // the proxy's address, so resolveProxy is load-bearing here. Optional (no
  // hard error): older broadcasts predate the agent-bond seed. When the impl's
  // CREATE row lost its contractName (see INITIALIZE_DEV_SELECTOR above), fall
  // back to the proxies identified by their init calldata.
  const namedAgentRegistries = (multiImpls.get('agentIdentityRegistries') ?? []).map(resolveProxy)
  found.agentIdentityRegistries = namedAgentRegistries.length
    ? namedAgentRegistries
    : agentRegistriesByInitData

  if (!found.commitmentManagers.length) {
    throw new Error('No CommitmentManager deployment found — run forge script script/Simulate.s.sol first')
  }
  if (!found.operatorRegistries.length) {
    throw new Error('No OperatorRegistry deployment found — run forge script script/Simulate.s.sol first')
  }
  if (!found.vaultFactory) {
    throw new Error('No VaultFactory deployment found — run forge script script/Simulate.s.sol first')
  }
  if (!found.stakeRegistry) {
    throw new Error('No OperatorServiceRegistry deployment found — run forge script script/Simulate.s.sol first')
  }
  if (!found.meshFactory) {
    throw new Error('No MeshFactory deployment found — run forge script script/Simulate.s.sol first')
  }

  return found as CommitmentsDeployments
}

export function loadDeployments(chainId: number): CommitmentsDeployments {
  const override = process.env.DEPLOYMENTS_JSON
  if (override && existsSync(override)) {
    const raw = JSON.parse(readFileSync(override, 'utf-8')) as Partial<CommitmentsDeployments> & {
      // Back-compat: older override JSON files may still use the singular keys.
      commitmentManager?: Hex
      operatorRegistry?: Hex
    }
    const commitmentManagers =
      raw.commitmentManagers ?? (raw.commitmentManager ? [raw.commitmentManager] : [])
    const operatorRegistries =
      raw.operatorRegistries ?? (raw.operatorRegistry ? [raw.operatorRegistry] : [])
    return {
      ...raw,
      commitmentManagers,
      operatorRegistries,
      flatFeeStrategies: raw.flatFeeStrategies ?? [],
      agentIdentityRegistries: raw.agentIdentityRegistries ?? [],
      startBlock: raw.startBlock ?? 0,
    } as CommitmentsDeployments
  }
  return parseBroadcast(chainId)
}
