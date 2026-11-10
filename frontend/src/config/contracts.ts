import { type Address } from 'viem'

interface ContractAddresses {
  commitmentsVault: Address | undefined
  commitmentManager: Address | undefined
  operatorRegistry: Address | undefined
  stakeRegistry: Address | undefined
  meshFactory: Address | undefined
  tokenWeighting: Address | undefined
  fanOut: Address | undefined
  fanIn: Address | undefined
  defaultArbiter: Address | undefined
  /** Curated ManualArbiter deployment (may differ from the Anvil demo EOA). */
  manualArbiter: Address | undefined
  /** Quorum-attestation arbiter deployment, when configured. */
  attestationArbiter: Address | undefined
  /** Two-controller ruling + appeal court deployment, when configured. */
  twoTierArbiter: Address | undefined
  // v2 backing adapters + distribution strategies (token-agnostic singletons,
  // deployed by Simulate). Undefined until
  // `just dev-up` writes them into .env.local.
  erc20Adapter: Address | undefined
  erc4626Adapter: Address | undefined
  // Raw underlying ERC-20s (priced by erc20Adapter) — non-vault backing
  // options. Undefined until `just dev-up` writes them from the vault assets.
  usdcToken: Address | undefined
  wethToken: Address | undefined
  usdtToken: Address | undefined
  /** Underlying DAI MockERC20 of the agent-managed cvaDAI vault (open mint on anvil). */
  daiToken: Address | undefined
  indexYieldStrategy: Address | undefined
  flatFeeStrategy: Address | undefined
  optimisticInsuranceArbiter: Address | undefined
  // Second OptimisticInsuranceArbiter instance, bonded in DAI for the
  // agent-managed cvaDAI market — one arbiter instance per bond denomination
  // (the claim-bond token must match the market's payout asset). The
  // canonical claim gates consume BOTH via `getOptimisticInsuranceArbiters`
  // in ./arbiters, never this field directly.
  daiOptimisticArbiter: Address | undefined
  // Underwritten agent vault (agent-bonds coverage-market pattern): cvaDAI,
  // whose fee-skimming yield strategy is operated by the seeded ERC-8004 agent
  // (agentStrategy — skimBps/operatorFeeBps/operator reads for the coverage
  // card); the keyless VaultCoverConduit funding the underwriter mutual's
  // premium stream from the vault's own yield; the DAI-bonded
  // OptimisticMutualArbiter declaring drawdown losses; and the
  // ForfeitDonationBeneficiary — the mutual's beneficiary, donating loss
  // settlements back into the vault. Undefined until `just dev-up` runs.
  agentVault: Address | undefined
  agentStrategy: Address | undefined
  vaultCoverConduit: Address | undefined
  agentMutualArbiter: Address | undefined
  agentVaultBeneficiary: Address | undefined
  // Mutual surface. MutualRegistry indexes the pooled shared-loss mutuals;
  // OptimisticMutualArbiter is the bonded loss proposer. Undefined until
  // `just dev-up` writes them into .env.local.
  mutualRegistry: Address | undefined
  optimisticMutualArbiter: Address | undefined
  // Premium leg: utilization-curve pricing (PremiumScheduler) + cover
  // binding/funding executor (LinkedMutualPolicy). The policy is the
  // policyholder's entry point for buying cover (bindCover).
  premiumScheduler: Address | undefined
  linkedMutualPolicy: Address | undefined
  // ERC-8004 ("Trustless Agents") identity registry — ERC-721 where
  // agentId = tokenId (ids start at 0), owner = the agent's controlling
  // account, tokenURI = the registration JSON. Written by
  // script/write-frontend-env.mjs on anvil; the canonical proxy address
  // (0x8004A169…a432) on live chains. Undefined until `just dev-up` runs.
  agentIdentityRegistry: Address | undefined
}

export function getContractAddresses(_chainId: number): ContractAddresses {
  return {
    commitmentsVault: import.meta.env.VITE_COMMITMENTS_VAULT_ADDRESS as Address | undefined,
    commitmentManager: import.meta.env.VITE_COMMITMENT_MANAGER_ADDRESS as Address | undefined,
    operatorRegistry: import.meta.env.VITE_OPERATOR_REGISTRY_ADDRESS as Address | undefined,
    stakeRegistry: import.meta.env.VITE_STAKE_REGISTRY_ADDRESS as Address | undefined,
    meshFactory: import.meta.env.VITE_MESH_FACTORY_ADDRESS as Address | undefined,
    tokenWeighting: import.meta.env.VITE_TOKEN_WEIGHTING_ADDRESS as Address | undefined,
    fanOut: import.meta.env.VITE_FAN_OUT_ADDRESS as Address | undefined,
    fanIn: import.meta.env.VITE_FAN_IN_ADDRESS as Address | undefined,
    defaultArbiter: import.meta.env.VITE_DEFAULT_ARBITER_ADDRESS as Address | undefined,
    manualArbiter: import.meta.env.VITE_MANUAL_ARBITER_ADDRESS as Address | undefined,
    attestationArbiter: import.meta.env.VITE_ATTESTATION_ARBITER_ADDRESS as Address | undefined,
    twoTierArbiter: import.meta.env.VITE_TWO_TIER_ARBITER_ADDRESS as Address | undefined,
    erc20Adapter: import.meta.env.VITE_ERC20_ADAPTER_ADDRESS as Address | undefined,
    erc4626Adapter: import.meta.env.VITE_ERC4626_ADAPTER_ADDRESS as Address | undefined,
    usdcToken: import.meta.env.VITE_USDC_TOKEN_ADDRESS as Address | undefined,
    wethToken: import.meta.env.VITE_WETH_TOKEN_ADDRESS as Address | undefined,
    usdtToken: import.meta.env.VITE_USDT_TOKEN_ADDRESS as Address | undefined,
    daiToken: import.meta.env.VITE_DAI_TOKEN_ADDRESS as Address | undefined,
    indexYieldStrategy: import.meta.env.VITE_INDEX_YIELD_STRATEGY_ADDRESS as Address | undefined,
    flatFeeStrategy: import.meta.env.VITE_FLAT_FEE_STRATEGY_ADDRESS as Address | undefined,
    optimisticInsuranceArbiter: import.meta.env.VITE_OPTIMISTIC_INSURANCE_ARBITER_ADDRESS as Address | undefined,
    daiOptimisticArbiter: import.meta.env.VITE_DAI_OPTIMISTIC_ARBITER_ADDRESS as Address | undefined,
    agentVault: import.meta.env.VITE_AGENT_VAULT_ADDRESS as Address | undefined,
    agentStrategy: import.meta.env.VITE_AGENT_STRATEGY_ADDRESS as Address | undefined,
    vaultCoverConduit: import.meta.env.VITE_VAULT_COVER_CONDUIT_ADDRESS as Address | undefined,
    agentMutualArbiter: import.meta.env.VITE_AGENT_MUTUAL_ARBITER_ADDRESS as Address | undefined,
    agentVaultBeneficiary: import.meta.env.VITE_AGENT_VAULT_BENEFICIARY_ADDRESS as Address | undefined,
    mutualRegistry: import.meta.env.VITE_MUTUAL_REGISTRY_ADDRESS as Address | undefined,
    optimisticMutualArbiter: import.meta.env.VITE_OPTIMISTIC_MUTUAL_ARBITER_ADDRESS as Address | undefined,
    premiumScheduler: import.meta.env.VITE_PREMIUM_SCHEDULER_ADDRESS as Address | undefined,
    linkedMutualPolicy: import.meta.env.VITE_LINKED_MUTUAL_POLICY_ADDRESS as Address | undefined,
    agentIdentityRegistry: import.meta.env.VITE_AGENT_IDENTITY_REGISTRY_ADDRESS as Address | undefined,
  }
}

/**
 * One vault: which vaults exist and what we call them. `useVaults` reads them
 * from the indexer; {@link getVaultRegistry} is the env fallback. Live numbers
 * (TVL, APY, your position) are read on demand by hooks.
 */
export interface VaultDescriptor {
  address: Address
  /** Display name. Falls back to `${assetSymbol} Vault` if omitted. */
  name?: string
  /** Asset symbol shown in the asset column. */
  assetSymbol: string
  /** Underlying asset and its decimals, when indexed. */
  asset?: Address
  assetDecimals?: number
}

const ENV_VAULTS: Array<{ address: Address | undefined; name: string; assetSymbol: string; description: string }> = [
  {
    address: import.meta.env.VITE_COMMITMENTS_VAULT_ADDRESS as Address | undefined,
    name: 'USDC Vault',
    assetSymbol: 'USDC',
    description:
      'Single-asset, permissionless ERC-4626 vault. Yield routes pro-rata to depositors and counterparties.',
  },
  {
    address: import.meta.env.VITE_ETH_VAULT_ADDRESS as Address | undefined,
    name: 'ETH Vault',
    assetSymbol: 'WETH',
    description:
      'Wrapped Ether collateral pool. Same ERC-4626 commitment surface as the USDC vault, denominated in WETH.',
  },
  {
    address: import.meta.env.VITE_USDT_VAULT_ADDRESS as Address | undefined,
    name: 'USDT Vault',
    assetSymbol: 'USDT',
    description:
      'Yield-bearing USDT savings. Holders can buy De-Peg cover from the mutual to protect against USDT trading below peg.',
  },
  {
    address: import.meta.env.VITE_AGENT_VAULT_ADDRESS as Address | undefined,
    name: 'Agent Alpha DAI Vault',
    assetSymbol: 'DAI',
    description:
      'Agent-managed DAI strategy, automatically covered: underwriters back a 5% drawdown floor and are paid from the vault’s own yield; a proven breach marks them down and restores depositor NAV. The ERC-8004 manager underwrites its own vault.',
  },
]

/**
 * Vault registry from env: the fallback for {@link useVaults} when the indexer
 * is not configured, and the list for callers outside React. The indexer's
 * `vault` table has every factory-deployed vault; prefer `useVaults`.
 */
export function getVaultRegistry(_chainId: number): VaultDescriptor[] {
  return ENV_VAULTS.flatMap(({ address, name, assetSymbol }) => (address ? [{ address, name, assetSymbol }] : []))
}

/**
 * The hand-written one-line description of an env-configured vault. The
 * indexed vault row carries none; a vault's own metadata `description` wins.
 */
export function getVaultDescription(address: Address): string | undefined {
  const lower = address.toLowerCase()
  return ENV_VAULTS.find((v) => v.address?.toLowerCase() === lower)?.description
}

/**
 * A backing option for commitment creation: the custodied `token` and the
 * read-only pricing `adapter` bound at creation. v2 commitments can be backed
 * by any ERC-20 / ERC-4626 share; this enumerates the known pairs from config.
 */
export interface BackingOption {
  token: Address
  adapter: Address
  label: string
  /** True when the token is an ERC-4626 vault share (priced by erc4626Adapter). */
  isVaultShare: boolean
}

/**
 * Known (token, adapter) backing pairs for the connected chain: every vault in
 * `vaults` (pass `useVaults().vaults`; defaults to the env list). The canonical
 * vault share (priced by the ERC-4626 adapter) is the default and leads the
 * list; raw ERC-20s (priced by the ERC20StaticAdapter) follow. Returns an empty
 * array until `just dev-up` writes the adapter + token addresses.
 *
 * Display labels here are coarse fallbacks — the create forms resolve the real
 * `decimals`/`symbol` from each option's token on-chain via `useTokenMeta`, so
 * this label only has to be human-recognizable in the picker.
 */
export function getBackingOptions(
  chainId: number,
  vaults: VaultDescriptor[] = getVaultRegistry(chainId),
): BackingOption[] {
  const env = getContractAddresses(chainId)
  const options: BackingOption[] = []
  // Vault shares first — every vault in the registry is a valid ERC-4626
  // backing option (priced by the shared erc4626Adapter), not just the
  // canonical one. The registry is ordered canonical-first, so the historical
  // default backing still leads the list.
  if (env.erc4626Adapter) {
    for (const descriptor of vaults) {
      options.push({
        token: descriptor.address,
        adapter: env.erc4626Adapter,
        label: descriptor.name ?? `${descriptor.assetSymbol} shares`,
        isVaultShare: true,
      })
    }
  }
  // Raw ERC-20 backing options — only available once the ERC20StaticAdapter and
  // the token addresses are in the env.
  if (env.erc20Adapter) {
    const rawTokens: Array<{ token: Address | undefined; label: string }> = [
      { token: env.usdcToken, label: 'USDC (raw)' },
      { token: env.wethToken, label: 'WETH (raw)' },
      { token: env.usdtToken, label: 'USDT (raw)' },
    ]
    for (const { token, label } of rawTokens) {
      if (!token) continue
      options.push({ token, adapter: env.erc20Adapter, label, isVaultShare: false })
    }
  }
  return options
}

/** The default backing pair (canonical vault share), or undefined if unconfigured. */
export function getDefaultBacking(chainId: number, vaults?: VaultDescriptor[]): BackingOption | undefined {
  return getBackingOptions(chainId, vaults)[0]
}

/**
 * A protocol-owned address that deserves a human label wherever it appears as
 * a commitment party. These are contracts, not people — rendering them as bare
 * addresses hides what the commitment actually promises (e.g. a forfeit
 * routed to a restitution beneficiary is a promise to *depositors*).
 */
export interface KnownAddressInfo {
  address: Address
  /** Short human label rendered in place of the truncated hex. */
  label: string
  /** One-line explanation surfaced via `title=`. */
  description: string
  /** Optional in-app route the label links to (e.g. the protected vault). */
  href?: string
}

/**
 * Known protocol addresses for the connected chain, keyed off env config —
 * never hardcode addresses in components; add entries here instead. The
 * entries cover the underwritten agent vault's keyless periphery, so the
 * human-meaningful counterparties render as roles instead of bare addresses.
 */
export function getKnownAddresses(chainId: number): KnownAddressInfo[] {
  const env = getContractAddresses(chainId)
  const out: KnownAddressInfo[] = []
  if (env.agentVaultBeneficiary) {
    out.push({
      address: env.agentVaultBeneficiary,
      label: 'Vault depositors (restitution)',
      description:
        'ForfeitDonationBeneficiary — a keyless contract that sweeps forfeited or mutual-loss-settled shares and donates them back into the protected vault, restoring depositor NAV.',
      href: env.agentVault ? `/app/vaults/${env.agentVault}` : undefined,
    })
  }
  if (env.vaultCoverConduit) {
    out.push({
      address: env.vaultCoverConduit,
      label: 'Vault cover conduit (automatic)',
      description:
        'VaultCoverConduit — a keyless contract funded by the vault’s yield skim; it pays the underwriter mutual’s premium stream on behalf of ALL depositors, so cover needs no individual purchase.',
      href: env.agentVault ? `/app/vaults/${env.agentVault}` : undefined,
    })
  }
  return out
}

/** Case-insensitive lookup into {@link getKnownAddresses}. */
export function findKnownAddress(
  chainId: number,
  address: string | undefined,
): KnownAddressInfo | undefined {
  if (!address) return undefined
  const lower = address.toLowerCase()
  return getKnownAddresses(chainId).find((k) => k.address.toLowerCase() === lower)
}

/**
 * A service consumes operator stake and routes it into a workflow that the
 * commitment manager can validate against. Today only one service is wired, but the
 * surface treats it as one of many — adding a new service is a matter of
 * appending to {@link getServiceRegistry}.
 */
export interface ServiceDescriptor {
  /** URL slug. */
  slug: string
  /** Display name. */
  name: string
  /** Subtitle / one-line description. */
  description: string
  /** Stake-registry / service-handler address. Undefined when the service
   * isn't deployed on this chain. */
  stakeRegistry: Address | undefined
}

/**
 * Service registry — static today, shipping with one service as the sole entry.
 * The list is rendered by /services; per-service detail lives at
 * /services/:slug.
 */
export function getServiceRegistry(chainId: number): ServiceDescriptor[] {
  const env = getContractAddresses(chainId)
  return [
    {
      slug: 'service',
      name: 'Operator Service',
      description:
        'Off-chain operator service. Operators run components and submit signed results that the commitment manager validates.',
      stakeRegistry: env.stakeRegistry,
    },
  ]
}

export function getServiceDescriptor(
  chainId: number,
  slug: string | undefined,
): ServiceDescriptor | undefined {
  if (!slug) return undefined
  return getServiceRegistry(chainId).find((s) => s.slug === slug)
}
