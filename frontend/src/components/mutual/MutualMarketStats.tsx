import { CapacityMeter, StatBlock, TokenAmount } from '../ui'
import { SharedLossGauge } from '../protocol'
import {
  LAMBDA_SCALE,
  formatLambdaPercent,
  formatPercent,
} from '../../lib/format'

interface MutualMarketStatsProps {
  /** Annualized premium yield to underwriters (bps), if a stream is live. */
  premiumAprBps?: number
  isStreaming: boolean
  /** Loss-adjusted live cover from the indexer, when available. */
  liveCapacity?: bigint
  liveCapacityAvailable: boolean
  /** Sum of posted units — the nominal subscribed amount (chain-authoritative). */
  subscribed: bigint
  /** Registry target capacity; 0n when uncapped. */
  target: bigint
  /** Underwriter count. */
  memberCount: number
  /** Cumulative loss Λ (1e18-scaled). */
  cumulativeLoss: bigint
  /** The viewer's own Λ snapshot, for the gauge tick. */
  memberSnapshot?: bigint
  decimals: number
  symbol: string
}

/**
 * MutualMarketStats — the single consolidated "market & risk at a glance" block.
 * Folds the former Coverage / Subscription / Shared-loss sections into one so no
 * figure is shown twice: premium APR (earn side), available cover (loss-adjusted,
 * with a clearly-labeled nominal fallback), underwriter count, and cumulative
 * loss Λ — then the subscribed/target meter and the Λ gauge as the visual
 * read-outs. Reward (APR) and risk (Λ) sit in the same row by design.
 */
export function MutualMarketStats({
  premiumAprBps,
  isStreaming,
  liveCapacity,
  liveCapacityAvailable,
  subscribed,
  target,
  memberCount,
  cumulativeLoss,
  memberSnapshot,
  decimals,
  symbol,
}: MutualMarketStatsProps) {
  const showLiveCover = liveCapacityAvailable && liveCapacity !== undefined
  const lossActive = cumulativeLoss > 0n

  return (
    <section className="ds-stack ds-stack-3" aria-label="Market and risk">
      <div className="ds-stat-grid">
        <StatBlock
          label="earn · premium APR"
          tone={isStreaming ? 'success' : 'neutral'}
          value={premiumAprBps !== undefined ? formatPercent(premiumAprBps) : '—'}
          meta={isStreaming ? 'paid to underwriters' : 'no active cover demand'}
        />
        <StatBlock
          label={showLiveCover ? 'cover available' : 'cover (nominal)'}
          tone={showLiveCover ? 'accent' : 'neutral'}
          value={
            showLiveCover ? (
              <TokenAmount amount={liveCapacity} decimals={decimals} symbol={symbol} compact />
            ) : (
              <TokenAmount amount={subscribed} decimals={decimals} symbol={symbol} compact />
            )
          }
          meta={showLiveCover ? 'after accrued loss share' : 'nominal — loss not yet applied'}
        />
        <StatBlock label="underwriters" value={memberCount > 0 ? String(memberCount) : '—'} meta="backing this risk" />
        <StatBlock
          label="shared loss"
          tone={lossActive ? 'danger' : 'neutral'}
          value={formatLambdaPercent(cumulativeLoss)}
          meta={lossActive ? 'of posted capital marked down' : 'no loss to date'}
        />
      </div>

      {target > 0n && (
        <CapacityMeter
          label="subscribed / target capacity"
          filled={subscribed}
          cap={target}
          decimals={decimals}
          symbol={symbol}
        />
      )}

      {/* The gauge is most informative once a loss has accrued; at Λ=0 the meter
          above already conveys capacity, so we only surface it when meaningful. */}
      {(lossActive || cumulativeLoss >= LAMBDA_SCALE / 100n) && (
        <SharedLossGauge cumulativeLoss={cumulativeLoss} memberSnapshot={memberSnapshot} />
      )}
    </section>
  )
}
