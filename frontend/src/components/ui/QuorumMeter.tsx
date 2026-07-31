import { CapacityMeter, type CapacityMeterTone } from './CapacityMeter'

export interface QuorumMeterProps {
  /** Voting power that counts toward quorum (typically forVotes + abstainVotes). */
  progress: bigint
  /** Quorum target in the same units as progress. */
  target: bigint
  /** Voting-power decimals (defaults to 18). */
  decimals?: number
  /** Symbol shown in the legend (defaults to "vp"). */
  symbol?: string
  /** Optional tone override; default tone is computed from ratio. */
  tone?: CapacityMeterTone
  size?: 'sm' | 'md' | 'lg'
}

/**
 * QuorumMeter — proposal quorum progress indicator. Wraps CapacityMeter so
 * the visual treatment matches the rest of the design system (segmented bar,
 * percent label, foot legend). Once `progress >= target`, the bar fills and
 * the tone shifts to success.
 *
 * Distinct from VoteTallyBar — this one shows participation toward quorum,
 * not the for / against split.
 */
export function QuorumMeter({
  progress,
  target,
  decimals = 18,
  symbol = 'vp',
  tone,
  size = 'md',
}: QuorumMeterProps) {
  const reached = progress >= target && target > 0n
  const resolvedTone: CapacityMeterTone = tone ?? (reached ? 'success' : 'info')
  return (
    <CapacityMeter
      filled={progress}
      cap={target}
      decimals={decimals}
      symbol={symbol}
      label="quorum"
      tone={resolvedTone}
      size={size}
    />
  )
}
