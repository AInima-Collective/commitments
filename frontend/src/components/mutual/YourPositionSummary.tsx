import { Button, Card, StatBlock, TokenAmount } from '../ui'
import { formatDuration, formatTokenAmount } from '../../lib/format'

interface YourPositionSummaryProps {
  /** True when the viewer underwrites this mutual (has ≥1 member commitment). */
  underwriting: boolean
  /** Aggregate live residual the viewer has posted as an underwriter. */
  posted: bigint
  /** Aggregate claimable premium across the viewer's memberships. */
  claimablePremium: bigint
  /** Aggregate loss share still owed against an executed loss. */
  owed: bigint
  /** Aggregate active cover the viewer holds as a policyholder, if any. */
  coverHeld: { notional: bigint; expiry: bigint } | undefined
  /** Unix seconds for the cover-expiry countdown (ticking). */
  now: number
  decimals: number
  symbol: string
  /** Opens the manage-position drawer (claim / settle / exit). */
  onManage: () => void
}

/**
 * YourPositionSummary — the always-visible read-out of the viewer's own
 * relationship to a mutual, so "am I underwriting, do I hold cover, both, or
 * neither" is never ambiguous. Summary only: the actual actions (claim premium,
 * settle loss share, exit/release) live behind a single "Manage position" CTA that
 * opens a focused drawer, keeping this band scannable. Rendered only when the
 * viewer actually has a position; newcomers see the action cards instead.
 */
export function YourPositionSummary({
  underwriting,
  posted,
  claimablePremium,
  owed,
  coverHeld,
  now,
  decimals,
  symbol,
  onManage,
}: YourPositionSummaryProps) {
  const holdsCover = coverHeld !== undefined
  const coverRemaining = coverHeld ? coverHeld.expiry - BigInt(now) : 0n

  return (
    <section className="ds-stack ds-stack-2" aria-label="Your position">
      <h3 className="ds-section-eyebrow">Your position</h3>
      <Card className="ds-stack ds-stack-3">
        <div className="ds-row" style={{ justifyContent: 'space-between', alignItems: 'center', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
          <span className="ds-row ds-row-2" style={{ flexWrap: 'wrap' }}>
            {underwriting && <span className="ds-badge ds-badge--success">underwriting</span>}
            {holdsCover && <span className="ds-badge ds-badge--accent">covered</span>}
          </span>
          <Button size="sm" onClick={onManage}>
            Manage position →
          </Button>
        </div>

        <div className="ds-stat-grid">
          {underwriting && (
            <StatBlock
              label="you posted"
              value={
                <span title={formatTokenAmount(posted, decimals).full}>
                  <TokenAmount amount={posted} decimals={decimals} symbol={symbol} compact />
                </span>
              }
              meta="backing shared losses"
            />
          )}
          {underwriting && (
            <StatBlock
              label="claimable premium"
              tone={claimablePremium > 0n ? 'positive' : 'neutral'}
              value={
                <span title={formatTokenAmount(claimablePremium, decimals).full}>
                  <TokenAmount amount={claimablePremium} decimals={decimals} symbol={symbol} compact />
                </span>
              }
              meta={claimablePremium > 0n ? 'claim it in “manage”' : 'earned premium'}
            />
          )}
          {owed > 0n && (
            <StatBlock
              label="owed loss share"
              tone="negative"
              value={
                <span title={formatTokenAmount(owed, decimals).full}>
                  <TokenAmount amount={owed} decimals={decimals} symbol={symbol} compact />
                </span>
              }
              meta="settle in “manage”"
            />
          )}
          {holdsCover && coverHeld && (
            <StatBlock
              label="cover held"
              tone="accent"
              value={
                <span title={formatTokenAmount(coverHeld.notional, decimals).full}>
                  <TokenAmount amount={coverHeld.notional} decimals={decimals} symbol={symbol} compact />
                </span>
              }
              meta={coverRemaining > 0n ? `expires in ${formatDuration(Number(coverRemaining))}` : 'expired'}
            />
          )}
        </div>
      </Card>
    </section>
  )
}
