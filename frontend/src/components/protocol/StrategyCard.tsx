import { rewriteIpfsURI } from '../../lib/ipfs'
import { RiskTierBadge, type RiskTierBadgeTier } from './Status'

/**
 * Strategy descriptor extracted from a vault.v1 metadata payload. All
 * fields after `name` and `summary` are optional.
 */
export interface VaultStrategy {
  name: string
  summary: string
  riskTier?: string
  venues?: string[]
  documentationURI?: string
}

export interface StrategyCardProps {
  strategy: VaultStrategy
  /** Optional eyebrow above the strategy name. */
  label?: string
}

/**
 * Maps the `vault.v1` strategy.riskTier vocabulary
 * (`conservative | moderate | aggressive | agent`) to the existing
 * RiskTierBadge tone vocabulary (`success | warn | error | unknown`).
 * `agent` collapses to `warn` since agent vaults carry counterparty
 * exposure even when the strategy itself is structurally simple.
 */
function mapRiskTier(tier: string | undefined): RiskTierBadgeTier {
  switch (tier) {
    case 'conservative':
      return 'success'
    case 'moderate':
      return 'warn'
    case 'aggressive':
      return 'error'
    case 'agent':
      return 'warn'
    default:
      return 'unknown'
  }
}

/**
 * `StrategyCard` — surfaces what the vault does with productive capital.
 * Reads from the `strategy` block of the `vault.v1` metadata schema.
 * The summary should answer "where does the yield come from?" in 1–2
 * sentences; venues list the protocols the strategy interacts with.
 */
export function StrategyCard({ strategy, label = 'Strategy' }: StrategyCardProps) {
  const docsHref = strategy.documentationURI ? rewriteIpfsURI(strategy.documentationURI) : null
  const venues = strategy.venues?.filter(Boolean) ?? []
  const showRiskBadge = Boolean(strategy.riskTier)
  return (
    <article className="ds-card ds-strategy-card">
      <header className="ds-strategy-card-head">
        <div className="ds-stack ds-stack-1">
          <span className="ds-page-eyebrow">{label.toUpperCase()}</span>
          <h3 className="ds-strategy-card-title">{strategy.name}</h3>
        </div>
        {showRiskBadge && <RiskTierBadge tier={mapRiskTier(strategy.riskTier)} />}
      </header>
      <p className="ds-strategy-card-body">{strategy.summary}</p>
      {venues.length > 0 && (
        <div className="ds-strategy-card-venues">
          {venues.map((v) => (
            <span key={v} className="ds-badge ds-badge--muted">
              {v}
            </span>
          ))}
        </div>
      )}
      {docsHref && (
        <div className="ds-strategy-card-docs">
          <a href={docsHref} target="_blank" rel="noopener noreferrer">
            Strategy docs
            <span className="ds-sr-only"> for {strategy.name}</span>
            <span aria-hidden="true"> ↗</span>
          </a>
        </div>
      )}
    </article>
  )
}
