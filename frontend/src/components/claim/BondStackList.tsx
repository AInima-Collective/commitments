import { type Address } from 'viem'

import { OperatorIdentity } from '../protocol'
import { TokenAmount } from '../ui'
import type { BondEntry } from '../../hooks/useOptimisticClaim'
import { formatBps } from '../../utils/commitments'

interface BondStackListProps {
  stack: BondEntry[]
  bondSymbol?: string
  bondDecimals?: number
  /** Highlight this asserter (the connected wallet, typically). */
  viewerAddress?: Address
}

/**
 * Bond stack — one row per assertion, oldest at the top, the active
 * (top-of-stack) entry highlighted. Doubling escalation makes the bond
 * column meaningful at a glance: each entry should be ≥ 2× the entry
 * below it.
 */
export function BondStackList({
  stack,
  bondSymbol,
  bondDecimals,
  viewerAddress,
}: BondStackListProps) {
  if (stack.length === 0) {
    return <p className="ds-text-sm ds-subtle">No bonds posted yet.</p>
  }
  const decimals = bondDecimals ?? 18
  const lower = viewerAddress?.toLowerCase()

  return (
    <ol className="ds-stack ds-stack-2" style={{ listStyle: 'none', padding: 0, margin: 0 }}>
      {stack.map((entry, idx) => {
        const isTop = idx === stack.length - 1
        const isViewer = lower !== undefined && entry.asserter.toLowerCase() === lower
        const tone = isTop ? 'var(--accent)' : 'var(--text-subtle)'
        return (
          <li
            key={`${entry.asserter}-${idx}`}
            aria-current={isTop ? 'true' : undefined}
            className="ds-card"
            style={{
              borderColor: isTop ? 'var(--accent)' : 'var(--border)',
              padding: 'var(--space-3)',
            }}
          >
            <div
              className="ds-row ds-row-3"
              style={{ alignItems: 'center', justifyContent: 'space-between' }}
            >
              <div className="ds-row ds-row-2" style={{ alignItems: 'center' }}>
                <span className="ds-text-xs ds-mono-num ds-subtle" style={{ color: tone }}>
                  [{idx + 1}]
                </span>
                <OperatorIdentity address={entry.asserter} size="sm" />
                {isViewer && (
                  <span
                    className="ds-text-xs"
                    style={{ color: 'var(--accent)', textTransform: 'uppercase' }}
                  >
                    you
                  </span>
                )}
              </div>
              <div className="ds-row ds-row-3" style={{ alignItems: 'baseline' }}>
                <span
                  className="ds-text-sm ds-mono-num"
                  title={`Asserted payout: ${formatBps(entry.amountBps)} of commitment.maxPenaltyBps`}
                >
                  {formatBps(entry.amountBps)}
                </span>
                <span className="ds-text-sm ds-mono-num">
                  <TokenAmount
                    amount={entry.bond}
                    decimals={decimals}
                    symbol={bondSymbol ?? ''}
                    size="inline"
                  />
                </span>
              </div>
            </div>
            {isTop && (
              <div className="ds-text-xs ds-subtle" style={{ marginTop: 'var(--space-1)' /* layout only */ }}>
                Top of stack — wins by exhaustion if no one bonds ≥ 2× this within the answer window.
              </div>
            )}
          </li>
        )
      })}
    </ol>
  )
}
