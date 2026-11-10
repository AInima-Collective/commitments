// Public API barrel for the primitive (no-protocol-knowledge) layer.
// Higher layers may import from here; this layer must not import from
// components/protocol/** or components/<feature>/** (see eslint.config.js
// no-restricted-imports rules — Phase 2 drafts them as 'warn').

export { AddressDisplay } from './AddressDisplay'
export { AllocationBar } from './AllocationBar'
export type {
  AllocationBarProps,
  AllocationSegment,
  AllocationTone,
} from './AllocationBar'
export { ApyMeter } from './ApyMeter'
export type { ApyMeterProps, ApyMeterSize, ApyMeterTone, ApySource } from './ApyMeter'
export { BalanceLine } from './BalanceLine'
export type { BalanceLineProps } from './BalanceLine'
export { BrandMark } from './BrandMark'
export type { BrandMarkProps, BrandMarkSize } from './BrandMark'
export {
  useLabTheme,
  useMarkId,
  setPalette,
  setTypeStack,
  setMark,
  PALETTES,
  TYPE_STACKS,
  MARK_GROUPS,
  MARKS,
  DEFAULT_PALETTE,
  DEFAULT_TYPE,
  DEFAULT_MARK,
} from './labTheme'
export type { PaletteId, TypeStackId, MarkId } from './labTheme'
export { Button } from './Button'
export { CapacityMeter } from './CapacityMeter'
export type {
  CapacityMeterProps,
  CapacityMeterSize,
  CapacityMeterTone,
} from './CapacityMeter'
export { ChainBadge } from './ChainBadge'
export type { ChainBadgeProps, ChainBadgeSize } from './ChainBadge'
export type { ButtonProps, ButtonSize, ButtonVariant } from './Button'
export { Card } from './Card'
export type { CardDensity, CardProps, CardTone } from './Card'
export { CopyButton } from './CopyButton'
export type { CopyButtonProps } from './CopyButton'
export { DataTable } from './DataTable'
export type {
  DataTableColumn,
  DataTableDensity,
  DataTableProps,
  DataTableSize,
  DataTableSort,
  DataTableTone,
  SortDirection,
} from './DataTable'
export { Disclosure } from './Disclosure'
export type { DisclosureProps } from './Disclosure'
export { Drawer } from './Drawer'
export type { DrawerProps, DrawerSide, DrawerSize } from './Drawer'
export { EmptyState } from './EmptyState'
export type { EmptyStateProps } from './EmptyState'
export { EntityCard } from './EntityCard'
export type { EntityCardProps, EntityCardTone } from './EntityCard'
export { EntityLogo } from './EntityLogo'
export type { EntityLogoProps, EntityLogoSize } from './EntityLogo'
export { ErrorBlock } from './ErrorBlock'
export type { ErrorBlockMeta, ErrorBlockProps } from './ErrorBlock'
export { ErrorPanel } from './ErrorPanel'
export { FilterBar } from './FilterBar'
export { FormField } from './FormField'
export type { FormFieldProps, FormFieldTone } from './FormField'
export { HealthGauge } from './HealthGauge'
export type {
  HealthGaugeProps,
  HealthGaugeSize,
  HealthGaugeTone,
  HealthGaugeZone,
} from './HealthGauge'
export type {
  FilterBarProps,
  FilterBarSize,
  FilterMultiOption,
  FilterMultiProps,
  FilterRangeProps,
  FilterSearchProps,
  FilterSelectProps,
} from './FilterBar'
export { Input } from './Input'
export type { InputProps, InputSize, InputTone } from './Input'
export { MediaRow } from './MediaRow'
export type { MediaRowDensity, MediaRowElement, MediaRowProps, MediaRowTone } from './MediaRow'
export { Modal } from './Modal'
export type { ModalProps, ModalSize } from './Modal'
export {
  motion,
  AnimatePresence,
  useReducedMotion,
  useInView,
  useMotionValue,
  useTransform,
} from './motion'
export type { Variants, Transition, MotionProps } from './motion'
export { Notice } from './Notice'
export type { NoticeProps, NoticeSize, NoticeTone } from './Notice'
export { OperatorAvatar } from './OperatorAvatar'
export type { OperatorAvatarProps, OperatorAvatarSize } from './OperatorAvatar'
export { SectionNav } from './SectionNav'
export type { SectionNavItem, SectionNavProps } from './SectionNav'
export { Select } from './Select'
export type { SelectOption, SelectProps, SelectSize, SelectTone } from './Select'
export { SettlementBar } from './SettlementBar'
export type { SettlementBarDirection, SettlementBarProps, SettlementBarTone } from './SettlementBar'
export { ShareRatio } from './ShareRatio'
export type { ShareRatioProps } from './ShareRatio'
export { Skeleton } from './Skeleton'
export type { SkeletonAnimation, SkeletonProps, SkeletonShape } from './Skeleton'
export { SocialLink, GitHubMark, XMark } from './SocialLink'
export type { SocialLinkElement, SocialLinkProps, SocialLinkSize } from './SocialLink'
export { SourceBlock } from './SourceBlock'
export type { SourceBlockProps, SourceLang } from './SourceBlock'
export { StatBlock } from './StatBlock'
export type { StatBlockProps, StatBlockTone } from './StatBlock'
export { StrategyFlow } from './StrategyFlow'
export type {
  StrategyAllocation,
  StrategyFlowProps,
  StrategyFlowSource,
  StrategyFlowTone,
} from './StrategyFlow'
export { Tabs } from './Tabs'
export type { TabsListProps, TabsPanelProps, TabsProps, TabsTriggerProps } from './Tabs'
export { ThemeProvider } from './ThemeProvider'
export { useTheme } from './useTheme'
export { ThemeToggle } from './ThemeToggle'
export { TimeSeriesChart } from './TimeSeriesChart'
export type {
  TimeSeriesChartProps,
  TimeSeriesChartRange,
  TimeSeriesChartSize,
  TimeSeriesChartTone,
  TimeSeriesPoint,
  TimeSeriesSeries,
} from './TimeSeriesChart'
export { Toast } from './Toast'
export type { ToastProps, ToastTone } from './Toast'
export { ToastProvider } from './ToastProvider'
export { useToasts } from './useToasts'
export type { PushArgs, ToastContextValue, ToastState } from './useToasts'
export { TokenAmount } from './TokenAmount'
export type { TokenAmountProps, TokenAmountSize } from './TokenAmount'
export { Tooltip } from './Tooltip'
export type {
  TooltipElement,
  TooltipPlacement,
  TooltipProps,
  TooltipSize,
  TooltipTone,
} from './Tooltip'
export { UsdAmount } from './UsdAmount'
export type { UsdAmountProps, UsdAmountSize, UsdAmountTone } from './UsdAmount'
export { TokenChip } from './TokenChip'
export type { TokenChipProps } from './TokenChip'
export { TokenIcon } from './TokenIcon'
export type { TokenIconProps, TokenIconSize } from './TokenIcon'
export { VaultHeader } from './VaultHeader'
export type {
  VaultHeaderAccent,
  VaultHeaderProps,
  VaultHeaderStat,
  VaultHeaderStatTone,
} from './VaultHeader'
export { ViewToggle } from './ViewToggle'
export type { ViewToggleOption, ViewToggleProps, ViewToggleSize } from './ViewToggle'
export { VoteTallyBar } from './VoteTallyBar'
export type { VoteTallyBarProps, VoteTallyBarSize } from './VoteTallyBar'
export { QuorumMeter } from './QuorumMeter'
export type { QuorumMeterProps } from './QuorumMeter'
export { YieldSparkline } from './YieldSparkline'
export type {
  YieldSparklineProps,
  YieldSparklineSize,
  YieldSparklineTone,
} from './YieldSparkline'
