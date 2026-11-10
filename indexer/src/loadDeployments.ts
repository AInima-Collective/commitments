import { readFileSync, existsSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { isAddress, zeroAddress, type Hex } from 'viem'

const __dirname = dirname(fileURLToPath(import.meta.url))

/**
 * Resolves deployed contract addresses for the commitments protocol.
 *
 * Strategy:
 *   1. If `DEPLOYMENTS_JSON` env var is set, read from that file.
 *   2. Otherwise read `indexer/deployments.<chainId>.json`, which
 *      `script/write-frontend-env.mjs` writes from the seed's broadcast (`just
 *      dev-up` runs it). That script is the one broadcast parser; the frontend
 *      env and this manifest come from the same pass.
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
  // Known mechanism contracts whose own case/activity events are indexed.
  optimisticInsuranceArbiters: Hex[]
  twoTierArbiters: Hex[]
  attestationArbiters: Hex[]
  // Required block from which to start indexing (0 for the local fixture).
  startBlock: number
}

export type CommitmentsDeployments = DeploymentManifestV1

const REQUIRED_ADDRESS_FIELDS = ['vaultFactory', 'stakeRegistry', 'meshFactory'] as const
const REQUIRED_ADDRESS_ARRAY_FIELDS = ['commitmentManagers', 'operatorRegistries'] as const
const OPTIONAL_ADDRESS_FIELDS = [
  'governorFactory',
  'mutualRegistry',
  'optimisticMutualArbiter',
  'linkedMutualPolicy',
  'skimmingStrategy',
  'vaultCoverConduit',
] as const
const OPTIONAL_ADDRESS_ARRAY_FIELDS = [
  'flatFeeStrategies',
  'agentIdentityRegistries',
  'optimisticInsuranceArbiters',
  'twoTierArbiters',
  'attestationArbiters',
] as const
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
    optimisticInsuranceArbiters: parseAddressArray(
      raw.optimisticInsuranceArbiters,
      'optimisticInsuranceArbiters',
      false,
    ),
    twoTierArbiters: parseAddressArray(raw.twoTierArbiters, 'twoTierArbiters', false),
    attestationArbiters: parseAddressArray(raw.attestationArbiters, 'attestationArbiters', false),
  }

  for (const field of OPTIONAL_ADDRESS_FIELDS) {
    if (raw[field] !== undefined) manifest[field] = parseAddress(raw[field], field)
  }
  return manifest
}

function readManifest(manifestPath: string, label: string, chainId: number): DeploymentManifestV1 {
  let source: string
  try {
    source = readFileSync(manifestPath, 'utf-8')
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error)
    throw new Error(`Failed to read ${label} at ${manifestPath}: ${reason}`)
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(source)
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error)
    throw new Error(`Failed to parse ${label} at ${manifestPath}: ${reason}`)
  }

  try {
    return parseDeploymentManifest(parsed, chainId)
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error)
    throw new Error(`${label} at ${manifestPath} is invalid: ${reason}`)
  }
}

export function loadDeployments(chainId: number): CommitmentsDeployments {
  const override = process.env.DEPLOYMENTS_JSON
  if (override !== undefined) {
    if (override.trim() === '') throw new Error('DEPLOYMENTS_JSON is set but empty')
    return readManifest(resolve(override), 'DEPLOYMENTS_JSON', chainId)
  }
  const generated = resolve(__dirname, `../deployments.${chainId}.json`)
  if (!existsSync(generated)) {
    throw new Error(
      `No deployment manifest at ${generated}. Run \`just dev-up\` (it seeds anvil and writes it), ` +
        'or set DEPLOYMENTS_JSON to a schema-v1 manifest.',
    )
  }
  return readManifest(generated, 'the deployment manifest', chainId)
}
