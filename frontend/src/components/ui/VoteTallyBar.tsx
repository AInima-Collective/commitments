import { AllocationBar } from './AllocationBar'

export type VoteTallyBarSize = 'sm' | 'md' | 'lg'

export interface VoteTallyBarProps {
  /** "For" votes weight (raw, in voting-power units). */
  forVotes: bigint
  /** "Against" votes weight. */
  againstVotes: bigint
  /** "Abstain" votes weight. */
  abstainVotes: bigint
  /** Voting-power decimals (matches the underlying source — e.g. 18 for
   *  TokenWeighting weighted to 1e18 units). Defaults to 18. */
  decimals?: number
  /** Symbol shown in the legend. Defaults to "vp" (voting power). */
  symbol?: string
  /** Compact the legend amounts (e.g. 6.45B) for large/raw-unit values. */
  compact?: boolean
  size?: VoteTallyBarSize
}

/**
 * VoteTallyBar — thin specialization of AllocationBar that renders the
 * three OZ Governor counting-simple buckets (for, against, abstain) with
 * the protocol's standard tone vocabulary:
 *
 *   for     → success (green)
 *   against → error   (red)
 *   abstain → muted   (neutral)
 *
 * The underlying AllocationBar handles segment widths and percentage labels;
 * this component owns nothing more than the tone mapping. Use it on the
 * proposal-detail page (large tally) and on row hover-cards (small tally).
 */
export function VoteTallyBar({
  forVotes,
  againstVotes,
  abstainVotes,
  decimals = 18,
  symbol = 'vp',
  compact = false,
  size: _size = 'md',
}: VoteTallyBarProps) {
  const total = forVotes + againstVotes + abstainVotes
  if (total === 0n) {
    // Empty state — render a baseline track so the affordance exists, plus
    // a muted legend explaining why no segments are visible. Otherwise
    // AllocationBar collapses to invisible.
    return (
      <div className="ds-allocation-bar">
        <div
          className="ds-allocation-bar-track"
          role="img"
          aria-label="No votes yet"
          style={{ background: 'var(--surface-2)' }}
        />
        <div className="ds-allocation-bar-legend">
          <span className="ds-subtle">No votes cast yet.</span>
        </div>
      </div>
    )
  }
  return (
    <AllocationBar
      total={total}
      decimals={decimals}
      symbol={symbol}
      compact={compact}
      segments={[
        { label: 'for', value: forVotes, tone: 'success' },
        { label: 'against', value: againstVotes, tone: 'error' },
        { label: 'abstain', value: abstainVotes, tone: 'muted' },
      ]}
    />
  )
}
