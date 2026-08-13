import { defineConfig } from '@wagmi/cli'
import { foundry, react } from '@wagmi/cli/plugins'

export default defineConfig({
  out: 'src/generated.ts',
  contracts: [],
  plugins: [
    foundry({
      project: '..',
      // Some repository size-analysis profiles write a second, categorized
      // artifact tree under the shared `out/` directory. The normal Forge
      // build writes the canonical top-level artifacts consumed here; ignore
      // the categorized copies so contract names stay unique.
      exclude: [
        'arbiters/**',
        'vaults/**',
        'operator-registry/**',
        'mesh/**',
        'service-registry/**',
        'mutuals/**',
        'distributions/**',
        'governance/**',
      ],
      include: [
        'CommitmentsVault.json',
        'CommitmentManager.json',
        'OperatorRegistry.json',
        'FanInNode.json',
        'FanOutNode.json',
        'TokenWeighting.json',
        'MeshFactory.json',
        'VaultFactory.json',
        'OperatorServiceRegistry.json',
        'OptimisticInsuranceArbiter.json',
        'MutualRegistry.json',
        'OptimisticMutualArbiter.json',
        'ClaimRouter.json',
        'LinkedMutualPolicy.json',
        'PremiumScheduler.json',
        'MockStrategy.json',
        'SkimmingMockStrategy.json',
        'VaultCoverConduit.json',
        'FlatFeeAtCreate.json',
        'AttestationArbiter.json',
        'ManualArbiter.json',
        'TwoTierArbiter.json',
        'CommitmentsGovernor.json',
        'CommitmentsTimelock.json',
        'GovernorFactory.json',
        'TokenWeightingVotesShim.json',
      ],
    }),
    react(),
  ],
})
