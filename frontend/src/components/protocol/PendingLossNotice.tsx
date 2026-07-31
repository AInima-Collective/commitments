import { Notice, TokenAmount } from '../ui'
import { Countdown } from './Countdown'

export type PendingLossNoticeSize = 'sm' | 'md' | 'lg'

export interface PendingLossNoticeProps {
  /** owedUnits = forfeitableUnits × (Λ − snapshot) / 1e18 — the member's
   * unsettled loss share, denominated in numeraire units. */
  owedUnits: bigint
  /** Numeraire token decimals. */
  decimals: number
  /** Numeraire token symbol. */
  symbol: string
  /** True once the member has requested exit (deallocation window running). */
  exitRequested?: boolean
  /** Elapsed seconds into the deallocation / capital-freeze window. */
  slashableElapsed?: number
  /** Total deallocation-window seconds — when set with `slashableElapsed`,
   * a {@link Countdown} renders the capital-freeze remaining. */
  slashableWindow?: number
  /** Tone override. Defaults to `warn` when owed > 0, else `info`. */
  tone?: 'info' | 'warn' | 'danger'
  size?: PendingLossNoticeSize
}

/**
 * PendingLossNotice — surfaces a mutual member's owed loss share and the fact
 * that exit is gated until the loss share settles and the deallocation window
 * elapses.
 *
 * Protocol-layer composition over {@link Notice} + {@link TokenAmount} +
 * {@link Countdown}. Time-agnostic: the caller passes `slashableElapsed` /
 * `slashableWindow` (computed from `useNowSeconds`) so this component never
 * reads wall-clock time during render.
 */
export function PendingLossNotice({
  owedUnits,
  decimals,
  symbol,
  exitRequested = false,
  slashableElapsed,
  slashableWindow,
  tone,
  size = 'sm',
}: PendingLossNoticeProps) {
  const owes = owedUnits > 0n
  const resolvedTone = tone ?? (owes ? 'warn' : 'info')
  const showCountdown =
    exitRequested && slashableElapsed !== undefined && slashableWindow !== undefined && slashableWindow > 0

  return (
    <Notice
      tone={resolvedTone}
      size={size}
      title={owes ? 'Unsettled loss share' : 'No loss share owed'}
    >
      <div className="ds-stack ds-stack-2">
        <span>
          {owes ? (
            <>
              You owe{' '}
              <TokenAmount amount={owedUnits} decimals={decimals} symbol={symbol} size="inline" />{' '}
              of shared loss to the beneficiary, settled lazily from your posted stake.
            </>
          ) : (
            <>Your snapshot is current — nothing is owed at the pool's current loss level.</>
          )}
        </span>
        <span className="ds-text-xs ds-subtle">
          {exitRequested
            ? 'Exit requested — your capital stays slashable until the deallocation window elapses and any owed loss share settles.'
            : 'Releasing capital is gated: any owed loss share must settle and the deallocation window must elapse first.'}
        </span>
        {showCountdown && (
          <Countdown
            label="capital freeze"
            elapsed={slashableElapsed}
            total={slashableWindow}
            tone="warn"
          />
        )}
      </div>
    </Notice>
  )
}
