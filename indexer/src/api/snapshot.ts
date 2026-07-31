import { sql } from 'ponder'
import { db } from 'ponder:api'
import schema from 'ponder:schema'
import type { Hex } from 'viem'

import { commitmentsVaultAbi } from '../abis'
import {
  ensureOffchainSchema,
  readOldestSinceCutoff,
  upsertSnapshot,
} from './offchainDb'
import {
  APY_30D_SECONDS,
  APY_7D_SECONDS,
  SNAPSHOT_INTERVAL_SECONDS,
  type VaultPeriodicSnapshotRow,
} from '../../offchain.schema'
import { annualizedBps, resolveNowSeconds, type PublicClientLike } from './snapshotMath'

interface AggregatedState {
  totalForfeitable: bigint
  totalEncumberedShares: bigint
  activeCommitmentCount: number
  forfeitPendingCount: number
}

async function readAggregates(): Promise<AggregatedState> {
  // Status histogram + forfeitable sum across active+unbonding+forfeitPending
  // commitments. The commitment table isn't vault-keyed today; aggregate is
  // protocol-wide. When commitments gain a vault column, filter here.
  const statusRows = await db
    .select({
      status: schema.commitment.status,
      count: sql<string>`COUNT(*)::text`,
      forfeitableSum: sql<string>`COALESCE(FLOOR(SUM(${schema.commitment.amount} * ${schema.commitment.maxPenaltyBps}) / 10000), 0)::text`,
    })
    .from(schema.commitment)
    .groupBy(schema.commitment.status)

  let totalForfeitable = 0n
  let activeCount = 0
  let forfeitPendingCount = 0
  for (const row of statusRows) {
    if (
      row.status === 'active' ||
      row.status === 'unbonding' ||
      row.status === 'forfeitPending'
    ) {
      totalForfeitable += BigInt(row.forfeitableSum)
    }
    if (row.status === 'active') activeCount = Number(row.count)
    if (row.status === 'forfeitPending') forfeitPendingCount = Number(row.count)
  }

  // Protocol-wide encumbered total from the manager ledger (token units). v2 has
  // no withdrawal queue, so there are no queued shares/assets to sum.
  const [{ total }] = await db
    .select({
      total: sql<string>`COALESCE(SUM(${schema.ledgerPosition.encumbered}), 0)::text`,
    })
    .from(schema.ledgerPosition)

  return {
    totalForfeitable,
    totalEncumberedShares: BigInt(total),
    activeCommitmentCount: activeCount,
    forfeitPendingCount,
  }
}

interface RunOptions {
  /**
   * The vault to snapshot. v2 deploys one vault per backing asset (USDC, WETH,
   * …) via VaultFactory, so the caller must say which one. `takeAllSnapshots`
   * enumerates the indexed `vault` table and fans out to `takeSnapshot` per
   * vault.
   */
  vault: Hex
  /**
   * Override the "now" anchor. When omitted, "now" defaults to the on-chain
   * block timestamp (see `takeSnapshot`) — the same clock the share price lives
   * on. Set this to pin the clock from a test or a manual trigger.
   */
  nowSeconds?: bigint
  publicClient: PublicClientLike
  chainId: number
}

export interface SnapshotResult {
  vault: Hex
  status: 'created' | 'exists' | 'error'
  message: string
  timestamp: bigint
  data?: VaultPeriodicSnapshotRow
}

/**
 * Take a snapshot for the canonical vault. Idempotent on the 5-minute bucket:
 * a second call within the same bucket no-ops via PRIMARY KEY conflict.
 *
 * "Now" defaults to the on-chain block timestamp (`resolveNowSeconds`), NOT the
 * wall clock. The share price is read from the same chain, so the elapsed-time
 * window and the price movement must share one clock — otherwise an anvil
 * `evm_increaseTime` warp moves the price but leaves wall-clock "now" behind and
 * APY collapses to ~0. Reading block time keeps both on the chain clock so a
 * time-warp produces real, non-zero APY. Pin the clock via `opts.nowSeconds`.
 */
export async function takeSnapshot(opts: RunOptions): Promise<SnapshotResult> {
  await ensureOffchainSchema()

  const vault = opts.vault

  const now = await resolveNowSeconds(opts)
  const bucket = (now / BigInt(SNAPSHOT_INTERVAL_SECONDS)) * BigInt(SNAPSHOT_INTERVAL_SECONDS)

  try {
    const [totalAssets, totalSupply] = await Promise.all([
      opts.publicClient.readContract({
        address: vault,
        abi: commitmentsVaultAbi,
        functionName: 'totalAssets',
      }),
      opts.publicClient.readContract({
        address: vault,
        abi: commitmentsVaultAbi,
        functionName: 'totalSupply',
      }),
    ])

    const sharePrice =
      totalSupply > 0n ? (totalAssets * 10n ** 18n) / totalSupply : 10n ** 18n

    const aggregates = await readAggregates()

    const [refForApy7d, refForApy30d] = await Promise.all([
      readOldestSinceCutoff(vault, bucket - BigInt(APY_7D_SECONDS)),
      readOldestSinceCutoff(vault, bucket - BigInt(APY_30D_SECONDS)),
    ])

    const apy7d = refForApy7d
      ? annualizedBps(
          sharePrice,
          refForApy7d.sharePrice,
          bucket - refForApy7d.timestamp,
          BigInt(APY_7D_SECONDS),
        )
      : null
    const apy30d = refForApy30d
      ? annualizedBps(
          sharePrice,
          refForApy30d.sharePrice,
          bucket - refForApy30d.timestamp,
          BigInt(APY_30D_SECONDS),
        )
      : null

    const row: VaultPeriodicSnapshotRow = {
      vault: vault.toLowerCase(),
      timestamp: bucket,
      sharePrice,
      totalAssets,
      totalSupply,
      apy7d,
      apy30d,
      ...aggregates,
    }

    const inserted = await upsertSnapshot(row)
    return {
      vault,
      status: inserted ? 'created' : 'exists',
      message: inserted
        ? `snapshot ${bucket} written for ${vault}`
        : `snapshot ${bucket} already exists for ${vault} — skipped`,
      timestamp: bucket,
      data: row,
    }
  } catch (err) {
    return {
      vault,
      status: 'error',
      message: err instanceof Error ? err.message : String(err),
      timestamp: bucket,
    }
  }
}

/**
 * Snapshot every vault the indexer knows about (one row per VaultFactory child).
 * Used by the periodic boot/interval job, which has no single "canonical" vault
 * in v2. Returns one result per vault; an empty array if no vaults are indexed
 * yet (fresh deployment before the first VaultDeployed is processed).
 */
export async function takeAllSnapshots(
  baseOpts: Omit<RunOptions, 'vault'>,
): Promise<SnapshotResult[]> {
  const vaults = await db.select({ address: schema.vault.address }).from(schema.vault)
  const results: SnapshotResult[] = []
  for (const v of vaults) {
    results.push(await takeSnapshot({ ...baseOpts, vault: v.address }))
  }
  return results
}
