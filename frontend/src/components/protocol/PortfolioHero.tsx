import type { ReactNode } from 'react'
import { AllocationBar, Button, StatBlock, UsdAmount } from '../ui'

export interface PortfolioHeroProps {
  /** Display heading (e.g. "Portfolio"). */
  title?: ReactNode
  /** Optional eyebrow above the headline (e.g. "snapshot"). */
  eyebrow?: ReactNode
  /** Total portfolio value in USD (6-decimal bigint). `null` renders the
   *  explicit "PRICE UNAVAILABLE" state. */
  totalUsd: bigint | null
  /** Free portion of the position in USD. `null` if any underlying price is unavailable. */
  freeUsd: bigint | null
  /** Encumbered portion of the position in USD. */
  encumberedUsd: bigint | null
  /** Sum of claimable yield + underwriting premium in USD. */
  claimableUsd: bigint | null
  /** Sum of accrued mutual losses (markdown) in USD. */
  lossesUsd: bigint | null
  /** Suppresses the value rendering until ready. */
  isLoading?: boolean
  /** Optional pause notice slot — Dashboard renders a `<Notice/>` when deposits are paused. */
  notice?: ReactNode
  /**
   * Value-over-time chart slot, rendered between the headline and the stat
   * grid — the DeFi-standard order (chart up top, stats below). Keeping it a
   * slot keeps the hero presentational: the page owns data fetching, and the
   * chart's right edge stays anchored to the headline figure by construction.
   */
  chart?: ReactNode
  /** Right-aligned aside slot for a small chart (e.g. <YieldSparkline/>) under the action row. */
  aside?: ReactNode
  /** Footnote slot under the headline — used to flag fallback-source pricing. */
  priceNote?: ReactNode
  /** Primary CTA — typically a "Deposit" link. Optional. */
  primaryAction?: ReactNode
  /** Secondary CTA — typically "Claim all". Visible only when there is claimable yield. */
  claimAllAction?: {
    label: ReactNode
    onClick: () => void
    disabled?: boolean
    /** When provided, replaces label with progress text. */
    progress?: { current: number; total: number } | null
  }
}

/**
 * PortfolioHero — single USD-denominated portfolio overview that anchors the
 * dashboard.
 *
 * Presentational. Pages own price aggregation across vaults; the hero just
 * receives USD-shaped bigints (6 decimals, USDC-style) and renders via
 * `UsdAmount`. Any value passed as `null` renders the "PRICE UNAVAILABLE"
 * placeholder so partial-pricing states never look like real zero.
 */
export function PortfolioHero({
  title = 'Portfolio',
  eyebrow,
  totalUsd,
  freeUsd,
  encumberedUsd,
  claimableUsd,
  lossesUsd,
  isLoading,
  notice,
  chart,
  aside,
  priceNote,
  primaryAction,
  claimAllAction,
}: PortfolioHeroProps) {
  const claimLabel =
    claimAllAction?.progress != null
      ? `CLAIMING ${claimAllAction.progress.current} / ${claimAllAction.progress.total}…`
      : claimAllAction?.label

  // Portfolio-wide free/encumbered split — a single at-a-glance proportion bar
  // that complements the precise USD stat blocks below. Only rendered when both
  // halves are priced and the ledger holds something; partial-pricing or an
  // empty ledger falls back to the stat blocks alone.
  const showAllocation =
    freeUsd !== null && encumberedUsd !== null && freeUsd + encumberedUsd > 0n

  return (
    <section className="ds-card ds-stack ds-stack-4" aria-label="Portfolio summary">
      <header className="ds-row" style={{ justifyContent: 'space-between', alignItems: 'flex-start', gap: 'var(--space-4)', flexWrap: 'wrap' }}>
        <div className="ds-stack ds-stack-2" style={{ minWidth: 0 }}>
          {eyebrow && <span className="ds-page-eyebrow">{eyebrow}</span>}
          <span className="ds-text-xs ds-subtle">{title}</span>
          <div>
            <UsdAmount
              amount={totalUsd}
              size="display"
              tone={isLoading && totalUsd === null ? 'unavailable' : 'neutral'}
            />
          </div>
          {priceNote && <span className="ds-text-xs ds-subtle">{priceNote}</span>}
        </div>
        <div className="ds-stack ds-stack-2" style={{ alignItems: 'flex-end' }}>
          {(primaryAction || claimAllAction) && (
            <div className="ds-row ds-row-2" style={{ flexWrap: 'wrap' }}>
              {claimAllAction && (
                <Button
                  variant="default"
                  size="sm"
                  onClick={claimAllAction.onClick}
                  disabled={claimAllAction.disabled || claimAllAction.progress != null}
                >
                  {claimLabel}
                </Button>
              )}
              {primaryAction}
            </div>
          )}
          {aside && <div>{aside}</div>}
        </div>
      </header>

      {notice}

      {chart}

      {showAllocation && (
        <AllocationBar
          total={freeUsd! + encumberedUsd!}
          decimals={6}
          symbol="USD"
          compact
          segments={[
            { label: 'free', value: freeUsd!, tone: 'success' },
            { label: 'encumbered', value: encumberedUsd!, tone: 'warn' },
          ]}
        />
      )}

      <div className="ds-stat-grid" aria-label="Portfolio breakdown">
        <StatBlock
          label="FREE"
          value={<UsdAmount amount={freeUsd} compact size="inline" />}
          loading={isLoading && freeUsd === null}
        />
        <StatBlock
          label="ENCUMBERED"
          value={<UsdAmount amount={encumberedUsd} compact size="inline" />}
          loading={isLoading && encumberedUsd === null}
        />
        <StatBlock
          label="CLAIMABLE YIELD"
          tone={claimableUsd && claimableUsd > 0n ? 'positive' : 'neutral'}
          value={<UsdAmount amount={claimableUsd} compact size="inline" />}
          loading={isLoading && claimableUsd === null}
        />
        <StatBlock
          label="LOSSES"
          tone={lossesUsd && lossesUsd > 0n ? 'negative' : 'neutral'}
          value={<UsdAmount amount={lossesUsd} compact size="inline" />}
          loading={isLoading && lossesUsd === null}
        />
      </div>
    </section>
  )
}
