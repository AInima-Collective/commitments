import { useQuery } from '@tanstack/react-query'
import { type Address } from 'viem'
import { useChainId } from 'wagmi'

import {
  useReadCommitmentsVaultYieldStrategy,
  useReadSkimmingMockStrategyOperator,
  useReadSkimmingMockStrategyOperatorFeeBps,
  useReadSkimmingMockStrategySkimBps,
} from '../generated'
import { getContractAddresses } from '../config/contracts'
import { hasIndexer, indexerFetch } from '../config/indexer'
import { parsePerilURI, type PerilMeta } from '../lib/peril'
import { useMutualListings } from './useMutualListings'
import { useMutualPremium, type MutualPremiumStream } from './useMutualPremium'
import { useMutuals, type MutualIndexed } from './useMutuals'

/**
 * Running totals of the vault's coverage-fee pipeline from the indexer's
 * `GET /vaults/:vault/coverage`. Underlying-asset denominated except
 * `premiumFunded` (vault shares — the mutual numeraire).
 */
export interface VaultCoverageFeeTotals {
  skimmed: bigint
  operatorFee: bigint
  premiumRouted: bigint
  premiumFunded: bigint
  settlementDonated: bigint
}

/**
 * The underwritten-vault coverage surface for one vault: the mutual that
 * ambient-covers its deposits, the live premium-stream state, the skim terms,
 * and the fee pipeline totals.
 */
export interface VaultCoverage {
  mutual: MutualIndexed
  conduit: Address
  /** Decoded peril document (name / description / trigger) from the registry listing. */
  peril: PerilMeta
  /** Live §G premium-stream state (chain read; fresh without the indexer). */
  stream: MutualPremiumStream | undefined
  /** Annualized premium yield to underwriters, bps. */
  premiumAprBps: number | undefined
  /** True while underwriters are actively accruing premium. */
  isStreaming: boolean
  /** Seconds until the premium stream lapses (0 once elapsed). */
  secondsRemaining: number
  /** Skim share of new gains, bps — the depositors' coverage cost. */
  skimBps: number | undefined
  /** Operator's share OF the skim, bps. */
  operatorFeeBps: number | undefined
  /** The vault manager (the agent) paid the operator fee. */
  operator: Address | undefined
  /** Indexer fee-pipeline totals; undefined without an indexer. */
  feeTotals: VaultCoverageFeeTotals | undefined
}

interface CoverageWire {
  mutualId: string | null
  totals?: {
    skimmed: string
    operatorFee: string
    premiumRouted: string
    premiumFunded: string
    settlementDonated: string
  }
}

/**
 * useVaultCoverage — resolves whether `vaultAddress` is an underwritten vault
 * (a mutual row carries it as `coveredVault`) and assembles the coverage
 * surface: mutual header (indexer), peril + premium stream (chain), skim terms
 * (chain, via the vault's own `yieldStrategy()` — works for any covered vault,
 * not just the seeded one), and fee totals (indexer).
 *
 * Returns `coverage: undefined` for ordinary vaults, while loading, or when the
 * indexer is absent (the association itself is indexer-sourced — same contract
 * as the old useVaultManagerBond) — callers render nothing in all three cases.
 */
export function useVaultCoverage(vaultAddress: Address | undefined): {
  coverage: VaultCoverage | undefined
  isLoading: boolean
} {
  const chainId = useChainId()
  const managerAddress = getContractAddresses(chainId).commitmentManager
  const vaultLower = vaultAddress?.toLowerCase()

  const { mutuals, isLoading: mutualsLoading } = useMutuals()
  const mutual = vaultLower
    ? mutuals.find((m) => m.coveredVault?.toLowerCase() === vaultLower)
    : undefined
  const covered = mutual !== undefined && mutual.conduit !== null

  const { listings } = useMutualListings()
  const listing = mutual ? listings.find((l) => l.mutualId === mutual.mutualId) : undefined
  const peril = parsePerilURI(listing?.perilURI)

  const premium = useMutualPremium({
    managerAddress,
    mutualId: mutual?.mutualId,
    enabled: covered,
  })

  // Skim terms come from the vault's CURRENT strategy — resolved live so the
  // card survives a strategy rotation without env changes.
  const { data: strategyAddress } = useReadCommitmentsVaultYieldStrategy({
    address: vaultAddress,
    query: { enabled: covered },
  })
  const strategyReadEnabled = covered && Boolean(strategyAddress)
  const { data: skimBps } = useReadSkimmingMockStrategySkimBps({
    address: strategyAddress,
    query: { enabled: strategyReadEnabled },
  })
  const { data: operatorFeeBps } = useReadSkimmingMockStrategyOperatorFeeBps({
    address: strategyAddress,
    query: { enabled: strategyReadEnabled },
  })
  const { data: operator } = useReadSkimmingMockStrategyOperator({
    address: strategyAddress,
    query: { enabled: strategyReadEnabled },
  })

  const totalsQuery = useQuery<VaultCoverageFeeTotals | null>({
    queryKey: ['vault-coverage-totals', chainId, vaultLower],
    enabled: hasIndexer && covered,
    staleTime: 30_000,
    queryFn: async () => {
      const res = await indexerFetch(`/vaults/${vaultLower}/coverage`)
      if (!res.ok) throw new Error(`Indexer error: ${res.status}`)
      const wire = (await res.json()) as CoverageWire
      if (!wire.totals) return null
      return {
        skimmed: BigInt(wire.totals.skimmed),
        operatorFee: BigInt(wire.totals.operatorFee),
        premiumRouted: BigInt(wire.totals.premiumRouted),
        premiumFunded: BigInt(wire.totals.premiumFunded),
        settlementDonated: BigInt(wire.totals.settlementDonated),
      }
    },
  })

  if (!covered || !mutual) {
    return { coverage: undefined, isLoading: hasIndexer && mutualsLoading }
  }
  return {
    coverage: {
      mutual,
      conduit: mutual.conduit as Address,
      peril,
      stream: premium.stream,
      premiumAprBps: premium.premiumAprBps ?? mutual.premiumAprBps,
      isStreaming: premium.isStreaming,
      secondsRemaining: premium.secondsRemaining,
      skimBps: skimBps !== undefined ? Number(skimBps) : undefined,
      operatorFeeBps: operatorFeeBps !== undefined ? Number(operatorFeeBps) : undefined,
      operator,
      feeTotals: totalsQuery.data ?? undefined,
    },
    isLoading: false,
  }
}
