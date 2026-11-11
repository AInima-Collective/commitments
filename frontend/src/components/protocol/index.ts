// Public API barrel for the protocol-aware (knows about commitments) layer.
// May import from components/ui/** and lib/**; must not import from
// components/<feature>/** or pages/** (see eslint.config.js — drafted 'warn').

export { ActorSwitcher } from './ActorSwitcher'
export type { ActorSwitcherProps } from './ActorSwitcher'
export { AgentBadge } from './AgentBadge'
export type { AgentBadgeProps } from './AgentBadge'
export { ActivityFeed } from './ActivityFeed'
export { TimeControls } from './TimeControls'
export type { TimeControlsProps } from './TimeControls'
export type {
  ActivityEvent,
  ActivityEventTone,
  ActivityEventType,
  ActivityFeedProps,
} from './ActivityFeed'
export {
  CommitmentStatusBadge,
  AgreementStatusBadge,
  MetadataStatusBadge,
  OperatorStatusBadge,
  ProposalKindBadge,
  ProposalStateBadge,
  RiskTierBadge,
  SupportBadge,
} from './Status'
export type {
  CommitmentStatus,
  AgreementStatus,
  MetadataStatus,
  OperatorStatus,
  ProposalKind,
  ProposalState,
  RiskTierBadgeTier,
  UnifiedRowStatus,
  VoteSupport,
} from './Status'
export { MutualStatusBadge } from './Status'
export type { MutualLifecycle } from './Status'
export { ProposalActionRow } from './ProposalActionRow'
export type { ProposalActionRowProps } from './ProposalActionRow'
export { ProposalTimeline } from './ProposalTimeline'
export type { ProposalTimelineProps } from './ProposalTimeline'
export { CommitmentTitle } from './CommitmentTitle'
export type {
  CommitmentTitleElement,
  CommitmentTitleProps,
  CommitmentTitleSize,
} from './CommitmentTitle'
export { CommitmentTags } from './CommitmentTags'
export type { CommitmentTagsProps, CommitmentTagsSize } from './CommitmentTags'
export { CommitmentTerms } from './CommitmentTerms'
export type { CommitmentTermsProps } from './CommitmentTerms'
export { DerivedLabelPreview } from './DerivedLabelPreview'
export type { DerivedLabelPreviewProps } from './DerivedLabelPreview'
export { MetadataProvenance } from './MetadataProvenance'
export type { MetadataProvenanceProps } from './MetadataProvenance'
export { MetadataTrustBadge } from './MetadataTrustBadge'
export type { MetadataTrustBadgeProps, MetadataTrustBadgeSize } from './MetadataTrustBadge'
export { Countdown } from './Countdown'
export type { CountdownProps, CountdownTone } from './Countdown'
export { CuratorCard } from './CuratorCard'
export type { CuratorCardProps, VaultCurator } from './CuratorCard'
export { StrategyCard } from './StrategyCard'
export type { StrategyCardProps, VaultStrategy } from './StrategyCard'
export { EncumbranceBar } from './EncumbranceBar'
export type { EncumbranceBarProps, EncumbranceBarSize } from './EncumbranceBar'
export { SharedLossGauge } from './SharedLossGauge'
export type { SharedLossGaugeProps, SharedLossGaugeSize } from './SharedLossGauge'
export { PendingLossNotice } from './PendingLossNotice'
export type {
  PendingLossNoticeProps,
  PendingLossNoticeSize,
} from './PendingLossNotice'
export { LifecycleStepper } from './LifecycleStepper'
export type {
  LifecycleStep,
  LifecycleStepperProps,
  LifecycleStepState,
} from './LifecycleStepper'
export { commitmentLifecycle } from './lifecycleUtils'
export { MetadataSummary } from './MetadataSummary'
export type { MetadataSummaryProps } from './MetadataSummary'
export { OperatorIdentity } from './OperatorIdentity'
export type { OperatorIdentityProps, OperatorIdentitySize } from './OperatorIdentity'
export { PageHeader } from './PageHeader'
export type { PageHeaderProps } from './PageHeader'
export { PartyRow } from './PartyRow'
export type { PartyRowProps } from './PartyRow'
export { PortfolioHero } from './PortfolioHero'
export type { PortfolioHeroProps } from './PortfolioHero'
export { RiskRow } from './RiskRow'
export type { RiskRowProps } from './RiskRow'
export { ServiceStakeBreakdown } from './ServiceStakeBreakdown'
export type { ServiceStakeBreakdownProps } from './ServiceStakeBreakdown'
export { riskTier } from '../../lib/risk'
export type { RiskTier } from '../../lib/risk'
