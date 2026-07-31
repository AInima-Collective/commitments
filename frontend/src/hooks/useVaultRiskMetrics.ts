import { useMemo } from 'react'
import { type Address } from 'viem'
import { useCommitments } from './useCommitments'
import { useNowSeconds } from './useNow'
import { riskTier } from '../utils/risk'
import type { RiskTierBadgeTier } from '../components/protocol'

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

interface UseVaultRiskMetricsParams {
  managerAddress: Address | undefined
  viewAddress: Address | undefined
}

interface UseVaultRiskMetricsReturn {
  metrics: VaultRiskMetrics
  isLoading: boolean
  refetch: () => void
}

/**
 * Aggregate the viewer's commitment exposure into the metrics surfaced by the
 * vault hero risk badge and the risk-parameters card. Single source of truth
 * so the badge and the card never diverge.
 */
export function useVaultRiskMetrics({
  managerAddress,
  viewAddress,
}: UseVaultRiskMetricsParams): UseVaultRiskMetricsReturn {
  const nowSec = useNowSeconds()
  const { commitments, isLoading, refetch } = useCommitments({
    managerAddress,
    committerAddress: viewAddress,
  })

  const metrics = useMemo<VaultRiskMetrics>(() => {
    const active = commitments.filter((c) => c.status === 'ACTIVE' || c.status === 'FORFEIT_PENDING')
    if (active.length === 0) {
      return { activeCount: 0, maxPenaltyBps: 0, oldestSec: 0, tier: 'unknown' }
    }
    const maxPenaltyBps = Math.max(...active.map((c) => c.maxPenaltyBps))
    const oldestCreatedAt = active.reduce(
      (oldest, c) => (c.createdAt < oldest ? c.createdAt : oldest),
      active[0].createdAt,
    )
    const oldestSec = Math.max(0, Number(nowSec) - Number(oldestCreatedAt))
    return {
      activeCount: active.length,
      maxPenaltyBps,
      oldestSec,
      tier: riskTier(maxPenaltyBps) as RiskTierBadgeTier,
    }
  }, [commitments, nowSec])

  return { metrics, isLoading, refetch }
}
