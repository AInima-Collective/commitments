/**
 * Vault APY headline.
 *
 * Derives the realized rolling-window APY from the indexer's periodic-snapshot
 * pipeline (`/vaults/:vault/periodic?latest=1`) — the same rows the
 * `VaultApyChart` plots. We read the newest snapshot, preferring the 7-day
 * window (most responsive) and falling back to 30-day.
 *
 * Until enough snapshot history accumulates (~3.5 days, half the 7d window),
 * both windows are null and `netBps` is `null` — callers MUST branch on that
 * and render an honest "accruing" state. We never fabricate a placeholder
 * number: only realized indexer data is ever surfaced as an APY.
 */
import { type Address } from 'viem'

import { useVaultPeriodicHistory } from './useVaultPeriodicHistory'

export interface VaultApyBreakdown {
  /**
   * Headline rolling APY in basis points (7d window when available, else 30d),
   * or `null` when no realized rolling-window APY exists yet.
   */
  netBps: number | null
  /** Which rolling window the headline reflects, or null while accruing. */
  window: '7d' | '30d' | null
  /** The other rolling window's APY in bps, surfaced as secondary context. */
  secondaryBps: number | null
  /** Label for `secondaryBps` (e.g. '30d'), or null when unavailable. */
  secondaryLabel: string | null
  /** Free-text footnote — describes the window or the accruing state. */
  footnote: string
}

export function useVaultApy(vaultAddress?: Address): VaultApyBreakdown {
  // One row: the newest snapshot carries both rolling windows.
  const { data } = useVaultPeriodicHistory({ vaultAddress, latest: true })
  const latest7d = data?.rows[0]?.apy7d ?? null
  const latest30d = data?.rows[0]?.apy30d ?? null

  if (latest7d !== null) {
    return {
      netBps: latest7d,
      window: '7d',
      secondaryBps: latest30d,
      secondaryLabel: latest30d !== null ? '30d' : null,
      footnote: '7-day rolling realized APY from indexer snapshots.',
    }
  }
  if (latest30d !== null) {
    return {
      netBps: latest30d,
      window: '30d',
      secondaryBps: null,
      secondaryLabel: null,
      footnote: '30-day rolling realized APY from indexer snapshots.',
    }
  }
  return {
    netBps: null,
    window: null,
    secondaryBps: null,
    secondaryLabel: null,
    footnote: 'APY accrues after the first snapshot interval with share-price movement.',
  }
}
