import { type ReactNode } from 'react'

import { Notice, StatBlock, TokenAmount } from '../ui'
import { FrozenCapacityDisclosure } from './FrozenCapacityDisclosure'

interface JoinConsentGateProps {
  /** Units the member is about to post (creditedValue / forfeitableUnits). */
  creditedValue: bigint
  decimals: number
  symbol: string
  /** Mutual deallocation window (seconds). */
  deallocationWindow: bigint
  /** Mutual challenge window (seconds). */
  challengeWindow: bigint
  /** A bonded loss is under challenge — capacity is frozen, joins paused. */
  frozen?: boolean
  /** Controlled consent flag. */
  consented?: boolean
  onConsentChange?: (next: boolean) => void
  /** Action slot — the actual join button(s). */
  actions?: ReactNode
}

/**
 * JoinConsentGate — the informed-consent surface a prospective underwriter must
 * read before joining a mutual. It states the worst-case penalty in absolute
 * units, the shared-loss formula, the capital-freeze / deallocation-window
 * mechanics, and the non-retroactivity reassurance, then gates the join action
 * behind an explicit acknowledgement.
 *
 * Feature-shaped composition of ui + mutual primitives.
 */
export function JoinConsentGate({
  creditedValue,
  decimals,
  symbol,
  deallocationWindow,
  challengeWindow,
  frozen = false,
  consented = false,
  onConsentChange,
  actions,
}: JoinConsentGateProps) {
  return (
    <div className="ds-stack ds-stack-4">
      <div className="ds-stat-grid" data-cols="2">
        <StatBlock
          label="you post"
          value={<TokenAmount amount={creditedValue} decimals={decimals} symbol={symbol} compact />}
        />
        <StatBlock
          label="worst-case loss"
          value={<TokenAmount amount={creditedValue} decimals={decimals} symbol={symbol} compact />}
          tone="negative"
          meta="if the pool takes a total loss"
        />
      </div>

      <Notice tone="warn" size="sm" title="How shared loss is applied">
        <div className="ds-stack ds-stack-2">
          <span>
            On a loss, the pool's cumulative loss percentage rises. You owe{' '}
            <code>amount&nbsp;posted × (loss&nbsp;%&nbsp;now − loss&nbsp;%&nbsp;when&nbsp;you&nbsp;joined)</code>,
            settled to the beneficiary when you exit or top up. Your maximum exposure is capped at
            exactly the amount you post, never more.
          </span>
          <span>
            Liability is <strong>several, not joint</strong> — you owe only your own pro-rata share
            of a loss, never another member's. No member can be charged for a co-member's default.
          </span>
        </div>
      </Notice>

      <Notice tone="success" size="sm" title="Losses are never retroactive">
        Your starting point is fixed at the pool's loss level when you join. Any loss that
        accumulated before then is not charged to you — you only share losses that accrue while
        you're a member.
      </Notice>

      <Notice tone="info" size="sm" title="Nominal vs. live coverage">
        The mutual's <em>subscribed (nominal)</em> capacity is the sum of every member's posted
        units. The <em>loss-adjusted coverage</em> shown alongside the gauge subtracts the accrued
        loss share — it is the cover that actually remains. After any loss the nominal figure
        overstates available cover; always read the loss-adjusted number.
      </Notice>

      <FrozenCapacityDisclosure
        deallocationWindow={deallocationWindow}
        challengeWindow={challengeWindow}
        frozen={frozen}
      />

      <label className="ds-row ds-row-2 ds-text-sm">
        <input
          type="checkbox"
          checked={consented}
          onChange={(e) => onConsentChange?.(e.target.checked)}
        />
        <span>
          I understand my capital is frozen and slashable up to{' '}
          <TokenAmount amount={creditedValue} decimals={decimals} symbol={symbol} size="inline" /> of
          shared loss.
        </span>
      </label>

      {actions}
    </div>
  )
}
