import { readFileSync, existsSync, readdirSync } from 'node:fs'
import { resolve, join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { isAddress, zeroAddress, type Hex } from 'viem'

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
export const DEPLOYMENT_MANIFEST_SCHEMA_VERSION = 1 as const

export type DeploymentManifestV1 = {
  schemaVersion: typeof DEPLOYMENT_MANIFEST_SCHEMA_VERSION
  chainId: number
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
  // Required block from which to start indexing (0 for the local fixture).
  startBlock: number
}

export type CommitmentsDeployments = DeploymentManifestV1

const REQUIRED_ADDRESS_FIELDS = ['vaultFactory', 'stakeRegistry', 'meshFactory'] as const
const REQUIRED_ADDRESS_ARRAY_FIELDS = ['commitmentManagers', 'operatorRegistries'] as const
const OPTIONAL_ADDRESS_FIELDS = [
  'tokenWeighting',
  'governorFactory',
  'mutualRegistry',
  'optimisticMutualArbiter',
  'linkedMutualPolicy',
  'skimmingStrategy',
  'vaultCoverConduit',
] as const
const OPTIONAL_ADDRESS_ARRAY_FIELDS = ['flatFeeStrategies', 'agentIdentityRegistries'] as const
const MANIFEST_FIELDS = new Set([
  'schemaVersion',
  'chainId',
  'startBlock',
  ...REQUIRED_ADDRESS_FIELDS,
  ...REQUIRED_ADDRESS_ARRAY_FIELDS,
  ...OPTIONAL_ADDRESS_FIELDS,
  ...OPTIONAL_ADDRESS_ARRAY_FIELDS,
])
const LEGACY_MANIFEST_FIELDS = new Map([
  ['commitmentManager', 'commitmentManagers: ["0x…"]'],
  ['operatorRegistry', 'operatorRegistries: ["0x…"]'],
  ['commitmentsVault', 'vaultFactory: "0x…"'],
])

type JsonObject = Record<string, unknown>

function manifestError(message: string): never {
  throw new Error(`Invalid deployment manifest: ${message}`)
}

function parseAddress(value: unknown, field: string): Hex {
  if (typeof value !== 'string' || !isAddress(value) || value.toLowerCase() === zeroAddress) {
    manifestError(`${field} must be a non-zero EVM address`)
  }
  return value as Hex
}

function parseAddressArray(value: unknown, field: string, required: boolean): Hex[] {
  if (value === undefined && !required) return []
  if (!Array.isArray(value)) manifestError(`${field} must be an array of EVM addresses`)
  if (required && value.length === 0) manifestError(`${field} must contain at least one address`)
  return value.map((address, index) => parseAddress(address, `${field}[${index}]`))
}

/**
 * Validate and normalize the versioned deployment manifest consumed by Ponder.
 *
 * Schema v1 is intentionally strict: legacy singular keys and unknown fields are
 * rejected so a typo cannot silently disable indexing for a deployed subsystem.
 */
export function parseDeploymentManifest(value: unknown, expectedChainId: number): DeploymentManifestV1 {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    manifestError('the top-level value must be a JSON object')
  }
  const raw = value as JsonObject

  for (const [legacy, replacement] of LEGACY_MANIFEST_FIELDS) {
    if (legacy in raw) {
      manifestError(`legacy field "${legacy}" is not supported in schema v1; use ${replacement}`)
    }
  }
  for (const field of Object.keys(raw)) {
    if (!MANIFEST_FIELDS.has(field)) manifestError(`unknown field "${field}"`)
  }

  if (raw.schemaVersion !== DEPLOYMENT_MANIFEST_SCHEMA_VERSION) {
    manifestError(`schemaVersion must be ${DEPLOYMENT_MANIFEST_SCHEMA_VERSION}`)
  }
  if (!Number.isSafeInteger(raw.chainId) || (raw.chainId as number) <= 0) {
    manifestError('chainId must be a positive safe integer')
  }
  if (raw.chainId !== expectedChainId) {
    manifestError(`chainId ${raw.chainId} does not match the expected chain ${expectedChainId}`)
  }
  if (!Number.isSafeInteger(raw.startBlock) || (raw.startBlock as number) < 0) {
    manifestError('startBlock must be a non-negative safe integer')
  }

  const manifest: DeploymentManifestV1 = {
    schemaVersion: DEPLOYMENT_MANIFEST_SCHEMA_VERSION,
    chainId: raw.chainId as number,
    startBlock: raw.startBlock as number,
    commitmentManagers: parseAddressArray(raw.commitmentManagers, 'commitmentManagers', true),
    operatorRegistries: parseAddressArray(raw.operatorRegistries, 'operatorRegistries', true),
    vaultFactory: parseAddress(raw.vaultFactory, 'vaultFactory'),
    stakeRegistry: parseAddress(raw.stakeRegistry, 'stakeRegistry'),
    meshFactory: parseAddress(raw.meshFactory, 'meshFactory'),
    flatFeeStrategies: parseAddressArray(raw.flatFeeStrategies, 'flatFeeStrategies', false),
    agentIdentityRegistries: parseAddressArray(
      raw.agentIdentityRegistries,
      'agentIdentityRegistries',
      false,
    ),
  }

  for (const field of OPTIONAL_ADDRESS_FIELDS) {
    if (raw[field] !== undefined) manifest[field] = parseAddress(raw[field], field)
  }
  return manifest
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

  const found: Partial<CommitmentsDeployments> = {
    schemaVersion: DEPLOYMENT_MANIFEST_SCHEMA_VERSION,
    chainId,
    startBlock: 0,
  }
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

  return parseDeploymentManifest(found, chainId)
}

export function loadDeployments(chainId: number): CommitmentsDeployments {
  const override = process.env.DEPLOYMENTS_JSON
  if (override !== undefined) {
    if (override.trim() === '') throw new Error('DEPLOYMENTS_JSON is set but empty')
    const manifestPath = resolve(override)
    let source: string
    try {
      source = readFileSync(manifestPath, 'utf-8')
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error)
      throw new Error(`Failed to read DEPLOYMENTS_JSON at ${manifestPath}: ${reason}`)
    }

    let parsed: unknown
    try {
      parsed = JSON.parse(source)
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error)
      throw new Error(`Failed to parse DEPLOYMENTS_JSON at ${manifestPath}: ${reason}`)
    }

    try {
      return parseDeploymentManifest(parsed, chainId)
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error)
      throw new Error(`DEPLOYMENTS_JSON at ${manifestPath} is invalid: ${reason}`)
    }
  }
  return parseBroadcast(chainId)
}
