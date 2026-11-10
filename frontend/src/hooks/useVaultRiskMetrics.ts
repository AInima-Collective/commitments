import { useMemo } from 'react'
import { useNowSeconds } from './useNow'
import { type UnifiedRow } from './useUnifiedRows'
import { riskTier, type RiskTierBadgeTier } from '../lib/risk'

export interface VaultRiskMetrics {
  /** Active + forfeit-pending commitments only. */
  activeCount: number
  /** max(maxPenaltyBps) across active commitments; 0 when none. */
  maxPenaltyBps: number
  /** Seconds since the oldest active commitment was created; 0 when none. */
  oldestSec: number
  /** Tier derived from maxPenaltyBps via {@link riskTier}; `'unknown'` when no actives. */
  tier: RiskTierBadgeTier
}

/**
 * Aggregate the viewer's commitment exposure into the metrics surfaced by the
 * vault hero risk badge and the risk-parameters card. Pass the rows the page
 * already holds, scoped to its vault; only rows the viewer committed count.
 */
export function useVaultRiskMetrics(rows: readonly UnifiedRow[]): VaultRiskMetrics {
  const nowSec = useNowSeconds()
  return useMemo<VaultRiskMetrics>(() => {
    const active = rows.flatMap((r) =>
      r.kind === 'commitment' &&
      r.role === 'committer' &&
      (r.status === 'ACTIVE' || r.status === 'FORFEIT_PENDING')
        ? [r]
        : [],
    )
    if (active.length === 0) {
      return { activeCount: 0, maxPenaltyBps: 0, oldestSec: 0, tier: 'unknown' }
    }
    const maxPenaltyBps = Math.max(...active.map((r) => r.maxPenaltyBps))
    // Rows that predate the createdAt column don't count toward the age.
    const created = active.flatMap((r) => (r.commitment.createdAt !== undefined ? [r.commitment.createdAt] : []))
    const oldestCreatedAt = created.reduce((oldest, t) => (t < oldest ? t : oldest), nowSec)
    return {
      activeCount: active.length,
      maxPenaltyBps,
      oldestSec: Math.max(0, Number(nowSec - oldestCreatedAt)),
      tier: riskTier(maxPenaltyBps) as RiskTierBadgeTier,
    }
  }, [rows, nowSec])
}
