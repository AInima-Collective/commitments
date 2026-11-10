#!/usr/bin/env node
// Reads the latest Simulate broadcast and writes frontend/.env.local so the UI
// points at the live deployment, plus indexer/deployments.<chainId>.json, the
// schema-v1 deployment manifest the indexer reads (see indexer/src/loadDeployments.ts).
// Run by `just dev-up` after seeding. This is the one broadcast parser: the
// frontend and the indexer get their addresses from the same pass.
//
// Strategy:
//   - CREATE transactions give us named contracts (impl) and ERC1967Proxy pairings.
//   - Mesh clones (TokenWeighting, FanIn, FanOut) are CREATE2'd by the factory, so
//     they don't appear as CREATE rows. Instead we scan the receipts' logs for
//     MeshFactory's `NodeDeployed(address impl, address clone, string nodeType)`
//     event (topic0 = keccak256("NodeDeployed(address,address,string)")).

import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { resolve, dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  baseName,
  loadCreationMatchers,
  recoverContractName,
} from './foundry-artifacts.mjs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(__dirname, '..')
const chainId = process.env.CHAIN_ID ?? '31337'
const rpcUrl = process.env.RPC_URL ?? 'http://127.0.0.1:8545'
const isAnvil = chainId === '31337'
// Which broadcast directory to parse. Anvil seeds via Simulate.s.sol; live
// networks (Sepolia, …) deploy via DeploySepolia.s.sol. Override with
// BROADCAST_SCRIPT when using a different entrypoint.
const broadcastScript =
  process.env.BROADCAST_SCRIPT ?? (isAnvil ? 'Simulate.s.sol' : 'DeploySepolia.s.sol')
// Indexer URL is local in dev but points at the deployed Ponder on live nets.
const indexerUrl = process.env.INDEXER_URL ?? 'http://localhost:65422'
// IPFS gateway the browser resolves `ipfs://` metadata through.
//
// Written when explicitly set, OR when a local gateway is actually answering —
// the seed pins to that same node, so its CIDs may not be retrievable from the
// public gateway the frontend otherwise defaults to. Probing rather than
// assuming is what keeps this from breaking metadata display for the majority
// who never run a node.
const DEFAULT_IPFS_GATEWAY = 'http://127.0.0.1:8080/ipfs/'
async function localGatewayAnswering() {
  try {
    // The CID of the empty raw block: served from any healthy gateway without
    // needing the network, so this tests the gateway rather than the DHT.
    const res = await fetch(`${DEFAULT_IPFS_GATEWAY}bafkqaaa`, {
      signal: AbortSignal.timeout(2_000),
    })
    return res.ok
  } catch {
    return false
  }
}
const ipfsGateway =
  process.env.IPFS_GATEWAY ?? ((await localGatewayAnswering()) ? DEFAULT_IPFS_GATEWAY : undefined)

const NODE_DEPLOYED_TOPIC =
  '0xa3c11352e051b084be07acc41332880e964a23de663ad3898a935c8eb9c700a7'
// VaultFactory.deployVault() deploys the vault as a nested ERC1967Proxy, which
// doesn't appear as a top-level CREATE row in the broadcast JSON. Scan for the
// VaultDeployed(address indexed asset, address indexed vault) event
// to recover the real vault proxy.
const VAULT_DEPLOYED_TOPIC =
  '0x09d75e12e349f79020715b0ea7b2c707e8acf1889b6d6f1337fce7f4e1b9e5c7'

const runPath = join(repoRoot, 'broadcast', broadcastScript, chainId, 'run-latest.json')
if (!existsSync(runPath)) {
  console.error(`[write-frontend-env] broadcast not found: ${runPath}`)
  process.exit(1)
}

const doc = JSON.parse(readFileSync(runPath, 'utf-8'))

// Pass 1: named CREATEs + proxy pairings.
const implForName = {}
const allImplsForName = {} // every instance, for contracts the seed deploys more than once
const proxyForImpl = new Map()
// Track ALL CREATE rows for AgentVaultBeneficiary so we can recover its
// constructor arguments. AgentVaultBeneficiary takes (vaultA, vaultB) — the
// agent vault is deployed as a direct ERC1967 proxy (bypassing the factory's
// per-asset uniqueness check) and so doesn't emit `VaultDeployed`. The
// constructor argument is the only reliable reverse lookup.
const ctorArgsByName = {}
// Foundry can emit `contractName: null` when additional compiler profiles
// produce several artifacts for one source. Recover only the contracts this
// writer consumes, and only when exactly one distinct artifact name matches
// the raw CREATE input; that avoids turning artifact ambiguity into a wrong address.
const CONTRACT_NAMES = new Set([
  'ERC1967Proxy',
  'CommitmentManager',
  'VaultFactory',
  'GovernorFactory',
  'CommitmentsVault',
  'OperatorRegistry',
  'ManualArbiter',
  'TwoTierArbiter',
  'AttestationArbiter',
  'OperatorServiceRegistry',
  'MeshFactory',
  'ERC4626Adapter',
  'ERC20StaticAdapter',
  'OptimisticInsuranceArbiter',
  'MutualRegistry',
  'OptimisticMutualArbiter',
  'PremiumScheduler',
  'LinkedMutualPolicy',
  'ForfeitDonationBeneficiary',
  'ERC8004IdentityRegistryDev',
  'SkimmingMockStrategy',
  'VaultCoverConduit',
  'IndexAppreciationYield',
  'FlatFeeAtCreate',
])
const creationMatchers = loadCreationMatchers(join(repoRoot, 'out'), CONTRACT_NAMES)
for (const tx of doc.transactions ?? []) {
  if (tx.transactionType !== 'CREATE' || !tx.contractAddress) continue
  const name = tx.contractName
    ? baseName(tx.contractName)
    : recoverContractName(tx.transaction?.input, creationMatchers)
  if (name === 'ERC1967Proxy') {
    const impl = tx.arguments?.[0]
    if (impl) proxyForImpl.set(impl.toLowerCase(), tx.contractAddress)
    continue
  }
  if (!name) continue
  if (!implForName[name]) {
    implForName[name] = tx.contractAddress
    ctorArgsByName[name] = tx.arguments ?? []
  }
  ;(allImplsForName[name] ??= []).push(tx.contractAddress)
}

const proxyFor = (name) => {
  const impl = implForName[name]
  if (!impl) return undefined
  return proxyForImpl.get(impl.toLowerCase()) ?? impl
}

// Pass 2: scan receipts for event-sourced addresses.
const meshByType = {}
// Vaults are recovered in deployment order — Simulate.s.sol deploys USDC first,
// then WETH. The first VaultDeployed event is the canonical USDC vault; the
// second (if present) is the ETH vault.
const vaultsFromEvent = []
// The raw underlying ERC-20 of each vault, captured from VaultDeployed's
// indexed `asset` topic. These are the raw-token backing options (USDC, WETH)
// that the ERC20StaticAdapter prices — surfaced as create-form backing choices
// alongside the vault share.
const assetsFromEvent = []
for (const r of doc.receipts ?? []) {
  for (const log of r.logs ?? []) {
    const topics = log.topics ?? []
    const t0 = topics[0]?.toLowerCase()

    // NodeDeployed(address indexed impl, address indexed clone, string nodeType)
    if (t0 === NODE_DEPLOYED_TOPIC && topics.length >= 3) {
      const clone = '0x' + topics[2].slice(-40)
      const data = log.data?.startsWith('0x') ? log.data.slice(2) : log.data
      if (!data || data.length < 64 * 2) continue
      const strLen = parseInt(data.slice(64, 128), 16)
      const strBytes = data.slice(128, 128 + strLen * 2)
      const nodeType = Buffer.from(strBytes, 'hex').toString('utf-8')
      meshByType[nodeType] = clone
      continue
    }

    // VaultDeployed(address indexed asset, address indexed vault) —
    // the factory deploys the real vault as a nested ERC1967Proxy, so this
    // event is the only reliable way to recover the proxy address from broadcast.
    if (t0 === VAULT_DEPLOYED_TOPIC && topics.length >= 3) {
      assetsFromEvent.push('0x' + topics[1].slice(-40))
      vaultsFromEvent.push('0x' + topics[2].slice(-40))
      continue
    }
  }
}

// Default arbiter surfaced in the create form so demo users don't footgun
// themselves by picking their own address.
//   - Anvil (31337): Simulate.s.sol derives the arbiter as
//     `vm.deriveKey(MNEMONIC, 1)` — the standard mnemonic-derived account #1,
//     stable as long as Anvil's test mnemonic stays fixed.
//   - Live nets (Sepolia, …): the arbiter is a deployed *contract* (ManualArbiter),
//     so prefer DEFAULT_ARBITER_ADDRESS from env, then fall back to the
//     ManualArbiter recovered from the broadcast CREATE rows. Never use the
//     Anvil account on a non-Anvil chain.
const SIMULATE_ARBITER = '0x70997970C51812dc3A010C7d01b50e0d17dc79C8'
const defaultArbiter = isAnvil
  ? process.env.DEFAULT_ARBITER_ADDRESS ?? SIMULATE_ARBITER
  : process.env.DEFAULT_ARBITER_ADDRESS ?? allImplsForName.ManualArbiter?.[0] ?? ''

// ERC-8004 agent identity registry: foundry sometimes fails to resolve the
// impl's contractName (stale-artifact ambiguity → null CREATE row), so name
// lookup alone is unreliable. Fall back to matching the ERC1967Proxy whose
// init calldata starts with the `initializeDev(address)` selector — unique to
// ERC8004IdentityRegistryDev in this deployment.
const INITIALIZE_DEV_SELECTOR = '0xc2b377ed'
const agentRegistryByInitData = (doc.transactions ?? []).find(
  (tx) =>
    tx.transactionType === 'CREATE' &&
    baseName(tx.contractName) === 'ERC1967Proxy' &&
    tx.arguments?.[1]?.toLowerCase().startsWith(INITIALIZE_DEV_SELECTOR),
)?.contractAddress
const agentIdentityRegistry =
  proxyFor('ERC8004IdentityRegistryDev') ?? agentRegistryByInitData ?? ''

// Underwriting periphery (VaultCoverConduit + SkimmingMockStrategy): foundry
// drops these contractNames too (same profile-artifact ambiguity as the ERC8004
// impl above), and their deployed bytecode is a different profile variant than
// the out/ artifact, so name and bytecode lookups are both unreliable. Recover
// them from constructor-argument fingerprints in the raw CREATE input instead,
// anchored on addresses that DO resolve: the conduit's ctor is
// (vault, policy, mutualId, maxStreamDuration, minFundAssets) — 2nd-from-last-4
// word == LinkedMutualPolicy; the strategy's ctor is
// (asset, vault, operator, premiumRecipient, skimBps, operatorFeeBps) —
// premiumRecipient (3rd word from the end) == the conduit itself.
const nullCreates = (doc.transactions ?? []).filter(
  (tx) => tx.transactionType === 'CREATE' && !baseName(tx.contractName) && tx.contractAddress,
)
// 32-byte ABI word `n` positions from the input's tail, as a 20-byte address.
const tailWordAddr = (input, n) => {
  const hex = (input ?? '').replace(/^0x/, '')
  const start = hex.length - n * 64
  if (start < 0) return undefined
  return '0x' + hex.slice(start, start + 64).slice(-40)
}
const eq = (a, b) => a && b && a.toLowerCase() === b.toLowerCase()
const agentVaultAddr = vaultsFromEvent[3]
const mutualPolicyAddr = implForName.LinkedMutualPolicy
const conduitByCtor = nullCreates.find(
  (tx) =>
    eq(tailWordAddr(tx.transaction?.input, 5), agentVaultAddr) &&
    eq(tailWordAddr(tx.transaction?.input, 4), mutualPolicyAddr),
)?.contractAddress
const vaultCoverConduit = implForName.VaultCoverConduit ?? conduitByCtor ?? ''
const skimStrategyByCtor = nullCreates.find(
  (tx) =>
    eq(tailWordAddr(tx.transaction?.input, 5), agentVaultAddr) &&
    eq(tailWordAddr(tx.transaction?.input, 3), vaultCoverConduit),
)?.contractAddress
const agentSkimStrategy = implForName.SkimmingMockStrategy ?? skimStrategyByCtor ?? ''

const usdcVault = vaultsFromEvent[0] ?? proxyFor('CommitmentsVault') ?? ''
const ethVault = vaultsFromEvent[1] ?? ''
// cvUSDT is the third vault deployed by Simulate (insurable savings position).
const usdtVault = vaultsFromEvent[2] ?? ''
// Raw underlying tokens, in the same deployment order as the vaults above.
const usdcToken = assetsFromEvent[0] ?? ''
const wethToken = assetsFromEvent[1] ?? ''
const usdtToken = assetsFromEvent[2] ?? ''

const lines = [
  `VITE_EXPECTED_CHAIN_ID=${chainId}`,
  `VITE_COMMITMENTS_VAULT_ADDRESS=${usdcVault}`,
  ethVault ? `VITE_ETH_VAULT_ADDRESS=${ethVault}` : undefined,
  // Raw underlying ERC-20s — the non-vault backing options priced by the
  // ERC20StaticAdapter. Recovered from each vault's VaultDeployed `asset` topic.
  usdcToken ? `VITE_USDC_TOKEN_ADDRESS=${usdcToken}` : undefined,
  wethToken ? `VITE_WETH_TOKEN_ADDRESS=${wethToken}` : undefined,
  usdtVault ? `VITE_USDT_VAULT_ADDRESS=${usdtVault}` : undefined,
  usdtToken ? `VITE_USDT_TOKEN_ADDRESS=${usdtToken}` : undefined,
  // NOTE: the plain usdc/weth/usdt vaults run idle (no bound yield strategy) —
  // NAV moves only through real donate() calls. There are no per-vault demo
  // strategy addresses to export anymore; the admin "Simulate yield → APY" flow
  // drives NAV via donate() directly. (The agent vault's SkimmingMockStrategy is
  // still exported below as VITE_AGENT_STRATEGY_ADDRESS.)
  `VITE_COMMITMENT_MANAGER_ADDRESS=${proxyFor('CommitmentManager') ?? ''}`,
  `VITE_OPERATOR_REGISTRY_ADDRESS=${proxyFor('OperatorRegistry') ?? ''}`,
  // ManualArbiter is a regular CREATE (not a proxy).
  implForName.ManualArbiter
    ? `VITE_MANUAL_ARBITER_ADDRESS=${implForName.ManualArbiter}`
    : undefined,
  implForName.TwoTierArbiter
    ? `VITE_TWO_TIER_ARBITER_ADDRESS=${implForName.TwoTierArbiter}`
    : undefined,
  implForName.AttestationArbiter
    ? `VITE_ATTESTATION_ARBITER_ADDRESS=${implForName.AttestationArbiter}`
    : undefined,
  `VITE_STAKE_REGISTRY_ADDRESS=${proxyFor('OperatorServiceRegistry') ?? ''}`,
  meshByType.token_weighting ? `VITE_TOKEN_WEIGHTING_ADDRESS=${meshByType.token_weighting}` : undefined,
  meshByType.fan_out ? `VITE_FAN_OUT_ADDRESS=${meshByType.fan_out}` : undefined,
  meshByType.fan_in ? `VITE_FAN_IN_ADDRESS=${meshByType.fan_in}` : undefined,
  implForName.MeshFactory ? `VITE_MESH_FACTORY_ADDRESS=${implForName.MeshFactory}` : undefined,
  // Backing adapters (stateless index pricers, regular CREATE rows). The
  // ERC-4626 adapter is what makes the canonical vault share appear as a
  // backing option on the Backing page; the ERC-20 static adapter prices
  // plain tokens. Both are deployed by Simulate.s.sol.
  implForName.ERC4626Adapter
    ? `VITE_ERC4626_ADAPTER_ADDRESS=${implForName.ERC4626Adapter}`
    : undefined,
  implForName.ERC20StaticAdapter
    ? `VITE_ERC20_ADAPTER_ADDRESS=${implForName.ERC20StaticAdapter}`
    : undefined,
  // Marketplace pattern reference contracts (May 2026).
  implForName.OptimisticInsuranceArbiter
    ? `VITE_OPTIMISTIC_INSURANCE_ARBITER_ADDRESS=${implForName.OptimisticInsuranceArbiter}`
    : undefined,
  // Mutual (the shared-loss primitive, Position A). The registry is the frontend's
  // read surface (useMutualListings reads `allMutualIds`/`getMutualListing`); the arbiter
  // and router are plain named CREATE rows surfaced for forward-compat (config/contracts.ts
  // maps all three). Absent until the seed deploys them.
  implForName.MutualRegistry
    ? `VITE_MUTUAL_REGISTRY_ADDRESS=${implForName.MutualRegistry}`
    : undefined,
  implForName.OptimisticMutualArbiter
    ? `VITE_OPTIMISTIC_MUTUAL_ARBITER_ADDRESS=${implForName.OptimisticMutualArbiter}`
    : undefined,
  // Premium leg (utilization-curve pricing + cover binding/funding executor).
  implForName.PremiumScheduler
    ? `VITE_PREMIUM_SCHEDULER_ADDRESS=${implForName.PremiumScheduler}`
    : undefined,
  implForName.LinkedMutualPolicy
    ? `VITE_LINKED_MUTUAL_POLICY_ADDRESS=${implForName.LinkedMutualPolicy}`
    : undefined,
  // Strategy-binding modules the create form offers (regular CREATE rows).
  implForName.IndexAppreciationYield
    ? `VITE_INDEX_YIELD_STRATEGY_ADDRESS=${implForName.IndexAppreciationYield}`
    : undefined,
  implForName.FlatFeeAtCreate
    ? `VITE_FLAT_FEE_STRATEGY_ADDRESS=${implForName.FlatFeeAtCreate}`
    : undefined,
  // Underwritten agent vault (agent-bonds use case): cvaDAI is the 4th
  // VaultDeployed (usdc, weth, usdt, dai); SkimmingMockStrategy is the agent's
  // fee-skimming strategy (operator fee + premium routing); VaultCoverConduit is
  // the keyless policyholder-of-record funding the underwriters' premium stream;
  // the ForfeitDonationBeneficiary donates mutual loss settlements back to the
  // vault's depositors.
  vaultsFromEvent[3] ? `VITE_AGENT_VAULT_ADDRESS=${vaultsFromEvent[3]}` : undefined,
  assetsFromEvent[3] ? `VITE_DAI_TOKEN_ADDRESS=${assetsFromEvent[3]}` : undefined,
  agentSkimStrategy ? `VITE_AGENT_STRATEGY_ADDRESS=${agentSkimStrategy}` : undefined,
  vaultCoverConduit ? `VITE_VAULT_COVER_CONDUIT_ADDRESS=${vaultCoverConduit}` : undefined,
  implForName.ForfeitDonationBeneficiary
    ? `VITE_AGENT_VAULT_BENEFICIARY_ADDRESS=${implForName.ForfeitDonationBeneficiary}`
    : undefined,
  // Second OptimisticInsuranceArbiter, bonded in DAI for the cvaDAI market
  // (claim bonds must match the payout denomination).
  allImplsForName.OptimisticInsuranceArbiter?.[1]
    ? `VITE_DAI_OPTIMISTIC_ARBITER_ADDRESS=${allImplsForName.OptimisticInsuranceArbiter[1]}`
    : undefined,
  // Second OptimisticMutualArbiter, bonded in DAI: the cvaDAI coverage market's
  // loss-declaration arbiter (the first instance is the shared cvUSDC one).
  allImplsForName.OptimisticMutualArbiter?.[1]
    ? `VITE_AGENT_MUTUAL_ARBITER_ADDRESS=${allImplsForName.OptimisticMutualArbiter[1]}`
    : undefined,
  // ERC-8004 agent identity registry (issue #33). On Anvil this is the dev
  // bootstrap proxy Simulate deploys; live nets should override with the
  // canonical deployment 0x8004A169FB4a3325136EB29fA0ceB6D2e539a432 (same
  // address on 20+ chains) via AGENT_IDENTITY_REGISTRY_ADDRESS.
  process.env.AGENT_IDENTITY_REGISTRY_ADDRESS || agentIdentityRegistry
    ? `VITE_AGENT_IDENTITY_REGISTRY_ADDRESS=${process.env.AGENT_IDENTITY_REGISTRY_ADDRESS ?? agentIdentityRegistry}`
    : undefined,
  defaultArbiter ? `VITE_DEFAULT_ARBITER_ADDRESS=${defaultArbiter}` : undefined,
  // Anvil writes VITE_RPC_URL_ANVIL; live nets (e.g. Sepolia) get their RPC from
  // the frontend's own VITE_RPC_URL_<NET> (see .env.example) so don't clobber it.
  isAnvil ? `VITE_RPC_URL_ANVIL=${rpcUrl}` : undefined,
  `VITE_INDEXER_URL=${indexerUrl}`,
  ipfsGateway ? `VITE_IPFS_GATEWAY=${ipfsGateway}` : undefined,
].filter(Boolean)

const envPath = join(repoRoot, 'frontend', '.env.local')
writeFileSync(envPath, lines.join('\n') + '\n')
console.log(`[write-frontend-env] wrote ${envPath}`)
for (const line of lines) console.log(`  ${line}`)

// The indexer's deployment manifest (schema v1). Proxied contracts resolve to
// their proxy, where events are emitted. Absent optional fields are omitted;
// the indexer's strict parser rejects a manifest missing a required one.
const allFor = (name) =>
  (allImplsForName[name] ?? []).map((impl) => proxyForImpl.get(impl.toLowerCase()) ?? impl)
const manifest = {
  schemaVersion: 1,
  chainId: Number(chainId),
  startBlock: 0,
  commitmentManagers: allFor('CommitmentManager'),
  operatorRegistries: allFor('OperatorRegistry'),
  vaultFactory: implForName.VaultFactory,
  stakeRegistry: proxyFor('OperatorServiceRegistry'),
  meshFactory: implForName.MeshFactory,
  governorFactory: implForName.GovernorFactory,
  mutualRegistry: implForName.MutualRegistry,
  optimisticMutualArbiter: implForName.OptimisticMutualArbiter,
  linkedMutualPolicy: implForName.LinkedMutualPolicy,
  skimmingStrategy: agentSkimStrategy || undefined,
  vaultCoverConduit: vaultCoverConduit || undefined,
  flatFeeStrategies: allFor('FlatFeeAtCreate'),
  agentIdentityRegistries: agentIdentityRegistry ? [agentIdentityRegistry] : [],
  optimisticInsuranceArbiters: allFor('OptimisticInsuranceArbiter'),
  twoTierArbiters: allFor('TwoTierArbiter'),
  attestationArbiters: allFor('AttestationArbiter'),
}
const manifestPath = join(repoRoot, 'indexer', `deployments.${chainId}.json`)
writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n')
console.log(`[write-frontend-env] wrote ${manifestPath}`)
