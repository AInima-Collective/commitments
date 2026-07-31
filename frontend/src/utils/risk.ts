export type RiskTier = 'success' | 'warn' | 'error'

/**
 * Categorize a basis-points penalty into a tone tier:
 *   ≤ 25%  → success (low)
 *   ≤ 75%  → warn    (medium)
 *   > 75%  → error   (high)
 *
 * Lives in `utils/` (not `components/protocol/`) because it is pure,
 * presentation-free logic consumed by both protocol components and the
 * `useVaultRiskMetrics` hook — and a hook must not import from a component.
 */
export function riskTier(maxPenaltyBps: number): RiskTier {
  if (maxPenaltyBps <= 2500) return 'success'
  if (maxPenaltyBps <= 7500) return 'warn'
  return 'error'
}
