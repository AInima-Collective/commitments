import { type Address, parseUnits, zeroAddress } from 'viem'

import { getContractAddresses } from './contracts'
import { offerMetadataJson } from '../lib/offerMetadata'
import { isSingleCommitOffer } from '../lib/offerCommitmentParams'

/**
 * Vault-share base units for an asset-denominated amount.
 *
 * Marketplace offers are anchored on the canonical USDC vault. The
 * vault is ERC-4626 with a 9-decimal offset on top of USDC's 6-decimal
 * asset, so `vault.decimals() == 15` and `1 USDC` of stake equals
 * `10^15` share base units. The forms read user input with
 * `vault.decimals()` (= 15), so amount fields must already be in
 * share base units — `parseUnits('500', 6)` is 0.0000005 shares
 * (≈ 0.0000000005 USDC), not 500 USDC.
 *
 * Offers against a different vault set their own `token` and denominate
 * amounts in that token's base units.
 */
export const USDC_VAULT_SHARE_DECIMALS = 15
function usdcVaultShares(usdc: string): bigint {
  return parseUnits(usdc, USDC_VAULT_SHARE_DECIMALS)
}

/**
 * Risk profile tier — mirrors the `risk` filter on the unified commitments
 * table and the on-chain risk tiers surfaced by `protocol/RiskTierBadge`.
 */
export type MarketRiskTier = 'low' | 'mid' | 'high'

/** Yield payment cadence — surfaced on the marketplace listing row. */
export type MarketYieldCadence = 'continuous' | 'epoch' | 'on-claim'

/**
 * Pattern discriminator — maps an offer to one of the nine application
 * patterns developed in the v0.1.0 whitepaper. Every offer card renders the
 * corresponding historical `whitepaperRef` as supporting context.
 *
 * ┌────────────────────────────────┬────────┬────────────────────────────────┐
 * │ pattern                        │ §      │ Visitor's role on commit       │
 * ├────────────────────────────────┼────────┼────────────────────────────────┤
 * │ avs-stake                      │ §4     │ Operator / Delegator           │
 * │ direct-coverage                │ §5.1   │ Underwriter                    │
 * │ mesh-pool                      │ §5.1   │ Pool underwriter               │
 * │ reciprocal-mutual              │ §5.1   │ Co-insured                     │
 * │ agent-underwriting             │ §5.4   │ Performance underwriter        │
 * │ agent-sla-bond                 │ §5.4   │ Agent (bond poster)            │
 * │ yield-donation                 │ §6.1   │ Donor                          │
 * │ mutual-aid                     │ §6.2   │ Aid member                     │
 * │ governance-weight              │ §6.4   │ Voter                          │
 * └────────────────────────────────┴────────┴────────────────────────────────┘
 */
export type MarketPattern =
  | 'avs-stake'
  | 'direct-coverage'
  | 'mesh-pool'
  | 'reciprocal-mutual'
  | 'agent-underwriting'
  | 'agent-sla-bond'
  | 'yield-donation'
  | 'mutual-aid'
  | 'governance-weight'

/**
 * Arbiter shape — kind of contract sitting at `commitment.arbiter`. Surfaced
 * as a chip on every offer card so visitors can read the trust assumption at
 * a glance. Whitepaper §5.2 develops this design surface.
 */
export type MarketArbiterKind =
  | 'eoa'
  | 'multisig'
  | 'committee'
  | 'service'
  | 'optimistic'
  | 'zk'
  | 'self'

/**
 * Standard commitment terms a depositor may be allowed to edit when accepting
 * an offer. Anything not listed in an offer's `negotiableFields` is locked to
 * the offer's value — an offer is a fixed deal by default.
 */
export type NegotiableField = 'amount' | 'challengeWindow' | 'expiry' | 'metadata'

/**
 * Fields every offer carries regardless of pattern. The discriminated union
 * below extends this with pattern-specific shapes.
 */
interface MarketOfferCommon {
  id: string
  /** Headline shown on the card. */
  name: string
  /** One-paragraph pitch shown in the drawer detail. */
  description: string
  /** Historical whitepaper section reference, e.g. '§5.4'. */
  whitepaperRef: string
  /** Display name of the offer publisher (operator, pool, agent, beneficiary…). */
  counterpartyName?: string
  /** On-chain counterparty address (forfeit beneficiary / yield recipient). */
  counterparty: Address
  /** Display name of the arbiter. */
  arbiterName?: string
  /** On-chain arbiter address. */
  arbiter: Address
  /** Arbiter shape — surfaces trust assumption on the card. */
  arbiterKind: MarketArbiterKind
  /**
   * Backing token the acceptor commits. Must be one of the app's known
   * backing options (`getBackingOptions`) so the create form can resolve
   * the pricing adapter. Omitted ⇒ the canonical vault share (default
   * backing). `minAmount`/`maxAmount` are denominated in THIS token's
   * base units.
   */
  token?: Address
  /** Inclusive minimum stake in vault asset base units. */
  minAmount: bigint
  /** Inclusive maximum stake in vault asset base units. */
  maxAmount: bigint
  /** Required commitment duration in seconds. `undefined` ≡ open-ended. */
  durationSecs?: number
  /** Fixed challenge window in seconds for this offer. Defaults to 86_400 (24h). */
  challengeWindowSecs?: number
  /**
   * Fields the acceptor may edit. Omitted ≡ only `'amount'` is negotiable —
   * accepting an offer is a fixed deal unless the publisher opts a field in.
   */
  negotiableFields?: ReadonlyArray<NegotiableField>
  /** Risk profile shown via RiskTierBadge. */
  riskTier: MarketRiskTier
  /** Free-form filter tags. */
  tags?: string[]
  /** Optional URL to long-form terms. */
  termsUrl?: string
  /**
   * Optional metadata pre-fill: a JSON template the acceptor edits in the
   * commit form. When set (and `'metadata'` is in `negotiableFields`),
   * OfferMode renders a single JSON textarea seeded with this template and
   * derives BOTH commitment metadata fields from it on every edit — the
   * `metadataURI` as an inline `data:application/json;base64,…` URI and the
   * `metadataHash` as keccak256 over the exact JSON bytes (the indexer
   * verifies the hash against the decoded data-URI payload).
   */
  metadataTemplateJson?: string
}

/** §4 — AVS-shaped operator stake. Yield in exchange for misbehavior forfeit. */
export interface AvsStakeOffer extends MarketOfferCommon {
  pattern: 'avs-stake'
  yieldBps: number
  cadence: MarketYieldCadence
  maxPenaltyBps: number
  forfeitConditions: string
  capacity?: bigint
}

/** §5.1 — direct one-to-one insurance, single commitment, premium out-of-band. */
export interface DirectCoverageOffer extends MarketOfferCommon {
  pattern: 'direct-coverage'
  /** Coverage limit in vault asset base units (= amount × maxPenaltyBps / 10_000). */
  sumInsured: bigint
  /** Premium quoted as flat amount or annualized rate; surfaced literally on card. */
  premiumRate: { kind: 'flat'; amount: bigint } | { kind: 'apr'; bps: number }
  coveredEvent: string
  claimHistory?: { count: number; paidShares: bigint }
  maxPenaltyBps: number
}

/** §5.1 — many-to-many pool via FanIn aggregation. Underwriters pool capacity. */
export interface MeshPoolOffer extends MarketOfferCommon {
  pattern: 'mesh-pool'
  /** FanInNode address aggregating pool underwriter capacity. */
  fanInNode: Address
  /** Total currently-encumbered capacity backing the pool, base units. */
  poolTvl: bigint
  /** Premium APR quoted to underwriters, in bps. */
  premiumApr: number
  coveredEvents: string[]
  /** Aggregate loss ratio over pool lifetime, bps. Optional. */
  lossRatio?: number
  /** Capacity utilization — written cover / poolTvl × 10_000, in bps. */
  capacityUsedBps: number
  maxPenaltyBps: number
}

/** §5.1 — P2P mutual via agreement, no settlement caps. */
export interface ReciprocalMutualOffer extends MarketOfferCommon {
  pattern: 'reciprocal-mutual'
  /** Counterparty's encumbered amount on the agreement. */
  theirAmount: bigint
  /** Visitor's required commitment amount on the agreement. */
  yourAmount: bigint
  coveredEvent: string
  maxPenaltyBps: number
}

/** §5.4 — performance-indexed agent underwriting, service NAV arbiter, HWM accounting. */
export interface AgentUnderwritingOffer extends MarketOfferCommon {
  pattern: 'agent-underwriting'
  /** Agent vault whose NAV the arbiter watches. */
  agentVault: Address
  /** Profit-share routed to underwriter on each NAV uptick, bps. */
  profitShareBps: number
  /** §5.4 always uses HWM accounting; flag is here to make the UI obvious. */
  hwmEnabled: true
  agentStrategy: string
  sumInsured: bigint
  /** Loss threshold below HWM that triggers forfeit, bps. */
  lossThresholdBps: number
  navTrack?: {
    since: number // unix seconds
    pnlBps: number
    maxDrawdownBps: number
  }
}

/**
 * §5.4 / ERC-8004 — agent SLA bond. An agent (or its operator) posts a
 * slashable, yield-bearing bond behind a published SLA; the SLA JSON travels
 * as the commitment metadata and the OptimisticInsuranceArbiter lets anyone
 * open a bonded claim against a breach. The commit-form taker here is the
 * AGENT side (bond poster), unlike the other patterns where the visitor
 * underwrites someone else's risk.
 */
export interface AgentSlaBondOffer extends MarketOfferCommon {
  pattern: 'agent-sla-bond'
  /** Slashable share of the bond, bps. SLA bonds are conventionally 10_000. */
  maxPenaltyBps: number
  /** One-line summary of what the SLA template asserts (card copy). */
  slaSummary: string
  /**
   * Vault the bond protects (vault-manager pattern): the counterparty is a
   * ForfeitDonationBeneficiary that donates the slashed bond back into this
   * vault, so restitution flows to its depositors. The card links here.
   */
  protectedVault?: Address
}

/** §6.1 — yield-share donation. maxPenalty=0; suggested yield-share routes to beneficiary. */
export interface YieldDonationOffer extends MarketOfferCommon {
  pattern: 'yield-donation'
  /** Suggested yield-share in bps; depositors may adjust at create. */
  suggestedYieldShareBps: number
  beneficiaryMission: string
  /** Total shares whose yield has been routed lifetime-to-date. Optional. */
  totalRoutedShares?: bigint
}

/** §6.2 — mutual aid via agreement + bilateral-settlement caps. */
export interface MutualAidOffer extends MarketOfferCommon {
  pattern: 'mutual-aid'
  theirAmount: bigint
  yourAmount: bigint
  /** Per-direction lifetime cap on settlement flow, base units. */
  settlementCapEachWay: bigint
  coveredEvents: string[]
  /** Group size if this is part of a network of pairwise agreements. */
  groupSize?: number
  maxPenaltyBps: number
}

/** §6.4 — governance weight derivation via TokenWeighting node. */
export interface GovernanceWeightOffer extends MarketOfferCommon {
  pattern: 'governance-weight'
  /** TokenWeighting node accepting this commitment as a stake source. */
  meshNode: Address
  /** Category label rendered on card (e.g. 'long-term grants', 'liquidity'). */
  weightCategory: string
  /** Voting-power multiplier in bps applied by the TokenWeighting config. */
  weightMultiplierBps: number
  daoName: string
  conviction: 'short' | 'medium' | 'long'
  maxPenaltyBps: number
}

/** Discriminated union — the canonical offer type. */
export type MarketOffer =
  | AvsStakeOffer
  | DirectCoverageOffer
  | MeshPoolOffer
  | ReciprocalMutualOffer
  | AgentUnderwritingOffer
  | AgentSlaBondOffer
  | YieldDonationOffer
  | MutualAidOffer
  | GovernanceWeightOffer

/**
 * Static AVS / donation offers — these don't depend on the seed-deployed
 * marketplace pattern contracts and are valid in any environment. Pattern
 * offers that DO need seed addresses (agent-underwriting, direct-coverage
 * via OptimisticInsuranceArbiter, linked-premium, mesh-pool,
 * governance-weight) are appended dynamically below in `buildMarketOffers`.
 */
const STATIC_OFFERS: MarketOffer[] = [
  {
    id: 'public-goods-yield-1',
    pattern: 'yield-donation',
    name: 'Gitcoin · public goods stream',
    description:
      'Donate the yield (no principal forfeit) on your committed shares to a Gitcoin grants round. Releases continuously; no forfeiture — pure yield-stream donation.',
    whitepaperRef: '§6.1',
    counterparty: '0xC4f7000000000000000000000000000000003aB9',
    counterpartyName: 'gitcoin.eth',
    arbiter: '0xC4f7000000000000000000000000000000003aB9',
    arbiterName: 'self-arbitrated',
    arbiterKind: 'self',
    minAmount: usdcVaultShares('25'),
    maxAmount: usdcVaultShares('100000'),
    durationSecs: 86_400 * 90,
    suggestedYieldShareBps: 500,
    beneficiaryMission:
      'Funds public-goods grants round selected by Gitcoin community governance.',
    riskTier: 'low',
    tags: ['public-good', 'donation'],
  },
]

/**
 * Deterministic Anvil test-mnemonic addresses used as counterparties on
 * the seeded agreement offers. The mnemonic is fixed
 * ('test test test test test test test test test test test junk') so
 * these match what MetaMask sees out of the box on a `just dev-up`
 * stack. Account 0 = admin/deployer, 1 = arbiter; depositor wallets
 * start at 2.
 */
const ANVIL_DEPOSITOR_3 = '0x90F79bf6EB2c4f870365E785982E1f101E93b906' as const // anvil[3]
const ANVIL_DEPOSITOR_4 = '0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65' as const // anvil[4]

/**
 * Marketplace offers anchored on contract addresses produced by
 * `script/Simulate.s.sol`. Each offer is appended ONLY if the seed wrote
 * the relevant address into `frontend/.env.local`; in environments
 * without the seed (production, fresh checkouts before `just dev-up`),
 * these patterns simply don't appear in the marketplace.
 *
 * Amount fields are in vault-share base units via `usdcVaultShares`. See
 * the helper's docstring for the decimal-offset rationale.
 */
function buildSeedOffers(): MarketOffer[] {
  // Chain id is irrelevant in v1 — env-driven; pass any number.
  const a = getContractAddresses(31337)
  const seeded: MarketOffer[] = []

  // §5.4 agent-underwriting seeded offer was removed alongside the deleted
  // NavPerformanceArbiter. The AgentUnderwritingOffer pattern type is retained
  // (reusable); re-add a seeded offer here once a replacement performance
  // arbiter lands in the seed.

  // §5.2 / §5.3 direct coverage via the OptimisticInsuranceArbiter.
  // Counterparty here is illustrative — a specific named policyholder
  // would replace `defaultArbiter` (anvil account 1) on a real deploy.
  if (a.optimisticInsuranceArbiter) {
    seeded.push({
      id: 'direct-coverage-optimistic-seed',
      pattern: 'direct-coverage',
      name: 'Smart-contract cover · optimistic',
      description:
        'Underwrite a smart-contract-failure policy resolved by an optimistic claim process. A claim that is not disputed within the challenge window finalizes automatically after timeout — no third-party arbitrator step.',
      whitepaperRef: '§5.2',
      counterparty: a.defaultArbiter ?? zeroAddress,
      counterpartyName: 'policyholder (demo)',
      arbiter: a.optimisticInsuranceArbiter,
      arbiterName: 'OptimisticInsuranceArbiter',
      arbiterKind: 'optimistic',
      minAmount: usdcVaultShares('1000'),
      maxAmount: usdcVaultShares('50000'),
      durationSecs: 86_400 * 180,
      sumInsured: usdcVaultShares('25000'),
      premiumRate: { kind: 'apr', bps: 600 },
      coveredEvent: 'Loss of funds caused by a documented exploit on the protected contract.',
      maxPenaltyBps: 5000,
      riskTier: 'mid',
      tags: ['insurance', 'optimistic'],
    })
  }

  // The seeded §5.4 vault-manager bond offer was removed when the agent
  // vault's protection became a multi-underwriter coverage market: the mutual
  // whose `coveredVault` points at the vault (see useMutuals) replaced the
  // bilateral manager bond. The `agent-sla-bond` pattern itself is retained
  // for future offers.

  // §5.1 reciprocal-mutual — bilateral agreement under a shared
  // arbiter. Both legs are real on-chain commitments via
  // `manager.proposeAgreement` + `acceptAgreement`; the
  // counterparty is anvil[3] (depositor 1 from the seed), so a user
  // connecting as that wallet can actually accept.
  if (a.defaultArbiter && a.commitmentsVault) {
    seeded.push({
      id: 'reciprocal-mutual-1',
      pattern: 'reciprocal-mutual',
      name: 'Reciprocal validator coverage',
      description:
        'Mutual ops insurance with another validator: each side pre-locks forfeitable shares under a shared arbiter. If either party suffers a covered fault, the arbiter forfeites the responsible side and routes the proceeds to the counterparty.',
      whitepaperRef: '§5.1',
      counterparty: ANVIL_DEPOSITOR_3,
      counterpartyName: 'depositor 1 (anvil)',
      arbiter: a.defaultArbiter,
      arbiterName: 'demo arbiter',
      arbiterKind: 'multisig',
      minAmount: usdcVaultShares('100'),
      maxAmount: usdcVaultShares('25000'),
      durationSecs: 86_400 * 90,
      yourAmount: usdcVaultShares('500'),
      theirAmount: usdcVaultShares('500'),
      coveredEvent:
        'Sustained downtime (>24h), key compromise, or signed double-attestation by the affected validator.',
      maxPenaltyBps: 3000,
      riskTier: 'mid',
      tags: ['mutual', 'p2p'],
    })
  }

  // §6.2 mutual-aid — bilateral agreement with per-direction
  // settlement caps. Counterparty is anvil[4] (depositor 2) so that
  // wallet can accept the proposal when seeded.
  if (a.defaultArbiter && a.commitmentsVault) {
    seeded.push({
      id: 'mutual-aid-1',
      pattern: 'mutual-aid',
      name: 'Bilateral solo-staker aid',
      description:
        'Bilateral mutual aid between two solo stakers: both pre-lock shares with a settlement cap on each direction so the arbiter can rebalance up to the published amount when either side files a claim.',
      whitepaperRef: '§6.2',
      counterparty: ANVIL_DEPOSITOR_4,
      counterpartyName: 'depositor 2 (anvil)',
      arbiter: a.defaultArbiter,
      arbiterName: 'demo arbiter',
      arbiterKind: 'multisig',
      minAmount: usdcVaultShares('50'),
      maxAmount: usdcVaultShares('5000'),
      durationSecs: 86_400 * 365,
      yourAmount: usdcVaultShares('200'),
      theirAmount: usdcVaultShares('200'),
      settlementCapEachWay: usdcVaultShares('50'),
      coveredEvents: ['Forfeiture event on one side', 'MEV-related fault', 'Hardware loss event'],
      groupSize: 2,
      maxPenaltyBps: 1000,
      riskTier: 'low',
      tags: ['mutual', 'aid'],
    })
  }


  // Linked-premium / mesh-pool / governance-weight seeded offers were
  // removed: their CTAs were preview / coming-next-disabled because the
  // matching frontend flow (linked-pair acceptance with EIP-712 signing,
  // two-step mesh-stake wizard) hasn't shipped. Surfacing offers a user
  // can't act on is noise. Re-add the entries here once those flows land.

  return seeded
}

/**
 * Opt every offer's metadata into the negotiable set, and attach the derived
 * template where something reads it.
 *
 * Done here rather than inline on each literal for two reasons: `offerMetadata`
 * reads fields from across the whole offer (pattern substance, tags, risk
 * tier), so it needs the finished object; and hand-writing a template beside
 * each offer is how the two drift until the metadata describes a deal the offer
 * no longer makes.
 *
 * `metadataTemplateJson` goes on SINGLE-COMMIT offers only, because that is the
 * only path that consumes it: `OfferMode` seeds a JSON editor from it and
 * derives URI + hash on every keystroke. Agreement-shaped offers route through
 * `OfferProposeMode`, which mounts an empty `agreement.v1` editor and never
 * looks at this field — setting it there would be a template nothing reads.
 * Their derived `agreement.v1` payload is available from `offerMetadata`, and
 * wiring it in without forcing the proposer through a pin step is the
 * agreements work, not this.
 *
 * Prefilled, not locked — the acceptor edits before signing. `metadata` joins
 * whatever the publisher already made negotiable rather than replacing it.
 */
function withDerivedMetadata(offers: MarketOffer[]): MarketOffer[] {
  return offers.map((offer) => {
    const negotiable = new Set<NegotiableField>(offer.negotiableFields ?? ['amount'])
    negotiable.add('metadata')
    const base = { ...offer, negotiableFields: Array.from(negotiable) }
    return isSingleCommitOffer(offer)
      ? { ...base, metadataTemplateJson: offerMetadataJson(offer) }
      : base
  })
}

export const MARKET_OFFERS: MarketOffer[] = withDerivedMetadata([
  ...STATIC_OFFERS,
  ...buildSeedOffers(),
])

/** Convenience accessor for the drawer + commit form. */
export function getMarketOffer(id: string): MarketOffer | undefined {
  return MARKET_OFFERS.find((o) => o.id === id)
}
