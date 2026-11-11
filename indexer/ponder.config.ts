import { createConfig, factory } from 'ponder'
import { parseAbiItem } from 'viem'

import {
  commitmentManagerAbi,
  commitmentsVaultAbi,
  fanInNodeAbi,
  fanOutNodeAbi,
  linkedMutualPolicyAbi,
  meshFactoryAbi,
  operatorRegistryAbi,
  operatorServiceRegistryAbi,
  optimisticMutualArbiterAbi,
  optimisticInsuranceArbiterAbi,
  twoTierArbiterAbi,
  attestationArbiterAbi,
  mutualRegistryAbi,
  tokenWeightingAbi,
  vaultFactoryAbi,
  flatFeeAtCreateAbi,
  skimmingMockStrategyAbi,
  vaultCoverConduitAbi,
  commitmentsGovernorAbi,
  governorFactoryAbi,
  agentIdentityRegistryAbi,
} from './src/abis'
import { loadDeployments } from './src/loadDeployments'
// Tri-state environment selector (LOCAL 31337 | SEPOLIA 11155111 | PROD Ethereum mainnet 1).
import { IS_PROD, IS_SEPOLIA, CHAIN_NAME as CORE_CHAIN, CHAIN_ID as chainId } from './src/env'

const deployments = loadDeployments(chainId)
// Sepolia: never crawl from genesis — set PONDER_START_BLOCK_11155111 to the
// block the deploy tx landed in (printed by `forge script`, also recoverable
// from broadcast/**/11155111/run-latest.json). Falls back to the deployment
// manifest's startBlock, which script/write-frontend-env.mjs sets to the lowest
// receipt block of the broadcast it read.
const sepoliaStartBlock = process.env.PONDER_START_BLOCK_11155111
  ? Number(process.env.PONDER_START_BLOCK_11155111)
  : deployments.startBlock
const startBlock = IS_SEPOLIA ? sepoliaStartBlock : deployments.startBlock

// ERC-8004 IdentityRegistry (issue #33). The canonical registry lives at the
// SAME address on 20+ chains (Ethereum mainnet included), so PROD binds it directly;
// dev/sepolia resolve the ERC8004IdentityRegistryDev proxy from the deployment
// manifest. Array-shaped (like managers/registries) for forward-compat — empty
// when the manifest lists none, in which case Ponder simply
// watches nothing but the handler event types still generate.
const AGENT_IDENTITY_REGISTRY_CANONICAL = '0x8004A169FB4a3325136EB29fA0ceB6D2e539a432' as const
const agentIdentityRegistries = IS_PROD
  ? [AGENT_IDENTITY_REGISTRY_CANONICAL]
  : deployments.agentIdentityRegistries
// The canonical registry is older than this protocol's deployment, so on PROD
// the manifest's startBlock (the protocol's deploy block) would miss every agent
// registered before it. Start at the registry's own deploy block when
// PONDER_START_BLOCK_AGENT_REGISTRY_1 gives it, and from genesis otherwise:
// slower, never wrong. Dev and Sepolia deploy their own registry with the rest.
const agentRegistryStartBlock = IS_PROD ? Number(process.env.PONDER_START_BLOCK_AGENT_REGISTRY_1 ?? 0) : startBlock

// Factory event — new FanIn/FanOut/TokenWeighting clones are discovered from
// the MeshFactory's NodeDeployed event and indexed automatically.
const nodeDeployedEvent = parseAbiItem(
  'event NodeDeployed(address indexed impl, address indexed clone, string nodeType)'
)

// Factory event — every CommitmentsVault is deployed by VaultFactory; Ponder
// discovers each one from VaultDeployed and indexes its events automatically.
const vaultDeployedEvent = parseAbiItem(
  'event VaultDeployed(address indexed asset, address indexed vault)'
)

// Governor instances spawn from GovernorFactory's GovernorDeployed event;
// each new clone gets indexed automatically via Ponder's `factory()` helper.
const governorDeployedEvent = parseAbiItem(
  'event GovernorDeployed(address indexed governor, address indexed timelock, address indexed shim, address source, string name)'
)

const optional = (address: `0x${string}` | undefined) => (address ? [address] : [])

export default createConfig({
  chains: {
    ...(IS_PROD
      ? {
          mainnet: {
            id: 1,
            rpc: process.env.PONDER_RPC_URL_1 ?? '',
            ws: process.env.PONDER_WS_URL_1,
          },
        }
      : IS_SEPOLIA
        ? {
            sepolia: {
              id: 11155111,
              rpc: process.env.PONDER_RPC_URL_11155111 ?? '',
              ws: process.env.PONDER_WS_URL_11155111,
            },
          }
        : {
            local: {
              id: 31337,
              rpc: process.env.ANVIL_RPC_URL ?? 'http://localhost:8545',
              ws: process.env.ANVIL_WS_URL ?? 'ws://localhost:8545',
            },
          }),
  },
  contracts: {
    CommitmentManager: {
      abi: commitmentManagerAbi,
      // The v2 manager is a single token-agnostic custody root. The address is
      // still passed as an array so per-row routing via `event.log.address`
      // stays forward-compatible with a future multi-stack deployment.
      chain: { [CORE_CHAIN]: { address: deployments.commitmentManagers } },
      startBlock,
    },
    OptimisticInsuranceArbiter: {
      abi: optimisticInsuranceArbiterAbi,
      chain: { [CORE_CHAIN]: { address: deployments.optimisticInsuranceArbiters } },
      startBlock,
    },
    TwoTierArbiter: {
      abi: twoTierArbiterAbi,
      chain: { [CORE_CHAIN]: { address: deployments.twoTierArbiters } },
      startBlock,
    },
    AttestationArbiter: {
      abi: attestationArbiterAbi,
      chain: { [CORE_CHAIN]: { address: deployments.attestationArbiters } },
      startBlock,
    },
    OptimisticMutualArbiter: {
      abi: optimisticMutualArbiterAbi,
      chain: {
        [CORE_CHAIN]: {
          address: optional(deployments.optimisticMutualArbiter),
        },
      },
      startBlock,
    },
    VaultFactory: {
      abi: vaultFactoryAbi,
      chain: { [CORE_CHAIN]: { address: deployments.vaultFactory } },
      startBlock,
    },
    CommitmentsVault: {
      abi: commitmentsVaultAbi,
      // Every vault is a VaultFactory child — discovered at index time from
      // VaultDeployed. The manager custodies vault *shares* as backing tokens,
      // so a deployment carries one vault per backing asset (USDC, WETH, …).
      chain: {
        [CORE_CHAIN]: {
          address: factory({
            address: deployments.vaultFactory,
            event: vaultDeployedEvent,
            parameter: 'vault',
          }),
        },
      },
      startBlock,
    },
    OperatorRegistry: {
      abi: operatorRegistryAbi,
      // Single registry today (see CommitmentManager note); array-shaped for
      // forward-compatibility.
      chain: { [CORE_CHAIN]: { address: deployments.operatorRegistries } },
      startBlock,
    },
    OperatorServiceRegistry: {
      abi: operatorServiceRegistryAbi,
      chain: { [CORE_CHAIN]: { address: deployments.stakeRegistry } },
      startBlock,
    },
    MeshFactory: {
      abi: meshFactoryAbi,
      chain: { [CORE_CHAIN]: { address: deployments.meshFactory } },
      startBlock,
    },
    FanInNode: {
      abi: fanInNodeAbi,
      chain: {
        [CORE_CHAIN]: {
          address: factory({
            address: deployments.meshFactory,
            event: nodeDeployedEvent,
            parameter: 'clone',
          }),
        },
      },
      startBlock,
    },
    FanOutNode: {
      abi: fanOutNodeAbi,
      chain: {
        [CORE_CHAIN]: {
          address: factory({
            address: deployments.meshFactory,
            event: nodeDeployedEvent,
            parameter: 'clone',
          }),
        },
      },
      startBlock,
    },
    TokenWeighting: {
      abi: tokenWeightingAbi,
      chain: {
        [CORE_CHAIN]: {
          address: factory({
            address: deployments.meshFactory,
            event: nodeDeployedEvent,
            parameter: 'clone',
          }),
        },
      },
      startBlock,
    },
    // Self-custody distribution strategies (FlatFeeAtCreate, ERC §D.7) emit
    // DistributionPaid / Prefunded / CreditRefunded from their OWN address, not
    // the manager, so the manager's DistributionPaid handler never sees them.
    // Bound by DEPLOYMENT address (not CommitmentBoundToStrategy discovery): a
    // committer prefunds BEFORE the first create/bind, and Ponder's factory()
    // only watches a child from its discovery block onward — so a bind-discovered
    // binding drops the pre-bind Prefunded. Bound UNCONDITIONALLY (not gated on
    // presence) so the FlatFeeAtCreate event types are always generated for the
    // handlers in src/index.ts; when the seed deploys none the address array is
    // empty and Ponder simply watches nothing.
    FlatFeeAtCreate: {
      abi: flatFeeAtCreateAbi,
      chain: { [CORE_CHAIN]: { address: deployments.flatFeeStrategies } },
      startBlock,
    },
    // ERC-8004 agent identity registry — badges accounts that own a registered
    // agent NFT. agentId is an ERC-721 tokenId and STARTS AT ZERO (never a
    // sentinel). Bound UNCONDITIONALLY (mirroring FlatFeeAtCreate) so the
    // AgentIdentityRegistry event types always generate for src/agents.ts.
    AgentIdentityRegistry: {
      abi: agentIdentityRegistryAbi,
      chain: { [CORE_CHAIN]: { address: agentIdentityRegistries } },
      startBlock: agentRegistryStartBlock,
    },
    // The contracts below may be absent from a deployment (PROD until launch).
    // Each is bound unconditionally with a possibly-empty address list so the
    // handler event types always generate; Ponder watches nothing for an empty
    // list, factory children included. Never pass `undefined`: Ponder reads an
    // undefined address as "every address".
    GovernorFactory: {
      abi: governorFactoryAbi,
      chain: { [CORE_CHAIN]: { address: optional(deployments.governorFactory) } },
      startBlock,
    },
    CommitmentsGovernor: {
      abi: commitmentsGovernorAbi,
      chain: {
        [CORE_CHAIN]: {
          address: factory({
            address: optional(deployments.governorFactory),
            event: governorDeployedEvent,
            parameter: 'governor',
          }),
        },
      },
      startBlock,
    },
    // MutualRegistered annotates the manager's mutual rows with cover terms.
    MutualRegistry: {
      abi: mutualRegistryAbi,
      chain: { [CORE_CHAIN]: { address: optional(deployments.mutualRegistry) } },
      startBlock,
    },
    // Cover/standby premium router: CoverBound / BindingExpired feed the
    // premium index; the §G premium events are on the manager.
    LinkedMutualPolicy: {
      abi: linkedMutualPolicyAbi,
      chain: { [CORE_CHAIN]: { address: optional(deployments.linkedMutualPolicy) } },
      startBlock,
    },
    // Underwritten agent vault (agent-bonds use case): the fee-skimming strategy
    // (YieldSkimmed / OperatorFeePaid / PremiumRouted → the vault's coverage-fee
    // ledger) and the keyless VaultCoverConduit (PremiumFunded → the
    // vault↔mutual association + funded-stream rows).
    SkimmingStrategy: {
      abi: skimmingMockStrategyAbi,
      chain: { [CORE_CHAIN]: { address: optional(deployments.skimmingStrategy) } },
      startBlock,
    },
    VaultCoverConduit: {
      abi: vaultCoverConduitAbi,
      chain: { [CORE_CHAIN]: { address: optional(deployments.vaultCoverConduit) } },
      startBlock,
    },
  },
  // Vault snapshots (src/vaultSnapshot.ts): one row per vault every `interval`
  // blocks. 25 blocks is ~5 minutes at 12s; the local chain mines every 2s
  // (`just dev-up`), so 15 blocks is ~30s and the admin "simulate yield" flow
  // sees its post-warp point without a manual trigger.
  blocks: {
    VaultSnapshot: {
      chain: CORE_CHAIN,
      startBlock,
      interval: IS_PROD || IS_SEPOLIA ? 25 : 15,
    },
  },
})
