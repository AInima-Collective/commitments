import { type Address } from 'viem'

import { Card } from '../ui'
import { OperatorIdentity } from '../protocol'
import { formatDuration } from '../../lib/format'

interface CoverageBriefProps {
  /** Plain-language description of the peril (from the peril document). */
  description?: string
  /** The machine condition that triggers a payout (from the peril document). */
  trigger?: string
  /** Who arbitrates a loss claim. */
  arbiter: Address
  /** Challenge-window length (seconds) a proposed loss must survive. */
  challengeWindow: bigint
  /** Numeraire symbol the mutual is backed by / settled in. */
  symbol: string
  /** True when underwriters post mixed collateral (band-valued premium). */
  heterogeneous?: boolean
}

/**
 * CoverageBrief — the "what this covers" hero. In an insurance product the
 * covered event and its payout trigger ARE the contract, so they lead the page,
 * above price and capacity. Pairs the plain-language peril description with the
 * precise trigger condition and the claims-resolution path (arbiter + challenge
 * window), so a visitor can answer "what am I actually covered against, and how
 * does a claim pay out?" before reading any number.
 *
 * Presentational feature composition — the page resolves the peril document and
 * passes the strings in.
 */
export function CoverageBrief({
  description,
  trigger,
  arbiter,
  challengeWindow,
  symbol,
  heterogeneous = false,
}: CoverageBriefProps) {
  return (
    <Card className="ds-stack ds-stack-3" aria-label="What this covers">
      <div className="ds-stack ds-stack-1">
        <span className="ds-label">what this covers</span>
        <p className="ds-text-base" style={{ margin: 0 }}>
          {description ??
            'Shared-loss coverage pool. The full risk definition is set by the mutual’s arbiter.'}
        </p>
      </div>

      <div className="ds-grid-2">
        <div className="ds-stack ds-stack-1">
          <span className="ds-label">payout trigger</span>
          <span className="ds-text-sm">
            {trigger ?? 'The arbiter declares a loss when the covered event is observed.'}
          </span>
        </div>
        <div className="ds-stack ds-stack-1">
          <span className="ds-label">how a claim resolves</span>
          <span className="ds-text-sm ds-row ds-row-2" style={{ flexWrap: 'wrap' }}>
            arbitrated by <OperatorIdentity address={arbiter} size="sm" hideAvatar />
            <span className="ds-subtle">· {formatDuration(Number(challengeWindow))} challenge window</span>
          </span>
        </div>
      </div>

      <p className="ds-text-xs ds-subtle" style={{ margin: 0 }}>
        {heterogeneous
          ? 'Underwriters post mixed collateral; premium is weighted by a manipulation-resistant band valuation. Settled in the mutual’s numeraire.'
          : `Backed and settled in ${symbol}. Underwriters earn premium; cover buyers are paid out if the trigger fires.`}
      </p>
    </Card>
  )
}
