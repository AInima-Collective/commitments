export type RiskTier = 'success' | 'warn' | 'danger'

/**
 * Aggregate forfeiture risk, derived via {@link riskTier} from a max-penalty bps.
 * Composes with the badge tone family (success / warn / danger) and `'unrated'`
 * for the unknown case. Use as a hero-level vault summary; for per-row risk,
 * prefer {@link RiskRow} (dot + bps + text).
 */
export type RiskTierBadgeTier = RiskTier | 'unknown'

/**
 * Categorize a basis-points penalty into a tone tier:
 *   ≤ 25%  → success (low)
 *   ≤ 75%  → warn    (medium)
 *   > 75%  → danger  (high)
 *
 * Lives in `lib/` (not `components/protocol/`) because it is pure,
 * presentation-free logic consumed by both protocol components and the
 * `useVaultRiskMetrics` hook — and a hook must not import from a component.
 */
export function riskTier(maxPenaltyBps: number): RiskTier {
  if (maxPenaltyBps <= 2500) return 'success'
  if (maxPenaltyBps <= 7500) return 'warn'
  return 'danger'
}
