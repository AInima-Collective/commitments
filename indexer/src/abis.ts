/**
 * Contract ABIs sourced from the frontend's wagmi-generated module.
 *
 * This is intentionally a thin re-export rather than a JSON import so TypeScript
 * preserves the `const` ABI types — Ponder relies on that narrowing for
 * strongly-typed event handlers.
 */
// Phase 14 event signatures (metadata tail args on Commitment/Agreement events + OperatorMetadataUpdated) verified on 2026-04-24.
//
// Mutual / Synthetic Mutual (verified 2026-06-21): the wagmi-generated
// `commitmentManagerAbi` already carries the full mutual event surface
// (MutualCreated / MutualActivated / MemberJoined / MutualLoss* / MemberSettled /
// Member{ExitRequested,Released} / MutualTerminated) and the mutual view
// functions (getMutual / getMembership / getMutualLossProposal /
// pendingMemberLoss), so no manual ABI merge is needed for the mutual handlers
// to bind. `mutualRegistryAbi` and `optimisticMutualArbiterAbi` are likewise
// generated; they're re-exported here for the conditional bindings in
// ponder.config.ts and the chain reads in src/mutual.ts.
export {
  commitmentManagerAbi,
  commitmentsVaultAbi,
  vaultFactoryAbi,
  operatorRegistryAbi,
  operatorServiceRegistryAbi,
  meshFactoryAbi,
  fanInNodeAbi,
  fanOutNodeAbi,
  tokenWeightingAbi,
  mutualRegistryAbi,
  optimisticMutualArbiterAbi,
  optimisticInsuranceArbiterAbi,
  twoTierArbiterAbi,
  attestationArbiterAbi,
  linkedMutualPolicyAbi,
  // Self-custody distribution strategy (§D.7): emits DistributionPaid /
  // Prefunded / CreditRefunded from its OWN address, not the manager, so it
  // needs a dedicated Ponder binding loaded from deployment artifacts.
  flatFeeAtCreateAbi,
  // Underwritten agent vault: the fee-skimming strategy (YieldSkimmed /
  // OperatorFeePaid / PremiumRouted) and the keyless cover conduit
  // (PremiumFunded), both singleton bindings gated on the seed deploying them.
  skimmingMockStrategyAbi,
  vaultCoverConduitAbi,
  // Governance: the governor and factory have Ponder bindings; the timelock
  // ABI serves the indexer's chain reads in src/governance.ts.
  commitmentsGovernorAbi,
  governorFactoryAbi,
  commitmentsTimelockAbi,
  // ERC-8004 IdentityRegistry. The Dev bootstrap subclass shares the full
  // canonical registry ABI, so one ABI serves the local dev proxy and the
  // production registry at 0x8004A169FB4a3325136EB29fA0ceB6D2e539a432.
  erc8004IdentityRegistryDevAbi as agentIdentityRegistryAbi,
} from '../../frontend/src/generated.ts'
