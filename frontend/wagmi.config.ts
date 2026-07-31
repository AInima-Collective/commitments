import { defineConfig } from '@wagmi/cli'
import { foundry, react } from '@wagmi/cli/plugins'

export default defineConfig({
  out: 'src/generated.ts',
  contracts: [],
  plugins: [
    foundry({
      project: '..',
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
        'CommitmentsGovernor.json',
        'CommitmentsTimelock.json',
        'GovernorFactory.json',
        'TokenWeightingVotesShim.json',
      ],
    }),
    react(),
  ],
})
